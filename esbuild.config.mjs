import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const watch = args.includes('--watch');

const targetDirs = [
  '/Users/joshua/my-docs/KBs/JACS/.obsidian/plugins/elocuency',
  '/Users/joshua/my-docs/KBs/teo-3-eso-kb/.obsidian/plugins/elocuency',
];

const copyPlugin = {
  name: 'copy-plugin',
  setup(build) {
    build.onEnd(() => {
      targetDirs.forEach((dir) => {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        const files = ['main.js', 'styles.css', 'manifest.json', '.hotreload'];
        if (watch) {
          files.push('main.js.map');
        }

        files.forEach((file) => {
          if (fs.existsSync(file)) {
            const dest = path.join(dir, file);
            fs.copyFileSync(file, dest);
            console.log(`Copied ${file} to ${dest}`);
          }
        });
      });
    });
  },
};

const buildOptions = {
  entryPoints: ['src/main.ts'],
  outfile: 'main.js',
  bundle: true,
  platform: 'browser',
  target: 'es2018',
  format: 'cjs',
  sourcemap: watch,
  external: ['obsidian', 'fs', 'path'],
  plugins: [copyPlugin],
  logLevel: 'info',
  banner: {
    js: '/* eslint-disable */\n',
  },
};

async function build() {
  if (watch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('Watching for changes...');
  } else {
    await esbuild.build(buildOptions);
  }
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
