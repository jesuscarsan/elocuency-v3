import { Plugin, TFile } from 'obsidian';
import {
  DEFAULT_SETTINGS,
  UnresolvedLinkGeneratorSettings,
  normalizeTemplateOptions,
} from './settings';
import { ApplyTemplateCommand } from './Application/Commands/ApplyTemplateCommand';
import { ApplyGeocoderCommand } from './Application/Commands/ApplyGeocoderCommand';
import { ApplyStreamBriefCommand } from './Application/Commands/ApplyStreamBriefCommand';
import { GoogleGeminiAdapter } from './Infrastructure/Adapters/GoogleGeminiAdapter/GoogleGeminiAdapter';
import { GoogleMapsAdapter } from './Infrastructure/Adapters/GoogleMapsAdapter/GoogleMapsAdapter';
import { GenerateMissingNotesCommand } from './Application/Commands/GenerateMissingNotesCommand';
import { SettingsView } from './Application/Views/SettingsView';
import { EnhanceNoteCommand } from './Application/Commands/EnhanceNoteCommand';
import { EnhanceByAiCommand } from './Application/Commands/EnhanceByAiCommand';

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
      id: 'elo-apply-template',
      name: 'Apply note template',
      callback: () => {
        const applyTemplateCommand = new ApplyTemplateCommand(
          llm,
          this.app,
          this.settings,
        );
        applyTemplateCommand.execute();
      },
    });

    this.addCommand({
      id: 'elo-apply-stream-brief',
      name: 'Apply stream brief',
      callback: () => {
        const applyStreamBriefCommand = new ApplyStreamBriefCommand(
          llm,
          this.app,
        );
        applyStreamBriefCommand.execute();
      },
    });

    this.addCommand({
      id: 'elo-apply-geocoder',
      name: 'Apply Geocoder',
      callback: () => {
        const applyGeocoderCommand = new ApplyGeocoderCommand(
          geocoder,
          this.app,
        );
        applyGeocoderCommand.execute();
      },
    });

    this.addCommand({
      id: 'elo-enhance-note',
      name: 'Enhance note',
      callback: () => {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
          new EnhanceNoteCommand(this, llm).execute(activeFile);
        }
      },
    });

    this.addCommand({
      id: 'elo-enhance-by-prompt',
      name: 'Enhance note by prompt',
      callback: () => {
        new EnhanceByAiCommand(this.app, this.settings, llm).execute();
      },
    });


    this.registerEvent(
      this.app.vault.on('rename', async (file, oldPath) => {
        new EnhanceNoteCommand(this, llm).execute(file);

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
