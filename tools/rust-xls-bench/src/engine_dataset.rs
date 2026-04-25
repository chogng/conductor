use calamine::{Reader, open_workbook_auto};
use serde_json::{Value, json};
use std::{
    cell::{Ref, RefCell},
    collections::HashMap,
    path::Path,
};

#[derive(Clone)]
pub struct EngineDataset {
    pub column_count: usize,
    pub file_name: String,
    pub max_cell_lengths: Vec<usize>,
    pub rows: Vec<Vec<String>>,
    numeric_column_cache: RefCell<HashMap<usize, Vec<Option<f64>>>>,
}

impl EngineDataset {
    pub fn from_rows(file_name: String, rows: Vec<Vec<String>>) -> EngineDataset {
        let mut column_count = 0usize;
        let mut max_cell_lengths = Vec::<usize>::new();
        for row in &rows {
            update_dataset_meta(row, &mut column_count, &mut max_cell_lengths);
        }

        EngineDataset {
            column_count,
            file_name,
            max_cell_lengths,
            numeric_column_cache: RefCell::new(HashMap::new()),
            rows,
        }
    }

    pub fn preview_result(&self, file_id: &str, seed_rows: usize) -> Value {
        let seed_count = seed_rows.min(self.rows.len());
        json!({
            "fileId": file_id,
            "fileName": self.file_name,
            "rowCount": self.rows.len(),
            "columnCount": self.column_count,
            "maxCellLengths": self.max_cell_lengths,
            "seedRows": self.rows.iter().take(seed_count).collect::<Vec<_>>(),
            "seedStartRow": 0,
        })
    }

    pub fn preview_meta_result(&self, file_id: &str) -> Value {
        json!({
            "fileId": file_id,
            "fileName": self.file_name,
            "rowCount": self.rows.len(),
            "columnCount": self.column_count,
            "maxCellLengths": self.max_cell_lengths,
        })
    }

    pub fn cell_result(&self, row_index: usize, col_index: usize) -> Result<Value, String> {
        let row = self
            .rows
            .get(row_index)
            .ok_or_else(|| "cell row not found".to_string())?;
        let value = row.get(col_index).cloned().unwrap_or_default();
        let number_value = self.cell_number(row_index, col_index);
        Ok(json!({
            "rowIndex": row_index,
            "colIndex": col_index,
            "value": value,
            "numberValue": number_value,
        }))
    }

    pub fn cell_number(&self, row_index: usize, col_index: usize) -> Option<f64> {
        self.ensure_numeric_column(col_index);
        self.numeric_column_cache
            .borrow()
            .get(&col_index)
            .and_then(|column| column.get(row_index))
            .copied()
            .flatten()
    }

    pub fn column_number_values_ref(&self, col_index: usize) -> Ref<'_, Vec<Option<f64>>> {
        self.ensure_numeric_column(col_index);
        Ref::map(self.numeric_column_cache.borrow(), |cache| {
            cache
                .get(&col_index)
                .expect("numeric column cache should exist after ensure_numeric_column")
        })
    }

    pub fn has_numeric_rows(
        &self,
        data_start_row_index: usize,
        col_index: usize,
        minimum_count: usize,
    ) -> bool {
        let values = self.column_number_values_ref(col_index);
        let mut count = 0usize;
        for value in values.iter().skip(data_start_row_index) {
            if value.is_some() {
                count += 1;
                if count >= minimum_count {
                    return true;
                }
            }
        }
        false
    }

    fn ensure_numeric_column(&self, col_index: usize) {
        if self.numeric_column_cache.borrow().contains_key(&col_index) {
            return;
        }

        let values = self
            .rows
            .iter()
            .map(|row| {
                row.get(col_index)
                    .and_then(|value| parse_strict_finite_number(value))
            })
            .collect::<Vec<_>>();

        self.numeric_column_cache
            .borrow_mut()
            .entry(col_index)
            .or_insert(values);
    }
}

pub fn is_excel_path(path: &Path) -> bool {
    match path.extension().and_then(|value| value.to_str()) {
        Some(ext) => {
            let lower = ext.to_ascii_lowercase();
            lower == "xls" || lower == "xlsx"
        }
        None => false,
    }
}

fn is_csv_path(path: &Path) -> bool {
    match path.extension().and_then(|value| value.to_str()) {
        Some(ext) => ext.eq_ignore_ascii_case("csv"),
        None => false,
    }
}

fn update_dataset_meta(
    row: &[String],
    column_count: &mut usize,
    max_cell_lengths: &mut Vec<usize>,
) {
    if row.len() > *column_count {
        *column_count = row.len();
        max_cell_lengths.resize(*column_count, 0);
    }
    for (index, value) in row.iter().enumerate() {
        let len = value.chars().count();
        if len > max_cell_lengths[index] {
            max_cell_lengths[index] = len;
        }
    }
}

fn load_excel_rows(path: &Path) -> Result<Vec<Vec<String>>, String> {
    let mut workbook = open_workbook_auto(path).map_err(|error| error.to_string())?;
    let sheet_name = workbook
        .sheet_names()
        .first()
        .cloned()
        .ok_or_else(|| "workbook has no sheet".to_string())?;
    let range = workbook
        .worksheet_range(&sheet_name)
        .map_err(|error| error.to_string())?;

    let mut rows = Vec::<Vec<String>>::new();
    for row in range.rows() {
        let values: Vec<String> = row.iter().map(|cell| cell.to_string()).collect();
        if values.iter().all(|value| value.trim().is_empty()) {
            continue;
        }
        rows.push(values);
    }
    Ok(rows)
}

fn load_csv_rows(path: &Path) -> Result<Vec<Vec<String>>, String> {
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(false)
        .flexible(true)
        .from_path(path)
        .map_err(|error| error.to_string())?;
    let mut rows = Vec::<Vec<String>>::new();
    for record in reader.records() {
        let record = record.map_err(|error| error.to_string())?;
        let row: Vec<String> = record.iter().map(|value| value.to_string()).collect();
        if row.iter().all(|value| value.trim().is_empty()) {
            continue;
        }
        rows.push(row);
    }
    Ok(rows)
}

pub fn load_engine_dataset(path: &Path, file_name: &str) -> Result<EngineDataset, String> {
    let rows = if is_excel_path(path) {
        load_excel_rows(path)?
    } else if is_csv_path(path) {
        load_csv_rows(path)?
    } else {
        return Err("unsupported file type".to_string());
    };

    Ok(EngineDataset::from_rows(file_name.to_string(), rows))
}

pub fn preview_result(file_id: &str, dataset: &EngineDataset, seed_rows: usize) -> Value {
    dataset.preview_result(file_id, seed_rows)
}

fn parse_strict_finite_number(value: &str) -> Option<f64> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    match trimmed.parse::<f64>() {
        Ok(number) if number.is_finite() => Some(number),
        _ => None,
    }
}
