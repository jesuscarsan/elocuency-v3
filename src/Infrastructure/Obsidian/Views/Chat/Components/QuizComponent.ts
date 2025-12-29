import { DropdownComponent, ButtonComponent } from 'obsidian';
import { QuizService, QuizItem } from '@/Application/Services/QuizService';
import { SessionControlsComponent } from './SessionControlsComponent';

// Props handling manual reactivity since we don't have a reactivity system
// We pass the manager to read state, and callbacks to trigger actions/refreshes
export interface QuizComponentProps {
    quizService: QuizService;
    onStarLevelChange: (level: string) => void;
    onAskNext: () => void;
    onFilterChange: (onlyTitles: boolean) => void;
    onTopicSelect: (index: number) => void;
    onRefresh: () => void;
}

export class QuizComponent {
    private sessionControls: SessionControlsComponent | null = null;
    private quizListContainer: HTMLElement | null = null;
    private quizStatusEl: HTMLElement | null = null;

    constructor(private container: HTMLElement) { }

    render(props: QuizComponentProps) {
        const quizContainer = this.container.createDiv({ cls: 'gemini-quiz-container' });
        quizContainer.style.marginBottom = '20px';
        quizContainer.style.padding = '10px';
        quizContainer.style.border = '1px solid var(--background-modifier-border)';
        quizContainer.style.borderRadius = '4px';
        quizContainer.style.display = 'flex';
        quizContainer.style.flexDirection = 'column';
        quizContainer.style.height = '100%';

        quizContainer.createEl('h4', { text: 'Quiz Mode' });
        quizContainer.querySelector('h4')!.style.marginTop = '0';

        const quizControls = quizContainer.createDiv();
        quizControls.style.display = 'flex';
        quizControls.style.gap = '10px';
        quizControls.style.alignItems = 'center';
        quizControls.style.flexWrap = 'wrap';
        quizControls.style.marginBottom = '15px';

        // Star Level Dropdown
        quizControls.createSpan({ text: 'Relevancia:' });
        const importanceDropdown = new DropdownComponent(quizControls);
        importanceDropdown.addOption('0', '(Sin filtro)'); // New option
        ['1', '2', '3', '4', '5'].forEach(level => importanceDropdown.addOption(level, `⭐`.repeat(Number(level))));
        importanceDropdown.setValue(props.quizService.selectedStarLevel);
        importanceDropdown.onChange((val) => props.onStarLevelChange(val));



        // Removed "Preguntar siguiente" button as per requirements

        // "Only titles without subtitles" Checkbox
        const filterContainer = quizControls.createDiv();
        filterContainer.style.display = 'flex';
        filterContainer.style.alignItems = 'center';
        filterContainer.style.gap = '5px';

        const filterCheckbox = document.createElement('input');
        filterCheckbox.type = 'checkbox';
        filterCheckbox.checked = props.quizService.onlyTitlesWithoutSubtitles;
        filterCheckbox.id = 'only-titles-no-subtitles';
        filterCheckbox.addEventListener('change', (e) => {
            props.onFilterChange((e.target as HTMLInputElement).checked);
        });

        const filterLabel = document.createElement('label');
        filterLabel.htmlFor = 'only-titles-no-subtitles';
        filterLabel.innerText = 'Solo títulos sin subtítulos';

        filterContainer.appendChild(filterCheckbox);
        filterContainer.appendChild(filterLabel);

        // Refresh Button (Moved to end for right alignment)
        const refreshBtn = new ButtonComponent(quizControls);
        refreshBtn.setIcon('refresh-cw');
        refreshBtn.setTooltip('Refrescar Datos');
        refreshBtn.onClick(() => props.onRefresh());
        refreshBtn.buttonEl.style.marginLeft = 'auto';


        // Quiz List
        this.quizListContainer = quizContainer.createDiv({ cls: 'gemini-quiz-list' });
        this.quizListContainer.style.marginTop = '10px';
        this.quizListContainer.style.flex = '1';
        this.quizListContainer.style.minHeight = '200px';
        this.quizListContainer.style.overflowY = 'auto';
        this.quizListContainer.style.border = '1px solid var(--background-modifier-border)';
        this.quizListContainer.style.borderRadius = '4px';
        this.quizListContainer.style.padding = '5px';

        // Initial render of list if queue exists
        this.refreshList(props.quizService, (i) => {
            if (props.onTopicSelect) {
                props.onTopicSelect(i);
            }
        });

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
        this.setStatusText('Selecciona un tema para comenzar.');

        // Session Controls (Embedded)
        const controlsContainer = quizContainer.createDiv();
        controlsContainer.style.marginTop = 'auto';
        controlsContainer.style.paddingTop = '15px';
        controlsContainer.style.display = 'flex';
        controlsContainer.style.justifyContent = 'center';

        this.sessionControls = new SessionControlsComponent(
            controlsContainer,
            props.onAskNext // We use the AskNext action which handles session start logic
        );
    }

    setStatusText(text: string) {
        if (this.quizStatusEl) {
            this.quizStatusEl.textContent = text;
        }
    }

    updateSessionStatus(isActive: boolean, text: string, color: string) {
        this.sessionControls?.updateStatus(isActive, text, color);
    }

    refreshList(quizService: QuizService, onSelect?: (index: number) => void) {
        if (!this.quizListContainer) return;

        this.quizListContainer.empty();

        if (quizService.queue.length === 0) {
            // this.quizListContainer.style.display = 'none'; // Don't hide, just show empty
            const emptyEl = this.quizListContainer.createDiv();
            emptyEl.innerText = "No topics found.";
            emptyEl.style.color = 'var(--text-muted)';
            emptyEl.style.textAlign = 'center';
            emptyEl.style.padding = '20px';
            return;
        }

        this.quizListContainer.style.display = 'block';

        quizService.queue.forEach((item, index) => {
            const itemEl = this.quizListContainer!.createDiv({ cls: 'gemini-quiz-item' });
            itemEl.style.padding = '8px'; // Slightly bigger touch target
            itemEl.style.cursor = 'pointer';
            itemEl.style.borderBottom = '1px solid var(--background-modifier-border)';
            itemEl.style.display = 'flex';
            itemEl.style.justifyContent = 'space-between';
            itemEl.style.alignItems = 'center';
            itemEl.style.fontSize = '0.9em';

            if (index === quizService.currentIndex) {
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
