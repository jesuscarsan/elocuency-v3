import { NotificationPort } from '../../Domain/ports/NotificationPort';
export declare class ObsidianNotificationAdapter implements NotificationPort {
    showMessage(message: string): void;
    showError(message: string): void;
}
