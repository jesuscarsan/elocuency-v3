import {
    App as ObsidianApp,
    TFile,
    requestUrl,
} from 'obsidian';
import { showMessage } from '@/Infrastructure/Obsidian/Utils/Messages';
import {
    formatFrontmatterBlock,
    mergeFrontmatterSuggestions,
    parseFrontmatter,
    splitFrontmatter,
} from '@/Infrastructure/Obsidian/Utils/Frontmatter';
import type { LlmPort } from '@/Domain/Ports/LlmPort';
import type { ImageEnricherService } from '@/Infrastructure/Obsidian/Services/ImageEnricherService';
import { FrontmatterKeys } from '@/Domain/Constants/FrontmatterRegistry';
import { executeInEditMode, getActiveMarkdownView } from '@/Infrastructure/Obsidian/Utils/ViewMode';
import { InputModal } from '@/Infrastructure/Obsidian/Views/Modals/InputModal';
import { UnresolvedLinkGeneratorSettings } from '@/Infrastructure/Obsidian/settings';
import { PersonasNoteOrganizer } from '@/Application/Services/PersonasNoteOrganizer';
import { ObsidianNoteManager } from '@/Infrastructure/Adapters/ObsidianNoteManager';

export class EnrichWithPromptUrlCommand {
    constructor(
        private readonly llm: LlmPort,
        private readonly imageEnricher: ImageEnricherService,
        private readonly obsidian: ObsidianApp,
        private readonly settings: UnresolvedLinkGeneratorSettings,
    ) { }

    async execute(targetFile?: TFile) {
        console.log('[EnrichWithPromptUrlCommand] Start');
        const view = getActiveMarkdownView(this.obsidian, targetFile);
        const file = targetFile ?? view?.file;

        if (!file) {
            showMessage('Open a markdown note to enrich.');
            return;
        }

        new InputModal(
            this.obsidian,
            {
                title: 'Enrich with Prompt URL',
                label: 'Enter URL (e.g. Wikipedia article)',
                placeholder: 'https://...',
                submitText: 'Enrich'
            },
            async (url) => {
                if (!url) {
                    showMessage('URL is required.');
                    return;
                }
                await this.enrich(file, url);
            }
        ).open();
    }

    async enrich(file: TFile, url: string) {
        console.log(`[EnrichWithPromptUrlCommand] enriching ${file.path} with url ${url}`);

        // 1. Read File
        const currentContent = await this.obsidian.vault.read(file);
        const split = splitFrontmatter(currentContent);
        const frontmatter = parseFrontmatter(split.frontmatterText) || {};

        // 2. Fetch URL content
        let urlContext = '';
        try {
            showMessage(`Fetching content from ${url}...`);
            console.log(`[EnrichWithPromptUrlCommand] Fetching content from ${url}`);
            const response = await requestUrl(url);
            urlContext = response.text;
            console.log(`[EnrichWithPromptUrlCommand] Fetched ${urlContext.length} chars from ${url}`);
        } catch (e) {
            console.error(`[EnrichWithPromptUrlCommand] Failed to fetch promptUrl: ${url}`, e);
            showMessage(`Failed to fetch content from ${url}`);
            return; // Stop if URL fetch fails? Or continue? Usually stop.
        }

        // 3. Update Frontmatter with URL
        frontmatter[FrontmatterKeys.EloPromptUrl] = url;

        // 4. Build Prompt
        const promptTemplate = "Genera una nota completa basada en el contexto proporcionado.";
        // Note: User can configure default prompt in settings, or we can hardcode a specific one. 
        // The previous implementation in ApplyTemplate uses the template's prompt. 
        // Here we might want a default generic prompt if none exists, or reuse logic.
        // For now, I'll use a generic instruction or try to find one from frontmatter if available? 
        // But the user specifically asked "Ask for !!promptUrl ... and enrich with AI like in ApplyTemplateCommand".
        // In ApplyTemplateCommand, the prompt comes from `config.prompt`. 
        // Since this is a standalone command, we need a prompt. 
        // Let's use a sane default for "enrich from URL".

        const promptInstruction = `Analiza el contenido de la URL proporcionada y la nota actual. Completa y mejora la nota con la información obtenida.`;

        const prompt = this.buildPrompt(file.basename, frontmatter, promptInstruction, split.body, urlContext);

        // 5. Request Enrichment
        showMessage('Requesting AI enrichment...');
        console.log('[EnrichWithPromptUrlCommand] Requesting enrichment with prompt:', prompt);
        const enrichment = await this.llm.requestEnrichment({
            prompt,
        });
        console.log('[EnrichWithPromptUrlCommand] Enrichment received:', enrichment);

        if (enrichment) {
            if (enrichment.frontmatter) {
                delete enrichment.frontmatter.tags;
                delete enrichment.frontmatter.tag;
            }

            let updatedFrontmatter = mergeFrontmatterSuggestions(
                frontmatter,
                enrichment.frontmatter,
            );

            // Check for empty image URLs
            if (updatedFrontmatter && Array.isArray(updatedFrontmatter[FrontmatterKeys.EloImages]) && (updatedFrontmatter[FrontmatterKeys.EloImages] as any[]).length === 0) {
                const images = await this.imageEnricher.searchImages(file.basename, 3);
                if (images.length > 0) {
                    updatedFrontmatter = {
                        ...updatedFrontmatter,
                        [FrontmatterKeys.EloImages]: images,
                    };
                }
            }

            let finalFrontmatter = updatedFrontmatter || frontmatter;

            const frontmatterBlock = formatFrontmatterBlock(finalFrontmatter);

            // If enrichment.body is undefined/null, fallback to normalizedBody (content before enrichment)
            const bodyFromGemini = (enrichment.body !== undefined && enrichment.body !== null)
                ? enrichment.body.trim()
                : (split.body || '');

            const segments: string[] = [];
            if (frontmatterBlock) segments.push(frontmatterBlock);
            if (bodyFromGemini) segments.push(bodyFromGemini);

            const finalContent = segments.join('\n\n');

            console.log('[EnrichWithPromptUrlCommand] Setting file content');
            await this.obsidian.vault.modify(file, finalContent);

            // Organize file if needed
            if (finalFrontmatter) {
                const noteManager = new ObsidianNoteManager(this.obsidian);
                const organizer = new PersonasNoteOrganizer(noteManager);
                await organizer.organize(file, finalFrontmatter);
            }

            showMessage('Enrichment complete.');
        } else {
            showMessage('No enrichment received.');
        }
    }

    private buildPrompt(
        title: string,
        currentFrontmatter: Record<string, unknown> | null,
        promptTemplate: string,
        currentBody: string = '',
        urlContext: string = '',
    ): string {
        const frontmatterCopy = currentFrontmatter ? { ...currentFrontmatter } : {};
        delete frontmatterCopy.tags;
        const frontmatterJson = JSON.stringify(frontmatterCopy, null, 2);
        // Include the body in the prompt so the LLM has context
        return `Nota de obsidian:'${title}'\n\nFrontmatter:'${frontmatterJson}'\n\nContenido actual de la nota:\n${currentBody}\n\nContexto adicional (URL):\n${urlContext}\n\nInstrucción:\n${promptTemplate}\n\nIMPORTANTE: Tu respuesta debe ser un objeto JSON VÁLIDO con las siguientes claves:\n- "frontmatter": Objeto con los metadatos actualizados o nuevos (Opcional).\n- "body": String con el contenido del cuerpo de la nota (markdown).\n\nNO DEVUELVAS NADA MÁS QUE EL JSON. En los campos 'Obras' y 'Países' y todos los nombres propios, devuélvelos como links the markdown estilo: [[nombre]]`;
    }
}
