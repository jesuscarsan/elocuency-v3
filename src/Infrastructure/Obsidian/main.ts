import { Plugin, TFile, MarkdownView } from 'obsidian';
import {
  DEFAULT_SETTINGS,
  UnresolvedLinkGeneratorSettings,
} from './settings';
import {
  ApplyTemplateCommand,
  ApplyGeocoderCommand,
  UpdatePlaceIdCommand,
  ApplyStreamBriefCommand,
  GenerateMissingNotesCommand,
  EnhanceNoteCommand,
  EnhanceByAiCommand,
  ApplyPlaceTypeCommand,
  AddImagesCommand,
  CreateReciprocityNotesCommand,
  ReallocateNoteCommand,
  AnalyzeAndLinkEntitiesCommand,
  SearchSpotifyArtistCommand,
  CreateNoteFromImagesCommand,
  ApplyTemplateFromImageCommand,
  GenerateHeaderMetadataCommand
} from '@/Infrastructure/Obsidian/Commands';
import { GoogleGeminiAdapter } from '../Adapters/GoogleGeminiAdapter/GoogleGeminiAdapter';
import { GoogleMapsAdapter } from '../Adapters/GoogleMapsAdapter/GoogleMapsAdapter';
import { GoogleImageSearchAdapter } from '../Adapters/GoogleImageSearchAdapter/GoogleImageSearchAdapter';
import {
  SettingsView,
} from '@/Infrastructure/Obsidian/Views/Settings/SettingsView';
import {
  registerSpotifyRenderer
} from '@/Infrastructure/Obsidian/Views/Renderers/SpotifyPlayer';
import {
  SpotifyModal
} from '@/Infrastructure/Obsidian/Views/Modals/SpotifyModal';
import {
  SpotifyPlaylistModal
} from '@/Infrastructure/Obsidian/Views/Modals/SpotifyPlaylistModal';
import {
  InputModal
} from '@/Infrastructure/Obsidian/Views/Modals/InputModal';
import {
  registerGoogleMapsRenderer
} from '@/Infrastructure/Obsidian/Views/Renderers/GoogleMapsRenderer';
import {
  registerImageGalleryRenderer
} from '@/Infrastructure/Obsidian/Views/Renderers/ImageGalleryRenderer';
import {
  SpotifyAuthModal
} from '@/Infrastructure/Obsidian/Views/Modals/SpotifyAuthModal';
import {
  ChatView,
  VIEW_TYPE_CHAT
} from '@/Infrastructure/Obsidian/Views/Chat/ChatView';
import {
  NoteOperationsView,
  VIEW_TYPE_NOTE_OPERATIONS
} from '@/Infrastructure/Obsidian/Views/NoteOperations/NoteOperationsView';
import { SpotifyAdapter } from '../Adapters/SpotifyAdapter/SpotifyAdapter';
import { MusicService } from '../../Application/Services/MusicService';
import { showMessage } from '@/Infrastructure/Obsidian/Utils/Messages';

import { GoogleGeminiImagesAdapter } from '../Adapters/GoogleGeminiAdapter/GoogleGeminiImagesAdapter';
import { createHeaderProgressRenderer } from './MarkdownPostProcessors/HeaderProgressRenderer';
import { MetadataService } from '../Services/MetadataService';
import { createHeaderMetadataRenderer } from './MarkdownPostProcessors/HeaderMetadataRenderer';
import { ObsidianSettingsAdapter } from '../Adapters/ObsidianSettingsAdapter';

import { ObsidianHeaderDataRepository } from '../Adapters/ObsidianHeaderDataRepository';
import { HeaderDataService } from '../../Application/Services/HeaderDataService';

export default class ObsidianExtension extends Plugin {
  settings: UnresolvedLinkGeneratorSettings = DEFAULT_SETTINGS;
  spotifyAdapter!: SpotifyAdapter;
  musicService!: MusicService;
  llm!: GoogleGeminiAdapter;

  // Registry of commands to be shared with NoteOperationsView
  public noteCommands: { id: string, name: string, callback: (file?: TFile) => any }[] = [];

  private lastActiveMarkdownFile: TFile | null = null;

  public getLastActiveMarkdownFile(): TFile | null {
    return this.lastActiveMarkdownFile;
  }

  async onload() {
    console.log(`Elocuency plugin loaded ${this.manifest.version}`);

    // Initialize with current file if active
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile && activeFile.extension === 'md') {
      this.lastActiveMarkdownFile = activeFile;
    }

    // Track active file changes
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', (leaf) => {
        if (leaf?.view instanceof MarkdownView) {
          this.lastActiveMarkdownFile = (leaf.view as MarkdownView).file;
        }
      })
    );

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
        showMessage('Spotify token expired. Please re-login.');
        new SpotifyAuthModal(this.app, this.musicService).open();
      }
    );

    const settingsAdapter = new ObsidianSettingsAdapter(this);
    this.musicService = new MusicService(this.spotifyAdapter, settingsAdapter);

    // --- Command Definitions ---
    // We define them here to access local variables (geocoder, geminiImages, etc)
    // and populate the noteCommands array.

    this.noteCommands = [
      {
        id: 'GenerateMissingNotesCommand',
        name: 'Create notes for unresolved links',
        callback: async () => {
          const generateMissingNotesCommand = new GenerateMissingNotesCommand(
            this.app,
            this.settings,
          );
          await generateMissingNotesCommand.execute();
        },
      },
      {
        id: 'ApplyTemplateCommand',
        name: 'Apply template',
        callback: (file?: TFile) => {
          const applyTemplateCommand = new ApplyTemplateCommand(
            this.llm,
            imageSearch,
            this.app,
            this.settings,
          );
          applyTemplateCommand.execute(file);
        },
      },
      {
        id: 'ApplyStreamBriefCommand',
        name: 'Apply stream brief',
        callback: () => {
          const applyStreamBriefCommand = new ApplyStreamBriefCommand(
            this.llm,
            this.app,
          );
          applyStreamBriefCommand.execute();
        },
      },
      {
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
      },
      {
        id: 'UpdatePlaceIdCommand',
        name: 'Update Place ID',
        callback: () => {
          const updatePlaceIdCommand = new UpdatePlaceIdCommand(
            geocoder,
            this.app,
          );
          updatePlaceIdCommand.execute();
        },
      },
      {
        id: 'EnhanceNoteCommand',
        name: 'Enhance note (Template + AI)',
        callback: (file?: TFile) => {
          const activeFile = file || this.app.workspace.getActiveFile();
          if (activeFile) {
            new EnhanceNoteCommand(this, this.llm).execute(activeFile);
          }
        },
      },
      {
        id: 'EnhanceByAiCommand',
        name: 'Enhance with AI',
        callback: (file?: TFile) => {
          new EnhanceByAiCommand(this.app, this.settings, this.llm).execute(file);
        },
      },
      {
        id: 'ApplyPlaceTypeCommand',
        name: 'Indicate Place Type',
        callback: () => {
          new ApplyPlaceTypeCommand(geocoder, this.llm, this.app).execute();
        },
      },
      {
        id: 'AddImagesCommand',
        name: 'Add Images',
        callback: () => {
          new AddImagesCommand(this.app, imageSearch).execute();
        },
      },
      {
        id: 'CreateReciprocityNotesCommand',
        name: 'Create Reciprocity Notes',
        callback: () => {
          new CreateReciprocityNotesCommand(this.app).execute();
        }
      },
      {
        id: 'ReallocateNoteCommand',
        name: 'Reallocate Note',
        callback: (file?: TFile) => {
          new ReallocateNoteCommand(this.app).execute(file);
        }
      },
      {
        id: 'SearchSpotifyTrack',
        name: 'Search Spotify Track',
        callback: () => {
          // Ensure adapter has latest credentials
          this.spotifyAdapter.updateCredentials(this.settings.spotifyClientId, this.settings.spotifyAccessToken);

          if (!this.spotifyAdapter.isAuthenticated()) {
            new SpotifyAuthModal(this.app, this.musicService).open();
            return;
          }

          new SpotifyModal(this.app, this.musicService).open();
        }
      },
      {
        id: 'ImportPlaylistTracks',
        name: 'Import Playlist Tracks',
        callback: async () => {
          this.spotifyAdapter.updateCredentials(this.settings.spotifyClientId, this.settings.spotifyAccessToken);

          if (!this.spotifyAdapter.isAuthenticated()) {
            new SpotifyAuthModal(this.app, this.musicService).open();
            return;
          }

          new SpotifyPlaylistModal(this.app, this.musicService).open();
        }
      },
      {
        id: 'SearchSpotifyArtistCommand',
        name: 'Search Spotify Artist',
        callback: () => {
          // Ensure adapter has latest credentials
          this.spotifyAdapter.updateCredentials(this.settings.spotifyClientId, this.settings.spotifyAccessToken);

          new SearchSpotifyArtistCommand(
            this.app,
            this.spotifyAdapter,
            () => new SpotifyAuthModal(this.app, this.musicService).open()
          ).checkCallback(false);
        }
      },
      {
        id: 'CreateNoteFromImagesCommand',
        name: 'Create Note From Images (Gemini)',
        callback: () => {
          new CreateNoteFromImagesCommand(this.app, geminiImages).execute();
        }
      },
      {
        id: 'AnalyzeAndLinkEntitiesCommand',
        name: 'Analyze and Link Entities',
        callback: (file?: TFile) => {
          new AnalyzeAndLinkEntitiesCommand(this.app, this.llm).execute(file);
        }
      },
      {
        id: 'ApplyTemplateFromImageCommand',
        name: 'Apply Template from Image (Gemini)',
        callback: () => {
          new ApplyTemplateFromImageCommand(geminiImages, this.app, this.settings).execute();
        }
      },
      {
        id: 'open-chat-session',
        name: 'Open Chat Session',
        callback: () => {
          this.activateView();
        }
      },
      {
        id: 'generate-header-metadata',
        name: 'Generate Header Metadata',
        callback: (file?: TFile) => {
          new GenerateHeaderMetadataCommand(this.app).execute(file);
        }
      }
    ];

    // Register all commands
    this.noteCommands.forEach(cmd => {
      this.addCommand({
        id: cmd.id,
        name: cmd.name,
        callback: cmd.callback
      });
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
    const headerDataRepo = new ObsidianHeaderDataRepository(this.app);
    const headerDataService = new HeaderDataService(headerDataRepo);

    this.registerMarkdownPostProcessor(createHeaderProgressRenderer(this.app, headerDataService));
    this.registerMarkdownPostProcessor(createHeaderMetadataRenderer(this.app, headerDataService));


    // --- View Registration ---

    // 1. Chat View
    this.registerView(
      VIEW_TYPE_CHAT,
      (leaf) => {
        const view = new ChatView(leaf);
        view.setPlugin(this);
        return view;
      }
    );

    // 2. Note Operations View
    this.registerView(
      VIEW_TYPE_NOTE_OPERATIONS,
      (leaf) => new NoteOperationsView(leaf, this)
    );

    // --- Ribbon Icons ---

    // Chat Session - Changed Icon to 'message-circle'
    this.addRibbonIcon('message-circle', 'Chat Session', () => {
      this.activateView();
    });

    // Note Operations - New Icon 'microphone'
    this.addRibbonIcon('microphone', 'Note Operations', () => {
      this.activateNoteOperationsView();
    });
  }

  onunload() {
    console.log('Elocuency plugin unloaded');
  }

  async loadSettings() {
    const data = await this.loadData();
    const merged = Object.assign({}, DEFAULT_SETTINGS, data);

    this.settings = merged;
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  public getNoteCommands() {
    return this.noteCommands;
  }

  async activateView() {
    const { workspace } = this.app;

    let leaf = workspace.getLeavesOfType(VIEW_TYPE_CHAT)[0];

    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        await rightLeaf.setViewState({
          type: VIEW_TYPE_CHAT,
          active: true,
        });
        leaf = workspace.getLeavesOfType(VIEW_TYPE_CHAT)[0];
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  async activateNoteOperationsView() {
    const { workspace } = this.app;

    let leaf = workspace.getLeavesOfType(VIEW_TYPE_NOTE_OPERATIONS)[0];

    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        await rightLeaf.setViewState({
          type: VIEW_TYPE_NOTE_OPERATIONS,
          active: true,
        });
        leaf = workspace.getLeavesOfType(VIEW_TYPE_NOTE_OPERATIONS)[0];
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }
}
