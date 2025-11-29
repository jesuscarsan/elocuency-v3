import { App, normalizePath, TFile } from 'obsidian';
import { UnresolvedLinkGeneratorSettings } from '../../settings';
import { getTemplatesFolder, isFolderMatch } from './Vault';

export interface TemplateConfig {
    commands?: string[];
    prompt?: string;
}

function extractConfigFromTemplate(content: string): {
    config: TemplateConfig;
    cleanedContent: string;
} {
    const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/g;
    let match;
    let config: TemplateConfig = {};
    let cleanedContent = content;

    while ((match = jsonBlockRegex.exec(content)) !== null) {
        try {
            let jsonContent;
            try {
                jsonContent = JSON.parse(match[1]);
            } catch (e) {
                // Fallback: try to parse as a JS object (permissive JSON)
                // This allows keys without quotes, trailing commas, etc.
                try {
                    jsonContent = new Function('return ' + match[1])();
                } catch (e2) {
                    throw e; // Throw original error if both fail
                }
            }

            if (jsonContent && (jsonContent.commands || jsonContent.prompt)) {
                config = {
                    ...config,
                    ...jsonContent,
                };
                // Remove the JSON block from the content
                cleanedContent = cleanedContent.replace(match[0], '').trim();
            }
        } catch (e) {
            // Ignore invalid JSON blocks
            console.warn('Failed to parse JSON block in template', e);
        }
    }

    return { config, cleanedContent };
}

export async function getTemplateConfigForFolder(
    app: App,
    settings: UnresolvedLinkGeneratorSettings,
    folderPath: string
): Promise<{ config: TemplateConfig; cleanedContent: string; templateFile: TFile } | null> {
    const matchingTemplate = settings.templateOptions.find((option) =>
        isFolderMatch(folderPath, option.targetFolder)
    );

    if (!matchingTemplate) {
        return null;
    }

    const templatesFolder = getTemplatesFolder(app);
    if (!templatesFolder) {
        return null;
    }

    const templatePath = normalizePath(
        `${templatesFolder}/${matchingTemplate.templateFilename}`
    );
    const templateFile = app.vault.getAbstractFileByPath(templatePath);

    if (!(templateFile instanceof TFile)) {
        return null;
    }

    const templateContent = await app.vault.read(templateFile);
    const { config, cleanedContent } = extractConfigFromTemplate(templateContent);

    return { config, cleanedContent, templateFile };
}
