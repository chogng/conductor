use serde::Deserialize;
use serde_json::json;
use serde_json::Value;

pub const RC_CALCULATION_VERSION: u32 = 1;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RcDeviceRequest {
    #[serde(default)]
    pub file_id: Option<String>,
    pub label: Option<String>,
    pub length: f64,
    pub series_id: Option<String>,
    pub vds: f64,
    pub width: f64,
    #[serde(default)]
    pub x: Vec<f64>,
    #[serde(default)]
    pub y: Vec<f64>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RcCalculationOptions {
    #[serde(default)]
    pub max_grid_points: Option<usize>,
    #[serde(default)]
    pub min_abs_current: Option<f64>,
    #[serde(default)]
    pub min_devices: Option<usize>,
    #[serde(default)]
    pub normalize_by_width: Option<bool>,
    #[serde(default)]
    pub selected_vg: Option<f64>,
}

#[derive(Clone)]
struct RcDevice {
    file_id: Option<String>,
    label: Option<String>,
    length: f64,
    series_id: Option<String>,
    vds: f64,
    width: f64,
    points: Vec<(f64, f64)>,
}

struct RcFitPoint {
    device_index: usize,
    length: f64,
    resistance: f64,
    width: f64,
    y_fit: f64,
}

struct LinearFit {
    intercept: f64,
    r2: f64,
    slope: f64,
}

fn sanitize_device(input: &RcDeviceRequest) -> Option<RcDevice> {
    if !input.length.is_finite() || input.length <= 0.0 {
        return None;
    }
    if !input.width.is_finite() || input.width <= 0.0 {
        return None;
    }
    if !input.vds.is_finite() || input.vds == 0.0 {
        return None;
    }
    let n = input.x.len().min(input.y.len());
    let mut raw = Vec::<(f64, f64)>::new();
    for index in 0..n {
        let x = input.x[index];
        let y = input.y[index];
        if x.is_finite() && y.is_finite() {
            raw.push((x, y));
        }
    }
    if raw.len() < 2 {
        return None;
    }
    // Collapse duplicate X samples before interpolation so the L-dependent fit
    // sees one current value per bias point.
    raw.sort_by(|left, right| left.0.total_cmp(&right.0));

    let mut points = Vec::<(f64, f64)>::new();
    let mut index = 0usize;
    while index < raw.len() {
        let x = raw[index].0;
        let mut sum = 0.0;
        let mut count = 0usize;
        while index < raw.len() && raw[index].0 == x {
            sum += raw[index].1;
            count += 1;
            index += 1;
        }
        if count > 0 {
            points.push((x, sum / count as f64));
        }
    }
    if points.len() < 2 {
        return None;
    }

    Some(RcDevice {
        file_id: input.file_id.clone(),
        label: input.label.clone(),
        length: input.length,
        series_id: input.series_id.clone(),
        vds: input.vds,
        width: input.width,
        points,
    })
}

fn interpolate_y(points: &[(f64, f64)], x_target: f64) -> Option<f64> {
    if points.len() < 2 || !x_target.is_finite() {
        return None;
    }
    let first = points.first()?.0;
    let last = points.last()?.0;
    if x_target < first || x_target > last {
        return None;
    }
    if x_target == first {
        return Some(points.first()?.1);
    }
    if x_target == last {
        return Some(points.last()?.1);
    }
    match points.binary_search_by(|point| point.0.total_cmp(&x_target)) {
        Ok(index) => Some(points[index].1),
        Err(index) => {
            if index == 0 || index >= points.len() {
                return None;
            }
            let (x0, y0) = points[index - 1];
            let (x1, y1) = points[index];
            let dx = x1 - x0;
            if !dx.is_finite() || dx == 0.0 {
                return None;
            }
            let t = ((x_target - x0) / dx).clamp(0.0, 1.0);
            Some(y0 + t * (y1 - y0))
        }
    }
}

fn common_domain(devices: &[RcDevice]) -> Option<(f64, f64)> {
    let min_x = devices
        .iter()
        .filter_map(|device| device.points.first().map(|point| point.0))
        .fold(f64::NEG_INFINITY, f64::max);
    let max_x = devices
        .iter()
        .filter_map(|device| device.points.last().map(|point| point.0))
        .fold(f64::INFINITY, f64::min);
    if min_x.is_finite() && max_x.is_finite() && min_x <= max_x {
        Some((min_x, max_x))
    } else {
        None
    }
}

fn build_grid(devices: &[RcDevice], max_points: usize) -> Vec<f64> {
    let Some((min_x, max_x)) = common_domain(devices) else {
        return Vec::new();
    };
    let mut values = devices
        .iter()
        .flat_map(|device| device.points.iter().map(|point| point.0))
        .filter(|value| value.is_finite() && *value >= min_x && *value <= max_x)
        .collect::<Vec<_>>();
    values.sort_by(|left, right| left.total_cmp(right));
    values.dedup_by(|left, right| (*left - *right).abs() <= 1e-12);
    if values.len() <= max_points.max(2) {
        return values;
    }
    // Sample the shared VG domain rather than every raw point to keep the fit
    // grid stable when devices were recorded with slightly different sweeps.
    let target = max_points.max(2);
    (0..target)
        .map(|index| {
            let pos = (index as f64) * ((values.len() - 1) as f64) / ((target - 1) as f64);
            values[pos.round() as usize]
        })
        .collect()
}

fn linear_fit(points: &[RcFitPoint]) -> Option<LinearFit> {
    if points.len() < 2 {
        return None;
    }
    let n = points.len() as f64;
    let mut sx = 0.0;
    let mut sy = 0.0;
    let mut sxx = 0.0;
    let mut sxy = 0.0;
    for point in points {
        sx += point.length;
        sy += point.y_fit;
        sxx += point.length * point.length;
        sxy += point.length * point.y_fit;
    }
    let denom = n * sxx - sx * sx;
    if !denom.is_finite() || denom == 0.0 {
        return None;
    }
    let slope = (n * sxy - sx * sy) / denom;
    let intercept = (sy - slope * sx) / n;
    if !slope.is_finite() || !intercept.is_finite() {
        return None;
    }
    let mean_y = sy / n;
    let mut ss_res = 0.0;
    let mut ss_tot = 0.0;
    for point in points {
        let predicted = slope * point.length + intercept;
        ss_res += (point.y_fit - predicted).powi(2);
        ss_tot += (point.y_fit - mean_y).powi(2);
    }
    let r2 = if ss_tot > 0.0 {
        1.0 - ss_res / ss_tot
    } else {
        1.0
    };
    Some(LinearFit {
        intercept,
        r2,
        slope,
    })
}

fn median_width(points: &[RcFitPoint]) -> Option<f64> {
    let mut values = points
        .iter()
        .map(|point| point.width)
        .filter(|value| value.is_finite() && *value > 0.0)
        .collect::<Vec<_>>();
    if values.is_empty() {
        return None;
    }
    values.sort_by(|left, right| left.total_cmp(right));
    let mid = values.len() / 2;
    if values.len() % 2 == 0 {
        Some((values[mid - 1] + values[mid]) / 2.0)
    } else {
        Some(values[mid])
    }
}

fn selected_summary(curve: &[Value], selected_vg: Option<f64>) -> Value {
    if curve.is_empty() {
        return json!(null);
    }
    let pick = if let Some(target) = selected_vg.filter(|value| value.is_finite()) {
        curve.iter().min_by(|left, right| {
            let lx = left["vg"].as_f64().unwrap_or(f64::INFINITY);
            let rx = right["vg"].as_f64().unwrap_or(f64::INFINITY);
            (lx - target).abs().total_cmp(&(rx - target).abs())
        })
    } else {
        curve.iter().max_by(|left, right| {
            let ln = left["n"].as_u64().unwrap_or(0);
            let rn = right["n"].as_u64().unwrap_or(0);
            let lr2 = left["r2"].as_f64().unwrap_or(f64::NEG_INFINITY);
            let rr2 = right["r2"].as_f64().unwrap_or(f64::NEG_INFINITY);
            ln.cmp(&rn).then_with(|| lr2.total_cmp(&rr2))
        })
    };
    pick.cloned().unwrap_or_else(|| json!(null))
}

pub fn calculate_rc(devices_raw: &[RcDeviceRequest], options: Option<&RcCalculationOptions>) -> Value {
    let min_devices = options
        .and_then(|opts| opts.min_devices)
        .unwrap_or(3)
        .max(2);
    let max_grid_points = options
        .and_then(|opts| opts.max_grid_points)
        .unwrap_or(240)
        .clamp(2, 2000);
    let min_abs_current = options
        .and_then(|opts| opts.min_abs_current)
        .filter(|value| value.is_finite() && *value > 0.0)
        .unwrap_or(0.0);
    let normalize_by_width = options
        .and_then(|opts| opts.normalize_by_width)
        .unwrap_or(true);
    let devices = devices_raw
        .iter()
        .filter_map(sanitize_device)
        .collect::<Vec<_>>();
    let grid = build_grid(&devices, max_grid_points);
    let mut curve = Vec::<Value>::new();

    for vg in grid.iter().copied() {
        let fit_points = devices
            .iter()
            .enumerate()
            .filter_map(|(device_index, device)| {
                let id = interpolate_y(&device.points, vg)?;
                let abs_id = id.abs();
                if !abs_id.is_finite() || abs_id <= min_abs_current {
                    return None;
                }
                let resistance = (device.vds / id).abs();
                if !resistance.is_finite() {
                    return None;
                }
                Some(RcFitPoint {
                    device_index,
                    length: device.length,
                    resistance,
                    width: device.width,
                    // Width-normalize before the linear fit when requested; this
                    // makes the intercept directly comparable across devices.
                    y_fit: if normalize_by_width {
                        resistance * device.width
                    } else {
                        resistance
                    },
                })
            })
            .collect::<Vec<_>>();
        if fit_points.len() < min_devices {
            continue;
        }
        let Some(fit) = linear_fit(&fit_points) else {
            continue;
        };
        let width_ref = median_width(&fit_points);
        let mut warnings = Vec::<&str>::new();
        if fit.intercept < 0.0 {
            warnings.push("negative_intercept");
        }
        if fit.r2.is_finite() && fit.r2 < 0.98 {
            warnings.push("low_r2");
        }
        if fit.slope < 0.0 {
            warnings.push("negative_slope");
        }
        let rc = if normalize_by_width {
            width_ref.map(|width| fit.intercept / 2.0 / width)
        } else {
            Some(fit.intercept / 2.0)
        };
        let rcw = if normalize_by_width {
            Some(fit.intercept / 2.0)
        } else {
            width_ref.map(|width| fit.intercept / 2.0 * width)
        };
        curve.push(json!({
            "devicePoints": fit_points.iter().map(|point| json!({
                "deviceIndex": point.device_index,
                "length": point.length,
                "resistance": point.resistance,
                "width": point.width,
                "yFit": point.y_fit,
            })).collect::<Vec<_>>(),
            "intercept": fit.intercept,
            "n": fit_points.len(),
            "normalizedByWidth": normalize_by_width,
            "r2": fit.r2,
            "rc": rc,
            "rcw": rcw,
            "rSheet": fit.slope,
            "slope": fit.slope,
            "vg": vg,
            "warnings": warnings,
            "widthRef": width_ref,
        }));
    }

    json!({
        "curve": curve,
        "deviceCount": devices.len(),
        "devices": devices.iter().enumerate().map(|(index, device)| json!({
            "fileId": device.file_id,
            "index": index,
            "label": device.label,
            "length": device.length,
            "seriesId": device.series_id,
            "vds": device.vds,
            "width": device.width,
        })).collect::<Vec<_>>(),
        "gridCount": grid.len(),
        "minDevices": min_devices,
        "summary": selected_summary(&curve, options.and_then(|opts| opts.selected_vg)),
        "version": RC_CALCULATION_VERSION,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_device(length: f64, width: f64, rcw: f64, rsh: f64) -> RcDeviceRequest {
        let x = vec![0.0, 1.0, 2.0];
        let y = x
            .iter()
            .map(|_| {
                let r_total = (2.0 * rcw + rsh * length) / width;
                0.1 / r_total
            })
            .collect::<Vec<_>>();
        RcDeviceRequest {
            file_id: None,
            label: Some(format!("L={}", length)),
            length,
            series_id: None,
            vds: 0.1,
            width,
            x,
            y,
        }
    }

    #[test]
    fn rc_width_normalized_fit_recovers_intercept() {
        let devices = vec![
            make_device(1.0, 10.0, 50.0, 100.0),
            make_device(2.0, 10.0, 50.0, 100.0),
            make_device(4.0, 10.0, 50.0, 100.0),
        ];
        let options = RcCalculationOptions {
            max_grid_points: Some(3),
            min_abs_current: Some(0.0),
            min_devices: Some(3),
            normalize_by_width: Some(true),
            selected_vg: Some(1.0),
        };

        let result = calculate_rc(&devices, Some(&options));

        assert_eq!(result["version"], RC_CALCULATION_VERSION);
        assert!((result["summary"]["rcw"].as_f64().unwrap() - 50.0).abs() < 1e-9);
        assert!((result["summary"]["rSheet"].as_f64().unwrap() - 100.0).abs() < 1e-9);
        assert_eq!(result["summary"]["n"], 3);
    }

    #[test]
    fn rc_skips_points_below_current_floor() {
        let mut devices = vec![
            make_device(1.0, 10.0, 50.0, 100.0),
            make_device(2.0, 10.0, 50.0, 100.0),
            make_device(4.0, 10.0, 50.0, 100.0),
        ];
        devices[0].y = vec![1e-15, 1e-15, 1e-15];
        let options = RcCalculationOptions {
            max_grid_points: Some(3),
            min_abs_current: Some(1e-12),
            min_devices: Some(3),
            normalize_by_width: Some(true),
            selected_vg: None,
        };

        let result = calculate_rc(&devices, Some(&options));

        assert_eq!(result["curve"].as_array().unwrap().len(), 0);
    }
}
