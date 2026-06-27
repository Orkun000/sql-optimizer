/**
 * EditorView — wraps the Monaco SQL editor instance.
 */

export class EditorView {
    constructor(containerId, initialValue) {
        this.containerId      = containerId;
        this.initialValue     = initialValue;
        this.editor           = null;
        this.onAnalyzeRequested = null; // Ctrl+Enter callback
        this.onModelChanged     = null; // keystroke callback (token stats)
    }

    async init() {
        return new Promise((resolve) => {
            require.config({
                paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' },
            });

            require(['vs/editor/editor.main'], () => {
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

                this.editor = monaco.editor.create(
                    document.getElementById(this.containerId),
                    {
                        value: this.initialValue,
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

                // Ctrl+Enter → Analyse
                this.editor.addCommand(
                    monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
                    () => {
                        if (this.onAnalyzeRequested) {
                            this.onAnalyzeRequested();
                        }
                    }
                );

                // Live token stats
                this.editor.onDidChangeModelContent(() => {
                    if (this.onModelChanged) this.onModelChanged();
                });

                resolve();
            });
        });
    }

    getValue() {
        return this.editor ? this.editor.getValue() : '';
    }

    setValue(val) {
        if (this.editor) {
            this.editor.setValue(val);
        }
    }

    focus() {
        if (this.editor) {
            this.editor.focus();
        }
    }
}
