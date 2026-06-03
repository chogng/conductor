use calamine::Reader;
use calamine::Xlsx;
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
    let response = match convert_xlsx_to_csv(bytes) {
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

fn convert_xlsx_to_csv(bytes: &[u8]) -> Result<String, String> {
    let cursor = Cursor::new(bytes.to_vec());
    let mut workbook = Xlsx::new(cursor).map_err(|error| error.to_string())?;
    let sheet_name = workbook
        .sheet_names()
        .first()
        .cloned()
        .ok_or_else(|| "workbook has no sheet".to_string())?;
    let range = workbook
        .worksheet_range(&sheet_name)
        .map_err(|error| error.to_string())?;

    let mut csv_text = String::new();
    let mut has_row = false;
    for row in range.rows() {
        let values: Vec<String> = row.iter().map(|cell| cell.to_string()).collect();
        if values.iter().all(|value| value.trim().is_empty()) {
            continue;
        }

        if has_row {
            csv_text.push('\n');
        }
        for (index, value) in values.iter().enumerate() {
            if index > 0 {
                csv_text.push(',');
            }
            write_csv_cell(value, &mut csv_text);
        }
        has_row = true;
    }

    Ok(csv_text)
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
