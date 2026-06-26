use super::*;

fn analyze(sql: &str) -> serde_json::Value {
    let json = parse_and_analyze(sql, "generic", "");
    serde_json::from_str(&json).expect("engine must return valid JSON")
}

fn has_rule(result: &serde_json::Value, rule_id: &str) -> bool {
    result["lint_issues"]
        .as_array()
        .map(|arr| arr.iter().any(|i| i["rule_id"] == rule_id))
        .unwrap_or(false)
}

#[test]
fn test_select_star_triggers_l001() {
    let r = analyze("SELECT * FROM users");
    assert_eq!(r["success"], true);
    assert!(has_rule(&r, "L001"), "L001 expected but not found");
}

#[test]
fn test_delete_no_where_triggers_l002() {
    let r = analyze("DELETE FROM orders");
    assert_eq!(r["success"], true);
    assert!(has_rule(&r, "L002"), "L002 expected but not found");
}

#[test]
fn test_update_no_where_triggers_l002() {
    let r = analyze("UPDATE users SET active = 0");
    assert_eq!(r["success"], true);
    assert!(has_rule(&r, "L002"), "L002 expected but not found");
}

#[test]
fn test_drop_table_triggers_l007() {
    let r = analyze("DROP TABLE customers");
    assert_eq!(r["success"], true);
    assert!(has_rule(&r, "L007"), "L007 expected but not found");
}

#[test]
fn test_like_leading_wildcard_triggers_l005() {
    let r = analyze("SELECT id FROM users WHERE name LIKE '%john'");
    assert_eq!(r["success"], true);
    assert!(has_rule(&r, "L005"), "L005 expected but not found");
}

#[test]
fn test_clean_query_no_severe_issues() {
    let r = analyze("SELECT id, name FROM users WHERE id = 1");
    assert_eq!(r["success"], true);
    let severe = r["lint_issues"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter(|i| i["severity"] == "error" || i["severity"] == "warning")
                .count()
        })
        .unwrap_or(0);
    assert_eq!(severe, 0, "no severe issues expected for a clean query");
}

#[test]
fn test_invalid_sql_returns_error() {
    let r = analyze("THIS IS NOT SQL !!!");
    assert_eq!(r["success"], false);
    assert!(r["error"].is_string());
}

#[test]
fn test_not_in_subquery_triggers_l008() {
    let r = analyze(
        "SELECT id FROM products WHERE category_id NOT IN (SELECT id FROM categories)",
    );
    assert_eq!(r["success"], true);
    assert!(has_rule(&r, "L008"), "L008 expected but not found");
}

#[test]
fn test_select_distinct_triggers_l006() {
    let r = analyze("SELECT DISTINCT country FROM users");
    assert_eq!(r["success"], true);
    assert!(has_rule(&r, "L006"), "L006 expected but not found");
}

#[test]
fn test_union_triggers_l011() {
    let r = analyze("SELECT id FROM users UNION SELECT id FROM customers");
    assert_eq!(r["success"], true);
    assert!(has_rule(&r, "L011"), "L011 expected but not found");
}

#[test]
fn test_sargable_function_triggers_l012() {
    let r = analyze("SELECT id FROM users WHERE DATE(created_at) = '2026-01-01'");
    assert_eq!(r["success"], true);
    assert!(has_rule(&r, "L012"), "L012 expected but not found");
}

#[test]
fn test_sargable_math_triggers_l012() {
    let r = analyze("SELECT id FROM products WHERE price + 10 > 100");
    assert_eq!(r["success"], true);
    assert!(has_rule(&r, "L012"), "L012 expected but not found");
}

#[test]
fn test_distinct_with_group_by_triggers_l013() {
    let r = analyze("SELECT DISTINCT country FROM users GROUP BY country");
    assert_eq!(r["success"], true);
    assert!(has_rule(&r, "L013"), "L013 expected but not found");
}

#[test]
fn test_having_without_group_by_triggers_l014() {
    let r = analyze("SELECT country FROM users HAVING COUNT(*) > 5");
    assert_eq!(r["success"], true);
    assert!(has_rule(&r, "L014"), "L014 expected but not found");
}

#[test]
fn test_self_comparison_triggers_l015() {
    let r = analyze("SELECT id FROM users WHERE status = status");
    assert_eq!(r["success"], true);
    assert!(has_rule(&r, "L015"), "L015 expected but not found");
}

#[test]
fn test_missing_join_constraint_triggers_l016() {
    let r = analyze("SELECT * FROM users JOIN orders ON 1=1");
    assert_eq!(r["success"], true);
    assert!(has_rule(&r, "L016"), "L016 expected but not found");
}

#[test]
fn test_orderby_ordinal_triggers_l017() {
    let r = analyze("SELECT name, email FROM users ORDER BY 1");
    assert_eq!(r["success"], true);
    assert!(has_rule(&r, "L017"), "L017 expected but not found");
}

#[test]
fn test_implicit_join_triggers_l018() {
    let r = analyze("SELECT * FROM users, orders WHERE users.id = orders.user_id");
    assert_eq!(r["success"], true);
    assert!(has_rule(&r, "L018"), "L018 expected but not found");
}

#[test]
fn test_subquery_no_alias_triggers_l019() {
    let r = analyze("SELECT * FROM (SELECT id FROM users)");
    assert_eq!(r["success"], true);
    assert!(has_rule(&r, "L019"), "L019 expected but not found");
}

fn analyze_with_schema(sql: &str, schema: &str) -> serde_json::Value {
    let json = parse_and_analyze(sql, "generic", schema);
    serde_json::from_str(&json).expect("engine must return valid JSON")
}

#[test]
fn test_schema_table_not_found() {
    let schema = "CREATE TABLE users (id INT);";
    let r = analyze_with_schema("SELECT * FROM orders", schema);
    assert_eq!(r["success"], true);
    assert!(has_rule(&r, "L020"), "L020 expected but not found");
}

#[test]
fn test_schema_column_not_found() {
    let schema = "CREATE TABLE users (id INT, name VARCHAR(50));";
    let r = analyze_with_schema("SELECT age FROM users", schema);
    assert_eq!(r["success"], true);
    assert!(has_rule(&r, "L020"), "L020 expected but not found");
}

#[test]
fn test_schema_ambiguous_column() {
    let schema = "CREATE TABLE users (id INT, name VARCHAR(50)); CREATE TABLE orders (id INT, user_id INT);";
    let r = analyze_with_schema("SELECT id FROM users JOIN orders ON users.id = orders.user_id", schema);
    assert_eq!(r["success"], true);
    assert!(has_rule(&r, "L020"), "L020 expected but not found");
}

#[test]
fn test_schema_type_mismatch() {
    let schema = "CREATE TABLE users (id INT, name VARCHAR(50));";
    let r = analyze_with_schema("SELECT id FROM users WHERE id = 'ACTIVE'", schema);
    assert_eq!(r["success"], true);
    assert!(has_rule(&r, "L021"), "L021 expected but not found");
}

#[test]
fn test_schema_non_indexed_filter() {
    let schema = "CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(50));";
    let r = analyze_with_schema("SELECT id FROM users WHERE name = 'john'", schema);
    assert_eq!(r["success"], true);
    assert!(has_rule(&r, "L022"), "L022 expected but not found");
}
