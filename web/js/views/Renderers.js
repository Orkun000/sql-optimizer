import { LINT_TRANSLATIONS } from '../../i18n.js';

// --- Utility ---
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// --- Lint Panel ---
export function renderLint(issues, currentLang) {
  issues = issues || [];
  const container = document.getElementById('lint-results');
  const empty     = document.getElementById('lint-empty');
  const badge     = document.getElementById('lint-badge');

  badge.textContent = issues.length;
  badge.className = 'tab-badge';
  
  if (issues.some(i => i.severity === 'error')) badge.classList.add('has-errors');
  else if (issues.some(i => i.severity === 'warning')) badge.classList.add('has-warnings');

  if (issues.length === 0) {
    empty.hidden  = false;
    empty.innerHTML = `
      <div class="no-issues">
        <div class="no-issues-icon">✅</div>
        <p style="color:var(--success);font-weight:600">${currentLang === 'en' ? 'No Issues Found' : 'Sorun Bulunamadı'}</p>
        <p style="color:var(--text-muted);font-size:12px;margin-top:4px">${currentLang === 'en' ? 'Your SQL query looks perfect!' : 'SQL sorgunuz mükemmel görünüyor!'}</p>
      </div>`;
    container.innerHTML = '';
    return;
  }

  empty.hidden = true;
  container.innerHTML = issues.map(issue => {
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
  }).join('');
}

// --- Format Panel ---
export function renderFormat(formattedSQL, currentLang) {
  const empty  = document.getElementById('format-empty');
  const output = document.getElementById('format-output');
  const code   = document.getElementById('format-code');

  empty.hidden  = true;
  output.hidden = false;
  code.innerHTML = highlightSQL(formattedSQL);
  
  // Fix copy button text
  document.getElementById('copy-formatted').textContent = currentLang === 'en' ? '📋 Copy' : '📋 Kopyala';
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
    const [token, comment, sqString, _1, dqString, _2, number, word, punct, space] = match;

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

// --- AST Panel ---
export function renderAST(astJson, viewMode) {
  const empty  = document.getElementById('ast-empty');
  const output = document.getElementById('ast-output');
  const tree   = document.getElementById('ast-tree');

  if (!astJson) {
    empty.hidden = false; output.hidden = true; return;
  }

  empty.hidden  = true;
  output.hidden = false;
  
  tree.innerHTML = jsonTreeHTML(astJson, 0);

  if (viewMode === 'graph') {
    renderCytoscapeGraph(astJson);
  }
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
      if (Object.keys(value).length === 0) return `<span class="json-bracket">{ }</span>`;
    }
    const open = depth < 4 ? ' open' : '';
    const label = value.type ?? value.kind ?? value.name ?? (keys[0] ? `{${keys.length}}` : '{}');
    const items = Object.keys(value)
      .map(k => `<div class="json-property"><span class="json-key">${escHtml(k)}</span>: ${jsonTreeHTML(value[k], depth + 1)}</div>`)
      .join('');
    return `<details${open}><summary class="json-bracket">${escHtml(String(label))}</summary><div class="json-children">${items}</div></details>`;
  }

  return escHtml(String(value));
}

function renderCytoscapeGraph(astJson) {
  const container = document.getElementById('ast-graph');
  if (!container || typeof cytoscape === 'undefined') return;

  const elements = buildGraphData(astJson);
  container.innerHTML = '';

  setTimeout(() => {
    try {
      const cy = cytoscape({
        container: container,
        elements: elements,
        style: [
          {
            selector: 'node',
            style: {
              'background-color': '#1e1b4b',
              'label': 'data(label)',
              'color': '#cbd5e1',
              'text-valign': 'center',
              'text-halign': 'center',
              'font-size': '10px',
              'font-family': 'JetBrains Mono, Inter, monospace',
              'width': '125px',
              'height': '38px',
              'shape': 'round-rectangle',
              'border-width': 1.5,
              'border-color': '#4f46e5',
              'text-wrap': 'wrap',
              'text-max-width': '115px'
            }
          },
          {
            selector: 'node[type="keyword"]',
            style: {
              'background-color': '#064e3b',
              'border-color': '#10b981',
              'color': '#a7f3d0'
            }
          },
          {
            selector: 'node[type="table"]',
            style: {
              'background-color': '#50072b',
              'border-color': '#ec4899',
              'color': '#fbcfe8',
              'shape': 'ellipse',
              'width': '110px',
              'height': '38px'
            }
          },
          {
            selector: 'node[type="expression"]',
            style: {
              'background-color': '#78350f',
              'border-color': '#f59e0b',
              'color': '#fde68a'
            }
          },
          {
            selector: 'edge',
            style: {
              'width': 1.5,
              'line-color': 'rgba(255, 255, 255, 0.15)',
              'target-arrow-color': 'rgba(255, 255, 255, 0.15)',
              'target-arrow-shape': 'triangle',
              'curve-style': 'bezier',
              'arrow-scale': 0.8
            }
          }
        ],
        layout: {
          name: 'breadthfirst',
          directed: true,
          padding: 15,
          spacingFactor: 1.15
        },
        userZoomingEnabled: true,
        userPanningEnabled: true,
        boxSelectionEnabled: false
      });

      cy.resize();
      cy.fit();
    } catch (err) {
      console.error("Error initializing Cytoscape:", err);
    }
  }, 100);
}

function buildGraphData(ast) {
  const nodes = [];
  const edges = [];
  let idCounter = 0;
  function nextId() { return 'n' + (idCounter++); }

  function traverse(obj, parentId = null, labelOverride = null) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        traverse(item, parentId, labelOverride ? `${labelOverride}[${index}]` : null);
      });
      return;
    }
    if (obj.Query) { traverse(obj.Query, parentId, 'Query'); return; }
    if (obj.Select) { traverse(obj.Select, parentId, 'Select'); return; }

    if (obj.body) {
      const node = addNode('QUERY_BODY', 'keyword');
      addEdge(parentId, node.id);
      traverse(obj.body, node.id);
      if (obj.limit) traverse(obj.limit, parentId, 'LIMIT');
      if (obj.order_by) traverse(obj.order_by, parentId, 'ORDER BY');
      return;
    }

    if (obj.projection) {
      const node = addNode('SELECT List', 'keyword');
      addEdge(parentId, node.id);
      obj.projection.forEach(proj => {
        if (proj.UnnamedExpr) traverse(proj.UnnamedExpr, node.id);
        else if (proj.ExprWithAlias) traverse(proj.ExprWithAlias.expr, node.id, `AS ${proj.ExprWithAlias.alias.value}`);
        else if (proj.Wildcard) addLeafNode('*', 'expression', node.id);
        else traverse(proj, node.id);
      });
    }

    if (obj.from) {
      const node = addNode('FROM (Sources)', 'keyword');
      addEdge(parentId, node.id);
      obj.from.forEach(f => traverse(f, node.id));
    }

    if (obj.relation) {
      traverse(obj.relation, parentId);
      if (obj.joins && obj.joins.length > 0) {
        obj.joins.forEach(j => {
          const node = addNode(`JOIN ${j.join_operator?.type || ''}`, 'keyword');
          addEdge(parentId, node.id);
          traverse(j.relation, node.id);
          if (j.join_operator?.On) traverse(j.join_operator.On, node.id, 'ON');
        });
      }
      return;
    }

    if (obj.Table) {
      const label = obj.Table.name?.map(n => n.value).join('.') + (obj.Table.alias ? ` AS ${obj.Table.alias.name.value}` : '');
      addLeafNode(label, 'table', parentId);
      return;
    }

    let fallbackLabel = '';
    for (const [key, val] of Object.entries(obj)) {
      if (val && typeof val !== 'object') fallbackLabel += `${key}: ${val}\n`;
    }

    if (fallbackLabel.trim()) {
      const node = addNode(fallbackLabel.trim(), 'default');
      addEdge(parentId, node.id);
      for (const [key, val] of Object.entries(obj)) {
        if (val && typeof val === 'object') traverse(val, node.id, key);
      }
    } else {
      for (const [key, val] of Object.entries(obj)) {
        if (val && typeof val === 'object') traverse(val, parentId, key);
      }
    }
  }

  function addNode(label, type) {
    const node = { data: { id: nextId(), label, type } };
    nodes.push(node);
    return node.data;
  }
  function addLeafNode(label, type, parentId) {
    const node = addNode(label, type);
    addEdge(parentId, node.id);
    return node;
  }
  function addEdge(source, target) {
    if (source && target) edges.push({ data: { id: `e_${source}_${target}`, source, target } });
  }

  if (Array.isArray(ast)) {
    ast.forEach((stmt, idx) => {
      const label = Object.keys(stmt)[0] || 'Statement';
      const rootNode = addNode(label, 'keyword');
      traverse(stmt, rootNode.id);
    });
  } else {
    const rootNode = addNode('Root', 'keyword');
    traverse(ast, rootNode.id);
  }

  return [...nodes, ...edges];
}

// --- Stats Panel ---
export function renderStats(stats, issues, currentLang) {
  stats = stats || {};
  issues = issues || [];
  const empty  = document.getElementById('stats-empty');
  const output = document.getElementById('stats-output');
  empty.hidden  = true;
  output.hidden = false;

  // Translate right pane labels requested by the user
  document.getElementById('label-stat-statements').textContent = currentLang === 'en' ? 'Statements' : 'İfade';
  document.getElementById('label-stat-tables').textContent = currentLang === 'en' ? 'Tables' : 'Tablo';
  document.getElementById('label-stat-joins').textContent = currentLang === 'en' ? 'Joins' : 'Bağlantı';
  document.getElementById('label-stat-subqueries').textContent = currentLang === 'en' ? 'Subqueries' : 'Alt Sorgu';
  document.getElementById('label-stat-columns').textContent = currentLang === 'en' ? 'Columns' : 'Sütun';

  document.getElementById('stat-statements').textContent  = stats.statement_count  ?? '—';
  document.getElementById('stat-tables').textContent      = stats.table_count       ?? '—';
  document.getElementById('stat-joins').textContent       = stats.join_count        ?? '—';
  document.getElementById('stat-subqueries').textContent  = stats.subquery_count    ?? '—';
  document.getElementById('stat-columns').textContent     = stats.column_count      ?? '—';

  setFlag('flag-where',   stats.has_where, currentLang);
  setFlag('flag-groupby', stats.has_group_by, currentLang);
  setFlag('flag-orderby', stats.has_order_by, currentLang);
  setFlag('flag-limit',   stats.has_limit, currentLang);

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

function setFlag(id, value, currentLang) {
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

