import { Component } from 'obsidian';

export class VocabularyComponent {
    private container: HTMLElement;
    private listContainer: HTMLElement | null = null;

    constructor(container: HTMLElement) {
        this.container = container;
    }

    render(vocabularyList: string[], selectedItems: Set<string>, onToggle: (item: string) => void) {
        if (this.listContainer) {
            this.listContainer.remove();
        }

        if (!vocabularyList || vocabularyList.length === 0) {
            return;
        }

        this.listContainer = this.container.createDiv({ cls: 'gemini-vocabulary-container' });
        this.listContainer.style.marginTop = '15px';
        this.listContainer.style.padding = '10px';
        this.listContainer.style.border = '1px solid var(--background-modifier-border)';
        this.listContainer.style.borderRadius = '4px';
        this.listContainer.style.backgroundColor = 'var(--background-secondary)';

        const header = this.listContainer.createEl('h4', { text: 'Vocabulary Context' });
        header.style.margin = '0 0 10px 0';
        header.style.fontSize = '0.9em';
        header.style.color = 'var(--text-muted)';

        const sub = this.listContainer.createDiv({ text: 'Click to add note content to prompt context.' });
        sub.style.fontSize = '0.8em';
        sub.style.marginBottom = '10px';
        sub.style.color = 'var(--text-faint)';

        const list = this.listContainer.createDiv({ cls: 'gemini-vocabulary-list' });
        list.style.display = 'flex';
        list.style.flexWrap = 'wrap';
        list.style.gap = '8px';

        vocabularyList.forEach(word => {
            const isSelected = selectedItems.has(word);
            const tag = list.createSpan({ text: word });
            tag.style.padding = '4px 8px';
            tag.style.borderRadius = '12px';
            tag.style.fontSize = '0.85em';
            tag.style.cursor = 'pointer';
            tag.style.transition = 'all 0.2s ease';
            tag.style.userSelect = 'none';

            if (isSelected) {
                tag.style.backgroundColor = 'var(--interactive-accent)';
                tag.style.color = 'var(--text-on-accent)';
                tag.style.border = '1px solid var(--interactive-accent)';
            } else {
                tag.style.backgroundColor = 'var(--background-primary)';
                tag.style.color = 'var(--text-normal)';
                tag.style.border = '1px solid var(--background-modifier-border)';
            }

            tag.addEventListener('click', () => {
                onToggle(word);
            });
        });
    }
}
