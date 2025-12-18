import { ItemView, WorkspaceLeaf, ButtonComponent, Notice, setIcon, TFile, DropdownComponent, TFolder } from 'obsidian';
import { GoogleGeminiLiveAdapter } from '../../Adapters/GoogleGeminiLiveAdapter/GoogleGeminiLiveAdapter';
import { MetadataService } from '../../Services/MetadataService';
import { ScoreUtils } from '../../../Domain/Utils/ScoreUtils';
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

    // Quiz Mode State
    private selectedStarLevel: string = '1';
    private quizQueue: { heading: string, blockId: string, text: string }[] = [];
    private currentQuizIndex: number = 0;
    private quizStatusEl: HTMLElement | null = null;
    private currentQuizStatusText: string = 'Presiona "Preguntar siguiente" para comenzar.'; // State for persistence

    // Config State
    private selectedVoice: string = 'Aoede';
    private selectedTemperature: number = 1;

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
        return 'Live';
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

        this.contentContainer.createEl('h2', { text: 'Live Session' });

        // Wrapper for "The Rest" (Status, Transcript, Controls, Quiz)
        const mainInterface = this.contentContainer.createDiv();

        // --- Roles Section ---
        if (this.plugin && this.plugin.settings.geminiRolesFolder) {
            const rolesContainer = this.contentContainer.createDiv({ cls: 'gemini-roles-container' });
            rolesContainer.style.marginTop = '20px';
            rolesContainer.style.marginBottom = '20px';
            rolesContainer.style.display = 'flex';
            rolesContainer.style.flexDirection = 'column';
            rolesContainer.style.gap = '10px';
            rolesContainer.style.border = '1px solid var(--background-modifier-border)';
            rolesContainer.style.padding = '10px';
            rolesContainer.style.borderRadius = '4px';

            // Role Selector Row
            const roleRow = rolesContainer.createDiv();
            roleRow.style.display = 'flex';
            roleRow.style.alignItems = 'center';
            roleRow.style.gap = '10px';

            roleRow.createSpan({ text: 'Role:' });

            const roles = await this.loadRoles();

            if (roles.length === 0) {
                roleRow.createSpan({ text: '(No roles found in folder)', cls: 'gemini-muted-text' });
            } else {
                const dropdown = new DropdownComponent(roleRow);
                dropdown.addOption('', 'Default (None)');
                roles.forEach(role => dropdown.addOption(role.prompt, role.name));

                // Set initial value if matches
                if (this.selectedRolePrompt) {
                    const exists = roles.find(r => r.prompt === this.selectedRolePrompt);
                    if (exists) {
                        dropdown.setValue(this.selectedRolePrompt);
                    } else {
                        this.selectedRolePrompt = '';
                    }
                }

                dropdown.onChange((value) => {
                    this.selectedRolePrompt = value;
                    const selectedRole = roles.find(r => r.prompt === value);
                    this.selectedRoleEvaluationPrompt = selectedRole?.evaluationPrompt || '';

                    // Toggle visibility immediately on change
                    if (value) {
                        mainInterface.style.display = 'block';
                    } else {
                        mainInterface.style.display = 'none';
                    }
                });

                new ButtonComponent(roleRow)
                    .setButtonText('Apply Role')
                    .setTooltip('Apply selected role (restarts session if active)')
                    .onClick(async () => {
                        if (this.isSessionActive) {
                            new Notice('Applying role... restarting session.');
                            await this.stopSession();
                            await this.startSession();
                        } else {
                            if (this.selectedRolePrompt) {
                                new Notice(`Role applied: ${roles.find(r => r.prompt === this.selectedRolePrompt)?.name}`);
                            } else {
                                new Notice('No role selected.');
                            }
                        }
                    });

                // Evaluation Button
                new ButtonComponent(roleRow)
                    .setButtonText('Eval Headers')
                    .setTooltip('Batchevaluation of headers')
                    .onClick(async () => {
                        if (!this.selectedRoleEvaluationPrompt) {
                            new Notice('Current role has no !!evaluationPrompt defined.');
                            return;
                        }
                        await this.evaluateHeaders();
                    });
            }

            // --- Voice & Temp Config Row ---
            const configRow = rolesContainer.createDiv();
            configRow.style.display = 'flex';
            configRow.style.alignItems = 'center';
            configRow.style.gap = '15px';
            configRow.style.marginTop = '10px';
            configRow.style.flexWrap = 'wrap';

            // Voice Dropdown
            configRow.createSpan({ text: 'Voz:' });
            const voiceDropdown = new DropdownComponent(configRow);
            ['Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede'].forEach(voice => {
                voiceDropdown.addOption(voice, voice);
            });
            voiceDropdown.setValue(this.selectedVoice);
            voiceDropdown.onChange(async (val) => {
                this.selectedVoice = val;
                if (this.isSessionActive) {
                    new Notice('Reiniciando sesión para aplicar nueva voz...');
                    await this.stopSession();
                    await this.startSession();
                }
            });

            // Temperature Slider
            const tempContainer = configRow.createDiv();
            tempContainer.style.display = 'flex';
            tempContainer.style.alignItems = 'center';
            tempContainer.style.gap = '5px';

            tempContainer.createSpan({ text: 'Temp:' });
            const tempValLabel = tempContainer.createSpan({ text: this.selectedTemperature.toFixed(1) });

            const tempSlider = document.createElement('input');
            tempSlider.type = 'range';
            tempSlider.min = '0';
            tempSlider.max = '2';
            tempSlider.step = '0.1';
            tempSlider.value = this.selectedTemperature.toString();
            tempSlider.style.width = '80px';

            tempSlider.addEventListener('change', async (e) => {
                const val = parseFloat((e.target as HTMLInputElement).value);
                this.selectedTemperature = val;
                tempValLabel.textContent = val.toFixed(1);
                if (this.isSessionActive) {
                    new Notice('Reiniciando sesión para aplicar temperatura...');
                    await this.stopSession();
                    await this.startSession();
                }
            });
            // Update label while dragging
            tempSlider.addEventListener('input', (e) => {
                tempValLabel.textContent = parseFloat((e.target as HTMLInputElement).value).toFixed(1);
            });

            tempContainer.appendChild(tempSlider);
        }

        // --- Main Interface (Hidden if no role) ---
        if (!this.selectedRolePrompt) {
            mainInterface.style.display = 'none';
        }

        // 1. Status
        this.statusEl = mainInterface.createEl('div', {
            text: this.isSessionActive ? '🔴 Live - Listening' : 'Ready to connect',
            cls: 'gemini-live-status'
        });
        this.statusEl.style.marginBottom = '20px';
        this.statusEl.style.color = this.isSessionActive ? 'var(--color-red)' : 'var(--text-muted)';


        // 2. Quiz Section
        const quizContainer = mainInterface.createDiv({ cls: 'gemini-quiz-container' });
        quizContainer.style.marginBottom = '20px';
        quizContainer.style.padding = '10px';
        quizContainer.style.border = '1px solid var(--background-modifier-border)';
        quizContainer.style.borderRadius = '4px';

        quizContainer.createEl('h4', { text: 'Quiz Mode' });
        quizContainer.querySelector('h4')!.style.marginTop = '0';

        const quizControls = quizContainer.createDiv();
        quizControls.style.display = 'flex';
        quizControls.style.gap = '10px';
        quizControls.style.alignItems = 'center';
        quizControls.style.flexWrap = 'wrap';

        // Star Level Dropdown
        quizControls.createSpan({ text: 'Relevancia:' });
        const starDropdown = new DropdownComponent(quizControls);
        ['1', '2', '3', '4', '5'].forEach(level => starDropdown.addOption(level, `⭐`.repeat(Number(level))));
        starDropdown.setValue(this.selectedStarLevel);
        starDropdown.onChange((val) => {
            this.selectedStarLevel = val;
            console.log('Selected Star Level:', this.selectedStarLevel);
            // Reset queue to force rebuild with new filter level
            this.quizQueue = [];
            this.currentQuizIndex = 0;
            this.updateQuizStatus(`Filtro actualizado a ⭐${val}+. Presiona "Preguntar siguiente".`);
        });

        // "Ask Next" Button
        new ButtonComponent(quizControls)
            .setButtonText('Preguntar siguiente')
            .setTooltip('Start/Continue Quiz for this level')
            .onClick(async () => {
                await this.askNextHeader();
            });

        // Quiz Status Label
        this.quizStatusEl = quizContainer.createDiv({ cls: 'gemini-quiz-status' });
        this.quizStatusEl.style.marginTop = '15px';
        this.quizStatusEl.style.padding = '10px';
        this.quizStatusEl.style.backgroundColor = 'var(--background-secondary)';
        this.quizStatusEl.style.borderRadius = '4px';
        this.quizStatusEl.style.fontSize = '1.1em';
        this.quizStatusEl.style.fontWeight = 'bold';
        this.quizStatusEl.style.color = 'var(--text-normal)';
        this.quizStatusEl.style.borderLeft = '4px solid var(--text-accent)';
        this.quizStatusEl.innerText = this.currentQuizStatusText;


        // 3. Transcript Area
        this.transcriptContainer = mainInterface.createDiv({ cls: 'gemini-live-transcript' });
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


        // 4. Session Controls
        const controls = mainInterface.createEl('div', { cls: 'gemini-live-controls' });

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
              "importance": <integer 0-10>
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

                // QUIZ AUTO-ADVANCE
                if (this.quizQueue.length > 0) {
                    // We just finished this item.
                    // The requirement: "Cuando Live haya evaluado la respuesta... se busca el siguiente titulo"
                    this.currentQuizIndex++;

                    // Small delay to let the user see the score? 
                    // Or instant? Let's do instant or 2 seconds.
                    setTimeout(() => {
                        this.askNextHeader();
                    }, 2000);
                }
            }
        );

        const activeNoteContext = `Contexto de la nota activa:\n${context}`;
        // Prepend role prompt if selected
        const systemInstruction = this.selectedRolePrompt
            ? `${this.selectedRolePrompt}\n\n${activeNoteContext}`
            : activeNoteContext;

        const success = await this.adapter.connect(systemInstruction, enableScoreTracking, this.selectedVoice, this.selectedTemperature);

        if (success) {
            this.isSessionActive = true;
            this.updateStatus('🔴 Live - Listening', 'var(--color-red)');

            if (this.sessionBtn) {
                this.sessionBtn.setButtonText('Stop Session');
                this.sessionBtn.removeCta();
                this.sessionBtn.setWarning();
            }

            new Notice('Live Connected');
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

        // Simple append for now. Could be fancier with roles but Live usually just streams text chunks.
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
        const filename = `Live Session ${timestamp}.md`;

        try {
            const content = `# Live Session - ${timestamp}\n\n${this.fullTranscript}`;
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

    // --- Quiz Logic ---

    private async buildQuizQueue(): Promise<boolean> {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== 'md') {
            new Notice('Open a markdown file to start quiz.');
            return false;
        }

        const content = await this.app.vault.read(activeFile);
        const lines = content.split('\n');

        // Use MetadataService to get sidecar data
        const metaService = new MetadataService(this.app);
        const metadata = await metaService.getFileMetadata(activeFile);

        const queue: { heading: string, blockId: string, text: string }[] = [];
        const requiredLevel = parseInt(this.selectedStarLevel) || 1;

        // Naive header parsing similar to evaluateHeaders
        // Iterate lines
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const headerMatch = line.match(/^(#{1,6})\s+(.*)/);
            if (headerMatch) {
                const headingText = headerMatch[2].trim(); // Raw text often contains block ID? 
                // Actually regex above captures everything. 
                // We should separate blockId if present

                // Check block ID
                const idMatch = line.match(/\^([a-zA-Z0-9-]+)$/);
                const blockId = idMatch ? idMatch[1] : null;

                if (blockId && metadata[blockId]) {
                    const importance = metadata[blockId].importance;
                    if (typeof importance === 'number' && ScoreUtils.importanceToStars(importance) >= requiredLevel) {
                        // Found a candidate!
                        // Extract content until next header
                        let endLine = lines.length;
                        for (let j = i + 1; j < lines.length; j++) {
                            if (lines[j].match(/^(#{1,6})\s+/)) {
                                endLine = j;
                                break;
                            }
                        }
                        const sectionContent = lines.slice(i, endLine).join('\n');
                        queue.push({
                            heading: headingText.replace(/\^([a-zA-Z0-9-]+)$/, '').trim(),
                            blockId: blockId,
                            text: sectionContent
                        });
                    }
                }
            }
        }


        this.quizQueue = queue;
        this.currentQuizIndex = 0;

        if (this.quizQueue.length === 0) {
            new Notice(`No headers found with Importance >= ${requiredLevel}`);
            this.updateQuizStatus('No matching headers found.');
            return false;
        }

        new Notice(`Quiz Queue: ${this.quizQueue.length} headers found.`);
        return true;
    }

    private async askNextHeader() {
        if (!this.isSessionActive) {
            new Notice('Starting session...');
            await this.startSession();
            // Wait a small moment for connection? startSession is async so it should be connected if it returns.
            if (!this.isSessionActive) return; // Connection failed
        }

        // If queue empty or finished, try to build/rebuild
        if (this.quizQueue.length === 0 || this.currentQuizIndex >= this.quizQueue.length) {
            // Only rebuild if empty. If finished, maybe reset?
            if (this.currentQuizIndex > 0 && this.currentQuizIndex >= this.quizQueue.length) {
                // Already finished
                this.updateQuizStatus('Nivel completado 🎉');
                return;
            }

            const success = await this.buildQuizQueue();
            if (!success) return;
        }

        // Check again (paranoia)
        if (this.currentQuizIndex >= this.quizQueue.length) {
            this.updateQuizStatus('Nivel completado 🎉');
            return;
        }

        const item = this.quizQueue[this.currentQuizIndex];

        const statusText = `Examinando: ${item.heading} (${this.currentQuizIndex + 1}/${this.quizQueue.length})`;
        this.updateQuizStatus(statusText);

        // LOG TO VIDEO-STYLE TRANSCRIPT FOR VISIBILITY
        if (this.transcriptContainer) {
            const topicEl = this.transcriptContainer.createEl('div', {
                text: `📝 PREGUNTA: ${item.heading}`,
                cls: 'gemini-quiz-topic'
            });
            topicEl.style.backgroundColor = 'var(--interactive-accent)';
            topicEl.style.color = 'var(--text-on-accent)';
            topicEl.style.padding = '10px';
            topicEl.style.borderRadius = '8px';
            topicEl.style.marginTop = '15px';
            topicEl.style.marginBottom = '15px';
            topicEl.style.textAlign = 'center';
            topicEl.style.fontWeight = 'bold';

            topicEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Add score to transcript text buffer so it's saved
            this.fullTranscript += `\n\n[PREGUNTA: ${item.heading}]\n\n`;
        }

        this.adapter?.sendContextUpdate('Quiz Content', `Por favor examina al usuario sobre el siguiente contenido:\n\n${item.text}`);

        new Notice(`Sent: ${item.heading}`);
    }

    private updateQuizStatus(text: string) {
        this.currentQuizStatusText = text; // Persist
        if (this.quizStatusEl) {
            this.quizStatusEl.textContent = text;
        }
    }
}
