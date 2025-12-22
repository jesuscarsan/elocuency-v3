
import { ItemView, WorkspaceLeaf, Notice, TFile, MarkdownView } from 'obsidian';
import { ObsidianRoleRepository } from '../../../Adapters/ObsidianRoleRepository';
import { ObsidianSettingsAdapter } from '../../../Adapters/ObsidianSettingsAdapter';
import { ObsidianNoteManager } from '../../../Adapters/ObsidianNoteManager';
import { GoogleGeminiLiveAdapter } from '../../../Adapters/GoogleGeminiLiveAdapter/GoogleGeminiLiveAdapter';
import ObsidianExtension from '../../main';
import { GenerateHeaderMetadataCommand } from '../../Commands/GenerateHeaderMetadataCommand';
import { showMessage } from 'src/Infrastructure/Obsidian/Utils/Messages';

// Services
import { MetadataService } from '../../../Services/MetadataService';
import { SessionLogger } from '../../../Services/SessionLogger';
import { HeaderEvaluationService } from '../../../../Application/Services/HeaderEvaluationService';
import { RolesService, Role } from '../../../../Application/Services/RolesService';
import { ContextService } from '../../../Services/ContextService';
import { QuizService } from '../../../../Application/Services/QuizService';

// Components
import { RolesComponent } from '../LiveSession/Components/RolesComponent';
import { QuizComponent } from '../LiveSession/Components/QuizComponent';
import { TranscriptComponent } from '../LiveSession/Components/TranscriptComponent';
import { SessionControlsComponent } from '../LiveSession/Components/SessionControlsComponent';
import { VocabularyComponent } from '../LiveSession/Components/VocabularyComponent';

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
    private selectedVocabularyItems: Set<string> = new Set();

    // UI State Persistence
    private savedTranscriptHtml: string = '';
    private aiTranscriptBuffer: string = '';
    private userTranscriptBuffer: string = '';

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
                    // Always try to refresh when switching to a markdown file
                    await this.quizService.buildQuizQueue();
                    this.quizComponent?.refreshList(this.quizService, (i) => this.onQuizSelect(i));

                }
            }
        }));
    }

    async renderContent() {
        // Save transcript state if it exists
        if (this.transcriptComponent) {
            this.savedTranscriptHtml = this.transcriptComponent.getHtml();
        }

        const container = this.contentContainer || this.containerEl.children[1] as HTMLElement;
        container.empty();
        this.contentContainer = container;

        // Load Roles
        if (this.rolesService) {
            this.availableRoles = await this.rolesService.loadRoles();
        }

        // Initialize Defaults if needed
        if (this.availableRoles.length > 0 && !this.selectedRolePrompt) {
            const firstRole = this.availableRoles[0];
            this.applyRoleSettings(firstRole);
        }

        const mainInterface = this.contentContainer.createDiv();

        // 1. Configuration (Roles) Component
        // Collapsed configuration panel
        this.rolesComponent = new RolesComponent(mainInterface);
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
                this.sessionControlsComponent?.updateStatus(
                    this.isSessionActive,
                    '',
                    '',
                    this.usePTT
                );
                showMessage(`Push-to-Talk Mode: ${val ? 'ON' : 'OFF'}`);
            }
        });

        // 2. Quiz Component (Header Selector)
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
            onAskNext: () => this.handleAskNext(),
            onTopicSelect: (i) => this.onQuizSelect(i)
        });

        // 3. Vocabulary Component
        const vocabComponent = new VocabularyComponent(mainInterface);
        const currentRole = this.availableRoles.find(r => r.prompt === this.selectedRolePrompt);
        if (currentRole && currentRole.vocabularyList) {
            vocabComponent.render(
                currentRole.vocabularyList,
                this.selectedVocabularyItems,
                (item) => this.toggleVocabularyItem(item)
            );
        }

        // 4. Session Controls (Button)
        const controlsContainer = mainInterface.createDiv();
        controlsContainer.style.marginTop = '20px';
        controlsContainer.style.marginBottom = '20px';
        controlsContainer.style.display = 'flex';
        controlsContainer.style.justifyContent = 'center';

        this.sessionControlsComponent = new SessionControlsComponent(
            controlsContainer,
            mainInterface, // PTT container
            () => this.handleStartStop(),
            () => this.onMicDown(),
            () => this.onMicUp()
        );
        this.sessionControlsComponent.updateStatus(this.isSessionActive, '', '', this.usePTT);

        // 5. Transcript Component
        this.transcriptComponent = new TranscriptComponent(mainInterface);
        if (this.savedTranscriptHtml) {
            this.transcriptComponent.setHtml(this.savedTranscriptHtml);
        }
    }

    // --- Logic Handlers ---

    private toggleVocabularyItem(item: string) {
        if (this.selectedVocabularyItems.has(item)) {
            this.selectedVocabularyItems.delete(item);
        } else {
            this.selectedVocabularyItems.add(item);
        }
        // Re-render only this component effectively, or full re-render. 
        // For simplicity, full renderContent call, but verify if it resets other state.
        // renderContent re-creates everything. It preserves state variables like transcript html buffer.
        // It might be jerky. Ideally we just update the component.
        // But since we didn't save the component reference properly (local variable), let's just re-render.
        this.renderContent();
    }

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
            // If we have a selected item in the quiz, we start by asking that.
            if (this.quizService.getCurrentItem()) {
                await this.handleAskNext('', true);
            } else {
                await this.startSession();
            }
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
                this.transcriptComponent?.appendAiText(text);

                // Buffer and log only when sentence completes
                this.aiTranscriptBuffer += text;
                const setenceEndRegex = /([.?!])\s+/;
                const parts = this.aiTranscriptBuffer.split(setenceEndRegex);

                if (parts.length > 1) {
                    // We have at least one complete sentence
                    // split keeps separators. 
                    // E.g. "Hello. How are you" -> ["Hello", ".", "How are you"]

                    // Actually, simpler approach: Check if we have endings.
                    // Let's iterate and extract.
                    // Or just use a simpler heuristic: if text ends with space, and we have punctuation before.

                    let processBuffer = true;
                    while (processBuffer) {
                        const match = this.aiTranscriptBuffer.match(/([^.?!]+[.?!])\s+/);
                        if (match) {
                            const sentence = match[1]; // "Hello."
                            const fullMatch = match[0]; // "Hello. "
                            this.sessionLogger.logTranscript('AI', sentence);
                            this.aiTranscriptBuffer = this.aiTranscriptBuffer.substring(fullMatch.length);
                        } else {
                            processBuffer = false;
                        }
                    }
                }
            },
            async (score) => {
                console.log('LiveSessionView: Received score:', score);
                await this.sessionLogger.logScore(score);
                showMessage(`💡 Nota: ${score}`);
                this.transcriptComponent?.appendScore(score);

                // Update Metadata
                await this.handleScoreUpdate(score);
            },
            (text) => {
                this.transcriptComponent?.appendUserText(text);

                // Buffer and log only when sentence completes (User text usually comes as whole phrasing but better safe)
                this.userTranscriptBuffer += text;
                let processBuffer = true;
                while (processBuffer) {
                    const match = this.userTranscriptBuffer.match(/([^.?!]+[.?!])\s*/);
                    if (match) {
                        const sentence = match[1];
                        const fullMatch = match[0];
                        this.sessionLogger.logTranscript('User', sentence);
                        this.userTranscriptBuffer = this.userTranscriptBuffer.substring(fullMatch.length);
                    } else {
                        // For user, sometimes it doesn't end with punctuation if it is a short command.
                        // Ideally we flush on turn complete. 
                        // But for now, let's just log if it's long enough or has pause?
                        // Actually, user transcript from Google usually comes as a 'transcript' blob, possibly full?
                        // If it comes as chunks, same logic applies.
                        // If it doesn't have punctuation, we might lose it?
                        // Let's add a timeout or just wait.
                        processBuffer = false;
                    }
                }
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
                    context += `\n\n--- NOTAS RELACIONADAS ---\n${linkedContent}`;
                    showMessage(`Loaded content from linked notes.`);
                }
            } catch (e) {
                console.error('Failed to read active file', e);
            }
        }

        // Role config
        const currentRole = this.availableRoles.find(r => r.prompt === this.selectedRolePrompt);
        const enableScoreTracking = currentRole?.trackLevelAnswer || false;

        let systemInstruction = this.selectedRolePrompt;

        // Inject Vocabulary Context


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

    // --- Vocabulary Logic ---

    private async getVocabularyContext(): Promise<string> {
        if (this.selectedVocabularyItems.size === 0) return '';

        let vocabContext = '';
        console.log('LiveSessionView: Injecting vocabulary context...', this.selectedVocabularyItems);

        const activeFile = this.app.workspace.getActiveFile();
        const resolvedPath = activeFile?.path || '';

        for (const item of this.selectedVocabularyItems) {
            // Clean item string (remove [[ ]])
            const cleanItem = item.replace(/^\[\[|\]\]$/g, '');

            // Try to find file by name
            let file = this.app.metadataCache.getFirstLinkpathDest(cleanItem, resolvedPath);

            // Fallback: Try from root if not found relative
            if (!file) {
                file = this.app.metadataCache.getFirstLinkpathDest(cleanItem, '');
            }

            // Fallback: fuzzy match basename if still not found
            if (!file) {
                file = this.app.vault.getFiles().find(f => f.basename === cleanItem) || null;
            }

            console.log(`LiveSessionView: Resolving "${item}" (clean: "${cleanItem}") -> found:`, file);

            if (file && file instanceof TFile && file.extension === 'md') {
                try {
                    const content = await this.app.vault.read(file);
                    vocabContext += `\n-- VOCABULARIO que debes utilizar en la pregunta: ---- \n${cleanItem}\n${content}\n`;
                } catch (e) {
                    console.warn(`Failed to read vocabulary note: ${cleanItem}`, e);
                }
            } else {
                console.warn(`LiveSessionView: Could not find note for vocabulary item: "${item}"`);
                showMessage(`Warning: Could not find note "${cleanItem}"`);
            }
        }

        return vocabContext;
    }

    // --- Quiz Logic Integration ---

    private async handleAskNext(message: string = '', forceStart: boolean = false) {
        if (!this.isSessionActive || forceStart) {
            if (!this.isSessionActive) {
                showMessage('Starting session...');
                await this.startSession();
                if (!this.isSessionActive) return;
            }
        }

        // If queue empty or finished, try to build/rebuild
        // If we are selecting a specific index (via onQuizSelect), we assume it's valid.
        if (this.quizService.queue.length === 0) {
            const success = await this.quizService.buildQuizQueue();
            if (!success) {
                this.quizComponent?.setStatusText('No hay temas para preguntar.');
                return;
            }
            this.quizComponent?.refreshList(this.quizService, (i) => this.onQuizSelect(i));
        }

        const item = this.quizService.getCurrentItem();
        if (!item) return;

        await this.sessionLogger.logQuestion(item.heading);

        const statusText = `Examinando: ${item.heading}`;
        this.quizComponent?.setStatusText(statusText);
        // Refresh list to highlight current
        this.quizComponent?.refreshList(this.quizService, (i) => this.onQuizSelect(i));

        this.transcriptComponent?.appendTopic(item.heading);

        let prompt = await this.quizService.generateQuestionPrompt();
        if (!prompt) return;

        // Inject Vocabulary
        const vocabContext = await this.getVocabularyContext();
        if (vocabContext) {
            prompt += `\n\n# Contextual Knowledge\n${vocabContext}`;
            showMessage(`Injected context from ${this.selectedVocabularyItems.size} vocabulary notes.`);
        }

        // Ensure we send context update
        this.adapter?.sendContextUpdate('Quiz Content', prompt);

        showMessage(`Sent: ${item.heading}`);
    }

    private async onQuizSelect(index: number) {
        this.quizService.currentIndex = index;
        this.quizComponent?.refreshList(this.quizService, (i) => this.onQuizSelect(i));
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
