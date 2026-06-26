# SQL Linter & Optimizer Playground

> **100% local-first · Privacy-focused · Powered by Rust/WebAssembly**

A browser-based SQL analysis tool that runs entirely client-side — your queries never leave your machine.

[![Deploy Status](https://github.com/USERNAME/sql-optimizer/actions/workflows/deploy.yml/badge.svg)](https://github.com/USERNAME/sql-optimizer/actions/workflows/deploy.yml)

---

## Features

| Feature | Description |
|---|---|
| ⚡ Rust/Wasm Engine | `sqlparser-rs` compiled to WebAssembly — zero latency |
| 🔒 Privacy First | No server, no telemetry, no data leaves the browser |
| 🐛 10 Lint Rules | Performance, safety, and style rules (L001–L010) |
| ✨ SQL Formatter | Keyword normalisation + clause indentation |
| 🌳 AST Viewer | Collapsible JSON tree of the parsed Abstract Syntax Tree |
| 📊 Query Stats | Table count, JOIN count, subquery count, clause flags |
| 🎨 7 SQL Dialects | Generic, PostgreSQL, MySQL, SQL Server, SQLite, BigQuery, ANSI |

## Lint Rules

| ID | Severity | Category | Description |
|---|---|---|---|
| L001 | ⚠ Warning | Performance | `SELECT *` — prevents covering index, excess I/O |
| L002 | 🔴 Error | Safety | `UPDATE`/`DELETE` without `WHERE` — affects ALL rows |
| L003 | ⚠ Warning | Performance | `OR` in `WHERE` — may prevent index usage |
| L004 | 🔵 Info | Style | Lowercase SQL keywords |
| L005 | ⚠ Warning | Performance | `LIKE '%...'` leading wildcard — forces full scan |
| L006 | 🔵 Info | Performance | `SELECT DISTINCT` — expensive sort |
| L007 | 🔴 Error | Safety | `DROP TABLE` / `TRUNCATE` — irreversible! |
| L008 | ⚠ Warning | Performance | `NOT IN (subquery)` — NULL issues + use `NOT EXISTS` |
| L009 | 🔵 Info | Style | Unaliased table in `JOIN` |
| L010 | ⚠ Warning | Performance | Scalar subquery in `WHERE` — use CTE or JOIN |

---

## Local Development

### Prerequisites

```bash
# Install Rust (https://rustup.rs)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Add wasm32 target
rustup target add wasm32-unknown-unknown

# Install wasm-pack
cargo install wasm-pack
```

### Build & Run

```bash
# Clone the repo
git clone https://github.com/USERNAME/sql-optimizer.git
cd sql-optimizer

# Build the Wasm package
wasm-pack build --target web --out-dir web/pkg

# Serve locally (requires Python 3)
cd web
python -m http.server 8080

# Open → http://localhost:8080
```

### Run Tests

```bash
cargo test --lib
```

---

## GitHub Pages Deployment

1. Push to `main` — GitHub Actions automatically builds and deploys.
2. In **Repository Settings → Pages**, set Source to **Deploy from a branch** → `gh-pages`.
3. Your app is live at `https://USERNAME.github.io/sql-optimizer/`

---

## Tech Stack

- **Engine:** Rust · `sqlparser = "0.50"` · `wasm-bindgen` · `wasm-pack`
- **Frontend:** Vanilla JS (ES Modules) · CSS Custom Properties
- **Editor:** Monaco Editor (CDN) — the VS Code editor
- **CI/CD:** GitHub Actions → GitHub Pages

## License

MIT
