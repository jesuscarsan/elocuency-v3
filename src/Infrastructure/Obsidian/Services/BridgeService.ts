
import { spawn, ChildProcess } from 'child_process';
import { showMessage } from '@/Infrastructure/Obsidian/Utils/Messages';
import { UnresolvedLinkGeneratorSettings } from '../settings';

export class BridgeService {
    private photosBridgeProcess: ChildProcess | null = null;
    private settings: UnresolvedLinkGeneratorSettings;

    constructor(settings: UnresolvedLinkGeneratorSettings) {
        this.settings = settings;
    }

    public updateSettings(settings: UnresolvedLinkGeneratorSettings) {
        this.settings = settings;
    }

    public async startBridge(force = false) {
        if (this.photosBridgeProcess) {
            showMessage('PhotosBridge ya está ejecutándose.');
            return;
        }

        const executable = this.settings.photosBridgePath;

        if (!executable) {
            showMessage('Ruta de PhotosBridge no configurada.');
            return;
        }

        console.log(`Starting PhotosBridge at ${executable}...`);

        try {
            this.photosBridgeProcess = spawn(executable, [], {
                detached: false,
                stdio: ['ignore', 'pipe', 'pipe']
            });

            this.photosBridgeProcess.stdout?.on('data', (data) => {
                console.log(`[PhotosBridge] ${data}`);
            });

            this.photosBridgeProcess.stderr?.on('data', (data) => {
                console.error(`[PhotosBridge] ${data}`);
                if (data.toString().includes('Address already in use')) {
                    console.log('[PhotosBridge] Port busy, assuming external bridge is active.');
                    // Optionally notify user, but usually this means another instance is running
                    // We don't nullify process here immediately to avoid rapid restart loops if managed externally,
                    // but for our internal tracking, if it exits, the exit handler will clean up.
                }
            });

            this.photosBridgeProcess.on('error', (err) => {
                console.error('PhotosBridge failed to start:', err);
                showMessage('Error al iniciar PhotosBridge (Native)');
                this.photosBridgeProcess = null;
            });

            this.photosBridgeProcess.on('exit', (code) => {
                console.log(`PhotosBridge exited with code ${code}`);
                this.photosBridgeProcess = null;
            });

            this.photosBridgeProcess.unref();
            console.log('PhotosBridge process spawned.');
            showMessage('PhotosBridge iniciado.');
        } catch (e) {
            console.error('Exception starting PhotosBridge:', e);
            showMessage('Excepción al iniciar Bridge.');
        }
    }

    public stopBridge() {
        if (this.photosBridgeProcess) {
            console.log('Stopping PhotosBridge...');
            this.photosBridgeProcess.kill();
            this.photosBridgeProcess = null;
            showMessage('PhotosBridge detenido.');
        } else {
            showMessage('PhotosBridge no estaba corriendo.');
        }
    }

    public isRunning(): boolean {
        return this.photosBridgeProcess !== null;
    }

    public async upsertContact(data: any): Promise<any> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            const response = await fetch('http://localhost:27345/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`Bridge Error: ${response.statusText}`);
            }
            return await response.json();
        } catch (e) {
            console.error('Failed to upsert contact:', e);
            throw e;
        }
    }

    public async searchContacts(query: string): Promise<any[]> {
        try {
            const response = await fetch(`http://localhost:27345/contacts?query=${encodeURIComponent(query)}`);
            if (!response.ok) {
                throw new Error(`Bridge Error: ${response.statusText}`);
            }
            return await response.json();
        } catch (e) {
            console.error('Failed to search contacts:', e);
            return [];
        }
    }
}
