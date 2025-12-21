import { ButtonComponent } from 'obsidian';

export class SessionControlsComponent {
    private sessionBtn: ButtonComponent | null = null;
    private statusEl: HTMLElement | null = null;

    private pttBtn: ButtonComponent | null = null;

    constructor(private container: HTMLElement,
        private onStartStop: () => void,
        private onMicDown?: () => void,
        private onMicUp?: () => void,
    ) {
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

    updateStatus(isActive: boolean, text: string = '', color: string = '', usePTT: boolean = false) {
        if (this.statusEl) {
            this.statusEl.textContent = text || (isActive ? (usePTT ? '🔴 Live - Push to Talk Mode' : '🔴 Live - Listening') : 'Ready to connect');
            this.statusEl.style.color = color || (isActive ? 'var(--color-red)' : 'var(--text-muted)');
        }

        const controlsDiv = this.container.querySelector('.gemini-live-controls') as HTMLElement;
        if (isActive && usePTT) {
            // Show PTT UI
            if (this.sessionBtn) {
                this.sessionBtn.setButtonText('Stop Session');
                this.sessionBtn.removeCta(); // Make it secondary
                this.sessionBtn.buttonEl.style.fontSize = '12px';
                this.sessionBtn.buttonEl.style.padding = '4px 10px';
            }

            // Create PTT Btn if not exists
            if (!this.pttBtn && controlsDiv) {
                const pttContainer = controlsDiv.createDiv({ cls: 'gemini-ptt-container' });
                pttContainer.style.marginTop = '15px';
                pttContainer.style.display = 'flex';
                pttContainer.style.justifyContent = 'center';

                this.pttBtn = new ButtonComponent(pttContainer)
                    .setButtonText('MANTENER PARA HABLAR')
                    .setCta();

                const btnEl = this.pttBtn.buttonEl;
                btnEl.style.width = '100%';
                btnEl.style.height = '60px';
                btnEl.style.fontSize = '16px';
                btnEl.style.fontWeight = 'bold';
                btnEl.style.backgroundColor = 'var(--interactive-accent)';

                // Bind events
                btnEl.addEventListener('mousedown', (e) => { e.preventDefault(); this.onMicDown?.(); btnEl.style.backgroundColor = 'var(--text-accent)'; });
                btnEl.addEventListener('mouseup', (e) => { e.preventDefault(); this.onMicUp?.(); btnEl.style.backgroundColor = 'var(--interactive-accent)'; });
                btnEl.addEventListener('mouseleave', (e) => {
                    // If mouse leaves while pressed, treat as up
                    if (e.buttons === 1) {
                        this.onMicUp?.();
                        btnEl.style.backgroundColor = 'var(--interactive-accent)';
                    }
                });
                // Touch support
                btnEl.addEventListener('touchstart', (e) => { e.preventDefault(); this.onMicDown?.(); btnEl.style.backgroundColor = 'var(--text-accent)'; });
                btnEl.addEventListener('touchend', (e) => { e.preventDefault(); this.onMicUp?.(); btnEl.style.backgroundColor = 'var(--interactive-accent)'; });
            } else if (this.pttBtn) {
                // Ensure visibility
                this.pttBtn.buttonEl.parentElement!.style.display = 'flex';
            }

        } else {
            // Normal Mode or Inactive
            if (this.pttBtn) {
                this.pttBtn.buttonEl.parentElement!.style.display = 'none';
            }

            if (this.sessionBtn) {
                if (isActive) {
                    this.sessionBtn.setButtonText('Stop Session');
                    this.sessionBtn.removeCta();
                    this.sessionBtn.setWarning();
                    this.sessionBtn.buttonEl.style.fontSize = '';
                    this.sessionBtn.buttonEl.style.padding = '';
                } else {
                    this.sessionBtn.setButtonText('Start Session');
                    this.sessionBtn.buttonEl.removeClass('mod-warning');
                    this.sessionBtn.setCta();
                    this.sessionBtn.buttonEl.style.fontSize = '';
                    this.sessionBtn.buttonEl.style.padding = '';
                }
            }
        }
    }
}
