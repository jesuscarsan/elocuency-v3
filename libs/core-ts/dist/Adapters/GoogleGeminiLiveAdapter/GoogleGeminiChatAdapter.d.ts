import { IGeminiSessionAdapter } from './IGeminiSessionAdapter';
export declare class GoogleGeminiChatAdapter implements IGeminiSessionAdapter {
    private client;
    private apiKey;
    private history;
    private systemInstruction;
    private modelName;
    private config;
    private tools;
    private onTextReceived;
    private onScoreReceived;
    private onUserTextReceived;
    constructor(apiKey: string, onTextReceived?: (text: string) => void, onScoreReceived?: (score: number) => void, onUserTextReceived?: (text: string) => void);
    connect(systemInstruction: string, enableScoreTracking: boolean, voice: string, temperature: number, topP: number): Promise<boolean>;
    disconnect(): void;
    sendText(text: string): Promise<void>;
    private generateResponse;
    sendContextUpdate(fileName: string, content: string): void;
    sendFunctionResponse(name: string, id: string, response: any): Promise<void>;
    resumeAudio(): Promise<void>;
}
