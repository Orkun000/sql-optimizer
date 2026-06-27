use crate::domain::LintIssue;
use crate::rules::helpers::make_issue;

pub fn has_lowercase_keywords(sql: &str) -> bool {
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
            // word-boundary guards (treat underscore as word character)
            let before_ok = abs == 0
                || (!sql_lower.as_bytes()[abs - 1].is_ascii_alphanumeric()
                    && sql_lower.as_bytes()[abs - 1] != b'_');
            let after_ok = end >= sql_lower.len()
                || (!sql_lower.as_bytes()[end].is_ascii_alphanumeric()
                    && sql_lower.as_bytes()[end] != b'_');

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

pub fn check_lowercase_keywords(sql: &str, issues: &mut Vec<LintIssue>) {
    if has_lowercase_keywords(sql) {
        issues.push(make_issue(
            "L004",
            "info",
            "style",
            "SQL anahtar kelimeleri kucuk harf kullaniyor.",
            "Standart pratik: SELECT, FROM, WHERE, JOIN, ON buyuk harf yazilir.",
        ));
    }
}
