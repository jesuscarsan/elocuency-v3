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
    private systemInstruction: string = '';
    private isAiSpeaking: boolean = false;

    private onTextReceived: (text: string) => void;
    private onScoreReceived: (score: number) => void;

    constructor(apiKey: string, onTextReceived?: (text: string) => void, onScoreReceived?: (score: number) => void) {
        this.apiKey = apiKey;
        this.onTextReceived = onTextReceived || (() => { });
        this.onScoreReceived = onScoreReceived || (() => { });
        this.audioPlayer = new AudioPlayer((isPlaying) => {
            this.isAiSpeaking = isPlaying;
        });
        this.audioRecorder = new AudioRecorder((base64Audio) => {
            this.sendAudioChunk(base64Audio);
        });
    }

    async connect(systemInstruction: string = '', enableScoreTracking: boolean = false, voice: string = 'Aoede', temperature: number = 0.5): Promise<boolean> {
        this.systemInstruction = systemInstruction;
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
                this.sendSetupMessage(enableScoreTracking, voice, temperature);

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

    private sendSetupMessage(enableScoreTracking: boolean, voice: string, temperature: number): void {
        if (!this.ws) return;

        const setupMsg: any = {
            setup: {
                model: 'models/gemini-2.0-flash-exp',
                generation_config: {
                    response_modalities: ["TEXT", "AUDIO"],
                    temperature: temperature,
                    speech_config: {
                        voice_config: {
                            prebuilt_voice_config: {
                                voice_name: voice
                            }
                        }
                    }
                },
            },
        };

        if (enableScoreTracking) {
            console.log("Enabling Score Tracking Tool in Setup");
            setupMsg.setup.tools = [
                {
                    function_declarations: [
                        {
                            name: 'report_score',
                            description: 'Report the score of the user\'s answer effectiveness.',
                            parameters: {
                                type: 'OBJECT',
                                properties: {
                                    score: {
                                        type: 'INTEGER',
                                        description: 'The score of the answer from 0 to 10.',
                                    },
                                },
                                required: ['score'],
                            },
                        },
                    ],
                },
            ];
        }

        if (this.systemInstruction) {
            let finalInstruction = this.systemInstruction;
            if (enableScoreTracking) {
                finalInstruction += '\n\nIMPORTANT: You are configured to track the user\'s answer quality. When the user answers, you MUST evaluate it and call the "report_score" function with a score from 0 to 10. HOWEVER, you MUST ALSO provide a verbal response and feedback to the user. Do not just call the function and go silent. Speak to the user.';
            }

            setupMsg.setup.system_instruction = {
                parts: [
                    { text: finalInstruction }
                ]
            };
        }

        console.log("Sending Setup Msg:", JSON.stringify(setupMsg, null, 2));

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

    private chunkCount = 0;

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

        this.chunkCount++;
        if (this.chunkCount % 50 === 0) {
            // console.log(`Sending Audio Chunk #${this.chunkCount} (size: ${base64Audio.length})`);
        }

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
        console.log("WS Msg:", JSON.stringify(data, null, 2));

        // Handle tool calls / function calls
        // In some API versions this might be deeper or slightly different named,
        // but typically it is in modelTurn parts or toolCall.
        // Let's check modelTurn parts first.

        const serverContent = data?.serverContent;
        if (!serverContent) {
            console.log("No serverContent in message", data);
            // Could be tool_response confirmation or something else
            return;
        }

        const modelTurn = serverContent.modelTurn;
        // console.log("Model Turn:", modelTurn);
        if (!modelTurn || !modelTurn.parts) {
            console.log("No modelTurn or parts in message", serverContent);
            // It might be turnComplete or interrupted
            if (serverContent.turnComplete) {
                console.log("Turn Complete");
            }
            return;
        }

        const parts = modelTurn.parts;
        if (parts && Array.isArray(parts)) {
            for (const part of parts) {
                if (part.inlineData && part.inlineData.mimeType.startsWith('audio/pcm')) {
                    this.audioPlayer.addPcmData(part.inlineData.data);
                } else if (part.text) {
                    console.log("Received Text Part:", part.text);
                    this.onTextReceived(part.text);
                } else if (part.functionCall) {
                    console.log('Gemini Live: Function Call detected', part.functionCall);
                    // Handle function call
                    if (part.functionCall.name === 'report_score') {
                        const args = part.functionCall.args;
                        console.log('Gemini Live: report_score args:', args);

                        let score = args?.score;
                        // Handle string or number
                        if (typeof score === 'string') {
                            score = parseInt(score, 10);
                        }

                        if (typeof score === 'number' && !isNaN(score)) {
                            console.log('Gemini Live: Emitting score event:', score);
                            this.onScoreReceived(score);
                        } else {
                            console.warn('Gemini Live: Invalid score received:', args);
                        }
                    }

                    const responseId = part.functionCall.id || 'no-id'; // standard fallback
                    this.sendFunctionResponse(part.functionCall.name, responseId, { status: 'ok' });
                } else if (part.executableCode) {
                    console.log('Gemini Live: Executable Code detected', part.executableCode);
                    const code = part.executableCode.code;
                    if (code) {
                        // Look for report_score(score=X) or report_score(X)
                        // The user saw: "default_api.report_score(score=10)\n"
                        const match = code.match(/report_score\s*\(\s*(?:score\s*=\s*)?(\d+)\s*\)/);
                        if (match && match[1]) {
                            const score = parseInt(match[1], 10);
                            console.log('Gemini Live: Parsed score from code:', score);
                            if (!isNaN(score)) {
                                this.onScoreReceived(score);
                            }
                        }
                    }
                }
            }
        }
    }

    private sendFunctionResponse(name: string, id: string, result: any): void {
        if (!this.ws || !this.isConnected) return;

        const msg = {
            tool_response: {
                function_responses: [
                    {
                        name: name,
                        id: id,
                        response: { result: result }
                    }
                ]
            }
        };
        this.ws.send(JSON.stringify(msg));
    }
}
