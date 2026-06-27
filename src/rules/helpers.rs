use sqlparser::ast::{BinaryOperator, Expr, FunctionArg, FunctionArgExpr, FunctionArguments, TableFactor, Value};
use crate::domain::LintIssue;

pub fn make_issue(
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

pub fn get_table_alias(factor: &TableFactor) -> Option<String> {
    match factor {
        TableFactor::Table { alias, .. } => alias.as_ref().map(|a| a.name.value.clone()),
        TableFactor::Derived { alias, .. } => alias.as_ref().map(|a| a.name.value.clone()),
        _ => None,
    }
}

pub fn get_table_name(factor: &TableFactor) -> Option<String> {
    match factor {
        TableFactor::Table { name, .. } => name.0.last().map(|ident| ident.value.clone()),
        _ => None,
    }
}

pub fn has_identifier(expr: &Expr) -> bool {
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

pub fn is_math_op(op: &BinaryOperator) -> bool {
    matches!(
        op,
        BinaryOperator::Plus
            | BinaryOperator::Minus
            | BinaryOperator::Multiply
            | BinaryOperator::Divide
            | BinaryOperator::Modulo
    )
}

pub fn is_comparison_op(op: &BinaryOperator) -> bool {
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

pub fn has_math_on_id(expr: &Expr) -> bool {
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

pub fn is_identifier_expr(expr: &Expr) -> bool {
    matches!(expr, Expr::Identifier(_) | Expr::CompoundIdentifier(_))
}

pub fn is_constant_true_expr(expr: &Expr) -> bool {
    match expr {
        Expr::Value(Value::Boolean(true)) => true,
        Expr::Value(Value::Number(ref n, _)) => n == "1",
        Expr::BinaryOp { op: BinaryOperator::Eq, left, right } => left == right,
        _ => false,
    }
}
