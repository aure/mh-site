/**
 * Input module - Keyboard and mouse/touch input handling
 */

export class InputManager {
    constructor() {
        this.onTap = null; // Callback when a tap is detected

        this.keyboardEnabled = true;
        this.mouseEnabled = true;

        // Key state to prevent repeat triggers
        this.keysDown = new Set();

        this.setupKeyboard();
        this.setupMouse();
    }

    setupKeyboard() {
        document.addEventListener('keydown', (e) => {
            if (!this.keyboardEnabled) return;

            // Prevent repeats
            if (this.keysDown.has(e.code)) return;

            if (e.code === 'Space' || e.code === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.keysDown.add(e.code);
                this.triggerTap('keyboard');
            }
        });

        document.addEventListener('keyup', (e) => {
            this.keysDown.delete(e.code);
        });
    }

    setupMouse() {
        const vizContainer = document.getElementById('visualization-container');
        if (!vizContainer) return;

        // Mouse click
        vizContainer.addEventListener('mousedown', (e) => {
            if (!this.mouseEnabled) return;
            e.preventDefault();
            this.triggerTap('mouse');
        });

        // Touch
        vizContainer.addEventListener('touchstart', (e) => {
            if (!this.mouseEnabled) return;
            e.preventDefault();
            this.triggerTap('touch');
        });
    }

    triggerTap(source) {
        if (this.onTap) {
            this.onTap(performance.now() / 1000, source);
        }
    }

    setKeyboardEnabled(enabled) {
        this.keyboardEnabled = enabled;
    }

    setMouseEnabled(enabled) {
        this.mouseEnabled = enabled;
    }
}
