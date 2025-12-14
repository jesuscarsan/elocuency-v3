import { App, FuzzySuggestModal, FuzzyMatch } from 'obsidian';

export class GenericFuzzySuggestModal<T> extends FuzzySuggestModal<T> {
    private isSelected = false;

    constructor(
        app: App,
        private items: T[],
        private getItemTextCallback: (item: T) => string,
        private onChooseItemCallback: (item: T) => void,
        private resolve: (value: T | null) => void,
        placeholder?: string
    ) {
        super(app);
        if (placeholder) {
            this.setPlaceholder(placeholder);
        }
    }

    getItems(): T[] {
        return this.items;
    }

    getItemText(item: T): string {
        return this.getItemTextCallback(item);
    }

    selectSuggestion(value: FuzzyMatch<T>, evt: MouseEvent | KeyboardEvent): void {
        this.isSelected = true;
        super.selectSuggestion(value, evt);
    }

    onChooseItem(item: T, evt: MouseEvent | KeyboardEvent): void {
        this.isSelected = true;
        this.onChooseItemCallback(item);
        this.resolve(item);
    }

    onClose(): void {
        if (!this.isSelected) {
            this.resolve(null);
        }
    }
}
