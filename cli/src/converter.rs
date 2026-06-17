use calamine::Reader;
use calamine::open_workbook_auto;
use std::fs;
use std::io;
use std::io::BufWriter;
use std::io::Write;
use std::path::Path;
use std::path::PathBuf;
use std::time::Instant;

use crate::import::IMPORT_ASSESSMENT_PREVIEW_ROWS;

#[derive(Default, Clone)]
pub struct ConvertStats {
    pub cells: usize,
    pub column_count: usize,
    pub convert_ms: f64,
    pub csv_bytes: usize,
    pub max_cell_lengths: Vec<usize>,
    pub numeric_cells: usize,
    pub rows: usize,
    pub size_bytes: u64,
}

pub struct ConvertResult {
    pub assessment_rows: Vec<Vec<String>>,
    pub index: usize,
    pub output_path: Option<PathBuf>,
    pub path: PathBuf,
    pub stats: ConvertStats,
}

pub struct ConvertFailure {
    pub message: String,
    pub path: PathBuf,
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

pub fn collect_excel_files(root: &Path, output: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_excel_files(&path, output);
        } else if path.is_file() && is_excel_path(&path) {
            output.push(path);
        }
    }
}

pub fn write_csv_cell<W: Write + ?Sized>(value: &str, output: &mut W) -> io::Result<usize> {
    let needs_quotes = value
        .bytes()
        .any(|byte| matches!(byte, b',' | b'"' | b'\n' | b'\r'));
    if !needs_quotes {
        output.write_all(value.as_bytes())?;
        return Ok(value.len());
    }

    let mut written = 2usize;
    output.write_all(b"\"")?;
    for byte in value.bytes() {
        if byte == b'"' {
            output.write_all(b"\"\"")?;
            written += 2;
        } else {
            output.write_all(&[byte])?;
            written += 1;
        }
    }
    output.write_all(b"\"")?;
    Ok(written)
}

fn is_numeric_text(value: &str) -> bool {
    let trimmed = value.trim();
    !trimmed.is_empty() && trimmed.parse::<f64>().is_ok()
}

pub fn convert_one(
    index: usize,
    path: &Path,
    output_path: Option<&Path>,
) -> Result<ConvertResult, ConvertFailure> {
    let start = Instant::now();
    let size_bytes = fs::metadata(path).map(|meta| meta.len()).unwrap_or(0);
    let mut workbook = open_workbook_auto(path).map_err(|error| ConvertFailure {
        message: error.to_string(),
        path: path.to_path_buf(),
    })?;
    let sheet_name = workbook
        .sheet_names()
        .first()
        .cloned()
        .ok_or_else(|| ConvertFailure {
            message: "workbook has no sheet".to_string(),
            path: path.to_path_buf(),
        })?;
    let range = workbook
        .worksheet_range(&sheet_name)
        .map_err(|error| ConvertFailure {
            message: error.to_string(),
            path: path.to_path_buf(),
        })?;

    let mut output_writer: Box<dyn Write> = if let Some(csv_path) = output_path {
        if let Some(parent) = csv_path.parent() {
            fs::create_dir_all(parent).map_err(|error| ConvertFailure {
                message: error.to_string(),
                path: path.to_path_buf(),
            })?;
        }
        Box::new(BufWriter::new(fs::File::create(csv_path).map_err(
            |error| ConvertFailure {
                message: error.to_string(),
                path: path.to_path_buf(),
            },
        )?))
    } else {
        Box::new(io::sink())
    };
    let mut assessment_rows = Vec::<Vec<String>>::new();
    let mut stats = ConvertStats {
        size_bytes,
        ..ConvertStats::default()
    };

    // Retain only a prefix for import assessment while streaming the full sheet to
    // CSV, keeping benchmark conversions bounded in memory.
    for row in range.rows() {
        let values: Vec<String> = row.iter().map(|cell| cell.to_string()).collect();
        if values.iter().all(|value| value.trim().is_empty()) {
            continue;
        }
        if assessment_rows.len() < IMPORT_ASSESSMENT_PREVIEW_ROWS {
            assessment_rows.push(values.clone());
        }
        if values.len() > stats.column_count {
            stats.column_count = values.len();
            stats.max_cell_lengths.resize(stats.column_count, 0);
        }
        for (index, value) in values.iter().enumerate() {
            let length = value.chars().count();
            if length > stats.max_cell_lengths[index] {
                stats.max_cell_lengths[index] = length;
            }
        }

        if stats.rows > 0 {
            output_writer
                .write_all(b"\n")
                .map_err(|error| ConvertFailure {
                    message: error.to_string(),
                    path: path.to_path_buf(),
                })?;
            stats.csv_bytes += 1;
        }

        for (index, value) in values.iter().enumerate() {
            if index > 0 {
                output_writer
                    .write_all(b",")
                    .map_err(|error| ConvertFailure {
                        message: error.to_string(),
                        path: path.to_path_buf(),
                    })?;
                stats.csv_bytes += 1;
            }
            if is_numeric_text(value) {
                stats.numeric_cells += 1;
            }
            stats.csv_bytes +=
                write_csv_cell(value, output_writer.as_mut()).map_err(|error| ConvertFailure {
                    message: error.to_string(),
                    path: path.to_path_buf(),
                })?;
        }

        stats.rows += 1;
        stats.cells += values.len();
    }

    output_writer.flush().map_err(|error| ConvertFailure {
        message: error.to_string(),
        path: path.to_path_buf(),
    })?;
    stats.convert_ms = start.elapsed().as_secs_f64() * 1000.0;

    Ok(ConvertResult {
        assessment_rows,
        index,
        output_path: output_path.map(|csv_path| csv_path.to_path_buf()),
        path: path.to_path_buf(),
        stats,
    })
}
