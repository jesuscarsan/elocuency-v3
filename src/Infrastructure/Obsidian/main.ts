import { Plugin, TFile, MarkdownView } from 'obsidian';
import {
  DEFAULT_SETTINGS,
  UnresolvedLinkGeneratorSettings,
} from './settings';
import {
  ApplyTemplateCommand,
  EnrichPlaceCommand,
  ApplyStreamBriefCommand,
  GenerateMissingNotesCommand,
  EnhanceNoteCommand,
  EnhanceByAiCommand,

  AddImagesCommand,
  CreateReciprocityNotesCommand,
  ReallocateNoteCommand,
  AnalyzeAndLinkEntitiesCommand,
  SearchSpotifyArtistCommand,
  CreateNoteFromImagesCommand,
  ApplyTemplateFromImageCommand,
  GenerateHeaderMetadataCommand,
  AddPlaceIdFromUrlCommand
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
        id: 'ApplyTemplateCommand',
        name: 'Nota: Aplica plantilla',
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
        name: 'Nota: Añade resumen',
        callback: (file?: TFile) => {
          const applyStreamBriefCommand = new ApplyStreamBriefCommand(
            this.llm,
            this.app,
          );
          applyStreamBriefCommand.execute(file);
        },
      },
      {
        id: 'EnhanceNoteCommand',
        name: 'Nota: Enriquece con plantilla y IA (ELIMINAR)',
        callback: (file?: TFile) => {
          const activeFile = file || this.app.workspace.getActiveFile();
          if (activeFile) {
            new EnhanceNoteCommand(this, this.llm).execute(activeFile);
          }
        },
      },
      {
        id: 'EnhanceByAiCommand',
        name: 'Nota: Enriquece con IA',
        callback: (file?: TFile) => {
          new EnhanceByAiCommand(this.app, this.settings, this.llm).execute(file);
        },
      },
      {
        id: 'AddImagesCommand',
        name: 'Nota: Añade imágenes',
        callback: (file?: TFile) => {
          new AddImagesCommand(this.app, imageSearch).execute(file);
        },
      },
      {
        id: 'CreateNoteFromImagesCommand',
        name: 'Nota: Crea nota a partir de imágenes (Gemini)',
        callback: (file?: TFile) => {
          new CreateNoteFromImagesCommand(this.app, geminiImages).execute(file);
        }
      },
      {
        id: 'ApplyTemplateFromImageCommand',
        name: 'Nota: Aplica plantilla a partir de imágenes (Gemini)',
        callback: (file?: TFile) => {
          new ApplyTemplateFromImageCommand(geminiImages, this.app, this.settings).execute(file);
        }
      },
      {
        id: 'generate-header-metadata',
        name: 'Nota: Genera metadatos de encabezado',
        callback: (file?: TFile) => {
          new GenerateHeaderMetadataCommand(this.app).execute(file);
        }
      },
      {
        id: 'ReallocateNoteCommand',
        name: 'Nota: Reubica',
        callback: (file?: TFile) => {
          new ReallocateNoteCommand(this.app).execute(file);
        }
      },

      {
        id: 'GenerateMissingNotesCommand',
        name: 'Links: Create notas para links sin notas',
        callback: async (file?: TFile) => {
          const generateMissingNotesCommand = new GenerateMissingNotesCommand(
            this.app,
            this.settings,
          );
          await generateMissingNotesCommand.execute(file);
        },
      },
      {
        id: 'CreateReciprocityNotesCommand',
        name: 'Links: Crea links reciprocos',
        callback: (file?: TFile) => {
          new CreateReciprocityNotesCommand(this.app).execute(file);
        }
      },
      {
        id: 'AnalyzeAndLinkEntitiesCommand',
        name: 'Links: Analiza y enlaza entidades',
        callback: (file?: TFile) => {
          new AnalyzeAndLinkEntitiesCommand(this.app, this.llm).execute(file);
        }
      },

      {
        id: 'EnrichPlaceCommand',
        name: 'Lugares: Enriquecer Nota (Detectar Tipo + Mover)',
        callback: (file?: TFile) => {
          new EnrichPlaceCommand(geocoder, this.llm, this.app).execute(file);
        },
      },
      {
        id: 'AddPlaceIdFromUrlCommand',
        name: 'Lugares: Añadir Place Id desde URL',
        callback: (file?: TFile) => {
          new AddPlaceIdFromUrlCommand(geocoder, this.llm, this.app).execute(file);
        },
      },

      {
        id: 'SearchSpotifyTrack',
        name: 'Spotify: Busca canción',
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
        name: 'Spotify: Importa canciones de playlist',
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
        name: 'Spotify: Busca artista',
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
      // {
      //   id: 'open-chat-session',
      //   name: 'Chat: Abre sesión',
      //   callback: () => {
      //     this.activateView();
      //   }
      // },
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
