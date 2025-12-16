import { App, MarkdownPostProcessor, MarkdownPostProcessorContext, TFile, Notice } from "obsidian";

const lastWarningTime: Record<string, number> = {};

export const createHeaderProgressRenderer = (app: App): MarkdownPostProcessor => {
    return async (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
        // We only want to run this in reading mode (or initial render of live preview)
        // ctx.sourcePath gives us the file path of the markdown file

        const sourcePath = ctx.sourcePath;
        if (!sourcePath) return;

        // console.log(`[HeaderProgress] Processing: ${sourcePath}`);

        // Construct path for the sidecar JSON file: "Path/To/Note.md" -> "Path/To/Note.json"
        const jsonPath = sourcePath.replace(/\.md$/, '.json');

        // Check if JSON file exists and read it
        let progressMap: Record<string, number> = {};

        try {
            const adapter = app.vault.adapter;
            if (await adapter.exists(jsonPath)) {
                const content = await adapter.read(jsonPath);
                const data = JSON.parse(content);

                // console.log(`[HeaderProgress] Found JSON at ${jsonPath}:`, data);

                // Expected format: { progress: { "Header 1": 50, "Header 2": 100 } }
                if (data && data.progress && typeof data.progress === 'object') {
                    progressMap = data.progress;
                }

                // CHECK FOR MISSING HEADERS
                // We use cached metadata to check existence of headers in the WHOLE file,
                // because 'el' might only contain a partial render (e.g. in Live Preview).
                const file = app.vault.getAbstractFileByPath(sourcePath);
                if (file instanceof TFile) {
                    const cache = app.metadataCache.getFileCache(file);
                    const headings = cache?.headings?.map(h => h.heading) || [];

                    // Normalize headings for comparison (trim)
                    const normalizedHeadings = new Set(headings.map(h => h.trim()));

                    const jsonKeys = Object.keys(progressMap);
                    const missingKeys = jsonKeys.filter(key => !normalizedHeadings.has(key));

                    if (missingKeys.length > 0) {
                        // Rate limit warnings to avoid spamming the user (once every 10 seconds per file)
                        const now = Date.now();
                        if (!lastWarningTime[sourcePath] || (now - lastWarningTime[sourcePath] > 10000)) {
                            lastWarningTime[sourcePath] = now;
                            new Notice(`⚠️ Header Progress: The following headers in .json are missing in the note:\n${missingKeys.join('\n')}`, 8000);
                            console.warn(`[HeaderProgress] Missing headers in ${sourcePath}:`, missingKeys);
                        }
                    }
                }

            } else {
                // console.log(`[HeaderProgress] No sidecar file found at ${jsonPath}`);
                return; // No sidecar file, nothing to do
            }
        } catch (e) {
            console.warn(`Failed to read header progress from ${jsonPath}`, e);
            return;
        }

        // Find all headers in this specific rendered block
        const headers = Array.from(el.querySelectorAll('h1, h2, h3, h4, h5, h6')) as HTMLElement[];
        // Consolidate logic: sometimes 'el' itself might be the header or close to it? 
        // In standard PostProcessor logic, 'el' is usually a container div.

        // console.log(`[HeaderProgress] Found ${headers.length} headers in current block.`);

        headers.forEach((header) => {
            const headerText = header.innerText?.trim(); // Use innerText and trim
            // console.log(`[HeaderProgress] Checking header: "${headerText}"`);

            if (!headerText) return;

            // Check if there is progress for this header
            if (progressMap.hasOwnProperty(headerText)) {
                const progressValue = progressMap[headerText];
                // console.log(`[HeaderProgress] Match found! Value: ${progressValue}`);

                // Avoid double rendering
                if (header.querySelector('.header-progress-container')) return;

                const progressContainer = document.createElement('span');
                progressContainer.addClass('header-progress-container');

                const progressBar = document.createElement('progress');
                progressBar.addClass('header-progress-bar');
                progressBar.value = progressValue;
                progressBar.max = 100;

                const progressLabel = document.createElement('span');
                progressLabel.addClass('header-progress-label');
                progressLabel.innerText = ` ${progressValue}%`;

                progressContainer.appendChild(progressBar);
                progressContainer.appendChild(progressLabel);

                header.appendChild(progressContainer);
            }
        });
    };
};
