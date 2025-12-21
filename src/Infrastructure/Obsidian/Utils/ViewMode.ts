import { MarkdownView } from 'obsidian';

/**
 * Executes an action in edit (source) mode and ensures the view returns to preview mode afterwards.
 * 
 * @param view The MarkdownView to operate on.
 * @param action The async action to execute while in edit mode.
 */
export async function executeInEditMode(view: MarkdownView, action: () => Promise<void>): Promise<void> {
    const originalMode = view.getMode();

    // Switch to source mode if not already there
    if (originalMode !== 'source') {
        await view.setState({ ...view.getState(), mode: 'source' }, { history: false });
        // Small delay to ensure state transition settles if needed, though await should handle it.
    }

    try {
        await action();
    } finally {
        // Always switch to preview mode at the end, as requested.
        if (originalMode !== 'source' && view.getMode() !== 'preview') {
            await view.setState({ ...view.getState(), mode: 'preview' }, { history: false });
        }
    }
}
