import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  DropdownComponent,
  TextComponent,
  TextAreaComponent,
} from 'obsidian';
import ObsidianExtension from '@/Infrastructure/Obsidian/main';
import { LocationStrategy } from '@/Infrastructure/Obsidian/settings';

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
      .setName('User Language')
      .setDesc('Your primary language (e.g., "es").')
      .addText((text: TextComponent) => {
        text
          .setPlaceholder('es')
          .setValue(this.plugin.settings.userLanguage)
          .onChange(async (value: string) => {
            this.plugin.settings.userLanguage = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('To Learn Language')
      .setDesc('The language you are learning (e.g., "en").')
      .addText((text: TextComponent) => {
        text
          .setPlaceholder('en')
          .setValue(this.plugin.settings.toLearnLanguage)
          .onChange(async (value: string) => {
            this.plugin.settings.toLearnLanguage = value.trim();
            await this.plugin.saveSettings();
          });
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
          .setValue(this.plugin.settings.missingNotesTemplatePath)
          .onChange(async (value: string) => {
            this.plugin.settings.missingNotesTemplatePath = value;
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
      .setName('Roles Folder')
      .setDesc('Folder containing notes with roles for Chat Session (defined by !!prompt frontmatter).')
      .addText((text: TextComponent) => {
        text
          .setPlaceholder('Roles')
          .setValue(this.plugin.settings.geminiRolesFolder)
          .onChange(async (value: string) => {
            this.plugin.settings.geminiRolesFolder = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Google Geocoding API key')
      .setDesc(
        'Used for Geocoding (backend queries). Restricted by IP if possible.',
      )
      .addText((text: TextComponent) => {
        text
          .setPlaceholder('AIza...')
          .setValue(this.plugin.settings.googleGeocodingAPIKey)
          .onChange(async (value: string) => {
            this.plugin.settings.googleGeocodingAPIKey = value.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.type = 'password';
      });

    new Setting(containerEl)
      .setName('Google Maps Embed API key')
      .setDesc(
        'Used for rendering the map (frontend). Restricted by HTTP Referrer.',
      )
      .addText((text: TextComponent) => {
        text
          .setPlaceholder('AIza...')
          .setValue(this.plugin.settings.googleMapsEmbedAPIKey)
          .onChange(async (value: string) => {
            this.plugin.settings.googleMapsEmbedAPIKey = value.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.type = 'password';
      });



    new Setting(containerEl)
      .setName('Google Custom Search API key')
      .setDesc('Used for searching images.')
      .addText((text: TextComponent) => {
        text
          .setPlaceholder('AIza...')
          .setValue(this.plugin.settings.googleCustomSearchApiKey)
          .onChange(async (value: string) => {
            this.plugin.settings.googleCustomSearchApiKey = value.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.type = 'password';
      });

    new Setting(containerEl)
      .setName('Google Custom Search Engine ID')
      .setDesc('CX ID for the custom search engine.')
      .addText((text: TextComponent) => {
        text
          .setPlaceholder('0123456789...')
          .setValue(this.plugin.settings.googleCustomSearchEngineId)
          .onChange(async (value: string) => {
            this.plugin.settings.googleCustomSearchEngineId = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Spotify Client ID')
      .setDesc('Required for Spotify integration.')
      .addText((text: TextComponent) => {
        text
          .setPlaceholder('Client ID')
          .setValue(this.plugin.settings.spotifyClientId)
          .onChange(async (value: string) => {
            this.plugin.settings.spotifyClientId = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Spotify Access Token')
      .setDesc('Access token for Spotify API.')
      .addText((text: TextComponent) => {
        text
          .setPlaceholder('Access Token')
          .setValue(this.plugin.settings.spotifyAccessToken)
          .onChange(async (value: string) => {
            this.plugin.settings.spotifyAccessToken = value.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.type = 'password';
      });

    new Setting(containerEl)
      .setName('Spotify Redirect URI')
      .setDesc('Must match exactly what is in Spotify Dashboard.')
      .addText((text: TextComponent) => {
        text
          .setPlaceholder('http://localhost:8080')
          .setValue(this.plugin.settings.spotifyRedirectUri)
          .onChange(async (value: string) => {
            this.plugin.settings.spotifyRedirectUri = value.trim();
            await this.plugin.saveSettings();
          });
      });



    containerEl.createEl('h3', { text: 'Google Integration (Contacts)' });

    new Setting(containerEl)
      .setName('Google Client ID')
      .setDesc('OAuth2 Client ID for Google People API.')
      .addText((text: TextComponent) => {
        text
          .setPlaceholder('Client ID')
          .setValue(this.plugin.settings.googleClientId)
          .onChange(async (value: string) => {
            this.plugin.settings.googleClientId = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Google Client Secret')
      .setDesc('OAuth2 Client Secret.')
      .addText((text: TextComponent) => {
        text
          .setPlaceholder('Client Secret')
          .setValue(this.plugin.settings.googleClientSecret)
          .onChange(async (value: string) => {
            this.plugin.settings.googleClientSecret = value.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.type = 'password';
      });

    new Setting(containerEl)
      .setName('Google Refresh Token')
      .setDesc('OAuth2 Refresh Token (Get this via OAuth Playground or similar).')
      .addText((text: TextComponent) => {
        text
          .setPlaceholder('Refresh Token')
          .setValue(this.plugin.settings.googleRefreshToken)
          .onChange(async (value: string) => {
            this.plugin.settings.googleRefreshToken = value.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.type = 'password';
      });


    containerEl.createEl('h3', { text: 'OpenSubtitles' });

    new Setting(containerEl)
      .setName('API Key')
      .setDesc('Consumer Key from OpenSubtitles.com API.')
      .addText((text: TextComponent) => {
        text
          .setPlaceholder('API Key')
          .setValue(this.plugin.settings.openSubtitlesApiKey)
          .onChange(async (value: string) => {
            this.plugin.settings.openSubtitlesApiKey = value.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.type = 'password';
      });

    new Setting(containerEl)
      .setName('Username')
      .setDesc('OpenSubtitles.com Username.')
      .addText((text: TextComponent) => {
        text
          .setPlaceholder('Username')
          .setValue(this.plugin.settings.openSubtitlesUsername)
          .onChange(async (value: string) => {
            this.plugin.settings.openSubtitlesUsername = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Password')
      .setDesc('OpenSubtitles.com Password.')
      .addText((text: TextComponent) => {
        text
          .setPlaceholder('Password')
          .setValue(this.plugin.settings.openSubtitlesPassword)
          .onChange(async (value: string) => {
            this.plugin.settings.openSubtitlesPassword = value.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.type = 'password';
      });
  }
}
