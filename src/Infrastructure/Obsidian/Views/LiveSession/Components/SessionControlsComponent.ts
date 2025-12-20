import { ButtonComponent } from 'obsidian';

export class SessionControlsComponent {
    private sessionBtn: ButtonComponent | null = null;
    private statusEl: HTMLElement | null = null;

    constructor(private container: HTMLElement,
        private onStartStop: () => void) {
        this.render();
    }

    private render() {
        // Status
        this.statusEl = this.container.createEl('div', {
            text: 'Ready to connect',
            cls: 'gemini-live-status'
        });
        this.statusEl.style.marginBottom = '20px';
        this.statusEl.style.color = 'var(--text-muted)';

        // Controls
        const controls = this.container.createEl('div', { cls: 'gemini-live-controls' });

        this.sessionBtn = new ButtonComponent(controls)
            .setButtonText('Start Session')
            .setCta()
            .onClick(() => this.onStartStop());
    }

    updateStatus(isActive: boolean, text: string = '', color: string = '') {
        if (this.statusEl) {
            this.statusEl.textContent = text || (isActive ? '🔴 Live - Listening' : 'Ready to connect');
            this.statusEl.style.color = color || (isActive ? 'var(--color-red)' : 'var(--text-muted)');
        }

        if (this.sessionBtn) {
            if (isActive) {
                this.sessionBtn.setButtonText('Stop Session');
                this.sessionBtn.removeCta();
                this.sessionBtn.setWarning();
            } else {
                this.sessionBtn.setButtonText('Start Session');
                this.sessionBtn.buttonEl.removeClass('mod-warning');
                this.sessionBtn.setCta();
            }
        }
    }
}
