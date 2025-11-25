export interface TemplateConfig {
    commands?: string[];
    prompt?: string;
}

export function extractConfigFromTemplate(content: string): {
    config: TemplateConfig;
    cleanedContent: string;
} {
    const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/g;
    let match;
    let config: TemplateConfig = {};
    let cleanedContent = content;

    while ((match = jsonBlockRegex.exec(content)) !== null) {
        try {
            const jsonContent = JSON.parse(match[1]);
            if (jsonContent.commands || jsonContent.prompt) {
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
