import {
  App as ObsidianApp,
  MarkdownView,
  TFile,
  normalizePath,
} from 'obsidian';
import { showMessage } from 'src/Infrastructure/Obsidian/Utils/Messages';
import {
  UnresolvedLinkGeneratorSettings,
} from '../settings';
import {
  formatFrontmatterBlock,
  mergeFrontmatterSuggestions,
  parseFrontmatter,
  splitFrontmatter,
} from 'src/Infrastructure/Obsidian/Utils/Frontmatter';
import type { LlmPort } from 'src/Domain/Ports/LlmPort';
import type { ImageSearchPort } from 'src/Domain/Ports/ImageSearchPort';
import { FrontmatterKeys } from 'src/Domain/Constants/FrontmatterRegistry';
import {
  getTemplateConfigsForFolder,
  getAllTemplateConfigs,
  TemplateMatch
} from 'src/Infrastructure/Obsidian/Utils/TemplateConfig';
import { ensureFolderExists } from 'src/Infrastructure/Obsidian/Utils/Vault';
import { mergeNotes } from 'src/Infrastructure/Obsidian/Utils/Notes';
import { PersonasNoteOrganizer } from 'src/Application/Services/PersonasNoteOrganizer';
import { GenericFuzzySuggestModal } from '../Views/Modals/GenericFuzzySuggestModal';
import { ObsidianNoteManager } from '../../Adapters/ObsidianNoteManager';
import { executeInEditMode } from '../Utils/ViewMode';

export class ApplyTemplateCommand {
  constructor(
    private readonly llm: LlmPort,
    private readonly imageSearch: ImageSearchPort,
    private readonly obsidian: ObsidianApp,
    private readonly settings: UnresolvedLinkGeneratorSettings,
  ) { }

  async execute() {
    const view = this.obsidian.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
      showMessage('Open a markdown note to apply a template.');
      return;
    }

    const file = view.file;

    await executeInEditMode(view, async () => {
      const parentPath = file.parent ? file.parent.path : '/';

      let matches = await getTemplateConfigsForFolder(this.obsidian, this.settings, parentPath);
      let isFallback = false;

      if (matches.length === 0) {
        matches = await getAllTemplateConfigs(this.obsidian);
        isFallback = true;
      }

      if (matches.length === 0) {
        showMessage(`No templates found.`);
        return;
      }

      let templateResult: TemplateMatch | null = null;
      if (matches.length === 1 && !isFallback) {
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

      const { config, cleanedContent, templateFile } = templateResult;

      showMessage(`Applying template ${templateFile.basename}...`);

      const editor = view.editor;
      const mergedContent = mergeNotes(cleanedContent, editor.getValue(), false);
      const mergedSplit = splitFrontmatter(mergedContent);
      const mergedFrontmatter = parseFrontmatter(mergedSplit.frontmatterText);

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

      if (config.prompt) {
        const prompt = this.buildPrompt(file.basename, mergedFrontmatter, config.prompt);

        const enrichment = await this.llm.requestEnrichment({
          prompt,
        });

        if (enrichment) {
          let updatedFrontmatter = mergeFrontmatterSuggestions(
            mergedFrontmatter,
            enrichment.frontmatter,
          );

          // Check for empty image URLs
          if (updatedFrontmatter && Array.isArray(updatedFrontmatter[FrontmatterKeys.ImagenesUrls]) && (updatedFrontmatter[FrontmatterKeys.ImagenesUrls] as any[]).length === 0) {
            showMessage('Buscando imágenes...');
            const images = await this.imageSearch.searchImages(file.basename, 3);
            if (images.length > 0) {
              updatedFrontmatter = {
                ...updatedFrontmatter,
                [FrontmatterKeys.ImagenesUrls]: images,
              };
              showMessage(`Se encontraron ${images.length} imágenes.`);
            } else {
              showMessage('No se encontraron imágenes.');
            }
          }

          if (updatedFrontmatter) {
            finalFrontmatter = updatedFrontmatter;
          }

          const frontmatterBlock = updatedFrontmatter
            ? formatFrontmatterBlock(updatedFrontmatter)
            : '';
          const bodyFromGemini = enrichment.body
            ? enrichment.body.trim()
            : '';
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

      editor.setValue(finalContent);

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
        for (const commandId of config.commands) {
          let command = (this.obsidian as any).commands?.findCommand(commandId);
          if (!command) {
            const prefixedId = `elocuency:${commandId}`;
            command = (this.obsidian as any).commands?.findCommand(prefixedId);
            if (command) {
              (this.obsidian as any).commands.executeCommandById(prefixedId);
              continue;
            }
          }

          if (command) {
            (this.obsidian as any).commands.executeCommandById(commandId);
          } else {
            console.warn(`Command not found: ${commandId}`);
            showMessage(`Command not found: ${commandId}`);
          }
        }
      }

    });

  }

  private buildPrompt(
    title: string,
    currentFrontmatter: Record<string, unknown> | null,
    promptTemplate: string,
  ): string {
    const frontmatterCopy = currentFrontmatter ? { ...currentFrontmatter } : {};
    delete frontmatterCopy.tags;
    const frontmatterJson = JSON.stringify(frontmatterCopy, null, 2);
    return `Nota de obsidian:'${title}'\n\nFrontmatter:'${frontmatterJson}'\n\n${promptTemplate}\n\n`;
  }
}
