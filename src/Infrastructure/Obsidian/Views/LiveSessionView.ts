
import { ItemView, WorkspaceLeaf, Notice, TFile, MarkdownView } from 'obsidian';
import { ObsidianRoleRepository } from '../../Adapters/ObsidianRoleRepository';
import { ObsidianSettingsAdapter } from '../../Adapters/ObsidianSettingsAdapter';
import { ObsidianNoteManager } from '../../Adapters/ObsidianNoteManager';
import { GoogleGeminiLiveAdapter } from '../../Adapters/GoogleGeminiLiveAdapter/GoogleGeminiLiveAdapter';
import ObsidianExtension from '../main';
import { GenerateHeaderMetadataCommand } from '../Commands/GenerateHeaderMetadataCommand';
import { showMessage } from 'src/Infrastructure/Obsidian/Utils/Messages';

// Services
import { MetadataService } from '../../Services/MetadataService';
import { SessionLogger } from '../../Services/SessionLogger';
import { HeaderEvaluationService } from '../../../Application/Services/HeaderEvaluationService';
import { RolesService, Role } from '../../../Application/Services/RolesService';
import { ContextService } from '../../Services/ContextService';
import { QuizService } from '../../../Application/Services/QuizService';

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
    private rolesService!: RolesService;
    private contextService!: ContextService;
    private quizService!: QuizService;
    private headerEvaluationService!: HeaderEvaluationService;
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
        this.contextService = new ContextService(this.app);
        const noteManager = new ObsidianNoteManager(this.app);
        const metadataService = new MetadataService(this.app);
        this.quizService = new QuizService(noteManager, this.contextService, metadataService);
    }

    setPlugin(plugin: ObsidianExtension) {
        this.plugin = plugin;
        this.apiKey = plugin.settings.geminiApiKey;
        this.usePTT = plugin.settings.geminiLivePTT ?? false; // Load from settings

        const settingsAdapter = new ObsidianSettingsAdapter(this.plugin);
        const roleRepo = new ObsidianRoleRepository(this.app, settingsAdapter);
        this.rolesService = new RolesService(roleRepo);

        // QuizService needs NoteManager and ContextProvider and MetadataPort
        const noteManager = new ObsidianNoteManager(this.app);
        const metadataService = new MetadataService(this.app);
        this.quizService = new QuizService(noteManager, this.contextService, metadataService);
        // HeaderEvaluationService
        this.headerEvaluationService = new HeaderEvaluationService(this.plugin.llm, noteManager);
    }

    // ...


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
                    if (this.quizService.queue.length > 0 || this.quizService.selectedStarLevel !== '1') {
                        // Check if we should auto-refresh or just wait for user interaction?
                        // Original code did buildQuizQueue().
                        await this.quizService.buildQuizQueue();
                        this.quizComponent?.refreshList(this.quizService, (i) => this.onQuizSelect(i));
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
        if (this.rolesService) {
            this.availableRoles = await this.rolesService.loadRoles();
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
            quizService: this.quizService,
            onStarLevelChange: async (val) => {
                this.quizService.selectedStarLevel = val;
                await this.quizService.buildQuizQueue();
                this.quizComponent?.refreshList(this.quizService, (i) => this.onQuizSelect(i));
            },
            onFilterChange: async (val) => {
                this.quizService.onlyTitlesWithoutSubtitles = val;
                await this.quizService.buildQuizQueue();
                this.quizComponent?.refreshList(this.quizService, (i) => this.onQuizSelect(i));
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

                const linkedContent = await this.contextService.getLinkedFileContent(activeFile.path);
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
        if (this.quizService.queue.length === 0 || !this.quizService.hasNext()) {
            // Try to build
            // If manual "Next" clicked when finished, maybe reset index?
            if (this.quizService.queue.length > 0 && !this.quizService.hasNext()) {
                this.quizComponent?.setStatusText('Nivel completado 🎉');
                return;
            }

            const success = await this.quizService.buildQuizQueue();
            if (!success) return;
            this.quizComponent?.refreshList(this.quizService, (i) => this.onQuizSelect(i));
        }

        if (!this.quizService.hasNext()) {
            this.quizComponent?.setStatusText('Nivel completado 🎉');
            return;
        }

        const item = this.quizService.getCurrentItem();
        if (!item) return;

        await this.sessionLogger.logQuestion(item.heading);

        const statusText = `Examinando: ${item.heading} (${this.quizService.currentIndex + 1}/${this.quizService.queue.length})`;
        this.quizComponent?.setStatusText(statusText);
        this.quizComponent?.refreshList(this.quizService, (i) => this.onQuizSelect(i)); // Highlights current

        this.transcriptComponent?.appendTopic(item.heading);

        const prompt = await this.quizService.generateQuestionPrompt();
        if (!prompt) return;

        this.adapter?.sendContextUpdate('Quiz Content', prompt);

        showMessage(`Sent: ${item.heading}`);
    }

    private async onQuizSelect(index: number) {
        this.quizService.currentIndex = index;
        this.quizComponent?.refreshList(this.quizService, (i) => this.onQuizSelect(i));
        await this.handleAskNext();
    }

    private async handleScoreUpdate(score: number) {
        // Logic to update metadata if in Quiz Mode
        const currentItem = this.quizService.getCurrentItem();
        if (!currentItem) return;

        const oldScore = await this.quizService.recordBlockScore(currentItem, score);
        if (oldScore !== null) {
            showMessage(`Score updated: ${oldScore}`);
            // Ideally we want to show old -> new, but recordBlockScore returns final.
            // That is sufficient.
        }

        // Refresh view using MarkdownView rerender if possible
        const activeFile = this.app.workspace.getActiveFile();
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view && view.file === activeFile) {
            // view.previewMode.rerender(true); // Preview mode
            // For live preview, we might not need to force rerender if metadata is sidecar
            // But if we want to show it in the Note... Sidecar updates don't trigger View updates automatically usually.
        }

        // Advance quiz
        if (this.quizService.hasNext()) {
            this.quizService.next();
            this.quizComponent?.refreshList(this.quizService, (i) => this.onQuizSelect(i));
        }
    }


    private async evaluateHeaders() {
        if (!this.headerEvaluationService) return;
        if (!this.selectedRoleEvaluationPrompt) {
            showMessage('Current role has no !!evaluationPrompt defined.');
            return;
        }

        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== 'md') return;

        showMessage('Starting header evaluation...');
        try {
            const result = await this.headerEvaluationService.evaluateHeaders(activeFile.path, this.selectedRoleEvaluationPrompt);
            showMessage(`Evaluation complete. Processed ${result.processed} headers.`);
        } catch (e) {
            console.error('Error evaluating headers:', e);
            showMessage(`Error during evaluation: ${e}`);
        }
    }

    async onClose() {
        await this.stopSession();
    }
}
