
import { ItemView, WorkspaceLeaf, Notice, TFile, MarkdownView } from 'obsidian';
import { GoogleGeminiLiveAdapter } from '../../Adapters/GoogleGeminiLiveAdapter/GoogleGeminiLiveAdapter';
import { MetadataService } from '../../Services/MetadataService';
import { SessionLogger } from '../../Services/SessionLogger';
import ObsidianExtension from 'src/main';
import { GenerateHeaderMetadataCommand } from '../../../Application/Commands/GenerateHeaderMetadataCommand';
import { showMessage } from 'src/Application/Utils/Messages';

// Services
import { RolesManager, Role } from './LiveSession/Services/RolesManager';
import { ContextManager } from './LiveSession/Services/ContextManager';
import { QuizManager } from './LiveSession/Services/QuizManager';

// Components
import { RolesComponent } from './LiveSession/Components/RolesComponent';
import { QuizComponent } from './LiveSession/Components/QuizComponent';
import { TranscriptComponent } from './LiveSession/Components/TranscriptComponent';
import { SessionControlsComponent } from './LiveSession/Components/SessionControlsComponent';

export const LIVE_SESSION_VIEW_TYPE = 'gemini-live-session-view';

export class LiveSessionView extends ItemView {
    // Config State
    private plugin!: ObsidianExtension;
    private apiKey: string = '';

    // Services
    private sessionLogger: SessionLogger;
    private rolesManager!: RolesManager;
    private contextManager!: ContextManager;
    private quizManager!: QuizManager;
    private adapter: GoogleGeminiLiveAdapter | null = null;

    // Component References
    private transcriptComponent: TranscriptComponent | null = null;
    private rolesComponent: RolesComponent | null = null;
    private quizComponent: QuizComponent | null = null;
    private sessionControlsComponent: SessionControlsComponent | null = null;

    private contentContainer: HTMLElement | null = null;

    // Active Session State
    private isSessionActive: boolean = false;
    private sessionStartTime: Date | null = null;

    // User Selections (State)
    private selectedRolePrompt: string = '';
    private selectedRoleEvaluationPrompt: string = '';
    private selectedVoice: string = 'Aoede';
    private selectedTemperature: number = 1;

    private usePTT: boolean = false;

    // Data
    private availableRoles: Role[] = [];

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
        this.sessionLogger = new SessionLogger(this.app);
        this.contextManager = new ContextManager(this.app);
        this.quizManager = new QuizManager(this.app);
    }

    setPlugin(plugin: ObsidianExtension) {
        this.plugin = plugin;
        this.apiKey = plugin.settings.geminiApiKey;
        this.usePTT = plugin.settings.geminiLivePTT ?? false; // Load from settings
        this.rolesManager = new RolesManager(this.app, this.plugin);
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

        // Refresh view when it becomes active or markdown context changes
        this.registerEvent(this.app.workspace.on('active-leaf-change', async (leaf) => {
            if (leaf) {
                if (leaf.view.getViewType() === LIVE_SESSION_VIEW_TYPE && leaf.view === this) {
                    await this.renderContent();
                } else if (leaf.view instanceof MarkdownView) {
                    // Refresh Quiz Queue silently if using quiz mode
                    if (this.quizManager.queue.length > 0 || this.quizManager.selectedStarLevel !== '1') {
                        // Check if we should auto-refresh or just wait for user interaction?
                        // Original code did buildQuizQueue().
                        await this.quizManager.buildQuizQueue();
                        this.quizComponent?.refreshList(this.quizManager, (i) => this.onQuizSelect(i));
                    }
                }
            }
        }));
    }

    async renderContent() {
        const container = this.contentContainer || this.containerEl.children[1] as HTMLElement;
        container.empty();
        this.contentContainer = container;

        this.contentContainer.createEl('h2', { text: 'Live Session' });

        // Load Roles
        if (this.rolesManager) {
            this.availableRoles = await this.rolesManager.loadRoles();
        }

        // Initialize Defaults if needed
        if (this.availableRoles.length > 0 && !this.selectedRolePrompt) {
            // Only auto-select if no selection (e.g. first load)
            const firstRole = this.availableRoles[0];
            this.applyRoleSettings(firstRole);
        }

        const mainInterface = this.contentContainer.createDiv();

        // 1. Roles Component
        this.rolesComponent = new RolesComponent(this.contentContainer);
        this.rolesComponent.render({
            roles: this.availableRoles,
            selectedRolePrompt: this.selectedRolePrompt,
            selectedVoice: this.selectedVoice,
            selectedTemperature: this.selectedTemperature,
            isSessionActive: this.isSessionActive,
            onRoleChange: (val) => this.handleRoleChange(val),
            onVoiceChange: async (val) => {
                this.selectedVoice = val;
                if (this.isSessionActive) await this.restartSession('voice update');
            },
            onTemperatureChange: async (val) => {
                this.selectedTemperature = val;
                if (this.isSessionActive) await this.restartSession('temperature update');
            },
            onEvalHeaders: () => this.evaluateHeaders(),
            onGenerateMetadata: () => new GenerateHeaderMetadataCommand(this.app).execute(),
            usePTT: this.usePTT,
            onPTTChange: async (val) => {
                this.usePTT = val;
                this.plugin.settings.geminiLivePTT = val;
                await this.plugin.saveSettings();

                // Do NOT call renderContent() here as it clears the transcript.
                // Just update the components that need to change.

                // Update Roles Component checkbox if needed (though it likely triggered this)
                // But definitely update Controls Component to show/hide PTT button
                this.sessionControlsComponent?.updateStatus(
                    this.isSessionActive,
                    '',
                    '',
                    this.usePTT
                );

                showMessage(`Push-to-Talk Mode: ${val ? 'ON' : 'OFF'}`);
            }
        });

        // Toggle visibility of main interface based on role selection
        if (!this.selectedRolePrompt && this.availableRoles.length > 0) {
            // If we have roles but none selected, maybe hide? 
            // Logic in original: "Main Interface (Hidden if no role)"
            // But we just rendered RolesComponent, which IS inside contentContainer.
            // But the REST should be hidden.
            // Let's hide mainInterface.
        } else if (this.availableRoles.length > 0 && !this.selectedRolePrompt) {
            mainInterface.style.display = 'none';
        }

        // 2. Status & Controls Component
        // We put status first
        this.sessionControlsComponent = new SessionControlsComponent(
            mainInterface,
            () => this.handleStartStop(),
            () => this.onMicDown(),
            () => this.onMicUp()
        );
        this.sessionControlsComponent.updateStatus(this.isSessionActive, '', '', this.usePTT);

        // 3. Quiz Component
        this.quizComponent = new QuizComponent(mainInterface);
        this.quizComponent.render({
            quizManager: this.quizManager,
            onStarLevelChange: async (val) => {
                this.quizManager.selectedStarLevel = val;
                await this.quizManager.buildQuizQueue();
                this.quizComponent?.refreshList(this.quizManager, (i) => this.onQuizSelect(i));
            },
            onFilterChange: async (val) => {
                this.quizManager.onlyTitlesWithoutSubtitles = val;
                await this.quizManager.buildQuizQueue();
                this.quizComponent?.refreshList(this.quizManager, (i) => this.onQuizSelect(i));
            },
            onAskNext: () => this.handleAskNext()
        });

        // 4. Transcript Component
        this.transcriptComponent = new TranscriptComponent(mainInterface);
        // If we have history? We don't persist it for now across renders unless we store it.
        // LiveSessionView::fullTranscript logic.
    }

    // --- Logic Handlers ---

    private applyRoleSettings(role: Role) {
        this.selectedRolePrompt = role.prompt;
        this.selectedRoleEvaluationPrompt = role.evaluationPrompt || '';
        this.selectedVoice = role.liveVoice || 'Aoede';
        this.selectedTemperature = role.liveTemperature !== undefined ? role.liveTemperature : 1;
    }

    private async handleRoleChange(rolePrompt: string) {
        this.selectedRolePrompt = rolePrompt;
        const role = this.availableRoles.find(r => r.prompt === rolePrompt);

        let shouldRestart = this.isSessionActive;

        if (role) {
            this.applyRoleSettings(role);
        } else {
            this.selectedRolePrompt = '';
        }

        await this.renderContent();

        if (shouldRestart) {
            await this.restartSession('role change');
        } else if (role) {
            showMessage(`Role applied: ${role.name}`);
        }
    }

    private async handleStartStop() {
        if (this.isSessionActive) {
            await this.stopSession();
        } else {
            await this.startSession();
        }
    }

    private async restartSession(reason: string) {
        showMessage(`Restarting session for ${reason}...`);
        await this.stopSession();
        await this.startSession();
    }

    private async startSession() {
        if (!this.apiKey) {
            showMessage('Gemini API Key is missing via settings.');
            return;
        }

        // Ensure we disconnect any existing adapter/audioContext before creating a new one
        if (this.adapter) {
            console.log('LiveSessionView: Disconnecting existing adapter before restart...');
            this.adapter.disconnect();
            this.adapter = null;
        }

        // Initialize adapter synchronously to capture user gesture for AudioContext
        console.log('LiveSessionView: Instantiating adapter...');
        this.adapter = new GoogleGeminiLiveAdapter(
            this.apiKey,
            (text) => {
                this.transcriptComponent?.appendUserText(text);
            },
            async (score) => {
                console.log('LiveSessionView: Received score:', score);
                await this.sessionLogger.logScore(score);
                showMessage(`💡 Nota: ${score}`);
                this.transcriptComponent?.appendScore(score);

                // Update Metadata
                await this.handleScoreUpdate(score);
            }
        );

        // Explicitly resume audio context (important for iOS)
        console.log('LiveSessionView: Resuming audio...');
        await this.adapter.resumeAudio();
        console.log('LiveSessionView: Audio resumed.');

        this.sessionControlsComponent?.updateStatus(false, 'Connecting...', 'var(--text-normal)');
        this.transcriptComponent?.startSession();

        let context = '';
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile instanceof TFile) {
            try {
                const mainContent = await this.app.vault.read(activeFile);
                context = mainContent; // We might want to just load basics?
                // Original logic: Load active file + Linked notes
                showMessage(`Context loaded from: ${activeFile.basename}`);

                const linkedContent = await this.contextManager.getLinkedFileContent(activeFile);
                if (linkedContent) {
                    context += `\n\n--- CONTENIDO DE NOTAS RELACIONADAS ---\n${linkedContent}`;
                    showMessage(`Loaded content from linked notes.`);
                }
            } catch (e) {
                console.error('Failed to read active file', e);
            }
        }

        // Role config
        const currentRole = this.availableRoles.find(r => r.prompt === this.selectedRolePrompt);
        const enableScoreTracking = currentRole?.trackLevelAnswer || false;

        const systemInstruction = this.selectedRolePrompt;
        const success = await this.adapter.connect(systemInstruction, enableScoreTracking, this.selectedVoice, this.selectedTemperature, this.usePTT);

        if (success) {
            this.isSessionActive = true;
            this.sessionStartTime = new Date();
            await this.sessionLogger.logStart(this.sessionStartTime);
            this.sessionControlsComponent?.updateStatus(true, '', '', this.usePTT);

            showMessage('Live Connected');

            if (enableScoreTracking) showMessage('Answer scoring enabled.');
        } else {
            this.sessionControlsComponent?.updateStatus(false, 'Connection Failed', 'var(--text-error)');
            this.adapter = null;
        }
    }

    private async stopSession() {
        if (this.sessionStartTime) {
            const now = new Date();
            const duration = (now.getTime() - this.sessionStartTime.getTime()) / 60000;
            await this.sessionLogger.logEnd(now, duration);
            this.sessionStartTime = null;
        }

        if (this.adapter) {
            this.adapter.disconnect();
            this.adapter = null;
        }
        this.isSessionActive = false;
        this.sessionControlsComponent?.updateStatus(false, 'Session Ended', 'var(--text-muted)', this.usePTT);
    }

    private onMicDown() {
        if (this.adapter && this.usePTT) {
            this.adapter.setMicState(false); // Unmute
        }
    }

    private onMicUp() {
        if (this.adapter && this.usePTT) {
            this.adapter.setMicState(true); // Mute
            this.adapter.sendTurnComplete();
        }
    }

    // --- Quiz Logic Integration ---

    private async handleAskNext() {
        if (!this.isSessionActive) {
            showMessage('Starting session...');
            await this.startSession();
            if (!this.isSessionActive) return;
        }

        // If queue empty or finished, try to build/rebuild
        if (this.quizManager.queue.length === 0 || !this.quizManager.hasNext()) {
            // Try to build
            // If manual "Next" clicked when finished, maybe reset index?
            if (this.quizManager.queue.length > 0 && !this.quizManager.hasNext()) {
                this.quizComponent?.setStatusText('Nivel completado 🎉');
                return;
            }

            const success = await this.quizManager.buildQuizQueue();
            if (!success) return;
            this.quizComponent?.refreshList(this.quizManager, (i) => this.onQuizSelect(i));
        }

        if (!this.quizManager.hasNext()) {
            this.quizComponent?.setStatusText('Nivel completado 🎉');
            return;
        }

        const item = this.quizManager.getCurrentItem();
        if (!item) return;

        await this.sessionLogger.logQuestion(item.heading);

        const statusText = `Examinando: ${item.heading} (${this.quizManager.currentIndex + 1}/${this.quizManager.queue.length})`;
        this.quizComponent?.setStatusText(statusText);
        this.quizComponent?.refreshList(this.quizManager, (i) => this.onQuizSelect(i)); // Highlights current

        this.transcriptComponent?.appendTopic(item.heading);

        // Fetch linked content specifically for this section
        const activeFile = this.app.workspace.getActiveFile();
        let sectionLinkedContent = '';
        if (activeFile instanceof TFile) {
            sectionLinkedContent = await this.contextManager.getLinkedFileContent(activeFile, item.range);
        }

        const prompt = `Examina al usuario sobre el siguiente contenido:\n\n${item.text}\n\n${sectionLinkedContent ? `--- Temas ---\n${sectionLinkedContent}` : ''}`;
        this.adapter?.sendContextUpdate('Quiz Content', prompt);

        showMessage(`Sent: ${item.heading}`);
    }

    private async onQuizSelect(index: number) {
        this.quizManager.currentIndex = index;
        this.quizComponent?.refreshList(this.quizManager, (i) => this.onQuizSelect(i));
        await this.handleAskNext();
    }

    private async handleScoreUpdate(score: number) {
        // Logic to update metadata if in Quiz Mode
        const currentItem = this.quizManager.getCurrentItem();
        if (currentItem && currentItem.blockId) {
            const activeFile = this.app.workspace.getActiveFile();
            if (activeFile instanceof TFile && activeFile.extension === 'md') {
                const metaService = new MetadataService(this.app);
                const fileMetadata = await metaService.getFileMetadata(activeFile);
                const currentMeta = fileMetadata[currentItem.blockId];
                const oldScore = currentMeta?.score || 0;

                let finalScore = score;
                if (oldScore > 0) {
                    finalScore = (oldScore + score) / 2;
                    finalScore = Math.round(finalScore * 10) / 10;
                }

                await metaService.updateBlockMetadata(activeFile, currentItem.blockId, {
                    score: finalScore
                });
                showMessage(`Score updated: ${oldScore} -> ${finalScore}`);

                // Refresh view using MarkdownView rerender if possible
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (view && view.file === activeFile) {
                    view.previewMode.rerender(true);
                }
            }
        }

        // Advance quiz
        // "Cuando Live haya evaluado la respuesta... se busca el siguiente titulo"
        // Original logic was commented out or delayed.
        // Let's increment index.
        if (this.quizManager.hasNext()) {
            // Wait? or just prep for next? 
            // Ideally we wait for user to say "Next".
            // But let's move index forward so "Next" button knows where we are.
            this.quizManager.next();
            this.quizComponent?.refreshList(this.quizManager, (i) => this.onQuizSelect(i));
        }
    }

    private async evaluateHeaders() {
        if (!this.plugin) return;
        if (!this.selectedRoleEvaluationPrompt) {
            showMessage('Current role has no !!evaluationPrompt defined.');
            return;
        }

        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== 'md') return;

        showMessage('Starting header evaluation...');
        const cache = this.app.metadataCache.getFileCache(activeFile);
        if (!cache || !cache.headings) return;

        const content = await this.app.vault.read(activeFile);
        const lines = content.split('\n');
        let processedCount = 0;

        for (let i = 0; i < cache.headings.length; i++) {
            const heading = cache.headings[i];
            const startLine = heading.position.start.line;
            let endLine = lines.length;
            if (i < cache.headings.length - 1) endLine = cache.headings[i + 1].position.start.line;

            const sectionText = heading.heading + '\n' + lines.slice(startLine + 1, endLine).join('\n');
            const finalPrompt = `${this.selectedRoleEvaluationPrompt}\nAnalyze:\n"${sectionText}"\nRETURN JSON ONLY: { "difficulty": 1-3, "importance": 1-5 }`;

            try {
                const result = await this.plugin.llm.requestJson({ prompt: finalPrompt });
                if (result && typeof result.difficulty === 'number' && typeof result.importance === 'number') {
                    const idMatch = lines[startLine].match(/\^([a-zA-Z0-9-]+)$/);
                    let blockId = idMatch ? idMatch[1] : null;

                    if (blockId) {
                        const metaService = new MetadataService(this.app);
                        await metaService.updateBlockMetadata(activeFile, blockId, {
                            difficulty: result.difficulty,
                            importance: result.importance
                        });
                        processedCount++;
                        showMessage(`Evaluated: ${heading.heading}`);
                    } else {
                        console.warn(`Skipping ${heading.heading} - No block ID.`);
                    }
                }
            } catch (e) {
                console.error('Error evaluating header', e);
            }
        }
        showMessage(`Evaluation complete. Processed ${processedCount} headers.`);
    }

    async onClose() {
        await this.stopSession();
    }
}
