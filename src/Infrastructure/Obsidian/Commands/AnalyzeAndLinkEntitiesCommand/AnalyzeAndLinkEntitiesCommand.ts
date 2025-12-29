import { App, MarkdownView, TFile, Notice } from 'obsidian';
import { LlmPort } from '@/Domain/Ports/LlmPort';
import { showMessage } from '@/Infrastructure/Obsidian/Utils/Messages';
import { getActiveMarkdownView } from '@/Infrastructure/Obsidian/Utils/ViewMode';

interface Entity {
    name: string;
    type: 'Person' | 'Place' | 'Concept';
    relevance: 'High' | 'Medium' | 'Low';
}

export class AnalyzeAndLinkEntitiesCommand {
    constructor(
        private readonly app: App,
        private readonly llm: LlmPort
    ) { }

    async execute(targetFile?: TFile) {
        const view = getActiveMarkdownView(this.app, targetFile);

        if (!view?.file) {
            showMessage('Open a markdown note to analyze.');
            return;
        }

        const editor = view.editor;
        const noteContent = editor.getValue();
        const noteTitle = view.file.basename;

        showMessage('Analyzing entities with AI...');

        const prompt = this.buildPrompt(noteTitle, noteContent);

        try {
            const entities = await this.llm.requestJson({ prompt }) as Entity[];

            if (!entities || !Array.isArray(entities)) {
                showMessage('AI response invalid or empty.');
                return;
            }

            const highRelevanceEntities = entities.filter(e => e.relevance === 'High' || e.relevance === 'Medium');

            if (highRelevanceEntities.length === 0) {
                showMessage('No relevant entities found.');
                return;
            }

            this.processEntities(highRelevanceEntities, editor);
            showMessage(`Processed ${highRelevanceEntities.length} entities.`);

        } catch (error) {
            console.error('Error analyzing entities:', error);
            showMessage('Error analyzing entities.');
        }
    }

    private buildPrompt(title: string, content: string): string {
        return `
You are an expert knowledge graph builder using Obsidian.
Analyze the following note content and identify key entities that should be linked.

Note Title: "${title}"

Content:
"${content}"

Extract:
1.  **People** (Personas): Specific individuals mentioned.
2.  **Places** (Lugares): Locations, cities, countries.
3.  **Concepts** (Conceptos): Key abstract ideas, methodologies, or specific terms that define the note's topic.

Return a JSON ARRAY of objects. Each object must have:
- "name": The exact string occurrence in the text (case-sensitive preference, but normalize if needed).
- "type": "Person", "Place", or "Concept".
- "relevance": "High" (crucial to understand the note), "Medium" (important context), "Low" (mentioned in passing).

Example Output:
[
  { "name": "Elon Musk", "type": "Person", "relevance": "High" },
  { "name": "Mars", "type": "Place", "relevance": "Medium" }
]

CRITICAL: Return ONLY the JSON Array. No markdown formatting around it.
`;
    }

    private processEntities(entities: Entity[], editor: any) {
        let content = editor.getValue();

        // Sort entities by length (descending) to avoid replacing substrings of longer names first
        // e.g. replacing "Apple" inside "Apple Pie" if "Apple" is processed first.
        entities.sort((a, b) => b.name.length - a.name.length);

        const cache = this.app.metadataCache;

        for (const entity of entities) {
            const name = entity.name;
            // distinct regex to find the name NOT already inside a link
            // Look for 'name' that is NOT preceded by '[[' or '|' and NOT followed by ']]'
            // This is a naive regex approach. For robust link replacement, improved parsing is better, 
            // but for this command, a regex replacement on whole words is a good start.

            // Regex explanation:
            // (?<!\[\[|\|) : Not preceded by "[[" or "|"
            // \b : Word boundary (start)
            // ${escapeRegExp(name)} : The entity name
            // \b : Word boundary (end)
            // (?![^\[]*\]\]) : Not inside a link (simple heuristic: not followed by closing brackets without opening ones). 
            // NOTE: The lookahead check (?![^\[]*\]\]) is tricky and can be slow or inaccurate with nested structures.
            // Simplified approach: match the word, check if it's linking.

            // Let's use a simpler replacement strategy:
            // Find all occurrences. check index. if index is inside [[...]], skip.

            const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Match whole word, Case Insensitive? Maybe better to respect the case returned by AI or exact match?
            // The AI was asked for "exact string occurrence", so we try exact match first or simple global ignore case
            const regex = new RegExp(`\\b${escapedName}\\b`, 'g');

            content = content.replace(regex, (match: string, offset: number, string: string) => {
                // Check if we are inside a link: [[...match...]] or [match](...)
                if (this.isInsideLink(string, offset, match.length)) {
                    return match;
                }

                // Check if file exists to decide on format [[Name]] or [[Name|Name]]? 
                // Detailed check:
                const linkDest = cache.getFirstLinkpathDest(name, '');

                if (linkDest) {
                    // File exists!
                    // If the filename is exactly the match, use [[match]]
                    // If filename is different, use [[filename|match]]
                    // But getFirstLinkpathDest returns the TFile. basename is the filename without extension.
                    if (linkDest.basename === match) {
                        return `[[${match}]]`;
                    } else {
                        // Use alias format
                        return `[[${linkDest.basename}|${match}]]`;
                    }
                } else {
                    // File does not exist. 
                    // Should we link it anyway? YES, if relevance is High/Medium.
                    return `[[${match}]]`;
                }
            });
        }

        if (content !== editor.getValue()) {
            editor.setValue(content);
        }
    }

    private isInsideLink(text: string, offset: number, length: number): boolean {
        // Simple check: look for nearest preceding '[[' and following ']]' 
        // without an intervening ']]' before the '[['.

        const before = text.substring(0, offset);
        const after = text.substring(offset + length);

        const lastOpen = before.lastIndexOf('[[');
        const lastCloseBefore = before.lastIndexOf(']]');

        // If we found an opening bracket after the last closing bracket (or no closing bracket yet)
        const possibleOpen = lastOpen > lastCloseBefore;

        if (possibleOpen) {
            const nextClose = after.indexOf(']]');
            const nextOpen = after.indexOf('[[');

            // If there is a closing bracket coming up, and no opening bracket before it
            if (nextClose !== -1 && (nextOpen === -1 || nextClose < nextOpen)) {
                return true;
            }
        }

        return false;
    }
}
