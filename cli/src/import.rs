use serde_json::Value;

pub const IMPORT_ASSESSMENT_PREVIEW_ROWS: usize = 512;

pub fn build_import_assessment(file_name: &str, rows: Vec<Vec<String>>) -> Value {
    crate::assessment::assess_import_rows(file_name, rows)
}
