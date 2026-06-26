/*!
 * SQL Linter & Optimizer – Rust/Wasm Engine
 *
 * Exported surface (called from JavaScript):
 *   parse_and_analyze(sql: &str, dialect: &str) -> String  (JSON)
 *
 * Returns a JSON payload with:
 *   { success, formatted_sql, ast_json, lint_issues, stats, error }
 */

use wasm_bindgen::prelude::*;
use std::collections::{HashMap, HashSet};

use sqlparser::ast::*;
use sqlparser::dialect::{
    AnsiDialect, BigQueryDialect, Dialect, GenericDialect, MsSqlDialect,
    MySqlDialect, PostgreSqlDialect, SQLiteDialect,
};
use sqlparser::parser::Parser;

use serde::Serialize;


// -----------------------------------------------------------------
// Public data types (serialized to JSON and sent to JS)
// -----------------------------------------------------------------

#[derive(Serialize, Clone, Debug)]
pub struct LintIssue {
    pub rule_id: String,
    // "error" | "warning" | "info"
    pub severity: String,
    // "performance" | "safety" | "style"
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

// -----------------------------------------------------------------
// Wasm entry point
// -----------------------------------------------------------------

/// Parse `sql` with the selected `dialect_name`, run all lint rules,
/// format the query, and return everything as a JSON string.
#[wasm_bindgen]
pub fn parse_and_analyze(sql: &str, dialect_name: &str, schema_ddl: &str) -> String {
    // Install a panic hook so Rust panics show up in the browser console
    console_error_panic_hook::set_once();

    let dialect = make_dialect(dialect_name);

    // -- Parse Schema DDL if provided
    let schema = Schema::parse(schema_ddl, dialect.as_ref());

    // -- Parse
    let statements = match Parser::parse_sql(dialect.as_ref(), sql) {
        Ok(stmts) => stmts,
        Err(e) => {
            let output = AnalysisOutput {
                success: false,
                formatted_sql: String::new(),
                ast_json: serde_json::Value::Null,
                lint_issues: vec![],
                stats: QueryStats::default(),
                error: Some(format!("Parse hatasi: {}", e)),
            };
            return serde_json::to_string(&output).unwrap_or_default();
        }
    };

    // -- Lint
    let mut issues: Vec<LintIssue> = Vec::new();
    let mut stats = QueryStats {
        statement_count: statements.len(),
        ..Default::default()
    };

    // L004 - keyword casing check (operates on the raw SQL string)
    if has_lowercase_keywords(sql) {
        issues.push(make_issue(
            "L004",
            "info",
            "style",
            "SQL anahtar kelimeleri kucuk harf kullaniyor.",
            "Standart pratik: SELECT, FROM, WHERE, JOIN, ON buyuk harf yazilir.",
        ));
    }

    for stmt in &statements {
        issues.extend(lint_stmt(stmt, &mut stats, &schema));
    }

    // -- Format
    let formatted = statements
        .iter()
        .map(format_sql_stmt)
        .collect::<Vec<_>>()
        .join("\n\n");

    // -- AST to JSON
    let ast_json = serde_json::to_value(&statements).unwrap_or(serde_json::Value::Null);

    let output = AnalysisOutput {
        success: true,
        formatted_sql: formatted,
        ast_json,
        lint_issues: issues,
        stats,
        error: None,
    };

    serde_json::to_string(&output).unwrap_or_default()
}

// -----------------------------------------------------------------
// Dialect factory
// -----------------------------------------------------------------

fn make_dialect(name: &str) -> Box<dyn Dialect> {
    match name.to_lowercase().as_str() {
        "postgresql" => Box::new(PostgreSqlDialect {}),
        "mysql" => Box::new(MySqlDialect {}),
        "mssql" => Box::new(MsSqlDialect {}),
        "bigquery" => Box::new(BigQueryDialect {}),
        "sqlite" => Box::new(SQLiteDialect {}),
        "ansi" => Box::new(AnsiDialect {}),
        _ => Box::new(GenericDialect {}),
    }
}

// -----------------------------------------------------------------
// SQL Formatter (best-effort; adds line-breaks at major clauses)
// -----------------------------------------------------------------

fn format_sql_stmt(stmt: &Statement) -> String {
    // sqlparser's Display already uppercases keywords
    let raw = stmt.to_string();
    let mut out = raw;

    let replacements: &[(&str, &str)] = &[
        (" FROM ",            "\nFROM "),
        (" WHERE ",           "\nWHERE "),
        (" INNER JOIN ",      "\n  INNER JOIN "),
        (" LEFT OUTER JOIN ", "\n  LEFT OUTER JOIN "),
        (" LEFT JOIN ",       "\n  LEFT JOIN "),
        (" RIGHT JOIN ",      "\n  RIGHT JOIN "),
        (" FULL OUTER JOIN ", "\n  FULL OUTER JOIN "),
        (" FULL JOIN ",       "\n  FULL JOIN "),
        (" CROSS JOIN ",      "\n  CROSS JOIN "),
        (" JOIN ",            "\n  JOIN "),
        (" ON ",              "\n    ON "),
        (" GROUP BY ",        "\nGROUP BY "),
        (" ORDER BY ",        "\nORDER BY "),
        (" HAVING ",          "\nHAVING "),
        (" LIMIT ",           "\nLIMIT "),
        (" OFFSET ",          "\nOFFSET "),
        (" UNION ALL",        "\nUNION ALL"),
        (" UNION ",           "\nUNION\n"),
        (" SET ",             "\nSET "),
    ];

    for &(from, to) in replacements {
        out = out.replace(from, to);
    }
    out
}

// -----------------------------------------------------------------
// L004 - lowercase keyword detector (string-level)
// -----------------------------------------------------------------

fn has_lowercase_keywords(sql: &str) -> bool {
    let keywords = [
        "select", "from", "where", "join", "on", "group", "order",
        "having", "limit", "insert", "update", "delete", "create",
        "drop", "truncate", "union", "distinct",
    ];
    let sql_lower = sql.to_lowercase();
    for kw in &keywords {
        let mut search_from = 0usize;
        while let Some(pos) = sql_lower[search_from..].find(kw) {
            let abs = search_from + pos;
            let end = abs + kw.len();
            // word-boundary guards
            let before_ok = abs == 0
                || !sql_lower.as_bytes()[abs - 1].is_ascii_alphanumeric();
            let after_ok = end >= sql_lower.len()
                || !sql_lower.as_bytes()[end].is_ascii_alphanumeric();

            if before_ok && after_ok {
                let orig = &sql[abs..end];
                if orig.chars().any(|c| c.is_lowercase()) {
                    return true;
                }
            }
            search_from = abs + 1;
            if search_from >= sql_lower.len() {
                break;
            }
        }
    }
    false
}

// -----------------------------------------------------------------
// Lint dispatcher - statement level
// -----------------------------------------------------------------

fn lint_stmt(stmt: &Statement, stats: &mut QueryStats, schema: &Schema) -> Vec<LintIssue> {
    let mut issues = Vec::new();

    match stmt {
        Statement::Query(query) => {
            issues.extend(lint_query(query, stats, schema));
        }

        // L002: UPDATE without WHERE
        Statement::Update { selection, .. } if selection.is_none() => {
            issues.push(make_issue(
                "L002",
                "error",
                "safety",
                "UPDATE ifadesinde WHERE kosulu yok - tablodaki TUM satirlar guncellenir!",
                "WHERE id = ? ekleyin: UPDATE tablo SET kolon = deger WHERE id = ?",
            ));
        }

        // L002: DELETE without WHERE
        Statement::Delete(delete) if delete.selection.is_none() => {
            issues.push(make_issue(
                "L002",
                "error",
                "safety",
                "DELETE ifadesinde WHERE kosulu yok - tablodaki TUM satirlar silinir!",
                "WHERE id = ? ekleyin: DELETE FROM tablo WHERE id = ?",
            ));
        }

        // L007: DROP TABLE
        Statement::Drop { object_type: ObjectType::Table, .. } => {
            issues.push(make_issue(
                "L007",
                "error",
                "safety",
                "DROP TABLE geri alinamaz - tablo ve tum verisi kalici olarak silinir.",
                "Islemi calistirmadan once yedek alin; DROP yerine erisim kisitlamayi dusunun.",
            ));
        }

        // L007: TRUNCATE
        Statement::Truncate { .. } => {
            issues.push(make_issue(
                "L007",
                "error",
                "safety",
                "TRUNCATE geri alinamaz - tum satirlari DDL islemi olarak siler.",
                "Yalnizca belirli satirlari silmek icin: DELETE FROM tablo WHERE kosul",
            ));
        }

        _ => {}
    }

    issues
}

// -----------------------------------------------------------------
// Query-level analysis
// -----------------------------------------------------------------

fn lint_query(query: &Query, stats: &mut QueryStats, schema: &Schema) -> Vec<LintIssue> {
    let mut issues = Vec::new();
    if query.order_by.is_some() {
        stats.has_order_by = true;
    }
    if query.limit.is_some() {
        stats.has_limit = true;
    }

    // L017: ORDER BY By Ordinal
    if let Some(order_by) = &query.order_by {
        let has_ordinal = order_by.exprs.iter().any(|obe| {
            matches!(obe.expr, Expr::Value(Value::Number(_, _)))
        });
        if has_ordinal {
            issues.push(make_issue(
                "L017",
                "warning",
                "style",
                "ORDER BY ifadesinde kolon sira numarasi (ordinal) kullanilmis. Bu durum kirilgandir.",
                "Kolon sira numarasi yerine acikca kolon adlarini yazin: ORDER BY created_at, user_name.",
            ));
        }
    }

    issues.extend(lint_set_expr(&query.body, stats, schema));
    issues
}

fn lint_set_expr(expr: &SetExpr, stats: &mut QueryStats, schema: &Schema) -> Vec<LintIssue> {
    match expr {
        SetExpr::Select(select) => lint_select(select, stats, schema),
        SetExpr::SetOperation {
            op: SetOperator::Union,
            set_quantifier,
            left,
            right,
        } if *set_quantifier != SetQuantifier::All => {
            let mut issues = vec![make_issue(
                "L011",
                "info",
                "performance",
                "UNION kullanimi: Mukerrer kayitlari temizlemek icin pahali bir siralama islemi yapilir.",
                "Mukerrer kayitlar elenmek istenmiyorsa UNION ALL kullanin.",
            )];
            issues.extend(lint_set_expr(left, stats, schema));
            issues.extend(lint_set_expr(right, stats, schema));
            issues
        }
        SetExpr::SetOperation { left, right, .. } => {
            let mut issues = lint_set_expr(left, stats, schema);
            issues.extend(lint_set_expr(right, stats, schema));
            issues
        }
        SetExpr::Query(q) => lint_query(q, stats, schema),
        _ => vec![],
    }
}

// -----------------------------------------------------------------
// SELECT-level lint rules
// -----------------------------------------------------------------

fn lint_select(select: &Select, stats: &mut QueryStats, schema: &Schema) -> Vec<LintIssue> {
    let mut issues = Vec::new();
    let mut ctx = QueryContext::default();
    collect_table_sources(&select.from, &mut ctx);

    // L020: Check table references
    if !schema.tables.is_empty() {
        check_table_references(&select.from, schema, &mut issues);
    }

    // L020: Check projection expressions
    for item in &select.projection {
        match item {
            SelectItem::UnnamedExpr(expr) => {
                issues.extend(lint_expr(expr, stats, schema, &ctx));
            }
            SelectItem::ExprWithAlias { expr, .. } => {
                issues.extend(lint_expr(expr, stats, schema, &ctx));
            }
            SelectItem::QualifiedWildcard(name, _) => {
                if !schema.tables.is_empty() {
                    let table_name = name.to_string().to_lowercase();
                    if !ctx.table_sources.contains_key(&table_name) {
                        issues.push(make_issue(
                            "L020",
                            "error",
                            "safety",
                            &format!("Bilinmeyen tablo/alias: '{}'", name),
                            &format!(
                                "Sorguda '{}' adli bir tablo veya alias bulunmamaktadir.",
                                name
                            ),
                        ));
                    }
                }
            }
            _ => {}
        }
    }

    // L001: SELECT *
    let has_star = select.projection.iter().any(|item| {
        matches!(
            item,
            SelectItem::Wildcard(_) | SelectItem::QualifiedWildcard(_, _)
        )
    });
    if has_star {
        issues.push(make_issue(
            "L001",
            "warning",
            "performance",
            "SELECT * kullanimi: Gereksiz sutunlar getirilir, I/O artar, covering index devre disi kalir.",
            "Yalnizca gerekli sutunlari listeleyin: SELECT id, name, email FROM ...",
        ));
    }
    stats.column_count += select.projection.len();

    // L006: SELECT DISTINCT
    if select.distinct.is_some() {
        issues.push(make_issue(
            "L006",
            "info",
            "performance",
            "SELECT DISTINCT: Tam tablo taramasi ve siralama gerektirebilir.",
            "Alternatif: GROUP BY veya EXISTS kullanin; gercekten gerekiyorsa kullanin.",
        ));
    }

    // L018: Implicit JOIN
    if select.from.len() > 1 {
        issues.push(make_issue(
            "L018",
            "info",
            "style",
            "Eski tip virgullu (implicit) JOIN kullanimi. Okunabilirligi ve bakimi zordur.",
            "Modern explicit JOIN formatina donusturun: FROM tablo1 INNER JOIN tablo2 ON ...",
        ));
    }

    // Table & join analysis
    for twj in &select.from {
        // L019: Subquery without alias in FROM relation
        if let TableFactor::Derived { alias: None, .. } = &twj.relation {
            issues.push(make_issue(
                "L019",
                "error",
                "safety",
                "Alt sorgu (Subquery) icin alias (isim) tanimlanmamis. Bircok veritabaninda bu durum syntax hatasidir.",
                "Alt sorgunun sonuna bir alias ekleyin: (SELECT ...) AS alt_sorgu",
            ));
        }

        count_table_factor(&twj.relation, stats, schema);

        for join in &twj.joins {
            stats.join_count += 1;

            // L019: Subquery without alias in JOIN relation
            if let TableFactor::Derived { alias: None, .. } = &join.relation {
                issues.push(make_issue(
                    "L019",
                    "error",
                    "safety",
                    "JOIN icindeki alt sorgu (Subquery) icin alias (isim) tanimlanmamis. Bircok veritabaninda bu durum syntax hatasidir.",
                    "Alt sorgunun sonuna bir alias ekleyin: JOIN (SELECT ...) AS alt_sorgu ON ...",
                ));
            }

            count_table_factor(&join.relation, stats, schema);

            // L016: Missing JOIN condition
            let has_missing_constraint = match &join.join_operator {
                JoinOperator::Inner(JoinConstraint::None)
                | JoinOperator::LeftOuter(JoinConstraint::None)
                | JoinOperator::RightOuter(JoinConstraint::None)
                | JoinOperator::FullOuter(JoinConstraint::None) => true,
                JoinOperator::Inner(JoinConstraint::On(expr))
                | JoinOperator::LeftOuter(JoinConstraint::On(expr))
                | JoinOperator::RightOuter(JoinConstraint::On(expr))
                | JoinOperator::FullOuter(JoinConstraint::On(expr)) => is_constant_true_expr(expr),
                _ => false,
            };
            if has_missing_constraint {
                issues.push(make_issue(
                    "L016",
                    "error",
                    "safety",
                    "JOIN isleminde iliski kosulu (ON/USING) eksik veya sabit deger (ON 1=1 / ON true) verilmis. Bu durum Kartezyen carpima (Cross Join) yol acabilir.",
                    "Tablolar arasindaki iliskiyi belirten kosulu ekleyin: ON tablo1.id = tablo2.tablo1_id",
                ));
            }

            // L009: unaliased JOIN table
            if get_table_alias(&join.relation).is_none() {
                if let Some(name) = get_table_name(&join.relation) {
                    let first_char = name
                        .chars()
                        .next()
                        .unwrap_or('t')
                        .to_lowercase()
                        .to_string();
                    issues.push(make_issue(
                        "L009",
                        "info",
                        "style",
                        &format!("JOIN'deki '{}' tablosuna alias verilmemis.", name),
                        &format!("Okunabilirlik icin alias ekleyin: {} {}", name, first_char),
                    ));
                }
            }
        }
    }

    // WHERE clause
    if let Some(where_clause) = &select.selection {
        stats.has_where = true;
        issues.extend(lint_expr(where_clause, stats, schema, &ctx));
    }

    // GROUP BY
    let has_group_by = match &select.group_by {
        GroupByExpr::All(_) => true,
        GroupByExpr::Expressions(exprs, modifiers) => !exprs.is_empty() || !modifiers.is_empty(),
    };
    if has_group_by {
        stats.has_group_by = true;
    }

    if let GroupByExpr::Expressions(exprs, _) = &select.group_by {
        for e in exprs {
            issues.extend(lint_expr(e, stats, schema, &ctx));
        }
    }

    // L013: Redundant DISTINCT with GROUP BY
    if select.distinct.is_some() && has_group_by {
        issues.push(make_issue(
            "L013",
            "warning",
            "performance",
            "GROUP BY ile DISTINCT birlikte kullanilmis. GROUP BY zaten sonuclari tekillestirir; DISTINCT gereksizdir ve ek siralama yuku getirir.",
            "DISTINCT anahtar kelimesini sorgudan kaldirin.",
        ));
    }

    // L014: HAVING without GROUP BY
    if select.having.is_some() && !has_group_by {
        issues.push(make_issue(
            "L014",
            "warning",
            "safety",
            "GROUP BY olmadan HAVING kullanimi. Bu kullanim genellikle bir mantik hatasidir.",
            "Satir bazli filtreleme icin WHERE kullanin veya sorguya GROUP BY ekleyin.",
        ));
    }

    // HAVING
    if let Some(having) = &select.having {
        issues.extend(lint_expr(having, stats, schema, &ctx));
    }

    issues
}

// -----------------------------------------------------------------
// Expression-level lint rules (recursive AST walk)
// -----------------------------------------------------------------

fn lint_expr(
    expr: &Expr,
    stats: &mut QueryStats,
    schema: &Schema,
    ctx: &QueryContext,
) -> Vec<LintIssue> {
    let mut issues = Vec::new();

    // Semantic checks using schema if present
    if !schema.tables.is_empty() {
        check_column_reference(expr, ctx, schema, &mut issues);
    }

    match expr {
        // L003 & L012 & L015 & L021 & L022: Binary Operations
        Expr::BinaryOp { op, left, right } => {
            if !schema.tables.is_empty() && is_comparison_op(op) {
                check_comparison(left, right, ctx, schema, &mut issues);
                check_indexed_filter(expr, ctx, schema, &mut issues);
            }

            if *op == BinaryOperator::Or {
                issues.push(make_issue(
                    "L003",
                    "warning",
                    "performance",
                    "WHERE kosulunda OR kullanimi index kullanimini engelleyebilir.",
                    "OR kosullarini ayri sorgulara bolup UNION ALL ile birlestirmeyi degerlendirin.",
                ));
            } else if is_comparison_op(op) {
                if left == right && is_identifier_expr(left) {
                    issues.push(make_issue(
                        "L015",
                        "error",
                        "safety",
                        "Kolonun kendisiyle karsilastirilmasi (Self-Comparison). Bu genellikle yazim hatasindan kaynaklanan bir mantik hatasidir.",
                        "Esitligi kontrol edin ve dogru tablolari/kolonlari karsilastirdiginizdan emin olun.",
                    ));
                }
                if has_math_on_id(left) || has_math_on_id(right) {
                    issues.push(make_issue(
                        "L012",
                        "warning",
                        "performance",
                        "Filtre kosulunda kolon uzerinde matematiksel islem yapilmis. Bu durum indeks kullanimini engeller (Non-SARGable).",
                        "Matematiksel islemi esitligin diger tarafina tasiyin (Ornek: price > 100 - 10).",
                    ));
                }
            }
            issues.extend(lint_expr(left, stats, schema, ctx));
            issues.extend(lint_expr(right, stats, schema, ctx));
        }

        // L005: LIKE with leading wildcard
        Expr::Like {
            negated: false,
            pattern,
            ..
        } => {
            let leading_pct = match pattern.as_ref() {
                Expr::Value(Value::SingleQuotedString(s))
                | Expr::Value(Value::DoubleQuotedString(s)) => s.starts_with('%'),
                _ => false,
            };
            if leading_pct {
                issues.push(make_issue(
                    "L005",
                    "warning",
                    "performance",
                    "LIKE '%...' basinda wildcard: Index kullanilamaz, tam tablo taramasi yapilir.",
                    "Mumkunse suffix wildcard kullanin (LIKE 'deger%') ya da full-text search dusunun.",
                ));
            }
        }

        // L008: NOT IN (subquery)
        Expr::InSubquery {
            negated: true,
            subquery,
            ..
        } => {
            issues.push(make_issue(
                "L008",
                "warning",
                "performance",
                "NOT IN (subquery): NULL iceren satirlar hic eslesme; NOT EXISTS genellikle daha verimlidir.",
                "NOT EXISTS ile yeniden yazin: WHERE NOT EXISTS (SELECT 1 FROM ... WHERE ...)",
            ));
            issues.extend(lint_set_expr(&subquery.body, stats, schema));
            stats.subquery_count += 1;
        }

        // IN (subquery) - just recurse, no lint
        Expr::InSubquery { subquery, .. } => {
            issues.extend(lint_set_expr(&subquery.body, stats, schema));
            stats.subquery_count += 1;
        }

        // L010: Scalar subquery in WHERE
        Expr::Subquery(subquery) => {
            issues.push(make_issue(
                "L010",
                "warning",
                "performance",
                "WHERE kosulunda scalar subquery: Her satir icin ayri calistirilabilir.",
                "CTE (WITH clause) veya JOIN ile yeniden yazmayi degerlendirin.",
            ));
            issues.extend(lint_set_expr(&subquery.body, stats, schema));
            stats.subquery_count += 1;
        }

        // Recurse into unary ops
        Expr::UnaryOp { expr: inner, .. } => {
            issues.extend(lint_expr(inner, stats, schema, ctx));
        }

        // Recurse into CASE
        Expr::Case {
            operand,
            conditions,
            results,
            else_result,
        } => {
            if let Some(op) = operand {
                issues.extend(lint_expr(op, stats, schema, ctx));
            }
            for c in conditions {
                issues.extend(lint_expr(c, stats, schema, ctx));
            }
            for r in results {
                issues.extend(lint_expr(r, stats, schema, ctx));
            }
            if let Some(e) = else_result {
                issues.extend(lint_expr(e, stats, schema, ctx));
            }
        }

        // Recurse into function args & check SARGability (L012)
        Expr::Function(func) => {
            let args = match &func.args {
                FunctionArguments::None => &[][..],
                FunctionArguments::Subquery(_) => &[][..],
                FunctionArguments::List(list) => &list.args,
            };
            let mut args_have_id = false;
            for arg in args {
                if let FunctionArg::Unnamed(FunctionArgExpr::Expr(ref e)) = arg {
                    if has_identifier(e) {
                        args_have_id = true;
                    }
                    issues.extend(lint_expr(e, stats, schema, ctx));
                }
            }
            if args_have_id {
                issues.push(make_issue(
                    "L012",
                    "warning",
                    "performance",
                    "Filtre kosulunda kolon uzerinde fonksiyon (Function) cagrisi yapilmis. Bu durum indeks kullanimini engeller (Non-SARGable).",
                    "Mumkunse fonksiyon kullanimini kaldirin veya kolon degerini yalin birakacak sekilde filtreleyin.",
                ));
            }
        }

        _ => {}
    }

    issues
}

// -----------------------------------------------------------------
// AST helpers
// -----------------------------------------------------------------

fn count_table_factor(factor: &TableFactor, stats: &mut QueryStats, schema: &Schema) {
    match factor {
        TableFactor::Table { .. } => stats.table_count += 1,
        TableFactor::Derived { subquery, .. } => {
            stats.subquery_count += 1;
            lint_set_expr(&subquery.body, stats, schema);
        }
        _ => {}
    }
}

fn get_table_alias(factor: &TableFactor) -> Option<String> {
    match factor {
        TableFactor::Table { alias, .. } => alias.as_ref().map(|a| a.name.value.clone()),
        TableFactor::Derived { alias, .. } => alias.as_ref().map(|a| a.name.value.clone()),
        _ => None,
    }
}

fn get_table_name(factor: &TableFactor) -> Option<String> {
    match factor {
        TableFactor::Table { name, .. } => {
            name.0.last().map(|ident| ident.value.clone())
        }
        _ => None,
    }
}

fn has_identifier(expr: &Expr) -> bool {
    match expr {
        Expr::Identifier(_) | Expr::CompoundIdentifier(_) => true,
        Expr::BinaryOp { left, right, .. } => has_identifier(left) || has_identifier(right),
        Expr::Function(func) => {
            let args = match &func.args {
                FunctionArguments::List(list) => &list.args,
                _ => &[][..],
            };
            args.iter().any(|arg| {
                if let FunctionArg::Unnamed(FunctionArgExpr::Expr(e)) = arg {
                    has_identifier(e)
                } else {
                    false
                }
            })
        }
        Expr::Nested(e) => has_identifier(e),
        _ => false,
    }
}

fn is_math_op(op: &BinaryOperator) -> bool {
    matches!(
        op,
        BinaryOperator::Plus
            | BinaryOperator::Minus
            | BinaryOperator::Multiply
            | BinaryOperator::Divide
            | BinaryOperator::Modulo
    )
}

fn is_comparison_op(op: &BinaryOperator) -> bool {
    matches!(
        op,
        BinaryOperator::Eq
            | BinaryOperator::NotEq
            | BinaryOperator::Gt
            | BinaryOperator::GtEq
            | BinaryOperator::Lt
            | BinaryOperator::LtEq
    )
}

fn has_math_on_id(expr: &Expr) -> bool {
    match expr {
        Expr::BinaryOp { op, left, right } => {
            if is_math_op(op) {
                has_identifier(left) || has_identifier(right)
            } else {
                has_math_on_id(left) || has_math_on_id(right)
            }
        }
        Expr::Nested(e) => has_math_on_id(e),
        _ => false,
    }
}

fn is_identifier_expr(expr: &Expr) -> bool {
    matches!(expr, Expr::Identifier(_) | Expr::CompoundIdentifier(_))
}

fn is_constant_true_expr(expr: &Expr) -> bool {
    match expr {
        Expr::Value(Value::Boolean(true)) => true,
        Expr::Value(Value::Number(ref n, _)) => n == "1",
        Expr::BinaryOp { op: BinaryOperator::Eq, left, right } => left == right,
        _ => false,
    }
}

// -----------------------------------------------------------------
// Constructor helper
// -----------------------------------------------------------------

fn make_issue(
    rule_id: &str,
    severity: &str,
    category: &str,
    message: &str,
    suggestion: &str,
) -> LintIssue {
    LintIssue {
        rule_id: rule_id.to_string(),
        severity: severity.to_string(),
        category: category.to_string(),
        message: message.to_string(),
        suggestion: suggestion.to_string(),
    }
}

// -----------------------------------------------------------------
// Schema Awareness Types and Parser
// -----------------------------------------------------------------

#[derive(Default, Debug)]
pub struct TableSchema {
    pub columns: HashMap<String, DataType>,
    pub indexed_columns: HashSet<String>,
}

#[derive(Default, Debug)]
pub struct Schema {
    pub tables: HashMap<String, TableSchema>,
}

impl Schema {
    pub fn parse(ddl: &str, dialect: &dyn Dialect) -> Self {
        let mut schema = Schema::default();
        if ddl.trim().is_empty() {
            return schema;
        }

        if let Ok(statements) = Parser::parse_sql(dialect, ddl) {
            for stmt in statements {
                match stmt {
                    Statement::CreateTable(create_table) => {
                        let table_name = create_table.name.to_string().to_lowercase();
                        let mut table_schema = TableSchema::default();
                        
                        for col in create_table.columns {
                            let col_name = col.name.value.to_lowercase();
                            table_schema.columns.insert(col_name.clone(), col.data_type);
                            
                            for opt_def in col.options {
                                match opt_def.option {
                                    ColumnOption::Unique { .. } => {
                                        table_schema.indexed_columns.insert(col_name.clone());
                                    }
                                    _ => {}
                                }
                            }
                        }

                        for constraint in create_table.constraints {
                            match constraint {
                                TableConstraint::PrimaryKey { columns, .. } | TableConstraint::Unique { columns, .. } => {
                                    for col_ident in columns {
                                        table_schema.indexed_columns.insert(col_ident.value.to_lowercase());
                                    }
                                }
                                _ => {}
                            }
                        }

                        schema.tables.insert(table_name, table_schema);
                    }
                    Statement::CreateIndex(create_index) => {
                        let t_name = create_index.table_name.to_string().to_lowercase();
                        if let Some(table_schema) = schema.tables.get_mut(&t_name) {
                            for idx_col in create_index.columns {
                                if let Expr::Identifier(ident) = idx_col.expr {
                                    table_schema.indexed_columns.insert(ident.value.to_lowercase());
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
        }
        schema
    }
}

#[derive(Debug, Default)]
pub struct QueryContext {
    pub table_sources: HashMap<String, String>,
}

fn collect_table_sources(from: &[TableWithJoins], ctx: &mut QueryContext) {
    for table_with_joins in from {
        collect_table_factor(&table_with_joins.relation, ctx);
        for join in &table_with_joins.joins {
            collect_table_factor(&join.relation, ctx);
        }
    }
}

fn collect_table_factor(factor: &TableFactor, ctx: &mut QueryContext) {
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

fn check_table_references(from: &[TableWithJoins], schema: &Schema, issues: &mut Vec<LintIssue>) {
    for table_with_joins in from {
        check_table_factor(&table_with_joins.relation, schema, issues);
        for join in &table_with_joins.joins {
            check_table_factor(&join.relation, schema, issues);
        }
    }
}

fn check_table_factor(factor: &TableFactor, schema: &Schema, issues: &mut Vec<LintIssue>) {
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

fn check_column_reference(
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
                let known_tables_exist = ctx.table_sources.values().any(|t| schema.tables.contains_key(t));
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
        Expr::CompoundIdentifier(parts) => {
            if parts.len() == 2 {
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
        }
        _ => {}
    }
}

fn check_comparison(
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
            Expr::CompoundIdentifier(parts) => {
                if parts.len() == 2 {
                    let table_ref = parts[0].value.to_lowercase();
                    let col_name = parts[1].value.to_lowercase();
                    if let Some(actual_table) = ctx.table_sources.get(&table_ref) {
                        if let Some(table_schema) = schema.tables.get(actual_table) {
                            return table_schema.columns.get(&col_name);
                        }
                    }
                }
            }
            _ => {}
        }
        None
    };

    let is_string_literal = |expr: &Expr| -> bool {
        matches!(expr, Expr::Value(Value::SingleQuotedString(_) | Value::DoubleQuotedString(_)))
    };

    let is_numeric_literal = |expr: &Expr| -> bool {
        matches!(expr, Expr::Value(Value::Number(_, _)))
    };

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
                DataType::Varchar(_) | DataType::Char(_) | DataType::Text | DataType::String(_) => {
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

fn check_indexed_filter(
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
            Expr::CompoundIdentifier(parts) => {
                if parts.len() == 2 {
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

    match expr {
        Expr::BinaryOp { left, op, right } => match op {
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
        },
        _ => {}
    }
}

// -----------------------------------------------------------------
// Tests (run with: cargo test --lib)
// -----------------------------------------------------------------
#[cfg(test)]
mod tests;
