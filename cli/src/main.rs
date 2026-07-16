mod analysis;
mod cells;
mod converter;
mod dataset;
mod import;
mod infer;
mod legend;
mod rc;
mod rules;
mod structured_content;
mod table_model_seed;
mod utils;

use analysis::AnalysisSeriesRequest;
use analysis::AnalysisSourceFile;
use analysis::compute_central_derivative;
use cells::EngineCellRequest;
use converter::ConvertFailure;
use converter::ConvertResult;
use converter::ConvertStats;
use converter::collect_excel_files;
use converter::convert_one;
use converter::write_csv_cell;
use dataset::EngineDataset;
use dataset::load_dataset;
use dataset::load_import_dataset;
use import::IMPORT_TABLE_MODEL_SEED_PREVIEW_ROWS;
use import::build_import_table_model_seed;
use infer::infer_auto_segmentation_from_x_values;
use infer::infer_metadata_group_shape;
use legend::LegendMode;
use legend::resolve_legend_labels;
use rc::RcCalculationOptions;
use rc::RcDeviceRequest;
use rules::*;
use serde::Deserialize;
use serde::Serialize;
use serde_json::Value;
use serde_json::json;
use std::collections::HashMap;
use std::collections::VecDeque;
use std::env;
use std::fs;
use std::io;
use std::io::BufRead;
use std::io::BufWriter;
use std::io::Write;
use std::path::Path;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::AtomicUsize;
use std::sync::atomic::Ordering;
use std::thread;
use std::time::Instant;
use utils::*;

const IMPORT_TABLE_MODEL_SEED_BATCH_PARALLEL_MIN_ENTRIES: usize = 8;
const IMPORT_TABLE_MODEL_SEED_BATCH_MAX_THREADS: usize = 4;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EngineRequest {
    calculation_cache_path: Option<String>,
    cells: Option<Vec<EngineCellRequest>>,
    col_index: Option<usize>,
    columns: Option<Vec<OriginExportColumnRequest>>,
    config: Option<Value>,
    command: String,
    curve_filter_field: Option<String>,
    curve_filter_key: Option<String>,
    end_row: Option<usize>,
    entries: Option<Vec<ImportTableModelSeedBatchEntry>>,
    file_id: Option<String>,
    file_name: Option<String>,
    id: u64,
    path: Option<String>,
    row_index: Option<usize>,
    seed_rows: Option<usize>,
    series: Option<Vec<AnalysisSeriesRequest>>,
    source_file: Option<AnalysisSourceFile>,
    start_row: Option<usize>,
    threads: Option<usize>,
    max_points: Option<usize>,
    metric_kind: Option<String>,
    metric_series: Option<Vec<OriginExportMetricSeriesRequest>>,
    output_path: Option<String>,
    rc_devices: Option<Vec<RcDeviceRequest>>,
    rc_options: Option<RcCalculationOptions>,
    sources: Option<Vec<OriginExportSourceRequest>>,
    x_groups: Option<Vec<Vec<f64>>>,
    x_scale_factor: Option<f64>,
    y_scale_factor: Option<f64>,
    y_transform: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportTableModelSeedBatchEntry {
    file_name: Option<String>,
    path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OriginExportColumnRequest {
    group_index: usize,
    kind: String,
    source_index: Option<usize>,
    y_col: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OriginExportSourceRequest {
    config: Value,
    file_id: String,
    file_name: Option<String>,
    max_points: Option<usize>,
    path: String,
    x_scale_factor: Option<f64>,
    y_scale_factor: Option<f64>,
    y_transform: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OriginExportMetricSeriesRequest {
    group_index: usize,
    label: String,
    source_index: Option<usize>,
    y_col: usize,
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

fn process_file(
    file_id: &str,
    dataset: &EngineDataset,
    config: &Value,
    curve_filter_key: Option<&str>,
    curve_filter_field: Option<&str>,
    max_points_raw: Option<usize>,
    calculation_cache_path: Option<&str>,
) -> Result<Value, String> {
    let segmentation_mode = json_string(config.get("xSegmentationMode")).to_ascii_lowercase();

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
    } else if let Some((cell_row, cell_col)) = json_cell_ref(config.get("segmentCountCell")) {
        let segments = read_cell_number(dataset, cell_row, cell_col).and_then(|value| {
            if value > 0.0 && value.fract().abs() <= f64::EPSILON {
                Some(value as usize)
            } else {
                None
            }
        });
        let segments = segments.ok_or_else(|| {
            format!(
                "{}: Segments cell {}{} must contain a positive integer.",
                dataset.file_name,
                excel_column_label(cell_col),
                cell_row + 1
            )
        })?;
        if segments > expected_total || expected_total % segments != 0 {
            return Err(format!(
                "{}: X range has {} points, which is not divisible by segments={} (from {}{}).",
                dataset.file_name,
                expected_total,
                segments,
                excel_column_label(cell_col),
                cell_row + 1
            ));
        }
        groups = Some(segments);
        group_size = Some(expected_total / segments);
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
    let effective_axis_role = x_axis_role;
    let effective_axis_role_source = x_axis_role_source;
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
    let calculation_cache = if !analysis_series.is_empty() {
        Some(json!({
            "source": "rust-process-precompute",
            "series": analysis::analyze_series_batch(
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
    let calculation_cache_ref = if let (Some(cache), Some(cache_path)) =
        (calculation_cache.as_ref(), calculation_cache_path)
    {
        let path = PathBuf::from(cache_path);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("failed to create calculation cache dir: {}", error))?;
        }
        let bytes = serde_json::to_vec(cache)
            .map_err(|error| format!("failed to encode calculation cache: {}", error))?;
        fs::write(&path, &bytes)
            .map_err(|error| format!("failed to write calculation cache: {}", error))?;
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
        "analysisCache": if calculation_cache_ref.is_some() { Value::Null } else { calculation_cache.unwrap_or(Value::Null) },
        "calculationCacheRef": calculation_cache_ref,
        "source": "rust-engine",
    }))
}

fn copy_block_config_field(
    object: &mut serde_json::Map<String, Value>,
    block: &Value,
    block_key: &str,
    config_key: &str,
) {
    if let Some(value) = block.get(block_key).or_else(|| block.get(config_key)) {
        object.insert(config_key.to_string(), value.clone());
    }
}

fn create_template_block_config(config: &Value, block: &Value) -> Value {
    let mut block_config = config.clone();
    if let Some(object) = block_config.as_object_mut() {
        object.remove("blocks");
        for key in [
            "autoCurveType",
            "bottomTitle",
            "endRow",
            "groupSize",
            "groups",
            "leftTitle",
            "legendPrefix",
            "segmentCount",
            "startRow",
            "xCol",
            "xSegmentationMode",
            "xUnit",
            "yCols",
            "yLegendCount",
            "yLegendStartValue",
            "yLegendStep",
            "yLegendTarget",
            "yUnit",
        ] {
            copy_block_config_field(object, block, key, key);
        }
        copy_block_config_field(object, block, "legendStartCell", "yLegendStartCell");
        copy_block_config_field(object, block, "legendTarget", "yLegendTarget");
        copy_block_config_field(object, block, "legendStep", "yLegendStep");
        if block.get("yLegendCount").is_none() {
            let legend_count = block
                .get("yCols")
                .and_then(Value::as_array)
                .map(|items| items.len());
            object.insert("yLegendCount".to_string(), json!(legend_count));
        }
        if !object.contains_key("yLegendTarget") {
            object.insert("yLegendTarget".to_string(), json!("auto"));
        }
    }
    block_config
}

fn process_configured_file(
    file_id: &str,
    dataset: &EngineDataset,
    config: &Value,
    curve_filter_key: Option<&str>,
    curve_filter_field: Option<&str>,
    max_points_raw: Option<usize>,
    calculation_cache_path: Option<&str>,
) -> Result<Value, String> {
    let blocks = config
        .get("blocks")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if blocks.is_empty() {
        return process_file(
            file_id,
            dataset,
            config,
            curve_filter_key,
            curve_filter_field,
            max_points_raw,
            calculation_cache_path,
        );
    }
    if blocks.len() == 1 {
        let block_config = create_template_block_config(config, &blocks[0]);
        return process_file(
            file_id,
            dataset,
            &block_config,
            curve_filter_key,
            curve_filter_field,
            max_points_raw,
            calculation_cache_path,
        );
    }

    let mut processed_blocks = Vec::<(usize, Value, Value)>::new();
    for (block_index, block) in blocks.iter().enumerate() {
        let block_config = create_template_block_config(config, block);
        let processed = process_file(
            file_id,
            dataset,
            &block_config,
            curve_filter_key,
            curve_filter_field,
            max_points_raw,
            None,
        )?;
        processed_blocks.push((block_index, block.clone(), processed));
    }

    let mut merged = processed_blocks
        .first()
        .map(|(_, _, processed)| processed.clone())
        .ok_or_else(|| "template blocks produced no processed data".to_string())?;
    let mut x_groups = Vec::<Value>::new();
    let mut series = Vec::<Value>::new();
    let mut y_columns = Vec::<Value>::new();
    let mut y_column_labels = Vec::<Value>::new();
    let mut min_x = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_y = f64::NEG_INFINITY;

    for (block_index, _, processed) in &processed_blocks {
        let group_offset = x_groups.len();
        if let Some(items) = processed.get("xGroups").and_then(Value::as_array) {
            for item in items {
                if let Some(values) = item.as_array() {
                    for value in values.iter().filter_map(Value::as_f64) {
                        min_x = min_x.min(value);
                        max_x = max_x.max(value);
                    }
                }
                x_groups.push(item.clone());
            }
        }
        if let Some(items) = processed
            .get("y")
            .and_then(|value| value.get("columns"))
            .and_then(Value::as_array)
        {
            y_columns.extend(items.iter().cloned());
        }
        if let Some(items) = processed
            .get("y")
            .and_then(|value| value.get("columnLabels"))
            .and_then(Value::as_array)
        {
            y_column_labels.extend(items.iter().cloned());
        }
        if let Some(items) = processed.get("series").and_then(Value::as_array) {
            for item in items {
                let mut next = item.clone();
                if let Some(object) = next.as_object_mut() {
                    let group_index = object
                        .get("groupIndex")
                        .and_then(Value::as_u64)
                        .unwrap_or(0) as usize;
                    object.insert("groupIndex".to_string(), json!(group_index + group_offset));
                    object.insert("blockIndex".to_string(), json!(block_index));
                    if let Some(id) = object.get("id").and_then(Value::as_str) {
                        object.insert(
                            "id".to_string(),
                            json!(format!("{}_block{}", id, block_index)),
                        );
                    }
                    if let Some(name) = object.get("name").and_then(Value::as_str) {
                        object.insert(
                            "name".to_string(),
                            json!(format!("{} [block {}]", name, block_index + 1)),
                        );
                    }
                    if let Some(values) = object.get("y").and_then(Value::as_array) {
                        for value in values.iter().filter_map(Value::as_f64) {
                            min_y = min_y.min(value);
                            max_y = max_y.max(value);
                        }
                    }
                }
                series.push(next);
            }
        }
    }

    if let Some(object) = merged.as_object_mut() {
        object.insert(
            "templateBlocks".to_string(),
            json!(
                processed_blocks
                    .iter()
                    .map(|(_, block, _)| block)
                    .collect::<Vec<_>>()
            ),
        );
        object.insert("legend".to_string(), Value::Null);
        object.insert("xGroups".to_string(), json!(x_groups));
        object.insert("series".to_string(), json!(series));
        object.insert(
            "y".to_string(),
            json!({
                "columns": y_columns,
                "columnLabels": y_column_labels,
            }),
        );
        object.insert(
            "domain".to_string(),
            json!({
                "x": pad_domain(min_x, max_x),
                "y": pad_domain(min_y, max_y),
            }),
        );
        object.insert("analysisCache".to_string(), Value::Null);
        object.insert("calculationCacheRef".to_string(), Value::Null);
    }

    if calculation_cache_path.is_some() {
        // The merged block result intentionally skips writing a partial per-block
        // calculation cache; chart analysis can be rebuilt from the merged series.
    }
    Ok(merged)
}

fn resolve_export_group_shape(
    dataset: &EngineDataset,
    config: &Value,
) -> Result<(usize, usize, usize, usize, usize), String> {
    let segmentation_mode = json_string(config.get("xSegmentationMode")).to_ascii_lowercase();
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
        if points > expected_total || expected_total % points != 0 {
            return Err("Invalid config: group size cell does not divide row range".to_string());
        }
        group_size = Some(points);
        groups = Some(expected_total / points);
    } else if let Some((cell_row, cell_col)) = json_cell_ref(config.get("segmentCountCell")) {
        let segments = read_cell_number(dataset, cell_row, cell_col).and_then(|value| {
            if value > 0.0 && value.fract().abs() <= f64::EPSILON {
                Some(value as usize)
            } else {
                None
            }
        });
        let segments = segments.ok_or_else(|| {
            format!(
                "{}: Segments cell {}{} must contain a positive integer.",
                dataset.file_name,
                excel_column_label(cell_col),
                cell_row + 1
            )
        })?;
        if segments > expected_total || expected_total % segments != 0 {
            return Err("Invalid config: segment count cell does not divide row range".to_string());
        }
        groups = Some(segments);
        group_size = Some(expected_total / segments);
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
            return Err("Invalid config: segment count does not divide row range".to_string());
        }
        groups = Some(segments);
        group_size = Some(expected_total / segments);
    }
    let group_size = group_size.unwrap_or(expected_total);
    if group_size == 0 || expected_total % group_size != 0 {
        return Err("Invalid config: group size does not divide row range".to_string());
    }
    let groups = groups.unwrap_or(expected_total / group_size);
    if groups == 0 || groups * group_size != expected_total {
        return Err("Invalid config: groups do not match row range".to_string());
    }

    Ok((x_col, start_row, end_row, group_size, groups))
}

fn transform_origin_export_y(value: f64, scale_factor: f64, transform: &str) -> f64 {
    let scaled = value * scale_factor;
    match transform {
        "abs" => scaled.abs(),
        "sqrtAbs" => scaled.abs().sqrt(),
        _ => scaled,
    }
}

fn compute_origin_export_derivative_values(
    dataset: &EngineDataset,
    start_row: usize,
    group_size: usize,
    group_index: usize,
    x_col: usize,
    y_col: usize,
    row_offsets: &[usize],
) -> Vec<Option<f64>> {
    let mut x_values = Vec::<f64>::with_capacity(row_offsets.len());
    let mut y_values = Vec::<f64>::with_capacity(row_offsets.len());
    for row_offset in row_offsets {
        let row_index = start_row + group_index * group_size + *row_offset;
        x_values.push(cell_number(dataset, row_index, x_col).unwrap_or(f64::NAN));
        y_values.push(cell_number(dataset, row_index, y_col).unwrap_or(f64::NAN));
    }
    compute_central_derivative(&x_values, &y_values)
        .into_iter()
        .map(|point| {
            point
                .get("y")
                .and_then(Value::as_f64)
                .filter(|value| value.is_finite())
        })
        .collect()
}

fn export_origin_csv_file(
    dataset: &EngineDataset,
    config: &Value,
    columns: &[OriginExportColumnRequest],
    output_path: &Path,
    max_points_raw: Option<usize>,
    x_scale_factor_raw: Option<f64>,
    y_scale_factor_raw: Option<f64>,
    y_transform_raw: Option<&str>,
) -> Result<Value, String> {
    if columns.is_empty() {
        return Err("missing export columns".to_string());
    }
    let (x_col, start_row, _end_row, group_size, groups) =
        resolve_export_group_shape(dataset, config)?;
    let x_scale_factor = x_scale_factor_raw
        .filter(|value| value.is_finite() && *value > 0.0)
        .unwrap_or(1.0);
    let y_scale_factor = y_scale_factor_raw
        .filter(|value| value.is_finite() && *value > 0.0)
        .unwrap_or(1.0);
    let y_transform = y_transform_raw.unwrap_or("");
    let max_points = max_points_raw.unwrap_or(600).max(2);
    let target_points = group_size.min(max_points);
    let row_offsets: Vec<usize> = match build_uniform_sample_indices(group_size, target_points) {
        Some(indices) => indices,
        None => (0..group_size).collect(),
    };
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let mut derivative_cache = HashMap::<(usize, usize), Vec<Option<f64>>>::new();
    let mut writer =
        BufWriter::new(fs::File::create(output_path).map_err(|error| error.to_string())?);
    writer
        .write_all(&[0xEF, 0xBB, 0xBF])
        .map_err(|error| error.to_string())?;
    let mut csv_bytes = 3usize;

    for (output_row_index, row_offset) in row_offsets.iter().enumerate() {
        if output_row_index > 0 {
            writer.write_all(b"\n").map_err(|error| error.to_string())?;
            csv_bytes += 1;
        }
        for (column_index, column) in columns.iter().enumerate() {
            if column_index > 0 {
                writer.write_all(b",").map_err(|error| error.to_string())?;
                csv_bytes += 1;
            }
            if column.group_index >= groups {
                return Err("export column groupIndex is out of range".to_string());
            }
            let row_index = start_row + column.group_index * group_size + *row_offset;
            let value = if column.kind == "x" {
                cell_number(dataset, row_index, x_col).map(|value| value * x_scale_factor)
            } else if column.kind == "y" {
                let y_col = column
                    .y_col
                    .ok_or_else(|| "export y column is missing yCol".to_string())?;
                if y_transform == "derivative" {
                    let values = derivative_cache
                        .entry((column.group_index, y_col))
                        .or_insert_with(|| {
                            compute_origin_export_derivative_values(
                                dataset,
                                start_row,
                                group_size,
                                column.group_index,
                                x_col,
                                y_col,
                                &row_offsets,
                            )
                        });
                    values.get(output_row_index).copied().flatten()
                } else {
                    cell_number(dataset, row_index, y_col)
                        .map(|value| transform_origin_export_y(value, y_scale_factor, y_transform))
                }
            } else {
                return Err("unsupported export column kind".to_string());
            };
            if let Some(value) = value.filter(|value| value.is_finite()) {
                let text = value.to_string();
                csv_bytes +=
                    write_csv_cell(&text, &mut writer).map_err(|error| error.to_string())?;
            }
        }
    }
    writer.flush().map_err(|error| error.to_string())?;
    Ok(json!({
        "bytes": csv_bytes,
        "columns": columns.len(),
        "path": output_path.to_string_lossy(),
        "rows": group_size,
        "sampledRows": row_offsets.len(),
    }))
}

struct OriginExportResolvedSource {
    dataset: EngineDataset,
    group_size: usize,
    groups: usize,
    row_offsets: Vec<usize>,
    start_row: usize,
    x_col: usize,
    x_scale_factor: f64,
    y_scale_factor: f64,
    y_transform: String,
}

#[derive(Clone)]
struct OriginExportVthFit {
    branch: &'static str,
    vth: f64,
}

fn resolve_origin_export_source(
    dataset: EngineDataset,
    config: &Value,
    max_points_raw: Option<usize>,
    x_scale_factor_raw: Option<f64>,
    y_scale_factor_raw: Option<f64>,
    y_transform_raw: Option<&str>,
) -> Result<OriginExportResolvedSource, String> {
    let (x_col, start_row, _end_row, group_size, groups) =
        resolve_export_group_shape(&dataset, config)?;
    let max_points = max_points_raw.unwrap_or(600).max(2);
    let target_points = group_size.min(max_points);
    let row_offsets = match build_uniform_sample_indices(group_size, target_points) {
        Some(indices) => indices,
        None => (0..group_size).collect(),
    };
    // Resolve export geometry once per source so writers can stream rows without
    // repeatedly interpreting spreadsheet layout and sampling settings.
    Ok(OriginExportResolvedSource {
        dataset,
        group_size,
        groups,
        row_offsets,
        start_row,
        x_col,
        x_scale_factor: x_scale_factor_raw
            .filter(|value| value.is_finite() && *value > 0.0)
            .unwrap_or(1.0),
        y_scale_factor: y_scale_factor_raw
            .filter(|value| value.is_finite() && *value > 0.0)
            .unwrap_or(1.0),
        y_transform: y_transform_raw.unwrap_or("").to_string(),
    })
}

fn export_origin_csv_sources(
    sources: Vec<OriginExportResolvedSource>,
    columns: &[OriginExportColumnRequest],
    output_path: &Path,
) -> Result<Value, String> {
    if sources.is_empty() {
        return Err("missing export sources".to_string());
    }
    if columns.is_empty() {
        return Err("missing export columns".to_string());
    }
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let mut writer =
        BufWriter::new(fs::File::create(output_path).map_err(|error| error.to_string())?);
    writer
        .write_all(&[0xEF, 0xBB, 0xBF])
        .map_err(|error| error.to_string())?;
    let mut csv_bytes = 3usize;
    let max_row_count = sources
        .iter()
        .map(|source| source.row_offsets.len())
        .max()
        .unwrap_or(0);
    let mut derivative_cache = HashMap::<(usize, usize, usize), Vec<Option<f64>>>::new();

    // Multiple export columns may ask for gm from the same source/group/Y column.
    for output_row_index in 0..max_row_count {
        if output_row_index > 0 {
            writer.write_all(b"\n").map_err(|error| error.to_string())?;
            csv_bytes += 1;
        }
        for (column_index, column) in columns.iter().enumerate() {
            if column_index > 0 {
                writer.write_all(b",").map_err(|error| error.to_string())?;
                csv_bytes += 1;
            }
            let source_index = column.source_index.unwrap_or(0);
            let source = sources
                .get(source_index)
                .ok_or_else(|| "export column sourceIndex is out of range".to_string())?;
            if output_row_index >= source.row_offsets.len() {
                continue;
            }
            if column.group_index >= source.groups {
                return Err("export column groupIndex is out of range".to_string());
            }
            let row_offset = source.row_offsets[output_row_index];
            let row_index = source.start_row + column.group_index * source.group_size + row_offset;
            let value = if column.kind == "x" {
                cell_number(&source.dataset, row_index, source.x_col)
                    .map(|value| value * source.x_scale_factor)
            } else if column.kind == "y" {
                let y_col = column
                    .y_col
                    .ok_or_else(|| "export y column is missing yCol".to_string())?;
                if source.y_transform == "derivative" {
                    let values = derivative_cache
                        .entry((source_index, column.group_index, y_col))
                        .or_insert_with(|| {
                            compute_origin_export_derivative_values(
                                &source.dataset,
                                source.start_row,
                                source.group_size,
                                column.group_index,
                                source.x_col,
                                y_col,
                                &source.row_offsets,
                            )
                        });
                    values.get(output_row_index).copied().flatten()
                } else {
                    cell_number(&source.dataset, row_index, y_col).map(|value| {
                        transform_origin_export_y(value, source.y_scale_factor, &source.y_transform)
                    })
                }
            } else {
                return Err("unsupported export column kind".to_string());
            };
            if let Some(value) = value.filter(|value| value.is_finite()) {
                let text = value.to_string();
                csv_bytes +=
                    write_csv_cell(&text, &mut writer).map_err(|error| error.to_string())?;
            }
        }
    }
    writer.flush().map_err(|error| error.to_string())?;
    Ok(json!({
        "bytes": csv_bytes,
        "columns": columns.len(),
        "path": output_path.to_string_lossy(),
        "rows": max_row_count,
        "sources": sources.len(),
    }))
}

fn compute_origin_metric_series_points(
    source: &OriginExportResolvedSource,
    group_index: usize,
    y_col: usize,
) -> Vec<(f64, f64)> {
    source
        .row_offsets
        .iter()
        .filter_map(|row_offset| {
            let row_index = source.start_row + group_index * source.group_size + *row_offset;
            let x = cell_number(&source.dataset, row_index, source.x_col)?;
            let y = cell_number(&source.dataset, row_index, y_col)?;
            if x.is_finite() && y.is_finite() {
                Some((x, y))
            } else {
                None
            }
        })
        .collect()
}

fn linear_regression_xy(points: &[(f64, f64)]) -> Option<(f64, f64, f64)> {
    let n = points.len();
    if n < 3 {
        return None;
    }
    let mut sum_x = 0.0;
    let mut sum_y = 0.0;
    let mut sum_xx = 0.0;
    let mut sum_xy = 0.0;
    let mut sum_yy = 0.0;
    for (x, y) in points {
        sum_x += *x;
        sum_y += *y;
        sum_xx += *x * *x;
        sum_xy += *x * *y;
        sum_yy += *y * *y;
    }
    let n_f = n as f64;
    let denom = n_f * sum_xx - sum_x * sum_x;
    if !denom.is_finite() || denom == 0.0 {
        return None;
    }
    let slope = (n_f * sum_xy - sum_x * sum_y) / denom;
    let intercept = (sum_y - slope * sum_x) / n_f;
    let ss_tot = sum_yy - (sum_y * sum_y) / n_f;
    let mut ss_res = 0.0;
    for (x, y) in points {
        let residual = *y - (slope * *x + intercept);
        ss_res += residual * residual;
    }
    let r2 = if ss_tot > 0.0 {
        1.0 - ss_res / ss_tot
    } else {
        1.0
    };
    Some((slope, intercept, r2))
}

fn pick_origin_vth_linear_fit(
    points: &[(f64, f64)],
    branch: &'static str,
) -> Option<OriginExportVthFit> {
    let mut sorted = points
        .iter()
        .copied()
        .filter(|(x, y)| x.is_finite() && y.is_finite() && *y > 0.0)
        .collect::<Vec<_>>();
    sorted.sort_by(|a, b| a.0.total_cmp(&b.0));
    if sorted.len() < 5 {
        return None;
    }
    let min_window = 5usize.min(sorted.len());
    let max_window = 16usize.min(sorted.len());
    let max_y = sorted
        .iter()
        .map(|(_, y)| *y)
        .fold(f64::NEG_INFINITY, f64::max);
    let mut best: Option<(OriginExportVthFit, f64)> = None;
    for window_size in min_window..=max_window {
        for start in 0..=sorted.len().saturating_sub(window_size) {
            let window = &sorted[start..start + window_size];
            let Some((slope, intercept, r2)) = linear_regression_xy(window) else {
                continue;
            };
            if branch == "electron" && slope <= 0.0 {
                continue;
            }
            if branch == "hole" && slope >= 0.0 {
                continue;
            }
            let y_min = window.iter().map(|(_, y)| *y).fold(f64::INFINITY, f64::min);
            let y_max = window
                .iter()
                .map(|(_, y)| *y)
                .fold(f64::NEG_INFINITY, f64::max);
            let y_span = y_max - y_min;
            if max_y > 0.0 && y_span / max_y < 0.12 {
                continue;
            }
            let vth = -intercept / slope;
            if !vth.is_finite() {
                continue;
            }
            let x1 = window[0].0;
            let x2 = window[window.len() - 1].0;
            let y1 = slope * x1 + intercept;
            let y2 = slope * x2 + intercept;
            if !y1.is_finite() || !y2.is_finite() {
                continue;
            }
            let score =
                r2 + 0.08f64.min(y_span / max_y.max(1e-300) * 0.08) + window_size as f64 * 0.002;
            if best
                .as_ref()
                .map(|(_, best_score)| score > *best_score)
                .unwrap_or(true)
            {
                best = Some((OriginExportVthFit { branch, vth }, score));
            }
        }
    }
    best.map(|(fit, _)| fit)
}

fn compute_origin_vth_sqrt_fits(points: &[(f64, f64)]) -> Vec<OriginExportVthFit> {
    let sqrt_points = points
        .iter()
        .filter_map(|(x, y)| {
            if x.is_finite() && y.is_finite() {
                Some((*x, y.abs().sqrt()))
            } else {
                None
            }
        })
        .collect::<Vec<_>>();
    if sqrt_points.len() < 5 {
        return Vec::new();
    }
    let Some((valley_x, _)) = sqrt_points
        .iter()
        .copied()
        .min_by(|a, b| a.1.total_cmp(&b.1))
    else {
        return Vec::new();
    };
    let hole_points = sqrt_points
        .iter()
        .copied()
        .filter(|(x, _)| *x <= valley_x)
        .collect::<Vec<_>>();
    let electron_points = sqrt_points
        .iter()
        .copied()
        .filter(|(x, _)| *x >= valley_x)
        .collect::<Vec<_>>();
    [
        pick_origin_vth_linear_fit(&hole_points, "hole"),
        pick_origin_vth_linear_fit(&electron_points, "electron"),
    ]
    .into_iter()
    .flatten()
    .collect()
}

fn origin_json_number(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite())
        .map(|value| value.to_string())
        .unwrap_or_default()
}

fn origin_ss_fit_value(value: &Value, key: &str) -> String {
    let strict_ok = value
        .get("strict")
        .and_then(|strict| strict.get("ok"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let suggested_ok = value
        .get("suggested")
        .and_then(|suggested| suggested.get("ok"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let source = if strict_ok {
        value.get("strict")
    } else if suggested_ok {
        value.get("suggested")
    } else {
        None
    };
    source
        .and_then(|fit| fit.get(key))
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite())
        .map(|value| value.to_string())
        .unwrap_or_default()
}

fn export_origin_metrics_csv_sources(
    sources: &[OriginExportResolvedSource],
    metric_series: &[OriginExportMetricSeriesRequest],
    metric_kind: &str,
    source_file: Option<&AnalysisSourceFile>,
    output_path: &Path,
) -> Result<Value, String> {
    if sources.is_empty() {
        return Err("missing export sources".to_string());
    }
    if metric_series.is_empty() {
        return Err("missing export metric series".to_string());
    }
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let mut writer =
        BufWriter::new(fs::File::create(output_path).map_err(|error| error.to_string())?);
    writer
        .write_all(&[0xEF, 0xBB, 0xBF])
        .map_err(|error| error.to_string())?;
    let mut csv_bytes = 3usize;

    // Metrics exports are one row per selected series, computed from the same
    // resolved source data used by regular chart CSV export.
    for (row_index, series) in metric_series.iter().enumerate() {
        if row_index > 0 {
            writer.write_all(b"\n").map_err(|error| error.to_string())?;
            csv_bytes += 1;
        }
        let source_index = series.source_index.unwrap_or(0);
        let source = sources
            .get(source_index)
            .ok_or_else(|| "export metric sourceIndex is out of range".to_string())?;
        if series.group_index >= source.groups {
            return Err("export metric groupIndex is out of range".to_string());
        }
        let derivative = compute_origin_export_derivative_values(
            &source.dataset,
            source.start_row,
            source.group_size,
            series.group_index,
            source.x_col,
            series.y_col,
            &source.row_offsets,
        );
        let mut max_abs = f64::NEG_INFINITY;
        let mut x_at_max: Option<f64> = None;
        for (index, value) in derivative.iter().enumerate() {
            let Some(y) = value else {
                continue;
            };
            let abs = y.abs();
            if abs > max_abs {
                max_abs = abs;
                let row_offset = source.row_offsets[index];
                let source_row =
                    source.start_row + series.group_index * source.group_size + row_offset;
                x_at_max = cell_number(&source.dataset, source_row, source.x_col);
            }
        }
        let supports_transfer_metrics =
            metric_kind == "transfer" && analysis::is_transfer_like_source_file(source_file);
        let cells = if metric_kind == "transfer" {
            let points =
                compute_origin_metric_series_points(source, series.group_index, series.y_col);
            let x_values = points.iter().map(|(x, _)| *x).collect::<Vec<_>>();
            let y_values = points.iter().map(|(_, y)| *y).collect::<Vec<_>>();
            let base = if supports_transfer_metrics {
                analysis::compute_base_current_metrics(&x_values, &y_values, source_file)
            } else {
                Value::Null
            };
            let ss_fit = if supports_transfer_metrics {
                analysis::compute_subthreshold_swing_fit_auto(&x_values, &y_values)
            } else {
                Value::Null
            };
            let vth_fits = if supports_transfer_metrics {
                compute_origin_vth_sqrt_fits(&points)
            } else {
                Vec::new()
            };
            let electron_vth = vth_fits
                .iter()
                .find(|fit| fit.branch == "electron")
                .map(|fit| fit.vth);
            let hole_vth = vth_fits
                .iter()
                .find(|fit| fit.branch == "hole")
                .map(|fit| fit.vth);
            vec![
                series.label.clone(),
                if max_abs.is_finite() {
                    max_abs.to_string()
                } else {
                    String::new()
                },
                x_at_max
                    .filter(|value| value.is_finite())
                    .map(|value| value.to_string())
                    .unwrap_or_default(),
                electron_vth
                    .or(hole_vth)
                    .filter(|value| value.is_finite())
                    .map(|value| value.to_string())
                    .unwrap_or_default(),
                electron_vth
                    .filter(|value| value.is_finite())
                    .map(|value| value.to_string())
                    .unwrap_or_default(),
                hole_vth
                    .filter(|value| value.is_finite())
                    .map(|value| value.to_string())
                    .unwrap_or_default(),
                origin_ss_fit_value(&ss_fit, "ss"),
                origin_ss_fit_value(&ss_fit, "x1"),
                origin_ss_fit_value(&ss_fit, "x2"),
                origin_json_number(&base, "ion"),
                origin_json_number(&base, "xAtIon"),
                origin_json_number(&base, "ioff"),
                origin_json_number(&base, "xAtIoff"),
                origin_json_number(&base, "ionIoff"),
            ]
        } else {
            vec![
                series.label.clone(),
                if max_abs.is_finite() {
                    max_abs.to_string()
                } else {
                    String::new()
                },
                x_at_max
                    .filter(|value| value.is_finite())
                    .map(|value| value.to_string())
                    .unwrap_or_default(),
            ]
        };
        for (col_index, value) in cells.iter().enumerate() {
            if col_index > 0 {
                writer.write_all(b",").map_err(|error| error.to_string())?;
                csv_bytes += 1;
            }
            csv_bytes += write_csv_cell(value, &mut writer).map_err(|error| error.to_string())?;
        }
    }
    writer.flush().map_err(|error| error.to_string())?;
    Ok(json!({
        "bytes": csv_bytes,
        "columns": if metric_kind == "transfer" { 14 } else { 3 },
        "metricKind": metric_kind,
        "path": output_path.to_string_lossy(),
        "rows": metric_series.len(),
        "sources": sources.len(),
    }))
}

fn resolve_import_file_name(path: &Path, file_name: Option<&str>) -> String {
    file_name
        .filter(|value| !value.trim().is_empty())
        .map(|value| value.trim().to_string())
        .unwrap_or_else(|| {
            path.file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("")
                .to_string()
        })
}

fn build_import_prepare_result(path: &Path, file_name: String) -> Result<Value, String> {
    let import_result = load_import_dataset(path, IMPORT_TABLE_MODEL_SEED_PREVIEW_ROWS)?;
    let Some(summary) = import_result.summary else {
        return Ok(json!({
            "columnCount": 0,
            "fileName": file_name,
            "health": import_result.health,
            "maxCellLengths": Vec::<usize>::new(),
            "rowCount": 0,
            "templateEligibility": "notEligible",
        }));
    };

    let preview_rows = summary.preview_rows;
    Ok(json!({
        "tableModelSeed": build_import_table_model_seed(
            &file_name,
            preview_rows.clone(),
        ),
        "columnCount": summary.column_count,
        "fileName": file_name,
        "health": import_result.health,
        "maxCellLengths": summary.max_cell_lengths,
        "previewRows": preview_rows,
        "rowCount": summary.row_count,
    }))
}

fn import_batch_duration_ms(started: Instant) -> f64 {
    started.elapsed().as_secs_f64() * 1000.0
}

fn build_import_batch_failure(code: &str, message: String, started: Instant) -> Value {
    json!({
        "ok": false,
        "code": code,
        "durationMs": import_batch_duration_ms(started),
        "message": message,
    })
}

fn prepare_import_table_model_seed_batch_entry(entry: &ImportTableModelSeedBatchEntry) -> Value {
    let started = Instant::now();
    let path_text = entry.path.trim();
    if path_text.is_empty() {
        return build_import_batch_failure(
            "INVALID_IMPORT_PATH",
            "missing path".to_string(),
            started,
        );
    }

    let path = PathBuf::from(path_text);
    let file_name = resolve_import_file_name(&path, entry.file_name.as_deref());
    match build_import_prepare_result(&path, file_name) {
        Ok(mut value) => {
            if let Some(object) = value.as_object_mut() {
                object.insert("ok".to_string(), json!(true));
                object.insert(
                    "durationMs".to_string(),
                    json!(import_batch_duration_ms(started)),
                );
                value
            } else {
                json!({
                    "ok": true,
                    "durationMs": import_batch_duration_ms(started),
                    "value": value,
                })
            }
        }
        Err(message) => build_import_batch_failure("RUST_IMPORT_PREPARE_FAILED", message, started),
    }
}

fn resolve_import_table_model_seed_batch_threads(
    entry_count: usize,
    requested_threads: Option<usize>,
) -> usize {
    if entry_count < IMPORT_TABLE_MODEL_SEED_BATCH_PARALLEL_MIN_ENTRIES {
        return 1;
    }

    let available_threads = thread::available_parallelism()
        .map(|value| value.get())
        .unwrap_or(2)
        .max(1);
    let default_threads = available_threads
        .saturating_sub(1)
        .max(1)
        .min(IMPORT_TABLE_MODEL_SEED_BATCH_MAX_THREADS);
    requested_threads
        .unwrap_or(default_threads)
        .max(1)
        .min(available_threads)
        .min(IMPORT_TABLE_MODEL_SEED_BATCH_MAX_THREADS)
        .min(entry_count)
}

fn prepare_import_table_model_seed_batch_entries(
    entries: &[ImportTableModelSeedBatchEntry],
    requested_threads: Option<usize>,
) -> (Vec<Value>, usize) {
    let worker_count = resolve_import_table_model_seed_batch_threads(entries.len(), requested_threads);
    if worker_count <= 1 {
        return (
            entries
                .iter()
                .map(prepare_import_table_model_seed_batch_entry)
                .collect::<Vec<_>>(),
            1,
        );
    }

    let next_index = AtomicUsize::new(0);
    let results = Mutex::new(
        (0..entries.len())
            .map(|_| None)
            .collect::<Vec<Option<Value>>>(),
    );
    thread::scope(|scope| {
        for _ in 0..worker_count {
            scope.spawn(|| {
                loop {
                    let index = next_index.fetch_add(1, Ordering::Relaxed);
                    let Some(entry) = entries.get(index) else {
                        break;
                    };
                    let result = prepare_import_table_model_seed_batch_entry(entry);
                    results.lock().expect("batch result lock poisoned")[index] = Some(result);
                }
            });
        }
    });

    let values = results
        .into_inner()
        .expect("batch result lock poisoned")
        .into_iter()
        .map(|result| {
            result.unwrap_or_else(|| {
                json!({
                    "ok": false,
                    "code": "RUST_IMPORT_PREPARE_FAILED",
                    "durationMs": 0,
                    "message": "Rust import preparation did not produce a result.",
                })
            })
        })
        .collect::<Vec<_>>();
    (values, worker_count)
}

fn handle_request(
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
                    let dataset = load_dataset(&path, &file_name)?;
                    let result = dataset.preview_result(file_id, request.seed_rows.unwrap_or(400));
                    cache.insert(file_id.to_string(), dataset);
                    Ok(result)
                }
                (Err(error), _) | (_, Err(error)) => Err(error),
            }
        }
        "prepareImport" => {
            let path_text = request
                .path
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| "missing path".to_string())?;
            let path = PathBuf::from(path_text);
            let file_name = resolve_import_file_name(&path, request.file_name.as_deref());
            build_import_prepare_result(&path, file_name)
        }
        "prepareImportBatch" => {
            let started = Instant::now();
            let entries = request
                .entries
                .as_ref()
                .filter(|entries| !entries.is_empty())
                .ok_or_else(|| "missing entries".to_string())?;
            let (results, parallelism) =
                prepare_import_table_model_seed_batch_entries(entries, request.threads);
            Ok(json!({
                "durationMs": import_batch_duration_ms(started),
                "parallelism": parallelism,
                "results": results,
            }))
        }
        "resolveStructuredContent" => {
            let path_text = request
                .path
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| "missing path".to_string())?;
            structured_content::resolve_structured_content(&PathBuf::from(path_text))
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
                let dataset = load_dataset(&path, &file_name)?;
                cache.insert(file_id.to_string(), dataset);
            }
            let dataset = cache
                .get(file_id)
                .ok_or_else(|| "file is not open in engine".to_string())?;
            let config = request
                .config
                .as_ref()
                .ok_or_else(|| "missing config".to_string())?;
            process_configured_file(
                file_id,
                dataset,
                config,
                request.curve_filter_key.as_deref(),
                request.curve_filter_field.as_deref(),
                request.max_points,
                request.calculation_cache_path.as_deref(),
            )
        }
        "analyzeSeriesBatch" => {
            let series = request
                .series
                .as_deref()
                .filter(|series| !series.is_empty())
                .ok_or_else(|| "missing series".to_string())?;
            Ok(analysis::analyze_series_batch_result(
                request.file_id.as_deref(),
                series,
                request.x_groups.as_deref(),
                request.source_file.as_ref(),
            ))
        }
        "calculateRc" => {
            let devices = request
                .rc_devices
                .as_deref()
                .filter(|devices| !devices.is_empty())
                .ok_or_else(|| "missing rcDevices".to_string())?;
            Ok(rc::calculate_rc(devices, request.rc_options.as_ref()))
        }
        "exportOriginCsv" => {
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
                let dataset = load_dataset(&path, &file_name)?;
                cache.insert(file_id.to_string(), dataset);
            }
            let dataset = cache
                .get(file_id)
                .ok_or_else(|| "file is not open in engine".to_string())?;
            let config = request
                .config
                .as_ref()
                .ok_or_else(|| "missing config".to_string())?;
            let columns = request.columns.as_deref().unwrap_or(&[]);
            let output_path = request
                .output_path
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .map(PathBuf::from)
                .ok_or_else(|| "missing outputPath".to_string())?;
            if let Some(sources) = request.sources.as_deref().filter(|items| !items.is_empty()) {
                let mut resolved_sources = Vec::<OriginExportResolvedSource>::new();
                for source in sources {
                    let path = PathBuf::from(&source.path);
                    let file_name = source.file_name.clone().unwrap_or_else(|| {
                        path.file_name()
                            .and_then(|value| value.to_str())
                            .unwrap_or("")
                            .to_string()
                    });
                    let dataset = if source.file_id.trim().is_empty() {
                        load_dataset(&path, &file_name)?
                    } else if let Some(cached) = cache.get(source.file_id.trim()) {
                        cached.clone()
                    } else {
                        let loaded = load_dataset(&path, &file_name)?;
                        cache.insert(source.file_id.trim().to_string(), loaded.clone());
                        loaded
                    };
                    resolved_sources.push(resolve_origin_export_source(
                        dataset,
                        &source.config,
                        source.max_points.or(request.max_points),
                        source.x_scale_factor,
                        source.y_scale_factor,
                        source.y_transform.as_deref(),
                    )?);
                }
                if matches!(request.metric_kind.as_deref(), Some("output" | "transfer")) {
                    let metric_series = request
                        .metric_series
                        .as_deref()
                        .filter(|items| !items.is_empty())
                        .ok_or_else(|| "missing export metric series".to_string())?;
                    export_origin_metrics_csv_sources(
                        &resolved_sources,
                        metric_series,
                        request.metric_kind.as_deref().unwrap_or("output"),
                        request.source_file.as_ref(),
                        &output_path,
                    )
                } else {
                    export_origin_csv_sources(resolved_sources, columns, &output_path)
                }
            } else {
                export_origin_csv_file(
                    dataset,
                    config,
                    columns,
                    &output_path,
                    request.max_points,
                    request.x_scale_factor,
                    request.y_scale_factor,
                    request.y_transform.as_deref(),
                )
            }
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

    // The JS caller uses newline-delimited JSON; each input line gets exactly one
    // response line so a single worker process can handle many requests.
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
            Ok(request) => handle_request(&mut cache, request),
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

fn helper_version_json() -> Value {
    json!({
        "name": env!("CARGO_PKG_NAME"),
        "version": env!("CARGO_PKG_VERSION"),
        "binary": "conductor-rs",
        "protocol": "stdio-worker",
        "platform": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
    })
}

fn helper_doctor_json() -> Value {
    json!({
        "ok": true,
        "helper": helper_version_json(),
        "capabilities": [
            "stdio-worker",
            "import-table-model-seed",
            "csv-preview",
            "excel-conversion",
            "origin-export",
        ],
    })
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
        if arg == "--version-json" {
            println!("{}", helper_version_json());
            return;
        }
        if arg == "--doctor" {
            println!("{}", helper_doctor_json());
            return;
        }
        if arg == "--stdio-worker" || arg == "--stdio-engine" {
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
                    let table_model_seed = build_import_table_model_seed(
                        result
                            .path
                            .file_name()
                            .and_then(|value| value.to_str())
                            .unwrap_or(""),
                        result.table_model_seed_rows.clone(),
                    );
                    let manifest = json!({
                        "tableModelSeed": table_model_seed,
                        "cells": result.stats.cells,
                        "columnCount": result.stats.column_count,
                        "convertMs": result.stats.convert_ms,
                        "csvBytes": result.stats.csv_bytes,
                        "maxCellLengths": result.stats.max_cell_lengths,
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
        roots = env::var("CONDUCTOR_BENCH_ROOTS")
            .ok()
            .map(|value| {
                value
                    .split(if cfg!(windows) { ';' } else { ':' })
                    .map(|item| item.trim().to_string())
                    .filter(|item| !item.is_empty())
                    .collect::<Vec<String>>()
            })
            .unwrap_or_default();
    }
    if roots.is_empty() {
        eprintln!("[rust-bench] provide data roots as arguments or set CONDUCTOR_BENCH_ROOTS");
        std::process::exit(2);
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
