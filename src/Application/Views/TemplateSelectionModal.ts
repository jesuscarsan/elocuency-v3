import { App, FuzzySuggestModal, TFile } from 'obsidian';
import { TemplateMatch } from '../Utils/TemplateConfig';

export class TemplateSelectionModal extends FuzzySuggestModal<TemplateMatch> {
    private resolve: (value: TemplateMatch | null) => void;

    constructor(app: App, private matches: TemplateMatch[], resolve: (value: TemplateMatch | null) => void) {
        super(app);
        this.resolve = resolve;
    }

    getItems(): TemplateMatch[] {
        return this.matches;
    }

    getItemText(item: TemplateMatch): string {
        return item.templateFile.basename;
    }

    onChooseItem(item: TemplateMatch, evt: MouseEvent | KeyboardEvent): void {
        this.resolve(item);
    }

    onClose(): void {
        // If no item was selected (modal closed via escape or clicking outside),
        // we might want to handle that. However, onChooseItem is called on selection.
        // If resolve hasn't been called, it means cancelled.
        // But FuzzySuggestModal doesn't have a clean "onCancel" hook that distinguishes from selection easily 
        // without state. 
        // We can just rely on the fact that if they pick something, onChooseItem fires.
        // If they close, we can resolve with null if we haven't resolved yet.
        // But since this is async, we can't easily check "has resolved" without a flag.
        // Let's add a flag.
    }
}

export function pickTemplate(app: App, matches: TemplateMatch[]): Promise<TemplateMatch | null> {
    return new Promise((resolve) => {
        let selected = false;
        const modal = new TemplateSelectionModal(app, matches, (match) => {
            selected = true;
            resolve(match);
        });

        const originalOnClose = modal.onClose;
        modal.onClose = () => {
            originalOnClose.call(modal);
            if (!selected) {
                resolve(null);
            }
        };

        modal.open();
    });
}
