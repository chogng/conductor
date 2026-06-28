use serde_json::Value;
use serde_json::json;
use std::cell::Ref;
use std::cell::RefCell;
use std::collections::HashMap;

#[derive(Clone)]
struct TableModelSeedDataset {
    rows: Vec<Vec<String>>,
    numeric_column_cache: RefCell<HashMap<usize, Vec<Option<f64>>>>,
}

impl TableModelSeedDataset {
    fn from_rows(rows: Vec<Vec<String>>) -> Self {
        Self {
            rows,
            numeric_column_cache: RefCell::new(HashMap::new()),
        }
    }

    fn cell_number(&self, row_index: usize, col_index: usize) -> Option<f64> {
        self.ensure_numeric_column(col_index);
        self.numeric_column_cache
            .borrow()
            .get(&col_index)
            .and_then(|column| column.get(row_index))
            .copied()
            .flatten()
    }

    fn column_number_values_ref(&self, col_index: usize) -> Ref<'_, Vec<Option<f64>>> {
        self.ensure_numeric_column(col_index);
        Ref::map(self.numeric_column_cache.borrow(), |cache| {
            cache
                .get(&col_index)
                .expect("numeric column cache should exist after ensure_numeric_column")
        })
    }

    fn ensure_numeric_column(&self, col_index: usize) {
        if self.numeric_column_cache.borrow().contains_key(&col_index) {
            return;
        }

        let values = self
            .rows
            .iter()
            .map(|row| {
                row.get(col_index)
                    .and_then(|value| parse_number_strict(value))
            })
            .collect::<Vec<_>>();

        self.numeric_column_cache
            .borrow_mut()
            .entry(col_index)
            .or_insert(values);
    }
}

#[derive(Default)]
struct AutoMetadata {
    data_name_columns: Vec<String>,
    is_stripped_channel_sweep: bool,
    notes_text: String,
    setup_title: String,
    stripped_current_log_span_ch1: Option<f64>,
    stripped_current_log_span_ch2: Option<f64>,
    stripped_fixed_voltage_magnitude: Option<f64>,
    stripped_sweep_voltage_axis: Option<&'static str>,
    stripped_sweep_voltage_span: Option<f64>,
    var1_name: String,
    var2_name: String,
    x_axis_data: String,
}

struct RoleEvidence {
    role: &'static str,
    source: &'static str,
    weight: i32,
}

struct NonIvCurveEvidence {
    confidence: &'static str,
    curve_type: &'static str,
    source: &'static str,
}

#[derive(Default)]
struct StrippedSweepMetadata {
    current_log_span_ch1: Option<f64>,
    current_log_span_ch2: Option<f64>,
    fixed_voltage_magnitude: Option<f64>,
    sweep_voltage_axis: Option<&'static str>,
    sweep_voltage_span: Option<f64>,
}

pub fn build_import_table_model_seed(file_name: &str, rows: Vec<Vec<String>>) -> Value {
    let dataset = TableModelSeedDataset::from_rows(rows);
    let header_row_index = find_header_row_index(&dataset);
    let headers = row_trimmed(&dataset, header_row_index);
    let metadata = extract_auto_metadata(&dataset);
    let (curve_type, x_axis_role, source, confidence, needs_review) =
        classify_auto_curve(file_name, &metadata, &headers);
    let curve_type_label = match (curve_type.as_str(), x_axis_role) {
        ("transfer", Some("vg")) => Value::String("transfer (vg)".to_string()),
        ("output", Some("vd")) => Value::String("output (vd)".to_string()),
        ("unknown", _) => Value::String("unknown".to_string()),
        ("transfer" | "output" | "pv" | "cv" | "cf", _) => Value::String(curve_type.clone()),
        _ => Value::Null,
    };
    let x_axis_role_source = if curve_type_label == Value::String("unknown".to_string()) {
        Value::Null
    } else {
        json!(source)
    };
    let curve_type_reasons =
        if source == "shape" && curve_type_label == Value::String("output (vd)".to_string()) {
            vec!["Shape evidence matches output-style Id-Vd behavior.".to_string()]
        } else {
            Vec::<String>::new()
        };

    json!({
        "curveFamily": curve_family(&curve_type),
        "curveType": curve_type_label,
        "curveTypeConfidence": confidence,
        "curveTypeNeedsReview": needs_review,
        "curveTypeReasons": curve_type_reasons,
        "ivMode": iv_mode(&curve_type),
        "xAxisRole": x_axis_role,
        "xAxisRoleSource": x_axis_role_source,
    })
}

fn curve_family(curve_type: &str) -> &'static str {
    match curve_type {
        "transfer" | "output" => "iv",
        "cv" => "cv",
        "cf" => "cf",
        "pv" => "pv",
        _ => "unknown",
    }
}

fn iv_mode(curve_type: &str) -> Value {
    match curve_type {
        "transfer" | "output" => json!(curve_type),
        _ => Value::Null,
    }
}

pub fn detect_axis_role_text(value: &str) -> Option<&'static str> {
    let text = clean_cell_text(value).to_ascii_lowercase();
    let compact = normalize_header_compact(value);
    let has_vg = text
        .split(|ch: char| !ch.is_ascii_alphanumeric())
        .any(|token| matches!(token, "vg" | "vgs" | "gate" | "tran" | "transfer"))
        || compact == "tran"
        || compact.starts_with("tran")
        || compact.contains("gatevoltage")
        || compact.contains("transfercurve")
        || compact.contains("transfercurves")
        || compact.contains("transfercharacteristic")
        || compact.contains("transfercharacteristics")
        || compact == "var1";
    let has_vd = text
        .split(|ch: char| !ch.is_ascii_alphanumeric())
        .any(|token| matches!(token, "vd" | "vds" | "drain" | "out" | "output"))
        || compact.starts_with("output")
        || compact.contains("drainvoltage")
        || compact.contains("outputcurve")
        || compact.contains("outputcurves")
        || compact.contains("outputcharacteristic")
        || compact.contains("outputcharacteristics");

    match (has_vg, has_vd) {
        (true, false) => Some("vg"),
        (false, true) => Some("vd"),
        _ => None,
    }
}

fn row_trimmed(dataset: &TableModelSeedDataset, row_index: usize) -> Vec<String> {
    dataset
        .rows
        .get(row_index)
        .map(|row| row.iter().map(|value| clean_cell_text(value)).collect())
        .unwrap_or_default()
}

fn find_header_row_index(dataset: &TableModelSeedDataset) -> usize {
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
                    .filter(|cell| parse_number_strict(cell).is_some())
                    .count()
            })
            .unwrap_or(0);
        if numeric_count >= 2 {
            return row_index;
        }
    }

    0
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

fn compute_quantile(values: &[f64], quantile: f64) -> Option<f64> {
    let mut sorted = values
        .iter()
        .copied()
        .filter(|value| value.is_finite())
        .collect::<Vec<_>>();
    if sorted.is_empty() {
        return None;
    }
    sorted.sort_by(|left, right| left.total_cmp(right));
    if sorted.len() == 1 {
        return sorted.first().copied();
    }
    let position = (quantile.clamp(0.0, 1.0) * (sorted.len() - 1) as f64)
        .clamp(0.0, (sorted.len() - 1) as f64);
    let lower_index = position.floor() as usize;
    let upper_index = position.ceil() as usize;
    if lower_index == upper_index {
        return sorted.get(lower_index).copied();
    }
    let ratio = position - lower_index as f64;
    Some(sorted[lower_index] + (sorted[upper_index] - sorted[lower_index]) * ratio)
}

fn compute_robust_log_span(values: &[f64]) -> Option<f64> {
    let magnitudes = values
        .iter()
        .copied()
        .map(f64::abs)
        .filter(|value| value.is_finite())
        .collect::<Vec<_>>();
    if magnitudes.len() < 3 {
        return None;
    }
    let low = compute_quantile(&magnitudes, 0.15)?;
    let high = compute_quantile(&magnitudes, 0.85)?;
    if !low.is_finite() || !high.is_finite() {
        return None;
    }
    Some(((high.max(0.0) + 1e-30) / (low.max(0.0) + 1e-30)).log10())
}

fn collect_column_numbers(
    dataset: &TableModelSeedDataset,
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

fn detect_first_group_length(
    dataset: &TableModelSeedDataset,
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
        point_col_index.and_then(|index| dataset.cell_number(data_start_row_index, index));
    let mut count = 0usize;
    let mut previous_point: Option<f64> = None;
    for row_index in data_start_row_index..dataset.rows.len() {
        let row = &dataset.rows[row_index];
        let current_var2 = var2_col_index
            .and_then(|index| row.get(index))
            .map(|value| clean_cell_text(value))
            .unwrap_or_default();
        let current_point = point_col_index.and_then(|index| dataset.cell_number(row_index, index));
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

fn collect_stripped_sweep_metadata(
    dataset: &TableModelSeedDataset,
    header_row_index: usize,
) -> StrippedSweepMetadata {
    let headers = row_trimmed(dataset, header_row_index);
    let ch1_voltage_col = headers.iter().position(|entry| entry == "CH1 Voltage");
    let ch2_voltage_col = headers.iter().position(|entry| entry == "CH2 Voltage");
    let (Some(ch1_voltage_col), Some(ch2_voltage_col)) = (ch1_voltage_col, ch2_voltage_col) else {
        return StrippedSweepMetadata::default();
    };
    let data_start = header_row_index + 1;
    let point_col = headers.iter().position(|entry| entry == "Point");
    let var2_col = headers.iter().position(|entry| entry == "VAR2");
    let ch1_current_col = headers.iter().position(|entry| entry == "CH1 Current");
    let ch2_current_col = headers.iter().position(|entry| entry == "CH2 Current");
    let first_group_len =
        detect_first_group_length(dataset, data_start, point_col, var2_col).unwrap_or(2048);
    let ch1_values = collect_column_numbers(dataset, data_start, ch1_voltage_col, first_group_len);
    let ch2_values = collect_column_numbers(dataset, data_start, ch2_voltage_col, first_group_len);
    let ch1_currents = ch1_current_col
        .map(|col| collect_column_numbers(dataset, data_start, col, first_group_len))
        .unwrap_or_default();
    let ch2_currents = ch2_current_col
        .map(|col| collect_column_numbers(dataset, data_start, col, first_group_len))
        .unwrap_or_default();
    let current_log_span_ch1 = compute_robust_log_span(&ch1_currents);
    let current_log_span_ch2 = compute_robust_log_span(&ch2_currents);
    let ch1_span = numeric_span(&ch1_values).unwrap_or(0.0).abs();
    let ch2_span = numeric_span(&ch2_values).unwrap_or(0.0).abs();

    let stable_tolerance = 1e-9_f64.max(ch1_span.max(ch2_span) * 1e-4);
    let axis = if ch1_span > stable_tolerance && ch2_span <= stable_tolerance {
        Some("ch1")
    } else if ch2_span > stable_tolerance && ch1_span <= stable_tolerance {
        Some("ch2")
    } else {
        None
    };
    let fixed_values = match axis {
        Some("ch1") => &ch2_values,
        Some("ch2") => &ch1_values,
        _ => {
            return StrippedSweepMetadata {
                current_log_span_ch1,
                current_log_span_ch2,
                sweep_voltage_axis: axis,
                ..StrippedSweepMetadata::default()
            };
        }
    };
    let fixed_voltage_magnitude = compute_quantile(
        &fixed_values
            .iter()
            .copied()
            .map(f64::abs)
            .collect::<Vec<_>>(),
        0.5,
    );
    StrippedSweepMetadata {
        current_log_span_ch1,
        current_log_span_ch2,
        fixed_voltage_magnitude,
        sweep_voltage_axis: axis,
        sweep_voltage_span: match axis {
            Some("ch1") => Some(ch1_span),
            Some("ch2") => Some(ch2_span),
            _ => None,
        },
    }
}

fn extract_auto_metadata(dataset: &TableModelSeedDataset) -> AutoMetadata {
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
                        .filter(|cell| parse_number_strict(cell).is_some())
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
        let stripped = collect_stripped_sweep_metadata(dataset, header_row_index);
        metadata.stripped_current_log_span_ch1 = stripped.current_log_span_ch1;
        metadata.stripped_current_log_span_ch2 = stripped.current_log_span_ch2;
        metadata.stripped_fixed_voltage_magnitude = stripped.fixed_voltage_magnitude;
        metadata.stripped_sweep_voltage_axis = stripped.sweep_voltage_axis;
        metadata.stripped_sweep_voltage_span = stripped.sweep_voltage_span;
    }
    metadata
}

fn push_role_evidence(
    evidence: &mut Vec<RoleEvidence>,
    role: Option<&'static str>,
    weight: i32,
    source: &'static str,
) {
    if let Some(role) = role {
        evidence.push(RoleEvidence {
            role,
            source,
            weight,
        });
    }
}

fn resolve_role_source(evidence: &[RoleEvidence]) -> &'static str {
    if evidence.iter().any(|entry| entry.source == "metadata") {
        "metadata"
    } else if evidence.iter().any(|entry| entry.source == "filename") {
        "filename"
    } else if evidence.iter().any(|entry| entry.source == "shape") {
        "shape"
    } else {
        "metadata"
    }
}

fn has_fast_iv_or_ivt_hint(value: &str) -> bool {
    let text = clean_cell_text(value).to_ascii_lowercase();
    normalize_header_compact(value).contains("fastiv")
        || text
            .split(|ch: char| !ch.is_ascii_alphanumeric())
            .any(|token| token == "ivt")
}

fn is_curve_code_separator(ch: char) -> bool {
    ch.is_ascii_whitespace()
        || matches!(
            ch,
            '_' | '-' | '.' | '/' | '(' | ')' | '[' | ']' | '{' | '}' | ':' | '='
        )
}

fn has_semantic_token(value: &str, expected: &str) -> bool {
    let text = clean_cell_text(value).to_ascii_lowercase();
    text.split(|ch: char| !ch.is_ascii_alphanumeric())
        .any(|token| token == expected)
}

fn has_curve_code_hint(value: &str, first: char, second: char) -> bool {
    let chars = clean_cell_text(value)
        .to_ascii_lowercase()
        .chars()
        .collect::<Vec<_>>();
    for index in 0..chars.len() {
        if chars[index] != first {
            continue;
        }
        if index > 0 && chars[index - 1].is_ascii_alphanumeric() {
            continue;
        }

        let mut next_index = index + 1;
        while next_index < chars.len() && is_curve_code_separator(chars[next_index]) {
            next_index += 1;
        }
        if next_index >= chars.len() || chars[next_index] != second {
            continue;
        }

        let after_index = next_index + 1;
        if after_index >= chars.len() || !chars[after_index].is_ascii_alphanumeric() {
            return true;
        }
    }

    false
}

fn has_cv_hint(value: &str) -> bool {
    has_curve_code_hint(value, 'c', 'v')
        || normalize_header_compact(value).contains("capacitancevoltage")
}

fn has_cf_hint(value: &str) -> bool {
    has_curve_code_hint(value, 'c', 'f')
        || normalize_header_compact(value).contains("capacitancefrequency")
}

fn has_pv_hint(value: &str) -> bool {
    has_curve_code_hint(value, 'p', 'v') || normalize_header_compact(value).contains("pulsevoltage")
}

fn has_capacitance_hint(value: &str) -> bool {
    let compact = normalize_header_compact(value);
    compact.contains("capacitance")
        || has_semantic_token(value, "cp")
        || has_semantic_token(value, "cs")
        || has_semantic_token(value, "cap")
        || (has_semantic_token(value, "c") && (has_cv_hint(value) || has_cf_hint(value)))
}

fn has_frequency_hint(value: &str) -> bool {
    let compact = normalize_header_compact(value);
    has_cf_hint(value)
        || compact.contains("freq")
        || compact.contains("frequency")
        || compact.contains("hz")
}

fn has_voltage_hint(value: &str) -> bool {
    let compact = normalize_header_compact(value);
    has_cv_hint(value)
        || has_semantic_token(value, "vp")
        || compact.contains("voltage")
        || compact.contains("bias")
}

fn detect_non_iv_curve(
    file_name: &str,
    metadata: &AutoMetadata,
    headers: &[String],
) -> Option<NonIvCurveEvidence> {
    let mut metadata_text = vec![metadata.setup_title.clone(), metadata.x_axis_data.clone()];
    metadata_text.extend(metadata.data_name_columns.clone());
    let metadata_compact = metadata_text
        .iter()
        .map(|value| normalize_header_compact(value))
        .collect::<Vec<_>>();
    let file_compact = normalize_header_compact(file_name);

    let metadata_has_pulse_hint = metadata_text
        .iter()
        .any(|value| has_fast_iv_or_ivt_hint(value))
        || metadata_compact
            .iter()
            .any(|value| matches!(value.as_str(), "vp" | "in" | "ipt"));
    // Exact vp/in/ipt tokens are pulse hints only when they come from metadata
    // such as DataName; ordinary two-column Cp-vp headers are CV data.
    let header_has_pulse_hint = headers.iter().any(|value| has_fast_iv_or_ivt_hint(value));
    let file_has_pulse_hint = has_pv_hint(file_name) || has_fast_iv_or_ivt_hint(file_name);
    if metadata_has_pulse_hint || header_has_pulse_hint || file_has_pulse_hint {
        let source = if metadata_has_pulse_hint {
            "metadata"
        } else if header_has_pulse_hint {
            "label"
        } else {
            "filename"
        };
        return Some(NonIvCurveEvidence {
            confidence: if source == "filename" {
                "low"
            } else {
                "medium"
            },
            curve_type: "pv",
            source,
        });
    }

    let has_file_cv_hint = has_cv_hint(file_name) && !file_compact.contains("svc");
    let has_file_cf_hint = has_frequency_hint(file_name);
    let has_capacitance = has_capacitance_hint(file_name)
        || metadata_text
            .iter()
            .any(|value| has_capacitance_hint(value))
        || headers.iter().any(|value| has_capacitance_hint(value));
    if !has_capacitance && !has_file_cv_hint && !has_file_cf_hint {
        return None;
    }

    if has_file_cv_hint {
        return Some(NonIvCurveEvidence {
            confidence: "medium",
            curve_type: "cv",
            source: "filename",
        });
    }

    let metadata_has_frequency = metadata_text.iter().any(|value| has_frequency_hint(value));
    let header_has_frequency = headers.iter().any(|value| has_frequency_hint(value));
    if has_file_cf_hint || metadata_has_frequency || header_has_frequency {
        let source = if has_file_cf_hint {
            "filename"
        } else if metadata_has_frequency {
            "metadata"
        } else {
            "label"
        };
        return Some(NonIvCurveEvidence {
            confidence: "medium",
            curve_type: "cf",
            source,
        });
    }

    let metadata_has_voltage = metadata_text.iter().any(|value| has_voltage_hint(value));
    let header_has_voltage = headers.iter().any(|value| has_voltage_hint(value));
    if metadata_has_voltage || header_has_voltage {
        return Some(NonIvCurveEvidence {
            confidence: "medium",
            curve_type: "cv",
            source: if metadata_has_voltage {
                "metadata"
            } else {
                "label"
            },
        });
    }

    None
}

fn classify_auto_curve(
    file_name: &str,
    metadata: &AutoMetadata,
    headers: &[String],
) -> (String, Option<&'static str>, &'static str, String, bool) {
    let non_iv_curve = detect_non_iv_curve(file_name, metadata, headers);

    let mut evidence = Vec::<RoleEvidence>::new();
    // Direct metadata outweighs filenames, which often include loose batch labels.
    push_role_evidence(
        &mut evidence,
        detect_axis_role_text(&metadata.x_axis_data),
        18,
        "metadata",
    );
    push_role_evidence(
        &mut evidence,
        detect_axis_role_text(&metadata.var1_name),
        16,
        "metadata",
    );
    push_role_evidence(
        &mut evidence,
        detect_axis_role_text(
            metadata
                .data_name_columns
                .first()
                .map(String::as_str)
                .unwrap_or(""),
        ),
        14,
        "metadata",
    );
    push_role_evidence(
        &mut evidence,
        detect_axis_role_text(&metadata.setup_title),
        6,
        "metadata",
    );
    let file_name_role = detect_axis_role_text(file_name);
    push_role_evidence(&mut evidence, file_name_role, 2, "filename");

    // Stripped instrument exports expose generic CH1/CH2 columns, so shape only
    // contributes supporting evidence instead of replacing explicit metadata.
    if metadata.is_stripped_channel_sweep {
        if let Some(swept_axis) = metadata.stripped_sweep_voltage_axis {
            let fixed_axis = if swept_axis == "ch1" { "ch2" } else { "ch1" };
            let swept_current_span = if swept_axis == "ch1" {
                metadata.stripped_current_log_span_ch1
            } else {
                metadata.stripped_current_log_span_ch2
            };
            let fixed_current_span = if fixed_axis == "ch1" {
                metadata.stripped_current_log_span_ch1
            } else {
                metadata.stripped_current_log_span_ch2
            };
            if let (Some(swept_span), Some(fixed_span)) = (swept_current_span, fixed_current_span) {
                let current_span_gap = (swept_span - fixed_span).abs();
                if swept_span.is_finite() && fixed_span.is_finite() && current_span_gap >= 1.2 {
                    let dominant_axis = if swept_span >= fixed_span {
                        swept_axis
                    } else {
                        fixed_axis
                    };
                    let inferred_role = if dominant_axis == swept_axis {
                        "vd"
                    } else {
                        "vg"
                    };
                    let weight = if current_span_gap >= 2.5 {
                        9
                    } else if current_span_gap >= 1.8 {
                        8
                    } else {
                        7
                    };
                    push_role_evidence(&mut evidence, Some(inferred_role), weight, "shape");
                }
            }

            if let (Some(sweep_span), Some(fixed)) = (
                metadata.stripped_sweep_voltage_span,
                metadata.stripped_fixed_voltage_magnitude,
            ) {
                if sweep_span.is_finite() && fixed.is_finite() {
                    if sweep_span <= 12.0 && fixed >= 12.0_f64.max(sweep_span * 3.0) {
                        push_role_evidence(&mut evidence, Some("vd"), 6, "shape");
                    } else if fixed <= 12.0 && sweep_span >= 12.0_f64.max(fixed * 3.0) {
                        push_role_evidence(&mut evidence, Some("vg"), 6, "shape");
                    }
                }
            }

            push_role_evidence(&mut evidence, file_name_role, 3, "shape");
        }
    }

    let vg_score = evidence
        .iter()
        .filter(|entry| entry.role == "vg")
        .map(|entry| entry.weight)
        .sum::<i32>();
    let vd_score = evidence
        .iter()
        .filter(|entry| entry.role == "vd")
        .map(|entry| entry.weight)
        .sum::<i32>();
    let strong_metadata_conflict = evidence
        .iter()
        .any(|entry| entry.source == "metadata" && entry.role == "vg" && entry.weight >= 14)
        && evidence
            .iter()
            .any(|entry| entry.source == "metadata" && entry.role == "vd" && entry.weight >= 14);
    if strong_metadata_conflict {
        return (
            "unknown".to_string(),
            None,
            "metadata",
            "low".to_string(),
            true,
        );
    }
    // Pulse/FastIV hints define a separate family and can win over loose IV role
    // hints, but not over contradictory strong metadata.
    if let Some(non_iv) = &non_iv_curve {
        if non_iv.curve_type == "pv" {
            return (
                non_iv.curve_type.to_string(),
                None,
                non_iv.source,
                non_iv.confidence.to_string(),
                false,
            );
        }
    }
    if vg_score == vd_score {
        if let Some(non_iv) = &non_iv_curve {
            return (
                non_iv.curve_type.to_string(),
                None,
                non_iv.source,
                non_iv.confidence.to_string(),
                false,
            );
        }
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
    let winning_evidence = evidence
        .iter()
        .filter(|entry| entry.role == role)
        .collect::<Vec<_>>();
    let has_metadata_support = winning_evidence
        .iter()
        .any(|entry| entry.source == "metadata");
    let has_shape_support = winning_evidence.iter().any(|entry| entry.source == "shape");
    let strongest_winning_weight = winning_evidence
        .iter()
        .map(|entry| entry.weight)
        .max()
        .unwrap_or(0);
    let confidence = if has_metadata_support && strongest_winning_weight >= 14 && score_gap >= 10 {
        "high"
    } else if (has_metadata_support && score_gap >= 6) || score_gap >= 8 {
        "medium"
    } else {
        "low"
    };
    if confidence == "low" && metadata.is_stripped_channel_sweep && !has_shape_support {
        return (
            "unknown".to_string(),
            None,
            "metadata",
            "low".to_string(),
            true,
        );
    }
    let curve_type = if role == "vg" { "transfer" } else { "output" };
    let source = resolve_role_source(
        &winning_evidence
            .into_iter()
            .map(|entry| RoleEvidence {
                role: entry.role,
                source: entry.source,
                weight: entry.weight,
            })
            .collect::<Vec<_>>(),
    );
    (
        curve_type.to_string(),
        Some(role),
        source,
        confidence.to_string(),
        confidence == "low",
    )
}

fn parse_number_strict(raw: &str) -> Option<f64> {
    let text = raw.trim();
    if text.is_empty() {
        return None;
    }
    let number = text.parse::<f64>().ok()?;
    number.is_finite().then_some(number)
}

fn clean_cell_text(raw: &str) -> String {
    raw.trim().trim_matches('\u{feff}').trim().to_string()
}

fn normalize_header_compact(raw: &str) -> String {
    clean_cell_text(raw)
        .to_ascii_lowercase()
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn table(rows: &[&[&str]]) -> Vec<Vec<String>> {
        rows.iter()
            .map(|row| row.iter().map(|cell| (*cell).to_string()).collect())
            .collect()
    }

    #[test]
    fn strong_metadata_conflict_wins_over_pulse_filename_hint() {
        let table_model_seed = build_import_table_model_seed(
            "sample-pv.csv",
            table(&[
                &["TestParameter", "Output.Graph.XAxis.Data", "Vg"],
                &["DataName", "Vd", "Id"],
                &["0", "1", "2"],
            ]),
        );

        assert_eq!(
            table_model_seed.get("curveFamily").and_then(Value::as_str),
            Some("unknown")
        );
        assert_eq!(
            table_model_seed
                .get("curveTypeConfidence")
                .and_then(Value::as_str),
            Some("low")
        );
        assert_eq!(
            table_model_seed
                .get("curveTypeNeedsReview")
                .and_then(Value::as_bool),
            Some(true)
        );
        assert!(table_model_seed.get("xAxisRole").is_some_and(Value::is_null));
    }

    #[test]
    fn hz_capacitance_headers_classify_as_cf_from_label() {
        let table_model_seed = build_import_table_model_seed(
            "sample.csv",
            table(&[&["metadata"], &["Hz", "Cp"], &["1000", "1e-12"]]),
        );

        assert_eq!(
            table_model_seed.get("curveFamily").and_then(Value::as_str),
            Some("cf")
        );
        assert_eq!(
            table_model_seed.get("curveType").and_then(Value::as_str),
            Some("cf")
        );
        assert_eq!(
            table_model_seed.get("xAxisRoleSource").and_then(Value::as_str),
            Some("label")
        );
    }

    #[test]
    fn capacitance_metadata_reports_metadata_source() {
        let table_model_seed = build_import_table_model_seed(
            "sample.csv",
            table(&[&["{c_v_ext}"], &["vp", "Cp"], &["0", "1"]]),
        );

        assert_eq!(
            table_model_seed.get("curveFamily").and_then(Value::as_str),
            Some("cv")
        );
        assert_eq!(
            table_model_seed.get("curveType").and_then(Value::as_str),
            Some("cv")
        );
        assert_eq!(
            table_model_seed.get("xAxisRoleSource").and_then(Value::as_str),
            Some("metadata")
        );
    }

    #[test]
    fn csv_suffix_is_not_capacitance_evidence_for_current_table() {
        let table_model_seed = build_import_table_model_seed(
            "3_1.csv",
            table(&[
                &["CH1 Voltage", "CH1 Current", "CH1 Resistance"],
                &["-3.00000E+000", "-3.70327E-009", "810.09486E+006"],
            ]),
        );

        assert_eq!(
            table_model_seed.get("curveFamily").and_then(Value::as_str),
            Some("unknown")
        );
        assert_eq!(
            table_model_seed.get("curveType").and_then(Value::as_str),
            Some("unknown")
        );
        assert_eq!(
            table_model_seed
                .get("curveTypeNeedsReview")
                .and_then(Value::as_bool),
            Some(true)
        );
    }

    #[test]
    fn cs_voltage_headers_classify_as_cv() {
        let table_model_seed = build_import_table_model_seed(
            "sample.csv",
            table(&[&["Voltage", "Cs"], &["0", "1e-12"]]),
        );

        assert_eq!(
            table_model_seed.get("curveFamily").and_then(Value::as_str),
            Some("cv")
        );
        assert_eq!(
            table_model_seed.get("curveType").and_then(Value::as_str),
            Some("cv")
        );
        assert_eq!(
            table_model_seed.get("xAxisRoleSource").and_then(Value::as_str),
            Some("metadata")
        );
    }

    #[test]
    fn strong_iv_metadata_wins_over_cv_filename_hint() {
        let table_model_seed = build_import_table_model_seed(
            "sample-cv.csv",
            table(&[
                &["TestParameter", "Output.Graph.XAxis.Data", "Vg"],
                &["DataName", "Vg", "Id"],
                &["0", "1", "2"],
            ]),
        );

        assert_eq!(
            table_model_seed.get("curveFamily").and_then(Value::as_str),
            Some("iv")
        );
        assert_eq!(
            table_model_seed.get("ivMode").and_then(Value::as_str),
            Some("transfer")
        );
        assert_eq!(
            table_model_seed.get("xAxisRole").and_then(Value::as_str),
            Some("vg")
        );
    }
}


