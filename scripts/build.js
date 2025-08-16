import * as esbuild from 'esbuild';
import { createBuildSettings } from './settings.js';

const settings = createBuildSettings({ minify: true });

await esbuild.build(settings);
await esbuild.build({
  entryPoints: ['./node_modules/monaco-editor/esm/vs/editor/editor.worker.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  outfile: './www/editor.worker.js',
});