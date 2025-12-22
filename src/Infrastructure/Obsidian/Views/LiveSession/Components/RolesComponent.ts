import { ButtonComponent, DropdownComponent, setIcon } from 'obsidian';
import { Role } from '../../../../../Application/Services/RolesService';

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
    usePTT: boolean;
    onPTTChange: (val: boolean) => void;
}

export class RolesComponent {
    private voiceDropdownRef: DropdownComponent | null = null;
    private tempSliderRef: HTMLInputElement | null = null;
    private tempValLabelRef: HTMLSpanElement | null = null;

    constructor(private container: HTMLElement) { }

    render(props: RolesComponentProps) {
        // Main Container is now a details element
        const details = this.container.createEl('details');
        details.style.marginBottom = '20px';
        details.style.border = '1px solid var(--background-modifier-border)';
        details.style.borderRadius = '4px';
        details.style.overflow = 'hidden';

        const summary = details.createEl('summary', { text: 'Configuración' });
        summary.style.padding = '10px';
        summary.style.cursor = 'pointer';
        summary.style.backgroundColor = 'var(--background-secondary)';
        summary.style.fontWeight = 'bold';

        const content = details.createDiv();
        content.style.padding = '15px';
        content.style.display = 'flex';
        content.style.flexDirection = 'column';
        content.style.gap = '15px';

        // Role Selector Row
        const roleRow = content.createDiv();
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

        // --- Voice & Temp Config Row ---
        const configRow = content.createDiv();
        configRow.style.display = 'flex';
        configRow.style.alignItems = 'center';
        configRow.style.gap = '15px';
        configRow.style.flexWrap = 'wrap';

        // PTT Toggle
        const pttContainer = content.createDiv();
        pttContainer.style.display = 'flex';
        pttContainer.style.alignItems = 'center';
        pttContainer.style.gap = '5px';
        const pttCheckbox = pttContainer.createEl('input', { type: 'checkbox' });
        pttCheckbox.checked = props.usePTT;
        pttCheckbox.addEventListener('change', (e) => {
            props.onPTTChange((e.target as HTMLInputElement).checked);
        });
        pttContainer.createSpan({ text: 'Modo Push-to-Talk' });


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
