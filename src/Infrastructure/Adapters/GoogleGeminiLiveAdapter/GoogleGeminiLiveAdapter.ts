import { Notice } from 'obsidian';
import { AudioRecorder } from './AudioRecorder';
import { AudioPlayer } from './AudioPlayer';

const GEMINI_LIVE_URL =
    'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';

export class GoogleGeminiLiveAdapter {
    private ws: WebSocket | null = null;
    private audioRecorder: AudioRecorder;
    private audioPlayer: AudioPlayer;
    private apiKey: string;
    private isConnected: boolean = false;
    private initialContext: string = '';
    private isAiSpeaking: boolean = false;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
        this.audioPlayer = new AudioPlayer((isPlaying) => {
            this.isAiSpeaking = isPlaying;
        });
        this.audioRecorder = new AudioRecorder((base64Audio) => {
            this.sendAudioChunk(base64Audio);
        });
    }

    async connect(initialContext: string = ''): Promise<boolean> {
        this.initialContext = initialContext;
        if (!this.apiKey) {
            new Notice('Falta la API Key de Gemini');
            return false;
        }

        const url = `${GEMINI_LIVE_URL}?key=${this.apiKey}`;

        try {
            this.ws = new WebSocket(url);
        } catch (e) {
            console.error("Error creating WebSocket", e);
            new Notice("Error al crear la conexión WebSocket");
            return false;
        }

        return new Promise((resolve) => {
            if (!this.ws) return resolve(false);

            this.ws.onopen = async () => {
                console.log('Gemini Live WS Connected');
                this.isConnected = true;
                this.sendSetupMessage();

                // Start recording immediately upon connection (or can be manual)
                const micStarted = await this.audioRecorder.start();
                if (!micStarted) {
                    this.disconnect();
                    resolve(false);
                    return;
                }
                resolve(true);
            };

            this.ws.onmessage = async (event) => {
                await this.handleMessage(event);
            };

            this.ws.onerror = (error) => {
                console.error('Gemini Live WS Error:', error);
                new Notice('Error en la conexión con Gemini Live');
                this.disconnect();
            };

            this.ws.onclose = () => {
                console.log('Gemini Live WS Closed');
                this.disconnect();
            };
        });
    }

    disconnect(): void {
        this.isConnected = false;
        this.audioRecorder.stop();
        this.audioPlayer.clearQueue();

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    private sendSetupMessage(): void {
        if (!this.ws) return;

        const setupMsg: any = {
            setup: {
                model: 'models/gemini-2.0-flash-exp',
                generation_config: {
                    response_modalities: ['AUDIO'],
                },
            },
        };

        if (this.initialContext) {
            setupMsg.setup.system_instruction = {
                parts: [
                    { text: `Contexto de la nota activa:\n${this.initialContext}` }
                ]
            };
        }

        this.ws.send(JSON.stringify(setupMsg));
    }

    sendContextUpdate(fileName: string, content: string): void {
        if (!this.ws || !this.isConnected) return;

        const msg = {
            client_content: {
                turns: [{
                    role: 'user',
                    parts: [{ text: `SYSTEM UPDATE: User switched focus to note '${fileName}'. New content:\n${content}` }]
                }],
                turn_complete: true
            }
        };

        this.ws.send(JSON.stringify(msg));
    }

    private sendAudioChunk(base64Audio: string): void {
        if (!this.ws || !this.isConnected || this.isAiSpeaking) return;

        const msg = {
            realtime_input: {
                media_chunks: [
                    {
                        mime_type: 'audio/pcm',
                        data: base64Audio,
                    },
                ],
            },
        };

        this.ws.send(JSON.stringify(msg));
    }

    private async handleMessage(event: MessageEvent): Promise<void> {
        let data;
        try {
            if (event.data instanceof Blob) {
                data = JSON.parse(await event.data.text());
            } else {
                data = JSON.parse(event.data);
            }
        } catch (e) {
            console.error("Error parsing WS message", e);
            return;
        }

        // Log for debug (careful with huge logs)
        // console.log("WS Msg:", data);

        const parts = data?.serverContent?.modelTurn?.parts;
        if (parts && Array.isArray(parts)) {
            for (const part of parts) {
                if (part.inlineData && part.inlineData.mimeType.startsWith('audio/pcm')) {
                    this.audioPlayer.addPcmData(part.inlineData.data);
                }
            }
        }

        // Handle turn_complete to maybe interrupt audio? 
        // Usually we just play what we get.
    }
}
