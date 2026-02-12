"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GenericFuzzySuggestModal = void 0;
const obsidian_1 = require("obsidian");
class GenericFuzzySuggestModal extends obsidian_1.FuzzySuggestModal {
    constructor(app, items, getItemTextCallback, onChooseItemCallback, resolve, placeholder) {
        super(app);
        this.items = items;
        this.getItemTextCallback = getItemTextCallback;
        this.onChooseItemCallback = onChooseItemCallback;
        this.resolve = resolve;
        this.isSelected = false;
        if (placeholder) {
            this.setPlaceholder(placeholder);
        }
    }
    getItems() {
        return this.items;
    }
    getItemText(item) {
        return this.getItemTextCallback(item);
    }
    selectSuggestion(value, evt) {
        this.isSelected = true;
        super.selectSuggestion(value, evt);
    }
    onChooseItem(item, evt) {
        this.isSelected = true;
        this.onChooseItemCallback(item);
        this.resolve(item);
    }
    onClose() {
        if (!this.isSelected) {
            this.resolve(null);
        }
    }
}
exports.GenericFuzzySuggestModal = GenericFuzzySuggestModal;
