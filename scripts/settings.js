import esbuildPluginTsc from 'esbuild-plugin-tsc';

export function createBuildSettings(options) {
  return {
    entryPoints: ['src/Shell.ts', 'src/Catalog.ts'],
    outdir: 'www',
    bundle: true,
    loader: {
      '.ttf': 'file',
    },
    plugins: [
      esbuildPluginTsc({
        force: true
      }),
    ],
    ...options
  };
}