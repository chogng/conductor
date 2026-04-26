mod engine_analysis;
mod engine_cells;
mod engine_dataset;
mod engine_infer;
mod engine_legend;
mod engine_utils;

use calamine::{Reader, open_workbook_auto};
use engine_analysis::{AnalysisSeriesRequest, AnalysisSourceFile};
use engine_cells::EngineCellRequest;
use engine_dataset::{EngineDataset, is_excel_path, load_engine_dataset};
use engine_infer::{
    find_metadata_positive_integer, infer_auto_segmentation_from_x_values,
    infer_metadata_group_shape, parse_positive_integer_text,
};
use engine_legend::{LegendMode, resolve_legend_labels};
use engine_utils::*;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    collections::VecDeque,
    env, fs,
    io::{self, BufRead, Write},
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
    },
    thread,
    time::Instant,
};

const DEFAULT_ROOTS: [&str; 3] = [
    "C:/Users/lanxi/Desktop/ZC",
    "C:/Users/lanxi/Desktop/20251221device",
    "C:/Users/lanxi/Desktop/293K",
];

#[derive(Default, Clone)]
struct ConvertStats {
    cells: usize,
    convert_ms: f64,
    csv_bytes: usize,
    numeric_cells: usize,
    rows: usize,
    size_bytes: u64,
}

struct ConvertResult {
    assessment: Value,
    index: usize,
    output_path: Option<PathBuf>,
    path: PathBuf,
    stats: ConvertStats,
}

struct ConvertFailure {
    message: String,
    path: PathBuf,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EngineRequest {
    analysis_cache_path: Option<String>,
    cells: Option<Vec<EngineCellRequest>>,
    col_index: Option<usize>,
    config: Option<Value>,
    command: String,
    curve_filter_field: Option<String>,
    curve_filter_key: Option<String>,
    end_row: Option<usize>,
    file_id: Option<String>,
    file_name: Option<String>,
    id: u64,
    path: Option<String>,
    row_index: Option<usize>,
    seed_rows: Option<usize>,
    series: Option<Vec<AnalysisSeriesRequest>>,
    source_file: Option<AnalysisSourceFile>,
    start_row: Option<usize>,
    max_points: Option<usize>,
    x_groups: Option<Vec<Vec<f64>>>,
}

#[derive(Serialize)]
struct EngineError {
    message: String,
}

#[derive(Serialize)]
struct EngineResponse {
    id: u64,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<EngineError>,
}

fn row_trimmed(dataset: &EngineDataset, row_index: usize) -> Vec<String> {
    dataset
        .rows
        .get(row_index)
        .map(|row| row.iter().map(|value| clean_cell_text(value)).collect())
        .unwrap_or_default()
}

fn find_header_row_index(dataset: &EngineDataset) -> usize {
    for row_index in 0..dataset.rows.len() {
        let row = row_trimmed(dataset, row_index);
        if row.iter().any(|entry| entry == "CH1 Voltage")
            && row.iter().any(|entry| entry == "CH2 Voltage")
        {
            return row_index;
        }
    }

    for row_index in 0..dataset.rows.len() {
        let row = row_trimmed(dataset, row_index);
        if row.first().map(String::as_str) != Some("DataName") {
            continue;
        }
        if row.iter().skip(1).filter(|entry| !entry.is_empty()).count() >= 2 {
            return row_index;
        }
    }

    for row_index in 0..dataset.rows.len().saturating_sub(1) {
        let row = row_trimmed(dataset, row_index);
        if row.iter().filter(|entry| !entry.is_empty()).count() < 2 {
            continue;
        }
        let numeric_count = dataset
            .rows
            .get(row_index + 1)
            .map(|row| {
                row.iter()
                    .filter(|cell| parse_number_strict(Some(cell)).is_some())
                    .count()
            })
            .unwrap_or(0);
        if numeric_count >= 2 {
            return row_index;
        }
    }

    0
}

#[derive(Default)]
struct AutoMetadata {
    data_name_columns: Vec<String>,
    is_stripped_channel_sweep: bool,
    notes_text: String,
    setup_title: String,
    stripped_fixed_voltage_magnitude: Option<f64>,
    stripped_sweep_voltage_axis: Option<&'static str>,
    var1_name: String,
    var2_name: String,
    x_axis_data: String,
}

fn unwrap_brace_token(value: &str) -> String {
    let trimmed = clean_cell_text(value);
    if trimmed.starts_with('{') && trimmed.ends_with('}') && trimmed.len() > 2 {
        trimmed[1..trimmed.len() - 1].to_string()
    } else {
        trimmed
    }
}

fn first_non_empty(cells: &[String]) -> String {
    cells
        .iter()
        .map(|value| clean_cell_text(value))
        .find(|value| !value.is_empty())
        .unwrap_or_default()
}

fn parse_var_name_from_notes(notes: &str, var_tag: &str) -> String {
    let lower = notes.to_lowercase();
    let needle = format!("[{}]", var_tag.to_lowercase());
    let Some(start) = lower.find(&needle) else {
        return String::new();
    };
    let rest = &notes[start + needle.len()..];
    let end = rest
        .find('[')
        .or_else(|| rest.find('\t'))
        .unwrap_or(rest.len());
    let block = &rest[..end];
    let block_lower = block.to_lowercase();
    let Some(name_index) = block_lower.find("name=") else {
        return String::new();
    };
    let value = &block[name_index + 5..];
    value
        .split([',', '\t', ']'])
        .next()
        .map(clean_cell_text)
        .unwrap_or_default()
}

fn derive_var_name_from_channel_meta(
    channel_funcs: &[String],
    channel_vnames: &[String],
    var_token: &str,
) -> String {
    let token = var_token.to_ascii_uppercase();
    for (index, func) in channel_funcs.iter().enumerate() {
        if clean_cell_text(func).to_ascii_uppercase() == token {
            return channel_vnames
                .get(index)
                .map(|v| clean_cell_text(v))
                .unwrap_or_default();
        }
    }
    String::new()
}

fn numeric_span(values: &[f64]) -> Option<f64> {
    if values.is_empty() {
        return None;
    }
    let min = values.iter().copied().fold(f64::INFINITY, f64::min);
    let max = values.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    Some(max - min)
}

fn collect_column_numbers(
    dataset: &EngineDataset,
    data_start_row_index: usize,
    col_index: usize,
    limit: usize,
) -> Vec<f64> {
    let mut values = Vec::<f64>::new();
    let column = dataset.column_number_values_ref(col_index);
    for row_index in data_start_row_index..column.len() {
        if values.len() >= limit {
            break;
        }
        let Some(value) = column.get(row_index).copied().flatten() else {
            break;
        };
        values.push(value);
    }
    values
}

fn collect_stripped_sweep_metadata(
    dataset: &EngineDataset,
    header_row_index: usize,
) -> (Option<&'static str>, Option<f64>) {
    let headers = row_trimmed(dataset, header_row_index);
    let ch1_voltage_col = headers.iter().position(|entry| entry == "CH1 Voltage");
    let ch2_voltage_col = headers.iter().position(|entry| entry == "CH2 Voltage");
    let (Some(ch1_voltage_col), Some(ch2_voltage_col)) = (ch1_voltage_col, ch2_voltage_col) else {
        return (None, None);
    };
    let data_start = header_row_index + 1;
    let point_col = headers.iter().position(|entry| entry == "Point");
    let var2_col = headers.iter().position(|entry| entry == "VAR2");
    let first_group_len =
        detect_first_group_length(dataset, data_start, point_col, var2_col).unwrap_or(2048);
    let ch1_values = collect_column_numbers(dataset, data_start, ch1_voltage_col, first_group_len);
    let ch2_values = collect_column_numbers(dataset, data_start, ch2_voltage_col, first_group_len);
    let ch1_span = numeric_span(&ch1_values).unwrap_or(0.0).abs();
    let ch2_span = numeric_span(&ch2_values).unwrap_or(0.0).abs();
    let axis = if ch1_span >= ch2_span.max(1e-12) * 3.0 {
        Some("ch1")
    } else if ch2_span >= ch1_span.max(1e-12) * 3.0 {
        Some("ch2")
    } else {
        None
    };
    let fixed_values = match axis {
        Some("ch1") => &ch2_values,
        Some("ch2") => &ch1_values,
        _ => return (axis, None),
    };
    let fixed = fixed_values
        .iter()
        .copied()
        .find(|value| value.is_finite())
        .map(|value| value.abs());
    (axis, fixed)
}

fn extract_auto_metadata(dataset: &EngineDataset) -> AutoMetadata {
    let mut metadata = AutoMetadata::default();
    let mut channel_funcs = Vec::<String>::new();
    let mut channel_vnames = Vec::<String>::new();
    let mut stripped_header_row_index: Option<usize> = None;

    for (row_index, row_raw) in dataset.rows.iter().enumerate() {
        let row: Vec<String> = row_raw.iter().map(|value| clean_cell_text(value)).collect();
        if row.is_empty() {
            continue;
        }
        let first = row.first().map(String::as_str).unwrap_or("");
        let second = row.get(1).map(String::as_str).unwrap_or("");

        if metadata.setup_title.is_empty() && first == "SetupTitle" {
            metadata.setup_title = first_non_empty(row.get(1..).unwrap_or(&[]));
        }
        if metadata.setup_title.is_empty() && row_index == 0 {
            metadata.setup_title = unwrap_brace_token(first);
        }
        if metadata.x_axis_data.is_empty() && second == "Output.Graph.XAxis.Data" {
            metadata.x_axis_data = first_non_empty(row.get(2..).unwrap_or(&[]));
        }
        if channel_funcs.is_empty() && second == "Channel.Func" {
            channel_funcs = row
                .iter()
                .skip(2)
                .filter(|v| !v.is_empty())
                .cloned()
                .collect();
        }
        if channel_vnames.is_empty() && second == "Channel.VName" {
            channel_vnames = row
                .iter()
                .skip(2)
                .filter(|v| !v.is_empty())
                .cloned()
                .collect();
        }
        if metadata.data_name_columns.is_empty() && first == "DataName" {
            metadata.data_name_columns = row
                .iter()
                .skip(1)
                .filter(|v| !v.is_empty())
                .cloned()
                .collect();
        }
        if metadata.notes_text.is_empty() && second == "Analysis.Setup.Vector.Graph.Notes" {
            metadata.notes_text = row
                .iter()
                .skip(2)
                .filter(|v| !v.is_empty())
                .cloned()
                .collect::<Vec<_>>()
                .join(", ");
        }
        if !metadata.is_stripped_channel_sweep
            && first == "Repeat"
            && second == "VAR2"
            && row.iter().any(|entry| entry == "CH1 Voltage")
            && row.iter().any(|entry| entry == "CH2 Voltage")
        {
            metadata.is_stripped_channel_sweep = true;
            stripped_header_row_index = Some(row_index);
        }
    }

    if metadata.data_name_columns.is_empty() {
        for row_index in 0..dataset.rows.len().saturating_sub(1) {
            let row = row_trimmed(dataset, row_index);
            let headers = row
                .iter()
                .filter(|value| !value.is_empty())
                .cloned()
                .collect::<Vec<_>>();
            if headers.len() < 2 {
                continue;
            }
            if headers.iter().any(|entry| entry == "CH1 Voltage")
                && headers.iter().any(|entry| entry == "CH2 Voltage")
            {
                continue;
            }
            let has_device_header = headers.iter().any(|entry| {
                let normalized = entry.to_ascii_lowercase();
                detect_axis_role_text(entry).is_some()
                    || normalized.contains("current")
                    || normalized.contains("voltage")
                    || normalized.contains("gate")
                    || normalized.contains("drain")
                    || normalized.contains("id")
                    || normalized.contains("ig")
            });
            if !has_device_header {
                continue;
            }
            let numeric_count = dataset
                .rows
                .get(row_index + 1)
                .map(|row| {
                    row.iter()
                        .filter(|cell| parse_number_strict(Some(cell)).is_some())
                        .count()
                })
                .unwrap_or(0);
            if numeric_count >= 2 {
                metadata.data_name_columns = headers;
                break;
            }
        }
    }

    if !metadata.notes_text.is_empty() {
        metadata.var1_name = parse_var_name_from_notes(&metadata.notes_text, "VAR1");
        metadata.var2_name = parse_var_name_from_notes(&metadata.notes_text, "VAR2");
    }
    if metadata.var1_name.is_empty() {
        metadata.var1_name =
            derive_var_name_from_channel_meta(&channel_funcs, &channel_vnames, "VAR1");
    }
    if metadata.var2_name.is_empty() {
        metadata.var2_name =
            derive_var_name_from_channel_meta(&channel_funcs, &channel_vnames, "VAR2");
    }
    if let Some(header_row_index) = stripped_header_row_index {
        let (axis, fixed) = collect_stripped_sweep_metadata(dataset, header_row_index);
        metadata.stripped_sweep_voltage_axis = axis;
        metadata.stripped_fixed_voltage_magnitude = fixed;
    }
    metadata
}

fn detect_axis_role_text(value: &str) -> Option<&'static str> {
    let compact = normalize_header_compact(value);
    if compact.contains("vd") || compact.contains("drain") {
        return Some("vd");
    }
    if compact.contains("vg") || compact.contains("gate") || compact == "var1" {
        return Some("vg");
    }
    None
}

fn classify_auto_curve(
    file_name: &str,
    metadata: &AutoMetadata,
    headers: &[String],
) -> (String, Option<&'static str>, &'static str, String, bool) {
    let mut all_text = vec![
        file_name.to_string(),
        metadata.setup_title.clone(),
        metadata.x_axis_data.clone(),
    ];
    all_text.extend(metadata.data_name_columns.clone());
    all_text.extend(headers.iter().cloned());
    let compact_all: Vec<String> = all_text
        .iter()
        .map(|value| normalize_header_compact(value))
        .collect();
    let file_compact = normalize_header_compact(file_name);
    let has_fast_iv_or_ivt_hint = |value: &str| {
        let text = clean_cell_text(value).to_ascii_lowercase();
        normalize_header_compact(value).contains("fastiv")
            || text
                .split(|ch: char| !ch.is_ascii_alphanumeric())
                .any(|token| token == "ivt")
    };

    if file_compact.contains("pv")
        || has_fast_iv_or_ivt_hint(file_name)
        || compact_all
            .iter()
            .any(|value| value.contains("fastiv") || value == "ipt")
        || all_text.iter().any(|value| has_fast_iv_or_ivt_hint(value))
    {
        return (
            "pv".to_string(),
            None,
            "filename",
            "medium".to_string(),
            false,
        );
    }
    if file_compact.contains("cf")
        || file_compact.contains("freq")
        || compact_all
            .iter()
            .any(|value| value.contains("freq") || value.contains("frequency"))
    {
        return (
            "cf".to_string(),
            None,
            "filename",
            "medium".to_string(),
            false,
        );
    }
    if (file_compact.contains("cv") && !file_compact.contains("svc"))
        || compact_all
            .iter()
            .any(|value| value.contains("cp") || value.contains("cap") || value.contains("cv"))
    {
        return (
            "cv".to_string(),
            None,
            "filename",
            "medium".to_string(),
            false,
        );
    }

    let mut vg_score = 0i32;
    let mut vd_score = 0i32;
    for (value, weight) in [
        (metadata.x_axis_data.as_str(), 18),
        (metadata.var1_name.as_str(), 16),
        (
            metadata
                .data_name_columns
                .first()
                .map(String::as_str)
                .unwrap_or(""),
            14,
        ),
        (metadata.setup_title.as_str(), 6),
        (file_name, 2),
    ] {
        match detect_axis_role_text(value) {
            Some("vg") => vg_score += weight,
            Some("vd") => vd_score += weight,
            _ => {}
        }
    }
    if metadata.is_stripped_channel_sweep {
        if let (Some(axis), Some(fixed)) = (
            metadata.stripped_sweep_voltage_axis,
            metadata.stripped_fixed_voltage_magnitude,
        ) {
            if axis == "ch1" && fixed >= 12.0 {
                vd_score += 6;
            } else if axis == "ch2" && fixed >= 12.0 {
                vd_score += 6;
            }
        }
    }

    if vg_score == vd_score {
        return (
            "unknown".to_string(),
            None,
            "metadata",
            "low".to_string(),
            true,
        );
    }
    let role = if vg_score > vd_score { "vg" } else { "vd" };
    let score_gap = (vg_score - vd_score).abs();
    let confidence = if score_gap >= 10 {
        "high"
    } else if score_gap >= 6 {
        "medium"
    } else {
        "low"
    };
    let curve_type = if role == "vg" { "transfer" } else { "output" };
    (
        curve_type.to_string(),
        Some(role),
        "metadata",
        confidence.to_string(),
        confidence == "low",
    )
}

fn is_voltage_like_header(value: &str) -> bool {
    let compact = normalize_header_compact(value);
    compact == "v"
        || compact == "vp"
        || compact == "vpn"
        || compact == "vg"
        || compact == "vd"
        || compact.starts_with("vbias")
        || compact.contains("voltage")
}

fn is_frequency_like_header(value: &str) -> bool {
    let compact = normalize_header_compact(value);
    compact.contains("freq") || compact.contains("frequency") || compact.contains("hz")
}

fn is_capacitance_like_header(value: &str) -> bool {
    let compact = normalize_header_compact(value);
    compact == "cp"
        || compact == "cs"
        || compact.starts_with("cp")
        || compact.starts_with("cs")
        || compact.contains("cap")
}

fn is_current_like_header(value: &str) -> bool {
    let compact = normalize_header_compact(value);
    compact == "in"
        || compact == "ipt"
        || compact == "id"
        || compact == "ig"
        || compact.starts_with("id")
        || compact.starts_with("ig")
        || compact.contains("current")
        || compact.starts_with("in")
        || compact.starts_with("ipt")
}

fn current_header_looks_like_drain_current(value: &str) -> bool {
    let normalized = clean_cell_text(value).to_lowercase();
    let compact = normalize_header_compact(value);
    compact == "id"
        || compact.starts_with("id")
        || compact == "draincurrent"
        || compact == "totalcurrent"
        || compact == "draini"
        || normalized.contains("drain current")
        || (normalized.contains("drain") && normalized.contains("current"))
        || normalized.contains("totalcurrent")
}

fn current_header_looks_like_gate_current(value: &str) -> bool {
    let normalized = clean_cell_text(value).to_lowercase();
    let compact = normalize_header_compact(value);
    compact == "ig"
        || compact.starts_with("ig")
        || compact == "gatecurrent"
        || compact == "gatei"
        || normalized.contains("gate current")
        || (normalized.contains("gate") && normalized.contains("current"))
}

fn structured_axis_suffix(header: &str) -> (Option<&'static str>, String) {
    let trimmed = clean_cell_text(header);
    if trimmed.is_empty() {
        return (None, String::new());
    }
    let lower = trimmed.to_lowercase();
    let mut chars = lower.chars().collect::<Vec<_>>();
    let Some(last) = chars.pop() else {
        return (None, lower);
    };
    if last != 'x' && last != 'y' {
        return (None, lower);
    }
    while chars
        .last()
        .map(|ch| ch.is_whitespace() || "_-./()[]{}:=".contains(*ch))
        .unwrap_or(false)
    {
        chars.pop();
    }
    let stem: String = chars.into_iter().collect();
    if stem.is_empty() {
        return (None, lower);
    }
    (Some(if last == 'x' { "x" } else { "y" }), stem)
}

fn columns_share_equivalent_x(
    dataset: &EngineDataset,
    data_start_row_index: usize,
    left_col: usize,
    right_col: usize,
) -> bool {
    let left = collect_column_numbers(dataset, data_start_row_index, left_col, 512);
    let right = collect_column_numbers(dataset, data_start_row_index, right_col, 512);
    let compare_count = left.len().min(right.len());
    if compare_count < 2 {
        return false;
    }
    let left_span = numeric_span(&left).unwrap_or(0.0).abs();
    let right_span = numeric_span(&right).unwrap_or(0.0).abs();
    let tolerance = (left_span.max(right_span).max(1.0) * 1e-4).max(1e-9);
    (0..compare_count).all(|index| approx_equal(left[index], right[index], tolerance))
}

fn find_numeric_semantic_columns(
    dataset: &EngineDataset,
    headers: &[String],
    data_start_row_index: usize,
    predicate: fn(&str) -> bool,
) -> Vec<usize> {
    headers
        .iter()
        .enumerate()
        .filter(|(index, header)| {
            predicate(header) && column_has_numeric_rows(dataset, data_start_row_index, *index, 2)
        })
        .map(|(index, _)| index)
        .collect()
}

fn choose_best_semantic_pair(
    x_candidates: &[usize],
    y_candidates: &[usize],
) -> (Option<usize>, Option<usize>) {
    let mut best: Option<(usize, usize, usize)> = None;
    for &x_col in x_candidates {
        for &y_col in y_candidates {
            if y_col <= x_col {
                continue;
            }
            let gap = y_col - x_col;
            if best
                .map(|(best_gap, best_x, _)| gap < best_gap || (gap == best_gap && x_col > best_x))
                .unwrap_or(true)
            {
                best = Some((gap, x_col, y_col));
            }
        }
    }
    if let Some((_, x_col, y_col)) = best {
        (Some(x_col), Some(y_col))
    } else {
        (
            x_candidates
                .last()
                .copied()
                .or_else(|| x_candidates.first().copied()),
            y_candidates
                .last()
                .copied()
                .or_else(|| y_candidates.first().copied()),
        )
    }
}

fn detect_first_group_length(
    dataset: &EngineDataset,
    data_start_row_index: usize,
    point_col_index: Option<usize>,
    var2_col_index: Option<usize>,
) -> Option<usize> {
    if point_col_index.is_none() && var2_col_index.is_none() {
        return None;
    }
    let first_row = dataset.rows.get(data_start_row_index)?;
    let first_var2 = var2_col_index
        .and_then(|index| first_row.get(index))
        .map(|value| clean_cell_text(value))
        .unwrap_or_default();
    let first_point =
        point_col_index.and_then(|index| cell_number(dataset, data_start_row_index, index));
    let mut count = 0usize;
    let mut previous_point: Option<f64> = None;
    for row_index in data_start_row_index..dataset.rows.len() {
        let row = &dataset.rows[row_index];
        let current_var2 = var2_col_index
            .and_then(|index| row.get(index))
            .map(|value| clean_cell_text(value))
            .unwrap_or_default();
        let current_point =
            point_col_index.and_then(|index| cell_number(dataset, row_index, index));
        if count > 0 {
            if !first_var2.is_empty() && !current_var2.is_empty() && current_var2 != first_var2 {
                break;
            }
            if let (Some(first), Some(current)) = (first_point, current_point) {
                if current == first
                    || previous_point
                        .map(|previous| current < previous)
                        .unwrap_or(false)
                {
                    break;
                }
            }
        }
        count += 1;
        if current_point.is_some() {
            previous_point = current_point;
        }
    }
    if count >= 2 { Some(count) } else { None }
}

fn parse_voltage_like_value(raw: &str) -> Option<f64> {
    let text = clean_cell_text(raw).to_lowercase();
    if text.is_empty() {
        return None;
    }
    let mut number = String::new();
    let mut unit = String::new();
    let mut in_number = false;
    for ch in text.chars() {
        if ch.is_ascii_digit() || matches!(ch, '-' | '+' | '.' | 'e') {
            number.push(ch);
            in_number = true;
        } else if in_number {
            if ch.is_alphabetic() || ch == 'μ' || ch == '渭' {
                unit.push(ch);
            } else if !unit.is_empty() {
                break;
            }
        }
    }
    let value = number.parse::<f64>().ok()?;
    let factor = match unit.as_str() {
        "mv" => 1e-3,
        "uv" | "μv" | "渭v" => 1e-6,
        "kv" => 1e3,
        _ => 1.0,
    };
    Some(value * factor)
}

fn parse_var_sweep_from_notes(
    notes: &str,
    var_tag: &str,
) -> Option<(Option<usize>, Option<f64>, Option<f64>)> {
    let lower = notes.to_lowercase();
    let needle = format!("[{}]", var_tag.to_lowercase());
    let start = lower.find(&needle)?;
    let rest = &notes[start + needle.len()..];
    let end = rest.find('[').unwrap_or(rest.len());
    let block = &rest[..end];
    let block_lower = block.to_lowercase();
    let field = |name: &str| -> Option<String> {
        let index = block_lower.find(&name.to_lowercase())?;
        Some(
            block[index + name.len()..]
                .split([',', '\t', ']'])
                .next()
                .unwrap_or("")
                .to_string(),
        )
    };
    let start_value = field("Start=").and_then(|value| parse_voltage_like_value(&value));
    let step = field("Step=").and_then(|value| parse_voltage_like_value(&value));
    let count = field("No. of Steps=").and_then(|value| parse_positive_integer_text(&value));
    if start_value.is_none() && step.is_none() && count.is_none() {
        None
    } else {
        Some((count, start_value, step))
    }
}

fn find_metadata_finite_number(
    dataset: &EngineDataset,
    first_cell: &str,
    second_cell: &str,
) -> Option<f64> {
    let expected_first = first_cell.to_ascii_lowercase();
    let expected_second = second_cell.to_ascii_lowercase();
    for row in &dataset.rows {
        if normalize_cell_text(row.first().map(String::as_str).unwrap_or("")) != expected_first {
            continue;
        }
        if normalize_cell_text(row.get(1).map(String::as_str).unwrap_or("")) != expected_second {
            continue;
        }
        for cell in row.iter().skip(2) {
            if let Some(value) =
                parse_number_strict(Some(cell)).or_else(|| parse_voltage_like_value(cell))
            {
                return Some(value);
            }
        }
    }
    None
}

fn parse_secondary_sweep_from_rows(
    dataset: &EngineDataset,
) -> Option<(Option<usize>, Option<f64>, Option<f64>)> {
    let count = find_metadata_positive_integer(
        dataset,
        "TestParameter",
        Some("Measurement.Secondary.Count"),
    );
    let start =
        find_metadata_finite_number(dataset, "TestParameter", "Measurement.Secondary.Start");
    let step = find_metadata_finite_number(dataset, "TestParameter", "Measurement.Secondary.Step");
    if count.is_none() && start.is_none() && step.is_none() {
        None
    } else {
        Some((count, start, step))
    }
}

fn resolve_auto_group_shape_full(
    dataset: &EngineDataset,
    data_start_row_index: usize,
    x_col: usize,
    point_col_index: Option<usize>,
    var2_col_index: Option<usize>,
) -> (Option<usize>, Option<usize>) {
    if let Some(shape) = infer_metadata_group_shape(dataset, data_start_row_index) {
        return (Some(shape.0), Some(shape.1));
    }
    let explicit = detect_first_group_length(
        dataset,
        data_start_row_index,
        point_col_index,
        var2_col_index,
    );
    let repeated = if explicit.is_none() {
        let values =
            collect_column_numbers(dataset, data_start_row_index, x_col, dataset.rows.len());
        infer_auto_segmentation_from_x_values(
            &values,
            dataset.rows.len().saturating_sub(data_start_row_index),
        )
        .map(|shape| shape.0)
    } else {
        None
    };
    let group_size = explicit.or(repeated);
    let groups = group_size.and_then(|size| {
        let data_rows = dataset.rows.len().saturating_sub(data_start_row_index);
        if size > 0 && data_rows % size == 0 {
            Some(data_rows / size)
        } else {
            None
        }
    });
    (group_size, groups)
}

fn format_compact_number(value: f64) -> String {
    if !value.is_finite() {
        return String::new();
    }
    let text = format!("{:.12}", value);
    text.trim_end_matches('0').trim_end_matches('.').to_string()
}

fn auto_config_json(
    bottom_title: String,
    left_title: String,
    start_row: usize,
    x_col: usize,
    y_cols: Vec<usize>,
    group_size: Option<usize>,
    groups: Option<usize>,
    x_unit: &str,
    y_unit: &str,
    legend_prefix: String,
    legend_start_cell: Option<(usize, usize)>,
    legend_start_value: Option<String>,
    legend_count: Option<usize>,
    legend_step: Option<f64>,
    legend_target: &str,
) -> Value {
    json!({
        "autoDetectCurveType": true,
        "bottomTitle": bottom_title,
        "endRow": "end",
        "fileNameVdKeywords": "",
        "fileNameVgKeywords": "",
        "groupSize": group_size,
        "groups": groups,
        "leftTitle": left_title,
        "legendPrefix": legend_prefix,
        "startRow": start_row,
        "xCol": x_col,
        "xSegmentationMode": if group_size.is_some() { "points" } else { "auto" },
        "xUnit": x_unit,
        "yCols": y_cols,
        "yLegendStartCell": legend_start_cell.map(|(row, col)| json!({ "rowIndex": row, "colIndex": col })),
        "yLegendStartValue": legend_start_value,
        "yLegendCount": legend_count,
        "yLegendStep": legend_step,
        "yLegendTarget": legend_target,
        "yUnit": y_unit,
    })
}

fn with_auto_curve_type(mut config: Value, curve_type: &str) -> Value {
    if let Some(object) = config.as_object_mut() {
        object.insert("autoCurveType".to_string(), json!(curve_type));
    }
    config
}

fn nullable_non_empty_json_string(value: String) -> Value {
    if value.trim().is_empty() {
        Value::Null
    } else {
        json!(value)
    }
}

fn infer_auto_extraction_plan_from_config(config: &Value) -> Value {
    let bottom_title = json_string(config.get("bottomTitle"));
    let left_title = json_string(config.get("leftTitle"));
    let x_axis_role = match detect_axis_role_text(&bottom_title) {
        Some(role) => json!(role),
        None => Value::Null,
    };
    let curve_type_raw = json_string(config.get("autoCurveType")).to_ascii_lowercase();
    let curve_type = match curve_type_raw.as_str() {
        "transfer" | "output" | "cv" | "cf" | "pv" => curve_type_raw,
        _ => match x_axis_role.as_str() {
            Some("vg") => "transfer".to_string(),
            Some("vd") => "output".to_string(),
            _ => "unknown".to_string(),
        },
    };
    let legend_start_cell = json_cell_ref(config.get("yLegendStartCell"));
    let legend_start_value =
        nullable_non_empty_json_string(json_string(config.get("yLegendStartValue")));
    let legend_count = json_usize(config.get("yLegendCount"));
    let legend_step = config.get("yLegendStep").and_then(json_number);
    let group_size = json_usize(config.get("groupSize"));
    let legend_target = {
        let target = json_string(config.get("yLegendTarget"));
        if target.is_empty() {
            "auto".to_string()
        } else {
            target
        }
    };
    let start_row = json_usize(config.get("startRow")).unwrap_or(0);
    let legend_start_row_index = legend_start_cell.map(|(row, _)| row).or_else(|| {
        if !legend_start_value.is_null() && legend_target == "group" {
            Some(start_row)
        } else {
            None
        }
    });
    let groups = if group_size.is_some() || legend_target != "yColumn" {
        json_usize(config.get("groups"))
    } else {
        None
    };

    json!({
        "bottomTitle": bottom_title,
        "confidence": if curve_type == "unknown" { "low" } else { "medium" },
        "curveType": curve_type,
        "curveTypeLabel": Value::Null,
        "dataStartRowIndex": start_row,
        "groups": groups,
        "leftTitle": left_title,
        "legendPrefix": json_string(config.get("legendPrefix")),
        "legendStartColIndex": legend_start_cell.map(|(_, col)| col),
        "legendStartRowIndex": legend_start_row_index,
        "legendStartValue": legend_start_value,
        "legendCount": legend_count,
        "legendStep": legend_step,
        "legendTarget": legend_target,
        "needsTemplate": curve_type == "unknown",
        "reasons": Vec::<String>::new(),
        "xAxisRole": x_axis_role,
        "xAxisRoleSource": "metadata",
        "xCol": json_usize(config.get("xCol")).unwrap_or(0),
        "xPointsPerGroup": group_size,
        "xSegmentationMode": json_string(config.get("xSegmentationMode")),
        "xUnit": json_string(config.get("xUnit")),
        "yCols": json_usize_array(config.get("yCols")),
        "yUnit": json_string(config.get("yUnit")),
    })
}

fn infer_auto_extraction_result(dataset: &EngineDataset) -> Value {
    match infer_auto_worker_config(dataset) {
        Ok(config) => json!({
            "ok": true,
            "config": config,
            "plan": infer_auto_extraction_plan_from_config(&config),
        }),
        Err(message) => json!({
            "ok": false,
            "message": message,
            "reasons": [message],
        }),
    }
}

fn infer_auto_worker_config(dataset: &EngineDataset) -> Result<Value, String> {
    if dataset.rows.is_empty() {
        return Err(format!(
            "{}: no rows available for auto extraction.",
            dataset.file_name
        ));
    }
    let header_row_index = find_header_row_index(dataset);
    let headers = row_trimmed(dataset, header_row_index);
    let data_start_row_index = (header_row_index + 1).min(dataset.rows.len());
    let metadata = extract_auto_metadata(dataset);
    let (curve_type, x_axis_role, _source, _confidence, _needs_template) =
        classify_auto_curve(&dataset.file_name, &metadata, &headers);

    if metadata.is_stripped_channel_sweep {
        let ch1_voltage_col = headers.iter().position(|entry| entry == "CH1 Voltage");
        let ch2_voltage_col = headers.iter().position(|entry| entry == "CH2 Voltage");
        let ch1_current_col = headers.iter().position(|entry| entry == "CH1 Current");
        let ch2_current_col = headers.iter().position(|entry| entry == "CH2 Current");
        let (
            Some(ch1_voltage_col),
            Some(ch2_voltage_col),
            Some(ch1_current_col),
            Some(ch2_current_col),
        ) = (
            ch1_voltage_col,
            ch2_voltage_col,
            ch1_current_col,
            ch2_current_col,
        )
        else {
            return Err(format!(
                "{}: missing CH1/CH2 voltage/current columns.",
                dataset.file_name
            ));
        };
        let Some(swept_axis) = metadata.stripped_sweep_voltage_axis else {
            return Err(format!(
                "{}: unable to infer stripped sweep roles automatically.",
                dataset.file_name
            ));
        };
        let role = x_axis_role.unwrap_or("vd");
        let x_col = if swept_axis == "ch1" {
            ch1_voltage_col
        } else {
            ch2_voltage_col
        };
        let fixed_voltage_col = if swept_axis == "ch1" {
            ch2_voltage_col
        } else {
            ch1_voltage_col
        };
        let y_col = if curve_type == "output" {
            if swept_axis == "ch1" {
                ch1_current_col
            } else {
                ch2_current_col
            }
        } else if swept_axis == "ch1" {
            ch2_current_col
        } else {
            ch1_current_col
        };
        let point_col = headers.iter().position(|entry| entry == "Point");
        let var2_col = headers.iter().position(|entry| entry == "VAR2");
        let (group_size, groups) = resolve_auto_group_shape_full(
            dataset,
            data_start_row_index,
            x_col,
            point_col,
            var2_col,
        );
        let grouped = group_size.is_some() && groups.unwrap_or(1) > 1;
        let fixed_value = if grouped {
            None
        } else {
            metadata
                .stripped_fixed_voltage_magnitude
                .map(format_compact_number)
        };
        let bias_role = if role == "vg" { "Vd" } else { "Vg" };
        return Ok(with_auto_curve_type(
            auto_config_json(
                if role == "vg" {
                    "Vg".to_string()
                } else {
                    "Vd".to_string()
                },
                "Id".to_string(),
                data_start_row_index,
                x_col,
                vec![y_col],
                group_size,
                groups,
                "V",
                "A",
                bias_role.to_string(),
                if grouped {
                    Some((data_start_row_index, fixed_voltage_col))
                } else {
                    None
                },
                fixed_value.clone(),
                if grouped {
                    None
                } else if fixed_value.is_some() {
                    Some(1)
                } else {
                    None
                },
                None,
                if grouped {
                    "group"
                } else if fixed_value.is_some() {
                    "yColumn"
                } else {
                    "auto"
                },
            ),
            &curve_type,
        ));
    }

    let mut pair_candidates = Vec::<(usize, usize)>::new();
    for index in 0..headers.len().saturating_sub(1) {
        let (left_axis, left_stem) = structured_axis_suffix(&headers[index]);
        let (right_axis, right_stem) = structured_axis_suffix(&headers[index + 1]);
        if left_axis == Some("x")
            && right_axis == Some("y")
            && !left_stem.is_empty()
            && left_stem == right_stem
            && column_has_numeric_rows(dataset, data_start_row_index, index, 2)
            && column_has_numeric_rows(dataset, data_start_row_index, index + 1, 2)
        {
            pair_candidates.push((index, index + 1));
        }
    }

    let mut adjacent_voltage_current_pairs = Vec::<(usize, usize)>::new();
    for index in 0..headers.len().saturating_sub(1) {
        let left = &headers[index];
        let right = &headers[index + 1];
        if detect_axis_role_text(left).is_none()
            || !column_has_numeric_rows(dataset, data_start_row_index, index, 2)
            || !column_has_numeric_rows(dataset, data_start_row_index, index + 1, 2)
            || !is_current_like_header(right)
            || current_header_looks_like_gate_current(right)
            || !current_header_looks_like_drain_current(right)
        {
            continue;
        }
        adjacent_voltage_current_pairs.push((index, index + 1));
    }

    if adjacent_voltage_current_pairs.len() >= 2
        && adjacent_voltage_current_pairs.iter().all(|pair| {
            columns_share_equivalent_x(
                dataset,
                data_start_row_index,
                adjacent_voltage_current_pairs[0].0,
                pair.0,
            )
        })
    {
        let x_col = adjacent_voltage_current_pairs[0].0;
        let y_cols = adjacent_voltage_current_pairs
            .iter()
            .map(|pair| pair.1)
            .collect::<Vec<_>>();
        let role = x_axis_role.or_else(|| {
            detect_axis_role_text(headers.get(x_col).map(String::as_str).unwrap_or(""))
        });
        if let Some(role) = role {
            let inferred_curve = if curve_type != "unknown" {
                curve_type.as_str()
            } else if role == "vg" {
                "transfer"
            } else {
                "output"
            };
            let y_step = if adjacent_voltage_current_pairs.len() >= 2 {
                adjacent_voltage_current_pairs[1].1 - adjacent_voltage_current_pairs[0].1
            } else {
                1
            };
            return Ok(with_auto_curve_type(
                auto_config_json(
                    if role == "vg" {
                        "Vg".to_string()
                    } else {
                        "Vd".to_string()
                    },
                    "Id".to_string(),
                    data_start_row_index,
                    x_col,
                    y_cols.clone(),
                    None,
                    Some(1),
                    "V",
                    "A",
                    String::new(),
                    Some((header_row_index, y_cols[0])),
                    None,
                    Some(y_cols.len()),
                    Some(y_step as f64),
                    "yColumn",
                ),
                inferred_curve,
            ));
        }
    }

    if pair_candidates.len() >= 2
        && pair_candidates.iter().all(|pair| {
            columns_share_equivalent_x(dataset, data_start_row_index, pair_candidates[0].0, pair.0)
        })
    {
        let x_col = pair_candidates[0].0;
        let y_cols = pair_candidates
            .iter()
            .map(|pair| pair.1)
            .collect::<Vec<_>>();
        let role = x_axis_role.or_else(|| {
            detect_axis_role_text(headers.get(x_col).map(String::as_str).unwrap_or(""))
        });
        let inferred_curve = if curve_type != "unknown" {
            curve_type.as_str()
        } else if role == Some("vg") {
            "transfer"
        } else if role == Some("vd") {
            "output"
        } else {
            "unknown"
        };
        let (x_unit, y_unit, left_title) = match inferred_curve {
            "cv" => (
                "V",
                "F",
                headers[*y_cols.last().unwrap_or(&pair_candidates[0].1)].clone(),
            ),
            "cf" => (
                "Hz",
                "F",
                headers[*y_cols.last().unwrap_or(&pair_candidates[0].1)].clone(),
            ),
            "pv" => (
                "V",
                "A",
                headers[*y_cols.last().unwrap_or(&pair_candidates[0].1)].clone(),
            ),
            _ => ("V", "A", "Id".to_string()),
        };
        let y_step = if pair_candidates.len() >= 2 {
            pair_candidates[1].1 - pair_candidates[0].1
        } else {
            1
        };
        return Ok(with_auto_curve_type(
            auto_config_json(
                headers
                    .get(x_col)
                    .cloned()
                    .unwrap_or_else(|| "X".to_string()),
                left_title,
                data_start_row_index,
                x_col,
                y_cols,
                None,
                Some(1),
                x_unit,
                y_unit,
                String::new(),
                Some((header_row_index, pair_candidates[0].1)),
                None,
                Some(pair_candidates.len()),
                Some(y_step as f64),
                "yColumn",
            ),
            inferred_curve,
        ));
    }

    if curve_type == "pv" || curve_type == "cv" || curve_type == "cf" {
        let x_candidates = find_numeric_semantic_columns(
            dataset,
            &headers,
            data_start_row_index,
            if curve_type == "cf" {
                is_frequency_like_header
            } else {
                is_voltage_like_header
            },
        );
        let y_candidates = find_numeric_semantic_columns(
            dataset,
            &headers,
            data_start_row_index,
            if curve_type == "pv" {
                is_current_like_header
            } else {
                is_capacitance_like_header
            },
        );
        let (x_col, y_col) = choose_best_semantic_pair(&x_candidates, &y_candidates);
        if let (Some(x_col), Some(y_col)) = (x_col, y_col) {
            let y_cols = if curve_type == "cv" || curve_type == "cf" {
                y_candidates
                    .into_iter()
                    .filter(|col| *col >= x_col)
                    .collect::<Vec<_>>()
            } else {
                vec![y_col]
            };
            let y_cols = if y_cols.is_empty() {
                vec![y_col]
            } else {
                y_cols
            };
            return Ok(with_auto_curve_type(
                auto_config_json(
                    headers
                        .get(x_col)
                        .cloned()
                        .unwrap_or_else(|| "X".to_string()),
                    headers
                        .get(*y_cols.last().unwrap_or(&y_col))
                        .cloned()
                        .unwrap_or_else(|| "Y".to_string()),
                    data_start_row_index,
                    x_col,
                    y_cols.clone(),
                    None,
                    Some(1),
                    if curve_type == "cf" { "Hz" } else { "V" },
                    if curve_type == "pv" { "A" } else { "F" },
                    String::new(),
                    if y_cols.len() > 1 {
                        Some((header_row_index, y_cols[0]))
                    } else {
                        None
                    },
                    None,
                    if y_cols.len() > 1 {
                        Some(y_cols.len())
                    } else {
                        None
                    },
                    if y_cols.len() > 1 { Some(1.0) } else { None },
                    if y_cols.len() > 1 { "yColumn" } else { "auto" },
                ),
                &curve_type,
            ));
        }
    }

    let mut x_candidates = Vec::<usize>::new();
    for (index, header) in headers.iter().enumerate() {
        if !column_has_numeric_rows(dataset, data_start_row_index, index, 2) {
            continue;
        }
        let role = detect_axis_role_text(header);
        if role.is_some() && (x_axis_role.is_none() || role == x_axis_role) {
            x_candidates.push(index);
        }
    }
    let x_col = x_candidates.first().copied().ok_or_else(|| {
        format!(
            "{}: unable to locate auto extraction columns.",
            dataset.file_name
        )
    })?;
    let y_candidates = headers
        .iter()
        .enumerate()
        .filter(|(index, header)| {
            *index != x_col
                && current_header_looks_like_drain_current(header)
                && column_has_numeric_rows(dataset, data_start_row_index, *index, 2)
        })
        .map(|(index, _)| index)
        .collect::<Vec<_>>();
    let y_cols = if y_candidates.len() >= 2 {
        y_candidates
    } else {
        headers
            .iter()
            .enumerate()
            .find(|(index, header)| {
                *index != x_col
                    && (current_header_looks_like_drain_current(header)
                        || normalize_header_compact(header) == "id")
                    && !current_header_looks_like_gate_current(header)
                    && column_has_numeric_rows(dataset, data_start_row_index, *index, 2)
            })
            .map(|(index, _)| vec![index])
            .unwrap_or_default()
    };
    if y_cols.is_empty() {
        return Err(format!(
            "{}: unable to locate auto extraction columns.",
            dataset.file_name
        ));
    }
    let point_col = headers
        .iter()
        .position(|entry| clean_cell_text(entry) == "Point");
    let var2_col = headers
        .iter()
        .position(|entry| clean_cell_text(entry) == "VAR2");
    let (group_size, groups) =
        resolve_auto_group_shape_full(dataset, data_start_row_index, x_col, point_col, var2_col);
    let bias_role = if x_axis_role == Some("vg") {
        "vd"
    } else {
        "vg"
    };
    let legend_col = headers
        .iter()
        .enumerate()
        .find(|(index, header)| {
            *index != x_col
                && detect_axis_role_text(header) == Some(bias_role)
                && column_has_numeric_rows(dataset, data_start_row_index, *index, 2)
        })
        .map(|(index, _)| index);
    let generated =
        if legend_col.is_none() && detect_axis_role_text(&metadata.var2_name) == Some(bias_role) {
            parse_var_sweep_from_notes(&metadata.notes_text, "VAR2")
                .or_else(|| parse_secondary_sweep_from_rows(dataset))
        } else {
            None
        };
    let grouped = group_size.is_some()
        && groups.unwrap_or(1) > 1
        && (legend_col.is_some() || generated.as_ref().and_then(|value| value.0).is_some());
    let single_generated = !grouped && generated.as_ref().and_then(|value| value.0) == Some(1);
    let generated_start = generated
        .as_ref()
        .and_then(|value| value.1)
        .map(format_compact_number);
    let generated_count = generated.as_ref().and_then(|value| value.0);
    let generated_step = generated.as_ref().and_then(|value| value.2);

    Ok(with_auto_curve_type(
        auto_config_json(
            if x_axis_role == Some("vg") {
                "Vg".to_string()
            } else if x_axis_role == Some("vd") {
                "Vd".to_string()
            } else {
                headers
                    .get(x_col)
                    .cloned()
                    .unwrap_or_else(|| "X".to_string())
            },
            if headers
                .get(y_cols[0])
                .map(|value| current_header_looks_like_drain_current(value))
                .unwrap_or(false)
            {
                "Id".to_string()
            } else {
                headers
                    .get(y_cols[0])
                    .cloned()
                    .unwrap_or_else(|| "Y".to_string())
            },
            data_start_row_index,
            x_col,
            y_cols.clone(),
            group_size,
            groups,
            "V",
            "A",
            if y_cols.len() > 1 {
                String::new()
            } else if bias_role == "vd" {
                "Vd".to_string()
            } else {
                "Vg".to_string()
            },
            if grouped {
                legend_col.map(|col| (data_start_row_index, col))
            } else if y_cols.len() > 1 {
                Some((header_row_index, y_cols[0]))
            } else {
                None
            },
            if grouped && legend_col.is_none() {
                generated_start.clone()
            } else if single_generated {
                generated_start
            } else {
                None
            },
            if y_cols.len() > 1 {
                Some(y_cols.len())
            } else if grouped && legend_col.is_none() {
                generated_count
            } else if single_generated {
                Some(1)
            } else {
                None
            },
            if y_cols.len() > 1 {
                Some(1.0)
            } else if grouped && legend_col.is_none() {
                generated_step
            } else {
                None
            },
            if y_cols.len() > 1 {
                "yColumn"
            } else if grouped {
                "group"
            } else if single_generated {
                "yColumn"
            } else {
                "auto"
            },
        ),
        &curve_type,
    ))
}

fn build_uniform_sample_indices(length: usize, target: usize) -> Option<Vec<usize>> {
    if target <= 1 {
        return Some(vec![0]);
    }
    if target >= length {
        return None;
    }
    let last = length - 1;
    let mut indices = Vec::with_capacity(target);
    for i in 0..target {
        indices.push(((i * last) as f64 / (target - 1) as f64).round() as usize);
    }
    for i in 1..indices.len() {
        if indices[i] < indices[i - 1] {
            indices[i] = indices[i - 1];
        }
    }
    if let Some(last_item) = indices.last_mut() {
        *last_item = last;
    }
    Some(indices)
}

fn detect_axis_role(text: &str) -> (Option<&'static str>, &'static str) {
    let normalized = text.to_ascii_lowercase();
    if normalized.contains("vd") || normalized.contains("v_d") || normalized.contains("drain") {
        return (Some("vd"), "label");
    }
    if normalized.contains("vg")
        || normalized.contains("v_g")
        || normalized.contains("gate")
        || normalized.contains("var1")
    {
        return (Some("vg"), "label");
    }
    (None, "metadata")
}

fn process_engine_file(
    file_id: &str,
    dataset: &EngineDataset,
    config: &Value,
    curve_filter_key: Option<&str>,
    curve_filter_field: Option<&str>,
    max_points_raw: Option<usize>,
    analysis_cache_path: Option<&str>,
) -> Result<Value, String> {
    let segmentation_mode = json_string(config.get("xSegmentationMode")).to_ascii_lowercase();
    let file_name_vg_keywords =
        split_file_name_match_input(&json_string(config.get("fileNameVgKeywords")));
    let file_name_vd_keywords =
        split_file_name_match_input(&json_string(config.get("fileNameVdKeywords")));
    let use_file_name_mapping =
        !file_name_vg_keywords.is_empty() || !file_name_vd_keywords.is_empty();

    let x_col = json_usize(config.get("xCol")).ok_or_else(|| "Invalid config: xCol".to_string())?;
    let start_row =
        json_usize(config.get("startRow")).ok_or_else(|| "Invalid config: startRow".to_string())?;
    let end_row = match config.get("endRow") {
        Some(Value::String(text)) if text.trim().eq_ignore_ascii_case("end") => dataset
            .rows
            .len()
            .checked_sub(1)
            .ok_or_else(|| "file has no rows".to_string())?,
        value => json_usize(value).ok_or_else(|| "Invalid config: endRow".to_string())?,
    };
    if end_row < start_row || start_row >= dataset.rows.len() {
        return Err("Invalid config: row range".to_string());
    }

    let y_cols = json_usize_array(config.get("yCols"));
    if y_cols.is_empty() {
        return Err("Invalid config: yCols".to_string());
    }
    let expected_total = end_row - start_row + 1;
    let segment_count = json_usize(config.get("segmentCount"));
    let mut group_size = json_usize(config.get("groupSize"));
    let mut groups = json_usize(config.get("groups"));
    if let Some((cell_row, cell_col)) = json_cell_ref(config.get("groupSizeCell")) {
        let points = read_cell_number(dataset, cell_row, cell_col).and_then(|value| {
            if value > 0.0 && value.fract().abs() <= f64::EPSILON {
                Some(value as usize)
            } else {
                None
            }
        });
        let points = points.ok_or_else(|| {
            format!(
                "{}: Points cell {}{} must contain a positive integer.",
                dataset.file_name,
                excel_column_label(cell_col),
                cell_row + 1
            )
        })?;
        if points > expected_total {
            return Err(format!(
                "{}: Points from {}{} ({}) cannot be larger than the X range length ({}).",
                dataset.file_name,
                excel_column_label(cell_col),
                cell_row + 1,
                points,
                expected_total
            ));
        }
        if expected_total % points != 0 {
            return Err(format!(
                "{}: X range has {} points, which is not divisible by points={} (from {}{}).",
                dataset.file_name,
                expected_total,
                points,
                excel_column_label(cell_col),
                cell_row + 1
            ));
        }
        group_size = Some(points);
        groups = Some(expected_total / points);
    } else if segmentation_mode == "auto" {
        if let Some((meta_group_size, meta_groups)) = infer_metadata_group_shape(dataset, start_row)
        {
            group_size = Some(meta_group_size);
            groups = Some(meta_groups);
        } else {
            let mut x_values = Vec::<f64>::with_capacity(expected_total);
            for row_index in start_row..=end_row {
                let x_value = cell_number(dataset, row_index, x_col).ok_or_else(|| {
                    format!(
                        "{}: Invalid X at {}{}.",
                        dataset.file_name,
                        excel_column_label(x_col),
                        row_index + 1
                    )
                })?;
                x_values.push(x_value);
            }
            if let Some((inferred_group_size, inferred_groups)) =
                infer_auto_segmentation_from_x_values(&x_values, expected_total)
            {
                group_size = Some(inferred_group_size);
                groups = Some(inferred_groups);
            } else {
                group_size = Some(expected_total);
                groups = Some(1);
            }
        }
    } else if let Some(segments) = segment_count.filter(|value| *value > 0) {
        if expected_total % segments != 0 {
            return Err(format!(
                "X range has {} points, which is not divisible by segments={}.",
                expected_total, segments
            ));
        }
        groups = Some(segments);
        group_size = Some(expected_total / segments);
    }
    let group_size = group_size.unwrap_or(expected_total);
    if group_size == 0 || expected_total % group_size != 0 {
        return Err(format!(
            "X range has {} points, which is not divisible by points={}.",
            expected_total, group_size
        ));
    }
    let groups = groups.unwrap_or(expected_total / group_size);
    if groups == 0 || groups * group_size != expected_total {
        return Err(format!(
            "Invalid config: X range ({}) != groups({}) * points({})",
            expected_total, groups, group_size
        ));
    }

    let max_points = max_points_raw.unwrap_or(600).max(2);
    let target_points = group_size.min(max_points);
    let sample_indices = build_uniform_sample_indices(group_size, target_points);
    let mut x_full_by_group = vec![vec![0f64; group_size]; groups];
    let mut y_full_by_group = vec![vec![vec![0f64; group_size]; y_cols.len()]; groups];
    let mut min_x = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_y = f64::NEG_INFINITY;

    for row_index in start_row..=end_row {
        let local = row_index - start_row;
        let group_index = local / group_size;
        let index_in_group = local % group_size;
        let x_value = cell_number(dataset, row_index, x_col).ok_or_else(|| {
            format!(
                "{}: Invalid X at {}{}.",
                dataset.file_name,
                excel_column_label(x_col),
                row_index + 1
            )
        })?;
        x_full_by_group[group_index][index_in_group] = x_value;
        for (yi, y_col) in y_cols.iter().enumerate() {
            let y_value = cell_number(dataset, row_index, *y_col).ok_or_else(|| {
                format!(
                    "{}: Invalid Y at {}{}.",
                    dataset.file_name,
                    excel_column_label(*y_col),
                    row_index + 1
                )
            })?;
            y_full_by_group[group_index][yi][index_in_group] = y_value;
        }
    }

    let legend_prefix = json_string(config.get("legendPrefix"));
    let (legend_mode, y_legend_labels) =
        resolve_legend_labels(dataset, config, group_size, groups, &y_cols);
    let (legend_var_token, _) = detect_axis_role(&legend_prefix);

    let mut x_groups = Vec::<Vec<f64>>::with_capacity(groups);
    let mut series = Vec::<Value>::new();
    let mut analysis_series = Vec::<AnalysisSeriesRequest>::new();
    for group_index in 0..groups {
        let x_full = &x_full_by_group[group_index];
        let x_down: Vec<f64> = match &sample_indices {
            Some(indices) => indices.iter().map(|idx| x_full[*idx]).collect(),
            None => x_full.clone(),
        };
        for value in &x_down {
            min_x = min_x.min(*value);
            max_x = max_x.max(*value);
        }
        x_groups.push(x_down);

        for (yi, y_col) in y_cols.iter().enumerate() {
            let y_full = &y_full_by_group[group_index][yi];
            let y_down: Vec<f64> = match &sample_indices {
                Some(indices) => indices.iter().map(|idx| y_full[*idx]).collect(),
                None => y_full.clone(),
            };
            for value in &y_down {
                min_y = min_y.min(*value);
                max_y = max_y.max(*value);
            }
            let y_label = excel_column_label(*y_col);
            let legend_label = match legend_mode {
                Some(LegendMode::YCol) => y_legend_labels
                    .as_ref()
                    .and_then(|labels| labels.get(yi))
                    .cloned()
                    .flatten(),
                Some(LegendMode::Group) => y_legend_labels
                    .as_ref()
                    .and_then(|labels| labels.get(group_index))
                    .cloned()
                    .flatten(),
                None => None,
            };
            let legend_value = legend_label
                .as_deref()
                .and_then(|label| label.trim().parse::<f64>().ok());
            let series_name = if let Some(label) = legend_label.as_deref() {
                let prefix = if legend_prefix.trim().is_empty() {
                    String::new()
                } else {
                    format!("{}=", legend_prefix.trim())
                };
                if legend_mode == Some(LegendMode::YCol) {
                    if groups > 1 {
                        format!("{}{} #{}", prefix, label, group_index + 1)
                    } else {
                        format!("{}{}", prefix, label)
                    }
                } else if y_cols.len() > 1 {
                    format!("{} @ {}{}", y_label, prefix, label)
                } else {
                    format!("{}{}", prefix, label)
                }
            } else {
                format!("{} #{}", y_label, group_index + 1)
            };
            let series_id = format!("{}_{}_{}", file_id, y_col, group_index);
            analysis_series.push(AnalysisSeriesRequest {
                group_index: Some(group_index),
                id: series_id.clone(),
                x: Vec::new(),
                y: y_down.clone(),
            });
            series.push(json!({
                "id": series_id,
                "name": series_name,
                "fileId": file_id,
                "groupIndex": group_index,
                "yCol": y_col,
                "y": y_down,
                "legendLabel": legend_label,
                "legendValue": legend_value,
            }));
        }
    }

    let bottom_title = json_string(config.get("bottomTitle"));
    let left_title = json_string(config.get("leftTitle"));
    let x_unit = json_string(config.get("xUnit"));
    let y_unit = json_string(config.get("yUnit"));
    let file_name_role = if use_file_name_mapping {
        if file_name_vg_keywords.is_empty() || file_name_vd_keywords.is_empty() {
            return Err(format!(
                "{}: Invalid template config: both file-name prefix groups are required.",
                dataset.file_name
            ));
        }
        let separators = normalize_file_name_field_separators(&json_string(
            config.get("fileNameFieldSeparators"),
        ));
        let matched_vg = match_file_name_against_pattern_tokens(
            &dataset.file_name,
            &file_name_vg_keywords,
            &separators,
        );
        let matched_vd = match_file_name_against_pattern_tokens(
            &dataset.file_name,
            &file_name_vd_keywords,
            &separators,
        );
        if !matched_vg && !matched_vd {
            return Err(format!(
                "{}: File name does not match configured template prefixes.",
                dataset.file_name
            ));
        }
        if matched_vg && !matched_vd {
            Some("vg")
        } else if matched_vd && !matched_vg {
            Some("vd")
        } else {
            None
        }
    } else {
        None
    };
    let fallback_x_label = excel_column_label(x_col);
    let x_label = append_axis_unit(
        if bottom_title.is_empty() {
            &fallback_x_label
        } else {
            &bottom_title
        },
        &x_unit,
    );
    let y_label = append_axis_unit(&left_title, &y_unit);
    let (x_axis_role, x_axis_role_source) = detect_axis_role(&x_label);
    let effective_axis_role = x_axis_role.or(file_name_role);
    let effective_axis_role_source = if x_axis_role.is_some() {
        x_axis_role_source
    } else if file_name_role.is_some() {
        "fileName"
    } else {
        x_axis_role_source
    };
    let auto_curve_type = json_string(config.get("autoCurveType")).to_ascii_lowercase();
    let curve_type = match auto_curve_type.as_str() {
        "transfer" => Some("transfer"),
        "output" => Some("output"),
        "cv" => Some("cv"),
        "cf" => Some("cf"),
        "pv" => Some("pv"),
        _ => match effective_axis_role {
            Some("vg") => Some("transfer"),
            Some("vd") => Some("output"),
            _ => None,
        },
    };
    let curve_type_confidence = if curve_type.is_some() {
        "medium"
    } else {
        "low"
    };
    let analysis_cache = if !analysis_series.is_empty() {
        Some(json!({
            "source": "rust-process-precompute",
            "series": engine_analysis::analyze_series_batch(
                &analysis_series,
                Some(&x_groups),
                Some(&AnalysisSourceFile {
                    curve_type: curve_type.map(|value| value.to_string()),
                    supports_ss: Some(effective_axis_role == Some("vg")),
                    x_axis_role: effective_axis_role.map(|value| value.to_string()),
                    x_label: Some(x_label.clone()),
                }),
            ),
        }))
    } else {
        None
    };
    let analysis_cache_ref =
        if let (Some(cache), Some(cache_path)) = (analysis_cache.as_ref(), analysis_cache_path) {
            let path = PathBuf::from(cache_path);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|error| format!("failed to create analysis cache dir: {}", error))?;
            }
            let bytes = serde_json::to_vec(cache)
                .map_err(|error| format!("failed to encode analysis cache: {}", error))?;
            fs::write(&path, &bytes)
                .map_err(|error| format!("failed to write analysis cache: {}", error))?;
            Some(json!({
                "format": "json",
                "path": path.to_string_lossy(),
                "bytes": bytes.len(),
            }))
        } else {
            None
        };

    Ok(json!({
        "fileId": file_id,
        "fileName": dataset.file_name,
        "curveFilterKey": curve_filter_key.filter(|value| !value.trim().is_empty()),
        "curveFilterField": curve_filter_field.filter(|value| !value.trim().is_empty()),
        "legend": legend_mode.map(|mode| json!({
            "mode": mode.as_str(),
            "labels": y_legend_labels.unwrap_or_default(),
            "prefix": if legend_prefix.trim().is_empty() { Value::Null } else { json!(legend_prefix.trim()) },
            "varToken": legend_var_token,
        })),
        "curveType": curve_type,
        "curveTypeConfidence": curve_type_confidence,
        "curveTypeNeedsTemplate": curve_type.is_none(),
        "curveTypeReasons": Vec::<String>::new(),
        "xAxisRole": effective_axis_role,
        "xAxisRoleSource": effective_axis_role_source,
        "supportsSs": effective_axis_role == Some("vg"),
        "xLabel": x_label,
        "yLabel": y_label,
        "x": {
            "col": x_col,
            "colLabel": excel_column_label(x_col),
            "startRow": start_row + 1,
            "endRow": end_row + 1,
            "points": group_size,
            "groups": groups,
            "sampledPoints": target_points,
        },
        "xUnit": x_unit,
        "yUnit": y_unit,
        "y": {
            "columns": y_cols,
            "columnLabels": y_cols.iter().map(|col| excel_column_label(*col)).collect::<Vec<_>>(),
        },
        "xGroups": x_groups,
        "series": series,
        "domain": {
            "x": pad_domain(min_x, max_x),
            "y": pad_domain(min_y, max_y),
        },
        "analysisCache": if analysis_cache_ref.is_some() { Value::Null } else { analysis_cache.unwrap_or(Value::Null) },
        "analysisCacheRef": analysis_cache_ref,
        "source": "rust-engine",
    }))
}

fn handle_engine_request(
    cache: &mut HashMap<String, EngineDataset>,
    request: EngineRequest,
) -> EngineResponse {
    let request_id = request.id;
    let result: Result<Value, String> = (|| match request.command.as_str() {
        "open" => {
            let file_id = request
                .file_id
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| "missing fileId".to_string());
            let path = request
                .path
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| "missing path".to_string());
            match (file_id, path) {
                (Ok(file_id), Ok(path_text)) => {
                    let path = PathBuf::from(path_text);
                    let file_name = request.file_name.clone().unwrap_or_else(|| {
                        path.file_name()
                            .and_then(|v| v.to_str())
                            .unwrap_or("")
                            .to_string()
                    });
                    let dataset = load_engine_dataset(&path, &file_name)?;
                    let result = engine_dataset::preview_result(
                        file_id,
                        &dataset,
                        request.seed_rows.unwrap_or(400),
                    );
                    cache.insert(file_id.to_string(), dataset);
                    Ok(result)
                }
                (Err(error), _) | (_, Err(error)) => Err(error),
            }
        }
        "previewRows" => {
            let file_id = request
                .file_id
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| "missing fileId".to_string())?;
            let dataset = cache
                .get(file_id)
                .ok_or_else(|| "file is not open in engine".to_string())?;
            let start = request.start_row.unwrap_or(0).min(dataset.rows.len());
            let end = request
                .end_row
                .unwrap_or(start)
                .max(start)
                .min(dataset.rows.len());
            Ok(json!({
                "fileId": file_id,
                "startRow": start,
                "rows": dataset.rows[start..end].iter().collect::<Vec<_>>(),
            }))
        }
        "previewMeta" => {
            let file_id = request
                .file_id
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| "missing fileId".to_string())?;
            let dataset = cache
                .get(file_id)
                .ok_or_else(|| "file is not open in engine".to_string())?;
            Ok(dataset.preview_meta_result(file_id))
        }
        "readCell" => {
            let file_id = request
                .file_id
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| "missing fileId".to_string())?;
            let row_index = request
                .row_index
                .ok_or_else(|| "missing rowIndex".to_string())?;
            let col_index = request
                .col_index
                .ok_or_else(|| "missing colIndex".to_string())?;
            let dataset = cache
                .get(file_id)
                .ok_or_else(|| "file is not open in engine".to_string())?;
            let mut result = dataset.cell_result(row_index, col_index)?;
            if let Some(object) = result.as_object_mut() {
                object.insert("fileId".to_string(), json!(file_id));
            }
            Ok(result)
        }
        "readCells" => {
            let file_id = request
                .file_id
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| "missing fileId".to_string())?;
            let cells = request
                .cells
                .as_ref()
                .filter(|cells| !cells.is_empty())
                .ok_or_else(|| "missing cells".to_string())?;
            let dataset = cache
                .get(file_id)
                .ok_or_else(|| "file is not open in engine".to_string())?;
            let mut results = Vec::<Value>::with_capacity(cells.len());
            for cell in cells {
                results.push(dataset.cell_result(cell.row_index, cell.col_index)?);
            }
            Ok(json!({
                "fileId": file_id,
                "cells": results,
            }))
        }
        "inferAutoWorkerConfig" => {
            let file_id = request
                .file_id
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| "missing fileId".to_string())?;
            if !cache.contains_key(file_id) {
                let path_text = request
                    .path
                    .as_deref()
                    .filter(|value| !value.trim().is_empty())
                    .ok_or_else(|| "file is not open in engine".to_string())?;
                let path = PathBuf::from(path_text);
                let file_name = request.file_name.clone().unwrap_or_else(|| {
                    path.file_name()
                        .and_then(|value| value.to_str())
                        .unwrap_or("")
                        .to_string()
                });
                let dataset = load_engine_dataset(&path, &file_name)?;
                cache.insert(file_id.to_string(), dataset);
            }
            let dataset = cache
                .get(file_id)
                .ok_or_else(|| "file is not open in engine".to_string())?;
            let config = infer_auto_worker_config(dataset)?;
            Ok(json!({
                "fileId": file_id,
                "fileName": dataset.file_name,
                "config": config,
            }))
        }
        "inferAutoExtraction" => {
            let file_id = request
                .file_id
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| "missing fileId".to_string())?;
            if !cache.contains_key(file_id) {
                let path_text = request
                    .path
                    .as_deref()
                    .filter(|value| !value.trim().is_empty())
                    .ok_or_else(|| "file is not open in engine".to_string())?;
                let path = PathBuf::from(path_text);
                let file_name = request.file_name.clone().unwrap_or_else(|| {
                    path.file_name()
                        .and_then(|value| value.to_str())
                        .unwrap_or("")
                        .to_string()
                });
                let dataset = load_engine_dataset(&path, &file_name)?;
                cache.insert(file_id.to_string(), dataset);
            }
            let dataset = cache
                .get(file_id)
                .ok_or_else(|| "file is not open in engine".to_string())?;
            let mut result = infer_auto_extraction_result(dataset);
            if let Some(object) = result.as_object_mut() {
                object.insert("fileId".to_string(), json!(file_id));
                object.insert("fileName".to_string(), json!(dataset.file_name));
            }
            Ok(result)
        }
        "processFile" => {
            let file_id = request
                .file_id
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| "missing fileId".to_string())?;
            if !cache.contains_key(file_id) {
                let path_text = request
                    .path
                    .as_deref()
                    .filter(|value| !value.trim().is_empty())
                    .ok_or_else(|| "file is not open in engine".to_string())?;
                let path = PathBuf::from(path_text);
                let file_name = request.file_name.clone().unwrap_or_else(|| {
                    path.file_name()
                        .and_then(|value| value.to_str())
                        .unwrap_or("")
                        .to_string()
                });
                let dataset = load_engine_dataset(&path, &file_name)?;
                cache.insert(file_id.to_string(), dataset);
            }
            let dataset = cache
                .get(file_id)
                .ok_or_else(|| "file is not open in engine".to_string())?;
            let config = request
                .config
                .as_ref()
                .ok_or_else(|| "missing config".to_string())?;
            process_engine_file(
                file_id,
                dataset,
                config,
                request.curve_filter_key.as_deref(),
                request.curve_filter_field.as_deref(),
                request.max_points,
                request.analysis_cache_path.as_deref(),
            )
        }
        "processFileAuto" => {
            let file_id = request
                .file_id
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| "missing fileId".to_string())?;
            if !cache.contains_key(file_id) {
                let path_text = request
                    .path
                    .as_deref()
                    .filter(|value| !value.trim().is_empty())
                    .ok_or_else(|| "file is not open in engine".to_string())?;
                let path = PathBuf::from(path_text);
                let file_name = request.file_name.clone().unwrap_or_else(|| {
                    path.file_name()
                        .and_then(|value| value.to_str())
                        .unwrap_or("")
                        .to_string()
                });
                let dataset = load_engine_dataset(&path, &file_name)?;
                cache.insert(file_id.to_string(), dataset);
            }
            let dataset = cache
                .get(file_id)
                .ok_or_else(|| "file is not open in engine".to_string())?;
            let config = infer_auto_worker_config(dataset)?;
            let mut processed = process_engine_file(
                file_id,
                dataset,
                &config,
                request.curve_filter_key.as_deref(),
                request.curve_filter_field.as_deref(),
                request.max_points,
                request.analysis_cache_path.as_deref(),
            )?;
            if let Some(object) = processed.as_object_mut() {
                object.insert("autoConfig".to_string(), config);
            }
            Ok(processed)
        }
        "analyzeSeriesBatch" => {
            let series = request
                .series
                .as_deref()
                .filter(|series| !series.is_empty())
                .ok_or_else(|| "missing series".to_string())?;
            Ok(engine_analysis::analyze_series_batch_result(
                request.file_id.as_deref(),
                series,
                request.x_groups.as_deref(),
                request.source_file.as_ref(),
            ))
        }
        "dispose" => {
            if let Some(file_id) = request.file_id.as_deref() {
                cache.remove(file_id);
            }
            Ok(json!({ "disposed": true }))
        }
        "clear" => {
            cache.clear();
            Ok(json!({ "cleared": true }))
        }
        other => Err(format!("unknown command: {}", other)),
    })();

    match result {
        Ok(value) => EngineResponse {
            id: request_id,
            ok: true,
            result: Some(value),
            error: None,
        },
        Err(message) => EngineResponse {
            id: request_id,
            ok: false,
            result: None,
            error: Some(EngineError { message }),
        },
    }
}

fn run_stdio_engine() {
    let stdin = io::stdin();
    let mut stdout = io::stdout();
    let mut cache = HashMap::<String, EngineDataset>::new();

    for line in stdin.lock().lines() {
        let line = match line {
            Ok(value) => value,
            Err(error) => {
                let _ = writeln!(
                    stdout,
                    "{}",
                    serde_json::to_string(&EngineResponse {
                        id: 0,
                        ok: false,
                        result: None,
                        error: Some(EngineError {
                            message: error.to_string(),
                        }),
                    })
                    .unwrap()
                );
                let _ = stdout.flush();
                continue;
            }
        };
        if line.trim().is_empty() {
            continue;
        }

        let response = match serde_json::from_str::<EngineRequest>(&line) {
            Ok(request) => handle_engine_request(&mut cache, request),
            Err(error) => EngineResponse {
                id: 0,
                ok: false,
                result: None,
                error: Some(EngineError {
                    message: error.to_string(),
                }),
            },
        };

        if let Ok(text) = serde_json::to_string(&response) {
            let _ = writeln!(stdout, "{}", text);
            let _ = stdout.flush();
        }
    }
}

fn collect_excel_files(root: &Path, output: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_excel_files(&path, output);
        } else if path.is_file() && is_excel_path(&path) {
            output.push(path);
        }
    }
}

fn escape_csv_cell(value: &str, output: &mut Vec<u8>) {
    let needs_quotes = value
        .bytes()
        .any(|byte| matches!(byte, b',' | b'"' | b'\n' | b'\r'));
    if !needs_quotes {
        output.extend_from_slice(value.as_bytes());
        return;
    }

    output.push(b'"');
    for byte in value.bytes() {
        if byte == b'"' {
            output.extend_from_slice(b"\"\"");
        } else {
            output.push(byte);
        }
    }
    output.push(b'"');
}

fn is_numeric_text(value: &str) -> bool {
    let trimmed = value.trim();
    !trimmed.is_empty() && trimmed.parse::<f64>().is_ok()
}

fn build_import_assessment(file_name: &str, rows: Vec<Vec<String>>) -> Value {
    let dataset = EngineDataset::from_rows(file_name.to_string(), rows);
    let header_row_index = find_header_row_index(&dataset);
    let headers = row_trimmed(&dataset, header_row_index);
    let metadata = extract_auto_metadata(&dataset);
    let (curve_type, x_axis_role, source, confidence, needs_template) =
        classify_auto_curve(file_name, &metadata, &headers);
    json!({
        "curveType": if curve_type == "unknown" { Value::Null } else { json!(curve_type) },
        "curveTypeConfidence": confidence,
        "curveTypeNeedsTemplate": needs_template,
        "curveTypeReasons": Vec::<String>::new(),
        "xAxisRole": x_axis_role,
        "xAxisRoleSource": source,
    })
}

fn convert_one(
    index: usize,
    path: &Path,
    output_path: Option<&Path>,
) -> Result<ConvertResult, ConvertFailure> {
    let start = Instant::now();
    let size_bytes = fs::metadata(path).map(|meta| meta.len()).unwrap_or(0);
    let mut workbook = open_workbook_auto(path).map_err(|error| ConvertFailure {
        message: error.to_string(),
        path: path.to_path_buf(),
    })?;
    let sheet_name = workbook
        .sheet_names()
        .first()
        .cloned()
        .ok_or_else(|| ConvertFailure {
            message: "workbook has no sheet".to_string(),
            path: path.to_path_buf(),
        })?;
    let range = workbook
        .worksheet_range(&sheet_name)
        .map_err(|error| ConvertFailure {
            message: error.to_string(),
            path: path.to_path_buf(),
        })?;

    let mut output = Vec::<u8>::new();
    let mut assessment_rows = Vec::<Vec<String>>::new();
    let mut stats = ConvertStats {
        size_bytes,
        ..ConvertStats::default()
    };

    for row in range.rows() {
        let values: Vec<String> = row.iter().map(|cell| cell.to_string()).collect();
        if values.iter().all(|value| value.trim().is_empty()) {
            continue;
        }
        if assessment_rows.len() < 512 {
            assessment_rows.push(values.clone());
        }

        if stats.rows > 0 {
            output.push(b'\n');
        }

        for (index, value) in values.iter().enumerate() {
            if index > 0 {
                output.push(b',');
            }
            if is_numeric_text(value) {
                stats.numeric_cells += 1;
            }
            escape_csv_cell(value, &mut output);
        }

        stats.rows += 1;
        stats.cells += values.len();
    }

    stats.csv_bytes = output.len();
    stats.convert_ms = start.elapsed().as_secs_f64() * 1000.0;
    let output_path = if let Some(csv_path) = output_path {
        if let Some(parent) = csv_path.parent() {
            fs::create_dir_all(parent).map_err(|error| ConvertFailure {
                message: error.to_string(),
                path: path.to_path_buf(),
            })?;
        }
        fs::write(&csv_path, &output).map_err(|error| ConvertFailure {
            message: error.to_string(),
            path: path.to_path_buf(),
        })?;
        Some(csv_path.to_path_buf())
    } else {
        None
    };

    Ok(ConvertResult {
        assessment: build_import_assessment(
            path.file_name()
                .and_then(|value| value.to_str())
                .unwrap_or(""),
            assessment_rows,
        ),
        index,
        output_path,
        path: path.to_path_buf(),
        stats,
    })
}

fn format_ms(value: f64) -> String {
    format!("{:.0}ms", value)
}

fn format_bytes(value: u64) -> String {
    let units = ["B", "KB", "MB", "GB"];
    let mut size = value as f64;
    let mut unit_index = 0usize;
    while size >= 1024.0 && unit_index < units.len() - 1 {
        size /= 1024.0;
        unit_index += 1;
    }
    if unit_index == 0 {
        format!("{}{}", size.round() as u64, units[unit_index])
    } else {
        format!("{:.1}{}", size, units[unit_index])
    }
}

fn main() {
    let mut convert_one_input: Option<PathBuf> = None;
    let mut convert_one_output: Option<PathBuf> = None;
    let mut convert_one_manifest: Option<PathBuf> = None;
    let mut stdio_engine = false;
    let mut threads = 2usize;
    let mut write_dir: Option<PathBuf> = None;
    let mut roots: Vec<String> = Vec::new();
    let mut args = env::args().skip(1).peekable();

    while let Some(arg) = args.next() {
        if arg == "--stdio-engine" {
            stdio_engine = true;
            continue;
        }
        if arg == "--convert-one" {
            if let Some(value) = args.next() {
                convert_one_input = Some(PathBuf::from(value));
            }
            continue;
        }
        if arg == "--out" {
            if let Some(value) = args.next() {
                convert_one_output = Some(PathBuf::from(value));
            }
            continue;
        }
        if arg == "--manifest" {
            if let Some(value) = args.next() {
                convert_one_manifest = Some(PathBuf::from(value));
            }
            continue;
        }
        if arg == "--threads" {
            if let Some(value) = args.next() {
                threads = value.parse::<usize>().unwrap_or(threads).max(1);
            }
            continue;
        }
        if arg == "--write-dir" {
            if let Some(value) = args.next() {
                write_dir = Some(PathBuf::from(value));
            }
            continue;
        }
        roots.push(arg);
    }

    if stdio_engine {
        run_stdio_engine();
        return;
    }

    if let Some(input) = convert_one_input {
        let output = convert_one_output.unwrap_or_else(|| {
            eprintln!("[rust-bench] --out is required with --convert-one");
            std::process::exit(2);
        });
        if let Some(parent) = output.parent() {
            if let Err(error) = fs::create_dir_all(parent) {
                eprintln!("[rust-bench] failed to create output dir: {}", error);
                std::process::exit(1);
            }
        }
        match convert_one(0, &input, Some(&output)) {
            Ok(result) => {
                if let Some(manifest_path) = convert_one_manifest.as_deref() {
                    if let Some(parent) = manifest_path.parent() {
                        if let Err(error) = fs::create_dir_all(parent) {
                            eprintln!("[rust-bench] failed to create manifest dir: {}", error);
                            std::process::exit(1);
                        }
                    }
                    let manifest = json!({
                        "assessment": result.assessment,
                        "cells": result.stats.cells,
                        "convertMs": result.stats.convert_ms,
                        "csvBytes": result.stats.csv_bytes,
                        "numericCells": result.stats.numeric_cells,
                        "rows": result.stats.rows,
                        "sizeBytes": result.stats.size_bytes,
                    });
                    if let Err(error) = fs::write(
                        manifest_path,
                        serde_json::to_string(&manifest).unwrap_or_default(),
                    ) {
                        eprintln!("[rust-bench] failed to write manifest: {}", error);
                        std::process::exit(1);
                    }
                }
                println!(
                    "[rust-bench convert-one] rows={} cells={} numeric={} csvBytes={} convertMs={:.3} out={}",
                    result.stats.rows,
                    result.stats.cells,
                    result.stats.numeric_cells,
                    result.stats.csv_bytes,
                    result.stats.convert_ms,
                    output.display()
                );
            }
            Err(error) => {
                eprintln!("{}: {}", error.path.display(), error.message);
                std::process::exit(1);
            }
        }
        return;
    }

    if roots.is_empty() {
        roots = DEFAULT_ROOTS
            .iter()
            .map(|value| value.to_string())
            .collect();
    }

    let mut files = Vec::<PathBuf>::new();
    for root in &roots {
        collect_excel_files(Path::new(root), &mut files);
    }
    files.sort();
    if let Some(dir) = &write_dir {
        if let Err(error) = fs::create_dir_all(dir) {
            eprintln!("[rust-bench] failed to create write dir: {}", error);
            std::process::exit(1);
        }
    }

    println!("[rust-bench] excelFiles={}", files.len());
    println!("[rust-bench] threads={}", threads);
    if let Some(dir) = &write_dir {
        println!("[rust-bench] writeDir={}", dir.display());
    }

    let queue = Arc::new(Mutex::new(VecDeque::from(
        files
            .iter()
            .cloned()
            .enumerate()
            .collect::<VecDeque<(usize, PathBuf)>>(),
    )));
    let results = Arc::new(Mutex::new(Vec::<ConvertResult>::new()));
    let failures = Arc::new(Mutex::new(Vec::<ConvertFailure>::new()));
    let completed = Arc::new(AtomicUsize::new(0));
    let started = Instant::now();

    let workers: Vec<_> = (0..threads)
        .map(|_| {
            let queue = Arc::clone(&queue);
            let results = Arc::clone(&results);
            let failures = Arc::clone(&failures);
            let completed = Arc::clone(&completed);
            let write_dir = write_dir.clone();
            let total = files.len();

            thread::spawn(move || {
                loop {
                    let next_item = {
                        let mut guard = queue.lock().expect("queue lock poisoned");
                        guard.pop_front()
                    };
                    let Some((index, path)) = next_item else {
                        return;
                    };

                    let output_path = write_dir
                        .as_deref()
                        .map(|dir| dir.join(format!("{:06}.csv", index)));
                    match convert_one(index, &path, output_path.as_deref()) {
                        Ok(result) => {
                            results.lock().expect("results lock poisoned").push(result);
                        }
                        Err(error) => {
                            failures.lock().expect("failures lock poisoned").push(error);
                        }
                    }

                    let done = completed.fetch_add(1, Ordering::SeqCst) + 1;
                    if done % 25 == 0 || done == total {
                        println!("[rust-bench] processed {}/{}", done, total);
                    }
                }
            })
        })
        .collect();

    for worker in workers {
        worker.join().expect("worker thread panicked");
    }

    let wall_ms = started.elapsed().as_secs_f64() * 1000.0;
    let mut results_guard = results.lock().expect("results lock poisoned");
    results_guard.sort_by(|a, b| b.stats.convert_ms.total_cmp(&a.stats.convert_ms));

    let failures_guard = failures.lock().expect("failures lock poisoned");
    let summary = results_guard
        .iter()
        .fold(ConvertStats::default(), |mut acc, result| {
            acc.cells += result.stats.cells;
            acc.convert_ms += result.stats.convert_ms;
            acc.csv_bytes += result.stats.csv_bytes;
            acc.numeric_cells += result.stats.numeric_cells;
            acc.rows += result.stats.rows;
            acc.size_bytes += result.stats.size_bytes;
            acc
        });

    println!();
    println!("[rust-bench summary]");
    println!(
        "files={} failed={}",
        results_guard.len(),
        failures_guard.len()
    );
    println!(
        "source={} csvText={}",
        format_bytes(summary.size_bytes),
        format_bytes(summary.csv_bytes as u64)
    );
    println!(
        "rows={} cells={} numeric={}",
        summary.rows, summary.cells, summary.numeric_cells
    );
    println!(
        "sumConvert={} wall={}",
        format_ms(summary.convert_ms),
        format_ms(wall_ms)
    );
    println!("[slowest]");
    for result in results_guard.iter().take(8) {
        println!(
            "{:>7} size={:>8} {}",
            format_ms(result.stats.convert_ms),
            format_bytes(result.stats.size_bytes),
            result.path.display()
        );
    }

    if !failures_guard.is_empty() {
        println!("[failed]");
        for failure in failures_guard.iter().take(20) {
            println!("{}: {}", failure.path.display(), failure.message);
        }
    }

    if let Some(dir) = &write_dir {
        let manifest_path = dir.join("manifest.tsv");
        let mut manifest = String::from(
            "index\tsource_path\tcsv_path\trows\tcells\tnumeric_cells\tcsv_bytes\tconvert_ms\n",
        );
        let mut by_index: Vec<&ConvertResult> = results_guard.iter().collect();
        by_index.sort_by_key(|result| result.index);
        for result in by_index {
            manifest.push_str(&format!(
                "{}\t{}\t{}\t{}\t{}\t{}\t{}\t{:.3}\n",
                result.index,
                result.path.display(),
                result
                    .output_path
                    .as_ref()
                    .map(|path| path.display().to_string())
                    .unwrap_or_default(),
                result.stats.rows,
                result.stats.cells,
                result.stats.numeric_cells,
                result.stats.csv_bytes,
                result.stats.convert_ms
            ));
        }
        if let Err(error) = fs::write(&manifest_path, manifest) {
            eprintln!("[rust-bench] failed to write manifest: {}", error);
        } else {
            println!("[rust-bench] manifest={}", manifest_path.display());
        }
    }
}
