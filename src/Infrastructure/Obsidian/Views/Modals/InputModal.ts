import { App, Modal, Setting } from 'obsidian';

export class InputModal extends Modal {
    private result!: string;
    private onSubmit: (result: string) => void;

    constructor(app: App, onSubmit: (result: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl('h2', { text: 'Enter Spotify Authorization Code' });

        new Setting(contentEl)
            .setName('Code')
            .setDesc('Paste the code from the URL here')
            .addText((text) =>
                text.onChange((value) => {
                    this.result = value;
                }));

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText('Submit')
                    .setCta()
                    .onClick(() => {
                        this.close();
                        this.onSubmit(this.result);
                    }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
