import { App, Notice } from 'obsidian';
import { UIServicePort, SelectionItem } from '../../../Domain/Ports/UIServicePort';
import { GenericFuzzySuggestModal } from '../../Presentation/Obsidian/Views/Modals/GenericFuzzySuggestModal';

export class ObsidianUIServiceAdapter implements UIServicePort {
	constructor(private readonly app: App) { }

	showMessage(message: string): void {
		new Notice(message);
	}

	async showSelectionModal<T>(
		placeholder: string,
		items: T[],
		labelFn: (item: T) => string,
	): Promise<T | null> {
		return new Promise<T | null>((resolve) => {
			new GenericFuzzySuggestModal<T>(
				this.app,
				items,
				labelFn,
				() => { },
				(selected: T | null) => resolve(selected),
				placeholder,
			).open();
		});
	}
}
