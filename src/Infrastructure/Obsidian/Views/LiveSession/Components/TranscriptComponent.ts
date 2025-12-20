
export class TranscriptComponent {
    private transcriptContainer: HTMLElement;
    private fullTranscript: string = '';

    constructor(private container: HTMLElement) {
        this.transcriptContainer = this.container.createDiv({ cls: 'gemini-live-transcript' });
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
        this.renderPlaceholder();
    }

    startSession() {
        // Remove placeholder
        const placeholder = this.transcriptContainer.querySelector('.transcript-placeholder');
        if (placeholder) placeholder.remove();

        // We might want to keep previous transcript until a new one starts? 
        // Logic in LiveSessionView was: clear when starting.
        this.transcriptContainer.empty();
        this.fullTranscript = '';
    }

    appendUserText(text: string) {
        // handleTranscription
        this.transcriptContainer.createSpan({ text: text });
        this.autoScroll();
        this.fullTranscript += text;
    }

    appendScore(score: number) {
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

    getFullTranscript(): string {
        return this.fullTranscript;
    }
}
