import { App, MarkdownView, TFile } from 'obsidian';
/**
 * Helper to get the active MarkdownView, supporting specific file targeting and fallback
 * for when focus is in a side panel.
 */
export declare function getActiveMarkdownView(app: App, targetFile?: TFile): MarkdownView | null;
/**
 * Executes an action in edit (source) mode and ensures the view returns to preview mode afterwards.
 *
 * @param view The MarkdownView to operate on.
 * @param action The async action to execute while in edit mode.
 */
export declare function executeInEditMode(view: MarkdownView, action: () => Promise<void>): Promise<void>;
