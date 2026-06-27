import init, { parse_and_analyze } from '../../pkg/sql_optimizer.js';

/**
 * WasmService
 * Encapsulates the loading and interaction with the Rust WebAssembly module.
 */
export class WasmService {
    constructor() {
        this.sqlAnalyze = null;
    }

    async init() {
        try {
            await init();
            this.sqlAnalyze = parse_and_analyze;
            return true;
        } catch (e) {
            console.error('[WasmService] init failed:', e);
            throw e;
        }
    }

    isReady() {
        return this.sqlAnalyze !== null;
    }

    analyze(sql, dialect, schema) {
        if (!this.isReady()) {
            throw new Error("Wasm module is not ready.");
        }
        
        try {
            const resultJson = this.sqlAnalyze(sql, dialect, schema);
            return JSON.parse(resultJson);
        } catch (e) {
            console.error('[WasmService] analysis failed:', e);
            throw e;
        }
    }
}
