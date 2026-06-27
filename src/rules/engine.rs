/// Lint rule orchestration — walks the SQL AST and collects [`LintIssue`]s.
///
/// This module owns the top-level entry points (`lint_stmt`, `lint_query`,
/// `lint_set_expr`, `lint_select`, `lint_expr`) and the stat-counting helper
/// `count_table_factor` (which recursively calls `lint_set_expr` and therefore
/// must live here to avoid circular imports).
///
/// Pure traversal helpers → `rules::ast_traversal`
/// Schema-aware checks   → `rules::schema_checks`
use sqlparser::ast::{
    BinaryOperator, Expr, FunctionArg, FunctionArgExpr, FunctionArguments, GroupByExpr,
    JoinConstraint, JoinOperator, ObjectType, Query, Select, SelectItem, SetExpr, SetOperator,
    SetQuantifier, Statement, TableFactor, Value,
};

use crate::domain::{LintIssue, QueryContext, QueryStats, Schema};
use crate::rules::ast_traversal::{
    check_table_references, collect_table_sources,
};
use crate::rules::helpers::*;
use crate::rules::schema_checks::{check_column_reference, check_comparison, check_indexed_filter};

// ─── Top-level entry point ────────────────────────────────────────────────────

pub fn lint_stmt(stmt: &Statement, stats: &mut QueryStats, schema: &Schema) -> Vec<LintIssue> {
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

// ─── Query-level rules ────────────────────────────────────────────────────────

pub fn lint_query(query: &Query, stats: &mut QueryStats, schema: &Schema) -> Vec<LintIssue> {
    let mut issues = Vec::new();
    if query.order_by.is_some() {
        stats.has_order_by = true;
    }
    if query.limit.is_some() {
        stats.has_limit = true;
    }

    // L026: Missing LIMIT clause in SELECT query on tables
    if query.limit.is_none() {
        if let SetExpr::Select(select) = query.body.as_ref() {
            if !select.from.is_empty() {
                issues.push(make_issue(
                    "L026",
                    "warning",
                    "performance",
                    "Sorguda LIMIT belirtilmemis. Buyuk tablolar uzerinde calisirken bu sorgu yuksek bellek ve I/O tuketebilir.",
                    "Sorgunun sonuna LIMIT 100 gibi bir sinir ekleyin veya sayfalama yapin.",
                ));
            }
        }
    }

    // L017: ORDER BY ordinal
    if let Some(order_by) = &query.order_by {
        let has_ordinal = order_by
            .exprs
            .iter()
            .any(|obe| matches!(obe.expr, Expr::Value(Value::Number(_, _))));
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

pub fn lint_set_expr(expr: &SetExpr, stats: &mut QueryStats, schema: &Schema) -> Vec<LintIssue> {
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

// ─── SELECT-level rules ───────────────────────────────────────────────────────

pub fn lint_select(select: &Select, stats: &mut QueryStats, schema: &Schema) -> Vec<LintIssue> {
    let mut issues = Vec::new();
    let mut ctx = QueryContext::default();
    collect_table_sources(&select.from, &mut ctx);

    // L020: Check table references against schema
    if !schema.tables.is_empty() {
        check_table_references(&select.from, schema, &mut issues);
    }

    // Lint projection expressions
    for item in &select.projection {
        match item {
            SelectItem::UnnamedExpr(expr) => {
                issues.extend(lint_expr(expr, stats, schema, &ctx, true));
            }
            SelectItem::ExprWithAlias { expr, .. } => {
                issues.extend(lint_expr(expr, stats, schema, &ctx, true));
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

    // L018: Implicit JOIN (comma-separated FROM)
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
        // L019: Subquery without alias in FROM
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

            // L019: Subquery without alias in JOIN
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
                | JoinOperator::FullOuter(JoinConstraint::On(expr)) => {
                    is_constant_true_expr(expr)
                }
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

            // L009: Unaliased JOIN table
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
        issues.extend(lint_expr(where_clause, stats, schema, &ctx, false));
    }

    // GROUP BY
    let has_group_by = match &select.group_by {
        GroupByExpr::All(_) => true,
        GroupByExpr::Expressions(exprs, modifiers) => {
            !exprs.is_empty() || !modifiers.is_empty()
        }
    };
    if has_group_by {
        stats.has_group_by = true;
    }

    if let GroupByExpr::Expressions(exprs, _) = &select.group_by {
        for e in exprs {
            issues.extend(lint_expr(e, stats, schema, &ctx, false));
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

    if let Some(having) = &select.having {
        issues.extend(lint_expr(having, stats, schema, &ctx, false));
    }

    issues
}

// ─── Expression-level rules ───────────────────────────────────────────────────

pub fn lint_expr(
    expr: &Expr,
    stats: &mut QueryStats,
    schema: &Schema,
    ctx: &QueryContext,
    in_projection: bool,
) -> Vec<LintIssue> {
    let mut issues = Vec::new();

    // Schema-aware column checks
    if !schema.tables.is_empty() {
        check_column_reference(expr, ctx, schema, &mut issues);
    }

    match expr {
        // L003, L012, L015, L021, L022, L023: Binary operations
        Expr::BinaryOp { op, left, right } => {
            if !in_projection && !schema.tables.is_empty() && is_comparison_op(op) {
                check_comparison(left, right, ctx, schema, &mut issues);
                check_indexed_filter(expr, ctx, schema, &mut issues);
            }

            // L023: column = NULL / column != NULL
            if *op == BinaryOperator::Eq || *op == BinaryOperator::NotEq {
                if matches!(left.as_ref(), Expr::Value(Value::Null))
                    || matches!(right.as_ref(), Expr::Value(Value::Null))
                {
                    issues.push(make_issue(
                        "L023",
                        "warning",
                        "safety",
                        "column = NULL veya column != NULL kullanimi mantiksal hatalara yol acar. NULL deger karsilastirmalari her zaman UNKNOWN doner.",
                        "Esitlik yerine IS NULL veya IS NOT NULL kullanin: column IS NULL / column IS NOT NULL.",
                    ));
                }
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
                if !in_projection && (has_math_on_id(left) || has_math_on_id(right)) {
                    issues.push(make_issue(
                        "L012",
                        "warning",
                        "performance",
                        "Filtre kosulunda kolon uzerinde matematiksel islem yapilmis. Bu durum indeks kullanimini engeller (Non-SARGable).",
                        "Matematiksel islemi esitligin diger tarafina tasiyin (Ornek: price > 100 - 10).",
                    ));
                }
            }
            issues.extend(lint_expr(left, stats, schema, ctx, in_projection));
            issues.extend(lint_expr(right, stats, schema, ctx, in_projection));
        }

        // L005: LIKE with leading wildcard
        Expr::Like { negated: false, pattern, .. } => {
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
        Expr::InSubquery { negated: true, subquery, .. } => {
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

        // IN (subquery) — recurse only
        Expr::InSubquery { subquery, .. } => {
            issues.extend(lint_set_expr(&subquery.body, stats, schema));
            stats.subquery_count += 1;
        }

        // L010 & L024: Scalar subquery
        Expr::Subquery(subquery) => {
            if in_projection {
                issues.push(make_issue(
                    "L024",
                    "warning",
                    "performance",
                    "SELECT listesinde scalar subquery kullanimi: Her satir icin ayri calistirilarak performans kaybina (N+1 sorgusu) neden olabilir.",
                    "LEFT JOIN veya CTE (WITH) ile sorguyu optimize etmeyi degerlendirin.",
                ));
            } else {
                issues.push(make_issue(
                    "L010",
                    "warning",
                    "performance",
                    "WHERE kosulunda scalar subquery: Her satir icin ayri calistirilabilir.",
                    "CTE (WITH clause) veya JOIN ile yeniden yazmayi degerlendirin.",
                ));
            }
            issues.extend(lint_set_expr(&subquery.body, stats, schema));
            stats.subquery_count += 1;
        }

        // Recurse into unary ops
        Expr::UnaryOp { expr: inner, .. } => {
            issues.extend(lint_expr(inner, stats, schema, ctx, in_projection));
        }

        // Recurse into CASE
        Expr::Case { operand, conditions, results, else_result } => {
            if let Some(op) = operand {
                issues.extend(lint_expr(op, stats, schema, ctx, in_projection));
            }
            for c in conditions {
                issues.extend(lint_expr(c, stats, schema, ctx, in_projection));
            }
            for r in results {
                issues.extend(lint_expr(r, stats, schema, ctx, in_projection));
            }
            if let Some(e) = else_result {
                issues.extend(lint_expr(e, stats, schema, ctx, in_projection));
            }
        }

        // Function args & L012 (SARGability via function call)
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
                    issues.extend(lint_expr(e, stats, schema, ctx, in_projection));
                }
            }
            if !in_projection && args_have_id {
                issues.push(make_issue(
                    "L012",
                    "warning",
                    "performance",
                    "Filtre kosulunda kolon uzerinde fonksiyon (Function) cagrisi yapilmis. Bu durum indeks kullanimini engeller (Non-SARGable).",
                    "Mumkunse fonksiyon kullanimini kaldirin veya kolon degerini yalin birakacak sekilde filtreleyin.",
                ));
            }
        }

        // L025: Redundant nested parentheses
        Expr::Nested(inner) => {
            if let Expr::Nested(_) = inner.as_ref() {
                issues.push(make_issue(
                    "L025",
                    "info",
                    "style",
                    "Gereksiz ic ice cift parantez kullanimi. SQL okunabilirligini azaltir.",
                    "Distaki veya icteki fazla parantezleri kaldirin: ((id = 1)) yerine (id = 1).",
                ));
            }
            issues.extend(lint_expr(inner, stats, schema, ctx, in_projection));
        }

        _ => {}
    }

    issues
}

// ─── Stat helper ─────────────────────────────────────────────────────────────

/// Count tables/subqueries in a [`TableFactor`] and recursively lint derived subqueries.
/// Must live in this module because it calls `lint_set_expr` (recursive).
pub fn count_table_factor(factor: &TableFactor, stats: &mut QueryStats, schema: &Schema) {
    match factor {
        TableFactor::Table { .. } => stats.table_count += 1,
        TableFactor::Derived { subquery, .. } => {
            stats.subquery_count += 1;
            lint_set_expr(&subquery.body, stats, schema);
        }
        _ => {}
    }
}
