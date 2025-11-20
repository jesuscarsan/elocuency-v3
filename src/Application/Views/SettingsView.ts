import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  DropdownComponent,
  TextComponent,
  TextAreaComponent,
} from 'obsidian';
import ObsidianExtension from 'src/main';
import { LocationStrategy } from 'src/settings';

export class SettingsView extends PluginSettingTab {
  plugin: ObsidianExtension;

  constructor(app: App, plugin: ObsidianExtension) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', {
      text: 'Elocuency Settings',
    });

    new Setting(containerEl)
      .setName('Note location strategy')
      .setDesc(
        'Create notes alongside the source file or inside a fixed folder.',
      )
      .addDropdown((dropdown: DropdownComponent) => {
        dropdown
          .addOption('same-folder', 'Same folder as link source')
          .addOption('fixed-folder', 'Fixed folder')
          .setValue(this.plugin.settings.locationStrategy)
          .onChange(async (value: string) => {
            this.plugin.settings.locationStrategy = value as LocationStrategy;
            await this.plugin.saveSettings();
            this.display();
          });
      });

    new Setting(containerEl)
      .setName('Target folder')
      .setDesc(
        'Folder where notes are created when using the fixed folder strategy.',
      )
      .addText((text: TextComponent) => {
        text
          .setPlaceholder('inbox')
          .setValue(this.plugin.settings.targetFolder)
          .onChange(async (value: string) => {
            this.plugin.settings.targetFolder = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Note template')
      .setDesc('Template used when creating new notes (supports {{title}}).')
      .addTextArea((text: TextAreaComponent) => {
        text
          .setPlaceholder('# {{title}}')
          .setValue(this.plugin.settings.fileTemplate)
          .onChange(async (value: string) => {
            this.plugin.settings.fileTemplate = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 4;
      });

    new Setting(containerEl)
      .setName('Gemini API key')
      .setDesc(
        'Used to ask Gemini for descriptions when a template has no body content.',
      )
      .addText((text: TextComponent) => {
        text
          .setPlaceholder('AIza...')
          .setValue(this.plugin.settings.geminiApiKey)
          .onChange(async (value: string) => {
            this.plugin.settings.geminiApiKey = value.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.type = 'password';
      });

    new Setting(containerEl)
      .setName('Google Maps API key')
      .setDesc(
        'Used to rellenar datos geográficos cuando aplicas la plantilla "Lugar".',
      )
      .addText((text: TextComponent) => {
        text
          .setPlaceholder('AIza...')
          .setValue(this.plugin.settings.googleMapsApiKey)
          .onChange(async (value: string) => {
            this.plugin.settings.googleMapsApiKey = value.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.type = 'password';
      });

    containerEl.createEl('h3', { text: 'Template presets' });
    containerEl.createEl('p', {
      text: 'Configure the options shown when running the "Apply note template" command.',
    });

    const templateListEl = containerEl.createDiv({
      cls: 'elo-template-options',
    });
    this.renderTemplateOptions(templateListEl);
  }

  private renderTemplateOptions(containerEl: HTMLElement) {
    containerEl.empty();

    const options = this.plugin.settings.templateOptions;

    if (options.length === 0) {
      containerEl.createEl('p', {
        text: 'No template presets configured yet.',
      });
    }

    options.forEach((option, index) => {
      const optionWrapper = containerEl.createDiv({
        cls: 'elo-template-option',
      });
      const optionHeading = optionWrapper.createEl('h4', {
        text: option.label.trim() || `Template ${index + 1}`,
      });

      const labelSetting = new Setting(optionWrapper)
        .setName('Label')
        .setDesc('Displayed in the template picker.')
        .addText((text: TextComponent) => {
          text
            .setPlaceholder('Persona')
            .setValue(option.label)
            .onChange(async (value: string) => {
              this.plugin.settings.templateOptions[index].label = value;
              optionHeading.setText(value.trim() || `Template ${index + 1}`);
              await this.plugin.saveSettings();
            });
        });

      labelSetting.addExtraButton((button) => {
        button
          .setIcon('trash')
          .setTooltip('Remove template')
          .onClick(async () => {
            this.plugin.settings.templateOptions.splice(index, 1);
            await this.plugin.saveSettings();
            this.renderTemplateOptions(containerEl);
          });
      });

      new Setting(optionWrapper)
        .setName('Template filename')
        .setDesc('File inside the Templates core plugin folder.')
        .addText((text: TextComponent) => {
          text
            .setPlaceholder('Persona.md')
            .setValue(option.templateFilename)
            .onChange(async (value: string) => {
              this.plugin.settings.templateOptions[index].templateFilename =
                value;
              await this.plugin.saveSettings();
            });
        });

      new Setting(optionWrapper)
        .setName('Target folder')
        .setDesc('Destination folder after applying the template.')
        .addText((text: TextComponent) => {
          text
            .setPlaceholder('Personas')
            .setValue(option.targetFolder)
            .onChange(async (value: string) => {
              this.plugin.settings.templateOptions[index].targetFolder = value;
              await this.plugin.saveSettings();
            });
        });

      new Setting(optionWrapper)
        .setName('Commands')
        .setDesc(
          'Comma-separated list of command IDs to execute when a note is moved to the target folder.',
        )
        .addText((text: TextComponent) => {
          text
            .setPlaceholder('elo-apply-note-template, other-command')
            .setValue(option.commands ? option.commands.join(', ') : '')
            .onChange(async (value: string) => {
              this.plugin.settings.templateOptions[index].commands = value
                .split(',')
                .map((c) => c.trim())
                .filter((c) => c.length > 0);
              await this.plugin.saveSettings();
            });
        });
    });

    new Setting(containerEl)
      .setName('Add template')
      .setDesc('Create another template preset.')
      .addButton((button) => {
        button
          .setButtonText('Add template')
          .setCta()
          .onClick(async () => {
            this.plugin.settings.templateOptions.push({
              label: 'New template',
              templateFilename: '',
              targetFolder: '',
              commands: [],
            });
            await this.plugin.saveSettings();
            this.renderTemplateOptions(containerEl);
          });
      });
  }
}
