import {
  App as ObsidianApp,
  MarkdownView,
  TFile,
  normalizePath,
  requestUrl,
} from 'obsidian';
import { showMessage } from '@/Infrastructure/Obsidian/Utils/Messages';
import {
  UnresolvedLinkGeneratorSettings,
} from '@/Infrastructure/Obsidian/settings';
import {
  formatFrontmatterBlock,
  mergeFrontmatterSuggestions,
  parseFrontmatter,
  splitFrontmatter,
} from '@/Infrastructure/Obsidian/Utils/Frontmatter';
import type { LlmPort } from "@elo/core";
import type { ImageEnricherService } from '@/Infrastructure/Obsidian/Services/ImageEnricherService';
import { FrontmatterKeys } from "@elo/core";
import {
  getAllTemplateConfigs,
  TemplateMatch
} from '@/Infrastructure/Obsidian/Utils/TemplateConfig';
import { ensureFolderExists } from '@/Infrastructure/Obsidian/Utils/Vault';
import { mergeNotes } from '@/Infrastructure/Obsidian/Utils/Notes';
import { PersonasNoteOrganizer } from '@/Application/Services/PersonasNoteOrganizer';
import { GenericFuzzySuggestModal } from '@/Infrastructure/Obsidian/Views/Modals/GenericFuzzySuggestModal';
import { ObsidianNoteManager } from '@/Infrastructure/Adapters/ObsidianNoteManager';
import { executeInEditMode, getActiveMarkdownView } from '@/Infrastructure/Obsidian/Utils/ViewMode';
import { TemplateContext } from '@/Infrastructure/Obsidian/Utils/TemplateContext';

export class ApplyTemplateCommand {
  constructor(
    private readonly llm: LlmPort,
    private readonly imageEnricher: ImageEnricherService,
    private readonly obsidian: ObsidianApp,
    private readonly settings: UnresolvedLinkGeneratorSettings,
  ) { }

  async execute(targetFile?: TFile, promptUrl?: string) {
    console.log('[ApplyTemplateCommand] Start');
    const view = getActiveMarkdownView(this.obsidian, targetFile);

    // Legacy behavior: Require active view if no targetFile provided, or just default to active file
    const file = targetFile ?? view?.file;

    if (!file) {
      showMessage('Open a markdown note to apply a template.');
      return;
    }

    const matches = await getAllTemplateConfigs(this.obsidian);

    if (matches.length === 0) {
      showMessage(`No templates found.`);
      return;
    }

    let templateResult: TemplateMatch | null = null;
    if (matches.length === 1) {
      templateResult = matches[0];
    } else {
      templateResult = await new Promise<TemplateMatch | null>((resolve) => {
        new GenericFuzzySuggestModal<TemplateMatch>(
          this.obsidian,
          matches,
          (item) => item.templateFile.basename,
          () => { },
          resolve
        ).open();
      });
    }

    if (!templateResult) {
      showMessage('No template selected.');
      return;
    }

    await this.applyTemplate(file, templateResult, promptUrl);
  }

  async applyTemplate(file: TFile, templateResult: TemplateMatch, predefinedPromptUrl?: string) {
    console.log(`[ApplyTemplateCommand] applying template ${templateResult.templateFile.basename} to ${file.path}`);
    const { config, cleanedContent, templateFile } = templateResult;

    showMessage(`Applying template ${templateFile.basename}...`);

    // Read content directly from file to support batch processing
    const currentContent = await this.obsidian.vault.read(file);
    const mergedContent = mergeNotes(cleanedContent, currentContent, false);
    const mergedSplit = splitFrontmatter(mergedContent);

    let mergedFrontmatter = parseFrontmatter(mergedSplit.frontmatterText);

    const recomposedSegments: string[] = [];
    let finalFrontmatter = mergedFrontmatter;

    if (mergedFrontmatter) {
      recomposedSegments.push(formatFrontmatterBlock(mergedFrontmatter));
    }

    const normalizedBody = mergedSplit.body;
    if (normalizedBody) {
      recomposedSegments.push(normalizedBody);
    }

    let finalContent = recomposedSegments.join('\n\n');

    const promptUrl = config.promptUrl || (mergedFrontmatter && mergedFrontmatter['!!promptUrl'] as string) || predefinedPromptUrl;

    if (config.prompt) {
      let urlContext = '';
      if (promptUrl) {
        try {
          console.log(`[ApplyTemplateCommand] Fetching content from ${promptUrl}`);
          const response = await requestUrl(promptUrl);
          urlContext = response.text;
          console.log(`[ApplyTemplateCommand] Fetched ${urlContext.length} chars from ${promptUrl}`);
        } catch (e) {
          console.error(`[ApplyTemplateCommand] Failed to fetch promptUrl: ${promptUrl}`, e);
          showMessage(`Failed to fetch content from ${promptUrl}`);
        }
      }

      const prompt = this.buildPrompt(file.basename, mergedFrontmatter, config.prompt, normalizedBody, urlContext);


      console.log('[ApplyTemplateCommand] Requesting enrichment with prompt:', prompt);
      console.time('[ApplyTemplateCommand] AI Enrichment Time');
      const enrichment = await this.llm.requestEnrichment({
        prompt,
      });
      console.timeEnd('[ApplyTemplateCommand] AI Enrichment Time');
      console.log('[ApplyTemplateCommand] Enrichment received:', enrichment);

      if (enrichment) {
        if (enrichment.frontmatter) {
          delete enrichment.frontmatter.tags;
          delete enrichment.frontmatter.tag;
        }

        let updatedFrontmatter = mergeFrontmatterSuggestions(
          mergedFrontmatter,
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



        if (updatedFrontmatter) {
          finalFrontmatter = updatedFrontmatter;
        }

        const frontmatterBlock = updatedFrontmatter
          ? formatFrontmatterBlock(updatedFrontmatter)
          : '';
        // If enrichment.body is undefined/null, it means the LLM didn't return a body or failed to parse.
        // In that case, we fallback to normalizedBody (the content before enrichment) to avoid deleting the note content.
        // We intentionally allow empty string if the LLM specifically returned "" (though rare).
        const bodyFromGemini = (enrichment.body !== undefined && enrichment.body !== null)
          ? enrichment.body.trim()
          : (normalizedBody || '');

        const segments: string[] = [];

        if (frontmatterBlock) {
          segments.push(frontmatterBlock);
        }

        if (bodyFromGemini) {
          segments.push(bodyFromGemini);
        }

        finalContent = segments.join('\n\n');
      }
    }

    console.log('[ApplyTemplateCommand] Setting file content to:', finalContent);
    await this.obsidian.vault.modify(file, finalContent);
    console.log('[ApplyTemplateCommand] File content updated.');

    // ...
    if (finalFrontmatter) {
      const noteManager = new ObsidianNoteManager(this.obsidian);
      const organizer = new PersonasNoteOrganizer(noteManager);
      await organizer.organize(file, finalFrontmatter);
    }

    // Handle !!path (Move note)
    if (config.path) {
      try {
        const targetPath = config.path.endsWith('.md')
          ? normalizePath(config.path)
          : normalizePath(`${config.path}/${file.name}`);

        await ensureFolderExists(this.obsidian, targetPath);

        // Check if file already exists at target to avoid error or overwrite? 
        // Obsidian's rename throws if exists.
        const existing = this.obsidian.vault.getAbstractFileByPath(targetPath);
        if (!existing || existing === file) {
          await this.obsidian.fileManager.renameFile(file, targetPath);
        } else {
          showMessage(`File already exists at ${targetPath}. Cannot move.`);
        }

      } catch (e: any) {
        console.error("Error moving file based on template config:", e);
        showMessage(`Error moving file: ${e.message}`);
      }
    }

    // Handle !!commands (Execute commands)
    if (config.commands && Array.isArray(config.commands)) {
      console.log('[ApplyTemplateCommand] Starting execution of !!commands (post-AI, post-Edit)');
      // Find view for file if open
      let leaf = this.obsidian.workspace.getLeavesOfType('markdown').find(leaf => (leaf.view as MarkdownView).file === file);

      // If not open, we must open it to support editor commands.
      // We open in a new tab to avoid disrupting current view if possible, or just reuse.
      if (!leaf) {
        console.log(`[ApplyTemplateCommand] Opening file ${file.path} to execute commands.`);
        leaf = this.obsidian.workspace.getLeaf(true);
        await leaf.openFile(file);
      }

      if (leaf) {
        this.obsidian.workspace.setActiveLeaf(leaf, { focus: true });
      }

      TemplateContext.activeConfig = config;
      try {
        for (const commandId of config.commands) {
          let command = (this.obsidian as any).commands?.findCommand(commandId);
          let finalCommandId = commandId;

          if (!command) {
            finalCommandId = `elocuency:${commandId}`;
            command = (this.obsidian as any).commands?.findCommand(finalCommandId);
          }

          if (command) {
            try {
              console.log(`[ApplyTemplateCommand] Executing ${finalCommandId}`);
              if (command.callback) {
                await command.callback();
              } else if (command.editorCallback) {
                // Requires editor.
                const activeView = (leaf?.view as MarkdownView);
                if (activeView && activeView.file === file) {
                  await command.editorCallback(activeView.editor, activeView);
                } else {
                  console.warn(`[ApplyTemplateCommand] skipping editor command ${finalCommandId} because view is not active for file.`);
                }
              } else if (command.checkCallback) {
                await command.checkCallback(false);
              } else {
                (this.obsidian as any).commands.executeCommandById(finalCommandId);
              }
            } catch (e: any) {
              console.error(`Error executing command ${finalCommandId}:`, e);
              showMessage(`Error executing command ${finalCommandId}: ${e.message}`);
            }
          } else {
            console.warn(`Command not found: ${commandId}`);
            showMessage(`Command not found: ${commandId}`);
          }
        }
      } finally {
        TemplateContext.activeConfig = null;
      }
    }
    console.log('[ApplyTemplateCommand] End');
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
