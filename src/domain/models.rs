/// Domain models — pure data types with no dependency on external parser libraries.
///
/// `Schema::parse()` has been moved to `use_cases::schema_parser` so that this
/// module depends only on `serde` and the `sqlparser::ast::DataType` enum (needed
/// to track column types for schema-aware lint rules).
use std::collections::{HashMap, HashSet};

use serde::Serialize;
use sqlparser::ast::DataType;

// ─── Lint output ─────────────────────────────────────────────────────────────

#[derive(Serialize, Clone, Debug)]
pub struct LintIssue {
    pub rule_id: String,
    pub severity: String,
    pub category: String,
    pub message: String,
    pub suggestion: String,
}

#[derive(Serialize, Default, Debug)]
pub struct QueryStats {
    pub statement_count: usize,
    pub table_count: usize,
    pub join_count: usize,
    pub subquery_count: usize,
    pub column_count: usize,
    pub has_where: bool,
    pub has_group_by: bool,
    pub has_order_by: bool,
    pub has_limit: bool,
}

#[derive(Serialize)]
pub struct AnalysisOutput {
    pub success: bool,
    pub formatted_sql: String,
    pub ast_json: serde_json::Value,
    pub lint_issues: Vec<LintIssue>,
    pub stats: QueryStats,
    pub error: Option<String>,
}

// ─── Schema (populated by use_cases::schema_parser) ─────────────────────────

#[derive(Default, Debug)]
pub struct TableSchema {
    pub columns: HashMap<String, DataType>,
    pub indexed_columns: HashSet<String>,
}

/// A parsed representation of DDL (CREATE TABLE / CREATE INDEX).
/// Populated by [`crate::use_cases::parse_schema`], not by this module.
#[derive(Default, Debug)]
pub struct Schema {
    pub tables: HashMap<String, TableSchema>,
}

// ─── Query analysis context ───────────────────────────────────────────────────

#[derive(Debug, Default)]
pub struct QueryContext {
    pub table_sources: HashMap<String, String>,
}
