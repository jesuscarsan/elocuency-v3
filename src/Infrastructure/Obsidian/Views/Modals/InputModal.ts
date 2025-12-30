import { App, Modal, Setting } from 'obsidian';

export class InputModal extends Modal {
    private result!: string;
    private onSubmit: (result: string) => void;

    constructor(
        app: App,
        private readonly config: { title: string; label: string; placeholder?: string; submitText?: string },
        onSubmit: (result: string) => void
    ) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl('h2', { text: this.config.title });

        new Setting(contentEl)
            .setName(this.config.label)
            .addText((text) => {
                if (this.config.placeholder) text.setPlaceholder(this.config.placeholder);
                text.onChange((value) => {
                    this.result = value;
                });
            });

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText(this.config.submitText || 'Submit')
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
