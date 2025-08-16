import esbuildPluginTsc from 'esbuild-plugin-tsc';
import esbuildSvelte from "esbuild-svelte";
import sveltePreprocess from "svelte-preprocess";
import fs from 'fs';

const renamePlugin = () => ({
  name: 'rename-plugin',
  setup(build) {
    build.onEnd(async () => {
      try {
        fs.renameSync('./www/Shell.js', './www/shell.js');
        fs.renameSync('./www/Shell.js.map', './www/shell.js.map');
        fs.renameSync('./www/Shell.css', './www/shell.css');
        fs.renameSync('./www/Shell.css.map', './www/shell.css.map');
        fs.renameSync('./www/catalog/Catalog.js', './www/catalog/catalog.js');
        fs.renameSync('./www/catalog/Catalog.js.map', './www/catalog/catalog.js.map');
        fs.renameSync('./www/catalog/Catalog.css', './www/catalog/catalog.css');
        fs.renameSync('./www/catalog/Catalog.css.map', './www/catalog/catalog.css.map');
      } catch (e) {
        console.error('Failed to rename file:', e);
      }
    });
  },
});

export function createBuildSettings(options) {
  return {
    entryPoints: ['src/Shell.ts', 'src/catalog/Catalog.ts'],
    outdir: 'www',
    bundle: true,
		mainFields: ["svelte", "browser", "module", "main"],
		conditions: ["svelte", "browser"],
    loader: {
      '.ttf': 'file',
    },
    plugins: [
      esbuildSvelte({
        preprocess: sveltePreprocess(),
      }),
      esbuildPluginTsc({
        force: true
      }),
      renamePlugin(),
    ],
    ...options
  };
}