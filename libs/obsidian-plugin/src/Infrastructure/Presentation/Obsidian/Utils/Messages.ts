import { Notice } from 'obsidian';
import { TranslationService } from '../../../../Domain/Interfaces/TranslationService';

/**
 * Utility to show a notice in Obsidian and log it to the console.
 * Replacement for 'new Notice' to allow for better traceability.
 */
export function showMessage(
    keyOrMessage: string,
    args?: Record<string, any>,
    translationService?: TranslationService,
) {
    const message = translationService ? translationService.t(keyOrMessage, args) : keyOrMessage;
    console.log('Msg:', message);
    new Notice(message, 5000);
}
