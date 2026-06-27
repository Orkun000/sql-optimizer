import { UI_TRANSLATIONS, SAMPLE_LABELS } from '../../i18n.js';

export class UILangManager {
    static setLanguage(lang) {
        const t = (key, replacements = {}) => {
            const translations = UI_TRANSLATIONS[lang];
            let text = translations[key] || UI_TRANSLATIONS['tr'][key] || key;
            for (const [k, v] of Object.entries(replacements)) {
                text = text.replace(`{${k}}`, v);
            }
            return text;
        };

        const updateText = (id, key) => {
            const el = document.getElementById(id);
            if (el) el.textContent = t(key);
        };
        const updateHtml = (id, key) => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = t(key);
        };

        updateText('dialect-label', 'dialect-label');
        updateText('sample-label', 'sample-label');
        updateText('sample-placeholder', 'sample-placeholder');
        
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

        updateText('analyze-btn-text', 'analyze-btn');
        updateText('clear-btn-text', 'clear-btn');
        updateText('line-count-label', 'line-count-label');
        updateText('char-count-label', 'char-count-label');
        updateText('local-badge-text', 'local-badge-text');

        // Left pane
        const editorTitle = document.getElementById('pane-title-editor');
        if (editorTitle) editorTitle.textContent = lang === 'en' ? 'SQL Editor' : 'SQL Editörü';
        
        updateText('toggle-schema-btn-text', 'schema-btn');
        updateText('schema-title', 'schema-title');
        updateText('schema-subtitle', 'schema-subtitle');
        
        const schemaInput = document.getElementById('schema-input');
        if (schemaInput) {
            schemaInput.placeholder = t('schema-placeholder');
        }

        // Tabs
        updateText('tab-lint-text', 'tab-lint');
        updateText('tab-format-text', 'tab-format');
        updateText('tab-ast-text', 'tab-ast');
        updateText('tab-stats-text', 'tab-stats');

        // AST view togglers
        updateText('ast-json-btn-text', 'ast-json-btn');
        updateText('ast-graph-btn-text', 'ast-graph-btn');

        // Empty state placeholders
        updateHtml('lint-empty-text', 'lint-empty-text');
        updateText('format-empty-text', 'format-empty-text');
        updateText('ast-empty-text', 'ast-empty-text');
        updateText('stats-empty-text', 'stats-empty-text');

        // Buttons in tabs - ensuring translation handles properly
        updateText('copy-formatted', 'copy-btn');
        updateText('expand-all-ast', 'ast-expand-btn');
        updateText('collapse-all-ast', 'ast-collapse-btn');

        // Stats labels
        updateText('label-stat-statements', 'stat-statements');
        updateText('label-stat-tables', 'stat-tables');
        updateText('label-stat-joins', 'stat-joins');
        updateText('label-stat-subqueries', 'stat-subqueries');
        updateText('label-stat-columns', 'stat-columns');
        
        updateText('label-flag-where', 'flag-where');
        updateText('label-flag-groupby', 'flag-groupby');
        updateText('label-flag-orderby', 'flag-orderby');
        updateText('label-flag-limit', 'flag-limit');
    }
}
