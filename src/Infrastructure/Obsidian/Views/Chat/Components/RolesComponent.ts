import { ButtonComponent, DropdownComponent, setIcon } from 'obsidian';
import { Role } from '@/Application/Services/RolesService';

export interface RolesComponentProps {
    roles: Role[];
    selectedRolePrompt: string;
    selectedVoice: string;
    selectedTemperature: number;
    selectedTopP: number;
    isSessionActive: boolean;
    onRoleChange: (rolePrompt: string) => void;
    onVoiceChange: (voice: string) => void;
    onTemperatureChange: (temp: number) => void;
    onTopPChange: (val: number) => void;
    onEvalHeaders: () => void;
    onGenerateMetadata: () => void;
    onEvaluateHeader?: () => void;
    liveMode: 'gemini_live_voice_text' | 'gemini_live_voice_only' | 'local_voice_text' | 'local_voice_only' | 'text_only';
    liveUserMode: 'voice_text' | 'text_only' | 'voice_only';
    onLiveModeChange: (val: 'gemini_live_voice_text' | 'gemini_live_voice_only' | 'local_voice_text' | 'local_voice_only' | 'text_only') => void;
    onLiveUserModeChange: (val: 'voice_text' | 'text_only' | 'voice_only') => void;

    // Local Voice Selection
    selectedLocalVoice: string;
    onLocalVoiceChange: (voiceUri: string) => void;
}

export class RolesComponent {
    private voiceDropdownRef: DropdownComponent | null = null;
    private localVoiceDropdownRef: DropdownComponent | null = null; // New ref
    private tempSliderRef: HTMLInputElement | null = null;
    private tempValLabelRef: HTMLSpanElement | null = null;
    private topPSliderRef: HTMLInputElement | null = null;
    private topPValLabelRef: HTMLSpanElement | null = null;

    constructor(private container: HTMLElement) { }

    render(props: RolesComponentProps) {
        // Primary Container for Top-Level Controls
        const primaryControls = this.container.createDiv();
        primaryControls.style.marginBottom = '20px';
        primaryControls.style.display = 'flex';
        primaryControls.style.flexDirection = 'column';
        primaryControls.style.gap = '15px';

        // Role Selector Row
        const roleRow = primaryControls.createDiv();
        roleRow.style.display = 'flex';
        roleRow.style.alignItems = 'center';
        roleRow.style.gap = '10px';

        roleRow.createSpan({ text: 'Role:' });

        if (props.roles.length === 0) {
            roleRow.createSpan({ text: '(No roles found in folder)', cls: 'gemini-muted-text' });
        } else {
            const dropdown = new DropdownComponent(roleRow);

            props.roles.forEach(role => dropdown.addOption(role.prompt, role.name));
            dropdown.setValue(props.selectedRolePrompt);
            dropdown.onChange((val) => props.onRoleChange(val));
        }


        // --- Live Mode Configuration ---
        const liveModeContainer = primaryControls.createDiv();
        liveModeContainer.style.display = 'flex';
        liveModeContainer.style.flexDirection = 'column';
        liveModeContainer.style.gap = '10px';

        // AI Interaction Mode
        const aiModeRow = liveModeContainer.createDiv();
        aiModeRow.style.display = 'flex';
        aiModeRow.style.alignItems = 'center';
        aiModeRow.style.gap = '10px';
        aiModeRow.createSpan({ text: 'IA:' });
        const aiDropdown = new DropdownComponent(aiModeRow);
        aiDropdown.addOption('gemini_live_voice_text', 'Voz live y texto');
        aiDropdown.addOption('gemini_live_voice_only', 'Voz live');
        aiDropdown.addOption('local_voice_text', 'Voz y texto');
        aiDropdown.addOption('local_voice_only', 'Voz');
        aiDropdown.addOption('text_only', 'Solo Texto');
        aiDropdown.setValue(props.liveMode || 'gemini_live_voice_text');
        aiDropdown.onChange((val) => props.onLiveModeChange(val as any));

        // User Interaction Mode
        const userModeRow = liveModeContainer.createDiv();
        userModeRow.style.display = 'flex';
        userModeRow.style.alignItems = 'center';
        userModeRow.style.gap = '10px';
        userModeRow.createSpan({ text: 'Usuario:' });
        const userDropdown = new DropdownComponent(userModeRow);
        userDropdown.addOption('voice_text', 'Voz y Texto');
        userDropdown.addOption('text_only', 'Solo Texto');
        userDropdown.addOption('voice_only', 'Solo Voz');
        userDropdown.setValue(props.liveUserMode || 'voice_text');
        userDropdown.onChange((val) => props.onLiveUserModeChange(val as any));

        // --- Local Voice Dropdown (Conditional) ---
        if (props.liveMode.startsWith('local_voice')) {
            const localVoiceRow = liveModeContainer.createDiv();
            localVoiceRow.style.display = 'flex';
            localVoiceRow.style.alignItems = 'center';
            localVoiceRow.style.gap = '10px';
            localVoiceRow.createSpan({ text: 'Voz Local:' });

            this.localVoiceDropdownRef = new DropdownComponent(localVoiceRow);

            const loadVoices = () => {
                const voices = window.speechSynthesis.getVoices();
                if (voices.length > 0 && this.localVoiceDropdownRef) {
                    // Clear existing options handled by obsidian component? 
                    // Obs dropdown doesn't have clear(), but we create new one on render() so it's fine.
                    // But if voices load async, we might need to update.

                    // Filter mainly for generic or lang specific? Let's show all and let user search/pick.
                    // Or maybe prioritise current language.
                    // Let's show all sorting by name.
                    voices.sort((a, b) => a.name.localeCompare(b.name));

                    voices.forEach(voice => {
                        this.localVoiceDropdownRef!.addOption(voice.voiceURI, `${voice.name} (${voice.lang})`);
                    });

                    // Set value
                    if (props.selectedLocalVoice) {
                        this.localVoiceDropdownRef.setValue(props.selectedLocalVoice);
                    } else if (voices.length > 0) {
                        // Default to first
                        this.localVoiceDropdownRef.setValue(voices[0].voiceURI);
                        props.onLocalVoiceChange(voices[0].voiceURI);
                    }
                } else if (voices.length === 0) {
                    this.localVoiceDropdownRef?.addOption('', 'Cargando voces...');
                }
            };

            loadVoices();
            if (window.speechSynthesis.onvoiceschanged !== undefined) {
                window.speechSynthesis.onvoiceschanged = () => {
                    // Since we cannot easily clear options on existing component without hacking InnerHTML, 
                    // and re-rendering whole component is expensive/complex here without state management,
                    // we will best-effort populate if empty, or just rely on render being called again? 
                    // Actually, we can just rebuild the options if we had a way. 
                    // Simplest: just reload.
                    if (this.localVoiceDropdownRef?.selectEl.options.length && this.localVoiceDropdownRef.selectEl.options[0].text === 'Cargando voces...') {
                        this.localVoiceDropdownRef.selectEl.innerHTML = ''; // Hacky clear
                        loadVoices();
                    }
                };
            }

            this.localVoiceDropdownRef.onChange((val) => props.onLocalVoiceChange(val));
        }

        // --- Voice, Temp, TopP Config Row (Moved from Advanced) ---
        const configRow = primaryControls.createDiv();
        configRow.style.display = 'flex';
        configRow.style.alignItems = 'center';
        configRow.style.gap = '15px';
        configRow.style.flexWrap = 'wrap';

        // Voice Dropdown (Gemini Live)
        if (props.liveMode.startsWith('gemini_live')) {
            configRow.createSpan({ text: 'Voz (Gemini):' });
            this.voiceDropdownRef = new DropdownComponent(configRow);
            ['Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede'].forEach(voice => {
                this.voiceDropdownRef!.addOption(voice, voice);
            });
            this.voiceDropdownRef.setValue(props.selectedVoice);
            this.voiceDropdownRef.onChange((val) => props.onVoiceChange(val));
        }

        // Temperature Slider
        const tempContainer = configRow.createDiv();
        tempContainer.style.display = 'flex';
        tempContainer.style.alignItems = 'center';
        tempContainer.style.gap = '5px';

        tempContainer.createSpan({ text: 'Temp:' });
        this.tempValLabelRef = tempContainer.createSpan({ text: props.selectedTemperature.toFixed(1) });

        this.tempSliderRef = document.createElement('input');
        this.tempSliderRef.type = 'range';
        this.tempSliderRef.min = '0';
        this.tempSliderRef.max = '2';
        this.tempSliderRef.step = '0.1';
        this.tempSliderRef.value = props.selectedTemperature.toString();
        this.tempSliderRef.style.width = '60px';

        this.tempSliderRef.addEventListener('change', (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            props.onTemperatureChange(val);
            if (this.tempValLabelRef) this.tempValLabelRef.textContent = val.toFixed(1);
        });

        this.tempSliderRef.addEventListener('input', (e) => {
            if (this.tempValLabelRef) this.tempValLabelRef.textContent = parseFloat((e.target as HTMLInputElement).value).toFixed(1);
        });

        tempContainer.appendChild(this.tempSliderRef);

        // Top P Slider
        const topPContainer = configRow.createDiv();
        topPContainer.style.display = 'flex';
        topPContainer.style.alignItems = 'center';
        topPContainer.style.gap = '5px';

        topPContainer.createSpan({ text: 'TopP:' });
        this.topPValLabelRef = topPContainer.createSpan({ text: props.selectedTopP.toFixed(2) });

        this.topPSliderRef = document.createElement('input');
        this.topPSliderRef.type = 'range';
        this.topPSliderRef.min = '0';
        this.topPSliderRef.max = '1';
        this.topPSliderRef.step = '0.05';
        this.topPSliderRef.value = props.selectedTopP.toString();
        this.topPSliderRef.style.width = '60px';

        this.topPSliderRef.addEventListener('change', (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            props.onTopPChange(val);
            if (this.topPValLabelRef) this.topPValLabelRef.textContent = val.toFixed(2);
        });

        this.topPSliderRef.addEventListener('input', (e) => {
            if (this.topPValLabelRef) this.topPValLabelRef.textContent = parseFloat((e.target as HTMLInputElement).value).toFixed(2);
        });

        topPContainer.appendChild(this.topPSliderRef);


        // Main Container is now a details element (Advanced)
        const details = this.container.createEl('details');
        details.style.marginBottom = '20px';
        details.style.border = '1px solid var(--background-modifier-border)';
        details.style.borderRadius = '4px';
        details.style.overflow = 'hidden';

        const summary = details.createEl('summary', { text: 'Avanzada' });
        summary.style.padding = '10px';
        summary.style.cursor = 'pointer';
        summary.style.backgroundColor = 'var(--background-secondary)';
        summary.style.fontWeight = 'bold';

        const content = details.createDiv();
        content.style.padding = '15px';
        content.style.display = 'flex';
        content.style.flexDirection = 'column';
        content.style.gap = '15px';

        // Buttons
        if (props.roles.length > 0) {
            const buttonContainer = content.createDiv();
            buttonContainer.style.display = 'flex';
            buttonContainer.style.gap = '10px';

            new ButtonComponent(buttonContainer)
                .setButtonText('Eval Headers')
                .setTooltip('Batchevaluation of headers')
                .onClick(() => props.onEvalHeaders());

            new ButtonComponent(buttonContainer)
                .setButtonText('Generate Header Metadata')
                .setTooltip('Assign Block IDs and create metadata structure for headers')
                .onClick(() => props.onGenerateMetadata());
        }
    }
}
