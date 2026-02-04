import { NoteManagerPort, NoteItem } from "@elo/core";
import { ContextProviderPort } from "@elo/core";
import { normalizeImportance } from "@elo/core";
import { showMessage } from '../../Infrastructure/Obsidian/Utils/Messages'; // Utils, arguably Infrastructure/Shared

export interface QuizItem {
    heading: string;
    blockId: string;
    text: string;
    range: { start: number, end: number };
}

import { MetadataPort } from "@elo/core";
import { HeaderMetadataKeys } from "@elo/core";

export class QuizService {
    public queue: QuizItem[] = [];
    public currentIndex: number = -1;
    public onlyTitlesWithoutSubtitles: boolean = true;
    public selectedStarLevel: string = '0';

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
        const selectedLevelStr = this.selectedStarLevel;
        const isNoFilter = selectedLevelStr === '0'; // "(Sin filtro)"
        const requiredLevel = parseInt(selectedLevelStr) || 1;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const headerMatch = line.match(/^(#{1,6})\s+(.*)/);
            if (headerMatch) {
                const level = headerMatch[1].length;
                const headingText = headerMatch[2].trim();
                const idMatch = line.match(/\^([a-zA-Z0-9-]+)$/);
                const blockId = idMatch ? idMatch[1] : null;

                // Logic for "Sin filtro" (0): Take H1 and H2 only. Ignore score.
                // Logic for Filtered (1-5): Take headers with Importance >= requiredLevel.

                let shouldInclude = false;

                if (isNoFilter) {
                    if (level === 1 || level === 2) {
                        shouldInclude = true;
                    }
                } else {
                    if (blockId && metadata[blockId]) {
                        const importance = metadata[blockId].importance;
                        if (typeof importance === 'number' && normalizeImportance(importance) >= requiredLevel) {
                            shouldInclude = true;
                        }
                    }
                }

                if (shouldInclude) {
                    // Check for children if "onlyTitlesWithoutSubtitles" is enabled
                    // (This logic might be desired even for No Filter to avoid clutter if requested, 
                    // but user said "Sin filtro" is just H1, H2. Let's keep the subtitle filter as an option separate from score filter? 
                    // User said "Sin filtro" is to pick what to review. The subtitle filter is a different axis.
                    // I will respect onlyTitlesWithoutSubtitles for consistency unless user says otherwise.)

                    let hasChildren = false;
                    let endLine = lines.length;

                    for (let j = i + 1; j < lines.length; j++) {
                        const nextHeaderMatch = lines[j].match(/^(#{1,6})\s+/);
                        if (nextHeaderMatch) {
                            const nextHeaderLevel = nextHeaderMatch[1].length;
                            if (nextHeaderLevel > level) {
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
                        blockId: blockId ? blockId : '', // might be empty if no filter and no ID
                        text: sectionContent,
                        range: { start: i, end: endLine }
                    });
                }
            }
        }

        this.queue = queue;
        this.currentIndex = this.queue.length > 0 ? 0 : -1;

        if (this.queue.length === 0) {
            // Fallback: If no headers found, use the whole file
            showMessage('No headers found. Falling back to whole file.');

            queue.push({
                heading: activeFile.basename,
                blockId: '__FILE__',
                text: content,
                range: { start: 0, end: lines.length }
            });
            this.queue = queue;
        }

        // Set default selection if we have items (either from headers or fallback)
        if (this.queue.length > 0 && this.currentIndex === -1) {
            this.currentIndex = 0;
        }

        if (this.queue.length === 0) {
            if (isNoFilter) {
                showMessage(`No H1 or H2 headers found.`);
            } else {
                showMessage(`No headers found with Importance >= ${requiredLevel}`);
            }
            return false;
        }

        showMessage(`Quiz Queue: ${this.queue.length} items ready.`);
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
