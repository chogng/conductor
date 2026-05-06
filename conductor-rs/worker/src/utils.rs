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

pub fn normalize_header_compact(raw: &str) -> String {
    clean_cell_text(raw)
        .to_ascii_lowercase()
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .collect()
}

pub fn cell_number(dataset: &EngineDataset, row_index: usize, col_index: usize) -> Option<f64> {
    dataset.cell_number(row_index, col_index)
}

pub fn column_has_numeric_rows(
    dataset: &EngineDataset,
    data_start_row_index: usize,
    col_index: usize,
    minimum_count: usize,
) -> bool {
    dataset.has_numeric_rows(data_start_row_index, col_index, minimum_count)
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

pub fn split_file_name_match_input(value: &str) -> Vec<String> {
    value
        .split(|ch| ch == ',' || ch == ';' || ch == '\n')
        .map(|token| token.trim().to_ascii_lowercase())
        .filter(|token| !token.is_empty())
        .collect()
}

pub fn normalize_file_name_field_separators(value: &str) -> String {
    let raw = value.replace('\r', "").replace('\n', "").replace('\t', " ");
    let mut result = String::new();
    for ch in raw.chars() {
        if !result.contains(ch) {
            result.push(ch);
        }
    }
    if result.is_empty() {
        "_- .()[]{}".to_string()
    } else {
        result
    }
}

pub fn match_file_name_against_pattern_tokens(
    file_name: &str,
    pattern_tokens: &[String],
    separators: &str,
) -> bool {
    if pattern_tokens.is_empty() {
        return false;
    }
    let candidates = collect_file_name_candidates(file_name, separators);
    let compact_candidates: Vec<String> = candidates
        .iter()
        .map(|candidate| compact_match_key(candidate))
        .filter(|candidate| !candidate.is_empty())
        .collect();

    pattern_tokens.iter().any(|pattern| {
        let token = pattern.trim().to_ascii_lowercase();
        if token.is_empty() {
            return false;
        }
        if candidates.iter().any(|candidate| candidate == &token) {
            return true;
        }
        let compact_token = compact_match_key(&token);
        if compact_token.is_empty() {
            return false;
        }
        compact_candidates.iter().any(|candidate| {
            candidate == &compact_token
                || (candidate.starts_with(&compact_token) && compact_token.len() >= 5)
                || (compact_token.starts_with(candidate) && candidate.len() >= 5)
        })
    })
}

fn strip_file_extension(file_name: &str) -> String {
    let base_name = file_name
        .rsplit_once(['\\', '/'])
        .map(|(_, tail)| tail)
        .unwrap_or(file_name);
    if let Some((stem, ext)) = base_name.rsplit_once('.') {
        let valid_ext = ext.len() >= 1
            && ext.len() <= 10
            && ext
                .chars()
                .next()
                .map(|ch| ch.is_ascii_alphabetic())
                .unwrap_or(false)
            && ext.chars().all(|ch| ch.is_ascii_alphanumeric());
        if valid_ext {
            return stem.to_string();
        }
    }
    base_name.to_string()
}

fn trim_match_token(value: &str) -> String {
    value
        .trim_matches(|ch: char| !ch.is_alphanumeric())
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn compact_match_key(value: &str) -> String {
    value
        .chars()
        .filter(|ch| ch.is_alphanumeric())
        .flat_map(|ch| ch.to_lowercase())
        .collect()
}

fn push_file_name_candidate(candidates: &mut Vec<String>, value: String) {
    let normalized = value.trim().to_ascii_lowercase();
    if normalized.is_empty() || candidates.iter().any(|entry| entry == &normalized) {
        return;
    }
    candidates.push(normalized);
}

fn collect_file_name_candidates(file_name: &str, separators: &str) -> Vec<String> {
    let base_name = strip_file_extension(file_name);
    let mut candidates = Vec::<String>::new();
    push_file_name_candidate(&mut candidates, trim_match_token(&base_name));

    for raw_chunk in base_name.split(|ch| ",[]{};".contains(ch)) {
        for sub_chunk in raw_chunk.split('_') {
            let trimmed = trim_match_token(sub_chunk);
            if !trimmed.is_empty() {
                push_file_name_candidate(&mut candidates, trimmed);
            }
        }
    }

    for token in base_name.split(|ch| separators.contains(ch)) {
        let trimmed = trim_match_token(token);
        if trimmed.is_empty() {
            continue;
        }
        push_file_name_candidate(&mut candidates, trimmed.clone());

        let mut boundary_token = String::new();
        let mut previous_kind: Option<u8> = None;
        for ch in trimmed.chars() {
            let kind = if ch.is_ascii_digit() {
                1
            } else if ch.is_ascii_alphabetic() {
                2
            } else {
                3
            };
            if let Some(prev) = previous_kind {
                if prev != kind && !boundary_token.is_empty() {
                    push_file_name_candidate(&mut candidates, boundary_token.clone());
                    boundary_token.clear();
                }
            }
            boundary_token.push(ch);
            previous_kind = Some(kind);
        }
        push_file_name_candidate(&mut candidates, boundary_token);
    }

    candidates
}
