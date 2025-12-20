import { ButtonComponent, DropdownComponent, setIcon } from 'obsidian';
import { Role } from '../Services/RolesManager';

export interface RolesComponentProps {
    roles: Role[];
    selectedRolePrompt: string;
    selectedVoice: string;
    selectedTemperature: number;
    isSessionActive: boolean;
    onRoleChange: (rolePrompt: string) => void;
    onVoiceChange: (voice: string) => void;
    onTemperatureChange: (temp: number) => void;
    onEvalHeaders: () => void;
    onGenerateMetadata: () => void;
}

export class RolesComponent {
    private voiceDropdownRef: DropdownComponent | null = null;
    private tempSliderRef: HTMLInputElement | null = null;
    private tempValLabelRef: HTMLSpanElement | null = null;

    constructor(private container: HTMLElement) { }

    render(props: RolesComponentProps) {
        // We assume container is already cleared or we are appending to a specific div.
        // But usually components manage their own wrapper.
        const wrapper = this.container.createDiv({ cls: 'gemini-roles-container' });
        wrapper.style.marginTop = '20px';
        wrapper.style.marginBottom = '20px';
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.gap = '10px';
        wrapper.style.border = '1px solid var(--background-modifier-border)';
        wrapper.style.padding = '10px';
        wrapper.style.borderRadius = '4px';

        // Role Selector Row
        const roleRow = wrapper.createDiv();
        roleRow.style.display = 'flex';
        roleRow.style.alignItems = 'center';
        roleRow.style.gap = '10px';

        roleRow.createSpan({ text: 'Role:' });

        if (props.roles.length === 0) {
            roleRow.createSpan({ text: '(No roles found in folder)', cls: 'gemini-muted-text' });
        } else {
            const dropdown = new DropdownComponent(roleRow);
            dropdown.addOption('', 'Default (None)');
            props.roles.forEach(role => dropdown.addOption(role.prompt, role.name));
            dropdown.setValue(props.selectedRolePrompt);
            dropdown.onChange((val) => props.onRoleChange(val));
        }

        // --- Advanced Section ---
        const advancedDetails = wrapper.createEl('details');
        advancedDetails.style.marginTop = '10px';
        advancedDetails.style.borderTop = '1px solid var(--background-modifier-border)';
        advancedDetails.style.paddingTop = '10px';

        const advancedSummary = advancedDetails.createEl('summary', { text: 'Avanzado' });
        advancedSummary.style.cursor = 'pointer';
        advancedSummary.style.marginBottom = '10px';
        advancedSummary.style.fontWeight = 'bold';
        advancedSummary.style.color = 'var(--text-muted)';

        const advancedContent = advancedDetails.createDiv();
        advancedContent.style.display = 'flex';
        advancedContent.style.flexDirection = 'column';
        advancedContent.style.gap = '10px';
        advancedContent.style.paddingLeft = '10px';
        advancedDetails.appendChild(advancedSummary);
        advancedDetails.appendChild(advancedContent);

        // --- Voice & Temp Config Row ---
        const configRow = advancedContent.createDiv();
        configRow.style.display = 'flex';
        configRow.style.alignItems = 'center';
        configRow.style.gap = '15px';
        configRow.style.flexWrap = 'wrap';

        // Voice Dropdown
        configRow.createSpan({ text: 'Voz:' });
        this.voiceDropdownRef = new DropdownComponent(configRow);
        ['Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede'].forEach(voice => {
            this.voiceDropdownRef!.addOption(voice, voice);
        });
        this.voiceDropdownRef.setValue(props.selectedVoice);
        this.voiceDropdownRef.onChange((val) => props.onVoiceChange(val));

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
        this.tempSliderRef.style.width = '80px';

        this.tempSliderRef.addEventListener('change', (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            props.onTemperatureChange(val);
            if (this.tempValLabelRef) this.tempValLabelRef.textContent = val.toFixed(1);
        });

        this.tempSliderRef.addEventListener('input', (e) => {
            if (this.tempValLabelRef) this.tempValLabelRef.textContent = parseFloat((e.target as HTMLInputElement).value).toFixed(1);
        });

        tempContainer.appendChild(this.tempSliderRef);

        // Buttons
        if (props.roles.length > 0) {
            const buttonContainer = advancedContent.createDiv();
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
