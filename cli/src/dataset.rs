use encoding_rs::GB18030;
use serde_json::Value;
use serde_json::json;
use std::cell::Ref;
use std::cell::RefCell;
use std::collections::HashMap;
use std::path::Path;

const MAX_CONTROL_CHAR_RATIO: f64 = 0.02;
const BINARY_MAGIC_HEADERS: &[&[u8]] = &[
    &[0x50, 0x4b, 0x03, 0x04],
    &[0x50, 0x4b, 0x05, 0x06],
    &[0x50, 0x4b, 0x07, 0x08],
    &[0xd0, 0xcf, 0x11, 0xe0],
    &[0x1f, 0x8b],
];

pub struct ImportDatasetResult {
    pub health: Value,
    pub summary: Option<ImportDatasetSummary>,
}

pub struct ImportDatasetSummary {
    pub column_count: usize,
    pub max_cell_lengths: Vec<usize>,
    pub preview_rows: Vec<Vec<String>>,
    pub row_count: usize,
}

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
        // Numeric values are cached per column because many analyses scan the same
        // column repeatedly while searching for metadata or segment boundaries.
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

        // Parse once and store an aligned optional numeric view of the whole column.
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

fn load_csv_rows(path: &Path) -> Result<Vec<Vec<String>>, String> {
    let csv_text = read_csv_text(path)?;
    parse_csv_rows(&csv_text)
}

fn read_csv_text(path: &Path) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|error| error.to_string())?;
    decode_csv_text(&bytes)
        .map(|decode| decode.text)
        .map_err(|health| health.to_string())
}

pub fn load_dataset(path: &Path, file_name: &str) -> Result<EngineDataset, String> {
    let rows = if is_csv_path(path) {
        load_csv_rows(path)?
    } else {
        return Err("analysis dataset only supports CSV input".to_string());
    };

    Ok(EngineDataset::from_rows(file_name.to_string(), rows))
}

pub fn load_import_dataset(
    path: &Path,
    preview_row_limit: usize,
) -> Result<ImportDatasetResult, String> {
    if !is_csv_path(path) {
        return Err("analysis dataset only supports CSV input".to_string());
    }

    let bytes = std::fs::read(path).map_err(|error| error.to_string())?;
    if bytes.is_empty() {
        return Ok(ImportDatasetResult {
            health: json!({
                "state": "empty",
                "message": "File is empty.",
            }),
            summary: None,
        });
    }

    if has_binary_magic_header(&bytes) || is_binary_like(&bytes) {
        return Ok(ImportDatasetResult {
            health: decode_failed_health(
                "File content appears to be binary.",
                true,
                0.0,
                measure_control_byte_ratio(&bytes),
            ),
            summary: None,
        });
    }

    let decode = match decode_csv_text(&bytes) {
        Ok(decode) => decode,
        Err(health) => {
            return Ok(ImportDatasetResult {
                health,
                summary: None,
            });
        }
    };
    let summary = parse_csv_summary(&decode.text, preview_row_limit)?;
    if summary.row_count == 0 {
        return Ok(ImportDatasetResult {
            health: json!({
                "state": "empty",
                "message": "File is empty.",
            }),
            summary: None,
        });
    }

    Ok(ImportDatasetResult {
        health: json!({
            "state": "ok",
            "message": "",
            "decode": {
                "encoding": decode.encoding,
                "confidence": decode.confidence,
                "replacementCharRatio": 0,
                "controlCharRatio": decode.control_char_ratio,
                "binaryLike": false,
            },
        }),
        summary: Some(summary),
    })
}

struct CsvDecodeResult {
    confidence: f64,
    control_char_ratio: f64,
    encoding: &'static str,
    text: String,
}

fn parse_csv_rows(csv_text: &str) -> Result<Vec<Vec<String>>, String> {
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(false)
        .flexible(true)
        .from_reader(csv_text.as_bytes());
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

fn parse_csv_summary(
    csv_text: &str,
    preview_row_limit: usize,
) -> Result<ImportDatasetSummary, String> {
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(false)
        .flexible(true)
        .from_reader(csv_text.as_bytes());
    let mut column_count = 0usize;
    let mut max_cell_lengths = Vec::<usize>::new();
    let mut preview_rows = Vec::<Vec<String>>::new();
    let mut row_count = 0usize;
    for record in reader.records() {
        let record = record.map_err(|error| error.to_string())?;
        let row: Vec<String> = record.iter().map(|value| value.to_string()).collect();
        if row.iter().all(|value| value.trim().is_empty()) {
            continue;
        }

        update_dataset_meta(&row, &mut column_count, &mut max_cell_lengths);
        if preview_rows.len() < preview_row_limit {
            preview_rows.push(row);
        }
        row_count += 1;
    }
    Ok(ImportDatasetSummary {
        column_count,
        max_cell_lengths,
        preview_rows,
        row_count,
    })
}

fn decode_csv_text(bytes: &[u8]) -> Result<CsvDecodeResult, Value> {
    match std::str::from_utf8(bytes) {
        Ok(text) => Ok(create_decode_result(text.to_string(), "utf-8", bytes)),
        Err(_) => {
            let (decoded, _encoding_used, had_errors) = GB18030.decode(bytes);
            let text = decoded.into_owned();
            let quality = measure_text_quality(&text, bytes);
            if had_errors {
                Err(decode_failed_health(
                    "Text encoding or table structure is not reliable.",
                    false,
                    quality.replacement_char_ratio,
                    quality.control_char_ratio,
                ))
            } else {
                Ok(CsvDecodeResult {
                    confidence: quality.confidence,
                    control_char_ratio: quality.control_char_ratio,
                    encoding: "gbk",
                    text,
                })
            }
        }
    }
}

fn create_decode_result(text: String, encoding: &'static str, bytes: &[u8]) -> CsvDecodeResult {
    let quality = measure_text_quality(&text, bytes);
    CsvDecodeResult {
        confidence: quality.confidence,
        control_char_ratio: quality.control_char_ratio,
        encoding,
        text,
    }
}

struct TextQuality {
    confidence: f64,
    control_char_ratio: f64,
    replacement_char_ratio: f64,
}

fn measure_text_quality(text: &str, bytes: &[u8]) -> TextQuality {
    let replacement_char_ratio = measure_replacement_char_ratio(text);
    let control_char_ratio = measure_control_char_ratio(text);
    let confidence = if bytes.is_empty() {
        1.0
    } else {
        (1.0 - replacement_char_ratio * 100.0 - control_char_ratio * 10.0)
            .max(0.0)
            .min(1.0)
    };
    TextQuality {
        confidence,
        control_char_ratio,
        replacement_char_ratio,
    }
}

fn has_binary_magic_header(bytes: &[u8]) -> bool {
    BINARY_MAGIC_HEADERS
        .iter()
        .any(|header| bytes.starts_with(header))
}

fn is_binary_like(bytes: &[u8]) -> bool {
    let mut null_count = 0usize;
    let mut control_count = 0usize;
    for byte in bytes {
        if *byte == 0 {
            null_count += 1;
        } else if *byte < 0x20 && *byte != b'\t' && *byte != b'\n' && *byte != b'\r' {
            control_count += 1;
        }
    }
    null_count > 0 || (control_count as f64) / (bytes.len().max(1) as f64) > MAX_CONTROL_CHAR_RATIO
}

fn measure_control_byte_ratio(bytes: &[u8]) -> f64 {
    let control_count = bytes
        .iter()
        .filter(|byte| **byte < 0x20 && **byte != b'\t' && **byte != b'\n' && **byte != b'\r')
        .count();
    (control_count as f64) / (bytes.len().max(1) as f64)
}

fn measure_control_char_ratio(text: &str) -> f64 {
    if text.is_empty() {
        return 0.0;
    }

    let control_count = text
        .chars()
        .filter(|ch| ch.is_control() && *ch != '\t' && *ch != '\n' && *ch != '\r')
        .count();
    (control_count as f64) / (text.chars().count().max(1) as f64)
}

fn measure_replacement_char_ratio(text: &str) -> f64 {
    if text.is_empty() {
        return 0.0;
    }

    let replacement_count = text.chars().filter(|ch| *ch == '\u{fffd}').count();
    (replacement_count as f64) / (text.chars().count().max(1) as f64)
}

fn decode_failed_health(
    reason: &str,
    binary_like: bool,
    replacement_char_ratio: f64,
    control_char_ratio: f64,
) -> Value {
    json!({
        "state": "decodeFailed",
        "message": "Content is unreadable: suspected binary file or encoding mismatch.",
        "decode": {
            "confidence": 0,
            "replacementCharRatio": replacement_char_ratio,
            "controlCharRatio": control_char_ratio,
            "binaryLike": binary_like,
            "reason": reason,
        },
    })
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
