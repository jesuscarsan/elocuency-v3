import { Command, Editor, MarkdownView, Notice, Plugin } from 'obsidian';
import { OpenSubtitlesService } from '@/Infrastructure/Obsidian/Services/OpenSubtitlesService';
import ObsidianExtension from '@/Infrastructure/Obsidian/main';

export class DownloadSubtitlesCommand {
    private service: OpenSubtitlesService;

    constructor(private plugin: ObsidianExtension) {
        this.service = new OpenSubtitlesService({
            apiKey: this.plugin.settings.openSubtitlesApiKey,
            username: this.plugin.settings.openSubtitlesUsername,
            password: this.plugin.settings.openSubtitlesPassword,
        });
    }

    getCommand(): Command {
        return {
            id: 'download-subtitles',
            name: 'Series: Download Subtitles',
            editorCallback: async (editor: Editor, view: MarkdownView | any) => {
                const frontmatter = this.plugin.app.metadataCache.getFileCache(view.file!)?.frontmatter;

                if (!frontmatter) {
                    new Notice('No frontmatter found.');
                    return;
                }

                const serie = frontmatter['Serie'];
                const season = frontmatter['Temporada'];
                const episode = frontmatter['Capitulo'];

                if (!serie || !season || !episode) {
                    new Notice('Missing Serie, Temporada, or Capitulo fields.');
                    return;
                }

                new Notice(`Searching subtitles for ${serie} S${season}E${episode}...`);

                try {
                    const results = await this.service.search(serie, Number(season), Number(episode));

                    if (results.length === 0) {
                        new Notice('No subtitles found.');
                        return;
                    }

                    // Simple strategy: take the first one (most downloaded/best match usually first)
                    // Or we could pick the one with 'best' format, but let's start simple.
                    const bestMatch = results[0];

                    // The search result usually gives a file_id or we need to look into files array
                    // The structure in service: results is Subtitle[]
                    // Each Subtitle has attributes.files -> array of { file_id }

                    if (!bestMatch.attributes.files || bestMatch.attributes.files.length === 0) {
                        new Notice('Subtitle entry has no files.');
                        return;
                    }

                    const fileId = bestMatch.attributes.files[0].file_id;

                    new Notice('Downloading subtitle...');
                    const subtitleContent = await this.service.download(fileId);

                    // Append to the end of the file
                    const currentContent = editor.getValue();
                    const newContent = currentContent + '\n\n## Subtitles\n\n' + subtitleContent;
                    editor.setValue(newContent);

                    new Notice('Subtitles downloaded and appended.');

                } catch (error) {
                    console.error(error);
                    new Notice('Error downloading subtitles. Check console.');
                }
            },
        };
    }
}
