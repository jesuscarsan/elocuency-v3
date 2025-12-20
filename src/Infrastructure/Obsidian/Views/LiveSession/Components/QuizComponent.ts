import { DropdownComponent, ButtonComponent } from 'obsidian';
import { QuizManager, QuizItem } from '../Services/QuizManager';

// Props handling manual reactivity since we don't have a reactivity system
// We pass the manager to read state, and callbacks to trigger actions/refreshes
export interface QuizComponentProps {
    quizManager: QuizManager;
    onStarLevelChange: (level: string) => void;
    onAskNext: () => void;
    onFilterChange: (onlyTitles: boolean) => void;
}

export class QuizComponent {
    private quizListContainer: HTMLElement | null = null;
    private quizStatusEl: HTMLElement | null = null;

    constructor(private container: HTMLElement) { }

    render(props: QuizComponentProps) {
        const quizContainer = this.container.createDiv({ cls: 'gemini-quiz-container' });
        quizContainer.style.marginBottom = '20px';
        quizContainer.style.padding = '10px';
        quizContainer.style.border = '1px solid var(--background-modifier-border)';
        quizContainer.style.borderRadius = '4px';

        quizContainer.createEl('h4', { text: 'Quiz Mode' });
        quizContainer.querySelector('h4')!.style.marginTop = '0';

        const quizControls = quizContainer.createDiv();
        quizControls.style.display = 'flex';
        quizControls.style.gap = '10px';
        quizControls.style.alignItems = 'center';
        quizControls.style.flexWrap = 'wrap';

        // Star Level Dropdown
        quizControls.createSpan({ text: 'Relevancia:' });
        const importanceDropdown = new DropdownComponent(quizControls);
        ['1', '2', '3', '4', '5'].forEach(level => importanceDropdown.addOption(level, `⭐`.repeat(Number(level))));
        importanceDropdown.setValue(props.quizManager.selectedStarLevel);
        importanceDropdown.onChange((val) => props.onStarLevelChange(val));

        // "Ask Next" Button
        new ButtonComponent(quizControls)
            .setButtonText('Preguntar siguiente')
            .setTooltip('Start/Continue Quiz for this level')
            .onClick(() => props.onAskNext());

        // "Only titles without subtitles" Checkbox
        const filterContainer = quizControls.createDiv();
        filterContainer.style.display = 'flex';
        filterContainer.style.alignItems = 'center';
        filterContainer.style.gap = '5px';

        const filterCheckbox = document.createElement('input');
        filterCheckbox.type = 'checkbox';
        filterCheckbox.checked = props.quizManager.onlyTitlesWithoutSubtitles;
        filterCheckbox.id = 'only-titles-no-subtitles';
        filterCheckbox.addEventListener('change', (e) => {
            props.onFilterChange((e.target as HTMLInputElement).checked);
        });

        const filterLabel = document.createElement('label');
        filterLabel.htmlFor = 'only-titles-no-subtitles';
        filterLabel.innerText = 'Solo títulos sin subtítulos';

        filterContainer.appendChild(filterCheckbox);
        filterContainer.appendChild(filterLabel);

        // Quiz Status Label
        this.quizStatusEl = quizContainer.createDiv({ cls: 'gemini-quiz-status' });
        this.quizStatusEl.style.marginTop = '15px';
        this.quizStatusEl.style.padding = '10px';
        this.quizStatusEl.style.backgroundColor = 'var(--background-secondary)';
        this.quizStatusEl.style.borderRadius = '4px';
        this.quizStatusEl.style.fontSize = '1.1em';
        this.quizStatusEl.style.fontWeight = 'bold';
        this.quizStatusEl.style.color = 'var(--text-normal)';
        this.quizStatusEl.style.borderLeft = '4px solid var(--text-accent)';
        this.setStatusText('Presiona "Preguntar siguiente" o selecciona un tema de la lista.');

        // Quiz List
        this.quizListContainer = quizContainer.createDiv({ cls: 'gemini-quiz-list' });
        this.quizListContainer.style.marginTop = '10px';
        this.quizListContainer.style.maxHeight = '200px';
        this.quizListContainer.style.overflowY = 'auto';
        this.quizListContainer.style.border = '1px solid var(--background-modifier-border)';
        this.quizListContainer.style.borderRadius = '4px';
        this.quizListContainer.style.padding = '5px';
        this.quizListContainer.style.display = 'none';

        // Initial render of list if queue exists
        this.refreshList(props.quizManager);
    }

    setStatusText(text: string) {
        if (this.quizStatusEl) {
            this.quizStatusEl.textContent = text;
        }
    }

    refreshList(quizManager: QuizManager, onSelect?: (index: number) => void) {
        if (!this.quizListContainer) return;

        this.quizListContainer.empty();

        if (quizManager.queue.length === 0) {
            this.quizListContainer.style.display = 'none';
            return;
        }

        this.quizListContainer.style.display = 'block';

        quizManager.queue.forEach((item, index) => {
            const itemEl = this.quizListContainer!.createDiv({ cls: 'gemini-quiz-item' });
            itemEl.style.padding = '6px';
            itemEl.style.cursor = 'pointer';
            itemEl.style.borderBottom = '1px solid var(--background-modifier-border)';
            itemEl.style.display = 'flex';
            itemEl.style.justifyContent = 'space-between';
            itemEl.style.alignItems = 'center';
            itemEl.style.fontSize = '0.9em';

            if (index === quizManager.currentIndex) {
                itemEl.style.backgroundColor = 'var(--interactive-accent)';
                itemEl.style.color = 'var(--text-on-accent)';
            } else {
                itemEl.addEventListener('mouseenter', () => {
                    itemEl.style.backgroundColor = 'var(--background-modifier-hover)';
                });
                itemEl.addEventListener('mouseleave', () => {
                    itemEl.style.backgroundColor = 'transparent';
                });
            }

            const textEl = itemEl.createSpan({ text: `${index + 1}. ${item.heading}` });
            textEl.style.overflow = 'hidden';
            textEl.style.textOverflow = 'ellipsis';
            textEl.style.whiteSpace = 'nowrap';
            textEl.style.flex = '1';

            itemEl.addEventListener('click', () => {
                if (onSelect) onSelect(index);
            });
        });
    }
}
