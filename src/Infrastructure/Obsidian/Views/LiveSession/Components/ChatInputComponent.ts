
import { ButtonComponent, TextComponent } from "obsidian";

export class ChatInputComponent {
    private container: HTMLElement;
    private onSend: (text: string) => void;
    private inputEl: TextComponent | null = null;

    constructor(container: HTMLElement, onSend: (text: string) => void) {
        this.container = container;
        this.onSend = onSend;
    }

    render(isEnabled: boolean) {
        this.container.empty();
        const wrapper = this.container.createDiv();
        wrapper.style.display = 'flex';
        wrapper.style.gap = '10px';
        wrapper.style.marginTop = '10px';
        wrapper.style.marginBottom = '10px';
        wrapper.style.alignItems = 'center';

        this.inputEl = new TextComponent(wrapper);
        this.inputEl.setPlaceholder('Escribe tu respuesta...');
        this.inputEl.inputEl.style.flex = '1';
        this.inputEl.setDisabled(!isEnabled);

        this.inputEl.inputEl.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });

        const sendBtn = new ButtonComponent(wrapper);
        sendBtn.setIcon('send');
        sendBtn.setTooltip('Enviar');
        sendBtn.setDisabled(!isEnabled);
        sendBtn.onClick(() => {
            this.sendMessage();
        });
    }

    private sendMessage() {
        if (!this.inputEl) return;
        const text = this.inputEl.getValue().trim();
        if (text) {
            this.onSend(text);
            this.inputEl.setValue('');
        }
    }

    focus() {
        this.inputEl?.inputEl?.focus();
    }
}
