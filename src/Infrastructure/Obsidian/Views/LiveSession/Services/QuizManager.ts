import { App, TFile } from 'obsidian';
import { MetadataService } from '../../../../Services/MetadataService';
import { ScoreUtils } from '../../../../../Domain/Utils/ScoreUtils';
import { showMessage } from 'src/Application/Utils/Messages';

export interface QuizItem {
    heading: string;
    blockId: string;
    text: string;
    range: { start: number, end: number };
}

export class QuizManager {
    public queue: QuizItem[] = [];
    public currentIndex: number = 0;
    public onlyTitlesWithoutSubtitles: boolean = true;
    public selectedStarLevel: string = '1';

    constructor(private app: App) { }

    async buildQuizQueue(): Promise<boolean> {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== 'md') {
            showMessage('Open a markdown file to start quiz.');
            return false;
        }

        const content = await this.app.vault.read(activeFile);
        const lines = content.split('\n');

        const metaService = new MetadataService(this.app);
        const metadata = await metaService.getFileMetadata(activeFile);

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
