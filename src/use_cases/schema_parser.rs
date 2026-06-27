/// DDL parsing — converts raw CREATE TABLE / CREATE INDEX statements into a [`Schema`].
///
/// This lives in `use_cases` (not `domain`) because it depends on the external
/// `sqlparser` library. The `domain::Schema` struct itself remains free of any
/// parser dependency.
use sqlparser::ast::{ColumnOption, Expr, Statement, TableConstraint};
use sqlparser::dialect::Dialect;
use sqlparser::parser::Parser;

use crate::domain::{Schema, TableSchema};

/// Parse DDL text and build a [`Schema`] that maps table names to their columns
/// and indexed columns. Unrecognised or malformed DDL is silently skipped.
pub fn parse_schema(ddl: &str, dialect: &dyn Dialect) -> Schema {
    let mut schema = Schema::default();
    if ddl.trim().is_empty() {
        return schema;
    }

    let Ok(statements) = Parser::parse_sql(dialect, ddl) else {
        return schema;
    };

    for stmt in statements {
        match stmt {
            Statement::CreateTable(create_table) => {
                let table_name = create_table.name.to_string().to_lowercase();
                let mut table_schema = TableSchema::default();

                for col in create_table.columns {
                    let col_name = col.name.value.to_lowercase();
                    table_schema.columns.insert(col_name.clone(), col.data_type);

                    for opt_def in col.options {
                        if let ColumnOption::Unique { .. } = opt_def.option {
                            table_schema.indexed_columns.insert(col_name.clone());
                        }
                    }
                }

                for constraint in create_table.constraints {
                    match constraint {
                        TableConstraint::PrimaryKey { columns, .. }
                        | TableConstraint::Unique { columns, .. } => {
                            for col_ident in columns {
                                table_schema
                                    .indexed_columns
                                    .insert(col_ident.value.to_lowercase());
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
                            table_schema
                                .indexed_columns
                                .insert(ident.value.to_lowercase());
                        }
                    }
                }
            }

            _ => {}
        }
    }

    schema
}
