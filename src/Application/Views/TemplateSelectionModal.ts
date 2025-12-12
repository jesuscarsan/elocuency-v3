import { App, FuzzySuggestModal, TFile, FuzzyMatch } from 'obsidian';
import { TemplateMatch } from '../Utils/TemplateConfig';

export class TemplateSelectionModal extends FuzzySuggestModal<TemplateMatch> {
    private isSelected = false;

    constructor(
        app: App,
        private matches: TemplateMatch[],
        private resolve: (value: TemplateMatch | null) => void
    ) {
        super(app);
    }

    getItems(): TemplateMatch[] {
        return this.matches;
    }

    getItemText(item: TemplateMatch): string {
        return item.templateFile.basename;
    }

    selectSuggestion(value: FuzzyMatch<TemplateMatch>, evt: MouseEvent | KeyboardEvent): void {
        console.log('TemplateSelectionModal: selectSuggestion called');
        this.isSelected = true;
        super.selectSuggestion(value, evt);
    }

    onChooseItem(item: TemplateMatch, evt: MouseEvent | KeyboardEvent): void {
        console.log('TemplateSelectionModal: onChooseItem', item);
        this.resolve(item);
    }

    onClose(): void {
        console.log('TemplateSelectionModal: onClose. isSelected =', this.isSelected);
        if (!this.isSelected) {
            this.resolve(null);
        }
    }
}

export function pickTemplate(app: App, matches: TemplateMatch[]): Promise<TemplateMatch | null> {
    return new Promise((resolve) => {
        const modal = new TemplateSelectionModal(app, matches, resolve);
        modal.open();
    });
}
