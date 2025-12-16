import { ItemView, WorkspaceLeaf, ButtonComponent, Notice, setIcon, TFile } from 'obsidian';
import { GoogleGeminiLiveAdapter } from '../../Adapters/GoogleGeminiLiveAdapter/GoogleGeminiLiveAdapter';

export const LIVE_SESSION_VIEW_TYPE = 'gemini-live-session-view';

export class LiveSessionView extends ItemView {
    private adapter: GoogleGeminiLiveAdapter | null = null;
    private apiKey: string = '';
    private isSessionActive: boolean = false;
    private statusEl: HTMLElement | null = null;
    private contentContainer: HTMLElement | null = null;
    private activeLeafEvent: any = null;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    setApiKey(key: string) {
        this.apiKey = key;
    }

    getViewType() {
        return LIVE_SESSION_VIEW_TYPE;
    }

    getDisplayText() {
        return 'Gemini Live';
    }

    getIcon() {
        return 'microphone';
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        this.contentContainer = container as HTMLElement;

        this.contentContainer.createEl('h2', { text: 'Gemini Live Session' });

        this.statusEl = this.contentContainer.createEl('div', {
            text: 'Ready to connect',
            cls: 'gemini-live-status'
        });
        this.statusEl.style.marginBottom = '20px';
        this.statusEl.style.color = 'var(--text-muted)';

        const controls = this.contentContainer.createEl('div', { cls: 'gemini-live-controls' });

        new ButtonComponent(controls)
            .setButtonText('Start Session')
            .setCta()
            .onClick(async () => {
                if (this.isSessionActive) {
                    await this.stopSession();
                } else {
                    await this.startSession();
                }
            })
            .then((btn) => {
                // Update button state based on session
                this.registerInterval(window.setInterval(() => {
                    if (this.isSessionActive) {
                        btn.setButtonText('Stop Session');
                        btn.removeCta();
                        btn.setWarning();
                    } else {
                        btn.setButtonText('Start Session');
                        btn.buttonEl.removeClass('mod-warning');
                        btn.setCta();
                    }
                }, 100));
            });
    }

    async onClose() {
        await this.stopSession();
    }

    private async startSession() {
        if (!this.apiKey) {
            new Notice('Gemini API Key is missing via settings.');
            return;
        }

        this.updateStatus('Connecting...', 'var(--text-normal)');

        let context = '';
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile instanceof TFile) {
            try {
                context = await this.app.vault.read(activeFile);
                new Notice(`Context loaded from: ${activeFile.basename}`);
            } catch (e) {
                console.error('Failed to read active file', e);
            }
        }

        this.adapter = new GoogleGeminiLiveAdapter(this.apiKey);
        const success = await this.adapter.connect(context);

        if (success) {
            this.isSessionActive = true;
            this.updateStatus('🔴 Live - Listening', 'var(--color-red)');
            new Notice('Gemini Live Connected');

            // Subscribe to active leaf changes
            this.activeLeafEvent = this.app.workspace.on('active-leaf-change', async (leaf) => {
                if (!this.isSessionActive || !this.adapter) return;

                const file = this.app.workspace.getActiveFile();
                if (file instanceof TFile && file.extension === 'md') {
                    try {
                        const newContext = await this.app.vault.read(file);
                        this.adapter.sendContextUpdate(file.basename, newContext);
                        new Notice(`Context updated: ${file.basename}`);
                    } catch (e) {
                        console.error('Error reading file for context update', e);
                    }
                }
            });
            this.registerEvent(this.activeLeafEvent);
        } else {
            this.updateStatus('Connection Failed', 'var(--text-error)');
            this.adapter = null;
        }
    }

    private async stopSession() {
        if (this.activeLeafEvent) {
            this.app.workspace.offref(this.activeLeafEvent);
            this.activeLeafEvent = null;
        }

        if (this.adapter) {
            this.adapter.disconnect();
            this.adapter = null;
        }
        this.isSessionActive = false;
        this.updateStatus('Session Ended', 'var(--text-muted)');
    }

    private updateStatus(text: string, color: string) {
        if (this.statusEl) {
            this.statusEl.textContent = text;
            this.statusEl.style.color = color;
        }
    }
}
