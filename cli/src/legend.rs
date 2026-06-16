use crate::dataset::EngineDataset;
use crate::utils::json_cell_ref;
use crate::utils::json_number;
use crate::utils::json_string;
use crate::utils::read_cell_number;
use serde_json::Value;

fn trim_compact_exponent(text: String) -> String {
    text.replace("e+0", "e+")
        .replace("e-0", "e-")
        .replace("E+0", "e+")
        .replace("E-0", "e-")
}

fn trim_trailing_zeros(mut text: String) -> String {
    if let Some(dot_index) = text.find('.') {
        while text.ends_with('0') {
            text.pop();
        }
        if text.len() == dot_index + 1 {
            text.pop();
        }
    }
    trim_compact_exponent(text)
}

fn format_compact_numeric_label(value: f64) -> Option<String> {
    if !value.is_finite() {
        return None;
    }
    let normalized = value;
    if normalized.abs() < 1e-12 {
        return Some("0".to_string());
    }
    let rounded = normalized.round();
    let tolerance = 1e-12_f64.max(normalized.abs() * 1e-9);
    if (normalized - rounded).abs() <= tolerance {
        return Some(format!("{}", rounded as i64));
    }
    let abs = normalized.abs();
    if (1e-3..1e4).contains(&abs) {
        return Some(trim_trailing_zeros(format!("{:.6}", normalized)));
    }
    Some(trim_compact_exponent(format!("{:.3e}", normalized)))
}

fn format_legend_value(raw: Option<&String>) -> Option<String> {
    let text = raw?.trim();
    if text.is_empty() {
        return None;
    }
    match text.parse::<f64>() {
        Ok(value) if value.is_finite() => format_compact_numeric_label(value),
        _ => Some(text.to_string()),
    }
}

fn format_generated_legend_value(value: f64) -> Option<String> {
    if !value.is_finite() {
        return None;
    }
    format_compact_numeric_label(value)
}

fn normalize_near_zero_legend_labels(labels: Vec<Option<String>>) -> Vec<Option<String>> {
    if labels.is_empty() {
        return labels;
    }

    let numeric_values = labels
        .iter()
        .map(|label| {
            label
                .as_deref()
                .and_then(|value| value.trim().parse::<f64>().ok())
                .filter(|value| value.is_finite())
        })
        .collect::<Vec<_>>();
    let finite_values = numeric_values.iter().flatten().copied().collect::<Vec<_>>();
    if finite_values.len() < 3 {
        return labels;
    }
    let has_negative = finite_values.iter().any(|value| *value < 0.0);
    let has_positive = finite_values.iter().any(|value| *value > 0.0);
    let has_zero = finite_values.iter().any(|value| *value == 0.0);
    if !has_negative || !has_positive || has_zero {
        return labels;
    }

    let mut abs_values = finite_values
        .iter()
        .map(|value| value.abs())
        .filter(|value| *value > 0.0)
        .collect::<Vec<_>>();
    if abs_values.is_empty() {
        return labels;
    }
    abs_values.sort_by(|left, right| left.partial_cmp(right).unwrap_or(std::cmp::Ordering::Equal));
    let median_index = abs_values.len() / 2;
    let median_abs = if abs_values.len() % 2 == 1 {
        abs_values[median_index]
    } else {
        (abs_values[median_index - 1] + abs_values[median_index]) / 2.0
    };
    if !median_abs.is_finite() || median_abs <= 0.0 {
        return labels;
    }

    let zero_tolerance = 1e-12_f64.max(median_abs * 1e-4);
    labels
        .into_iter()
        .zip(numeric_values)
        .map(|(label, numeric_value)| match numeric_value {
            Some(value) if value.abs() <= zero_tolerance => Some("0".to_string()),
            _ => label,
        })
        .collect()
}

fn normalize_positive_integer(value: Option<&Value>) -> Option<usize> {
    let value = json_number(value?)?;
    if value > 0.0 && value.fract().abs() <= f64::EPSILON {
        Some(value as usize)
    } else {
        None
    }
}

fn normalize_positive_number(value: Option<&Value>) -> Option<f64> {
    let value = json_number(value?)?;
    if value.is_finite() && value > 0.0 {
        Some(value)
    } else {
        None
    }
}

fn read_positive_integer_cell(dataset: &EngineDataset, cell: Option<&Value>) -> Option<usize> {
    let (row, col) = json_cell_ref(cell)?;
    let value = read_cell_number(dataset, row, col)?;
    if value > 0.0 && value.fract().abs() <= f64::EPSILON {
        Some(value as usize)
    } else {
        None
    }
}

fn read_positive_number_cell(dataset: &EngineDataset, cell: Option<&Value>) -> Option<f64> {
    let (row, col) = json_cell_ref(cell)?;
    let value = read_cell_number(dataset, row, col)?;
    if value.is_finite() && value > 0.0 {
        Some(value)
    } else {
        None
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum LegendMode {
    YCol,
    Group,
}

impl LegendMode {
    pub fn as_str(self) -> &'static str {
        match self {
            LegendMode::YCol => "yCol",
            LegendMode::Group => "group",
        }
    }
}

fn resolve_legend_layout(
    desired_count: Option<usize>,
    target_raw: &str,
    y_count: usize,
    group_count: usize,
) -> (LegendMode, usize) {
    let preferred = match target_raw {
        "yColumn" => Some(LegendMode::YCol),
        "group" => Some(LegendMode::Group),
        _ => None,
    };

    // When the UI does not specify a target, infer whether labels vary by Y column
    // or by group from the requested count and available dimensions.
    let (mode, count) = if let Some(mode) = preferred {
        let fallback = if mode == LegendMode::Group {
            group_count
        } else {
            y_count
        };
        (mode, desired_count.unwrap_or(fallback))
    } else if let Some(count) = desired_count.filter(|value| *value > 0) {
        if count == y_count && count != group_count {
            (LegendMode::YCol, count)
        } else if count == group_count && count != y_count {
            (LegendMode::Group, count)
        } else if y_count == 1 && group_count > 1 {
            (LegendMode::Group, count)
        } else if group_count == 1 && y_count > 1 {
            (LegendMode::YCol, count)
        } else if y_count >= group_count {
            (LegendMode::YCol, count)
        } else {
            (LegendMode::Group, count)
        }
    } else if group_count == 1 {
        (LegendMode::YCol, y_count)
    } else if y_count == 1 {
        (LegendMode::Group, group_count)
    } else {
        (LegendMode::YCol, y_count)
    };

    let max_count = if mode == LegendMode::Group {
        group_count
    } else {
        y_count
    };
    (mode, count.min(max_count))
}

pub fn resolve_legend_labels(
    dataset: &EngineDataset,
    config: &Value,
    group_size: usize,
    groups: usize,
    y_cols: &[usize],
) -> (Option<LegendMode>, Option<Vec<Option<String>>>) {
    let target = json_string(config.get("yLegendTarget"));
    let count = read_positive_integer_cell(dataset, config.get("yLegendCountCell"))
        .or_else(|| normalize_positive_integer(config.get("yLegendCount")));
    let step = read_positive_number_cell(dataset, config.get("yLegendStepCell"))
        .or_else(|| normalize_positive_number(config.get("yLegendStep")));

    if let Some((start_row, start_col)) = json_cell_ref(config.get("yLegendStartCell")) {
        let (mode, final_count) = resolve_legend_layout(count, &target, y_cols.len(), groups);
        if final_count == 0 {
            return (None, None);
        }
        let default_step = if mode == LegendMode::Group {
            group_size
        } else {
            1
        };
        let step_value = step.unwrap_or(default_step as f64);
        let generate_step = if step_value > 0.0 && step_value.fract().abs() > f64::EPSILON {
            Some(step_value)
        } else {
            None
        };
        // Fractional steps mean "generate numeric labels"; integer steps mean
        // "walk cells" because spreadsheet label grids are row/column indexed.
        let cell_step = if generate_step.is_some() {
            default_step
        } else {
            step_value.round().max(1.0) as usize
        };
        let mut labels = vec![None; final_count];
        if let Some(generate_step) = generate_step {
            if let Some(start_value) = read_cell_number(dataset, start_row, start_col) {
                for (index, label) in labels.iter_mut().enumerate() {
                    *label =
                        format_generated_legend_value(start_value + generate_step * index as f64);
                }
            }
        } else if mode == LegendMode::YCol {
            for (index, label) in labels.iter_mut().enumerate() {
                *label = format_legend_value(
                    dataset
                        .rows
                        .get(start_row)
                        .and_then(|row| row.get(start_col + cell_step * index)),
                );
            }
        } else {
            for (index, label) in labels.iter_mut().enumerate() {
                *label = format_legend_value(
                    dataset
                        .rows
                        .get(start_row + cell_step * index)
                        .and_then(|row| row.get(start_col)),
                );
            }
        }
        return (Some(mode), Some(normalize_near_zero_legend_labels(labels)));
    }

    let start_value_raw = json_string(config.get("yLegendStartValue"));
    if !start_value_raw.is_empty() {
        let start_value = start_value_raw.parse::<f64>().ok();
        let (mode, final_count) = resolve_legend_layout(count, &target, y_cols.len(), groups);
        let step_value = step.unwrap_or(1.0);
        if final_count > 0 {
            if let Some(start_value) = start_value {
                let mut labels = vec![None; final_count];
                for (index, label) in labels.iter_mut().enumerate() {
                    *label = format_generated_legend_value(start_value + step_value * index as f64);
                }
                return (Some(mode), Some(normalize_near_zero_legend_labels(labels)));
            }
        }
    }

    (None, None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn generated_group_labels_normalize_near_zero_center() {
        let dataset = EngineDataset::from_rows("test.csv".to_string(), vec![]);
        let config = json!({
            "yLegendStartValue": "-59.9999979",
            "yLegendCount": 7,
            "yLegendStep": 20,
            "yLegendTarget": "group",
        });

        let (mode, labels) = resolve_legend_labels(&dataset, &config, 2, 7, &[1]);

        assert!(matches!(mode, Some(LegendMode::Group)));
        assert_eq!(
            labels,
            Some(vec![
                Some("-59.999998".to_string()),
                Some("-39.999998".to_string()),
                Some("-19.999998".to_string()),
                Some("0".to_string()),
                Some("20.000002".to_string()),
                Some("40.000002".to_string()),
                Some("60.000002".to_string()),
            ])
        );
    }

    #[test]
    fn cell_group_labels_normalize_near_zero_center() {
        let dataset = EngineDataset::from_rows(
            "test.csv".to_string(),
            vec![
                vec!["-60".to_string()],
                vec!["".to_string()],
                vec!["-40".to_string()],
                vec!["".to_string()],
                vec!["-20".to_string()],
                vec!["".to_string()],
                vec!["0.0000021".to_string()],
                vec!["".to_string()],
                vec!["20".to_string()],
                vec!["".to_string()],
                vec!["40".to_string()],
                vec!["".to_string()],
                vec!["60".to_string()],
            ],
        );
        let config = json!({
            "yLegendStartCell": { "rowIndex": 0, "colIndex": 0 },
            "yLegendTarget": "group",
        });

        let (mode, labels) = resolve_legend_labels(&dataset, &config, 2, 7, &[1]);

        assert!(matches!(mode, Some(LegendMode::Group)));
        assert_eq!(
            labels,
            Some(vec![
                Some("-60".to_string()),
                Some("-40".to_string()),
                Some("-20".to_string()),
                Some("0".to_string()),
                Some("20".to_string()),
                Some("40".to_string()),
                Some("60".to_string()),
            ])
        );
    }
}
