export interface SelectionItem<T> {
    label: string;
    value: T;
}
export interface UIServicePort {
    showMessage(message: string): void;
    showSelectionModal<T>(placeholder: string, items: T[], labelFn: (item: T) => string): Promise<T | null>;
}
