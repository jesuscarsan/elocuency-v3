import { ItemView, WorkspaceLeaf, ButtonComponent, Notice, setIcon, TFile, DropdownComponent, TFolder } from 'obsidian';
import { GoogleGeminiLiveAdapter } from '../../Adapters/GoogleGeminiLiveAdapter/GoogleGeminiLiveAdapter';
import { MetadataService } from '../../Services/MetadataService';
import ObsidianExtension from 'src/main';

export const LIVE_SESSION_VIEW_TYPE = 'gemini-live-session-view';

export class LiveSessionView extends ItemView {
    private fullTranscript: string = '';
    private transcriptContainer: HTMLElement | null = null;
    private adapter: GoogleGeminiLiveAdapter | null = null;
    private apiKey: string = '';
    private isSessionActive: boolean = false;
    private statusEl: HTMLElement | null = null;
    private contentContainer: HTMLElement | null = null;
    private activeLeafEvent: any = null;
    private selectedRolePrompt: string = '';
    private selectedRoleEvaluationPrompt: string = '';
    private sessionBtn: ButtonComponent | null = null;
    private plugin!: ObsidianExtension;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    // Need to pass plugin instance to access settings for roles folder
    setPlugin(plugin: ObsidianExtension) {
        this.plugin = plugin;
        this.apiKey = plugin.settings.geminiApiKey;
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
        await this.renderContent();

        // Refresh view when it becomes active to pick up setting changes
        this.registerEvent(this.app.workspace.on('active-leaf-change', async (leaf) => {
            if (leaf && leaf.view.getViewType() === LIVE_SESSION_VIEW_TYPE && leaf.view === this) {
                await this.renderContent();
            }
        }));
    }

    private async renderContent() {
        const container = this.contentContainer || this.containerEl.children[1] as HTMLElement;
        container.empty();
        this.contentContainer = container;
        this.transcriptContainer = null; // reset

        this.contentContainer.createEl('h2', { text: 'Gemini Live Session' });

        // --- Roles Section ---
        if (this.plugin && this.plugin.settings.geminiRolesFolder) {
            const rolesContainer = this.contentContainer.createDiv({ cls: 'gemini-roles-container' });
            rolesContainer.style.marginBottom = '20px';
            rolesContainer.style.display = 'flex';
            rolesContainer.style.gap = '10px';
            rolesContainer.style.alignItems = 'center';

            rolesContainer.createSpan({ text: 'Role:' });

            const roles = await this.loadRoles();

            if (roles.length === 0) {
                rolesContainer.createSpan({ text: '(No roles found in folder)', cls: 'gemini-muted-text' });
            } else {
                const dropdown = new DropdownComponent(rolesContainer);
                dropdown.addOption('', 'Default (None)');
                roles.forEach(role => dropdown.addOption(role.prompt, role.name));

                // Set initial value if matches
                if (this.selectedRolePrompt) {
                    // Check if the current selected prompt is still valid
                    const exists = roles.find(r => r.prompt === this.selectedRolePrompt);
                    if (exists) {
                        dropdown.setValue(this.selectedRolePrompt);
                    } else {
                        // Keep it but maybe show it's custom? Or reset. Reset for now.
                        this.selectedRolePrompt = '';
                    }
                }

                dropdown.onChange((value) => {
                    // Dropdown value is the prompt itself
                    this.selectedRolePrompt = value;
                    const selectedRole = roles.find(r => r.prompt === value);
                    this.selectedRoleEvaluationPrompt = selectedRole?.evaluationPrompt || '';
                });

                new ButtonComponent(rolesContainer)
                    .setButtonText('Apply Role')
                    .setTooltip('Apply selected role (restarts session if active)')
                    .onClick(async () => {
                        // Check if session is active
                        if (this.isSessionActive) {
                            new Notice('Applying role... restarting session.');
                            await this.stopSession();
                            await this.startSession();
                        } else {
                            new Notice(`Role applied: ${roles.find(r => r.prompt === this.selectedRolePrompt)?.name || 'Default'}`);
                        }
                    });

                // Evaluation Button
                const evalBtn = new ButtonComponent(rolesContainer)
                    .setButtonText('Eval Headers')
                    .setTooltip('batch evaluate all headers in active note')
                    .onClick(async () => {
                        if (!this.selectedRoleEvaluationPrompt) {
                            new Notice('Current role has no !!evaluationPrompt defined.');
                            return;
                        }
                        await this.evaluateHeaders();
                    });
            }
        }

        this.statusEl = this.contentContainer.createEl('div', {
            text: this.isSessionActive ? '🔴 Live - Listening' : 'Ready to connect',
            cls: 'gemini-live-status'
        });
        this.statusEl.style.marginBottom = '20px';
        this.statusEl.style.color = this.isSessionActive ? 'var(--color-red)' : 'var(--text-muted)';

        // --- Transcript Area ---
        this.transcriptContainer = this.contentContainer.createDiv({ cls: 'gemini-live-transcript' });
        this.transcriptContainer.style.height = '300px';
        this.transcriptContainer.style.overflowY = 'auto';
        this.transcriptContainer.style.border = '1px solid var(--background-modifier-border)';
        this.transcriptContainer.style.padding = '10px';
        this.transcriptContainer.style.marginBottom = '20px';
        this.transcriptContainer.style.borderRadius = '4px';
        this.transcriptContainer.style.backgroundColor = 'var(--background-primary)';
        const placeholder = this.transcriptContainer.createEl('span', { text: 'Transcription will appear here...', cls: 'transcript-placeholder' });
        placeholder.style.color = 'var(--text-muted)';
        placeholder.style.fontStyle = 'italic';


        const controls = this.contentContainer.createEl('div', { cls: 'gemini-live-controls' });

        this.sessionBtn = new ButtonComponent(controls)
            .setButtonText(this.isSessionActive ? 'Stop Session' : 'Start Session')
            .setCta()
            .onClick(async () => {
                if (this.isSessionActive) {
                    await this.stopSession();
                } else {
                    await this.startSession();
                }
            });

        if (this.isSessionActive) {
            this.sessionBtn.setWarning();
        }
    }



    private async evaluateHeaders() {
        if (!this.plugin) return;

        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== 'md') {
            new Notice('Please open a markdown file first.');
            return;
        }

        new Notice('Starting header evaluation...');

        // Use MetadataService to get or create block IDs is a bit complex since it's inside a Command usually.
        // We can reuse the GenerateHeaderMetadataCommand logic or move it to a service.
        // For now, let's look at how to get headers.
        const cache = this.app.metadataCache.getFileCache(activeFile);
        if (!cache || !cache.headings) {
            new Notice('No headings found.');
            return;
        }

        const content = await this.app.vault.read(activeFile);
        const lines = content.split('\n');

        // Helper to extract text between current header and next header
        // This is a naive implementation; for robust parsing one might need more.

        let processedCount = 0;

        for (let i = 0; i < cache.headings.length; i++) {
            const heading = cache.headings[i];
            const startLine = heading.position.start.line;
            // determine end line (next heading or end of file)
            let endLine = lines.length;
            if (i < cache.headings.length - 1) {
                endLine = cache.headings[i + 1].position.start.line;
            }

            // Extract content for this section
            const sectionLines = lines.slice(startLine + 1, endLine); // +1 to skip the heading itself? Or include it?
            // User said: "envie el contenido de cada titulo (subtitulos incluidos)"
            // Usually this means the text under the header.
            // Let's include the header text itself in the prompt context.
            const sectionText = heading.heading + '\n' + sectionLines.join('\n');

            // Construct Prompt
            // "al evaluationPrompt, añadele como prompt de sistema, lo necesario para que devuelve un json..."
            const finalPrompt = `${this.selectedRoleEvaluationPrompt}
            
            Analyze the following text section:
            "${sectionText}"
            
            RETURN JSON ONLY:
            {
              "difficulty": <integer 0-10>,
              "importance": <integer 0-5>
            }
            `;

            try {
                const result = await this.plugin.llm.requestJson({ prompt: finalPrompt });
                if (result && typeof result.difficulty === 'number' && typeof result.importance === 'number') {
                    // Update Metadata
                    // We need the Block ID.
                    // using MetadataService to ensure ID exists might modify the file lines...
                    // which invalidates our current 'lines' array and 'cache' positions if we aren't careful.
                    // SAFEST STRATEGY: Ensure block IDs first for ALL headers, then save file, THEN process.

                    // BUT, to avoid too much refactor, let's just try to read the Block ID if it exists.
                    // If it doesn't exist, we skip or we default?
                    // The request implies updating metadata. Metadata is stored by Block ID in the JSON sidecar.
                    // So we MUST have a block ID.

                    // Let's try to extract ID from the heading line in 'lines' array.
                    const headingLine = lines[startLine];
                    const idMatch = headingLine.match(/\^([a-zA-Z0-9-]+)$/);
                    let blockId = idMatch ? idMatch[1] : null;

                    if (!blockId) {
                        // If we want to support adding IDs on the fly, we need to modify the file.
                        // For this first iteration, let's assume `Generate Header Metadata` command was run
                        // or just Log a warning. 
                        // Actually, let's try to use the MetadataService if possible, or just generate one and update the file LATER? 
                        // Updating file shifts lines.

                        console.warn(`Skipping header "${heading.heading}" - No Block ID found. Run 'Generate Header Metadata' first.`);
                        continue;
                    }

                    // Update JSON
                    // Since we don't have direct access to MetadataService instance here easily without newing it up:
                    const metaService = new MetadataService(this.app);
                    await metaService.updateBlockMetadata(activeFile, blockId, {
                        difficulty: result.difficulty,
                        importance: result.importance
                    });

                    processedCount++;
                    new Notice(`Evaluated: ${heading.heading} (d:${result.difficulty}, i:${result.importance})`);

                }
            } catch (e) {
                console.error('Error evaluating header', e);
            }
        }

        new Notice(`Evaluation complete. Processed ${processedCount} headers.`);
    }

    private async loadRoles(): Promise<{ name: string, prompt: string, trackLevelAnswer: boolean, evaluationPrompt?: string }[]> {
        if (!this.plugin || !this.plugin.settings.geminiRolesFolder) return [];

        const folderPath = this.plugin.settings.geminiRolesFolder;
        const folder = this.app.vault.getAbstractFileByPath(folderPath);

        if (!folder || !(folder instanceof TFolder)) {
            return [];
        }

        const roles: { name: string, prompt: string, trackLevelAnswer: boolean, evaluationPrompt?: string }[] = [];

        for (const child of folder.children) {
            if (child instanceof TFile && child.extension === 'md') {
                const cache = this.app.metadataCache.getFileCache(child);
                const prompt = cache?.frontmatter?.['!!prompt'];
                const evaluationPrompt = cache?.frontmatter?.['!!evaluationPrompt'];
                const trackLevelRaw = cache?.frontmatter?.['!!trackLevelAnswer'];
                const trackLevel = trackLevelRaw === true || trackLevelRaw === 'true';

                if (prompt && typeof prompt === 'string') {
                    roles.push({
                        name: child.basename,
                        prompt: prompt,
                        trackLevelAnswer: trackLevel,
                        evaluationPrompt: typeof evaluationPrompt === 'string' ? evaluationPrompt : undefined
                    });
                }
            }
        }

        return roles;
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

        // Clear placeholder when starting
        if (this.transcriptContainer) {
            const placeholder = this.transcriptContainer.querySelector('.transcript-placeholder');
            if (placeholder) placeholder.remove();

            // Should we clear previous transcript? Yes, usually a new session.
            this.transcriptContainer.empty();
            this.fullTranscript = '';
        }

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

        // Check if current selected role has tracking enabled
        const roles = await this.loadRoles();
        const currentRole = roles.find(r => r.prompt === this.selectedRolePrompt);
        const enableScoreTracking = currentRole?.trackLevelAnswer || false;

        this.adapter = new GoogleGeminiLiveAdapter(
            this.apiKey,
            (text) => {
                this.handleTranscription(text);
            },
            (score) => {
                console.log('LiveSessionView: Received score:', score);
                new Notice(`💡 Answer Score: ${score}/10`, 5000);

                if (this.transcriptContainer) {
                    const scoreEl = this.transcriptContainer.createEl('div', {
                        text: `🌟 SCORE: ${score}/10`,
                        cls: 'gemini-score-flag'
                    });
                    // Force high visibility styles
                    scoreEl.style.color = 'gold'; // Hardcoded for visibility test
                    scoreEl.style.backgroundColor = '#333'; // Contrast background
                    scoreEl.style.fontSize = '1.5em';
                    scoreEl.style.fontWeight = 'bold';
                    scoreEl.style.marginTop = '15px';
                    scoreEl.style.marginBottom = '15px';
                    scoreEl.style.border = '2px solid gold';
                    scoreEl.style.padding = '10px';
                    scoreEl.style.textAlign = 'center';
                    scoreEl.style.borderRadius = '8px';

                    console.log('LiveSessionView: Appended score element. Container HTML length:', this.transcriptContainer.innerHTML.length);

                    // Auto-scroll
                    scoreEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

                    // Add score to transcript
                    this.fullTranscript += `\n\n[SCORE: ${score}/10]\n\n`;
                } else {
                    console.error('LiveSessionView: Transcript container is missing!');
                }
            }
        );

        const activeNoteContext = `Contexto de la nota activa:\n${context}`;
        // Prepend role prompt if selected
        const systemInstruction = this.selectedRolePrompt
            ? `${this.selectedRolePrompt}\n\n${activeNoteContext}`
            : activeNoteContext;

        const success = await this.adapter.connect(systemInstruction, enableScoreTracking);

        if (success) {
            this.isSessionActive = true;
            this.updateStatus('🔴 Live - Listening', 'var(--color-red)');

            if (this.sessionBtn) {
                this.sessionBtn.setButtonText('Stop Session');
                this.sessionBtn.removeCta();
                this.sessionBtn.setWarning();
            }

            new Notice('Gemini Live Connected');
            if (enableScoreTracking) {
                new Notice('Answer scoring enabled.');
            }

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

    private handleTranscription(text: string) {
        if (!this.transcriptContainer) return;

        // Simple append for now. Could be fancier with roles but Gemini Live V1 usually just streams text chunks.
        // We might want to deduplicate or handle markdown, but simple text streaming is a good start.
        // To make it look like "streaming", we just append span or text node.

        // Check if we need to add a newline? The chunks might be partial words.
        // Just appending as text node preserves flow.
        this.transcriptContainer.createSpan({ text: text });

        // Auto-scroll
        this.transcriptContainer.scrollTop = this.transcriptContainer.scrollHeight;

        // Accumulate full transcript
        this.fullTranscript += text;
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

        if (this.sessionBtn) {
            this.sessionBtn.setButtonText('Start Session');
            this.sessionBtn.buttonEl.removeClass('mod-warning');
            this.sessionBtn.setCta();
        }

        // Optional: add a separator to transcript
        if (this.transcriptContainer) {
            this.transcriptContainer.createEl('hr');
        }

        // Save transcript to file
        if (this.fullTranscript && this.fullTranscript.trim().length > 0) {
            await this.saveTranscript();
        }
    }

    private async saveTranscript() {
        const date = new Date();
        const timestamp = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}-${date.getMinutes().toString().padStart(2, '0')}-${date.getSeconds().toString().padStart(2, '0')}`;
        const filename = `Gemini Live Session ${timestamp}.md`;

        try {
            const content = `# Gemini Live Session - ${timestamp}\n\n${this.fullTranscript}`;
            await this.app.vault.create(filename, content);
            new Notice(`Transcript saved to: ${filename}`);
        } catch (e) {
            console.error('Error saving transcript', e);
            new Notice('Error saving transcript file.');
        }

        // Reset
        this.fullTranscript = '';
    }

    private updateStatus(text: string, color: string) {
        if (this.statusEl) {
            this.statusEl.textContent = text;
            this.statusEl.style.color = color;
        }
    }
}
