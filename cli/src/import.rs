use serde_json::Value;

pub fn build_import_assessment(file_name: &str, rows: Vec<Vec<String>>) -> Value {
    crate::assessment::assess_import_rows(file_name, rows)
}
