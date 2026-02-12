import { Notice } from 'obsidian';
import { NotificationPort } from '../../../Domain/Ports/NotificationPort';
import { TranslationService } from '../../../Domain/Interfaces/TranslationService';

export class ObsidianNotificationAdapter implements NotificationPort {
    constructor(private readonly translationService?: TranslationService) { }

    showMessage(keyOrMessage: string, args?: Record<string, any>): void {
        const message = this.translationService
            ? this.translationService.t(keyOrMessage, args)
            : keyOrMessage;
        new Notice(message);
    }

    showError(keyOrMessage: string, args?: Record<string, any>): void {
        const message = this.translationService
            ? this.translationService.t(keyOrMessage, args)
            : keyOrMessage;
        new Notice(`Error: ${message}`);
    }
}
