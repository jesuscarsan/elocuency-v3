import { App, TFolder, TFile } from 'obsidian';
import ObsidianExtension from 'src/main';

export interface Role {
    name: string;
    prompt: string;
    trackLevelAnswer: boolean;
    evaluationPrompt?: string;
    liveVoice?: string;
    liveTemperature?: number;
}

export class RolesManager {
    constructor(private app: App, private plugin: ObsidianExtension) { }

    async loadRoles(): Promise<Role[]> {
        if (!this.plugin || !this.plugin.settings.geminiRolesFolder) return [];

        const folderPath = this.plugin.settings.geminiRolesFolder;
        const folder = this.app.vault.getAbstractFileByPath(folderPath);

        if (!folder || !(folder instanceof TFolder)) {
            return [];
        }

        const roles: Role[] = [];

        for (const child of folder.children) {
            if (child instanceof TFile && child.extension === 'md') {
                const cache = this.app.metadataCache.getFileCache(child);
                const prompt = cache?.frontmatter?.['!!prompt'];
                const evaluationPrompt = cache?.frontmatter?.['!!evaluationPrompt'];
                const trackLevelRaw = cache?.frontmatter?.['!!trackLevelAnswer'];
                const trackLevel = trackLevelRaw === true || trackLevelRaw === 'true';

                // Read new params
                const liveVoice = cache?.frontmatter?.['!!liveVoice'];
                const liveTemperature = cache?.frontmatter?.['!!liveTemperature'];

                if (prompt && typeof prompt === 'string') {
                    roles.push({
                        name: child.basename,
                        prompt: prompt,
                        trackLevelAnswer: trackLevel,
                        evaluationPrompt: typeof evaluationPrompt === 'string' ? evaluationPrompt : undefined,
                        liveVoice: typeof liveVoice === 'string' ? liveVoice : undefined,
                        liveTemperature: typeof liveTemperature === 'number' ? liveTemperature : undefined
                    });
                }
            }
        }

        return roles;
    }
}
