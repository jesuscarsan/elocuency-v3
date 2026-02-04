import { ItemView, WorkspaceLeaf, Notice, TFile, MarkdownView } from 'obsidian';
import { ObsidianRoleRepository } from '@/Infrastructure/Adapters/ObsidianRoleRepository';
import { ObsidianSettingsAdapter } from '@/Infrastructure/Adapters/ObsidianSettingsAdapter';
import { ObsidianNoteManager } from '@/Infrastructure/Adapters/ObsidianNoteManager';
import { GoogleGeminiLiveAdapter } from '@/Infrastructure/Adapters/GoogleGeminiLiveAdapter/GoogleGeminiLiveAdapter';
import { GoogleGeminiChatAdapter, IGeminiSessionAdapter } from '@elo/core';
import ObsidianExtension from '@/Infrastructure/Obsidian/main';
import { GenerateHeaderMetadataCommand } from '@/Infrastructure/Obsidian/Commands';
import { showMessage } from '@/Infrastructure/Obsidian/Utils/Messages';

// Services
import { MetadataService } from '@/Infrastructure/Services/MetadataService';
import { SessionLogger } from '@/Infrastructure/Services/SessionLogger';
import { HeaderEvaluationService } from '@/Application/Services/HeaderEvaluationService';
import { RolesService, Role } from '@/Application/Services/RolesService';
import { ContextService } from '@/Infrastructure/Services/ContextService';
import { QuizService } from '@/Application/Services/QuizService';

// Components
import { RolesComponent } from '@/Infrastructure/Obsidian/Views/Chat/Components/RolesComponent';
import { QuizComponent } from '@/Infrastructure/Obsidian/Views/Chat/Components/QuizComponent';
import { TranscriptComponent } from '@/Infrastructure/Obsidian/Views/Chat/Components/TranscriptComponent';
import { SessionControlsComponent } from '@/Infrastructure/Obsidian/Views/Chat/Components/SessionControlsComponent';
import { VocabularyComponent } from '@/Infrastructure/Obsidian/Views/Chat/Components/VocabularyComponent';
import { ChatInputComponent } from '@/Infrastructure/Obsidian/Views/Chat/Components/ChatInputComponent';

export const VIEW_TYPE_CHAT = 'gemini-live-session-view';

export class ChatView extends ItemView {
    // =========================================================================================
    // Properties
    // =========================================================================================

    // --- Configuration State ---
    private plugin!: ObsidianExtension;
    private apiKey: string = '';


    private liveMode: 'gemini_live_voice_text' | 'gemini_live_voice_only' | 'local_voice_text' | 'local_voice_only' | 'text_only' = 'gemini_live_voice_text';
    private liveUserMode: 'voice_text' | 'text_only' | 'voice_only' = 'voice_text';

    // --- Services ---
    private sessionLogger: SessionLogger;
    private rolesService!: RolesService;
    private contextService!: ContextService;
    private quizService!: QuizService;
    private headerEvaluationService!: HeaderEvaluationService;

    private adapter: IGeminiSessionAdapter | null = null;

    // --- Components ---
    private transcriptComponent: TranscriptComponent | null = null;
    private rolesComponent: RolesComponent | null = null;
    private quizComponent: QuizComponent | null = null;
    private chatInputComponent: ChatInputComponent | null = null;
    private sessionControlsComponent: SessionControlsComponent | null = null;

    // --- UI Elements ---
    private contentContainer: HTMLElement | null = null;
    private configTabBtn: HTMLElement | null = null;
    private chatTabBtn: HTMLElement | null = null;
    private quizTabBtn: HTMLElement | null = null; // New Quiz Tab Button
    private configContentDiv: HTMLElement | null = null;
    private chatContentDiv: HTMLElement | null = null;
    private quizContentDiv: HTMLElement | null = null; // New Quiz Content Div
    private chatStopButton: HTMLElement | null = null;

    // --- State ---
    private activeTab: 'config' | 'chat' | 'quiz' = 'config';
    private isSessionActive: boolean = false;
    private sessionStartTime: Date | null = null;
    private originalSidebarSize: number | null = null;

    // User Selections
    private selectedRolePrompt: string = '';
    private selectedRoleEvaluationPrompt: string = '';
    private selectedVoice: string = 'Aoede';
    private selectedLocalVoice: string = ''; // New Local Voice
    private selectedTemperature: number = 1;
    private selectedTopP: number = 0.95;

    // Data
    private availableRoles: Role[] = [];
    private selectedVocabularyItems: Set<string> = new Set();

    // UI Persistence
    private savedTranscriptHtml: string = '';
    private aiTranscriptBuffer: string = '';
    private userTranscriptBuffer: string = '';

    // =========================================================================================
    // Lifecycle
    // =========================================================================================

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

        this.liveMode = plugin.settings.geminiLiveMode ?? 'gemini_live_voice_text';
        this.liveUserMode = plugin.settings.geminiLiveUserMode ?? 'voice_text';
        this.selectedLocalVoice = plugin.settings.geminiLiveLocalVoice ?? '';

        // Load saved role if not already selected
        if (!this.selectedRolePrompt && plugin.settings.geminiLiveRole) {
            // We can't fully validate it against availableRoles yet as they might not be loaded,
            // but we'll store it in the persistence var or check it in renderContent.
            // Best place is actually in renderContent where roles are loaded.
            // But we can preemptively set it here if we want, but let's leave it for renderContent logic
            // to ensure the role actually exists.
        }

        const settingsAdapter = new ObsidianSettingsAdapter(this.plugin);
        const roleRepo = new ObsidianRoleRepository(this.app, settingsAdapter);
        this.rolesService = new RolesService(roleRepo);

        // Re-init services that depend on full app/plugin if needed (normally constructor is fine)
        const noteManager = new ObsidianNoteManager(this.app);
        this.headerEvaluationService = new HeaderEvaluationService(this.plugin.llm, noteManager);
    }

    setApiKey(key: string) {
        this.apiKey = key;
    }

    getViewType() {
        return VIEW_TYPE_CHAT;
    }

    getDisplayText() {
        return 'Chat Session';
    }

    async onOpen() {
        await this.renderContent();

        // Refresh view when it becomes active or markdown context changes
        this.registerEvent(this.app.workspace.on('active-leaf-change', async (leaf) => {
            if (leaf) {
                if (leaf.view.getViewType() === VIEW_TYPE_CHAT && leaf.view === this) {
                    // await this.renderContent(); // This line is part of the old LiveSessionView logic
                } else if (leaf.view instanceof MarkdownView) {
                    // Silent Queue Refresh
                    await this.quizService.buildQuizQueue();
                    this.quizComponent?.refreshList(this.quizService, (i) => this.onQuizSelect(i));
                }
            }
        }));
    }

    async onClose() {
        await this.stopSession();
        this.toggleMaximize(false);
    }

    // =========================================================================================
    // Rendering
    // =========================================================================================

    async renderContent() {
        // Save transcript state
        if (this.transcriptComponent) {
            this.savedTranscriptHtml = this.transcriptComponent.getHtml();
        }

        const container = this.contentContainer || (this.containerEl.children[1] as HTMLElement);
        container.empty();
        this.contentContainer = container;

        // Load Roles
        if (this.rolesService) {
            this.availableRoles = await this.rolesService.loadRoles();
        }

        // Initialize Defaults / Restore Selection
        if (this.availableRoles.length > 0) {
            // 1. Try to restore from session state (already set)
            // 2. Try to restore from settings
            if (!this.selectedRolePrompt && this.plugin.settings.geminiLiveRole) {
                const savedRole = this.availableRoles.find(r => r.name === this.plugin.settings.geminiLiveRole || r.prompt === this.plugin.settings.geminiLiveRole);
                // We save the NAME in settings usually for readability, but let's check both or prompt?
                // Let's decide to save the PROMPT as it's the unique ID for now, or Name if unique.
                // The previous code used prompt as ID. Let's stick to prompt for internal logic, 
                // but maybe settings should save prompt too.

                // Let's assume we save the prompt in settings for precision.
                const roleByPrompt = this.availableRoles.find(r => r.prompt === this.plugin.settings.geminiLiveRole);
                if (roleByPrompt) {
                    this.applyRoleSettings(roleByPrompt);
                }
            }

            // 3. Fallback to first role if still nothing
            if (!this.selectedRolePrompt) {
                const firstRole = this.availableRoles[0];
                this.applyRoleSettings(firstRole);
                // Also save this default
                this.plugin.settings.geminiLiveRole = firstRole.prompt;
                this.plugin.saveSettings();
            }
        }

        const mainInterface = this.contentContainer.createDiv();

        // --- Tabs ---
        this.renderTabs(mainInterface);

        // --- Content Containers ---
        this.configContentDiv = mainInterface.createDiv('tab-content');
        this.quizContentDiv = mainInterface.createDiv('tab-content'); // Create Quiz Container
        this.chatContentDiv = mainInterface.createDiv('tab-content');

        // Apply initial active state
        this.updateTabVisibility();

        // --- Tab Contents ---
        this.renderConfigTab();
        this.renderQuizTab(); // Render Quiz Tab
        this.renderChatTab();
    }

    private renderTabs(container: HTMLElement) {
        const tabContainer = container.createDiv('live-session-tabs');

        this.configTabBtn = tabContainer.createDiv('live-session-tab');
        this.configTabBtn.textContent = 'Config';
        this.configTabBtn.onclick = () => this.switchTab('config');

        this.quizTabBtn = tabContainer.createDiv('live-session-tab'); // Quiz Tab Button
        this.quizTabBtn.textContent = 'Quiz';
        this.quizTabBtn.onclick = () => this.switchTab('quiz');

        this.chatTabBtn = tabContainer.createDiv('live-session-tab');
        this.chatTabBtn.textContent = 'Chat';
        this.chatTabBtn.onclick = () => this.switchTab('chat');
    }

    private renderConfigTab() {
        if (!this.configContentDiv) return;

        // 1. Configuration (Roles)
        this.rolesComponent = new RolesComponent(this.configContentDiv);
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
            selectedTopP: this.selectedTopP,
            onTopPChange: async (val) => {
                this.selectedTopP = val;
                if (this.isSessionActive) await this.restartSession('top_p update');
            },
            onEvalHeaders: () => this.evaluateHeaders(),
            onGenerateMetadata: () => new GenerateHeaderMetadataCommand(this.app).execute(),

            liveMode: this.liveMode,
            liveUserMode: this.liveUserMode,
            onLiveModeChange: async (val) => {
                this.liveMode = val;
                this.plugin.settings.geminiLiveMode = val;
                await this.plugin.saveSettings();
                await this.restartSession('AI Mode Update');
            },
            onLiveUserModeChange: async (val) => {
                this.liveUserMode = val;
                this.plugin.settings.geminiLiveUserMode = val;
                await this.plugin.saveSettings();
                this.renderChatTab(); // Update input visibility live
            },

            selectedLocalVoice: this.selectedLocalVoice,
            onLocalVoiceChange: async (val) => {
                this.selectedLocalVoice = val;
                this.plugin.settings.geminiLiveLocalVoice = val;
                await this.plugin.saveSettings();
                // No restart needed for TTS voice change usually as it applies to next utterance
            }
        });

        // 2. Vocabulary Component (Moved here or keep in config - assuming keep for now)
        const vocabComponent = new VocabularyComponent(this.configContentDiv);
        const currentRole = this.availableRoles.find(r => r.prompt === this.selectedRolePrompt);
        if (currentRole && currentRole.vocabularyList) {
            vocabComponent.render(
                currentRole.vocabularyList,
                this.selectedVocabularyItems,
                (item) => this.toggleVocabularyItem(item)
            );
        }
    }

    private renderQuizTab() {
        if (!this.quizContentDiv) return;
        this.quizContentDiv.empty();
        this.quizContentDiv.style.height = '100%'; // Ensure full height for embedded controls

        // Quiz Component
        this.quizComponent = new QuizComponent(this.quizContentDiv);
        this.quizComponent.render({
            quizService: this.quizService,
            onStarLevelChange: async (val) => this.handleStarLevelChange(val),
            onFilterChange: async (val) => this.handleFilterChange(val),
            onAskNext: () => this.handleStartStop(), // Reuse start/stop logic which is now the primary trigger
            onTopicSelect: (i) => this.onQuizSelect(i),
            onRefresh: () => this.handleRefresh()
        });

        // Initial status update
        this.quizComponent.updateSessionStatus(this.isSessionActive, '', '');
    }

    private renderChatTab() {
        if (!this.chatContentDiv) return;
        this.chatContentDiv.empty();

        // Toolbar
        const chatToolbar = this.chatContentDiv.createDiv('chat-toolbar');
        this.chatStopButton = chatToolbar.createEl('button', { cls: 'chat-stop-btn destructive', text: 'Stop Session' });
        this.chatStopButton.onclick = async () => await this.stopSession();
        this.updateChatStopButtonVisibility();

        // Transcript
        this.transcriptComponent = new TranscriptComponent(this.chatContentDiv, this.app, this);
        if (this.savedTranscriptHtml) {
            this.transcriptComponent.setHtml(this.savedTranscriptHtml);
        }

        // Chat Input
        const chatContainer = this.chatContentDiv.createDiv();
        this.chatInputComponent = new ChatInputComponent(chatContainer, this.apiKey, (text) => this.handleUserText(text));
        this.chatInputComponent.render(this.isSessionActive, this.liveUserMode);
    }

    private switchTab(tab: 'config' | 'chat' | 'quiz') {
        this.activeTab = tab;
        this.updateTabVisibility();
    }

    private updateTabVisibility() {
        if (this.configTabBtn && this.chatTabBtn && this.quizTabBtn) {
            this.configTabBtn.classList.toggle('active', this.activeTab === 'config');
            this.chatTabBtn.classList.toggle('active', this.activeTab === 'chat');
            this.quizTabBtn.classList.toggle('active', this.activeTab === 'quiz');

        }

        if (this.configContentDiv && this.chatContentDiv && this.quizContentDiv) {
            this.configContentDiv.classList.toggle('active', this.activeTab === 'config');
            this.chatContentDiv.classList.toggle('active', this.activeTab === 'chat');
            this.quizContentDiv.classList.toggle('active', this.activeTab === 'quiz');
        }
    }

    private updateChatStopButtonVisibility() {
        if (this.chatStopButton) {
            this.chatStopButton.style.display = this.isSessionActive ? 'flex' : 'none';
        }
    }

    // =========================================================================================
    // Logic & Handlers
    // =========================================================================================

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

        // Save to settings
        if (role) {
            this.plugin.settings.geminiLiveRole = role.prompt;
            await this.plugin.saveSettings();
        }
    }

    private applyRoleSettings(role: Role) {
        this.selectedRolePrompt = role.prompt;
        this.selectedRoleEvaluationPrompt = role.evaluationPrompt || '';
        this.selectedVoice = role.liveVoice || 'Aoede';
        this.selectedTemperature = role.liveTemperature !== undefined ? role.liveTemperature : 1;
        // If role has topP, use it, otherwise default. Role interface might not have it yet.
        this.selectedTopP = 0.95;
    }

    private async handleStartStop() {
        if (this.isSessionActive) {
            await this.stopSession();
        } else {
            // Always use handleAskNext checking logic to ensure we validate topics/queue
            // and show appropriate messages if empty.
            await this.handleAskNext('', true);
        }
    }

    private async handleRestartSession(reason: string) {
        // Redundant alias for consistency, if needed
        await this.restartSession(reason);
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

        if (this.adapter) {
            console.log('LiveSessionView: Disconnecting existing adapter before restart...');
            this.adapter.disconnect();
            this.adapter = null;
        }

        console.log(`LiveSessionView: Instantiating adapter (Mode: ${this.liveMode})...`);

        if (this.liveMode === 'text_only' || this.liveMode === 'local_voice_text' || this.liveMode === 'local_voice_only') {
            this.adapter = new GoogleGeminiChatAdapter(
                this.apiKey,
                (text) => this.onAiAudioData(text), // Reuse text handler (it appends to transcript)
                async (score) => await this.onScoreUpdate(score),
                (text) => this.onUserAudioData(text) // Chat adapter might not call this often, but needed for type
            );
        } else {
            // gemini_live_voice_text or gemini_live_voice_only -> Use Live Adapter
            this.adapter = new GoogleGeminiLiveAdapter(
                this.apiKey,
                (text) => this.onAiAudioData(text),
                async (score) => await this.onScoreUpdate(score),
                (text) => this.onUserAudioData(text)
            );
        }

        console.log('LiveSessionView: Resuming audio...');
        await this.adapter.resumeAudio();
        console.log('LiveSessionView: Audio resumed.');

        this.sessionControlsComponent?.updateStatus(false, 'Connecting...', 'var(--text-normal)');
        this.quizComponent?.updateSessionStatus(false, 'Connecting...', 'var(--text-normal)'); // Update Quiz controls too
        this.transcriptComponent?.startSession();

        const currentRole = this.availableRoles.find(r => r.prompt === this.selectedRolePrompt);
        const enableScoreTracking = currentRole?.trackLevelAnswer || false;
        const systemInstruction = this.selectedRolePrompt;

        const success = await this.adapter.connect(systemInstruction, enableScoreTracking, this.selectedVoice, this.selectedTemperature, this.selectedTopP);

        if (success) {
            this.isSessionActive = true;
            this.sessionStartTime = new Date();
            await this.sessionLogger.logStart(this.sessionStartTime);
            this.sessionControlsComponent?.updateStatus(true, '', '');
            this.quizComponent?.updateSessionStatus(true, '', '');
            this.chatInputComponent?.render(true, this.liveUserMode);
            this.updateChatStopButtonVisibility();
            showMessage('Live Connected');
            if (enableScoreTracking) showMessage('Answer scoring enabled.');
        } else {
            this.sessionControlsComponent?.updateStatus(false, 'Connection Failed', 'var(--text-error)');
            this.quizComponent?.updateSessionStatus(false, 'Connection Failed', 'var(--text-error)');
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
        this.sessionControlsComponent?.updateStatus(false, 'Session Ended', 'var(--text-muted)');
        this.quizComponent?.updateSessionStatus(false, 'Session Ended', 'var(--text-muted)');
        this.chatInputComponent?.render(false, this.liveUserMode);
        this.updateChatStopButtonVisibility();
    }

    // --- Audio Data Callbacks ---

    private onAiAudioData(text: string) {
        if (this.liveMode !== 'gemini_live_voice_only' && this.liveMode !== 'local_voice_only') {
            this.transcriptComponent?.appendAiText(text);
        }
        this.aiTranscriptBuffer += text;

        if (this.liveMode === 'local_voice_text' || this.liveMode === 'local_voice_only') {
            this.speakText(text);
        }

        let processBuffer = true;
        while (processBuffer) {
            const match = this.aiTranscriptBuffer.match(/([^.?!]+[.?!])\s+/);
            if (match) {
                const sentence = match[1];
                const fullMatch = match[0];
                this.sessionLogger.logTranscript('AI', sentence);
                this.aiTranscriptBuffer = this.aiTranscriptBuffer.substring(fullMatch.length);
            } else {
                processBuffer = false;
            }
        }
    }

    private speakText(text: string) {
        if (!text) return;
        // Simple queueing by default in browser, generally works fine for sentences.
        // If we want to interrupt, we'd use cancel().
        // For chat, we generally want to read what comes in.
        const utterance = new SpeechSynthesisUtterance(text);

        // Apply selected local voice
        if (this.selectedLocalVoice) {
            const voices = window.speechSynthesis.getVoices();
            const voice = voices.find(v => v.voiceURI === this.selectedLocalVoice);
            if (voice) {
                utterance.voice = voice;
                utterance.lang = voice.lang; // Good practice to match lang
            }
        }

        window.speechSynthesis.speak(utterance);
    }

    private onUserAudioData(text: string) {
        this.transcriptComponent?.appendUserText(text);
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
                processBuffer = false;
            }
        }
    }

    private async onScoreUpdate(score: number) {
        console.log('LiveSessionView: Received score:', score);
        await this.sessionLogger.logScore(score);
        showMessage(`💡 Nota: ${score}`);
        this.transcriptComponent?.appendScore(score);
        await this.handleScoreInMetadata(score);

        // Automatically send "continue" to keep the conversation flowing
        // We do NOT append this to the user transcript to keep it internal/hidden
        this.adapter?.sendText('continue');
    }

    // --- Quiz / Header Logic ---

    private async handleAskNext(message: string = '', forceStart: boolean = false) {
        if (!this.isSessionActive || forceStart) {
            if (!this.isSessionActive) {
                showMessage('Starting session...');
                await this.startSession();
                if (!this.isSessionActive) {
                    return;
                }
            }
        }

        if (this.quizService.queue.length === 0) {
            const success = await this.quizService.buildQuizQueue();
            if (!success) {
                this.quizComponent?.setStatusText('No hay temas para preguntar.');
                console.log("ChatView: Quiz queue empty and failed to build");
                showMessage("No hay temas para preguntar. Selecciona una nota con encabezados.");
                return;
            }
            this.quizComponent?.refreshList(this.quizService, (i) => this.onQuizSelect(i));
        }

        const item = this.quizService.getCurrentItem();
        if (!item) {
            console.log("ChatView: No current item found");
            showMessage("No hay ningún tema seleccionado.");
            return;
        }

        this.switchTab('chat');
        this.chatInputComponent?.focus();

        await this.sessionLogger.logQuestion(item.heading);
        const statusText = `Examinando: ${item.heading}`;
        this.quizComponent?.setStatusText(statusText);
        this.quizComponent?.refreshList(this.quizService, (i) => this.onQuizSelect(i));
        this.transcriptComponent?.appendTopic(item.heading);

        let prompt = await this.quizService.generateQuestionPrompt();
        if (!prompt) {
            return;
        }

        // Inject Vocabulary
        const vocabContext = await this.contextService.getVocabularyContent(this.selectedVocabularyItems);
        if (vocabContext) {
            prompt += `\n\n# Contextual Knowledge\n${vocabContext}`;
            showMessage(`Injected context from ${this.selectedVocabularyItems.size} vocabulary notes.`);
        }

        this.adapter?.sendContextUpdate('Quiz Content', prompt);
        showMessage(`Sent: ${item.heading}`);
    }

    private async handleScoreInMetadata(score: number) {
        const currentItem = this.quizService.getCurrentItem();
        if (!currentItem) return;

        const oldScore = await this.quizService.recordBlockScore(currentItem, score);
        if (oldScore !== null) {
            showMessage(`Score updated: ${oldScore}`);
        }

        if (this.quizService.hasNext()) {
            this.quizService.next();
            this.quizComponent?.refreshList(this.quizService, (i) => this.onQuizSelect(i));
        }
    }

    private async onQuizSelect(index: number) {
        this.quizService.currentIndex = index;
        this.quizComponent?.refreshList(this.quizService, (i) => this.onQuizSelect(i));
    }

    private async handleStarLevelChange(level: string) {
        this.quizService.selectedStarLevel = level;
        await this.quizService.buildQuizQueue();
        this.quizComponent?.refreshList(this.quizService, (i) => this.onQuizSelect(i));
    }

    private async handleFilterChange(onlyTitles: boolean) {
        this.quizService.onlyTitlesWithoutSubtitles = onlyTitles;
        await this.quizService.buildQuizQueue();
        this.quizComponent?.refreshList(this.quizService, (i) => this.onQuizSelect(i));
    }

    private async handleRefresh() {
        showMessage('Refrescando datos...');
        if (this.rolesService) {
            this.availableRoles = await this.rolesService.loadRoles();
        }
        await this.quizService.buildQuizQueue();
        await this.renderContent();
        showMessage('Datos actualizados.');
    }

    // --- Vocabulary Helpers ---

    private toggleVocabularyItem(item: string) {
        if (this.selectedVocabularyItems.has(item)) {
            this.selectedVocabularyItems.delete(item);
        } else {
            this.selectedVocabularyItems.add(item);
        }
        this.renderContent();
    }

    // --- Other Handlers ---

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

    private async handleUserText(text: string) {
        if (!this.isSessionActive || !this.adapter) return;
        this.adapter.sendText(text);
        this.transcriptComponent?.appendUserText(text);
        this.sessionLogger.logTranscript('User', text);
        this.chatInputComponent?.focus();
    }



    private toggleMaximize(maximize: boolean) {
        if (!this.leaf) return;

        // @ts-ignore
        const parent = this.leaf.parent;
        // @ts-ignore
        const isInRightSidebar = this.leaf.parent === this.app.workspace.rightSplit;

        if (isInRightSidebar) {
            const split = this.app.workspace.rightSplit;
            if (maximize) {
                // @ts-ignore
                this.originalSidebarSize = split.size;
                // @ts-ignore
                split.setSize(window.innerWidth - 100);
            } else {
                // @ts-ignore
                if (this.originalSidebarSize) split.setSize(this.originalSidebarSize);
            }
            return;
        }

        // @ts-ignore
        if (parent && parent.type === 'split') {
            // @ts-ignore
            const parentEl = parent.containerEl;
            if (maximize) {
                parentEl.classList.add('gemini-live-mode-parent');
                // @ts-ignore
                this.leaf.containerEl.classList.add('gemini-live-mode-active-leaf');
            } else {
                parentEl.classList.remove('gemini-live-mode-parent');
                // @ts-ignore
                this.leaf.containerEl.classList.remove('gemini-live-mode-active-leaf');
            }
        }
    }
}
