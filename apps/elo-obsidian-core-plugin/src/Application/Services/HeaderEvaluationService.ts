import { LlmPort } from "@elo/core";
import { NoteManagerPort, NoteItem } from "@elo/core";
import { HeaderMetadataKeys } from "@elo/core";

export class HeaderEvaluationService {
    constructor(
        private llm: LlmPort,
        private noteManager: NoteManagerPort
    ) { }

    async evaluateHeaders(notePath: string, roleEvaluationPrompt: string): Promise<{ processed: number }> {
        if (!roleEvaluationPrompt) {
            throw new Error('No evaluation prompt provided.');
        }

        const headings = await this.noteManager.getNoteHeadings(notePath);
        if (!headings || headings.length === 0) {
            return { processed: 0 };
        }

        const content = await this.noteManager.readNote(notePath);
        const lines = content.split('\n');
        let processedCount = 0;

        for (let i = 0; i < headings.length; i++) {
            const heading = headings[i];
            const startLine = heading.position.start.line;
            let endLine = lines.length;
            if (i < headings.length - 1) {
                endLine = headings[i + 1].position.start.line;
            }

            const sectionText = heading.heading + '\n' + lines.slice(startLine + 1, endLine).join('\n');
            const finalPrompt = `${roleEvaluationPrompt}\nAnalyze:\n"${sectionText}"\nRETURN JSON ONLY: { "difficulty": 1-3, "importance": 1-5 }`;

            try {
                // Request JSON from LLM
                const result = await this.llm.requestJson({ prompt: finalPrompt });

                if (result && typeof result.difficulty === 'number' && typeof result.importance === 'number') {
                    // Extract block ID from the heading line in existing content
                    const idMatch = lines[startLine].match(/\^([a-zA-Z0-9-]+)$/);
                    let blockId = idMatch ? idMatch[1] : null;

                    if (blockId) {
                        await this.noteManager.updateBlockMetadata(notePath, blockId, {
                            [HeaderMetadataKeys.Difficulty]: result.difficulty,
                            [HeaderMetadataKeys.Importance]: result.importance
                        });
                        processedCount++;
                    } else {
                        // Note: The service currently only updates if block ID exists. 
                        // To support generating block IDs, we'd need to modify the file content which is more invasive.
                        // For now, mirroring existing logic: logic only updated if blockId existed?
                        // Re-checking ChatView logic:
                        // "if (blockId) { update } else { warn }"
                        // So yes, it only updates if block ID exists.
                    }
                }
            } catch (e) {
                console.error('Error evaluating header', e);
            }
        }

        return { processed: processedCount };
    }
}
