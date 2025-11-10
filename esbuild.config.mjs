import esbuild from 'esbuild';

const args = process.argv.slice(2);
const watch = args.includes('--watch');

const buildOptions = {
  entryPoints: ['src/main.ts'],
  outfile: 'main.js',
  bundle: true,
  platform: 'browser',
  target: 'es2018',
  format: 'cjs',
  sourcemap: watch,
  external: ['obsidian'],
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
