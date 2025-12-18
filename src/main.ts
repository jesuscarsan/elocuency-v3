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
import { SpotifyAuthModal } from './Application/Views/SpotifyAuthModal';
import { SearchSpotifyArtistCommand } from './Application/Commands/SearchSpotifyArtistCommand';
import { CreateNoteFromImagesCommand } from './Application/Commands/CreateNoteFromImagesCommand';
import { GoogleGeminiImagesAdapter } from './Infrastructure/Adapters/GoogleGeminiAdapter/GoogleGeminiImagesAdapter';
import { createHeaderProgressRenderer } from './Infrastructure/Obsidian/MarkdownPostProcessors/HeaderProgressRenderer';
import { LiveSessionView, LIVE_SESSION_VIEW_TYPE } from './Infrastructure/Obsidian/Views/LiveSessionView';
import { GenerateHeaderMetadataCommand } from './Application/Commands/GenerateHeaderMetadataCommand';
import { MetadataService } from './Infrastructure/Services/MetadataService';
import { createHeaderMetadataRenderer } from './Infrastructure/Obsidian/MarkdownPostProcessors/HeaderMetadataRenderer';

export default class ObsidianExtension extends Plugin {
  settings: UnresolvedLinkGeneratorSettings = DEFAULT_SETTINGS;
  spotifyAdapter!: SpotifyAdapter;
  llm!: GoogleGeminiAdapter;

  async onload() {
    console.log('Elocuency plugin loaded');

    await this.loadSettings();

    this.llm = new GoogleGeminiAdapter(this.settings.geminiApiKey ?? '');
    const geocoder = new GoogleMapsAdapter(
      this.settings.googleGeocodingAPIKey ?? '',
      this.app
    );
    const geminiImages = new GoogleGeminiImagesAdapter(this.settings.geminiApiKey ?? '');

    const imageSearch = new GoogleImageSearchAdapter(
      this.settings.googleCustomSearchApiKey ?? '',
      this.settings.googleCustomSearchEngineId ?? ''
    );

    this.spotifyAdapter = new SpotifyAdapter(
      this.settings.spotifyClientId,
      this.settings.spotifyAccessToken,
      this.settings.spotifyRefreshToken,
      this.settings.spotifyTokenExpirationTime,
      async (newToken, newExpiration) => {
        this.settings.spotifyAccessToken = newToken;
        this.settings.spotifyTokenExpirationTime = newExpiration;
        await this.saveSettings();
      },
      () => {
        new Notice('Spotify token expired. Please re-login.');
        new SpotifyAuthModal(this.app, this).open();
      }
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
          this.llm,
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
          this.llm,
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
          this.llm,
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
          new EnhanceNoteCommand(this, this.llm).execute(activeFile);
        }
      },
    });

    this.addCommand({
      id: 'EnhanceByAiCommand',
      name: 'Enhance with AI',
      callback: () => {
        new EnhanceByAiCommand(this.app, this.settings, this.llm).execute();
      },
    });

    this.addCommand({
      id: 'ApplyPlaceTypeCommand',
      name: 'Indicate Place Type',
      callback: () => {
        new ApplyPlaceTypeCommand(geocoder, this.llm, this.app).execute();
      },
    });

    this.addCommand({
      id: 'AddImagesCommand',
      name: 'Add Images',
      callback: () => {
        new AddImagesCommand(this.app, imageSearch).execute();
      },
    });

    // ConnectSpotify and EnterSpotifyCode commands removed in favor of Auto-Auth Modal

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

        if (!this.spotifyAdapter.isAuthenticated()) {
          new SpotifyAuthModal(this.app, this).open();
          return;
        }

        new SpotifyModal(this.app, this.spotifyAdapter).open();
      }
    });

    this.addCommand({
      id: 'ImportPlaylistTracks',
      name: 'Import Playlist Tracks',
      callback: async () => {
        this.spotifyAdapter.updateCredentials(this.settings.spotifyClientId, this.settings.spotifyAccessToken);

        if (!this.spotifyAdapter.isAuthenticated()) {
          new SpotifyAuthModal(this.app, this).open();
          return;
        }

        new SpotifyPlaylistModal(this.app, this.spotifyAdapter).open();
      }
    });

    this.addCommand({
      id: 'SearchSpotifyArtistCommand',
      name: 'Search Spotify Artist',
      callback: () => {
        // Ensure adapter has latest credentials
        this.spotifyAdapter.updateCredentials(this.settings.spotifyClientId, this.settings.spotifyAccessToken);

        new SearchSpotifyArtistCommand(
          this.app,
          this.spotifyAdapter,
          () => new SpotifyAuthModal(this.app, this).open()
        ).checkCallback(false);
      }
    });


    this.registerEvent(
      this.app.vault.on('rename', async (file, oldPath) => {
        // new EnhanceNoteCommand(this, llm).execute(file);
        if (file instanceof TFile) {
          new MetadataService(this.app).handleRename(file, oldPath);
        }
      }),
    );

    this.addSettingTab(new SettingsView(this.app, this));
    registerImageGalleryRenderer(this);
    registerSpotifyRenderer(this);
    registerGoogleMapsRenderer(this);
    this.registerMarkdownPostProcessor(createHeaderProgressRenderer(this.app));
    this.registerMarkdownPostProcessor(createHeaderMetadataRenderer(this.app));

    this.addCommand({
      id: 'CreateNoteFromImagesCommand',
      name: 'Create Note From Images (Gemini)',
      callback: () => {
        new CreateNoteFromImagesCommand(this.app, geminiImages).execute();
      }
    });

    this.registerView(
      LIVE_SESSION_VIEW_TYPE,
      (leaf) => {
        const view = new LiveSessionView(leaf);
        view.setPlugin(this);
        return view;
      }
    );

    this.addCommand({
      id: 'open-gemini-live-session',
      name: 'Open Gemini Live Session',
      callback: () => {
        this.activateView();
      }
    });

    this.addRibbonIcon('microphone', 'Gemini Live', () => {
      this.activateView();
    });

    this.addCommand({
      id: 'generate-header-metadata',
      name: 'Generate Header Metadata',
      callback: () => {
        new GenerateHeaderMetadataCommand(this.app).execute();
      }
    });

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

  async activateView() {
    const { workspace } = this.app;

    let leaf = workspace.getLeavesOfType(LIVE_SESSION_VIEW_TYPE)[0];

    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        await rightLeaf.setViewState({
          type: LIVE_SESSION_VIEW_TYPE,
          active: true,
        });
        leaf = workspace.getLeavesOfType(LIVE_SESSION_VIEW_TYPE)[0];
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }
}
