import { AppState } from '../models/AppState.js';
import { WasmService } from '../services/WasmService.js';
import { SAMPLES_TR, SAMPLES_EN } from '../../i18n.js';

/**
 * MainViewModel
 * Coordinates between the Views and the Model/Services.
 */
export class MainViewModel {
    constructor() {
        this.state = new AppState();
        this.wasmService = new WasmService();
        this.editorView = null; // Injected later
    }

    async init() {
        // Initialize Wasm
        try {
            await this.wasmService.init();
            this.state.set('wasmReady', true);
        } catch (e) {
            this.state.set('wasmReady', false);
        }

        // Setup lang listener from local storage
        const savedLang = localStorage.getItem('lang') || 'tr';
        this.setLanguage(savedLang);
    }

    setEditorView(editorView) {
        this.editorView = editorView;
        this.state.set('monacoReady', true);
    }

    setLanguage(lang) {
        localStorage.setItem('lang', lang);
        
        // Handle sample swapping in editor
        if (this.editorView && this.editorView.editor) {
            const currentVal = this.editorView.getValue();
            const samplesTr = Object.values(SAMPLES_TR);
            const samplesEn = Object.values(SAMPLES_EN);
            
            let swapped = false;
            for (const [key, trVal] of Object.entries(SAMPLES_TR)) {
                if (currentVal === trVal && lang === 'en') {
                    this.editorView.setValue(SAMPLES_EN[key]);
                    swapped = true;
                    break;
                }
            }
            if (!swapped) {
                for (const [key, enVal] of Object.entries(SAMPLES_EN)) {
                    if (currentVal === enVal && lang === 'tr') {
                        this.editorView.setValue(SAMPLES_TR[key]);
                        break;
                    }
                }
            }
        }
        
        this.state.set('currentLang', lang);

        // Re-render if there's a last result
        const lastResult = this.state.get('lastResult');
        if (lastResult) {
            // Re-trigger render by resetting the result
            this.state.set('lastResult', { ...lastResult });
        } else if (this.editorView && this.editorView.getValue().trim()) {
            this.runAnalysis();
        }
    }

    runAnalysis(dialect, schema) {
        if (!this.state.get('wasmReady')) return;
        
        const sql = this.editorView ? this.editorView.getValue().trim() : '';
        if (!sql) {
            return;
        }

        try {
            const result = this.wasmService.analyze(sql, dialect, schema);
            this.state.set('lastResult', result);
        } catch (e) {
            this.state.set('lastResult', { success: false, error: e.message });
        }
    }

    loadSample(sampleKey) {
        const lang = this.state.get('currentLang');
        const samples = lang === 'en' ? SAMPLES_EN : SAMPLES_TR;
        if (sampleKey && samples[sampleKey]) {
            this.editorView.setValue(samples[sampleKey]);
            this.editorView.focus();
        }
    }

    clearEditor() {
        if (this.editorView) {
            this.editorView.setValue('');
            this.editorView.focus();
        }
    }
}
