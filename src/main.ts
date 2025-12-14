import { Plugin, TFile } from 'obsidian';
import {
  DEFAULT_SETTINGS,
  UnresolvedLinkGeneratorSettings,
  normalizeTemplateOptions,
} from './settings';
import { ApplyTemplateCommand } from './Application/Commands/ApplyTemplateCommand';
import { ApplyGeocoderCommand } from './Application/Commands/ApplyGeocoderCommand';
import { UpdatePlaceIdCommand } from './Application/Commands/UpdatePlaceIdCommand';
import { ApplyStreamBriefCommand } from './Application/Commands/ApplyStreamBriefCommand';
import { GoogleGeminiAdapter } from './Infrastructure/Adapters/GoogleGeminiAdapter/GoogleGeminiAdapter';
import { GoogleMapsAdapter } from './Infrastructure/Adapters/GoogleMapsAdapter/GoogleMapsAdapter';
import { GoogleImageSearchAdapter } from './Infrastructure/Adapters/GoogleImageSearchAdapter/GoogleImageSearchAdapter';
import { GenerateMissingNotesCommand } from './Application/Commands/GenerateMissingNotesCommand';
import { SettingsView } from './Application/Views/SettingsView';
import { EnhanceNoteCommand } from './Application/Commands/EnhanceNoteCommand';
import { EnhanceByAiCommand } from './Application/Commands/EnhanceByAiCommand';
import { ApplyPlaceTypeCommand } from './Application/Commands/ApplyPlaceTypeCommand';
import { registerSpotifyRenderer } from './Application/Views/SpotifyPlayer';
import { SpotifyAdapter } from './Infrastructure/Adapters/SpotifyAdapter/SpotifyAdapter';
import { SpotifyModal } from './Application/Views/SpotifyModal';
import { SpotifyPlaylistModal } from './Application/Views/SpotifyPlaylistModal';
import { InputModal } from './Application/Views/InputModal';
import { Notice } from 'obsidian';
import { registerGoogleMapsRenderer } from './Application/Views/GoogleMapsRenderer';
import { registerImageGalleryRenderer } from './Application/Views/ImageGalleryRenderer';
import { AddImagesCommand } from './Application/Commands/AddImagesCommand';
import { CreateReciprocityNotesCommand } from './Application/Commands/CreateReciprocityNotesCommand';
import { ReallocateNoteCommand } from './Application/Commands/ReallocateNoteCommand';

export default class ObsidianExtension extends Plugin {
  settings: UnresolvedLinkGeneratorSettings = DEFAULT_SETTINGS;
  spotifyAdapter!: SpotifyAdapter;

  async onload() {
    console.log('Elocuency plugin loaded');

    await this.loadSettings();

    const llm = new GoogleGeminiAdapter(this.settings.geminiApiKey ?? '');
    const geocoder = new GoogleMapsAdapter(
      this.settings.googleGeocodingAPIKey ?? '',
      this.app
    );

    const imageSearch = new GoogleImageSearchAdapter(
      this.settings.googleCustomSearchApiKey ?? '',
      this.settings.googleCustomSearchEngineId ?? ''
    );

    this.spotifyAdapter = new SpotifyAdapter(
      this.settings.spotifyClientId,
      this.settings.spotifyAccessToken
    );

    this.addCommand({
      id: 'GenerateMissingNotesCommand',
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
      id: 'ApplyTemplateCommand',
      name: 'Apply template',
      callback: () => {
        const applyTemplateCommand = new ApplyTemplateCommand(
          llm,
          imageSearch,
          this.app,
          this.settings,
        );
        applyTemplateCommand.execute();
      },
    });

    this.addCommand({
      id: 'ApplyStreamBriefCommand',
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
      id: 'ApplyGeocoderCommand',
      name: 'Apply Geocoder',
      callback: () => {
        const applyGeocoderCommand = new ApplyGeocoderCommand(
          geocoder,
          llm,
          this.app,
        );
        applyGeocoderCommand.execute();
      },
    });

    this.addCommand({
      id: 'UpdatePlaceIdCommand',
      name: 'Update Place ID',
      callback: () => {
        const updatePlaceIdCommand = new UpdatePlaceIdCommand(
          geocoder,
          this.app,
        );
        updatePlaceIdCommand.execute();
      },
    });

    this.addCommand({
      id: 'EnhanceNoteCommand',
      name: 'Enhance note (Template + AI)',
      callback: () => {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
          new EnhanceNoteCommand(this, llm).execute(activeFile);
        }
      },
    });

    this.addCommand({
      id: 'EnhanceByAiCommand',
      name: 'Enhance with AI',
      callback: () => {
        new EnhanceByAiCommand(this.app, this.settings, llm).execute();
      },
    });

    this.addCommand({
      id: 'ApplyPlaceTypeCommand',
      name: 'Indicate Place Type',
      callback: () => {
        new ApplyPlaceTypeCommand(geocoder, llm, this.app).execute();
      },
    });

    this.addCommand({
      id: 'AddImagesCommand',
      name: 'Add Images',
      callback: () => {
        new AddImagesCommand(this.app, imageSearch).execute();
      },
    });

    this.addCommand({
      id: 'ConnectSpotify',
      name: 'Connect Spotify',
      callback: async () => {
        if (!this.settings.spotifyClientId) {
          new Notice('Please set your Spotify Client ID in settings first.');
          return;
        }
        const redirectUri = this.settings.spotifyRedirectUri || 'http://localhost:8080';

        const verifier = this.spotifyAdapter.generatePkceVerifier();
        this.settings.spotifyPkceVerifier = verifier;
        await this.saveSettings();

        const challenge = await this.spotifyAdapter.generatePkceChallenge(verifier);
        const authUrl = this.spotifyAdapter.getAuthUrl(redirectUri, challenge);

        window.open(authUrl);
        new Notice('Opened Spotify Auth page. Copy the code from the URL and run "Enter Spotify Code".');
      }
    });

    this.addCommand({
      id: 'EnterSpotifyCode',
      name: 'Enter Spotify Code',
      callback: () => {
        new InputModal(this.app, async (code) => {
          if (!code) {
            new Notice('No code entered.');
            return;
          }

          try {
            const redirectUri = this.settings.spotifyRedirectUri || 'http://localhost:8080';
            const verifier = this.settings.spotifyPkceVerifier;

            if (!verifier) {
              new Notice('PKCE Verifier missing. Please run "Connect Spotify" first.');
              return;
            }

            const token = await this.spotifyAdapter.exchangeCode(code, redirectUri, verifier);
            this.settings.spotifyAccessToken = token;
            // Clear verifier after successful exchange
            this.settings.spotifyPkceVerifier = '';
            await this.saveSettings();

            new Notice('Spotify Connected Successfully!');
          } catch (error) {
            new Notice('Failed to exchange code for token. Check console.');
            console.error(error);
          }
        }).open();
      }
    });

    this.addCommand({
      id: 'CreateReciprocityNotesCommand',
      name: 'Create Reciprocity Notes',
      callback: () => {
        new CreateReciprocityNotesCommand(this.app).execute();
      }
    });

    this.addCommand({
      id: 'ReallocateNoteCommand',
      name: 'Reallocate Note',
      callback: () => {
        new ReallocateNoteCommand(this.app).execute();
      }
    });

    this.addCommand({
      id: 'SearchSpotifyTrack',
      name: 'Search Spotify Track',
      callback: () => {
        // Ensure adapter has latest credentials
        this.spotifyAdapter.updateCredentials(this.settings.spotifyClientId, this.settings.spotifyAccessToken);
        new SpotifyModal(this.app, this.spotifyAdapter).open();
      }
    });

    this.addCommand({
      id: 'ImportPlaylistTracks',
      name: 'Import Playlist Tracks',
      callback: async () => {
        this.spotifyAdapter.updateCredentials(this.settings.spotifyClientId, this.settings.spotifyAccessToken);
        new SpotifyPlaylistModal(this.app, this.spotifyAdapter).open();
      }
    });


    // this.registerEvent(
    //   this.app.vault.on('rename', async (file, oldPath) => {
    //     new EnhanceNoteCommand(this, llm).execute(file);

    //   }),
    // );

    this.addSettingTab(new SettingsView(this.app, this));
    registerImageGalleryRenderer(this);
    registerSpotifyRenderer(this);
    registerGoogleMapsRenderer(this);
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
