use serde::Deserialize;
use serde_json::Value;
use serde_json::json;
use std::collections::HashMap;
use std::thread;

pub const ANALYSIS_CACHE_VERSION: u32 = 2;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisSeriesRequest {
    pub id: String,
    #[serde(default)]
    pub x: Vec<f64>,
    #[serde(default)]
    pub group_index: Option<usize>,
    pub y: Vec<f64>,
}

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisSourceFile {
    pub curve_type: Option<String>,
    pub supports_ss: Option<bool>,
    pub x_axis_role: Option<String>,
    pub x_label: Option<String>,
}

#[derive(Clone)]
struct Point {
    x: f64,
    y: f64,
}

struct LogSegment {
    x: Vec<f64>,
    y: Vec<f64>,
}

struct IndexedSegment {
    branch: &'static str,
    indices: Vec<usize>,
}

#[derive(Clone)]
struct FiniteCurrentPoint {
    abs_i: f64,
    x: f64,
}

struct AnalysisSeriesView<'a> {
    id: &'a str,
    x: &'a [f64],
    y: &'a [f64],
}

#[derive(Clone)]
struct CurrentWindow {
    current: f64,
    key: &'static str,
    label: String,
    point_count: usize,
    target_x: Option<f64>,
    x: f64,
    x1: f64,
    x2: f64,
}

#[derive(Clone)]
struct LinearFit {
    a: f64,
    b: f64,
    r2: f64,
    rmse: f64,
    n: usize,
    y_min: f64,
    decade_span: f64,
}

#[derive(Clone)]
struct Candidate {
    fit: LinearFit,
    x1: f64,
    x2: f64,
    y_floor: f64,
    floor_margin_dec: Option<f64>,
    stab: Option<f64>,
    score: f64,
    floor_margin_dec_used: f64,
    min_span: f64,
    min_points: usize,
    r2_min: f64,
    stab_max: f64,
}

struct SearchResult {
    max_above_count: usize,
    best_strict: Option<Candidate>,
    best_any: Option<Candidate>,
}

#[derive(Default, Clone)]
struct PrefixSums {
    x: Vec<f64>,
    y: Vec<f64>,
    xx: Vec<f64>,
    xy: Vec<f64>,
    yy: Vec<f64>,
}

const FLOOR_QUANTILE: f64 = 0.1;
const FLOOR_TRY: [f64; 2] = [1.0, 0.7];
const WINDOW_POINTS: usize = 12;
const STRICT_R2: f64 = 0.995;
const STRICT_SPAN: f64 = 1.0;
const STRICT_N: usize = 12;
const STRICT_STAB: f64 = 0.1;
const SUGGESTION_R2: f64 = 0.98;
const SUGGESTION_SPAN: f64 = 0.7;
const SUGGESTION_N: usize = 8;
const SUGGESTION_STAB: f64 = 0.15;
const SUGGESTION_FLOOR: f64 = 0.7;

fn median(values: &[f64]) -> Option<f64> {
    let mut list = values
        .iter()
        .copied()
        .filter(|value| value.is_finite())
        .collect::<Vec<_>>();
    if list.is_empty() {
        return None;
    }
    list.sort_by(|a, b| a.total_cmp(b));
    let mid = list.len() / 2;
    if list.len() % 2 == 0 {
        Some((list[mid - 1] + list[mid]) / 2.0)
    } else {
        Some(list[mid])
    }
}

fn mad(values: &[f64], med: f64) -> Option<f64> {
    if !med.is_finite() {
        return None;
    }
    let deviations = values
        .iter()
        .copied()
        .filter(|value| value.is_finite())
        .map(|value| (value - med).abs())
        .collect::<Vec<_>>();
    median(&deviations)
}

fn detect_bidirectional_split_index(xs: &[f64]) -> Option<usize> {
    if xs.len() < 5 {
        return None;
    }
    // Split once at the sweep turnaround so later calculations stay branch-local.
    let mut first_dir = 0i32;
    for index in 1..xs.len() {
        let prev = xs[index - 1];
        let curr = xs[index];
        if !prev.is_finite() || !curr.is_finite() {
            continue;
        }
        let dx = curr - prev;
        if dx == 0.0 {
            continue;
        }
        first_dir = if dx > 0.0 { 1 } else { -1 };
        break;
    }
    if first_dir == 0 {
        return None;
    }
    let mut has_pos = false;
    let mut has_neg = false;
    for index in 1..xs.len() {
        let dx = xs[index] - xs[index - 1];
        if dx > 0.0 {
            has_pos = true;
        }
        if dx < 0.0 {
            has_neg = true;
        }
    }
    if !(has_pos && has_neg) {
        return None;
    }
    if first_dir > 0 {
        let mut idx_max = 0usize;
        let mut max = xs[0];
        for (index, value) in xs.iter().copied().enumerate().skip(1) {
            if !max.is_finite() || value > max {
                max = value;
                idx_max = index;
            }
        }
        if idx_max <= 1 || idx_max >= xs.len().saturating_sub(2) {
            None
        } else {
            Some(idx_max)
        }
    } else {
        let mut idx_min = 0usize;
        let mut min = xs[0];
        for (index, value) in xs.iter().copied().enumerate().skip(1) {
            if !min.is_finite() || value < min {
                min = value;
                idx_min = index;
            }
        }
        if idx_min <= 1 || idx_min >= xs.len().saturating_sub(2) {
            None
        } else {
            Some(idx_min)
        }
    }
}

fn split_bidirectional_points(points: &[Point]) -> Vec<Vec<Point>> {
    if points.len() < 2 {
        return if points.is_empty() {
            Vec::new()
        } else {
            vec![points.to_vec()]
        };
    }
    let xs = points.iter().map(|point| point.x).collect::<Vec<_>>();
    let Some(split_index) = detect_bidirectional_split_index(&xs) else {
        return vec![points.to_vec()];
    };
    vec![
        points[..=split_index].to_vec(),
        points[split_index..].to_vec(),
    ]
    .into_iter()
    .filter(|segment| !segment.is_empty())
    .collect()
}

fn split_bidirectional_indices(x: &[f64]) -> Vec<IndexedSegment> {
    if x.len() < 2 {
        return if x.is_empty() {
            Vec::new()
        } else {
            vec![IndexedSegment {
                branch: "full",
                indices: vec![0usize],
            }]
        };
    }
    let Some(split_index) = detect_bidirectional_split_index(x) else {
        return vec![IndexedSegment {
            branch: "full",
            indices: (0..x.len()).collect(),
        }];
    };
    let mut first_dir = 0i32;
    for index in 1..x.len() {
        if !x[index - 1].is_finite() || !x[index].is_finite() {
            continue;
        }
        let dx = x[index] - x[index - 1];
        if dx == 0.0 {
            continue;
        }
        first_dir = if dx > 0.0 { 1 } else { -1 };
        break;
    }
    let first_branch = if first_dir >= 0 { "forward" } else { "reverse" };
    let second_branch = if first_branch == "forward" {
        "reverse"
    } else {
        "forward"
    };
    vec![
        IndexedSegment {
            branch: first_branch,
            indices: (0..=split_index).collect(),
        },
        IndexedSegment {
            branch: second_branch,
            indices: (split_index..x.len()).collect(),
        },
    ]
}

fn point_json(x: f64, y: Option<f64>) -> Value {
    let y_value = y.filter(|value| value.is_finite());
    let y_abs = y_value.map(f64::abs);
    json!({
        "x": x,
        "y": y_value,
        "yPositive": y_value.filter(|value| *value > 0.0),
        "yAbsPositive": y_abs.filter(|value| *value > 0.0),
    })
}

fn compute_central_derivative_segment(x: &[f64], y: &[f64], indices: &[usize]) -> Vec<Value> {
    if indices.len() < 2 {
        return Vec::new();
    }
    let mut out = Vec::<Value>::with_capacity(indices.len());
    for position in 0..indices.len() {
        let index = indices[position];
        let xv = x[index];
        let yv = y[index];
        if !xv.is_finite() || !yv.is_finite() {
            out.push(point_json(xv, None));
            continue;
        }
        let prev = if position > 0 {
            Some(indices[position - 1])
        } else {
            None
        };
        let next = if position + 1 < indices.len() {
            Some(indices[position + 1])
        } else {
            None
        };
        let derivative = if let (Some(prev), Some(next)) = (prev, next) {
            let dx = x[next] - x[prev];
            if dx.is_finite() && dx != 0.0 {
                Some((y[next] - y[prev]) / dx)
            } else {
                None
            }
        } else if let Some(next) = next {
            let dx = x[next] - xv;
            if dx.is_finite() && dx != 0.0 {
                Some((y[next] - yv) / dx)
            } else {
                None
            }
        } else if let Some(prev) = prev {
            let dx = xv - x[prev];
            if dx.is_finite() && dx != 0.0 {
                Some((yv - y[prev]) / dx)
            } else {
                None
            }
        } else {
            None
        };
        out.push(point_json(xv, derivative));
    }
    out
}

pub(crate) fn compute_central_derivative(x: &[f64], y: &[f64]) -> Vec<Value> {
    let n = x.len().min(y.len());
    if n < 2 {
        return Vec::new();
    }
    let x = &x[..n];
    let y = &y[..n];
    let segments = split_bidirectional_indices(x);
    if segments.len() == 1 {
        return compute_central_derivative_segment(x, y, &segments[0].indices);
    }
    let mut out = Vec::<Value>::new();
    for (index, segment) in segments.iter().enumerate() {
        let computed = compute_central_derivative_segment(x, y, &segment.indices);
        // Both branches include the turnaround sample; skip it on the second branch.
        if index == 0 {
            out.extend(computed);
        } else {
            out.extend(computed.into_iter().skip(1));
        }
    }
    out
}

fn compute_subthreshold_swing_segment(x: &[f64], y: &[f64], indices: &[usize]) -> Vec<Value> {
    if indices.len() < 3 {
        return Vec::new();
    }
    let mut log10_abs_y = Vec::<Option<f64>>::with_capacity(indices.len());
    for index in indices {
        let yv = y[*index];
        let abs = yv.abs();
        log10_abs_y.push(if yv.is_finite() && abs > 0.0 {
            Some(abs.log10())
        } else {
            None
        });
    }
    let mut out = Vec::<Value>::with_capacity(indices.len());
    for position in 0..indices.len() {
        let index = indices[position];
        let xv = x[index];
        if !xv.is_finite() || position == 0 || position + 1 >= indices.len() {
            out.push(point_json(xv, None));
            continue;
        }
        let prev_log = log10_abs_y[position - 1];
        let next_log = log10_abs_y[position + 1];
        let Some(prev_log) = prev_log else {
            out.push(point_json(xv, None));
            continue;
        };
        let Some(next_log) = next_log else {
            out.push(point_json(xv, None));
            continue;
        };
        let prev = indices[position - 1];
        let next = indices[position + 1];
        let dx = x[next] - x[prev];
        if !dx.is_finite() || dx == 0.0 {
            out.push(point_json(xv, None));
            continue;
        }
        let slope = (next_log - prev_log) / dx;
        let ss = if slope.is_finite() && slope != 0.0 {
            Some(1000.0 / slope.abs())
        } else {
            None
        };
        out.push(point_json(xv, ss));
    }
    out
}

fn compute_subthreshold_swing(x: &[f64], y: &[f64]) -> Vec<Value> {
    let n = x.len().min(y.len());
    if n < 3 {
        return Vec::new();
    }
    let x = &x[..n];
    let y = &y[..n];
    let segments = split_bidirectional_indices(x);
    if segments.len() == 1 {
        return compute_subthreshold_swing_segment(x, y, &segments[0].indices);
    }
    let mut out = Vec::<Value>::new();
    for (index, segment) in segments.iter().enumerate() {
        let computed = compute_subthreshold_swing_segment(x, y, &segment.indices);
        // Both branches include the turnaround sample; skip it on the second branch.
        if index == 0 {
            out.extend(computed);
        } else {
            out.extend(computed.into_iter().skip(1));
        }
    }
    out
}

fn normalize_curve_type(value: Option<&String>) -> String {
    value
        .map(|value| value.trim().to_ascii_lowercase())
        .unwrap_or_default()
}

fn is_non_iv_special_curve_type(curve_type: &str) -> bool {
    matches!(curve_type, "pv" | "cv" | "cf")
}

pub(crate) fn is_transfer_like_source_file(source_file: Option<&AnalysisSourceFile>) -> bool {
    let Some(source_file) = source_file else {
        return false;
    };
    let curve_type = normalize_curve_type(source_file.curve_type.as_ref());
    if is_non_iv_special_curve_type(&curve_type) {
        return false;
    }
    if source_file.supports_ss == Some(true) {
        return true;
    }
    if source_file.supports_ss == Some(false) {
        return false;
    }
    let x_axis_role = source_file
        .x_axis_role
        .as_ref()
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default();
    if !x_axis_role.is_empty() {
        return x_axis_role == "vg";
    }
    if !curve_type.is_empty() {
        return curve_type.contains("vg") || curve_type.contains("transfer");
    }
    source_file
        .x_label
        .as_ref()
        .map(|value| value.to_ascii_lowercase().contains("vg"))
        .unwrap_or(false)
}

fn empty_base_current_metrics() -> Value {
    json!({
        "candidateWindows": Vec::<Value>::new(),
        "ioff": Value::Null,
        "ioffWindow": Value::Null,
        "ion": Value::Null,
        "ionIoff": Value::Null,
        "ionWindow": Value::Null,
        "method": "unavailable",
        "xAtIoff": Value::Null,
        "xAtIon": Value::Null,
    })
}

fn resolve_current_window_point_count(point_count: usize) -> usize {
    if point_count == 0 {
        return 1;
    }
    // Use a small, bounded window so the median still tracks local leakage/current.
    let max_window_points = 1usize.max(7usize.min(point_count / 3));
    let min_window_points = 3usize.min(max_window_points);
    let preferred_window_points = ((point_count as f64) * 0.1).round() as usize;
    preferred_window_points
        .max(min_window_points)
        .clamp(1, max_window_points)
}

fn build_current_window(
    key: &'static str,
    label: String,
    points: &[FiniteCurrentPoint],
    target_x: Option<f64>,
) -> Option<CurrentWindow> {
    if points.is_empty() {
        return None;
    }
    let abs_values = points.iter().map(|point| point.abs_i).collect::<Vec<_>>();
    let x_values = points.iter().map(|point| point.x).collect::<Vec<_>>();
    let current = median(&abs_values)?;
    let x_median = median(&x_values)?;
    let x1 = x_values.iter().copied().fold(f64::INFINITY, f64::min);
    let x2 = x_values.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    Some(CurrentWindow {
        current,
        key,
        label,
        point_count: x_values.len(),
        target_x: target_x.filter(|value| value.is_finite()),
        x: target_x
            .filter(|value| value.is_finite())
            .unwrap_or(x_median),
        x1,
        x2,
    })
}

fn take_nearest_window(
    key: &'static str,
    label: String,
    point_count: usize,
    points: &[FiniteCurrentPoint],
    target_x: f64,
) -> Option<CurrentWindow> {
    let mut window_points = points.to_vec();
    window_points.sort_by(|a, b| {
        let distance_delta = (a.x - target_x).abs().total_cmp(&(b.x - target_x).abs());
        if distance_delta != std::cmp::Ordering::Equal {
            return distance_delta;
        }
        a.x.total_cmp(&b.x)
    });
    window_points.truncate(point_count);
    build_current_window(key, label, &window_points, Some(target_x))
}

fn pick_extreme_current_window<'a>(
    candidates: &'a [CurrentWindow],
    kind: &str,
) -> Option<&'a CurrentWindow> {
    let mut iter = candidates.iter();
    let mut best = iter.next()?;
    for candidate in iter {
        if kind == "max" {
            if candidate.current > best.current {
                best = candidate;
            }
        } else if candidate.current < best.current {
            best = candidate;
        }
    }
    Some(best)
}

fn build_sliding_extreme_current_window(
    key: &'static str,
    kind: &str,
    label: String,
    points: &[FiniteCurrentPoint],
    window_point_count: usize,
) -> Option<CurrentWindow> {
    if points.is_empty() {
        return None;
    }

    let resolved_point_count = window_point_count.clamp(1, points.len());
    let mut windows = Vec::<CurrentWindow>::new();
    for index in 0..=points.len().saturating_sub(resolved_point_count) {
        if let Some(window) = build_current_window(
            key,
            label.clone(),
            &points[index..index + resolved_point_count],
            None,
        ) {
            windows.push(window);
        }
    }

    pick_extreme_current_window(&windows, kind).cloned()
}

fn current_window_json(window: &CurrentWindow) -> Value {
    json!({
        "current": window.current,
        "key": window.key,
        "label": window.label,
        "pointCount": window.point_count,
        "targetX": window.target_x,
        "x": window.x,
        "x1": window.x1,
        "x2": window.x2,
    })
}

fn build_auto_candidate_windows(
    points: &[FiniteCurrentPoint],
    branch: &'static str,
) -> Vec<CurrentWindow> {
    let window_point_count = resolve_current_window_point_count(points.len());
    let suffix = if branch == "forward" || branch == "reverse" {
        format!(" ({})", branch)
    } else {
        String::new()
    };
    let mut out = Vec::<CurrentWindow>::new();
    if let Some(window) = build_current_window(
        "lowEnd",
        format!("low-end{}", suffix),
        &points[..window_point_count.min(points.len())],
        None,
    ) {
        out.push(window);
    }
    if let Some(window) = build_current_window(
        "highEnd",
        format!("high-end{}", suffix),
        &points[points.len().saturating_sub(window_point_count)..],
        None,
    ) {
        out.push(window);
    }
    let min_x = points.first().map(|point| point.x);
    let max_x = points.last().map(|point| point.x);
    if min_x.map(|value| value <= 0.0).unwrap_or(false)
        && max_x.map(|value| value >= 0.0).unwrap_or(false)
    {
        if let Some(window) = take_nearest_window(
            "zeroBias",
            format!("near 0{}", suffix),
            window_point_count,
            points,
            0.0,
        ) {
            out.push(window);
        }
    }
    if let Some(window) = build_sliding_extreme_current_window(
        "minCurrent",
        "min",
        format!("min-current{}", suffix),
        points,
        window_point_count,
    ) {
        out.push(window);
    }
    // Keep both endpoint windows and sliding extrema; some curves bury Ioff away
    // from the endpoints even when the sweep order is clean.
    if let Some(window) = build_sliding_extreme_current_window(
        "maxCurrent",
        "max",
        format!("max-current{}", suffix),
        points,
        window_point_count,
    ) {
        out.push(window);
    }
    out
}

pub(crate) fn compute_base_current_metrics(
    x: &[f64],
    y: &[f64],
    source_file: Option<&AnalysisSourceFile>,
) -> Value {
    if !is_transfer_like_source_file(source_file) {
        return empty_base_current_metrics();
    }
    let n = x.len().min(y.len());
    if n == 0 {
        return empty_base_current_metrics();
    }
    let x = &x[..n];
    let y = &y[..n];
    let mut candidate_windows = Vec::<CurrentWindow>::new();
    for segment in split_bidirectional_indices(x) {
        let mut points = segment
            .indices
            .iter()
            .filter_map(|index| {
                let xv = x[*index];
                let yv = y[*index];
                if xv.is_finite() && yv.is_finite() {
                    Some(FiniteCurrentPoint {
                        abs_i: yv.abs(),
                        x: xv,
                    })
                } else {
                    None
                }
            })
            .collect::<Vec<_>>();
        if points.is_empty() {
            continue;
        }
        points.sort_by(|a, b| a.x.total_cmp(&b.x));
        candidate_windows.extend(build_auto_candidate_windows(&points, segment.branch));
    }
    if candidate_windows.is_empty() {
        return empty_base_current_metrics();
    }
    let ion_window = pick_extreme_current_window(&candidate_windows, "max");
    let ioff_window = pick_extreme_current_window(&candidate_windows, "min");
    let ion = ion_window.map(|window| window.current);
    let ioff = ioff_window.map(|window| window.current);
    let ion_ioff = match (ion, ioff) {
        (Some(ion), Some(ioff)) if ioff.is_finite() && ioff != 0.0 => Some(ion / ioff),
        _ => None,
    };
    json!({
        "candidateWindows": candidate_windows.iter().map(current_window_json).collect::<Vec<_>>(),
        "ioff": ioff,
        "ioffWindow": ioff_window.map(current_window_json),
        "ion": ion,
        "ionIoff": ion_ioff,
        "ionWindow": ion_window.map(current_window_json),
        "method": "auto",
        "xAtIoff": ioff_window.map(|window| window.x),
        "xAtIon": ion_window.map(|window| window.x),
    })
}

fn sanitize_log_points(x_raw: &[f64], y_raw: &[f64]) -> Result<Vec<LogSegment>, &'static str> {
    let points = x_raw
        .iter()
        .copied()
        .zip(y_raw.iter().copied())
        .filter(|(x, y)| x.is_finite() && y.is_finite() && *y != 0.0)
        .map(|(x, y)| Point { x, y })
        .collect::<Vec<_>>();
    if points.len() < 3 {
        return Err("common.not_enough_points");
    }

    let to_segment = |list: Vec<Point>| {
        let mut sorted = list;
        sorted.sort_by(|a, b| a.x.total_cmp(&b.x));
        let x = sorted.iter().map(|point| point.x).collect::<Vec<_>>();
        let y = sorted
            .iter()
            .map(|point| point.y.abs().log10())
            .collect::<Vec<_>>();
        LogSegment { x, y }
    };

    let raw_segments = split_bidirectional_points(&points);
    if raw_segments.len() <= 1 {
        return Ok(vec![to_segment(points)]);
    }

    let segments = raw_segments
        .into_iter()
        .filter(|segment| segment.len() >= 3)
        .map(to_segment)
        .collect::<Vec<_>>();
    if segments.is_empty() {
        Err("common.sweep_split_no_valid")
    } else {
        Ok(segments)
    }
}

fn estimate_log_current_floor(values: &[f64]) -> Option<f64> {
    let mut valid = values
        .iter()
        .copied()
        .filter(|value| value.is_finite())
        .collect::<Vec<_>>();
    if valid.len() < 3 {
        return None;
    }
    valid.sort_by(|a, b| a.total_cmp(b));
    let q = FLOOR_QUANTILE.clamp(0.01, 0.5);
    let n_floor = 3usize.max((valid.len() as f64 * q).ceil() as usize);
    // Treat the lower tail as background/leakage so SS fitting starts above noise.
    median(&valid[..n_floor.min(valid.len())])
}

fn build_candidate_window_sizes(seg_len: usize, min_points: usize, preferred: usize) -> Vec<usize> {
    let min_len = 3usize.max(min_points);
    if seg_len < min_len {
        return Vec::new();
    }
    let preferred = min_len.max(preferred);
    let mut out = Vec::<usize>::new();
    let push = |out: &mut Vec<usize>, value: usize| {
        if value >= min_len && value <= seg_len && !out.contains(&value) {
            out.push(value);
        }
    };
    let dense_upper = seg_len.min(preferred.max(min_len + 6));
    for value in min_len..=dense_upper {
        push(&mut out, value);
    }
    let mut probe = dense_upper;
    while probe < seg_len {
        // Dense around the preferred span, then progressively widen the search.
        let next = seg_len.min((probe as f64 * 1.35).round() as usize);
        if next <= probe {
            break;
        }
        push(&mut out, next);
        probe = next;
    }
    push(
        &mut out,
        ((dense_upper + seg_len) as f64 * 0.5).round() as usize,
    );
    push(
        &mut out,
        ((dense_upper + seg_len * 2) as f64 / 3.0).round() as usize,
    );
    push(&mut out, seg_len);
    out.sort_unstable();
    out
}

fn build_prefix_sums(x: &[f64], y: &[f64]) -> PrefixSums {
    let mut prefix = PrefixSums {
        x: vec![0.0; x.len() + 1],
        y: vec![0.0; y.len() + 1],
        xx: vec![0.0; x.len() + 1],
        xy: vec![0.0; x.len() + 1],
        yy: vec![0.0; x.len() + 1],
    };
    for index in 0..x.len() {
        prefix.x[index + 1] = prefix.x[index] + x[index];
        prefix.y[index + 1] = prefix.y[index] + y[index];
        prefix.xx[index + 1] = prefix.xx[index] + x[index] * x[index];
        prefix.xy[index + 1] = prefix.xy[index] + x[index] * y[index];
        prefix.yy[index + 1] = prefix.yy[index] + y[index] * y[index];
    }
    prefix
}

fn range_sum(values: &[f64], start: usize, end: usize) -> f64 {
    values[end + 1] - values[start]
}

fn compute_linear_fit(
    x: &[f64],
    y: &[f64],
    prefix: &PrefixSums,
    l: usize,
    r: usize,
) -> Option<LinearFit> {
    let start = l.min(r).min(x.len().saturating_sub(1));
    let end = l.max(r).min(x.len().saturating_sub(1));
    if end <= start {
        return None;
    }
    let count = end - start + 1;
    if count < 2 {
        return None;
    }
    let sum_x = range_sum(&prefix.x, start, end);
    let sum_y = range_sum(&prefix.y, start, end);
    let sum_xx = range_sum(&prefix.xx, start, end);
    let sum_xy = range_sum(&prefix.xy, start, end);
    let sum_yy = range_sum(&prefix.yy, start, end);
    let count_f = count as f64;
    let mean_x = sum_x / count_f;
    let mean_y = sum_y / count_f;
    let sxx = sum_xx - count_f * mean_x * mean_x;
    if !sxx.is_finite() || sxx == 0.0 {
        return None;
    }
    let sxy = sum_xy - count_f * mean_x * mean_y;
    let syy = sum_yy - count_f * mean_y * mean_y;
    let a = sxy / sxx;
    let b = mean_y - a * mean_x;
    let mut ss_res = 0.0;
    let mut y_min = f64::INFINITY;
    let mut y_max = f64::NEG_INFINITY;
    for index in start..=end {
        let y_hat = a * x[index] + b;
        let error = y[index] - y_hat;
        ss_res += error * error;
        y_min = y_min.min(y[index]);
        y_max = y_max.max(y[index]);
    }
    let r2 = if syy > 0.0 { 1.0 - ss_res / syy } else { 1.0 };
    Some(LinearFit {
        a,
        b,
        r2,
        rmse: (ss_res / count_f.max(1.0)).sqrt(),
        n: count,
        y_min,
        decade_span: y_max - y_min,
    })
}

fn compute_slope_stability(x: &[f64], y: &[f64], l: usize, r: usize) -> Option<f64> {
    let start = l.min(r).min(x.len().saturating_sub(1));
    let end = l.max(r).min(x.len().saturating_sub(1));
    if end < start + 2 {
        return None;
    }
    let mut slopes = Vec::<f64>::new();
    for index in start + 1..=end - 1 {
        let dx = x[index + 1] - x[index - 1];
        if !dx.is_finite() || dx == 0.0 {
            continue;
        }
        let slope = (y[index + 1] - y[index - 1]) / dx;
        if slope.is_finite() && slope != 0.0 {
            slopes.push(slope.abs());
        }
    }
    if slopes.len() < 3 {
        return None;
    }
    let m = median(&slopes)?;
    if !m.is_finite() || m <= 0.0 {
        return None;
    }
    let mdev = mad(&slopes, m)?;
    // A normalized MAD catches local jaggedness that a plain R2 score can miss.
    if mdev.is_finite() {
        Some(mdev / m)
    } else {
        None
    }
}

fn split_into_consecutive_segments(indices: &[usize]) -> Vec<Vec<usize>> {
    if indices.is_empty() {
        return Vec::new();
    }
    let mut segments = Vec::<Vec<usize>>::new();
    let mut start = 0usize;
    for index in 1..indices.len() {
        if indices[index] != indices[index - 1] + 1 {
            segments.push(indices[start..index].to_vec());
            start = index;
        }
    }
    segments.push(indices[start..].to_vec());
    segments
}

fn compute_floor_margin_dec(fit: &LinearFit, y_floor: f64) -> Option<f64> {
    if y_floor.is_finite() && fit.y_min.is_finite() {
        Some(fit.y_min - y_floor)
    } else {
        None
    }
}

fn select_best_by_score(
    candidates: impl IntoIterator<Item = Option<Candidate>>,
) -> Option<Candidate> {
    let mut best: Option<Candidate> = None;
    for candidate in candidates.into_iter().flatten() {
        let replace = match best.as_ref() {
            None => true,
            Some(current) => {
                candidate.score > current.score
                    || (candidate.score == current.score
                        && (candidate.fit.decade_span > current.fit.decade_span
                            || (candidate.fit.decade_span == current.fit.decade_span
                                && (candidate.fit.rmse < current.fit.rmse
                                    || (candidate.fit.rmse == current.fit.rmse
                                        && (candidate.fit.n > current.fit.n
                                            || (candidate.fit.n == current.fit.n
                                                && candidate.x1 < current.x1)))))))
            }
        };
        if replace {
            best = Some(candidate);
        }
    }
    best
}

fn run_auto_search(segment: &LogSegment) -> Option<SearchResult> {
    let y_floor = estimate_log_current_floor(&segment.y)?;
    let prefix = build_prefix_sums(&segment.x, &segment.y);
    let mut fit_cache = HashMap::<(usize, usize), Option<LinearFit>>::new();
    let mut stab_cache = HashMap::<(usize, usize), Option<f64>>::new();
    let mut best_any: Option<Candidate> = None;
    let mut best_strict: Option<Candidate> = None;
    let mut max_above_count = 0usize;

    // Try the strict profile first, then a looser suggestion profile for borderline curves.
    for floor_margin_dec in FLOOR_TRY {
        let above = segment
            .y
            .iter()
            .enumerate()
            .filter_map(|(index, y)| {
                if y.is_finite() && *y >= y_floor + floor_margin_dec {
                    Some(index)
                } else {
                    None
                }
            })
            .collect::<Vec<_>>();
        max_above_count = max_above_count.max(above.len());
        let segments = split_into_consecutive_segments(&above);
        let profile_count = if floor_margin_dec == 1.0 { 2 } else { 1 };
        for profile_index in 0..profile_count {
            let is_strict_profile = floor_margin_dec == 1.0 && profile_index == 0;
            let (min_span, min_points, r2_min, stab_max) = if is_strict_profile {
                (STRICT_SPAN, STRICT_N, STRICT_R2, STRICT_STAB)
            } else {
                (
                    SUGGESTION_SPAN,
                    SUGGESTION_N,
                    SUGGESTION_R2,
                    SUGGESTION_STAB,
                )
            };

            for seg in &segments {
                if seg.len() < min_points {
                    continue;
                }
                let mut windows =
                    build_candidate_window_sizes(seg.len(), min_points, WINDOW_POINTS);
                if !is_strict_profile {
                    for value in build_candidate_window_sizes(seg.len(), STRICT_N, WINDOW_POINTS) {
                        if !windows.contains(&value) {
                            windows.push(value);
                        }
                    }
                    windows.sort_unstable();
                }

                for window_size in windows {
                    if window_size < min_points {
                        continue;
                    }
                    for start in 0..=seg.len() - window_size {
                        let l = seg[start];
                        let r = seg[start + window_size - 1];
                        let cache_key = (l, r);
                        let fit = fit_cache
                            .entry(cache_key)
                            .or_insert_with(|| {
                                compute_linear_fit(&segment.x, &segment.y, &prefix, l, r)
                            })
                            .clone();
                        let Some(fit) = fit else {
                            continue;
                        };
                        if !fit.r2.is_finite() || fit.r2 < r2_min {
                            continue;
                        }
                        if !fit.decade_span.is_finite() || fit.decade_span < min_span {
                            continue;
                        }
                        let stab = if let Some(cached) = stab_cache.get(&cache_key) {
                            *cached
                        } else {
                            let computed = compute_slope_stability(&segment.x, &segment.y, l, r);
                            stab_cache.insert(cache_key, computed);
                            computed
                        };
                        if let Some(stab) = stab {
                            if stab.is_finite() && stab > stab_max {
                                continue;
                            }
                        }
                        let floor_margin = compute_floor_margin_dec(&fit, y_floor);
                        let score = fit.r2 + 0.25 * fit.decade_span.min(3.0)
                            - 0.5 * stab.unwrap_or(0.0)
                            + 0.05 * floor_margin.unwrap_or(0.0).max(0.0).min(3.0);
                        let candidate = Candidate {
                            fit,
                            x1: segment.x[l],
                            x2: segment.x[r],
                            y_floor,
                            floor_margin_dec: floor_margin,
                            stab: stab.filter(|value| value.is_finite()),
                            score,
                            floor_margin_dec_used: floor_margin_dec,
                            min_span,
                            min_points,
                            r2_min,
                            stab_max,
                        };

                        if is_strict_profile {
                            best_strict = select_best_by_score([best_strict, Some(candidate)]);
                        } else if floor_margin_dec >= SUGGESTION_FLOOR
                            && candidate.fit.n >= SUGGESTION_N
                        {
                            best_any = select_best_by_score([best_any, Some(candidate)]);
                        }
                    }
                }
            }
        }
    }

    Some(SearchResult {
        max_above_count,
        best_strict,
        best_any,
    })
}

fn profile_json(candidate: &Candidate) -> Value {
    json!({
        "floorMarginDec": candidate.floor_margin_dec_used,
        "minSpan": candidate.min_span,
        "minPoints": candidate.min_points,
        "r2Min": candidate.r2_min,
        "stabMax": candidate.stab_max,
    })
}

fn candidate_fit_json(candidate: &Candidate) -> Value {
    let ss = if candidate.fit.a.is_finite() && candidate.fit.a != 0.0 {
        Some(1000.0 / candidate.fit.a.abs())
    } else {
        None
    };
    json!({
        "ok": ss.is_some(),
        "ss": ss,
        "x1": candidate.x1,
        "x2": candidate.x2,
        "a": if candidate.fit.a.is_finite() { Some(candidate.fit.a) } else { None },
        "b": if candidate.fit.b.is_finite() { Some(candidate.fit.b) } else { None },
        "r2": candidate.fit.r2,
        "decadeSpan": candidate.fit.decade_span,
        "n": candidate.fit.n,
        "reason": if ss.is_some() { "ok" } else { "common.invalid_points" },
        "detail": {
            "yFloor": candidate.y_floor,
            "floorMarginDec": candidate.floor_margin_dec,
            "profileUsed": profile_json(candidate),
            "stab": candidate.stab,
            "score": candidate.score,
        },
    })
}

fn strict_failure_json(best_attempt: Option<&Candidate>, max_above_count: usize) -> Value {
    let reason = if max_above_count < 8 {
        "auto.no_points_above_floor"
    } else if best_attempt.is_some() {
        "auto.no_window_meets_strict"
    } else {
        "auto.no_window_meets_threshold"
    };
    if let Some(best) = best_attempt {
        json!({
            "ok": false,
            "reason": reason,
            "detail": {
                "bestAttempt": {
                    "x1": best.x1,
                    "x2": best.x2,
                    "r2": best.fit.r2,
                    "decadeSpan": best.fit.decade_span,
                    "n": best.fit.n,
                    "yFloor": best.y_floor,
                    "floorMarginDec": best.floor_margin_dec,
                    "stab": best.stab,
                    "profileUsed": profile_json(best),
                },
            },
        })
    } else {
        json!({
            "ok": false,
            "reason": reason,
            "detail": {},
        })
    }
}

fn suggested_failure_json(max_above_count: usize) -> Value {
    json!({
        "ok": false,
        "reason": if max_above_count < 8 {
            "auto.no_points_above_floor"
        } else {
            "auto.no_window_meets_threshold"
        },
    })
}

pub fn compute_subthreshold_swing_fit_auto(x: &[f64], y: &[f64]) -> Value {
    let segments = match sanitize_log_points(x, y) {
        Ok(segments) => segments,
        Err(reason) => {
            return json!({
                "strict": {
                    "ok": false,
                    "reason": reason,
                    "detail": {},
                },
                "suggested": {
                    "ok": false,
                    "reason": reason,
                },
            });
        }
    };
    let mut results = Vec::<SearchResult>::new();
    for segment in &segments {
        if let Some(result) = run_auto_search(segment) {
            results.push(result);
        }
    }

    let pick_strict = select_best_by_score(results.iter().map(|result| result.best_strict.clone()));
    let pick_suggested = select_best_by_score(results.iter().map(|result| result.best_any.clone()));
    let max_above_count = results
        .iter()
        .map(|result| result.max_above_count)
        .max()
        .unwrap_or(0);
    let strict = if let Some(candidate) = pick_strict.as_ref() {
        candidate_fit_json(candidate)
    } else {
        strict_failure_json(pick_suggested.as_ref(), max_above_count)
    };
    let suggested = if let Some(candidate) = pick_suggested.as_ref() {
        candidate_fit_json(candidate)
    } else {
        suggested_failure_json(max_above_count)
    };

    json!({
        "strict": strict,
        "suggested": suggested,
    })
}

fn resolve_analysis_series<'a>(
    item: &'a AnalysisSeriesRequest,
    x_groups: Option<&'a [Vec<f64>]>,
) -> Option<AnalysisSeriesView<'a>> {
    let x = if !item.x.is_empty() {
        item.x.as_slice()
    } else {
        let group_index = item.group_index?;
        x_groups?.get(group_index)?.as_slice()
    };
    if x.len().min(item.y.len()) < 3 {
        return None;
    }
    Some(AnalysisSeriesView {
        id: item.id.as_str(),
        x,
        y: item.y.as_slice(),
    })
}

fn analyze_one_series(
    item: AnalysisSeriesView<'_>,
    source_file: Option<&AnalysisSourceFile>,
) -> (String, Value) {
    let supports_ss = is_transfer_like_source_file(source_file);
    let mut result = serde_json::Map::<String, Value>::new();
    result.insert(
        "baseCurrent".to_string(),
        compute_base_current_metrics(&item.x, &item.y, source_file),
    );
    result.insert(
        "gm".to_string(),
        Value::Array(compute_central_derivative(&item.x, &item.y)),
    );
    if supports_ss {
        result.insert(
            "ss".to_string(),
            Value::Array(compute_subthreshold_swing(&item.x, &item.y)),
        );
        result.insert(
            "ssFitAuto".to_string(),
            compute_subthreshold_swing_fit_auto(&item.x, &item.y),
        );
    }
    (item.id.to_string(), Value::Object(result))
}

pub fn analyze_series_batch(
    series: &[AnalysisSeriesRequest],
    x_groups: Option<&[Vec<f64>]>,
    source_file: Option<&AnalysisSourceFile>,
) -> Value {
    let mut output = serde_json::Map::<String, Value>::new();
    if series.len() < 8 {
        for item in series {
            if let Some(view) = resolve_analysis_series(item, x_groups) {
                let (id, value) = analyze_one_series(view, source_file);
                output.insert(id, value);
            }
        }
        return Value::Object(output);
    }

    let available_threads = thread::available_parallelism()
        .map(|count| count.get())
        .unwrap_or(1)
        .clamp(1, 8);
    let worker_count = available_threads.min(series.len());
    let chunk_size = series.len().div_ceil(worker_count);

    let chunks = thread::scope(|scope| {
        let mut handles = Vec::new();
        for chunk in series.chunks(chunk_size) {
            handles.push(scope.spawn(move || {
                chunk
                    .iter()
                    .filter_map(|item| {
                        resolve_analysis_series(item, x_groups)
                            .map(|view| analyze_one_series(view, source_file))
                    })
                    .collect::<Vec<_>>()
            }));
        }
        handles
            .into_iter()
            .flat_map(|handle| handle.join().unwrap_or_default())
            .collect::<Vec<_>>()
    });

    for (id, value) in chunks {
        output.insert(id, value);
    }
    Value::Object(output)
}

pub fn analyze_series_batch_result(
    file_id: Option<&str>,
    series: &[AnalysisSeriesRequest],
    x_groups: Option<&[Vec<f64>]>,
    source_file: Option<&AnalysisSourceFile>,
) -> Value {
    json!({
        "fileId": file_id,
        "version": ANALYSIS_CACHE_VERSION,
        "series": analyze_series_batch(series, x_groups, source_file),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base_current_uses_sliding_minimum_for_valley_off_states() {
        let x = [-4.0, -3.0, -2.0, -1.0, 0.0, 1.0, 2.0, 3.0, 4.0];
        let y = [
            -1e-3, -8e-4, -1e-4, -1e-5, -2e-7, -2e-8, -3e-8, -2e-7, -1e-6,
        ];
        let source_file = AnalysisSourceFile {
            x_axis_role: Some("vg".to_string()),
            ..Default::default()
        };

        let metrics = compute_base_current_metrics(&x, &y, Some(&source_file));

        assert_eq!(metrics["method"], "auto");
        assert_eq!(metrics["ioffWindow"]["key"], "minCurrent");
        assert_eq!(metrics["xAtIoff"], 1.0);
        assert_eq!(metrics["ioff"], 3e-8);
        assert_eq!(metrics["ionWindow"]["key"], "lowEnd");
        assert_eq!(metrics["xAtIon"], -3.0);
    }

    #[test]
    fn analysis_batch_cache_is_versioned() {
        let series = vec![AnalysisSeriesRequest {
            id: "curve-1".to_string(),
            x: vec![0.0, 1.0, 2.0],
            group_index: None,
            y: vec![1e-12, 1e-9, 1e-6],
        }];
        let source_file = AnalysisSourceFile {
            x_axis_role: Some("vg".to_string()),
            ..Default::default()
        };

        let result = analyze_series_batch_result(Some("file-1"), &series, None, Some(&source_file));

        assert_eq!(result["version"], ANALYSIS_CACHE_VERSION);
        assert!(result["series"]["curve-1"]["baseCurrent"].is_object());
    }
}
