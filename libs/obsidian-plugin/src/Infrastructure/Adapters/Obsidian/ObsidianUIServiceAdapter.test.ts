import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObsidianUIServiceAdapter } from './ObsidianUIServiceAdapter';
import { Notice } from 'obsidian';

vi.mock('obsidian', () => ({
	Notice: vi.fn(),
	App: class { },
	FuzzySuggestModal: class {
		open() { }
		setPlaceholder() { }
	},
}));

vi.mock('../../Presentation/Obsidian/Views/Modals/GenericFuzzySuggestModal', () => ({
	GenericFuzzySuggestModal: function (
		app: any,
		items: any,
		labelFn: any,
		onChoose: any,
		resolve: any,
		placeholder: any,
	) {
		return {
			open: () => resolve(null),
		};
	},
}));

describe('ObsidianUIServiceAdapter', () => {
	let adapter: ObsidianUIServiceAdapter;
	let mockApp: any;

	beforeEach(() => {
		vi.clearAllMocks();
		mockApp = {};
		adapter = new ObsidianUIServiceAdapter(mockApp);
	});

	it('should show basic message using Notice', () => {
		adapter.showMessage('Hello');
		expect(Notice).toHaveBeenCalledWith('Hello');
	});

	it('should return null for selection modal for now', async () => {
		// Since the current implementation of showSelectionModal creates a real Modal subclass,
		// we'd need to mock the entire Modal/App ecosystem. For 80% coverage,
		// we can focus on the other methods first or mock the Modal class.
		const result = await adapter.showSelectionModal('Title', [], (i: any) => i);
		expect(result).toBeNull();
	});
});
