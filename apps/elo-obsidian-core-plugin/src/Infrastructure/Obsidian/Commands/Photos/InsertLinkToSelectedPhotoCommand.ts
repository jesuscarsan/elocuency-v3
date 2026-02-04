import { App as ObsidianApp, TFile } from 'obsidian';
import { exec } from 'child_process';
import { showMessage, formatFrontmatterBlock, parseFrontmatter, splitFrontmatter } from '@/Infrastructure/Obsidian/Utils';
import { executeInEditMode, getActiveMarkdownView } from '@/Infrastructure/Obsidian/Utils/ViewMode';
import { FrontmatterKeys } from "@elo/core";

export class InsertLinkToSelectedPhotoCommand {
    constructor(private readonly app: ObsidianApp) { }

    async execute(file?: TFile) {
        const view = getActiveMarkdownView(this.app, file);
        if (!view) {
            showMessage('Abre una nota para insertar el link de la foto.');
            return;
        }

        // AppleScript to get ID and Filename of 1st selected photo
        const script = `
        tell application "Photos"
            set selectedItems to selection
            if selectedItems is {} then
                return "ERROR: No photo selected"
            else
                set item1 to item 1 of selectedItems
                set photoId to id of item1
                set photoName to filename of item1
                return photoId & "|||" & photoName
            end if
        end tell
        `;

        exec(`osascript -e '${script}'`, async (error, stdout, stderr) => {
            if (error) {
                console.error(`exec error: ${error}`);
                showMessage('Error al conectar con Photos (¿Permisos?)');
                return;
            }
            if (stderr) {
                console.error(`stderr: ${stderr}`);
            }

            const result = stdout.trim();
            if (result.startsWith('ERROR')) {
                showMessage('Selecciona una foto en la app Photos primero.');
                return;
            }

            const [id, name] = result.split('|||');
            if (!id || !name) {
                showMessage('Error al obtener datos de la foto.');
                return;
            }

            showMessage(`Foto detectada: ${name}`);

            // Construct link: elo-bridge://id=UUID&name=Name
            // Use local bridge to display image, and custom protocol to open it.
            // We must manually encode '(' and ')' because encodeURIComponent doesn't, and they break the markdown link parsing if not escaped.
            const safeName = encodeURIComponent(name).replace(/\(/g, '%28').replace(/\)/g, '%29');
            const link = `elo-bridge://id=${encodeURIComponent(id)}&name=${safeName}`;

            // Insert into Frontmatter "Fotos" field using existing Utils logic
            await executeInEditMode(view, async () => {
                const f = view.file;
                if (!f) return;

                const content = await this.app.vault.read(f);
                const split = splitFrontmatter(content);
                const currentFrontmatter = parseFrontmatter(split.frontmatterText) || {};

                const currentPhotos = currentFrontmatter[FrontmatterKeys.EloImages];
                let newPhotos: string[] = [];

                if (Array.isArray(currentPhotos)) {
                    newPhotos = [...currentPhotos];
                } else if (currentPhotos) {
                    newPhotos = [currentPhotos as string];
                }

                // Append new link
                newPhotos.push(link);

                // Update frontmatter
                currentFrontmatter[FrontmatterKeys.EloImages] = newPhotos;

                const frontmatterBlock = formatFrontmatterBlock(currentFrontmatter);
                const normalizedBody = split.body.replace(/^[\n\r]+/, '');

                const finalContent = frontmatterBlock + '\n\n' + normalizedBody;

                await this.app.vault.modify(f, finalContent);
                showMessage(`Link añadido a campo "Fotos": ${name}`);
            });
        });
    }
}
