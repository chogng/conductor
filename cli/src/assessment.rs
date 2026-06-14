use serde_json::json;
use serde_json::Value;
use std::cell::Ref;
use std::cell::RefCell;
use std::collections::HashMap;

#[derive(Clone)]
struct AssessmentDataset {
    rows: Vec<Vec<String>>,
    numeric_column_cache: RefCell<HashMap<usize, Vec<Option<f64>>>>,
}

impl AssessmentDataset {
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
    stripped_fixed_voltage_magnitude: Option<f64>,
    stripped_sweep_voltage_axis: Option<&'static str>,
    var1_name: String,
    var2_name: String,
    x_axis_data: String,
}

pub fn assess_import_rows(file_name: &str, rows: Vec<Vec<String>>) -> Value {
    let dataset = AssessmentDataset::from_rows(rows);
    let header_row_index = find_header_row_index(&dataset);
    let headers = row_trimmed(&dataset, header_row_index);
    let metadata = extract_auto_metadata(&dataset);
    let (curve_type, x_axis_role, source, confidence, needs_template) =
        classify_auto_curve(file_name, &metadata, &headers);
    let curve_type_label = match (curve_type.as_str(), x_axis_role) {
        ("transfer", Some("vg")) => Value::String("transfer (vg)".to_string()),
        ("output", Some("vd")) => Value::String("output (vd)".to_string()),
        ("unknown", _) => Value::String("unknown".to_string()),
        ("transfer" | "output" | "pv" | "cv" | "cf", _) => Value::String(curve_type),
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
        "curveType": curve_type_label,
        "curveTypeConfidence": confidence,
        "curveTypeNeedsTemplate": needs_template,
        "curveTypeReasons": curve_type_reasons,
        "xAxisRole": x_axis_role,
        "xAxisRoleSource": x_axis_role_source,
    })
}

pub fn detect_axis_role_text(value: &str) -> Option<&'static str> {
    let compact = normalize_header_compact(value);
    if compact.contains("vd") || compact.contains("drain") {
        return Some("vd");
    }
    if compact.contains("vg") || compact.contains("gate") || compact == "var1" {
        return Some("vg");
    }
    None
}

fn row_trimmed(dataset: &AssessmentDataset, row_index: usize) -> Vec<String> {
    dataset
        .rows
        .get(row_index)
        .map(|row| row.iter().map(|value| clean_cell_text(value)).collect())
        .unwrap_or_default()
}

fn find_header_row_index(dataset: &AssessmentDataset) -> usize {
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

fn collect_column_numbers(
    dataset: &AssessmentDataset,
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
    dataset: &AssessmentDataset,
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
    if count >= 2 {
        Some(count)
    } else {
        None
    }
}

fn collect_stripped_sweep_metadata(
    dataset: &AssessmentDataset,
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

fn extract_auto_metadata(dataset: &AssessmentDataset) -> AutoMetadata {
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
        let (axis, fixed) = collect_stripped_sweep_metadata(dataset, header_row_index);
        metadata.stripped_sweep_voltage_axis = axis;
        metadata.stripped_fixed_voltage_magnitude = fixed;
    }
    metadata
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

    let metadata_has_fast_iv_or_ivt = all_text
        .iter()
        .skip(1)
        .any(|value| has_fast_iv_or_ivt_hint(value))
        || compact_all
            .iter()
            .skip(1)
            .any(|value| value.contains("fastiv") || value == "ipt");
    if file_compact.contains("pv")
        || has_fast_iv_or_ivt_hint(file_name)
        || metadata_has_fast_iv_or_ivt
    {
        return (
            "pv".to_string(),
            None,
            if metadata_has_fast_iv_or_ivt {
                "metadata"
            } else {
                "filename"
            },
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
    let mut shape_vd_score = 0i32;
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
                shape_vd_score += 6;
            } else if axis == "ch2" && fixed >= 12.0 {
                shape_vd_score += 6;
            }
        }
    }
    vd_score += shape_vd_score;

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
    let source = if role == "vd" && shape_vd_score > 0 && vd_score - shape_vd_score == 0 {
        "shape"
    } else {
        "metadata"
    };
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
