use serde_json::Value;

pub const IMPORT_TABLE_MODEL_SEED_PREVIEW_ROWS: usize = 512;

pub fn build_import_table_model_seed(file_name: &str, rows: Vec<Vec<String>>) -> Value {
    crate::table_model_seed::build_import_table_model_seed(file_name, rows)
}
