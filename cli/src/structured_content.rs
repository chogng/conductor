use calamine::{open_workbook_auto, Reader};
use encoding_rs::GB18030;
use quick_xml::{events::Event as XmlEvent, Reader as XmlReader};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs::File;
use std::io::Read;
use std::path::Path;
use zip::ZipArchive;

const ROW_WINDOW_SIZE: usize = 1000;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StructuredContentValueRun {
    start_row: usize,
    end_row: usize,
    point_count: usize,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StructuredContentNumericRun {
    start_row: usize,
    end_row: usize,
    point_count: usize,
    values: Vec<f64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StructuredContentColumnFacts {
    column: usize,
    kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    longest_value_run: Option<StructuredContentValueRun>,
    #[serde(skip_serializing_if = "Option::is_none")]
    longest_numeric_run: Option<StructuredContentValueRun>,
    numeric_runs: Vec<StructuredContentNumericRun>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StructuredContentRowWindow {
    start_row_index: usize,
    rows: Vec<Vec<String>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StructuredContentSnapshot {
    column_count: usize,
    column_facts: Vec<StructuredContentColumnFacts>,
    content_fingerprint: String,
    max_cell_lengths: Vec<usize>,
    row_count: usize,
    rows: Vec<Vec<String>>,
    row_windows: Vec<StructuredContentRowWindow>,
    sparse_rows: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StructuredContentSheet {
    content: Option<StructuredContentSnapshot>,
    diagnostics: Vec<Value>,
    sheet_id: String,
    sheet_name: Option<String>,
}

#[derive(Default)]
struct MutableColumnFacts {
    column: usize,
    current_numeric_run_start_row: Option<usize>,
    current_numeric_run_values: Vec<f64>,
    current_value_run_start_row: Option<usize>,
    has_number: bool,
    has_text: bool,
    last_observed_row: Option<usize>,
    longest_numeric_run: Option<StructuredContentValueRun>,
    longest_value_run: Option<StructuredContentValueRun>,
    numeric_runs: Vec<StructuredContentNumericRun>,
}

struct PhysicalContentBuilder {
    column_count: usize,
    columns: Vec<MutableColumnFacts>,
    max_cell_lengths: Vec<usize>,
    previous_row: Option<(usize, Vec<String>)>,
    relevant_rows: Vec<(usize, Vec<String>)>,
    retain_next_row: bool,
    row_count: usize,
    rows_hash: StructuredContentHash,
}

impl PhysicalContentBuilder {
    fn new() -> Self {
        Self {
            column_count: 0,
            columns: Vec::new(),
            max_cell_lengths: Vec::new(),
            previous_row: None,
            relevant_rows: Vec::new(),
            retain_next_row: false,
            row_count: 0,
            rows_hash: StructuredContentHash::new(),
        }
    }

    fn append_row(&mut self, row: Vec<String>) {
        let row_index = self.row_count;
        self.rows_hash.append_usize(row.len());
        self.column_count = self.column_count.max(row.len());
        self.max_cell_lengths.resize(self.column_count, 0);
        self.columns
            .resize_with(self.column_count, MutableColumnFacts::default);

        let mut has_semantic_text = false;
        for (column, value) in row.iter().enumerate() {
            self.rows_hash.append_text(value);
            self.max_cell_lengths[column] =
                self.max_cell_lengths[column].max(value.encode_utf16().count());
            let facts = &mut self.columns[column];
            facts.column = column;
            append_column_value(facts, value, row_index);
            has_semantic_text |= parse_finite_number(value).is_none() && !value.trim().is_empty();
        }

        if has_semantic_text {
            if let Some((previous_row_index, previous_row)) = &self.previous_row {
                append_relevant_row(
                    &mut self.relevant_rows,
                    *previous_row_index,
                    previous_row.clone(),
                );
            }
        }
        if has_semantic_text || self.retain_next_row {
            append_relevant_row(&mut self.relevant_rows, row_index, row.clone());
        }
        self.retain_next_row = has_semantic_text;
        self.previous_row = Some((row_index, row));
        self.row_count += 1;
    }

    fn finish(mut self) -> StructuredContentSnapshot {
        self.columns
            .resize_with(self.column_count, MutableColumnFacts::default);
        let column_facts = self
            .columns
            .into_iter()
            .enumerate()
            .map(|(column, mut facts)| {
                facts.column = column;
                finish_column_facts(facts)
            })
            .collect::<Vec<_>>();

        let mut content_hash = StructuredContentHash::new();
        content_hash.append_text("structured-content-v1");
        content_hash.append_usize(self.column_count);
        content_hash.append_usize(self.row_count);
        content_hash.append_usize(self.max_cell_lengths.len());
        for length in &self.max_cell_lengths {
            content_hash.append_usize(*length);
        }
        content_hash.append_usize(self.row_count);
        content_hash.append_text(&self.rows_hash.digest());

        StructuredContentSnapshot {
            column_count: self.column_count,
            column_facts,
            content_fingerprint: format!("structured-content:{}", content_hash.digest()),
            max_cell_lengths: self.max_cell_lengths,
            row_count: self.row_count,
            rows: Vec::new(),
            row_windows: create_sparse_row_windows(self.relevant_rows),
            sparse_rows: true,
        }
    }
}

#[derive(Clone, Copy)]
struct StructuredContentHash {
    value: u32,
}

impl StructuredContentHash {
    fn new() -> Self {
        Self {
            value: 2_166_136_261,
        }
    }

    fn append_text(&mut self, value: &str) {
        for code_unit in value.encode_utf16() {
            self.value ^= u32::from(code_unit);
            self.value = self.value.wrapping_mul(16_777_619);
        }
        self.value ^= 31;
        self.value = self.value.wrapping_mul(16_777_619);
    }

    fn append_usize(&mut self, value: usize) {
        self.append_text(&value.to_string());
    }

    fn digest(&self) -> String {
        to_base36(self.value)
    }
}

pub fn resolve_structured_content(path: &Path) -> Result<Value, String> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match extension.as_str() {
        "csv" => resolve_delimited_content(path, b','),
        "tsv" => resolve_delimited_content(path, b'\t'),
        "xls" | "xlsx" => resolve_workbook_content(path, extension.as_str()),
        _ => Err("structured content only supports csv, tsv, xls, and xlsx".to_string()),
    }
}

fn resolve_delimited_content(path: &Path, delimiter: u8) -> Result<Value, String> {
    let bytes = std::fs::read(path).map_err(|error| error.to_string())?;
    Ok(resolve_delimited_bytes(&bytes, delimiter))
}

fn resolve_delimited_bytes(bytes: &[u8], delimiter: u8) -> Value {
    let text = match decode_delimited_text(bytes) {
        Ok(text) => text,
        Err(message) => {
            return json!({
                "content": Value::Null,
                "defaultSheetId": Value::Null,
                "diagnostics": [{
                    "code": "table.reader.decodeFailed",
                    "message": message,
                    "severity": "fatal",
                }],
                "sheets": [],
            });
        }
    };
    let (rows, diagnostics) = parse_delimited_rows(&text, delimiter as char);
    let content = if text.chars().any(|character| !character.is_whitespace()) {
        Some(build_content(rows))
    } else {
        None
    };
    let diagnostics = if content.is_none() {
        vec![json!({
            "code": "table.parser.empty",
            "message": "The table file is empty.",
            "severity": "fatal",
        })]
    } else {
        diagnostics
    };

    json!({
        "content": content,
        "defaultSheetId": "0",
        "diagnostics": diagnostics,
        "sheets": [],
    })
}

fn resolve_workbook_content(path: &Path, extension: &str) -> Result<Value, String> {
    let mut workbook = open_workbook_auto(path).map_err(|error| error.to_string())?;
    let sheet_names = workbook.sheet_names().to_vec();
    let xlsx_sheet_ids = if extension == "xlsx" {
        read_xlsx_sheet_ids(path)?
    } else {
        HashMap::new()
    };
    let mut sheets = Vec::<StructuredContentSheet>::new();
    for (index, sheet_name) in sheet_names.iter().enumerate() {
        let sheet_id = if extension == "xlsx" {
            let id = xlsx_sheet_ids
                .get(sheet_name)
                .cloned()
                .unwrap_or_else(|| index.to_string());
            format!("{id}:{sheet_name}")
        } else {
            index.to_string()
        };
        match workbook.worksheet_range(sheet_name) {
            Ok(range) => {
                let rows = range
                    .rows()
                    .map(|row| row.iter().map(ToString::to_string).collect::<Vec<_>>())
                    .collect::<Vec<_>>();
                sheets.push(StructuredContentSheet {
                    content: if rows.is_empty() {
                        None
                    } else {
                        Some(build_content(rows))
                    },
                    diagnostics: Vec::new(),
                    sheet_id,
                    sheet_name: Some(sheet_name.clone()),
                });
            }
            Err(error) => {
                sheets.push(StructuredContentSheet {
                    content: None,
                    diagnostics: vec![json!({
                        "code": "table.parser.malformedWorkbook",
                        "message": error.to_string(),
                        "severity": "error",
                        "sheetId": sheet_id,
                    })],
                    sheet_id,
                    sheet_name: Some(sheet_name.clone()),
                });
            }
        }
    }

    let default_sheet_id = sheets
        .iter()
        .find(|sheet| sheet.content.is_some())
        .map(|sheet| sheet.sheet_id.clone());
    if default_sheet_id.is_none() {
        return Ok(json!({
            "content": Value::Null,
            "defaultSheetId": Value::Null,
            "diagnostics": [{
                "code": "table.parser.noReadableSheet",
                "message": "The workbook did not contain a readable worksheet.",
                "severity": "fatal",
            }],
            "sheets": sheets,
        }));
    }

    Ok(json!({
        "content": Value::Null,
        "defaultSheetId": default_sheet_id,
        "diagnostics": [],
        "sheets": sheets,
    }))
}

fn read_xlsx_sheet_ids(path: &Path) -> Result<HashMap<String, String>, String> {
    let file = File::open(path).map_err(|error| error.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|error| error.to_string())?;
    let mut workbook_xml = String::new();
    archive
        .by_name("xl/workbook.xml")
        .map_err(|error| error.to_string())?
        .read_to_string(&mut workbook_xml)
        .map_err(|error| error.to_string())?;
    parse_xlsx_sheet_ids(&workbook_xml)
}

fn parse_xlsx_sheet_ids(xml: &str) -> Result<HashMap<String, String>, String> {
    let mut reader = XmlReader::from_str(xml);
    reader.config_mut().trim_text(true);
    let mut sheet_ids = HashMap::new();
    loop {
        match reader.read_event() {
            Ok(XmlEvent::Start(element)) | Ok(XmlEvent::Empty(element))
                if xml_local_name(element.name().as_ref()) == b"sheet" =>
            {
                let mut sheet_name = None;
                let mut sheet_id = None;
                for attribute in element.attributes() {
                    let attribute = attribute.map_err(|error| error.to_string())?;
                    let value = attribute
                        .decode_and_unescape_value(reader.decoder())
                        .map_err(|error| error.to_string())?
                        .into_owned();
                    match xml_local_name(attribute.key.as_ref()) {
                        b"name" => sheet_name = Some(value),
                        b"sheetId" => sheet_id = Some(value),
                        _ => {}
                    }
                }
                if let (Some(name), Some(id)) = (sheet_name, sheet_id) {
                    sheet_ids.insert(name, id);
                }
            }
            Ok(XmlEvent::Eof) => break,
            Ok(_) => {}
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(sheet_ids)
}

fn xml_local_name(name: &[u8]) -> &[u8] {
    name.rsplit(|value| *value == b':').next().unwrap_or(name)
}

fn build_content(rows: Vec<Vec<String>>) -> StructuredContentSnapshot {
    let mut builder = PhysicalContentBuilder::new();
    for row in rows {
        builder.append_row(row);
    }
    builder.finish()
}

fn append_column_value(facts: &mut MutableColumnFacts, raw_value: &str, row: usize) {
    if let Some(last_observed_row) = facts.last_observed_row {
        if last_observed_row + 1 < row {
            finish_value_run(facts, last_observed_row);
            finish_numeric_run(facts, last_observed_row);
        }
    }

    let numeric_value = parse_finite_number(raw_value);
    let has_text = numeric_value.is_none() && !raw_value.trim().is_empty();
    if numeric_value.is_some() || has_text {
        facts.current_value_run_start_row.get_or_insert(row);
    } else {
        finish_value_run(facts, row.saturating_sub(1));
    }

    if let Some(value) = numeric_value {
        facts.has_number = true;
        facts.current_numeric_run_start_row.get_or_insert(row);
        facts.current_numeric_run_values.push(value);
    } else {
        facts.has_text |= has_text;
        finish_numeric_run(facts, row.saturating_sub(1));
    }
    facts.last_observed_row = Some(row);
}

fn finish_column_facts(mut facts: MutableColumnFacts) -> StructuredContentColumnFacts {
    if let Some(last_observed_row) = facts.last_observed_row {
        finish_value_run(&mut facts, last_observed_row);
        finish_numeric_run(&mut facts, last_observed_row);
    }
    StructuredContentColumnFacts {
        column: facts.column,
        kind: if facts.has_number {
            if facts.has_text {
                "mixed"
            } else {
                "numeric"
            }
        } else if facts.has_text {
            "text"
        } else {
            "empty"
        },
        longest_value_run: facts.longest_value_run,
        longest_numeric_run: facts.longest_numeric_run,
        numeric_runs: facts.numeric_runs,
    }
}

fn finish_value_run(facts: &mut MutableColumnFacts, end_row: usize) {
    let Some(start_row) = facts.current_value_run_start_row.take() else {
        return;
    };
    if end_row < start_row {
        return;
    }
    let run = create_value_run(start_row, end_row);
    if facts
        .longest_value_run
        .as_ref()
        .is_none_or(|longest| run.point_count > longest.point_count)
    {
        facts.longest_value_run = Some(run);
    }
}

fn finish_numeric_run(facts: &mut MutableColumnFacts, end_row: usize) {
    let Some(start_row) = facts.current_numeric_run_start_row.take() else {
        return;
    };
    if end_row < start_row {
        facts.current_numeric_run_values.clear();
        return;
    }
    let values = std::mem::take(&mut facts.current_numeric_run_values);
    let value_run = create_value_run(start_row, end_row);
    facts.numeric_runs.push(StructuredContentNumericRun {
        start_row,
        end_row,
        point_count: value_run.point_count,
        values,
    });
    if facts
        .longest_numeric_run
        .as_ref()
        .is_none_or(|longest| value_run.point_count > longest.point_count)
    {
        facts.longest_numeric_run = Some(value_run);
    }
}

fn create_value_run(start_row: usize, end_row: usize) -> StructuredContentValueRun {
    StructuredContentValueRun {
        start_row,
        end_row,
        point_count: end_row - start_row + 1,
    }
}

fn create_sparse_row_windows(
    relevant_rows: Vec<(usize, Vec<String>)>,
) -> Vec<StructuredContentRowWindow> {
    let mut windows = Vec::<StructuredContentRowWindow>::new();
    let mut start_row_index = 0usize;
    let mut previous_row_index = None;
    let mut rows = Vec::<Vec<String>>::new();

    for (row_index, row) in relevant_rows {
        let continues_window = previous_row_index.is_some_and(|previous| previous + 1 == row_index)
            && rows.len() < ROW_WINDOW_SIZE;
        if !continues_window && !rows.is_empty() {
            windows.push(StructuredContentRowWindow {
                start_row_index,
                rows: std::mem::take(&mut rows),
            });
        }
        if rows.is_empty() {
            start_row_index = row_index;
        }
        rows.push(row);
        previous_row_index = Some(row_index);
    }
    if !rows.is_empty() {
        windows.push(StructuredContentRowWindow {
            start_row_index,
            rows,
        });
    }
    windows
}

fn append_relevant_row(
    relevant_rows: &mut Vec<(usize, Vec<String>)>,
    row_index: usize,
    row: Vec<String>,
) {
    if relevant_rows
        .last()
        .is_some_and(|(existing_row_index, _)| *existing_row_index == row_index)
    {
        return;
    }
    relevant_rows.push((row_index, row));
}

fn parse_finite_number(raw_value: &str) -> Option<f64> {
    let text = raw_value.trim();
    if text.is_empty() {
        return None;
    }
    let normalized = if text.contains(',') {
        text.replace(',', "")
    } else {
        text.to_string()
    };
    normalized
        .parse::<f64>()
        .ok()
        .filter(|value| value.is_finite())
}

fn decode_delimited_text(bytes: &[u8]) -> Result<String, String> {
    if is_zip_file_prefix(bytes) {
        return Err(
            "The table file contains ZIP binary data and cannot be decoded as CSV or TSV text."
                .to_string(),
        );
    }
    if bytes.contains(&0) {
        return Err(
            "The table file contains binary data and cannot be decoded as CSV or TSV text."
                .to_string(),
        );
    }
    if let Ok(text) = std::str::from_utf8(bytes) {
        return Ok(text.to_string());
    }
    let (decoded, _, had_errors) = GB18030.decode(bytes);
    if had_errors {
        return Err("Text encoding or table structure is not reliable.".to_string());
    }
    Ok(decoded.into_owned())
}

fn is_zip_file_prefix(bytes: &[u8]) -> bool {
    bytes.starts_with(&[0x50, 0x4b, 0x03, 0x04])
        || bytes.starts_with(&[0x50, 0x4b, 0x05, 0x06])
        || bytes.starts_with(&[0x50, 0x4b, 0x07, 0x08])
}

fn parse_delimited_rows(text: &str, delimiter: char) -> (Vec<Vec<String>>, Vec<Value>) {
    let mut rows = Vec::<Vec<String>>::new();
    let mut diagnostics = Vec::<Value>::new();
    let mut row = Vec::<String>::new();
    let mut cell = String::new();
    let mut at_cell_start = true;
    let mut in_quoted_cell = false;
    let mut after_closing_quote = false;
    let mut previous_was_carriage_return = false;
    let mut ended_with_line_break = false;
    let mut reported_invalid_quote = false;

    let finish_cell = |row: &mut Vec<String>,
                       cell: &mut String,
                       at_cell_start: &mut bool,
                       after_closing_quote: &mut bool| {
        row.push(std::mem::take(cell));
        *at_cell_start = true;
        *after_closing_quote = false;
    };
    let finish_row = |rows: &mut Vec<Vec<String>>,
                      row: &mut Vec<String>,
                      cell: &mut String,
                      at_cell_start: &mut bool,
                      after_closing_quote: &mut bool| {
        finish_cell(row, cell, at_cell_start, after_closing_quote);
        rows.push(std::mem::take(row));
    };

    for character in text.chars() {
        if in_quoted_cell {
            if character == '"' {
                in_quoted_cell = false;
                after_closing_quote = true;
            } else {
                cell.push(character);
            }
            ended_with_line_break = false;
            continue;
        }

        if previous_was_carriage_return {
            previous_was_carriage_return = false;
            if character == '\n' {
                continue;
            }
        }

        if after_closing_quote {
            if character == '"' {
                cell.push('"');
                in_quoted_cell = true;
                after_closing_quote = false;
                at_cell_start = false;
            } else if character == delimiter {
                finish_cell(
                    &mut row,
                    &mut cell,
                    &mut at_cell_start,
                    &mut after_closing_quote,
                );
            } else if character == '\r' || character == '\n' {
                finish_row(
                    &mut rows,
                    &mut row,
                    &mut cell,
                    &mut at_cell_start,
                    &mut after_closing_quote,
                );
                previous_was_carriage_return = character == '\r';
                ended_with_line_break = true;
            } else {
                if !reported_invalid_quote {
                    diagnostics.push(json!({
                        "code": "table.parser.unescapedQuote",
                        "message": "The delimited table parser found characters after a closing quote.",
                        "rowIndex": rows.len(),
                        "severity": "error",
                    }));
                    reported_invalid_quote = true;
                }
                cell.push(character);
                after_closing_quote = false;
                at_cell_start = false;
                ended_with_line_break = false;
            }
            continue;
        }

        if at_cell_start && character == '"' {
            in_quoted_cell = true;
            at_cell_start = false;
            ended_with_line_break = false;
        } else if character == delimiter {
            finish_cell(
                &mut row,
                &mut cell,
                &mut at_cell_start,
                &mut after_closing_quote,
            );
            ended_with_line_break = false;
        } else if character == '\r' || character == '\n' {
            finish_row(
                &mut rows,
                &mut row,
                &mut cell,
                &mut at_cell_start,
                &mut after_closing_quote,
            );
            previous_was_carriage_return = character == '\r';
            ended_with_line_break = true;
        } else {
            cell.push(character);
            at_cell_start = false;
            ended_with_line_break = false;
        }
    }

    if in_quoted_cell {
        diagnostics.push(json!({
            "code": "table.parser.MissingQuotes",
            "message": "The delimited table parser found an unclosed quoted cell.",
            "rowIndex": rows.len(),
            "severity": "error",
        }));
    }
    if ended_with_line_break {
        rows.push(vec![String::new()]);
    } else if !row.is_empty() || !cell.is_empty() || !at_cell_start || after_closing_quote {
        finish_cell(
            &mut row,
            &mut cell,
            &mut at_cell_start,
            &mut after_closing_quote,
        );
        rows.push(row);
    }

    (rows, diagnostics)
}

fn to_base36(mut value: u32) -> String {
    if value == 0 {
        return "0".to_string();
    }
    let alphabet = b"0123456789abcdefghijklmnopqrstuvwxyz";
    let mut output = Vec::<u8>::new();
    while value > 0 {
        output.push(alphabet[(value % 36) as usize]);
        value /= 36;
    }
    output.reverse();
    String::from_utf8(output).expect("base36 is ascii")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_sparse_rows_and_numeric_runs() {
        let content = build_content(vec![
            vec!["Vg".to_string(), "Id".to_string()],
            vec!["0".to_string(), "1e-9".to_string()],
            vec!["1".to_string(), "2e-9".to_string()],
        ]);

        assert!(content.sparse_rows);
        assert_eq!(content.row_count, 3);
        assert_eq!(content.row_windows.len(), 1);
        assert_eq!(content.row_windows[0].start_row_index, 0);
        assert_eq!(content.row_windows[0].rows.len(), 2);
        assert_eq!(
            content.column_facts[0].numeric_runs[0].values,
            vec![0.0, 1.0]
        );
        assert_eq!(content.column_facts[1].numeric_runs[0].start_row, 1);
    }

    #[test]
    fn preserves_trailing_delimited_row() {
        let (rows, diagnostics) = parse_delimited_rows("Vg,Id\n0,1\n", ',');
        assert!(diagnostics.is_empty());
        assert_eq!(rows.len(), 3);
        assert_eq!(rows[2], vec!["".to_string()]);
    }

    #[test]
    fn reports_zip_binary_disguised_as_csv_as_a_fatal_decode_diagnostic() {
        let result =
            resolve_delimited_bytes(&[0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00], b',');

        assert!(result["content"].is_null());
        assert!(result["defaultSheetId"].is_null());
        assert_eq!(
            result["diagnostics"][0]["code"],
            "table.reader.decodeFailed"
        );
        assert_eq!(result["diagnostics"][0]["severity"], "fatal");
        assert_eq!(
            result["diagnostics"][0]["message"],
            "The table file contains ZIP binary data and cannot be decoded as CSV or TSV text."
        );
    }

    #[test]
    fn reports_nul_binary_csv_content_as_a_fatal_decode_diagnostic() {
        let result = resolve_delimited_bytes(b"Vg,\0Id\n0,1", b',');

        assert!(result["content"].is_null());
        assert_eq!(
            result["diagnostics"][0]["code"],
            "table.reader.decodeFailed"
        );
        assert_eq!(result["diagnostics"][0]["severity"], "fatal");
    }

    #[test]
    fn reads_real_xlsx_sheet_ids_by_name() {
        let ids = parse_xlsx_sheet_ids(
            r#"<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
                <sheets>
                    <sheet name="Forward &amp; Reverse" sheetId="5" r:id="rId1"/>
                    <sheet name="Output" sheetId="9" r:id="rId2"/>
                </sheets>
            </workbook>"#,
        )
        .expect("workbook XML should parse");

        assert_eq!(ids.get("Forward & Reverse").map(String::as_str), Some("5"));
        assert_eq!(ids.get("Output").map(String::as_str), Some("9"));
    }
}
