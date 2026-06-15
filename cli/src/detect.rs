use crate::dataset::EngineDataset;
use crate::infer::find_metadata_positive_integer;
use crate::infer::infer_auto_segmentation_from_x_values;
use crate::infer::infer_metadata_group_shape_with_total;
use crate::rules::detect_axis_role_text;
use crate::rules::parse_voltage_like_value;
use crate::utils::approx_equal;
use crate::utils::clean_cell_text;
use crate::utils::column_has_numeric_rows;
use crate::utils::normalize_cell_text;
use crate::utils::normalize_header_compact;
use crate::utils::parse_number_strict;

#[derive(Default)]
pub(crate) struct AutoMetadata {
    pub(crate) data_name_columns: Vec<String>,
    pub(crate) is_stripped_channel_sweep: bool,
    pub(crate) notes_text: String,
    pub(crate) setup_title: String,
    pub(crate) stripped_current_log_span_ch1: Option<f64>,
    pub(crate) stripped_current_log_span_ch2: Option<f64>,
    pub(crate) stripped_fixed_voltage_magnitude: Option<f64>,
    pub(crate) stripped_sweep_voltage_axis: Option<&'static str>,
    pub(crate) stripped_sweep_voltage_span: Option<f64>,
    pub(crate) var1_name: String,
    pub(crate) var2_name: String,
    pub(crate) x_axis_data: String,
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

pub(crate) fn row_trimmed(dataset: &EngineDataset, row_index: usize) -> Vec<String> {
    dataset
        .rows
        .get(row_index)
        .map(|row| row.iter().map(|value| clean_cell_text(value)).collect())
        .unwrap_or_default()
}

pub(crate) fn find_header_row_index(dataset: &EngineDataset) -> usize {
    // Prefer explicit instrument headers, then fall back to generic header-looking
    // rows that are followed by numeric data.
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

pub(crate) fn numeric_span(values: &[f64]) -> Option<f64> {
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

pub(crate) fn collect_column_numbers(
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

pub(crate) fn detect_first_group_length(
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
    dataset: &EngineDataset,
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

pub(crate) fn extract_auto_metadata(dataset: &EngineDataset) -> AutoMetadata {
    let mut metadata = AutoMetadata::default();
    let mut channel_funcs = Vec::<String>::new();
    let mut channel_vnames = Vec::<String>::new();
    let mut stripped_header_row_index: Option<usize> = None;

    // Source sheets mix metadata tables and data blocks, so collect the fields
    // needed by classification in one pass over the whole sheet.
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

fn has_capacitance_hint(value: &str) -> bool {
    value.contains("cp") || value.contains("cs") || value.contains("cap")
}

fn has_frequency_hint(value: &str) -> bool {
    value.contains("freq") || value.contains("frequency") || value.contains("hz") || value == "cf"
}

fn has_voltage_hint(value: &str) -> bool {
    value.contains("cv")
        || value.contains("vp")
        || value.contains("voltage")
        || value.contains("bias")
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
    let header_compact = headers
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
    let file_has_pulse_hint = file_compact.contains("pv") || has_fast_iv_or_ivt_hint(file_name);
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

    let has_file_cv_hint = file_compact.contains("cv") && !file_compact.contains("svc");
    let has_file_cf_hint =
        file_compact.contains("cf") || file_compact.contains("freq") || file_compact.contains("hz");
    let has_capacitance = has_capacitance_hint(&file_compact)
        || metadata_compact
            .iter()
            .any(|value| has_capacitance_hint(value))
        || header_compact
            .iter()
            .any(|value| has_capacitance_hint(value));
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

    let metadata_has_frequency = metadata_compact
        .iter()
        .any(|value| has_frequency_hint(value));
    let header_has_frequency = header_compact.iter().any(|value| has_frequency_hint(value));
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

    let metadata_has_voltage = metadata_compact.iter().any(|value| has_voltage_hint(value));
    let header_has_voltage = header_compact.iter().any(|value| has_voltage_hint(value));
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

pub(crate) fn classify_auto_curve(
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

pub(crate) fn columns_share_equivalent_x(
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

pub(crate) fn find_numeric_semantic_columns(
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

pub(crate) fn choose_best_semantic_pair(
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

pub(crate) fn parse_secondary_sweep_from_rows(
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

pub(crate) fn resolve_auto_group_shape_full(
    dataset: &EngineDataset,
    data_start_row_index: usize,
    x_col: usize,
    point_col_index: Option<usize>,
    var2_col_index: Option<usize>,
    total_row_count: usize,
) -> (Option<usize>, Option<usize>) {
    if let Some(shape) =
        infer_metadata_group_shape_with_total(dataset, data_start_row_index, total_row_count)
    {
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
            total_row_count.saturating_sub(data_start_row_index),
        )
        .map(|shape| shape.0)
    } else {
        None
    };
    let group_size = explicit.or(repeated);
    let groups = group_size.and_then(|size| {
        let data_rows = dataset.rows.len().saturating_sub(data_start_row_index);
        let data_rows = total_row_count
            .saturating_sub(data_start_row_index)
            .max(data_rows);
        if size > 0 && data_rows % size == 0 {
            Some(data_rows / size)
        } else {
            None
        }
    });
    (group_size, groups)
}
