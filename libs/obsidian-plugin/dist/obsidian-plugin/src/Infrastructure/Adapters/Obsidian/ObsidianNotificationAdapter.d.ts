import { NotificationPort } from '../../../Domain/Ports/NotificationPort';
export declare class ObsidianNotificationAdapter implements NotificationPort {
    showMessage(message: string): void;
    showError(message: string): void;
}
