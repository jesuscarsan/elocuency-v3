
import { Plugin, Platform } from 'obsidian';
import { GoogleContactPluginSettings, DEFAULT_SETTINGS } from './settings';
import { SyncContactsCommand } from './Commands/SyncContactsCommand';
import { SyncGoogleContactsCommand } from './Commands/SyncGoogleContactsCommand';
import { ProcessUnsyncedGoogleContactsCommand } from './Commands/ProcessUnsyncedGoogleContactsCommand';
import { BridgeService } from '../Adapters/BridgeService';
import { SettingsView } from './Views/SettingsView';

export default class EloGoogleContactsPlugin extends Plugin {
    settings: GoogleContactPluginSettings = DEFAULT_SETTINGS;
    bridgeService!: BridgeService;

    async onload() {
        console.log(`Elocuency Google Contacts plugin loaded ${this.manifest.version}`);

        await this.loadSettings();

        // Initialize Bridge Service (Adapter)
        this.bridgeService = new BridgeService(this.settings);
        
        // --- Commands ---
        const syncMacCommand = new SyncContactsCommand(this.app, this.bridgeService);
        this.addCommand({
            id: syncMacCommand.id,
            name: syncMacCommand.name,
            callback: () => syncMacCommand.execute()
        });

        const syncGoogleCommand = new SyncGoogleContactsCommand(this.app, this);
        this.addCommand({
            id: syncGoogleCommand.id,
            name: syncGoogleCommand.name,
            callback: () => syncGoogleCommand.execute()
        });

        const processUnsyncedCommand = new ProcessUnsyncedGoogleContactsCommand(this.app, this);
        this.addCommand({
            id: processUnsyncedCommand.id,
            name: processUnsyncedCommand.name,
            callback: () => processUnsyncedCommand.execute()
        });

        // Add Bridge Start/Stop Commands manually for convenience?
        this.addCommand({
            id: 'start-bridge',
            name: 'Bridge: Iniciar Bridge (Manual)',
            callback: () => {
                this.bridgeService.startBridge(true);
            }
        });

        this.addCommand({
            id: 'stop-bridge',
            name: 'Bridge: Detener Bridge',
            callback: () => {
                this.bridgeService.stopBridge();
            }
        });

        // --- Settings ---
        this.addSettingTab(new SettingsView(this.app, this));

        // Auto-start Bridge if enabled
        if (Platform.isDesktop && this.settings.autoStartBridge) {
            this.bridgeService.startBridge();
        }
    }

    onunload() {
        console.log('Elocuency Google Contacts plugin unloaded');
        this.bridgeService.stopBridge();
    }

    async loadSettings() {
        const data = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    }

    async saveSettings() {
        await this.saveData(this.settings);
        if (this.bridgeService) {
            this.bridgeService.updateSettings(this.settings);
        }
    }
}
