"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObsidianNotificationAdapter = void 0;
const obsidian_1 = require("obsidian");
class ObsidianNotificationAdapter {
    showMessage(message) {
        new obsidian_1.Notice(message);
    }
    showError(message) {
        new obsidian_1.Notice(`Error: ${message}`);
    }
}
exports.ObsidianNotificationAdapter = ObsidianNotificationAdapter;
