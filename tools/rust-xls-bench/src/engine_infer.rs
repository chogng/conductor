use crate::engine_dataset::EngineDataset;
use crate::engine_utils::{approx_equal, normalize_cell_text, parse_number_strict};

pub fn parse_positive_integer_text(raw: &str) -> Option<usize> {
    let mut digits = String::new();
    let mut started = false;
    for ch in raw.chars() {
        if ch.is_ascii_digit() {
            digits.push(ch);
            started = true;
        } else if started {
            break;
        }
    }
    let value = digits.parse::<usize>().ok()?;
    if value > 0 { Some(value) } else { None }
}

fn parse_positive_integer_from_cells(cells: &[String]) -> Option<usize> {
    for cell in cells {
        if let Some(value) = parse_number_strict(Some(cell)) {
            if value > 0.0 && value.fract().abs() <= f64::EPSILON {
                return Some(value as usize);
            }
        }
        if let Some(value) = parse_positive_integer_text(cell) {
            return Some(value);
        }
    }
    None
}

pub fn find_metadata_positive_integer(
    dataset: &EngineDataset,
    first_cell: &str,
    second_cell: Option<&str>,
) -> Option<usize> {
    let expected_first = normalize_cell_text(first_cell);
    let expected_second = second_cell.map(normalize_cell_text);
    for row in &dataset.rows {
        if row.is_empty() {
            continue;
        }
        if normalize_cell_text(row.first().map(String::as_str).unwrap_or("")) != expected_first {
            continue;
        }
        if let Some(expected_second) = expected_second.as_deref() {
            if normalize_cell_text(row.get(1).map(String::as_str).unwrap_or("")) != expected_second
            {
                continue;
            }
        }
        let value_start = if expected_second.is_some() { 2 } else { 1 };
        if let Some(value) =
            parse_positive_integer_from_cells(row.get(value_start..).unwrap_or(&[]))
        {
            return Some(value);
        }
    }
    None
}

fn resolve_group_shape_from_counts(
    data_start_row_index: usize,
    group_size: Option<usize>,
    groups: Option<usize>,
    total_row_count: usize,
) -> Option<(usize, usize)> {
    if total_row_count <= data_start_row_index {
        return None;
    }
    let data_rows = total_row_count - data_start_row_index;
    if data_rows < 2 {
        return None;
    }
    let normalized_group_size = group_size.filter(|value| *value >= 2);
    let normalized_groups = groups.filter(|value| *value >= 1);

    match (normalized_group_size, normalized_groups) {
        (Some(group_size), Some(groups)) => {
            if group_size * groups == data_rows {
                Some((group_size, groups))
            } else {
                None
            }
        }
        (Some(group_size), None) => {
            if data_rows % group_size == 0 {
                Some((group_size, data_rows / group_size))
            } else {
                None
            }
        }
        (None, Some(groups)) => {
            if data_rows % groups == 0 {
                let group_size = data_rows / groups;
                if group_size >= 2 {
                    Some((group_size, groups))
                } else {
                    None
                }
            } else {
                None
            }
        }
        (None, None) => None,
    }
}

pub fn infer_metadata_group_shape(
    dataset: &EngineDataset,
    start_row: usize,
) -> Option<(usize, usize)> {
    let dimension_shape = resolve_group_shape_from_counts(
        start_row,
        find_metadata_positive_integer(dataset, "Dimension1", None),
        find_metadata_positive_integer(dataset, "Dimension2", None),
        dataset.rows.len(),
    );
    if dimension_shape.is_some() {
        return dimension_shape;
    }
    resolve_group_shape_from_counts(
        start_row,
        None,
        find_metadata_positive_integer(
            dataset,
            "TestParameter",
            Some("Measurement.Secondary.Count"),
        ),
        dataset.rows.len(),
    )
}

pub fn infer_auto_segmentation_from_x_values(
    values: &[f64],
    total: usize,
) -> Option<(usize, usize)> {
    const MIN_GROUP_SIZE: usize = 2;
    const MIN_GROUPS: usize = 2;
    const REPEAT_THRESHOLD: f64 = 0.9;

    if total == 0 || values.len() != total || values.len() < MIN_GROUP_SIZE * MIN_GROUPS {
        return None;
    }
    let min = values.iter().copied().fold(f64::INFINITY, f64::min);
    let max = values.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    let tolerance = (max - min).abs().mul_add(1e-4, 0.0).max(1e-9);
    let max_index = values.len().saturating_sub(1).min(4000);
    let mut candidates = Vec::<usize>::new();
    for group_size in MIN_GROUP_SIZE..=max_index {
        if total % group_size != 0 {
            continue;
        }
        if approx_equal(values[group_size], values[0], tolerance) {
            candidates.push(group_size);
            if candidates.len() >= 64 {
                break;
            }
        }
    }
    if candidates.is_empty() {
        return None;
    }

    let mut best_group_size = 0usize;
    let mut best_score = 0f64;
    for candidate in candidates {
        let groups = total / candidate;
        if groups < MIN_GROUPS {
            continue;
        }
        let compare_window = (values.len() - candidate).min(candidate * 8);
        if compare_window == 0 {
            continue;
        }
        let mut matched = 0usize;
        for index in 0..compare_window {
            if approx_equal(values[index], values[index + candidate], tolerance * 2.0) {
                matched += 1;
            }
        }
        let score = matched as f64 / compare_window as f64;
        if score > best_score {
            best_score = score;
            best_group_size = candidate;
        }
    }
    if best_group_size == 0 || best_score < REPEAT_THRESHOLD {
        return None;
    }
    Some((best_group_size, total / best_group_size))
}
