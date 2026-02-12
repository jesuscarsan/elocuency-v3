"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.showMessage = showMessage;
const obsidian_1 = require("obsidian");
/**
 * Utility to show a notice in Obsidian and log it to the console.
 * Replacement for 'new Notice' to allow for better traceability.
 */
function showMessage(message) {
    console.log("Msg:", message);
    new obsidian_1.Notice(message, 5000);
}
