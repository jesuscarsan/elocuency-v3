import { App, MarkdownRenderer, Component } from 'obsidian';

export class TranscriptComponent {
    private transcriptContainer: HTMLElement;
    private fullTranscript: string = '';
    private app: App;
    private component: Component;

    private currentAiMessageEl: HTMLElement | null = null;
    private currentAiMessageText: string = '';

    constructor(container: HTMLElement, app: App, component: Component) {
        this.app = app;
        this.component = component;
        this.transcriptContainer = container.createDiv({ cls: 'gemini-live-transcript' });
        this.transcriptContainer.style.height = '300px';
        this.transcriptContainer.style.overflowY = 'auto';
        this.transcriptContainer.style.border = '1px solid var(--background-modifier-border)';
        this.transcriptContainer.style.padding = '10px';
        this.transcriptContainer.style.marginBottom = '20px';
        this.transcriptContainer.style.borderRadius = '4px';
        this.transcriptContainer.style.backgroundColor = 'var(--background-primary)';

        this.renderPlaceholder();
    }

    private renderPlaceholder() {
        const placeholder = this.transcriptContainer.createEl('span', { text: 'Transcription will appear here...', cls: 'transcript-placeholder' });
        placeholder.style.color = 'var(--text-muted)';
        placeholder.style.fontStyle = 'italic';
    }

    clear() {
        this.transcriptContainer.empty();
        this.fullTranscript = '';
        this.currentAiMessageEl = null;
        this.currentAiMessageText = '';
        this.renderPlaceholder();
    }

    startSession() {
        // Remove placeholder
        const placeholder = this.transcriptContainer.querySelector('.transcript-placeholder');
        if (placeholder) placeholder.remove();
    }

    async appendAiText(text: string) {
        // If we don't have an active AI message bubble, create one
        if (!this.currentAiMessageEl) {
            this.currentAiMessageEl = this.transcriptContainer.createDiv({ cls: 'gemini-ai-message' });
            this.currentAiMessageEl.style.marginBottom = '10px';
            this.currentAiMessageText = '';
        }

        this.currentAiMessageText += text;
        this.fullTranscript += text;

        // Re-render the markdown content
        this.currentAiMessageEl.empty();
        await MarkdownRenderer.render(
            this.app,
            this.currentAiMessageText,
            this.currentAiMessageEl,
            '',
            this.component
        );

        this.autoScroll();
    }

    finalizeMessage() {
        this.currentAiMessageEl = null;
        this.currentAiMessageText = '';
    }

    appendUserText(text: string) {
        this.finalizeMessage(); // Close any open AI message

        const userEl = this.transcriptContainer.createDiv({
            text: `👤 ${text}`,
            cls: 'gemini-user-transcript'
        });
        userEl.style.color = 'var(--text-accent)';
        userEl.style.fontStyle = 'italic';
        userEl.style.marginTop = '10px';
        userEl.style.marginBottom = '10px';
        userEl.style.textAlign = 'right';

        this.autoScroll();
        this.fullTranscript += `\n[User]: ${text}\n`;
    }

    appendScore(score: number) {
        this.finalizeMessage();

        const scoreEl = this.transcriptContainer.createEl('div', {
            text: `🌟 Nota: ${score}`,
            cls: 'gemini-score-flag'
        });
        scoreEl.style.color = 'gold';
        scoreEl.style.backgroundColor = '#333';
        scoreEl.style.fontSize = '1.5em';
        scoreEl.style.fontWeight = 'bold';
        scoreEl.style.marginTop = '15px';
        scoreEl.style.marginBottom = '15px';
        scoreEl.style.border = '2px solid gold';
        scoreEl.style.padding = '10px';
        scoreEl.style.textAlign = 'center';
        scoreEl.style.borderRadius = '8px';

        scoreEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        this.fullTranscript += `\n\n[SCORE: ${score}]\n\n`;
    }

    appendTopic(heading: string) {
        this.finalizeMessage();

        const topicEl = this.transcriptContainer.createEl('div', {
            text: `📝 PREGUNTA: ${heading}`,
            cls: 'gemini-quiz-topic'
        });
        topicEl.style.backgroundColor = 'var(--interactive-accent)';
        topicEl.style.color = 'var(--text-on-accent)';
        topicEl.style.padding = '10px';
        topicEl.style.borderRadius = '8px';
        topicEl.style.marginTop = '15px';
        topicEl.style.marginBottom = '15px';
        topicEl.style.textAlign = 'center';
        topicEl.style.fontWeight = 'bold';

        topicEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        this.fullTranscript += `\n\n[PREGUNTA: ${heading}]\n\n`;
    }

    private autoScroll() {
        this.transcriptContainer.scrollTop = this.transcriptContainer.scrollHeight;
    }

    getHtml(): string {
        return this.transcriptContainer.innerHTML;
    }

    setHtml(html: string) {
        this.transcriptContainer.innerHTML = html;
        this.autoScroll();
        // Since we are loading raw HTML, we don't restore internal element references.
        // Future appends will start new blocks, which is fine.
        this.finalizeMessage();
    }

    getFullTranscript(): string {
        return this.fullTranscript;
    }
}
