use crate::dataset::EngineDataset;
use crate::detect::classify_auto_curve;
use crate::detect::extract_auto_metadata;
use crate::detect::find_header_row_index;
use crate::detect::row_trimmed;
use serde_json::json;
use serde_json::Value;

pub fn build_import_assessment(file_name: &str, rows: Vec<Vec<String>>) -> Value {
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
