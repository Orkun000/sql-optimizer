/**
 * AppState Model
 * Holds the global application state and notifies observers upon changes.
 */
export class AppState {
    constructor() {
        this.state = {
            currentLang: 'tr',
            wasmReady: false,
            monacoReady: false,
            lastResult: null,
            astViewMode: 'json', // 'json' | 'graph'
        };
        this.listeners = [];
    }

    subscribe(callback) {
        this.listeners.push(callback);
        // Return an unsubscribe function
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }

    notify() {
        this.listeners.forEach(callback => callback(this.state));
    }

    get(key) {
        return this.state[key];
    }

    set(key, value) {
        if (this.state[key] !== value) {
            this.state[key] = value;
            this.notify();
        }
    }

    updateMultiple(updates) {
        let changed = false;
        for (const [key, value] of Object.entries(updates)) {
            if (this.state[key] !== value) {
                this.state[key] = value;
                changed = true;
            }
        }
        if (changed) {
            this.notify();
        }
    }
}
