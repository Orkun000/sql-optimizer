/// Schema-aware lint checks — column references, type comparisons, and index usage.
/// All functions in this module depend only on `domain` types and `rules::helpers`;
/// they do not call any lint-orchestration functions (lint_stmt / lint_select / etc.).
use sqlparser::ast::{BinaryOperator, DataType, Expr, Value};

use crate::domain::{LintIssue, QueryContext, Schema, TableSchema};
use crate::rules::helpers::make_issue;

// ─── Column reference validation (L020) ──────────────────────────────────────

/// Check whether a single expression references a valid column in the schema.
/// Emits L020 for unknown or ambiguous column identifiers.
pub fn check_column_reference(
    expr: &Expr,
    ctx: &QueryContext,
    schema: &Schema,
    issues: &mut Vec<LintIssue>,
) {
    match expr {
        Expr::Identifier(ident) => {
            let col_name = ident.value.to_lowercase();
            let mut matching_tables = Vec::new();

            for actual_table in ctx.table_sources.values() {
                if actual_table == "<derived>" || actual_table == "<nested>" {
                    continue;
                }
                if let Some(table_schema) = schema.tables.get(actual_table) {
                    if table_schema.columns.contains_key(&col_name) {
                        matching_tables.push(actual_table.clone());
                    }
                }
            }

            if ctx.table_sources.is_empty() {
                return;
            }

            if matching_tables.is_empty() {
                let known_tables_exist = ctx
                    .table_sources
                    .values()
                    .any(|t| schema.tables.contains_key(t));
                if known_tables_exist {
                    issues.push(make_issue(
                        "L020",
                        "error",
                        "safety",
                        &format!("Kolon bulunamadi: '{}'", ident.value),
                        &format!(
                            "Sorguda kullanilan tablolarda '{}' adinda bir kolon bulunmamaktadir.",
                            ident.value
                        ),
                    ));
                }
            } else if matching_tables.len() > 1 {
                issues.push(make_issue(
                    "L020",
                    "error",
                    "safety",
                    &format!("Belirsiz kolon referansi: '{}'", ident.value),
                    &format!(
                        "Kolon '{}' birden fazla tabloda mevcut: {}. Lutfen tablo adi veya alias belirtin (örn: t.{})",
                        ident.value,
                        matching_tables.join(", "),
                        ident.value
                    ),
                ));
            }
        }

        Expr::CompoundIdentifier(parts) if parts.len() == 2 => {
            let table_ref = parts[0].value.to_lowercase();
            let col_name = parts[1].value.to_lowercase();

            if let Some(actual_table) = ctx.table_sources.get(&table_ref) {
                if actual_table == "<derived>" || actual_table == "<nested>" {
                    return;
                }
                if let Some(table_schema) = schema.tables.get(actual_table) {
                    if !table_schema.columns.contains_key(&col_name) {
                        issues.push(make_issue(
                            "L020",
                            "error",
                            "safety",
                            &format!("Kolon bulunamadi: '{}.{}'", parts[0].value, parts[1].value),
                            &format!(
                                "'{}' tablosunda '{}' isminde bir kolon tanimlanmamistir.",
                                actual_table, parts[1].value
                            ),
                        ));
                    }
                }
            } else {
                issues.push(make_issue(
                    "L020",
                    "error",
                    "safety",
                    &format!("Bilinmeyen tablo/alias: '{}'", parts[0].value),
                    &format!(
                        "Sorguda '{}' adli bir tablo veya alias bulunmamaktadir.",
                        parts[0].value
                    ),
                ));
            }
        }

        _ => {}
    }
}

// ─── Type-mismatch comparison (L021) ─────────────────────────────────────────

/// Emit L021 when a column is compared against a literal of an incompatible type.
pub fn check_comparison(
    left: &Expr,
    right: &Expr,
    ctx: &QueryContext,
    schema: &Schema,
    issues: &mut Vec<LintIssue>,
) {
    let get_col_type = |expr: &Expr| -> Option<&DataType> {
        match expr {
            Expr::Identifier(ident) => {
                let col_name = ident.value.to_lowercase();
                for actual_table in ctx.table_sources.values() {
                    if let Some(table_schema) = schema.tables.get(actual_table) {
                        if let Some(dt) = table_schema.columns.get(&col_name) {
                            return Some(dt);
                        }
                    }
                }
            }
            Expr::CompoundIdentifier(parts) if parts.len() == 2 => {
                let table_ref = parts[0].value.to_lowercase();
                let col_name = parts[1].value.to_lowercase();
                if let Some(actual_table) = ctx.table_sources.get(&table_ref) {
                    if let Some(table_schema) = schema.tables.get(actual_table) {
                        return table_schema.columns.get(&col_name);
                    }
                }
            }
            _ => {}
        }
        None
    };

    let is_string_literal = |expr: &Expr| -> bool {
        matches!(
            expr,
            Expr::Value(Value::SingleQuotedString(_) | Value::DoubleQuotedString(_))
        )
    };

    let is_numeric_literal =
        |expr: &Expr| -> bool { matches!(expr, Expr::Value(Value::Number(_, _))) };

    let mut check_pair = |col_expr: &Expr, val_expr: &Expr| {
        if let Some(dt) = get_col_type(col_expr) {
            match dt {
                DataType::Int(_)
                | DataType::Integer(_)
                | DataType::SmallInt(_)
                | DataType::BigInt(_)
                | DataType::TinyInt(_)
                | DataType::Decimal(_)
                | DataType::Float(_)
                | DataType::Double
                | DataType::Real => {
                    if is_string_literal(val_expr) {
                        issues.push(make_issue(
                            "L021",
                            "warning",
                            "performance",
                            "Tip uyumsuzlugu ve gizli donusum",
                            &format!(
                                "Sayisal bir kolon olan '{}', string deger ile karsilastiriliyor. Bu durum veritabaninin indeks kullanimini (SARGability) engelleyebilir.",
                                col_expr
                            ),
                        ));
                    }
                }
                DataType::Varchar(_)
                | DataType::Char(_)
                | DataType::Text
                | DataType::String(_) => {
                    if is_numeric_literal(val_expr) {
                        issues.push(make_issue(
                            "L021",
                            "warning",
                            "performance",
                            "Tip uyumsuzlugu ve gizli donusum",
                            &format!(
                                "Metinsel bir kolon olan '{}', sayisal deger ile karsilastiriliyor. Bu durum veri tipi donusumu sebebiyle indeksi devre disi birakabilir.",
                                col_expr
                            ),
                        ));
                    }
                }
                _ => {}
            }
        }
    };

    check_pair(left, right);
    check_pair(right, left);
}

// ─── Index usage (L022) ───────────────────────────────────────────────────────

/// Emit L022 when a filter column exists in the schema but is not indexed.
pub fn check_indexed_filter(
    expr: &Expr,
    ctx: &QueryContext,
    schema: &Schema,
    issues: &mut Vec<LintIssue>,
) {
    let check_col = |col_expr: &Expr| -> Option<(String, &TableSchema)> {
        match col_expr {
            Expr::Identifier(ident) => {
                let col_name = ident.value.to_lowercase();
                for (t_name, table_schema) in &schema.tables {
                    if table_schema.columns.contains_key(&col_name) {
                        return Some((t_name.clone(), table_schema));
                    }
                }
            }
            Expr::CompoundIdentifier(parts) if parts.len() == 2 => {
                let table_ref = parts[0].value.to_lowercase();
                let col_name = parts[1].value.to_lowercase();
                if let Some(actual_table) = ctx.table_sources.get(&table_ref) {
                    if let Some(table_schema) = schema.tables.get(actual_table) {
                        if table_schema.columns.contains_key(&col_name) {
                            return Some((actual_table.clone(), table_schema));
                        }
                    }
                }
            }
            _ => {}
        }
        None
    };

    let mut check_filter_col = |col_expr: &Expr| {
        if let Some((table_name, table_schema)) = check_col(col_expr) {
            let col_name = match col_expr {
                Expr::Identifier(ident) => ident.value.to_lowercase(),
                Expr::CompoundIdentifier(parts) => parts[1].value.to_lowercase(),
                _ => String::new(),
            };

            if !table_schema.indexed_columns.is_empty()
                && !table_schema.indexed_columns.contains(&col_name)
            {
                issues.push(make_issue(
                    "L022",
                    "info",
                    "performance",
                    &format!("Indekssiz kolon filtresi: '{}.{}'", table_name, col_name),
                    &format!(
                        "'{}' tablosu icin indeksler tanimlanmis ancak filtrede kullanilan '{}' kolonu indekslenmemistir. Tam tablo taramasi (Full Table Scan) gerceklesebilir.",
                        table_name, col_name
                    ),
                ));
            }
        }
    };

    if let Expr::BinaryOp { left, op, right } = expr {
        match op {
            BinaryOperator::Eq
            | BinaryOperator::NotEq
            | BinaryOperator::Gt
            | BinaryOperator::GtEq
            | BinaryOperator::Lt
            | BinaryOperator::LtEq => {
                check_filter_col(left);
                check_filter_col(right);
            }
            _ => {}
        }
    }
}
