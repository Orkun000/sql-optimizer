import { MainViewModel } from './viewmodels/MainViewModel.js';
import { EditorView } from './views/EditorView.js';
import { UILangManager } from './views/UILangManager.js';
import { renderLint, renderFormat, renderAST, renderStats } from './views/Renderers.js';

// ─── Globals ────────────────────────────────────────────────────────────────
const viewModel = new MainViewModel();
let editorView = null;

// ─── Bootstrap ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    initParticles();

    // Restore language preference
    const savedLang = localStorage.getItem('lang') || 'tr';
    const langSelect = document.getElementById('lang-select');
    if (langSelect) langSelect.value = savedLang;

    // Init Wasm (non-blocking status shown immediately)
    setStatus('loading');
    await viewModel.init();          // sets wasmReady + currentLang internally
    setStatus(viewModel.state.get('wasmReady') ? 'ready' : 'error');

    // Init Monaco Editor
    editorView = new EditorView('editor-container', '');
    editorView.onAnalyzeRequested = () => runAnalysis();
    editorView.onModelChanged = updateTokenStats;
    await editorView.init();
    viewModel.setEditorView(editorView);

    // Load initial sample into editor
    viewModel.loadSample('select_star');
    updateTokenStats();

    // Apply saved language to all UI labels
    UILangManager.setLanguage(savedLang);

    // Enable the analyse button now that both Wasm + editor are ready
    const analyzeBtn = document.getElementById('analyze-btn');
    if (analyzeBtn) analyzeBtn.disabled = false;

    // Wire all UI events
    bindEvents();

    // Subscribe: re-render whenever state changes
    viewModel.state.subscribe(onStateChange);
});

// ─── State → View ───────────────────────────────────────────────────────────
function onStateChange(state) {
    // Update Wasm status indicator
    setStatus(state.wasmReady ? 'ready' : 'loading');

    // If language changed, refresh all static labels
    UILangManager.setLanguage(state.currentLang);

    // Render analysis results when available
    const result = state.lastResult;
    if (!result) return;

    if (!result.success) {
        showErrorOverlay(true, result.error || (state.currentLang === 'en' ? 'Unknown error' : 'Bilinmeyen hata'));
        return;
    }

    showErrorOverlay(false);
    renderLint(result.lint_issues, state.currentLang);
    renderFormat(result.formatted_sql, state.currentLang);
    renderAST(result.ast_json, state.astViewMode);
    renderStats(result.stats, result.lint_issues, state.currentLang);
}

// ─── Event Binding ──────────────────────────────────────────────────────────
function bindEvents() {
    // Analyse button
    document.getElementById('analyze-btn')
        ?.addEventListener('click', runAnalysis);

    // Clear button
    document.getElementById('clear-btn')
        ?.addEventListener('click', () => {
            viewModel.clearEditor();
            clearResultPanels();
            showErrorOverlay(false);
        });

    // Sample selector
    const sampleSel = document.getElementById('sample-select');
    sampleSel?.addEventListener('change', () => {
        viewModel.loadSample(sampleSel.value);
        sampleSel.value = '';
    });

    // Language selector
    document.getElementById('lang-select')
        ?.addEventListener('change', e => {
            viewModel.setLanguage(e.target.value);
        });

    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Copy formatted SQL
    document.getElementById('copy-formatted')
        ?.addEventListener('click', copyFormatted);

    // AST expand/collapse all
    document.getElementById('expand-all-ast')
        ?.addEventListener('click', () => toggleAllAST(true));
    document.getElementById('collapse-all-ast')
        ?.addEventListener('click', () => toggleAllAST(false));

    // AST JSON ↔ Graph toggle
    const btnJsonView = document.getElementById('ast-view-json');
    const btnGraphView = document.getElementById('ast-view-graph');
    const treeContainer = document.getElementById('ast-tree');
    const graphContainer = document.getElementById('ast-graph-container');
    const expandBtn = document.getElementById('expand-all-ast');
    const collapseBtn = document.getElementById('collapse-all-ast');

    if (btnJsonView && btnGraphView) {
        btnJsonView.addEventListener('click', () => {
            btnJsonView.classList.add('active');
            btnGraphView.classList.remove('active');
            treeContainer.style.display = 'block';
            graphContainer.style.display = 'none';
            expandBtn.style.display = 'inline-block';
            collapseBtn.style.display = 'inline-block';
            viewModel.state.set('astViewMode', 'json');
        });

        btnGraphView.addEventListener('click', () => {
            btnGraphView.classList.add('active');
            btnJsonView.classList.remove('active');
            treeContainer.style.display = 'none';
            graphContainer.style.display = 'block';
            expandBtn.style.display = 'none';
            collapseBtn.style.display = 'none';
            viewModel.state.set('astViewMode', 'graph');
            // Re-render graph with latest result
            const lastResult = viewModel.state.get('lastResult');
            if (lastResult?.ast_json) {
                renderAST(lastResult.ast_json, 'graph');
            }
        });
    }

    // Collapsible schema section
    const toggleSchemaBtn = document.getElementById('toggle-schema-btn');
    const schemaContainer = document.getElementById('schema-container');
    if (toggleSchemaBtn && schemaContainer) {
        toggleSchemaBtn.addEventListener('click', () => {
            const isVisible = schemaContainer.classList.toggle('active');
            toggleSchemaBtn.setAttribute('aria-expanded', isVisible);
            toggleSchemaBtn.classList.toggle('active', isVisible);
            if (editorView) setTimeout(() => editorView.editor?.layout(), 50);
        });
    }

    // Resize handle (drag to split panes)
    initResizeHandle();

    // About modal
    const aboutBtn = document.getElementById('about-btn');
    const aboutModal = document.getElementById('about-modal');
    const closeAboutBtn = document.getElementById('close-about-btn');

    if (aboutBtn && aboutModal && closeAboutBtn) {
        aboutBtn.addEventListener('click', () => aboutModal.showModal());
        closeAboutBtn.addEventListener('click', () => aboutModal.close());
        aboutModal.addEventListener('click', (e) => {
            if (e.target === aboutModal) aboutModal.close();
        });
    }
}

// ─── Analysis ───────────────────────────────────────────────────────────────
function runAnalysis() {
    if (!viewModel.state.get('wasmReady')) return;

    const sql = editorView?.getValue().trim();
    if (!sql) {
        flashEmpty();
        return;
    }

    const dialect = document.getElementById('dialect-select')?.value ?? 'generic';
    const schema = document.getElementById('schema-input')?.value.trim() ?? '';
    viewModel.runAnalysis(dialect, schema);
    switchTab('lint');
}

// ─── Helpers ────────────────────────────────────────────────────────────────
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

function copyFormatted() {
    const text = document.getElementById('format-code')?.innerText ?? '';
    const lang = viewModel.state.get('currentLang');
    navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('copy-formatted');
        if (!btn) return;
        const prev = btn.textContent;
        btn.textContent = lang === 'en' ? '✅ Copied' : '✅ Kopyalandı';
        setTimeout(() => { btn.textContent = prev; }, 2000);
    });
}

function toggleAllAST(open) {
    document.querySelectorAll('#ast-tree details').forEach(d => { d.open = open; });
}

function updateTokenStats() {
    if (!editorView?.editor) return;
    const model = editorView.editor.getModel();
    if (!model) return;
    document.getElementById('line-count').textContent = model.getLineCount();
    document.getElementById('char-count').textContent = model.getValue().length;
}

function clearResultPanels() {
    document.getElementById('lint-results').innerHTML = '';
    document.getElementById('lint-badge').textContent = '0';
    document.getElementById('lint-badge').className = 'tab-badge';
    document.getElementById('lint-empty').hidden = false;
    document.getElementById('format-empty').hidden = false;
    document.getElementById('format-output').hidden = true;
    document.getElementById('ast-empty').hidden = false;
    document.getElementById('ast-output').hidden = true;
    document.getElementById('stats-empty').hidden = false;
    document.getElementById('stats-output').hidden = true;
}

function setStatus(state) {
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    const lang = viewModel.state.get('currentLang');

    const statusMap = {
        ready: { cls: 'ready', tr: 'Hazır', en: 'Ready' },
        loading: { cls: 'loading', tr: 'Yükleniyor…', en: 'Loading…' },
        error: { cls: 'error', tr: 'Hata', en: 'Error' },
    };
    const s = statusMap[state] || statusMap.loading;

    if (dot) dot.className = `status-dot ${s.cls}`;
    if (text) text.textContent = lang === 'en' ? s.en : s.tr;
}

function showErrorOverlay(show, message = '') {
    const overlay = document.getElementById('error-overlay');
    if (!overlay) return;
    overlay.hidden = !show;
    if (show) {
        const msgEl = document.getElementById('error-message');
        if (msgEl) msgEl.textContent = message;
    }
}

function flashEmpty() {
    const container = document.getElementById('editor-container');
    if (!container) return;
    container.style.boxShadow = '0 0 0 2px var(--warning)';
    setTimeout(() => { container.style.boxShadow = ''; }, 800);
}

function initResizeHandle() {
    const handle = document.getElementById('resize-handle');
    const paneL = document.querySelector('.pane-editor');
    const layout = document.querySelector('.main-layout');
    if (!handle || !paneL || !layout) return;

    let dragging = false;

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
        const pct = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0.2), 0.8);
        paneL.style.flex = `0 0 ${pct * 100}%`;
        editorView?.editor?.layout();
    });

    window.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging = false;
        handle.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    });

    handle.addEventListener('keydown', e => {
        const raw = paneL.style.flex || '0 0 50%';
        const pct = parseFloat(raw.replace('0 0 ', '')) || 50;
        if (e.key === 'ArrowLeft') paneL.style.flex = `0 0 ${Math.max(pct - 2, 20)}%`;
        if (e.key === 'ArrowRight') paneL.style.flex = `0 0 ${Math.min(pct + 2, 80)}%`;
        editorView?.editor?.layout();
    });
}

// ─── Particle Background ─────────────────────────────────────────────────────
function initParticles() {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let particles = [];

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    class Particle {
        constructor() { this.reset(true); }
        reset(randomY = false) {
            this.x = Math.random() * canvas.width;
            this.y = randomY ? Math.random() * canvas.height : canvas.height + 10;
            this.r = Math.random() * 1.5 + 0.4;
            this.vx = (Math.random() - 0.5) * 0.25;
            this.vy = -(Math.random() * 0.4 + 0.1);
            this.alpha = Math.random() * 0.35 + 0.05;
            this.hue = Math.random() > 0.6 ? 245 : 270;
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
}
