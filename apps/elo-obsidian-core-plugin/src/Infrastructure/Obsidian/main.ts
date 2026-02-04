import { Plugin, TFile, MarkdownView, Platform } from 'obsidian';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import {
  DEFAULT_SETTINGS,
  UnresolvedLinkGeneratorSettings,
} from './settings';
import {
  ApplyTemplateCommand,
  EnrichPlaceCommand,
  RelocatePlaceNoteCommand,
  ApplyStreamBriefCommand,
  GenerateMissingNotesFromLinksCommand,
  EnhanceByAiCommand,

  AddImagesCommand,
  CreateReciprocityLinksNotesCommand,
  RelocateNoteByLinkFieldCommand,
  AnalyzeAndLinkEntitiesCommand,
  SearchSpotifyArtistCommand,
  CreateNoteFromImagesCommand,
  ApplyTemplateFromImageCommand,
  GenerateHeaderMetadataCommand,
  AddPlaceIdFromUrlCommand,
  GenerateMissingNotesFromListFieldCommand,
  InsertLinkToSelectedPhotoCommand,
  OpenLinkedPhotoCommand,
  EnrichWithPromptUrlCommand,
  ApplyTemplateWithUrlCommand,
  SyncCurrentContactCommand,
  SyncGoogleContactsCommand,
  ProcessUnsyncedGoogleContactsCommand,
  ImportKeepTakeoutCommand,
  ImportSpotifyPlaylistCommand,
  NaturalLanguageSearchCommand,
  TokenizeAndCreateDictionaryNotesCommand,
  DownloadSubtitlesCommand
} from '@/Infrastructure/Obsidian/Commands';


import { CommandEnum } from "@elo/core";
import { GoogleGeminiAdapter } from "@elo/core";

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

import { GoogleGeminiImagesAdapter } from "@elo/core";
import { createHeaderProgressRenderer } from './MarkdownPostProcessors/HeaderProgressRenderer';
import { MetadataService } from '../Services/MetadataService';
import { createHeaderMetadataRenderer } from './MarkdownPostProcessors/HeaderMetadataRenderer';
import { ObsidianSettingsAdapter } from '../Adapters/ObsidianSettingsAdapter';

import { ObsidianHeaderDataRepository } from '../Adapters/ObsidianHeaderDataRepository';
import { HeaderDataService } from '../../Application/Services/HeaderDataService';
import { ImageEnricherService } from './Services/ImageEnricherService';
import { FrontmatterEventService } from './Services/FrontmatterEventService';
import { BridgeService } from './Services/BridgeService';


export default class ObsidianExtension extends Plugin {
  settings: UnresolvedLinkGeneratorSettings = DEFAULT_SETTINGS;
  spotifyAdapter!: SpotifyAdapter;
  musicService!: MusicService;
  llm!: GoogleGeminiAdapter;

  // Registry of commands to be shared with NoteOperationsView
  public noteCommands: { id: string, name: string, callback: (file?: TFile) => any }[] = [];

  // private photosBridgeProcess: ChildProcess | null = null; // Moved to BridgeService
  public bridgeService!: BridgeService;
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
    const imageEnricher = new ImageEnricherService(imageSearch);

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

    // Initialize Bridge Service
    this.bridgeService = new BridgeService(this.settings);

    // Initialize Frontmatter Event Service
    new FrontmatterEventService(this.app);

    // Apply hide-empty-properties class if enabled
    if (this.settings.hideEmptyProperties) {
      document.body.classList.add('hide-empty-properties');
    }

    // --- Command Definitions ---

    // We define them here to access local variables (geocoder, geminiImages, etc)
    // and populate the noteCommands array.

    this.noteCommands = [
      {
        id: CommandEnum.ApplyTemplate,
        name: 'Plantilla: Aplica plantilla',
        callback: async (file?: TFile) => {
          const applyTemplateCommand = new ApplyTemplateCommand(
            this.llm,
            imageEnricher,
            this.app,
            this.settings,
          );
          await applyTemplateCommand.execute(file);
        },
      },
      {
        id: CommandEnum.ApplyTemplateWithUrl,
        name: 'Plantilla: Aplica plantilla con URL',
        callback: async (file?: TFile) => {
          const command = new ApplyTemplateWithUrlCommand(
            this.llm,
            imageEnricher,
            this.app,
            this.settings,
          );
          await command.execute(file);
        },
      },
      // {
      //   id: CommandEnum.ApplyStreamBrief,
      //   name: 'Nota: Añade resumen',
      //   callback: async (file?: TFile) => {
      //     const applyStreamBriefCommand = new ApplyStreamBriefCommand(
      //       this.llm,
      //       this.app,
      //     );
      //     await applyStreamBriefCommand.execute(file);
      //   },
      // },
      {
        id: CommandEnum.EnhanceByAi,
        name: 'IA: Enriquece con IA',
        callback: async (file?: TFile) => {
          await new EnhanceByAiCommand(this.app, this.settings, this.llm).execute(file);
        },
      },
      {
        id: CommandEnum.EnrichWithPromptUrl,
        name: 'IA: Enriquecer con url [EnrichWithPromptUrlCommand]',
        callback: async (file?: TFile) => {
          await new EnrichWithPromptUrlCommand(this.llm, imageEnricher, this.app, this.settings).execute(file);
        }
      },

      {
        id: CommandEnum.AddImages,
        name: 'Imagenes: Añade imágenes [AddImagesCommand]',
        callback: async (file?: TFile) => {
          await new AddImagesCommand(this.app, imageEnricher).execute(file);
        },
      },
      {
        id: CommandEnum.CreateNoteFromImages,
        name: 'Imagenes: Crea nota a partir de imágenes [CreateNoteFromImagesCommand]',
        callback: async (file?: TFile) => {
          await new CreateNoteFromImagesCommand(this.app, geminiImages).execute(file);
        }
      },
      {
        id: CommandEnum.ApplyTemplateFromImage,
        name: 'Imagenes: Aplica plantilla a partir de imágenes [ApplyTemplateFromImageCommand]',
        callback: async (file?: TFile) => {
          await new ApplyTemplateFromImageCommand(geminiImages, this.app, this.settings).execute(file);
        }
      },
      // {
      //   id: CommandEnum.GenerateHeaderMetadata,
      //   name: 'Nota: Genera metadatos de encabezado',
      //   callback: async (file?: TFile) => {
      //     await new GenerateHeaderMetadataCommand(this.app).execute(file);
      //   }
      // },
      {
        id: CommandEnum.RelocateNoteByLinkField,
        name: 'Reubica: [RelocateNoteByLinkFieldCommand]',
        callback: async (file?: TFile) => {
          await new RelocateNoteByLinkFieldCommand(this.app).execute(file);
        }
      },

      {
        id: CommandEnum.GenerateMissingNotesFromLinks,
        name: 'Links: Create notas para links sin notas [GenerateMissingNotesFromLinksCommand]',
        callback: async (file?: TFile) => {
          const generateMissingNotesCommand = new GenerateMissingNotesFromLinksCommand(
            this.app,
            this.settings,
          );
          await generateMissingNotesCommand.execute(file);
        },
      },
      {
        id: CommandEnum.CreateReciprocityLinksNotes,
        name: 'Links: Crea links reciprocos [CreateReciprocityLinksNotesCommand]',
        callback: async (file?: TFile) => {
          await new CreateReciprocityLinksNotesCommand(this.app).execute(file);
        }
      },
      {
        id: CommandEnum.AnalyzeAndLinkEntities,
        name: 'Links: Analiza y enlaza entidades [AnalyzeAndLinkEntitiesCommand]',
        callback: async (file?: TFile) => {
          await new AnalyzeAndLinkEntitiesCommand(this.app, this.llm).execute(file);
        }
      },
      {
        id: CommandEnum.GenerateMissingNotesFromListField,
        name: 'Links: Genera notas faltantes desde campo lista',
        callback: async (file?: TFile) => {
          await new GenerateMissingNotesFromListFieldCommand(this.app, this.settings, this.llm, imageEnricher).execute(file);
        }
      },


      {
        id: CommandEnum.EnrichPlace,
        name: 'Lugares: Enriquece Nota',
        callback: async (file?: TFile) => {
          await new EnrichPlaceCommand(geocoder, this.llm, this.app).execute(file);
        },
      },
      {
        id: CommandEnum.RelocatePlaceNote,
        name: 'Lugares: Reubica Nota',
        callback: async (file?: TFile) => {
          await new RelocatePlaceNoteCommand(this.app).execute(file);
        },
      },
      {
        id: CommandEnum.AddPlaceIdFromUrl,
        name: 'Lugares: Añadir Place Id desde URL',
        callback: async (file?: TFile) => {
          await new AddPlaceIdFromUrlCommand(geocoder, this.llm, this.app).execute(file);
        },
      },

      {
        id: CommandEnum.SearchSpotifyTrack,
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
        id: CommandEnum.ImportPlaylistTracks,
        name: 'Spotify: Importa canciones de playlist',
        callback: async () => {
          this.spotifyAdapter.updateCredentials(this.settings.spotifyClientId, this.settings.spotifyAccessToken);

          new ImportSpotifyPlaylistCommand(
            this.app,
            this.spotifyAdapter,
            this.musicService,
            () => new SpotifyAuthModal(this.app, this.musicService).open()
          ).checkCallback(false);
        }
      },
      {
        id: CommandEnum.SearchSpotifyArtist,
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
      {
        id: CommandEnum.InsertLinkToSelectedPhoto,
        name: 'Photos: Insertar Link a Foto Seleccionada',
        callback: async (file?: TFile) => {
          await new InsertLinkToSelectedPhotoCommand(this.app).execute(file);
        }
      },
      {
        id: CommandEnum.OpenLinkedPhoto,
        name: 'Photos: Abrir Foto Enlazada',
        callback: async (file?: TFile) => {
          await new OpenLinkedPhotoCommand(this.app).execute(file);
        }
      },
      {
        id: CommandEnum.SyncContacts,
        name: 'Contactos: Sincronizar Personas [SyncCurrentContactCommand]',
        callback: async (file?: TFile) => {
          await new SyncCurrentContactCommand(this.app, this.bridgeService).execute(file);
        }
      },
      {
        id: 'elo-sync-google-contacts', // Using explicit ID as it's not in Enum yet, or update Enum.
        name: 'Contactos: Sincronizar Nota Activa con Google [SyncGoogleContactsCommand]',
        callback: async (file?: TFile) => {
          await new SyncGoogleContactsCommand(this.app, this).execute(file);
        }
      },
      {
        id: 'elo-process-unsynced-google-contacts',
        name: 'Contactos: Procesar No Sincronizados de Google [ProcessUnsyncedGoogleContactsCommand]',
        callback: async () => {
          await new ProcessUnsyncedGoogleContactsCommand(this.app, this).execute();
        }
      },
      {
        id: 'elo-import-keep-takeout',
        name: 'Google Keep: Importar desde Takeout',
        callback: async () => {
          await new ImportKeepTakeoutCommand(this.app).execute();
        }
      },
      {
        id: 'elo-natural-language-search',
        name: 'Búsqueda: Lenguaje Natural [NaturalLanguageSearchCommand]',
        callback: async () => {
          await new NaturalLanguageSearchCommand(this.app, this.llm).execute();
        }
      },
      // {
      //   id: 'open-chat-session',
      //   name: 'Chat: Abre sesión',
      //   callback: () => {
      //     this.activateView();
      //   }
      // },
      {
        id: 'start-bridge',
        name: 'Bridge: Iniciar Bridge (Manual)',
        callback: () => {
          this.bridgeService.startBridge(true); // Forced start
        }
      },
      {
        id: CommandEnum.TokenizeAndCreateDictionaryNotes,
        name: 'Diccionario: Tokenizar y crear notas [TokenizeAndCreateDictionaryNotesCommand]',
        callback: async (file?: TFile) => {
          await new TokenizeAndCreateDictionaryNotesCommand(this.app, this.settings).execute(file);
        }
      },
      {
        id: 'elo-download-subtitles',
        name: 'Series: Descargar Subtítulos [DownloadSubtitlesCommand]',
        callback: async (file?: TFile) => {
          // We need to invoke it properly.
          const commandObj = new DownloadSubtitlesCommand(this).getCommand();
          const editor = this.app.workspace.activeEditor?.editor;
          const leaf = this.app.workspace.getLeavesOfType('markdown')[0];
          const view = leaf?.view as MarkdownView;

          if (editor && view && commandObj.editorCallback) {
            await commandObj.editorCallback(editor, view);
          }
        }
      },
      {
        id: CommandEnum.ToggleHideEmptyProperties,
        name: 'Propiedades: Ocultar/Mostrar propiedades vacías',
        callback: async () => {
          this.settings.hideEmptyProperties = !this.settings.hideEmptyProperties;
          await this.saveSettings();
          document.body.classList.toggle('hide-empty-properties', this.settings.hideEmptyProperties);

          const status = this.settings.hideEmptyProperties ? 'ocultas' : 'visibles';
          showMessage(`Propiedades vacías ${status}`);
        }
      },
      {
        id: 'stop-bridge',
        name: 'Bridge: Detener Bridge',
        callback: () => {
          this.bridgeService.stopBridge();
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

    // Start PhotosBridge if on Desktop (macOS) AND enabled
    if (Platform.isDesktop && this.settings.autoStartBridge) {
      this.bridgeService.startBridge();
    }
  }

  onunload() {
    console.log('Elocuency plugin unloaded');
    this.bridgeService.stopBridge();
  }



  async loadSettings() {
    const data = await this.loadData();
    const merged = Object.assign({}, DEFAULT_SETTINGS, data);

    this.settings = merged;
  }

  async saveSettings() {
    await this.saveData(this.settings);
    if (this.bridgeService) {
      this.bridgeService.updateSettings(this.settings);
    }
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
