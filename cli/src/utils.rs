use crate::dataset::EngineDataset;
use serde_json::Value;

pub fn json_number(value: &Value) -> Option<f64> {
    match value {
        Value::Number(number) => number.as_f64(),
        Value::String(text) => text.trim().parse::<f64>().ok(),
        _ => None,
    }
}

pub fn json_usize(value: Option<&Value>) -> Option<usize> {
    let value = value?;
    let number = json_number(value)?;
    if !number.is_finite() || number < 0.0 {
        return None;
    }
    let rounded = number.round();
    if (number - rounded).abs() > f64::EPSILON {
        return None;
    }
    Some(rounded as usize)
}

pub fn json_string(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(text)) => text.trim().to_string(),
        Some(Value::Number(number)) => number.to_string(),
        Some(Value::Bool(value)) => value.to_string(),
        _ => String::new(),
    }
}

pub fn json_usize_array(value: Option<&Value>) -> Vec<usize> {
    match value {
        Some(Value::Array(values)) => values
            .iter()
            .filter_map(|value| json_usize(Some(value)))
            .collect(),
        _ => Vec::new(),
    }
}

pub fn excel_column_label(index: usize) -> String {
    let mut n = index + 1;
    let mut label = String::new();
    while n > 0 {
        let rem = (n - 1) % 26;
        label.insert(0, (b'A' + rem as u8) as char);
        n = (n - 1) / 26;
    }
    label
}

pub fn parse_number_strict(raw: Option<&String>) -> Option<f64> {
    let text = raw?.trim();
    if text.is_empty() {
        return None;
    }
    let number = text.parse::<f64>().ok()?;
    number.is_finite().then_some(number)
}

pub fn json_cell_ref(value: Option<&Value>) -> Option<(usize, usize)> {
    let object = value?.as_object()?;
    let row = json_usize(object.get("rowIndex"))?;
    let col = json_usize(object.get("colIndex"))?;
    Some((row, col))
}

pub fn read_cell_number(
    dataset: &EngineDataset,
    row_index: usize,
    col_index: usize,
) -> Option<f64> {
    dataset.cell_number(row_index, col_index)
}

pub fn normalize_cell_text(raw: &str) -> String {
    clean_cell_text(raw).to_ascii_lowercase()
}

pub fn clean_cell_text(raw: &str) -> String {
    raw.trim().trim_matches('\u{feff}').trim().to_string()
}

pub fn cell_number(dataset: &EngineDataset, row_index: usize, col_index: usize) -> Option<f64> {
    dataset.cell_number(row_index, col_index)
}

pub fn approx_equal(left: f64, right: f64, tolerance: f64) -> bool {
    (left - right).abs() <= tolerance
}

pub fn pad_domain(min_raw: f64, max_raw: f64) -> [f64; 2] {
    let min = if min_raw.is_finite() { min_raw } else { 0.0 };
    let max = if max_raw.is_finite() { max_raw } else { 1.0 };
    let lo = min.min(max);
    let hi = min.max(max);
    if (lo - hi).abs() <= f64::EPSILON {
        let pad = if lo == 0.0 { 1.0 } else { lo.abs() * 0.05 };
        return [lo - pad, hi + pad];
    }
    let span = hi - lo;
    let pad = span * 0.05;
    [lo - pad, hi + pad]
}

pub fn append_axis_unit(label_raw: &str, unit_raw: &str) -> String {
    let label = label_raw.trim();
    let unit = unit_raw.trim();
    if unit.is_empty() {
        return label.to_string();
    }
    if label.is_empty() {
        return unit.to_string();
    }
    if label == unit {
        return label.to_string();
    }
    format!("{} ({})", label, unit)
}
