import { Notice } from 'obsidian';

export class AudioRecorder {
    private mediaStream: MediaStream | null = null;
    private audioContext: AudioContext | null = null;
    private processor: ScriptProcessorNode | null = null;
    private input: MediaStreamAudioSourceNode | null = null;
    private onDataAvailable: (base64Audio: string) => void;

    constructor(onDataAvailable: (base64Audio: string) => void) {
        this.onDataAvailable = onDataAvailable;
    }

    async start(): Promise<boolean> {
        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: 16000,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });

            this.audioContext = new AudioContext({
                sampleRate: 16000,
            });

            this.input = this.audioContext.createMediaStreamSource(this.mediaStream);

            // Buffer size 4096 gives ~256ms of audio at 16kHz
            this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

            this.processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                this.processAudio(inputData);
            };

            this.input.connect(this.processor);
            this.processor.connect(this.audioContext.destination);

            return true;
        } catch (error) {
            console.error('Error starting audio recording:', error);
            new Notice('No se pudo acceder al micrófono.');
            return false;
        }
    }

    stop(): void {
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach((track) => track.stop());
            this.mediaStream = null;
        }

        if (this.processor) {
            this.processor.disconnect();
            this.processor = null;
        }

        if (this.input) {
            this.input.disconnect();
            this.input = null;
        }

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
    }

    private processAudio(inputData: Float32Array): void {
        // Convert Float32Array to Int16Array (PCM)
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
            // Clamp values to [-1, 1] and scale to 16-bit range
            const s = Math.max(-1, Math.min(1, inputData[i]));
            pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // Convert Int16Array to Base64
        const buffer = pcmData.buffer;
        const base64 = this.arrayBufferToBase64(buffer);

        this.onDataAvailable(base64);
    }

    private arrayBufferToBase64(buffer: ArrayBuffer): string {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }
}
