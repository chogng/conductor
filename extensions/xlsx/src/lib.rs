use calamine::open_workbook_auto_from_rs;
use calamine::Reader;
use quick_xml::events::Event;
use quick_xml::Reader as XmlReader;
use serde_json::json;
use std::io::Cursor;
use std::mem;
use std::slice;

#[unsafe(no_mangle)]
pub extern "C" fn xlsx_alloc(len: usize) -> *mut u8 {
    let mut buffer = Vec::<u8>::with_capacity(len);
    let ptr = buffer.as_mut_ptr();
    mem::forget(buffer);
    ptr
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn xlsx_dealloc(ptr: *mut u8, len: usize) {
    if ptr.is_null() || len == 0 {
        return;
    }
    unsafe {
        drop(Vec::from_raw_parts(ptr, len, len));
    }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn xlsx_convert_csv(ptr: *const u8, len: usize) -> *mut u8 {
    let bytes = if ptr.is_null() || len == 0 {
        &[]
    } else {
        unsafe { slice::from_raw_parts(ptr, len) }
    };
    let response = match convert_workbook_to_csv(bytes) {
        Ok(csv_text) => json!({
            "csvText": csv_text,
            "ok": true,
        }),
        Err(error) => json!({
            "error": error,
            "ok": false,
        }),
    };
    write_result(response.to_string())
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn xlsx_free_result(ptr: *mut u8) {
    if ptr.is_null() {
        return;
    }
    let len = unsafe {
        let header = slice::from_raw_parts(ptr, 4);
        u32::from_le_bytes([header[0], header[1], header[2], header[3]]) as usize
    };
    unsafe {
        drop(Vec::from_raw_parts(ptr, len + 4, len + 4));
    }
}

fn write_result(text: String) -> *mut u8 {
    let bytes = text.into_bytes();
    let len = bytes.len();
    let mut buffer = Vec::<u8>::with_capacity(len + 4);
    buffer.extend_from_slice(&(len as u32).to_le_bytes());
    buffer.extend_from_slice(&bytes);
    let ptr = buffer.as_mut_ptr();
    mem::forget(buffer);
    ptr
}

/// Convert an Excel workbook (any supported format) to CSV text.
///
/// The browser import pipeline calls this for every `.xls`/`.xlsx` file. We
/// support three families:
///   * Modern OOXML `.xlsx` (and `.xlsb` / `.ods`) — via calamine.
///   * BIFF binary `.xls` — via calamine.
///   * SpreadsheetML 2003 XML saved with a `.xls` extension — a plain XML
///     dialect that calamine cannot read. Instrument/measurement tools (the
///     primary source of import data) commonly export this. We detect it and
///     parse it directly with quick-xml.
fn convert_workbook_to_csv(bytes: &[u8]) -> Result<String, String> {
    if looks_like_spreadsheet_ml(bytes) {
        return convert_spreadsheet_ml(bytes);
    }

    convert_with_calamine(bytes)
}

fn convert_with_calamine(bytes: &[u8]) -> Result<String, String> {
    let cursor = Cursor::new(bytes.to_vec());
    let mut workbook =
        open_workbook_auto_from_rs(cursor).map_err(|error| error.to_string())?;
    let sheet_name = workbook
        .sheet_names()
        .first()
        .cloned()
        .ok_or_else(|| "workbook has no sheet".to_string())?;
    let range = workbook
        .worksheet_range(&sheet_name)
        .map_err(|error| error.to_string())?;

    let rows: Vec<Vec<String>> = range
        .rows()
        .map(|row| row.iter().map(|cell| cell.to_string()).collect())
        .collect();
    Ok(rows_to_csv(&rows))
}

/// Cheap content sniff for the SpreadsheetML 2003 XML namespace. Only the
/// leading bytes are scanned; binary `.xls`/`.xlsx` never contain this marker.
fn looks_like_spreadsheet_ml(bytes: &[u8]) -> bool {
    const NEEDLE: &[u8] = b"urn:schemas-microsoft-com:office:spreadsheet";
    let limit = bytes.len().min(8192);
    if limit < NEEDLE.len() {
        return false;
    }
    bytes[..limit]
        .windows(NEEDLE.len())
        .any(|window| window == NEEDLE)
}

/// Strip an optional `prefix:` from an XML name (elements use the default
/// namespace; attributes like `ss:Index` carry a prefix).
fn local_name(name: &[u8]) -> &[u8] {
    match name.iter().position(|&byte| byte == b':') {
        Some(index) => &name[index + 1..],
        None => name,
    }
}

fn cell_target_index(event: &quick_xml::events::BytesStart) -> Option<usize> {
    for attribute in event.attributes().flatten() {
        if local_name(attribute.key.as_ref()) == b"Index" {
            if let Ok(text) = std::str::from_utf8(&attribute.value) {
                if let Ok(index) = text.trim().parse::<usize>() {
                    if index >= 1 {
                        return Some(index - 1);
                    }
                }
            }
        }
    }
    None
}

fn decode_xml_reference(event: &quick_xml::events::BytesRef) -> Result<String, String> {
    let decoded = event.decode().map_err(|error| error.to_string())?;
    match decoded.as_ref() {
        "amp" => Ok("&".to_string()),
        "lt" => Ok("<".to_string()),
        "gt" => Ok(">".to_string()),
        "quot" => Ok("\"".to_string()),
        "apos" => Ok("'".to_string()),
        value if value.starts_with("#x") => {
            let code = u32::from_str_radix(&value[2..], 16)
                .map_err(|error| error.to_string())?;
            char::from_u32(code)
                .map(|ch| ch.to_string())
                .ok_or_else(|| "invalid XML character reference".to_string())
        }
        value if value.starts_with('#') => {
            let code = value[1..].parse::<u32>().map_err(|error| error.to_string())?;
            char::from_u32(code)
                .map(|ch| ch.to_string())
                .ok_or_else(|| "invalid XML character reference".to_string())
        }
        value => Ok(format!("&{value};")),
    }
}

fn pad_to_column(row: &mut Vec<String>, col: &mut usize, target: usize) {
    while *col < target {
        row.push(String::new());
        *col += 1;
    }
}

fn convert_spreadsheet_ml(bytes: &[u8]) -> Result<String, String> {
    let mut reader = XmlReader::from_reader(bytes);
    let mut buffer = Vec::new();

    let mut rows: Vec<Vec<String>> = Vec::new();
    let mut current_row: Vec<String> = Vec::new();
    let mut col: usize = 0;
    let mut in_row = false;
    let mut in_data = false;
    let mut cell_text = String::new();
    // Only the first worksheet is exported, matching the calamine path.
    let mut finished_first_worksheet = false;

    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| error.to_string())?;
        match event {
            Event::Eof => break,
            Event::Start(element) => match local_name(element.name().as_ref()) {
                b"Row" if !finished_first_worksheet => {
                    current_row = Vec::new();
                    col = 0;
                    in_row = true;
                }
                b"Cell" if in_row => {
                    if let Some(target) = cell_target_index(&element) {
                        pad_to_column(&mut current_row, &mut col, target);
                    }
                    cell_text.clear();
                }
                b"Data" if in_row => {
                    in_data = true;
                    cell_text.clear();
                }
                _ => {}
            },
            Event::Empty(element) => match local_name(element.name().as_ref()) {
                b"Row" if !finished_first_worksheet => {
                    rows.push(Vec::new());
                }
                b"Cell" if in_row => {
                    if let Some(target) = cell_target_index(&element) {
                        pad_to_column(&mut current_row, &mut col, target);
                    }
                    current_row.push(String::new());
                    col += 1;
                }
                _ => {}
            },
            Event::Text(text) if in_data => {
                let decoded_text = text.decode().map_err(|error| error.to_string())?;
                let decoded = quick_xml::escape::unescape(&decoded_text)
                    .map_err(|error| error.to_string())?;
                cell_text.push_str(&decoded);
            }
            Event::GeneralRef(reference) if in_data => {
                cell_text.push_str(&decode_xml_reference(&reference)?);
            }
            Event::End(element) => match local_name(element.name().as_ref()) {
                b"Data" => {
                    in_data = false;
                }
                b"Cell" if in_row => {
                    current_row.push(mem::take(&mut cell_text));
                    col += 1;
                }
                b"Row" if in_row => {
                    rows.push(mem::take(&mut current_row));
                    in_row = false;
                }
                b"Worksheet" => {
                    finished_first_worksheet = true;
                }
                _ => {}
            },
            _ => {}
        }
        buffer.clear();
    }

    if rows.is_empty() {
        return Err("workbook has no sheet".to_string());
    }

    Ok(rows_to_csv(&rows))
}

fn rows_to_csv(rows: &[Vec<String>]) -> String {
    let mut csv_text = String::new();
    let mut has_row = false;
    for row in rows {
        if row.iter().all(|value| value.trim().is_empty()) {
            continue;
        }

        if has_row {
            csv_text.push('\n');
        }
        for (index, value) in row.iter().enumerate() {
            if index > 0 {
                csv_text.push(',');
            }
            write_csv_cell(value, &mut csv_text);
        }
        has_row = true;
    }

    csv_text
}

fn write_csv_cell(value: &str, output: &mut String) {
    let needs_quotes = value
        .bytes()
        .any(|byte| matches!(byte, b',' | b'"' | b'\n' | b'\r'));
    if !needs_quotes {
        output.push_str(value);
        return;
    }

    output.push('"');
    for ch in value.chars() {
        if ch == '"' {
            output.push_str("\"\"");
        } else {
            output.push(ch);
        }
    }
    output.push('"');
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spreadsheet_ml(rows: &str) -> Vec<u8> {
        format!(
            r#"<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Sheet1">
    <Table>
      {rows}
    </Table>
  </Worksheet>
</Workbook>"#
        )
        .into_bytes()
    }

    #[test]
    fn converts_spreadsheet_ml_rows_to_csv() {
        let bytes = spreadsheet_ml(
            r#"
      <Row>
        <Cell><Data ss:Type="String">Vg</Data></Cell>
        <Cell><Data ss:Type="String">Id</Data></Cell>
      </Row>
      <Row>
        <Cell><Data ss:Type="Number">0</Data></Cell>
        <Cell><Data ss:Type="Number">1e-9</Data></Cell>
      </Row>"#,
        );

        assert_eq!(convert_workbook_to_csv(&bytes).unwrap(), "Vg,Id\n0,1e-9");
    }

    #[test]
    fn preserves_indexed_empty_cells_and_csv_escaping() {
        let bytes = spreadsheet_ml(
            r#"
      <Row>
        <Cell><Data ss:Type="String">Name</Data></Cell>
        <Cell ss:Index="3"><Data ss:Type="String">Value, quoted &amp; "raw"</Data></Cell>
      </Row>"#,
        );

        assert_eq!(
            convert_workbook_to_csv(&bytes).unwrap(),
            "Name,,\"Value, quoted & \"\"raw\"\"\"",
        );
    }
}
