import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObsidianNotificationAdapter } from './ObsidianNotificationAdapter';
import { Notice } from 'obsidian';

vi.mock('obsidian', () => ({
	Notice: vi.fn(),
}));

describe('ObsidianNotificationAdapter', () => {
	let adapter: ObsidianNotificationAdapter;

	beforeEach(() => {
		vi.clearAllMocks();
		adapter = new ObsidianNotificationAdapter();
	});

	it('should show message using Obsidian Notice', () => {
		adapter.showMessage('Hello');
		expect(Notice).toHaveBeenCalledWith('Hello');
	});

	it('should show error using Obsidian Notice with error prefix', () => {
		adapter.showError('Boom');
		expect(Notice).toHaveBeenCalledWith('Error: Boom');
	});
});
