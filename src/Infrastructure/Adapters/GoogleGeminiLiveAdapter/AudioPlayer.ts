export class AudioPlayer {
    private audioContext: AudioContext;
    private isPlaying: boolean = false;
    private startTime: number = 0;
    private queue: ArrayBuffer[] = [];
    private onStateChange: (isPlaying: boolean) => void;

    constructor(onStateChange?: (isPlaying: boolean) => void) {
        this.onStateChange = onStateChange || (() => { });
        // Gemini output typically defaults to 24000Hz
        this.audioContext = new AudioContext({ sampleRate: 24000 });
    }

    async resume(): Promise<void> {
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }

    addPcmData(base64Data: string): void {
        const pcmData = this.base64ToArrayBuffer(base64Data);
        this.queue.push(pcmData);
        this.scheduleNextBuffer();
    }

    private scheduleNextBuffer(): void {
        if (this.queue.length === 0) return;

        if (!this.isPlaying) {
            this.isPlaying = true;
            this.onStateChange(true);
            this.startTime = this.audioContext.currentTime + 0.1; // Small buffer
        }

        const nextBuffer = this.queue.shift();
        if (nextBuffer) {
            this.playBuffer(nextBuffer);
        }
    }

    private playBuffer(arrayBuffer: ArrayBuffer): void {
        // Assuming 16-bit PCM, 1 channel, 24kHz (default Gemini output)
        const int16Array = new Int16Array(arrayBuffer);
        const float32Array = new Float32Array(int16Array.length);

        for (let i = 0; i < int16Array.length; i++) {
            float32Array[i] = int16Array[i] / 32768;
        }

        const audioBuffer = this.audioContext.createBuffer(1, float32Array.length, 24000);
        audioBuffer.copyToChannel(float32Array, 0, 0);

        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.audioContext.destination);

        // Schedule playback ensuring no overlaps/gaps
        const playTime = Math.max(this.audioContext.currentTime, this.startTime);
        source.start(playTime);

        this.startTime = playTime + audioBuffer.duration;

        source.onended = () => {
            if (this.queue.length > 0) {
                this.scheduleNextBuffer(); // Trigger next immediately if available but logic handled by fire-and-forget scheduling mostly
            } else {
                // Check if queue empty and time passed?
                // Simple logic: if queue empty, we might stop playing soon.
                if (this.audioContext.currentTime >= this.startTime) {
                    this.isPlaying = false;
                    this.onStateChange(false);
                }
            }
        };
    }

    clearQueue(): void {
        this.queue = [];
        this.isPlaying = false;
        this.onStateChange(false);
        // Note: cannot easily stop currently playing buffer nodes without tracking them all.
        // For now, simple clear. In "interrupt" scenarios, we might want to suspend context.
        this.audioContext.suspend().then(() => this.audioContext.resume());
    }

    private base64ToArrayBuffer(base64: string): ArrayBuffer {
        const binaryString = window.atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }
}
