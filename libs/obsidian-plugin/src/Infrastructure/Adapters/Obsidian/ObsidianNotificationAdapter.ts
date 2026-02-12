import { Notice } from 'obsidian';
import { NotificationPort } from '../../../Domain/Ports/NotificationPort';

export class ObsidianNotificationAdapter implements NotificationPort {
    showMessage(message: string): void {
        new Notice(message);
    }

    showError(message: string): void {
        new Notice(`Error: ${message}`);
    }
}
