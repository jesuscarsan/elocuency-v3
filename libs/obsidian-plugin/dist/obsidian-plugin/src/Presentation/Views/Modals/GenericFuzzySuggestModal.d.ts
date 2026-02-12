import { App, FuzzySuggestModal, FuzzyMatch } from 'obsidian';
export declare class GenericFuzzySuggestModal<T> extends FuzzySuggestModal<T> {
    private items;
    private getItemTextCallback;
    private onChooseItemCallback;
    private resolve;
    private isSelected;
    constructor(app: App, items: T[], getItemTextCallback: (item: T) => string, onChooseItemCallback: (item: T) => void, resolve: (value: T | null) => void, placeholder?: string);
    getItems(): T[];
    getItemText(item: T): string;
    selectSuggestion(value: FuzzyMatch<T>, evt: MouseEvent | KeyboardEvent): void;
    onChooseItem(item: T, evt: MouseEvent | KeyboardEvent): void;
    onClose(): void;
}
