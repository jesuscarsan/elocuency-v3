import { App, Notice } from 'obsidian';
import { UIServicePort } from '../../../Domain/Ports/UIServicePort';
import { TranslationService } from '../../../Domain/Interfaces/TranslationService';
import { GenericFuzzySuggestModal } from '../../Presentation/Obsidian/Views/Modals/GenericFuzzySuggestModal';

export class ObsidianUIServiceAdapter implements UIServicePort {
	constructor(
		private readonly app: App,
		private readonly translationService: TranslationService,
	) { }

	showMessage(keyOrMessage: string, args?: Record<string, any>): void {
		const message = this.translationService.t(keyOrMessage, args);
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
