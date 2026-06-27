export const SAMPLES_TR = {
  select_star: `-- L001: SELECT * kullanımı
SELECT *
FROM users
WHERE created_at > '2024-01-01';`,

  delete_no_where: `-- L002: WHERE olmadan DELETE — TÜM satırlar silinir!
DELETE FROM orders;`,

  or_clause: `-- L003: OR in WHERE — index kullanımını kısıtlayabilir
SELECT id, name, email
FROM users
WHERE status = 'active' OR role = 'admin';`,

  like_wildcard: `-- L005: Baştaki % wildcard — tam tablo taraması
SELECT id, username
FROM users
WHERE username LIKE '%john%';`,

  select_distinct: `-- L006: SELECT DISTINCT — pahalı sıralama gerektirir
SELECT DISTINCT country, city
FROM customers
ORDER BY country;`,

  drop_table: `-- L007: DROP TABLE — geri alınamaz!
DROP TABLE customer_archive;`,

  not_in_sub: `-- L008: NOT IN subquery — NULL sorunları + performans
SELECT id, name
FROM products
WHERE category_id NOT IN (
  SELECT id FROM categories WHERE active = 1
);`,

  complex_join: `-- Çok tablolu JOIN sorgusu
SELECT
    o.id        AS order_id,
    c.name      AS customer_name,
    p.title     AS product,
    oi.quantity,
    oi.unit_price * oi.quantity AS total
FROM orders o
INNER JOIN customers c ON o.customer_id = c.id
INNER JOIN order_items oi ON oi.order_id = o.id
INNER JOIN products p ON oi.product_id = p.id
WHERE o.status = 'completed'
  AND o.created_at BETWEEN '2024-01-01' AND '2024-12-31'
ORDER BY o.created_at DESC
LIMIT 100;`,

  clean_query: `-- Temiz sorgu: lint sorunu yok ✅
SELECT
    u.id,
    u.name,
    u.email,
    COUNT(o.id) AS order_count
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE u.active = 1
GROUP BY u.id, u.name, u.email
ORDER BY order_count DESC
LIMIT 50;`,

  union_all: `-- L011: UNION yerine UNION ALL kullanımı
SELECT id, email FROM users
UNION
SELECT id, email FROM customers;`,

  sargable: `-- L012: Kolon üzerinde fonksiyon/matematik kullanımı (Non-SARGable)
SELECT id, name FROM users 
WHERE DATE(created_at) = '2026-01-01' 
  AND price + 10 > 100;`,

  distinct_group: `-- L013: GROUP BY ile birlikte gereksiz DISTINCT
SELECT DISTINCT country, COUNT(*) 
FROM users 
GROUP BY country;`,

  having_no_group: `-- L014: GROUP BY olmadan HAVING kullanımı
SELECT country FROM users 
HAVING COUNT(*) > 5;`,

  self_compare: `-- L015: Kolonun kendisiyle karşılaştırılması (Self-Comparison)
SELECT id, name FROM users 
WHERE status = status;`,

  missing_join_on: `-- L016: JOIN işleminde ilişki koşulunun unutulması (veya etkisiz olması)
SELECT u.name, o.id 
FROM users u 
INNER JOIN orders o ON 1=1;`,

  orderby_ordinal: `-- L017: ORDER BY'da kolon sıra numarası (ordinal) kullanımı
SELECT name, email, created_at 
FROM users 
ORDER BY 1, 3 DESC;`,

  implicit_join: `-- L018: Eski tip virgüllü (implicit) JOIN kullanımı
SELECT u.name, o.id 
FROM users u, orders o 
WHERE u.id = o.user_id;`,

  subquery_no_alias: `-- L019: Alt sorgunun (Subquery) alias almaması
SELECT * 
FROM (
  SELECT id, name FROM users WHERE active = 1
);`,
};

export const SAMPLES_EN = {
  select_star: `-- L001: SELECT * usage
SELECT *
FROM users
WHERE created_at > '2024-01-01';`,

  delete_no_where: `-- L002: DELETE without WHERE — ALL rows will be deleted!
DELETE FROM orders;`,

  or_clause: `-- L003: OR in WHERE — may restrict index usage
SELECT id, name, email
FROM users
WHERE status = 'active' OR role = 'admin';`,

  like_wildcard: `-- L005: Leading % wildcard — forces full scan
SELECT id, username
FROM users
WHERE username LIKE '%john%';`,

  select_distinct: `-- L006: SELECT DISTINCT — requires expensive sorting
SELECT DISTINCT country, city
FROM customers
ORDER BY country;`,

  drop_table: `-- L007: DROP TABLE — irreversible!
DROP TABLE customer_archive;`,

  not_in_sub: `-- L008: NOT IN subquery — NULL issues + performance
SELECT id, name
FROM products
WHERE category_id NOT IN (
  SELECT id FROM categories WHERE active = 1
);`,

  complex_join: `-- Multi-table JOIN query
SELECT
    o.id        AS order_id,
    c.name      AS customer_name,
    p.title     AS product,
    oi.quantity,
    oi.unit_price * oi.quantity AS total
FROM orders o
INNER JOIN customers c ON o.customer_id = c.id
INNER JOIN order_items oi ON oi.order_id = o.id
INNER JOIN products p ON oi.product_id = p.id
WHERE o.status = 'completed'
  AND o.created_at BETWEEN '2024-01-01' AND '2024-12-31'
ORDER BY o.created_at DESC
LIMIT 100;`,

  clean_query: `-- Clean query: no lint issues ✅
SELECT
    u.id,
    u.name,
    u.email,
    COUNT(o.id) AS order_count
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE u.active = 1
GROUP BY u.id, u.name, u.email
ORDER BY order_count DESC
LIMIT 50;`,

  union_all: `-- L011: UNION ALL instead of UNION
SELECT id, email FROM users
UNION
SELECT id, email FROM customers;`,

  sargable: `-- L012: Function/math on column (Non-SARGable)
SELECT id, name FROM users 
WHERE DATE(created_at) = '2026-01-01' 
  AND price + 10 > 100;`,

  distinct_group: `-- L013: Redundant DISTINCT with GROUP BY
SELECT DISTINCT country, COUNT(*) 
FROM users 
GROUP BY country;`,

  having_no_group: `-- L014: HAVING without GROUP BY
SELECT country FROM users 
HAVING COUNT(*) > 5;`,

  self_compare: `-- L015: Column compared to itself (Self-Comparison)
SELECT id, name FROM users 
WHERE status = status;`,

  missing_join_on: `-- L016: Missing or ineffective JOIN condition
SELECT u.name, o.id 
FROM users u 
INNER JOIN orders o ON 1=1;`,

  orderby_ordinal: `-- L017: ORDER BY using column ordinal number
SELECT name, email, created_at 
FROM users 
ORDER BY 1, 3 DESC;`,

  implicit_join: `-- L018: Old comma-separated (implicit) JOIN
SELECT u.name, o.id 
FROM users u, orders o 
WHERE u.id = o.user_id;`,

  subquery_no_alias: `-- L019: Subquery without alias
SELECT * 
FROM (
  SELECT id, name FROM users WHERE active = 1
);`,
};

// ─────────────────────────────────────────────────────────────
// Translations Dictionary
// ─────────────────────────────────────────────────────────────

export const UI_TRANSLATIONS = {
  tr: {
    "brand-tag": "Playground",
    "dialect-label": "Dialect",
    "sample-label": "Örnek",
    "sample-placeholder": "— Yükle —",
    "status-loading": "Yükleniyor…",
    "status-ready": "Hazır",
    "status-error": "Wasm hatası",
    "status-boot-error": "Başlatma hatası",
    "analyze-btn": "Analiz Et",
    "clear-btn": "Temizle",
    "schema-btn": "📋 Şema DDL (İsteğe Bağlı)",
    "schema-title": "Veritabanı Şeması (DDL)",
    "schema-subtitle": "CREATE TABLE / CREATE INDEX tanımları",
    "schema-placeholder": "CREATE TABLE users (\n  id INT PRIMARY KEY,\n  name VARCHAR(50)\n);",
    "line-count-label": "Satır",
    "char-count-label": "Karakter",
    "local-badge-text": "100% Yerel",
    "tab-lint": "🐛 Lint",
    "tab-format": "✨ Format",
    "tab-ast": "🌳 AST",
    "tab-stats": "📊 Stats",
    "lint-empty-text": "SQL girin ve <strong>Analiz Et</strong>'e tıklayın",
    "format-empty-text": "Formatlanmış SQL burada görünecek",
    "ast-empty-text": "Abstract Syntax Tree burada görünecek",
    "stats-empty-text": "Sorgu istatistikleri burada görünecek",
    "copy-btn": "📋 Kopyala",
    "copy-btn-success": "✅ Kopyalandı",
    "ast-expand-btn": "▶ Tümünü Aç",
    "ast-collapse-btn": "▼ Tümünü Kapat",
    "ast-json-btn": "📄 JSON Görünümü",
    "ast-graph-btn": "🌳 Grafik Görünümü",
    "stat-statements": "İfade",
    "stat-tables": "Tablo",
    "stat-joins": "JOIN",
    "stat-subqueries": "Alt Sorgu",
    "stat-columns": "Sütun",
    "flag-where": "WHERE",
    "flag-groupby": "GROUP BY",
    "flag-orderby": "ORDER BY",
    "flag-limit": "LIMIT",
    "flag-yes": "Var ✓",
    "flag-no": "Yok ✗",
  },
  en: {
    "brand-tag": "Playground",
    "dialect-label": "Dialect",
    "sample-label": "Sample",
    "sample-placeholder": "— Load —",
    "status-loading": "Loading…",
    "status-ready": "Ready",
    "status-error": "Wasm error",
    "status-boot-error": "Boot error",
    "analyze-btn": "Analyze",
    "clear-btn": "Clear",
    "schema-btn": "📋 Schema DDL (Optional)",
    "schema-title": "Database Schema (DDL)",
    "schema-subtitle": "CREATE TABLE / CREATE INDEX definitions",
    "schema-placeholder": "CREATE TABLE users (\n  id INT PRIMARY KEY,\n  name VARCHAR(50)\n);",
    "line-count-label": "Line",
    "char-count-label": "Character",
    "local-badge-text": "100% Local",
    "tab-lint": "🐛 Lint",
    "tab-format": "✨ Format",
    "tab-ast": "🌳 AST",
    "tab-stats": "📊 Stats",
    "lint-empty-text": "Enter SQL and click <strong>Analyze</strong>",
    "format-empty-text": "Formatted SQL will appear here",
    "ast-empty-text": "Abstract Syntax Tree will appear here",
    "stats-empty-text": "Query statistics will appear here",
    "copy-btn": "📋 Copy",
    "copy-btn-success": "✅ Copied",
    "ast-expand-btn": "▶ Expand All",
    "ast-collapse-btn": "▼ Collapse All",
    "ast-json-btn": "📄 JSON View",
    "ast-graph-btn": "🌳 Graph View",
    "stat-statements": "Statement",
    "stat-tables": "Table",
    "stat-joins": "JOIN",
    "stat-subqueries": "Subquery",
    "stat-columns": "Column",
    "flag-where": "WHERE",
    "flag-groupby": "GROUP BY",
    "flag-orderby": "ORDER BY",
    "flag-limit": "LIMIT",
    "flag-yes": "Yes ✓",
    "flag-no": "No ✗",
  }
};

export const SAMPLE_LABELS = {
  tr: {
    select_star: "SELECT * (L001)",
    delete_no_where: "DELETE no WHERE (L002)",
    or_clause: "OR in WHERE (L003)",
    like_wildcard: "LIKE leading % (L005)",
    select_distinct: "SELECT DISTINCT (L006)",
    drop_table: "DROP TABLE (L007)",
    not_in_sub: "NOT IN subquery (L008)",
    union_all: "UNION yerine UNION ALL (L011)",
    sargable: "Non-SARGable WHERE (L012)",
    distinct_group: "DISTINCT ile GROUP BY (L013)",
    having_no_group: "HAVING without GROUP (L014)",
    self_compare: "Self-Comparison (L015)",
    missing_join_on: "Missing JOIN ON (L016)",
    orderby_ordinal: "ORDER BY Ordinal (L017)",
    implicit_join: "Implicit JOIN (L018)",
    subquery_no_alias: "Subquery without Alias (L019)",
    complex_join: "Çok tablolu JOIN",
    clean_query: "Temiz sorgu ✅"
  },
  en: {
    select_star: "SELECT * (L001)",
    delete_no_where: "DELETE no WHERE (L002)",
    or_clause: "OR in WHERE (L003)",
    like_wildcard: "LIKE leading % (L005)",
    select_distinct: "SELECT DISTINCT (L006)",
    drop_table: "DROP TABLE (L007)",
    not_in_sub: "NOT IN subquery (L008)",
    union_all: "UNION instead of UNION ALL (L011)",
    sargable: "Non-SARGable WHERE (L012)",
    distinct_group: "DISTINCT with GROUP BY (L013)",
    having_no_group: "HAVING without GROUP (L014)",
    self_compare: "Self-Comparison (L015)",
    missing_join_on: "Missing JOIN ON (L016)",
    orderby_ordinal: "ORDER BY Ordinal (L017)",
    implicit_join: "Implicit JOIN (L018)",
    subquery_no_alias: "Subquery without Alias (L019)",
    complex_join: "Complex JOIN query",
    clean_query: "Clean query ✅"
  }
};

export const LINT_TRANSLATIONS = {
  L001: {
    en: {
      message: "Use of SELECT *: Unnecessary columns are retrieved, I/O increases, and covering index is bypassed.",
      suggestion: "List only the required columns: SELECT id, name, email FROM ..."
    }
  },
  L002: {
    en: {
      message: "No WHERE clause in UPDATE/DELETE statement - ALL rows in the table will be affected!",
      suggestion: "Add WHERE id = ?: UPDATE table SET column = value WHERE id = ?"
    }
  },
  L003: {
    en: {
      message: "Using OR in WHERE clause may prevent index usage.",
      suggestion: "Consider splitting OR conditions into separate queries and merging them with UNION ALL."
    }
  },
  L004: {
    en: {
      message: "SQL keywords are using lowercase.",
      suggestion: "Standard practice: Write SELECT, FROM, WHERE, JOIN, ON in uppercase."
    }
  },
  L005: {
    en: {
      message: "LIKE '%...' leading wildcard: Index cannot be used, forces a full table scan.",
      suggestion: "Use suffix wildcard if possible (LIKE 'value%') or consider full text search."
    }
  },
  L006: {
    en: {
      message: "SELECT DISTINCT: May require full table scan and expensive sorting.",
      suggestion: "Alternative: Consider using GROUP BY or EXISTS; only use if actually necessary."
    }
  },
  L007: {
    en: {
      message: "DROP TABLE/TRUNCATE cannot be undone - data is permanently deleted.",
      suggestion: "Backup data before running; consider restricting access instead of dropping."
    }
  },
  L008: {
    en: {
      message: "NOT IN (subquery): Rows containing NULL might not match; NOT EXISTS is usually more efficient.",
      suggestion: "Rewrite with NOT EXISTS: WHERE NOT EXISTS (SELECT 1 FROM ... WHERE ...)"
    }
  },
  L009: {
    en: {
      message: (msg) => {
        const match = msg.match(/JOIN'deki '(.+?)' tablosuna/);
        const name = match ? match[1] : "table";
        return `Table '${name}' in JOIN has no alias.`;
      },
      suggestion: (sug) => {
        const match = sug.match(/ekleyin: (.+?) (.+)/);
        if (match) {
          return `Add an alias for readability: ${match[1]} ${match[2]}`;
        }
        return "Add a table alias for better readability.";
      }
    }
  },
  L010: {
    en: {
      message: "Scalar subquery in WHERE clause: May be executed for each row.",
      suggestion: "Consider rewriting with CTE (WITH clause) or JOIN."
    }
  },
  L011: {
    en: {
      message: "Use of UNION: Performs an expensive sort operation to remove duplicate records.",
      suggestion: "Use UNION ALL if duplicate records do not need to be eliminated."
    }
  },
  L012: {
    en: {
      message: "Mathematical operation or function call on a column in filter condition (Non-SARGable). This prevents index usage.",
      suggestion: "Move the operation to the other side of the equation, or filter without wrapping columns in function calls."
    }
  },
  L013: {
    en: {
      message: "Redundant DISTINCT used with GROUP BY. GROUP BY already deduplicates results; DISTINCT is redundant and adds extra sorting overhead.",
      suggestion: "Remove the DISTINCT keyword from the query."
    }
  },
  L014: {
    en: {
      message: "Use of HAVING without GROUP BY. This is usually a logical error.",
      suggestion: "Use WHERE for row-level filtering or add GROUP BY to the query."
    }
  },
  L015: {
    en: {
      message: "Column compared to itself (Self-Comparison). This is usually a logic error due to a typo.",
      suggestion: "Check the comparison and make sure you are comparing the correct tables/columns."
    }
  },
  L016: {
    en: {
      message: "JOIN relationship condition (ON/USING) is missing or set to a constant (ON 1=1 / ON true). This can cause a Cartesian product (Cross Join).",
      suggestion: "Add the condition specifying the relationship between tables: ON table1.id = table2.table1_id"
    }
  },
  L017: {
    en: {
      message: "ORDER BY uses column ordinal number. This is fragile.",
      suggestion: "Write column names explicitly instead of ordinal numbers: ORDER BY created_at, user_name."
    }
  },
  L018: {
    en: {
      message: "Implicit join using commas. Harder to read and maintain.",
      suggestion: "Convert to modern explicit JOIN format: FROM table1 INNER JOIN table2 ON ..."
    }
  },
  L019: {
    en: {
      message: "No alias defined for subquery. In many databases, this causes a syntax error.",
      suggestion: "Add an alias to the end of the subquery: (SELECT ...) AS subquery"
    }
  },
  L020: {
    en: {
      message: (msg) => {
        if (msg.includes("Bilinmeyen tablo/alias")) {
          const match = msg.match(/Bilinmeyen tablo\/alias: '(.+?)'/);
          return `Unknown table/alias: '${match ? match[1] : ""}'`;
        }
        if (msg.includes("Tablo bulunamadi")) {
          const match = msg.match(/Tablo bulunamadi: '(.+?)'/);
          return `Table not found: '${match ? match[1] : ""}'`;
        }
        if (msg.includes("Belirsiz kolon referansi")) {
          const match = msg.match(/Belirsiz kolon referansi: '(.+?)'/);
          return `Ambiguous column reference: '${match ? match[1] : ""}'`;
        }
        if (msg.includes("Kolon bulunamadi")) {
          const match = msg.match(/Kolon bulunamadi: '(.+?)'/);
          return `Column not found: '${match ? match[1] : ""}'`;
        }
        return msg;
      },
      suggestion: (sug) => {
        if (sug.includes("adli bir tablo veya alias bulunmamaktadir")) {
          const match = sug.match(/Sorguda '(.+?)' adli/);
          return `No table or alias named '${match ? match[1] : ""}' found in query.`;
        }
        if (sug.includes("tabloda bulunmamaktadir. Lutfen yazimi kontrol edin veya semayi guncelleyin")) {
          const match = sug.match(/Veritabaninda '(.+?)' adinda/);
          return `No table named '${match ? match[1] : ""}' exists in database. Please check spelling or update schema.`;
        }
        if (sug.includes("sorguda kullanilan tablolarda")) {
          const match = sug.match(/tablolarda '(.+?)' adinda/);
          return `No column named '${match ? match[1] : ""}' exists in the tables used in query.`;
        }
        if (sug.includes("birden fazla tabloda mevcut")) {
          const match = sug.match(/Kolon '(.+?)' birden fazla tabloda mevcut: (.+?)\. Lutfen/);
          if (match) {
            return `Column '${match[1]}' exists in multiple tables: ${match[2]}. Please specify table or alias (e.g., t.${match[1]}).`;
          }
        }
        if (sug.includes("tablosunda") && sug.includes("isminde bir kolon tanimlanmamistir")) {
          const match = sug.match(/'(.+?)' tablosunda '(.+?)' isminde/);
          if (match) {
            return `Column '${match[2]}' is not defined in table '${match[1]}'.`;
          }
        }
        return sug;
      }
    }
  },
  L021: {
    en: {
      message: "Type mismatch and implicit conversion",
      suggestion: (sug) => {
        if (sug.includes("Sayisal bir kolon olan")) {
          const match = sug.match(/olan '(.+?)',/);
          return `Numeric column '${match ? match[1] : ""}' is compared with a string value. This may prevent index usage (SARGability).`;
        }
        if (sug.includes("Metinsel bir kolon olan")) {
          const match = sug.match(/olan '(.+?)',/);
          return `Textual column '${match ? match[1] : ""}' is compared with a numeric value. This may disable the index due to data type conversion.`;
        }
        return sug;
      }
    }
  },
  L022: {
    en: {
      message: (msg) => {
        const match = msg.match(/Indekssiz kolon filtresi: '(.+?)'/);
        return `Unindexed column filter: '${match ? match[1] : ""}'`;
      },
      suggestion: (sug) => {
        const match = sug.match(/'(.+?)' tablosu icin indeksler tanimlanmis ancak filtrede kullanilan '(.+?)' kolonu/);
        if (match) {
          return `Indexes are defined for table '${match[1]}', but column '${match[2]}' used in the filter is not indexed. A Full Table Scan may occur.`;
        }
        return sug;
      }
    }
  },
  L023: {
    en: {
      message: "Using column = NULL or column != NULL leads to logic errors. NULL value comparisons always evaluate to UNKNOWN.",
      suggestion: "Use IS NULL or IS NOT NULL instead: column IS NULL / column IS NOT NULL."
    }
  },
  L024: {
    en: {
      message: "Using a scalar subquery in the SELECT list: May execute separately for each row, causing performance degradation (N+1 query problem).",
      suggestion: "Consider optimizing the query using LEFT JOIN or CTE (WITH clause)."
    }
  },
  L025: {
    en: {
      message: "Redundant nested double parentheses. Reduces SQL readability.",
      suggestion: "Remove external or internal extra parentheses: (id = 1) instead of ((id = 1))."
    }
  },
  L026: {
    en: {
      message: "No LIMIT clause specified. This query may consume high memory and I/O when executed on large tables.",
      suggestion: "Add a limit to the end of the query like LIMIT 100 or use pagination."
    }
  }
};
