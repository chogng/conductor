use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineCellRequest {
    pub col_index: usize,
    pub row_index: usize,
}
