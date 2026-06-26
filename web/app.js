/**
 * SQL Linter & Optimizer Playground — Application Logic
 *
 * Responsibilities:
 *  1. Animated particle background
 *  2. Import & initialise the Rust/Wasm module
 *  3. Initialise Monaco Editor (SQL dialect + custom dark theme)
 *  4. Wire up: Analyse button, Clear, Sample picker, Resize handle
 *  5. Render Lint, Format, AST, and Stats panels
 */

import init, { parse_and_analyze } from './pkg/sql_optimizer.js';

// ─────────────────────────────────────────────────────────────
// Sample queries
// ─────────────────────────────────────────────────────────────

const SAMPLES = {
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

// ─────────────────────────────────────────────────────────────
// Particle canvas background
// ─────────────────────────────────────────────────────────────

(function initParticles() {
  const canvas = document.getElementById('bg-canvas');
  const ctx    = canvas.getContext('2d');
  let particles = [];

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  class Particle {
    constructor() { this.reset(true); }

    reset(randomY = false) {
      this.x  = Math.random() * canvas.width;
      this.y  = randomY ? Math.random() * canvas.height : canvas.height + 10;
      this.r  = Math.random() * 1.5 + 0.4;
      this.vx = (Math.random() - 0.5) * 0.25;
      this.vy = -(Math.random() * 0.4 + 0.1);
      this.alpha = Math.random() * 0.35 + 0.05;
      this.hue = Math.random() > 0.6 ? 245 : 270; // indigo or violet
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;
      if (this.y < -5 || this.x < -5 || this.x > canvas.width + 5) this.reset();
    }

    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${this.hue}, 80%, 65%, ${this.alpha})`;
      ctx.fill();
    }
  }

  resize();
  for (let i = 0; i < 90; i++) particles.push(new Particle());

  window.addEventListener('resize', () => {
    resize();
    particles = [];
    for (let i = 0; i < 90; i++) particles.push(new Particle());
  });

  (function frame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => { p.update(); p.draw(); });
    requestAnimationFrame(frame);
  })();
})();

// ─────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────

let editor       = null;
let sqlAnalyze   = null;   // set after Wasm init
let wasmReady    = false;
let monacoReady  = false;
let lastResult   = null;

// ─────────────────────────────────────────────────────────────
// Boot: Wasm + Monaco in parallel
// ─────────────────────────────────────────────────────────────

async function boot() {
  const wasmP   = initWasm();
  const monacoP = initMonaco();
  await Promise.all([wasmP, monacoP]);
  setupApp();
}

async function initWasm() {
  try {
    await init();
    sqlAnalyze = parse_and_analyze;
    wasmReady  = true;
    setStatus('ready', 'Hazır');
  } catch (e) {
    setStatus('error', 'Wasm hatası');
    console.error('[Wasm] init failed:', e);
  }
}

function initMonaco() {
  return new Promise((resolve) => {
    require.config({
      paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' },
    });

    require(['vs/editor/editor.main'], function () {
      // ── Custom dark theme ──────────────────────────────────
      monaco.editor.defineTheme('sql-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'keyword.sql',       foreground: '818cf8', fontStyle: 'bold' },
          { token: 'predefined.sql',    foreground: '818cf8' },
          { token: 'string.sql',        foreground: '86efac' },
          { token: 'number.sql',        foreground: 'fde68a' },
          { token: 'comment.sql',       foreground: '6b7280', fontStyle: 'italic' },
          { token: 'operator.sql',      foreground: 'f9a8d4' },
        ],
        colors: {
          'editor.background':             '#07071a',
          'editor.foreground':             '#e2e8f0',
          'editorCursor.foreground':       '#818cf8',
          'editor.lineHighlightBackground':'#13132e',
          'editorLineNumber.foreground':   '#2d3748',
          'editorLineNumber.activeForeground': '#818cf8',
          'editor.selectionBackground':    '#3730a360',
          'editor.inactiveSelectionBackground': '#3730a330',
          'editorWidget.background':       '#0e0e24',
          'editorSuggestWidget.background':'#0e0e24',
          'editorSuggestWidget.border':    '#1e1e3f',
          'editorSuggestWidget.selectedBackground': '#1e1e3f',
          'scrollbarSlider.background':    '#ffffff15',
          'scrollbarSlider.hoverBackground':'#ffffff25',
        },
      });

      editor = monaco.editor.create(
        document.getElementById('editor-container'),
        {
          value: SAMPLES.select_star,
          language: 'sql',
          theme: 'sql-dark',
          minimap:              { enabled: false },
          fontSize:             14,
          lineHeight:           22,
          fontFamily:           "'JetBrains Mono', 'Fira Code', monospace",
          fontLigatures:        true,
          wordWrap:             'on',
          scrollBeyondLastLine: false,
          automaticLayout:      true,
          padding:              { top: 16, bottom: 16 },
          renderLineHighlight:  'gutter',
          cursorBlinking:       'smooth',
          smoothScrolling:      true,
          bracketPairColorization: { enabled: true },
          tabSize:              2,
          overviewRulerLanes:   0,
        }
      );

      // Live token stats
      editor.onDidChangeModelContent(updateTokenStats);
      updateTokenStats();

      // Ctrl+Enter → Analyse
      editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
        () => runAnalysis()
      );

      monacoReady = true;
      resolve();
    });
  });
}

// ─────────────────────────────────────────────────────────────
// App wiring (called once both Wasm & Monaco are ready)
// ─────────────────────────────────────────────────────────────

function setupApp() {
  const analyzeBtn = document.getElementById('analyze-btn');
  const clearBtn   = document.getElementById('clear-btn');
  const sampleSel  = document.getElementById('sample-select');

  analyzeBtn.disabled = false;
  analyzeBtn.addEventListener('click', runAnalysis);
  clearBtn.addEventListener('click', clearEditor);

  sampleSel.addEventListener('change', () => {
    const key = sampleSel.value;
    if (key && SAMPLES[key]) {
      editor.setValue(SAMPLES[key]);
      sampleSel.value = '';
      editor.focus();
    }
  });

  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Copy formatted SQL
  document.getElementById('copy-formatted').addEventListener('click', copyFormatted);

  // AST expand/collapse all
  document.getElementById('expand-all-ast').addEventListener('click',
    () => toggleAllAST(true));
  document.getElementById('collapse-all-ast').addEventListener('click',
    () => toggleAllAST(false));

  // Collapsible Schema Section
  const toggleSchemaBtn = document.getElementById('toggle-schema-btn');
  const schemaContainer = document.getElementById('schema-container');
  const schemaInput     = document.getElementById('schema-input');

  if (schemaInput) {
    schemaInput.value = `CREATE TABLE users (
  user_id INT PRIMARY KEY,
  first_name VARCHAR(50),
  last_name VARCHAR(50),
  status VARCHAR(20),
  created_at TIMESTAMP
);

CREATE TABLE orders (
  order_id INT PRIMARY KEY,
  user_id INT,
  total_amount DECIMAL(10,2),
  order_date DATE
);

CREATE INDEX idx_orders_user_id ON orders(user_id);`;
  }

  if (toggleSchemaBtn && schemaContainer) {
    toggleSchemaBtn.addEventListener('click', () => {
      const isVisible = schemaContainer.classList.toggle('active');
      toggleSchemaBtn.setAttribute('aria-expanded', isVisible);
      toggleSchemaBtn.classList.toggle('active', isVisible);
      if (editor) {
        setTimeout(() => editor.layout(), 50);
      }
    });
  }

  // Resize handle
  initResizeHandle();
}

// ─────────────────────────────────────────────────────────────
// Analysis
// ─────────────────────────────────────────────────────────────

function runAnalysis() {
  if (!wasmReady || !sqlAnalyze) return;

  const sql     = editor.getValue().trim();
  const dialect = document.getElementById('dialect-select').value;
  const schema  = document.getElementById('schema-input').value.trim();

  if (!sql) {
    flashEmpty();
    return;
  }

  // Hide previous error
  showErrorOverlay(false);

  let result;
  try {
    result = JSON.parse(sqlAnalyze(sql, dialect, schema));
  } catch (e) {
    showErrorOverlay(true, 'İç hata: ' + e.message);
    return;
  }

  lastResult = result;

  if (!result.success) {
    showErrorOverlay(true, result.error || 'Bilinmeyen hata');
    return;
  }

  renderLint(result.lint_issues);
  renderFormat(result.formatted_sql);
  renderAST(result.ast_json);
  renderStats(result.stats, result.lint_issues);

  // Switch to lint tab to show results
  switchTab('lint');
}

// ─────────────────────────────────────────────────────────────
// Lint panel
// ─────────────────────────────────────────────────────────────

function renderLint(issues) {
  const container = document.getElementById('lint-results');
  const empty     = document.getElementById('lint-empty');
  const badge     = document.getElementById('lint-badge');

  badge.textContent = issues.length;

  // Update badge colour
  badge.className = 'tab-badge';
  if (issues.some(i => i.severity === 'error'))
    badge.classList.add('has-errors');
  else if (issues.some(i => i.severity === 'warning'))
    badge.classList.add('has-warnings');

  if (issues.length === 0) {
    empty.hidden  = false;
    empty.innerHTML = `
      <div class="no-issues">
        <div class="no-issues-icon">✅</div>
        <p style="color:var(--success);font-weight:600">Mükemmel! Hiçbir lint sorunu bulunamadı.</p>
        <p style="color:var(--text-muted);font-size:12px;margin-top:4px">SQL iyi yazılmış görünüyor.</p>
      </div>`;
    container.innerHTML = '';
    return;
  }

  empty.hidden    = true;
  container.innerHTML = issues
    .map(issue => {
      const sevLabel = { error: '🔴 Hata', warning: '🟡 Uyarı', info: '🔵 Bilgi' }[issue.severity] || issue.severity;
      const catLabel = { performance: '⚡ Performans', safety: '🛡 Güvenlik', style: '🎨 Stil' }[issue.category] || issue.category;

      return `
      <div class="lint-card sev-${issue.severity}">
        <div class="lint-header">
          <span class="rule-badge">${escHtml(issue.rule_id)}</span>
          <span class="sev-badge ${issue.severity}">${sevLabel}</span>
          <span class="cat-badge">${catLabel}</span>
        </div>
        <p class="lint-message">${escHtml(issue.message)}</p>
        <div class="lint-suggestion">
          <span class="suggestion-icon">💡</span>
          <span>${escHtml(issue.suggestion)}</span>
        </div>
      </div>`;
    })
    .join('');
}

// ─────────────────────────────────────────────────────────────
// Format panel
// ─────────────────────────────────────────────────────────────

function renderFormat(formattedSQL) {
  const empty  = document.getElementById('format-empty');
  const output = document.getElementById('format-output');
  const code   = document.getElementById('format-code');

  empty.hidden  = true;
  output.hidden = false;
  code.innerHTML = highlightSQL(formattedSQL);
}

function highlightSQL(rawSQL) {
  const tokenRegex = /(--[^\n]*)|('([^'\\]|\\.)*')|("([^"\\]|\\.)*")|(\b\d+(?:\.\d+)?\b)|(\b[a-zA-Z_][a-zA-Z0-9_]*\b)|([^\s\w]+)|(\s+)/g;

  const keywords = new Set([
    'SELECT','FROM','WHERE','JOIN','INNER','LEFT','RIGHT','FULL','OUTER','CROSS','ON',
    'AND','OR','NOT','IN','IS','NULL','GROUP','BY','ORDER','HAVING','LIMIT','OFFSET',
    'UNION','ALL','INSERT','UPDATE','DELETE','SET','CREATE','DROP','TABLE','INDEX',
    'VIEW','DISTINCT','AS','CASE','WHEN','THEN','ELSE','END','EXISTS','BETWEEN',
    'LIKE','ANY','ASC','DESC','WITH','TRUNCATE','RETURNING'
  ]);

  let match;
  let html = '';
  tokenRegex.lastIndex = 0;

  while ((match = tokenRegex.exec(rawSQL)) !== null) {
    const [
      token,
      comment,
      sqString, _1,
      dqString, _2,
      number,
      word,
      punct,
      space
    ] = match;

    if (comment !== undefined) {
      html += `<span class="kw-comment">${escHtml(token)}</span>`;
    } else if (sqString !== undefined || dqString !== undefined) {
      html += `<span class="kw-string">${escHtml(token)}</span>`;
    } else if (number !== undefined) {
      html += `<span class="kw-number">${escHtml(token)}</span>`;
    } else if (word !== undefined) {
      const upperWord = token.toUpperCase();
      if (keywords.has(upperWord)) {
        html += `<span class="kw-keyword">${escHtml(token)}</span>`;
      } else {
        html += escHtml(token);
      }
    } else {
      html += escHtml(token);
    }
  }

  return html;
}

function copyFormatted() {
  const text = document.getElementById('format-code').innerText;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copy-formatted');
    btn.textContent = '✅ Kopyalandı';
    setTimeout(() => { btn.textContent = '📋 Kopyala'; }, 2000);
  });
}

// ─────────────────────────────────────────────────────────────
// AST panel
// ─────────────────────────────────────────────────────────────

function renderAST(astJson) {
  const empty  = document.getElementById('ast-empty');
  const output = document.getElementById('ast-output');
  const tree   = document.getElementById('ast-tree');

  if (!astJson) {
    empty.hidden = false; output.hidden = true; return;
  }

  empty.hidden  = true;
  output.hidden = false;
  tree.innerHTML = jsonTreeHTML(astJson, 0);
}

function jsonTreeHTML(value, depth) {
  if (value === null)             return `<span class="json-null">null</span>`;
  if (typeof value === 'boolean') return `<span class="json-bool">${value}</span>`;
  if (typeof value === 'number')  return `<span class="json-number">${value}</span>`;
  if (typeof value === 'string')  return `<span class="json-string">"${escHtml(value)}"</span>`;

  if (Array.isArray(value)) {
    if (value.length === 0) return `<span class="json-bracket">[ ]</span>`;
    const open  = depth < 3 ? ' open' : '';
    const items = value
      .map((v, i) => `<div class="json-property">${jsonTreeHTML(v, depth + 1)}</div>`)
      .join('');
    return `<details${open}><summary class="json-bracket">[${value.length} item${value.length !== 1 ? 's' : ''}]</summary><div class="json-children">${items}</div></details>`;
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value).filter(k => value[k] !== null && !(Array.isArray(value[k]) && value[k].length === 0));
    if (keys.length === 0) {
      const allKeys = Object.keys(value);
      if (allKeys.length === 0) return `<span class="json-bracket">{ }</span>`;
    }
    const open = depth < 4 ? ' open' : '';
    // Show the most interesting key as summary label
    const label = value.type ?? value.kind ?? value.name ?? (keys[0] ? `{${keys.length}}` : '{}');
    const items = Object.keys(value)
      .map(k => {
        const v = value[k];
        return `<div class="json-property"><span class="json-key">${escHtml(k)}</span>: ${jsonTreeHTML(v, depth + 1)}</div>`;
      })
      .join('');
    return `<details${open}><summary class="json-bracket">${escHtml(String(label))}</summary><div class="json-children">${items}</div></details>`;
  }

  return escHtml(String(value));
}

function toggleAllAST(open) {
  document.querySelectorAll('#ast-tree details').forEach(d => {
    d.open = open;
  });
}

// ─────────────────────────────────────────────────────────────
// Stats panel
// ─────────────────────────────────────────────────────────────

function renderStats(stats, issues) {
  const empty  = document.getElementById('stats-empty');
  const output = document.getElementById('stats-output');
  empty.hidden  = true;
  output.hidden = false;

  document.getElementById('stat-statements').textContent  = stats.statement_count  ?? '—';
  document.getElementById('stat-tables').textContent      = stats.table_count       ?? '—';
  document.getElementById('stat-joins').textContent       = stats.join_count        ?? '—';
  document.getElementById('stat-subqueries').textContent  = stats.subquery_count    ?? '—';
  document.getElementById('stat-columns').textContent     = stats.column_count      ?? '—';

  setFlag('flag-where',   stats.has_where);
  setFlag('flag-groupby', stats.has_group_by);
  setFlag('flag-orderby', stats.has_order_by);
  setFlag('flag-limit',   stats.has_limit);

  // Lint summary
  const errors   = issues.filter(i => i.severity === 'error').length;
  const warnings = issues.filter(i => i.severity === 'warning').length;
  const infos    = issues.filter(i => i.severity === 'info').length;
  const box      = document.getElementById('lint-summary-box');
  box.innerHTML  = issues.length === 0
    ? `<span style="color:var(--success)">✅ Hiçbir lint sorunu yok.</span>`
    : `Toplam <strong>${issues.length}</strong> lint bulgusu:
       ${errors   ? `<span style="color:var(--error)">  ${errors} hata</span>`   : ''}
       ${warnings ? `<span style="color:var(--warning)"> ${warnings} uyarı</span>` : ''}
       ${infos    ? `<span style="color:var(--info)">   ${infos} bilgi</span>`    : ''}`;
}

function setFlag(id, value) {
  const el = document.getElementById(id);
  if (value === undefined || value === null) {
    el.className    = 'flag-val flag-na';
    el.textContent  = '—';
  } else if (value) {
    el.className    = 'flag-val flag-yes';
    el.textContent  = 'Var ✓';
  } else {
    el.className    = 'flag-val flag-no';
    el.textContent  = 'Yok ✗';
  }
}

// ─────────────────────────────────────────────────────────────
// Tab switching
// ─────────────────────────────────────────────────────────────

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => {
    const active = t.dataset.tab === name;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', active);
  });

  document.querySelectorAll('.panel').forEach(p => {
    const active = p.id === `panel-${name}`;
    p.classList.toggle('active', active);
    p.hidden = !active;
  });
}

// ─────────────────────────────────────────────────────────────
// Status indicator
// ─────────────────────────────────────────────────────────────

function setStatus(state, text) {
  document.getElementById('status-dot').className = `status-dot ${state}`;
  document.getElementById('status-text').textContent = text;
}

// ─────────────────────────────────────────────────────────────
// Error overlay
// ─────────────────────────────────────────────────────────────

function showErrorOverlay(show, message = '') {
  const overlay = document.getElementById('error-overlay');
  overlay.hidden = !show;
  if (show) document.getElementById('error-message').textContent = message;
}

// ─────────────────────────────────────────────────────────────
// Toolbar helpers
// ─────────────────────────────────────────────────────────────

function updateTokenStats() {
  if (!editor) return;
  const model = editor.getModel();
  document.getElementById('line-count').textContent = model.getLineCount();
  document.getElementById('char-count').textContent = model.getValue().length;
}

function clearEditor() {
  if (!editor) return;
  editor.setValue('');
  showErrorOverlay(false);
  document.getElementById('lint-results').innerHTML    = '';
  document.getElementById('lint-badge').textContent    = '0';
  document.getElementById('lint-badge').className      = 'tab-badge';
  document.getElementById('lint-empty').hidden         = false;
  document.getElementById('format-empty').hidden       = false;
  document.getElementById('format-output').hidden      = true;
  document.getElementById('ast-empty').hidden          = false;
  document.getElementById('ast-output').hidden         = true;
  document.getElementById('stats-empty').hidden        = false;
  document.getElementById('stats-output').hidden       = true;
  editor.focus();
}

function flashEmpty() {
  const container = document.getElementById('editor-container');
  container.style.boxShadow = '0 0 0 2px var(--warning)';
  setTimeout(() => { container.style.boxShadow = ''; }, 800);
}

// ─────────────────────────────────────────────────────────────
// Resize handle (drag to split)
// ─────────────────────────────────────────────────────────────

function initResizeHandle() {
  const handle   = document.getElementById('resize-handle');
  const paneL    = document.querySelector('.pane-editor');
  const layout   = document.querySelector('.main-layout');
  let dragging   = false;

  handle.addEventListener('mousedown', e => {
    dragging = true;
    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    const rect = layout.getBoundingClientRect();
    const pct  = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0.2), 0.8);
    paneL.style.flex = `0 0 ${pct * 100}%`;
    if (editor) editor.layout();
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.cursor   = '';
    document.body.style.userSelect = '';
  });

  // Keyboard accessibility
  handle.addEventListener('keydown', e => {
    const pct = parseFloat(paneL.style.flex || '50') || 50;
    if (e.key === 'ArrowLeft')  paneL.style.flex = `0 0 ${Math.max(pct - 2, 20)}%`;
    if (e.key === 'ArrowRight') paneL.style.flex = `0 0 ${Math.min(pct + 2, 80)}%`;
    if (editor) editor.layout();
  });
}

// ─────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─────────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────────

boot().catch(err => {
  setStatus('error', 'Başlatma hatası');
  console.error('[boot]', err);
});
