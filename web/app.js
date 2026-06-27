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
import {
  SAMPLES_TR,
  SAMPLES_EN,
  UI_TRANSLATIONS,
  SAMPLE_LABELS,
  LINT_TRANSLATIONS
} from './i18n.js';

let SAMPLES = SAMPLES_TR;

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
let currentLang  = 'tr';

function t(key, replacements = {}) {
  const translations = UI_TRANSLATIONS[currentLang];
  let text = translations[key] || UI_TRANSLATIONS['tr'][key] || key;
  for (const [k, v] of Object.entries(replacements)) {
    text = text.replace(`{${k}}`, v);
  }
  return text;
}

function setLanguage(lang) {
  currentLang = lang;
  
  // Set samples dict
  SAMPLES = lang === 'en' ? SAMPLES_EN : SAMPLES_TR;

  // Translate static UI elements
  document.getElementById('dialect-label').textContent = t('dialect-label');
  document.getElementById('sample-label').textContent = t('sample-label');
  document.getElementById('sample-placeholder').textContent = t('sample-placeholder');
  
  // Update sample dropdown options labels
  const sampleSel = document.getElementById('sample-select');
  if (sampleSel) {
    Array.from(sampleSel.options).forEach(opt => {
      const val = opt.value;
      if (val && SAMPLE_LABELS[lang] && SAMPLE_LABELS[lang][val]) {
        opt.textContent = SAMPLE_LABELS[lang][val];
      }
    });
  }

  // Wasm status text
  const statusTextEl = document.getElementById('status-text');
  if (statusTextEl) {
    if (wasmReady) {
      statusTextEl.textContent = t('status-ready');
    } else {
      statusTextEl.textContent = t('status-loading');
    }
  }

  // Toolbar buttons & badges
  document.getElementById('analyze-btn-text').textContent = t('analyze-btn');
  document.getElementById('clear-btn-text').textContent = t('clear-btn');
  document.getElementById('line-count-label').textContent = t('line-count-label');
  document.getElementById('char-count-label').textContent = t('char-count-label');
  document.getElementById('local-badge-text').textContent = t('local-badge-text');

  // Left pane
  document.getElementById('pane-title-editor').textContent = currentLang === 'en' ? 'SQL Editor' : 'SQL Editörü';
  document.getElementById('toggle-schema-btn-text').textContent = t('schema-btn');
  document.getElementById('schema-title').textContent = t('schema-title');
  document.getElementById('schema-subtitle').textContent = t('schema-subtitle');
  
  const schemaInput = document.getElementById('schema-input');
  if (schemaInput) {
    schemaInput.placeholder = t('schema-placeholder');
  }

  // Tabs
  document.getElementById('tab-lint-text').textContent = t('tab-lint');
  document.getElementById('tab-format-text').textContent = t('tab-format');
  document.getElementById('tab-ast-text').textContent = t('tab-ast');
  document.getElementById('tab-stats-text').textContent = t('tab-stats');

  // Empty state placeholders
  document.getElementById('lint-empty-text').innerHTML = t('lint-empty-text');
  document.getElementById('format-empty-text').textContent = t('format-empty-text');
  document.getElementById('ast-empty-text').textContent = t('ast-empty-text');
  document.getElementById('stats-empty-text').textContent = t('stats-empty-text');

  // Buttons in tabs
  document.getElementById('copy-formatted').textContent = t('copy-btn');
  document.getElementById('expand-all-ast').textContent = t('ast-expand-btn');
  document.getElementById('collapse-all-ast').textContent = t('ast-collapse-btn');

  // Stats labels
  document.getElementById('label-stat-statements').textContent = t('stat-statements');
  document.getElementById('label-stat-tables').textContent = t('stat-tables');
  document.getElementById('label-stat-joins').textContent = t('stat-joins');
  document.getElementById('label-stat-subqueries').textContent = t('stat-subqueries');
  document.getElementById('label-stat-columns').textContent = t('stat-columns');
  
  document.getElementById('label-flag-where').textContent = t('flag-where');
  document.getElementById('label-flag-groupby').textContent = t('flag-groupby');
  document.getElementById('label-flag-orderby').textContent = t('flag-orderby');
  document.getElementById('label-flag-limit').textContent = t('flag-limit');

  // If editor exists and contains a default query comment from TR/EN, swap it to the selected lang version!
  if (editor) {
    const currentVal = editor.getValue();
    for (const key of Object.keys(SAMPLES_TR)) {
      if (currentVal === SAMPLES_TR[key] && lang === 'en') {
        editor.setValue(SAMPLES_EN[key]);
        break;
      }
      if (currentVal === SAMPLES_EN[key] && lang === 'tr') {
        editor.setValue(SAMPLES_TR[key]);
        break;
      }
    }
  }
}

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
    setStatus('ready', t('status-ready'));
  } catch (e) {
    setStatus('error', t('status-error'));
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

  // Setup language listener
  const langSelect = document.getElementById('lang-select');
  if (langSelect) {
    const savedLang = localStorage.getItem('lang') || 'tr';
    langSelect.value = savedLang;
    setLanguage(savedLang);

    langSelect.addEventListener('change', () => {
      const selectedLang = langSelect.value;
      localStorage.setItem('lang', selectedLang);
      setLanguage(selectedLang);
      
      if (lastResult) {
        renderLint(lastResult.lint_issues);
        renderFormat(lastResult.formatted_sql);
        renderAST(lastResult.ast_json);
        renderStats(lastResult.stats, lastResult.lint_issues);
      } else if (editor && editor.getValue().trim()) {
        runAnalysis();
      }
    });
  } else {
    setLanguage('tr');
  }

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
    showErrorOverlay(true, (currentLang === 'en' ? 'Internal error: ' : 'İç hata: ') + e.message);
    return;
  }

  lastResult = result;

  if (!result.success) {
    showErrorOverlay(true, result.error || (currentLang === 'en' ? 'Unknown error' : 'Bilinmeyen hata'));
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
        <p style="color:var(--success);font-weight:600">${t('no-issues-title')}</p>
        <p style="color:var(--text-muted);font-size:12px;margin-top:4px">${t('no-issues-subtitle')}</p>
      </div>`;
    container.innerHTML = '';
    return;
  }

  empty.hidden    = true;
  container.innerHTML = issues
    .map(issue => {
      let msg = issue.message;
      let sug = issue.suggestion;
      
      if (currentLang === 'en') {
        const trans = LINT_TRANSLATIONS[issue.rule_id];
        if (trans && trans.en) {
          msg = typeof trans.en.message === 'function' ? trans.en.message(issue.message) : trans.en.message;
          sug = typeof trans.en.suggestion === 'function' ? trans.en.suggestion(issue.suggestion) : trans.en.suggestion;
        }
      }

      const sevLabel = {
        error: currentLang === 'en' ? '🔴 Error' : '🔴 Hata',
        warning: currentLang === 'en' ? '🟡 Warning' : '🟡 Uyarı',
        info: currentLang === 'en' ? '🔵 Info' : '🔵 Bilgi'
      }[issue.severity] || issue.severity;

      const catLabel = {
        performance: currentLang === 'en' ? '⚡ Performance' : '⚡ Performans',
        safety: currentLang === 'en' ? '🛡 Safety' : '🛡 Güvenlik',
        style: currentLang === 'en' ? '🎨 Style' : '🎨 Stil'
      }[issue.category] || issue.category;

      return `
      <div class="lint-card sev-${issue.severity}">
        <div class="lint-header">
          <span class="rule-badge">${escHtml(issue.rule_id)}</span>
          <span class="sev-badge ${issue.severity}">${sevLabel}</span>
          <span class="cat-badge">${catLabel}</span>
        </div>
        <p class="lint-message">${escHtml(msg)}</p>
        <div class="lint-suggestion">
          <span class="suggestion-icon">💡</span>
          <span>${escHtml(sug)}</span>
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
    btn.textContent = currentLang === 'en' ? '✅ Copied' : '✅ Kopyalandı';
    setTimeout(() => { btn.textContent = currentLang === 'en' ? '📋 Copy' : '📋 Kopyala'; }, 2000);
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
  
  let summaryText = '';
  if (issues.length === 0) {
    summaryText = currentLang === 'en'
      ? `<span style="color:var(--success)">✅ No lint issues found.</span>`
      : `<span style="color:var(--success)">✅ Hiçbir lint sorunu yok.</span>`;
  } else {
    if (currentLang === 'en') {
      summaryText = `Total of <strong>${issues.length}</strong> lint findings:
        ${errors   ? `<span style="color:var(--error)">  ${errors} error${errors > 1 ? 's' : ''}</span>`   : ''}
        ${warnings ? `<span style="color:var(--warning)"> ${warnings} warning${warnings > 1 ? 's' : ''}</span>` : ''}
        ${infos    ? `<span style="color:var(--info)">   ${infos} info${infos > 1 ? 's' : ''}</span>`    : ''}`;
    } else {
      summaryText = `Toplam <strong>${issues.length}</strong> lint bulgusu:
        ${errors   ? `<span style="color:var(--error)">  ${errors} hata</span>`   : ''}
        ${warnings ? `<span style="color:var(--warning)"> ${warnings} uyarı</span>` : ''}
        ${infos    ? `<span style="color:var(--info)">   ${infos} bilgi</span>`    : ''}`;
    }
  }
  box.innerHTML = summaryText;
}

function setFlag(id, value) {
  const el = document.getElementById(id);
  if (value === undefined || value === null) {
    el.className    = 'flag-val flag-na';
    el.textContent  = '—';
  } else if (value) {
    el.className    = 'flag-val flag-yes';
    el.textContent  = currentLang === 'en' ? 'Yes ✓' : 'Var ✓';
  } else {
    el.className    = 'flag-val flag-no';
    el.textContent  = currentLang === 'en' ? 'No ✗' : 'Yok ✗';
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
  setStatus('error', t('status-boot-error'));
  console.error('[boot]', err);
});
