import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    test: {
        alias: {
            obsidian: path.resolve(__dirname, './src/__mocks__/obsidian.ts'),
            '@': path.resolve(__dirname, './src'),
        },
        globals: true,
        environment: 'happy-dom',
    },
});
