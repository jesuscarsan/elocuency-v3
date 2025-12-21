import { App, TFolder, TFile } from 'obsidian';
import { RoleRepositoryPort } from '../../Domain/Ports/RoleRepositoryPort';
import { SettingsPort } from '../../Domain/Ports/SettingsPort';
import { Role } from '../../Domain/Types/Role';

export class ObsidianRoleRepository implements RoleRepositoryPort {
    constructor(
        private app: App,
        private settings: SettingsPort
    ) { }

    async loadRoles(): Promise<Role[]> {
        const folderPath = this.settings.getGeminiRolesFolder();
        if (!folderPath) return [];

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
