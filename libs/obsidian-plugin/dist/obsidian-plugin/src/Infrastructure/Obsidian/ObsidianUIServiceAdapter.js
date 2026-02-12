"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObsidianUIServiceAdapter = void 0;
const obsidian_1 = require("obsidian");
const GenericFuzzySuggestModal_1 = require("../../Presentation/Views/Modals/GenericFuzzySuggestModal");
class ObsidianUIServiceAdapter {
    constructor(app) {
        this.app = app;
    }
    showMessage(message) {
        new obsidian_1.Notice(message);
    }
    async showSelectionModal(placeholder, items, labelFn) {
        return new Promise((resolve) => {
            new GenericFuzzySuggestModal_1.GenericFuzzySuggestModal(this.app, items, labelFn, () => { }, (selected) => resolve(selected), placeholder).open();
        });
    }
}
exports.ObsidianUIServiceAdapter = ObsidianUIServiceAdapter;
