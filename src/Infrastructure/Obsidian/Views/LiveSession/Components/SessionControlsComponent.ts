import { ButtonComponent } from 'obsidian';

export class SessionControlsComponent {
    private sessionBtn: ButtonComponent | null = null;


    constructor(
        private sessionBtnContainer: HTMLElement,

        private onStartStop: () => void,
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

    updateStatus(isActive: boolean, text: string = '', color: string = '') {
        // Status element removed as per user request ("sobra")

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
