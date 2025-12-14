import { App, normalizePath, TFile } from 'obsidian';
import { UnresolvedLinkGeneratorSettings } from '../../settings';
import { getTemplatesFolder, isFolderMatch } from './Vault';
import { parseFrontmatter, splitFrontmatter, formatFrontmatterBlock } from './Frontmatter';

export interface TemplateConfig {
    commands?: string[];
    path?: string;
    prompt?: string;
    [key: string]: any;
}

function extractConfigFromTemplate(content: string): {
    config: TemplateConfig;
    cleanedContent: string;
} {
    const { frontmatterText, body } = splitFrontmatter(content);
    let config: TemplateConfig = {};


    // Reconstruct content with cleaned frontmatter
    let cleanedContent = content;

    const parsedFrontmatter = parseFrontmatter(frontmatterText);

    if (parsedFrontmatter) {
        const cleanFm = { ...parsedFrontmatter };
        let modified = false;

        for (const key of Object.keys(parsedFrontmatter)) {
            if (key.startsWith('!!')) {
                const configKey = key.substring(2);
                config[configKey] = parsedFrontmatter[key];
                delete cleanFm[key];
                modified = true;
            }
        }

        if (modified) {
            const newFmBlock = Object.keys(cleanFm).length > 0
                ? formatFrontmatterBlock(cleanFm)
                : '';

            // Reconstruct the file content: New FM + Body
            cleanedContent = newFmBlock
                ? `${newFmBlock}\n${body}`.trimStart()
                : body.trimStart();

            if (newFmBlock && body) {
                cleanedContent = `${newFmBlock}\n${body}`;
            } else if (newFmBlock) {
                cleanedContent = newFmBlock;
            } else {
                cleanedContent = body;
            }
        }
    }


    // 2. Extract from JSON Block (Legacy support or mixed usage)
    const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/g;
    let match;

    // We search within the CLEANED content now? 
    // Or original?
    // If we modified cleanedContent, we should probably search within that to remove JSON blocks if they still exist.
    // BUT, the regex indices might be messed up if we modify it in a loop.
    // Standard while loop with replace on string is safe enough if we update string.

    while ((match = jsonBlockRegex.exec(cleanedContent)) !== null) {
        try {
            let jsonContent;
            try {
                jsonContent = JSON.parse(match[1]);
            } catch (e) {
                // Fallback: try to parse as a JS object (permissive JSON)
                try {
                    jsonContent = new Function('return ' + match[1])();
                } catch (e2) {
                    throw e;
                }
            }

            if (jsonContent && (jsonContent.commands || jsonContent.prompt)) {
                config = {
                    ...config,
                    ...jsonContent,
                };
                // Remove the JSON block from the content
                cleanedContent = cleanedContent.replace(match[0], '').trim();
                // Reset regex because string changed?
                // Yes, modifying string invalidates `exec` state on cached regex usually or might skip.
                // Safer to reset distinct regex or just recursively replace.
                // Since we expect 1 usually, maybe just run it again?
                // actually `match` is dependent on the string.
                // If we replace, we should restart search or use replace with callback.
                // Let's use simple replace loop.
                jsonBlockRegex.lastIndex = 0; // Reset index
            }
        } catch (e) {
            console.warn('Failed to parse JSON block in template', e);
        }
    }

    return { config, cleanedContent };
}

export interface TemplateMatch {
    config: TemplateConfig;
    cleanedContent: string;
    templateFile: TFile;
}

export async function getTemplateConfigsForFolder(
    app: App,
    settings: UnresolvedLinkGeneratorSettings,
    folderPath: string
): Promise<TemplateMatch[]> {
    const matchingTemplates = settings.templateOptions.filter((option) =>
        isFolderMatch(folderPath, option.targetFolder)
    );

    if (matchingTemplates.length === 0) {
        return [];
    }

    const templatesFolder = getTemplatesFolder(app);
    if (!templatesFolder) {
        return [];
    }

    const matches: TemplateMatch[] = [];

    for (const matchingTemplate of matchingTemplates) {
        let templatePath = normalizePath(
            `${templatesFolder}/${matchingTemplate.templateFilename}`
        );
        let templateFile = app.vault.getAbstractFileByPath(templatePath);

        if (!templateFile && !templatePath.endsWith('.md')) {
            templatePath = templatePath + '.md';
            templateFile = app.vault.getAbstractFileByPath(templatePath);
            if (!templateFile) {
                console.warn(`Template file not found: ${templatePath}`);
                continue;
            }
        }

        if (templateFile instanceof TFile) {
            const templateContent = await app.vault.read(templateFile);
            const { config, cleanedContent } = extractConfigFromTemplate(templateContent);
            matches.push({ config, cleanedContent, templateFile });
        }
    }

    return matches;
}

export async function getTemplateConfigForFolder(
    app: App,
    settings: UnresolvedLinkGeneratorSettings,
    folderPath: string
): Promise<TemplateMatch | null> {
    const matches = await getTemplateConfigsForFolder(app, settings, folderPath);
    return matches.length > 0 ? matches[0] : null;
}

export async function getAllTemplateConfigs(
    app: App
): Promise<TemplateMatch[]> {
    const templatesFolder = getTemplatesFolder(app);
    if (!templatesFolder) {
        return [];
    }

    const matches: TemplateMatch[] = [];
    const templateFiles: TFile[] = [];

    // Helper to recursively get all md files in folder
    const collectFiles = (folderPath: string) => {
        const folder = app.vault.getAbstractFileByPath(folderPath);
        if (folder && 'children' in folder) {
            for (const child of (folder as any).children) {
                if (child instanceof TFile && child.extension === 'md') {
                    templateFiles.push(child);
                } else if ('children' in child) {
                    collectFiles(child.path);
                }
            }
        }
    };

    collectFiles(templatesFolder);

    for (const templateFile of templateFiles) {
        const templateContent = await app.vault.read(templateFile);
        const { config, cleanedContent } = extractConfigFromTemplate(templateContent);
        matches.push({ config, cleanedContent, templateFile });
    }

    return matches;
}
