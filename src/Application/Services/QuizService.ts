import { NoteManagerPort, NoteItem } from '../../Domain/Ports/NoteManagerPort';
import { ContextProviderPort } from '../../Domain/Ports/ContextProviderPort';
import { ScoreUtils } from '../../Domain/Utils/ScoreUtils';
import { showMessage } from '../../Infrastructure/Obsidian/Utils/Messages'; // Utils, arguably Infrastructure/Shared

export interface QuizItem {
    heading: string;
    blockId: string;
    text: string;
    range: { start: number, end: number };
}

import { MetadataPort } from '../../Domain/Ports/MetadataPort';
import { HeaderMetadataKeys } from '../../Domain/Constants/HeaderMetadataRegistry';

export class QuizService {
    public queue: QuizItem[] = [];
    public currentIndex: number = 0;
    public onlyTitlesWithoutSubtitles: boolean = true;
    public selectedStarLevel: string = '1';

    constructor(
        private noteManager: NoteManagerPort,
        private contextProvider: ContextProviderPort,
        private metadataService: MetadataPort
    ) { }

    async recordBlockScore(item: QuizItem, score: number): Promise<number | null> {
        if (!item || !item.blockId) return null;

        const activeFile = this.noteManager.getActiveNote();
        if (!activeFile) return null;

        const fileMetadata = await this.metadataService.getFileMetadata(activeFile.path);
        const currentMeta = fileMetadata[item.blockId];
        const oldScore = currentMeta?.score || 0;
        const oldAttempts = currentMeta?.attempts || 0;

        let finalScore = score;
        if (oldScore > 0) {
            finalScore = (oldScore + score) / 2;
            finalScore = Math.round(finalScore * 10) / 10;
        }

        await this.metadataService.updateBlockMetadata(activeFile.path, item.blockId, {
            [HeaderMetadataKeys.Score]: finalScore,
            [HeaderMetadataKeys.Attempts]: oldAttempts + 1
        });

        return finalScore;
    }


    async generateQuestionPrompt(): Promise<string | null> {
        const item = this.getCurrentItem();
        if (!item) return null;

        const activeFile = this.noteManager.getActiveNote();
        if (!activeFile) return null;

        let sectionLinkedContent = '';
        try {
            sectionLinkedContent = await this.contextProvider.getLinkedFileContent(activeFile.path, item.range);
        } catch (e) {
            console.error('Error fetching linked content', e);
        }

        return `Examina al usuario sobre el siguiente contenido:\n\n${item.text}\n\n${sectionLinkedContent ? `--- Temas ---\n${sectionLinkedContent}` : ''}`;
    }

    async buildQuizQueue(): Promise<boolean> {
        const activeFile = this.noteManager.getActiveNote();
        if (!activeFile || activeFile.extension !== 'md') {
            showMessage('Open a markdown file to start quiz.');
            return false;
        }

        const content = await this.noteManager.getActiveNoteContent();
        if (!content) return false;

        const lines = content.split('\n');

        const metadata = await this.noteManager.getNoteMetadata(activeFile.path);

        const queue: QuizItem[] = [];
        const requiredLevel = parseInt(this.selectedStarLevel) || 1;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const headerMatch = line.match(/^(#{1,6})\s+(.*)/);
            if (headerMatch) {
                const headingText = headerMatch[2].trim();
                const idMatch = line.match(/\^([a-zA-Z0-9-]+)$/);
                const blockId = idMatch ? idMatch[1] : null;

                if (blockId && metadata[blockId]) {
                    const importance = metadata[blockId].importance;
                    if (typeof importance === 'number' && ScoreUtils.normalizeImportance(importance) >= requiredLevel) {

                        // Check for children if "onlyTitlesWithoutSubtitles" is enabled
                        const currentHeaderLevel = headerMatch[1].length;
                        let hasChildren = false;
                        let endLine = lines.length;

                        for (let j = i + 1; j < lines.length; j++) {
                            const nextHeaderMatch = lines[j].match(/^(#{1,6})\s+/);
                            if (nextHeaderMatch) {
                                const nextHeaderLevel = nextHeaderMatch[1].length;
                                if (nextHeaderLevel > currentHeaderLevel) {
                                    hasChildren = true;
                                }
                                endLine = j;
                                break;
                            }
                        }

                        if (this.onlyTitlesWithoutSubtitles && hasChildren) {
                            continue;
                        }

                        const sectionContent = lines.slice(i, endLine).join('\n');
                        queue.push({
                            heading: headingText.replace(/\^([a-zA-Z0-9-]+)$/, '').trim(),
                            blockId: blockId,
                            text: sectionContent,
                            range: { start: i, end: endLine }
                        });
                    }
                }
            }
        }

        this.queue = queue;
        this.currentIndex = 0;

        if (this.queue.length === 0) {
            showMessage(`No headers found with Importance >= ${requiredLevel}`);
            return false;
        }

        showMessage(`Quiz Queue: ${this.queue.length} headers found.`);
        return true;
    }

    getCurrentItem(): QuizItem | undefined {
        return this.queue[this.currentIndex];
    }

    hasNext(): boolean {
        return this.currentIndex < this.queue.length;
    }

    next() {
        if (this.hasNext()) {
            this.currentIndex++;
        }
    }
}
