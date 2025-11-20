import { Plugin, TFile } from 'obsidian';
import {
  DEFAULT_SETTINGS,
  UnresolvedLinkGeneratorSettings,
  normalizeTemplateOptions,
} from './settings';
import { ApplyTemplateCommand } from './Application/Commands/ApplyTemplateCommand';
import { GoogleGeminiAdapter } from './Infrastructure/Adapters/GoogleGeminiAdapter/GoogleGeminiAdapter';
import { GoogleMapsAdapter } from './Infrastructure/Adapters/GoogleMapsAdapter/GoogleMapsAdapter';
import { GenerateMissingNotesCommand } from './Application/Commands/GenerateMissingNotesCommand';
import { SettingsView } from './Application/Views/SettingsView';

export default class ObsidianExtension extends Plugin {
  settings: UnresolvedLinkGeneratorSettings = DEFAULT_SETTINGS;

  async onload() {
    console.log('Elocuency plugin loaded');

    await this.loadSettings();

    const llm = new GoogleGeminiAdapter(this.settings.geminiApiKey ?? '');
    const geocoder = new GoogleMapsAdapter(
      this.settings.googleMapsApiKey ?? '',
    );

    this.addCommand({
      id: 'elo-generate-notes-for-unresolved-links',
      name: 'Create notes for unresolved links',
      callback: async () => {
        const generateMissingNotesCommand = new GenerateMissingNotesCommand(
          this.app,
          this.settings,
        );
        await generateMissingNotesCommand.execute();
      },
    });

    this.addCommand({
      id: 'elo-apply-note-template',
      name: 'Apply note template',
      callback: () => {
        const applyTemplateCommand = new ApplyTemplateCommand(
          llm,
          geocoder,
          this.app,
          this.settings,
        );
        applyTemplateCommand.execute();
      },
    });

    this.registerEvent(
      this.app.vault.on('rename', async (file, oldPath) => {
        if (!(file instanceof TFile) || file.extension !== 'md') {
          return;
        }

        const parentPath = file.parent?.path;
        if (!parentPath) {
          return;
        }

        const matchingTemplate = this.settings.templateOptions.find(
          (option) => option.targetFolder === parentPath,
        );

        if (
          matchingTemplate &&
          matchingTemplate.commands &&
          matchingTemplate.commands.length > 0
        ) {
          console.log(
            `[Elocuency] Note moved to ${parentPath}. Executing commands: ${matchingTemplate.commands.join(', ')}`,
          );

          const leaf = this.app.workspace.getLeaf(false);
          await leaf.openFile(file);

          for (const commandId of matchingTemplate.commands) {
            const command = (this.app as any).commands.findCommand(commandId);
            if (command) {
              (this.app as any).commands.executeCommandById(commandId);
            } else {
              console.warn(`[Elocuency] Command not found: ${commandId}`);
            }
          }
        }
      }),
    );

    this.addSettingTab(new SettingsView(this.app, this));
  }

  onunload() {
    console.log('Elocuency plugin unloaded');
  }

  async loadSettings() {
    const data = await this.loadData();
    const merged = Object.assign({}, DEFAULT_SETTINGS, data);
    merged.templateOptions = normalizeTemplateOptions(
      data?.templateOptions ?? merged.templateOptions,
    );
    this.settings = merged;
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
