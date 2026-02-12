export interface NotificationPort {
    showMessage(message: string): void;
    showError(message: string): void;
}
