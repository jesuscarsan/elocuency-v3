import { ButtonComponent } from 'obsidian';

export class SessionControlsComponent {
    private sessionBtn: ButtonComponent | null = null;
    private pttBtn: ButtonComponent | null = null;

    constructor(
        private sessionBtnContainer: HTMLElement,
        private pttContainer: HTMLElement,
        private onStartStop: () => void,
        private onMicDown?: () => void,
        private onMicUp?: () => void,
    ) {
        this.render();
    }

    private render() {
        // Render Session Button in the header container
        // Clear previous if any (though usually empty)
        // this.sessionBtnContainer.empty(); // Careful if we share container? No, dedicated.

        this.sessionBtn = new ButtonComponent(this.sessionBtnContainer)
            .setButtonText('Preguntar')
            .setCta()
            .onClick(() => this.onStartStop());
    }

    updateStatus(isActive: boolean, text: string = '', color: string = '', usePTT: boolean = false) {
        // Status element removed as per user request ("sobra")

        if (isActive && usePTT) {
            // Show PTT UI
            if (this.sessionBtn) {
                this.sessionBtn.setButtonText('Stop Session');
                this.sessionBtn.removeCta(); // Make it secondary
                this.sessionBtn.buttonEl.style.fontSize = '12px';
                this.sessionBtn.buttonEl.style.padding = '4px 10px';
            }

            // Create PTT Btn if not exists
            if (!this.pttBtn) {
                const pttWrapper = this.pttContainer.createDiv({ cls: 'gemini-ptt-container' });
                pttWrapper.style.marginTop = '15px';
                pttWrapper.style.display = 'flex';
                pttWrapper.style.justifyContent = 'center';

                this.pttBtn = new ButtonComponent(pttWrapper)
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
                    this.sessionBtn.setButtonText('Preguntar');
                    this.sessionBtn.buttonEl.removeClass('mod-warning');
                    this.sessionBtn.setCta();
                    this.sessionBtn.buttonEl.style.fontSize = '';
                    this.sessionBtn.buttonEl.style.padding = '';
                }
            }
        }
    }
}
