use wasm_bindgen::prelude::*;
use crate::use_cases::analyze_query;

/// Parse `sql` with the selected `dialect_name`, run all lint rules,
/// format the query, and return everything as a JSON string.
#[wasm_bindgen]
pub fn parse_and_analyze(sql: &str, dialect_name: &str, schema_ddl: &str) -> String {
    // Install a panic hook so Rust panics show up in the browser console
    console_error_panic_hook::set_once();

    let output = analyze_query(sql, dialect_name, schema_ddl);

    serde_json::to_string(&output).unwrap_or_default()
}
