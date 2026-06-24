use serde_json::Value;

pub const IMPORT_TABLE_FACTS_PREVIEW_ROWS: usize = 512;

pub fn build_import_table_facts_seed(file_name: &str, rows: Vec<Vec<String>>) -> Value {
    crate::table_facts::build_import_table_facts_seed(file_name, rows)
}
