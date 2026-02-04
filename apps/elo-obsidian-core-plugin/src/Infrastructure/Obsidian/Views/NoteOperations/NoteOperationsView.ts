
import { ItemView, WorkspaceLeaf, ButtonComponent, DropdownComponent, Notice, MarkdownView, Editor } from 'obsidian';
import ObsidianExtension from '@/Infrastructure/Obsidian/main';
import { AudioRecorder } from '@/Infrastructure/Obsidian/Utils/AudioRecorder';
import { GeminiTranscriptionAdapter } from '@/Infrastructure/Adapters/GeminiTranscriptionAdapter';
import { getActiveMarkdownView } from '@/Infrastructure/Obsidian/Utils/ViewMode';
import { showMessage } from '@/Infrastructure/Obsidian/Utils/Messages';

export const VIEW_TYPE_NOTE_OPERATIONS = 'note-operations-view';

export class NoteOperationsView extends ItemView {
    private plugin: ObsidianExtension;
    private selectedCommandId: string = '';
    private executeButton: ButtonComponent | null = null;
    private isExecuting: boolean = false;

    // Audio Services
    private audioRecorder: AudioRecorder;
    private transcriptionAdapter: GeminiTranscriptionAdapter | null = null;
    private micButton: ButtonComponent | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: ObsidianExtension) {
        super(leaf);
        this.plugin = plugin;
        this.audioRecorder = new AudioRecorder();
    }

    getViewType() {
        return VIEW_TYPE_NOTE_OPERATIONS;
    }

    getDisplayText() {
        return 'Note Operations';
    }

    getIcon() {
        return 'microphone';
    }

    async onOpen() {
        // Initialize adapter with current API key
        this.transcriptionAdapter = new GeminiTranscriptionAdapter(this.plugin.settings.geminiApiKey ?? '');

        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.style.padding = '20px';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '15px';

        container.createEl('h2', { text: 'Note Operations' });

        const controlsContainer = container.createDiv();
        controlsContainer.style.display = 'flex';
        controlsContainer.style.flexDirection = 'column';
        controlsContainer.style.gap = '10px';

        // Dropdown
        const dropdown = new DropdownComponent(controlsContainer);
        const commands = this.plugin.getNoteCommands();

        if (commands.length > 0) {
            this.selectedCommandId = commands[0].id;
        }

        commands.forEach((cmd) => {
            dropdown.addOption(cmd.id, cmd.name);
        });

        dropdown.onChange((value) => {
            this.selectedCommandId = value;
        });
        dropdown.selectEl.style.width = '100%';


        // Execute Button
        this.executeButton = new ButtonComponent(controlsContainer);
        this.executeButton
            .setButtonText('Ejecutar Command')
            .setCta()
            .onClick(() => {
                this.executeSelectedCommand();
            });
        this.executeButton.buttonEl.style.width = '100%';

        // --- Push-to-Talk Microphone ---
        const micContainer = container.createDiv();
        micContainer.style.display = 'flex';
        micContainer.style.justifyContent = 'center';
        micContainer.style.marginTop = '20px';

        this.micButton = new ButtonComponent(micContainer);
        this.micButton.setIcon('microphone');
        this.micButton.setTooltip('Mantén pulsado para hablar');
        this.micButton.buttonEl.style.width = '60px';
        this.micButton.buttonEl.style.height = '60px';
        this.micButton.buttonEl.style.borderRadius = '50%';
        this.micButton.buttonEl.style.fontSize = '24px'; // Larger icon if possible, or just padding

        // Add events for Push-to-Talk
        const btnEl = this.micButton.buttonEl;

        // Mouse Events
        btnEl.addEventListener('mousedown', (e) => this.handleStartRecording(e));
        btnEl.addEventListener('mouseup', (e) => this.handleStopRecording(e));
        btnEl.addEventListener('mouseleave', (e) => {
            if (this.audioRecorder.isRecording()) {
                this.handleStopRecording(e);
            }
        });

        // Touch Events (for mobile/tablet)
        btnEl.addEventListener('touchstart', (e) => {
            e.preventDefault(); // Prevent mouse emulation
            this.handleStartRecording(e);
        });
        btnEl.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.handleStopRecording(e);
        });

        // --- Bridge Control ---
        const bridgeContainer = container.createDiv();
        bridgeContainer.style.marginTop = '20px';
        bridgeContainer.style.borderTop = '1px solid var(--background-modifier-border)';
        bridgeContainer.style.paddingTop = '10px';

        bridgeContainer.createEl('h3', { text: 'Bridge Control (Photos)' });

        const bridgeControls = bridgeContainer.createDiv();
        bridgeControls.style.display = 'flex';
        bridgeControls.style.gap = '10px';

        const startBtn = new ButtonComponent(bridgeControls)
            .setButtonText('Iniciar Bridge')
            .onClick(() => {
                this.plugin.bridgeService.startBridge(true);
                this.updateBridgeStatus(statusIndicator);
            });

        const stopBtn = new ButtonComponent(bridgeControls)
            .setButtonText('Detener Bridge')
            .setWarning() // distinct style
            .onClick(() => {
                this.plugin.bridgeService.stopBridge();
                this.updateBridgeStatus(statusIndicator);
            });

        const statusIndicator = bridgeContainer.createDiv();
        this.updateBridgeStatus(statusIndicator);
    }

    private updateBridgeStatus(el: HTMLElement) {
        const isRunning = this.plugin.bridgeService.isRunning();
        el.empty();
        el.style.marginTop = '10px';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.gap = '8px';

        const dot = el.createSpan();
        dot.style.width = '10px';
        dot.style.height = '10px';
        dot.style.borderRadius = '50%';
        dot.style.backgroundColor = isRunning ? 'var(--color-green)' : 'var(--color-red)';

        el.createSpan({ text: isRunning ? 'Estado: Ejecutándose' : 'Estado: Detenido' });
    }

    private async handleStartRecording(e: Event) {
        if (this.audioRecorder.isRecording()) return;

        if (!this.plugin.settings.geminiApiKey) {
            showMessage('Gemini API Key missing. Cannot transcribe.');
            return;
        }

        const success = await this.audioRecorder.start();
        if (success) {
            this.updateMicVisuals(true);
            showMessage('Escuchando...');
        }
    }

    private async handleStopRecording(e: Event) {
        if (!this.audioRecorder.isRecording()) return;

        const blob = await this.audioRecorder.stop();
        this.updateMicVisuals(false);

        if (blob) {
            showMessage('Transcribiendo...');
            try {
                // Ensure adapter has latest key
                this.transcriptionAdapter = new GeminiTranscriptionAdapter(this.plugin.settings.geminiApiKey ?? '');

                const text = await this.transcriptionAdapter.transcribe(blob);
                if (text) {
                    this.insertTextAtCursor(text);
                    showMessage('Texto insertado.');
                }
            } catch (error) {
                showMessage('Error en la transcripción.');
                console.error(error);
            }
        }
    }

    private updateMicVisuals(isRecording: boolean) {
        if (!this.micButton) return;
        const btnEl = this.micButton.buttonEl;

        if (isRecording) {
            btnEl.classList.add('is-recording');
            this.micButton.setIcon('mic-off'); // Visual feedback
            btnEl.style.backgroundColor = 'var(--text-error)';
            btnEl.style.color = 'white';
        } else {
            btnEl.classList.remove('is-recording');
            this.micButton.setIcon('microphone');
            btnEl.style.backgroundColor = '';
            btnEl.style.color = '';
        }
    }

    private async insertTextAtCursor(text: string) {
        let activeView = getActiveMarkdownView(this.app);

        if (activeView) {
            // Check current mode
            const currentMode = activeView.getMode();
            let appendToEnd = false;

            // If in preview mode, switch to source mode and flag to append to end
            if (currentMode === 'preview') {
                await activeView.setState({ mode: 'source' }, { history: false });
                appendToEnd = true;
            }

            const editor = activeView.editor;
            editor.focus();

            // If we switched modes, or if the cursor is at the very beginning (default) and likely untouched,
            // we append to the end to be safe, as requested ("si no esta el cursor... pone al final")
            // A simple heuristic: if selection is empty and at (0,0), and we either just switched OR user implies "no cursor active".
            // However, "no cursor active" is hard to prove in Source mode since there is always a cursor.
            // But usually, if you are reading (Preview), you don't have a cursor.
            // So 'appendToEnd' (detected from Preview state) covers the main case.
            // Additionally, if the user clicks the button, they lose focus.
            // Let's rely on the Preview -> Source switch as the primary signal for "Cursor was not active".
            // If it WAS in source mode, we assume the user placed the cursor where they wanted it.

            if (appendToEnd) {
                const lastLine = editor.lastLine();
                const lastLineLength = editor.getLine(lastLine).length;
                editor.setCursor({ line: lastLine, ch: lastLineLength });

                // Add a newline if not empty
                if (lastLineLength > 0 || lastLine > 0) {
                    editor.replaceSelection('\n');
                }
            }

            editor.replaceSelection(text);

            // Scroll to bottom if we appended
            if (appendToEnd) {
                editor.scrollIntoView({ from: editor.getCursor(), to: editor.getCursor() });
            }

        } else {
            showMessage('No active markdown note to insert text.');
        }
    }

    private async executeSelectedCommand() {
        if (!this.selectedCommandId) {
            showMessage('No command selected');
            return;
        }

        if (this.isExecuting) return;

        const commands = this.plugin.getNoteCommands();
        const cmd = commands.find(c => c.id === this.selectedCommandId);

        if (cmd && cmd.callback) {
            this.isExecuting = true;
            if (this.executeButton) {
                this.executeButton.setDisabled(true);
                this.executeButton.setButtonText('Ejecutando...');
            }

            try {
                // Try to get active view, fallback to last active markdown file
                let view = getActiveMarkdownView(this.app);
                let targetFile = view?.file;

                if (!targetFile) {
                    targetFile = this.plugin.getLastActiveMarkdownFile() ?? undefined;
                }

                if (targetFile) {
                    await cmd.callback(targetFile);
                    showMessage(`Executed: ${cmd.name}`);
                } else {
                    showMessage('No active markdown file to contextually execute command.');
                }
            } catch (error) {
                console.error("Error executing command:", error);
                showMessage(`Error executing command: ${error}`);
            } finally {
                this.isExecuting = false;
                if (this.executeButton) {
                    this.executeButton.setDisabled(false);
                    this.executeButton.setButtonText('Ejecutar Command');
                }
            }
        } else {
            showMessage('Command not found or invalid');
        }
    }
}
