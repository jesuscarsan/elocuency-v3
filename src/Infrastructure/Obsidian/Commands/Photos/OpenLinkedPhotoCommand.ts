import { App as ObsidianApp, TFile, Platform } from 'obsidian';
import { showMessage } from '@/Infrastructure/Obsidian/Utils';
import { getActiveMarkdownView } from '@/Infrastructure/Obsidian/Utils/ViewMode';

export class OpenLinkedPhotoCommand {
    constructor(private readonly app: ObsidianApp) { }

    async execute(file?: TFile) {
        const view = getActiveMarkdownView(this.app, file);
        if (!view) {
            showMessage('Abre una nota y coloca el cursor sobre un link de foto.');
            return;
        }

        const editor = view.editor;
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);
        // Regex to match (photo-locator?id=...&name=...)
        // Matches standard markdown link syntax with our specific scheme
        const linkRegex = /photo-locator\?id=([^&]+)&name=([^)]+)/;
        const match = line.match(linkRegex);

        if (!match) {
            showMessage('No se encontró un link de foto válido en la línea actual.');
            return;
        }

        const id = decodeURIComponent(match[1]);
        const name = decodeURIComponent(match[2]);

        if (Platform.isMobile) {
            this.handleMobile(name);
        } else {
            this.handleDesktop(id, name);
        }
    }

    private handleMobile(name: string) {
        // iOS Shortcut trigger
        // URL Scheme: shortcuts://run-shortcut?name=OpenPhoto&input=NAME
        const encodedName = encodeURIComponent(name);
        const url = `shortcuts://run-shortcut?name=OpenPhoto&input=${encodedName}`;
        window.open(url);
    }

    private handleDesktop(id: string, name: string) {
        // Dynamic require to avoid issues on non-desktop builds if any
        // mostly for safety, though Platform.isDesktop check protects logic
        const { exec } = require('child_process');

        showMessage(`Abriendo foto...`);

        // AppleScript: Try ID first, then Name
        const script = `
        set photoId to "${id}"
        set photoName to "${name}"
        
        tell application "Photos"
            activate
            set foundById to false
            
            try
                -- Try to select by ID
                if exists media item id photoId then
                    set selection to {media item id photoId}
                    set foundById to true
                end if
            end try
            
            if not foundById then
                -- Fallback to Name
                try
                    set searchResults to (every media item whose filename is photoName)
                    if (count of searchResults) > 0 then
                        set selection to {item 1 of searchResults}
                    else
                        return "ERROR: Not found by ID or Name"
                    end if
                on error
                    return "ERROR: Sarching failed"
                end try
            end if
            
            return "SUCCESS"
        end tell
        `;

        exec(`osascript -e '${script}'`, (error: any, stdout: any, stderr: any) => {
            if (error) {
                console.error(`exec error: ${error}`);
                showMessage('Error al ejecutar AppleScript.');
                return;
            }
            const result = stdout ? stdout.trim() : '';
            if (result.startsWith('ERROR')) {
                showMessage(`No se encontró la foto "${name}".`);
            }
        });
    }
}
