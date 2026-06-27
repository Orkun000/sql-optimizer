/// AST traversal helpers — collect table sources and validate table/alias references.
/// These functions are pure traversal; they do not invoke any lint rules.
use sqlparser::ast::{TableFactor, TableWithJoins};

use crate::domain::{LintIssue, QueryContext, Schema};
use crate::rules::helpers::make_issue;

/// Build a [`QueryContext`] mapping every alias/name reachable from `from` clauses.
pub fn collect_table_sources(from: &[TableWithJoins], ctx: &mut QueryContext) {
    for table_with_joins in from {
        collect_table_factor(&table_with_joins.relation, ctx);
        for join in &table_with_joins.joins {
            collect_table_factor(&join.relation, ctx);
        }
    }
}

/// Record a single [`TableFactor`]'s name and optional alias into `ctx`.
pub fn collect_table_factor(factor: &TableFactor, ctx: &mut QueryContext) {
    match factor {
        TableFactor::Table { name, alias, .. } => {
            let actual_name = name.to_string().to_lowercase();
            if let Some(table_alias) = alias {
                let alias_name = table_alias.name.value.to_lowercase();
                ctx.table_sources.insert(alias_name, actual_name.clone());
            }
            ctx.table_sources.insert(actual_name.clone(), actual_name);
        }
        TableFactor::Derived { alias, .. } => {
            if let Some(table_alias) = alias {
                let alias_name = table_alias.name.value.to_lowercase();
                ctx.table_sources.insert(alias_name, "<derived>".to_string());
            }
        }
        TableFactor::NestedJoin { table_with_joins, alias, .. } => {
            collect_table_sources(std::slice::from_ref(table_with_joins.as_ref()), ctx);
            if let Some(table_alias) = alias {
                let alias_name = table_alias.name.value.to_lowercase();
                ctx.table_sources.insert(alias_name, "<nested>".to_string());
            }
        }
        _ => {}
    }
}

/// Emit L020 issues for any table reference not present in `schema`.
pub fn check_table_references(
    from: &[TableWithJoins],
    schema: &Schema,
    issues: &mut Vec<LintIssue>,
) {
    for table_with_joins in from {
        check_table_factor(&table_with_joins.relation, schema, issues);
        for join in &table_with_joins.joins {
            check_table_factor(&join.relation, schema, issues);
        }
    }
}

/// Emit an L020 issue if the concrete table name is absent from `schema`.
pub fn check_table_factor(
    factor: &TableFactor,
    schema: &Schema,
    issues: &mut Vec<LintIssue>,
) {
    match factor {
        TableFactor::Table { name, .. } => {
            let table_name = name.to_string().to_lowercase();
            if !schema.tables.is_empty() && !schema.tables.contains_key(&table_name) {
                issues.push(make_issue(
                    "L020",
                    "error",
                    "safety",
                    &format!("Tablo bulunamadi: '{}'", name),
                    &format!(
                        "Veritabaninda '{}' adinda bir tablo bulunmamaktadir. Lutfen yazimi kontrol edin veya semayi guncelleyin.",
                        name
                    ),
                ));
            }
        }
        TableFactor::NestedJoin { table_with_joins, .. } => {
            check_table_references(std::slice::from_ref(table_with_joins.as_ref()), schema, issues);
        }
        _ => {}
    }
}
