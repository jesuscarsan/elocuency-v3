export interface IGeminiSessionAdapter {
    connect(systemInstruction: string, enableScoreTracking: boolean, voice: string, temperature: number, topP: number): Promise<boolean>;
    disconnect(): void;
    sendText(text: string): void;
    sendContextUpdate(fileName: string, content: string): void;
    resumeAudio(): Promise<void>;
}
