import { ButtonComponent, TextComponent, setIcon, Notice, requestUrl } from "obsidian";
import { AudioRecorder } from "src/Infrastructure/Obsidian/Utils/AudioRecorder";
import { GeminiTranscriptionAdapter } from "src/Infrastructure/Adapters/GeminiTranscriptionAdapter";


export class ChatInputComponent {
    private container: HTMLElement;
    private apiKey: string;
    private onSend: (text: string) => void;
    private inputEl: TextComponent | null = null;
    private micButton: ButtonComponent | null = null;

    // Services
    private audioRecorder: AudioRecorder;
    private transcriptionAdapter: GeminiTranscriptionAdapter;

    constructor(container: HTMLElement, apiKey: string, onSend: (text: string) => void) {
        this.container = container;
        this.apiKey = apiKey;
        this.onSend = onSend;
        this.audioRecorder = new AudioRecorder();
        this.transcriptionAdapter = new GeminiTranscriptionAdapter(apiKey);
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

        // --- Microphone Button ---
        this.micButton = new ButtonComponent(wrapper);
        this.micButton.setIcon('microphone');
        this.micButton.setTooltip('Hablar para escribir');
        this.micButton.setDisabled(!isEnabled);
        this.micButton.onClick(() => {
            this.toggleRecording();
        });

        // --- Send Button ---
        const sendBtn = new ButtonComponent(wrapper);
        sendBtn.setIcon('send');
        sendBtn.setTooltip('Enviar');
        sendBtn.setDisabled(!isEnabled);
        sendBtn.onClick(() => {
            this.sendMessage();
        });
    }

    private async toggleRecording() {
        if (this.audioRecorder.isRecording()) {
            await this.stopRecording();
        } else {
            await this.startRecording();
        }
    }

    private async startRecording() {
        if (!this.apiKey) {
            new Notice('API Key missing. Cannot transcribe.');
            return;
        }

        const success = await this.audioRecorder.start();
        if (success) {
            this.updateMicButtonState();
            new Notice('Recording started...');
        }
    }

    private async stopRecording() {
        if (!this.audioRecorder.isRecording()) return;

        const blob = await this.audioRecorder.stop();
        this.updateMicButtonState();

        if (blob) {
            new Notice('Transcribing...');
            try {
                const text = await this.transcriptionAdapter.transcribe(blob);
                if (text) {
                    const current = this.inputEl?.getValue() || '';
                    const separator = current && !current.endsWith(' ') ? ' ' : '';
                    this.inputEl?.setValue(current + separator + text);
                    new Notice('Transcription added.');
                    this.sendMessage();
                }
            } catch (error) {
                new Notice('Transcription failed. Check console for details.');
                console.error(error);
            }
        }
    }

    private updateMicButtonState() {
        if (!this.micButton) return;

        if (this.audioRecorder.isRecording()) {
            this.micButton.buttonEl.addClass('is-recording');
            this.micButton.setIcon('mic-off');
            this.micButton.buttonEl.style.color = 'var(--text-error)';
        } else {
            this.micButton.buttonEl.removeClass('is-recording');
            this.micButton.setIcon('microphone');
            this.micButton.buttonEl.style.color = '';
        }
    }

    private sendMessage() {
        if (!this.inputEl) return;

        // Stop recording if active when sending
        if (this.audioRecorder.isRecording()) {
            this.stopRecording();
        }

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

