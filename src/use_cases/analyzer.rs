use sqlparser::ast::Statement;
use sqlparser::dialect::{
    AnsiDialect, BigQueryDialect, Dialect, GenericDialect, MsSqlDialect,
    MySqlDialect, PostgreSqlDialect, SQLiteDialect,
};
use sqlparser::parser::Parser;

use crate::domain::{AnalysisOutput, LintIssue, QueryStats};
use crate::rules::{check_lowercase_keywords, lint_stmt};
use crate::use_cases::schema_parser::parse_schema;

pub fn analyze_query(sql: &str, dialect_name: &str, schema_ddl: &str) -> AnalysisOutput {
    let dialect = make_dialect(dialect_name);

    // -- Parse Schema DDL if provided
    let schema = parse_schema(schema_ddl, dialect.as_ref());

    // -- Parse
    let statements = match Parser::parse_sql(dialect.as_ref(), sql) {
        Ok(stmts) => stmts,
        Err(e) => {
            return AnalysisOutput {
                success: false,
                formatted_sql: String::new(),
                ast_json: serde_json::Value::Null,
                lint_issues: vec![],
                stats: QueryStats::default(),
                error: Some(format!("Parse hatasi: {}", e)),
            };
        }
    };

    // -- Lint
    let mut issues: Vec<LintIssue> = Vec::new();
    let mut stats = QueryStats {
        statement_count: statements.len(),
        ..Default::default()
    };

    check_lowercase_keywords(sql, &mut issues);

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

    AnalysisOutput {
        success: true,
        formatted_sql: formatted,
        ast_json,
        lint_issues: issues,
        stats,
        error: None,
    }
}

pub fn make_dialect(name: &str) -> Box<dyn Dialect> {
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

pub fn format_sql_stmt(stmt: &Statement) -> String {
    let raw = stmt.to_string();
    let mut out = raw;

    let replacements: &[(&str, &str)] = &[
        (" FROM ", "\nFROM "),
        (" WHERE ", "\nWHERE "),
        (" INNER JOIN ", "\n  INNER JOIN "),
        (" LEFT OUTER JOIN ", "\n  LEFT OUTER JOIN "),
        (" LEFT JOIN ", "\n  LEFT JOIN "),
        (" RIGHT JOIN ", "\n  RIGHT JOIN "),
        (" FULL OUTER JOIN ", "\n  FULL OUTER JOIN "),
        (" FULL JOIN ", "\n  FULL JOIN "),
        (" CROSS JOIN ", "\n  CROSS JOIN "),
        (" JOIN ", "\n  JOIN "),
        (" ON ", "\n    ON "),
        (" GROUP BY ", "\nGROUP BY "),
        (" ORDER BY ", "\nORDER BY "),
        (" HAVING ", "\nHAVING "),
        (" LIMIT ", "\nLIMIT "),
        (" OFFSET ", "\nOFFSET "),
        (" UNION ALL", "\nUNION ALL"),
        (" UNION ", "\nUNION\n"),
        (" SET ", "\nSET "),
    ];

    for &(from, to) in replacements {
        out = out.replace(from, to);
    }
    out
}
