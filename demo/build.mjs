// Bundles the site into ONE self-contained HTML file for previewing (npm run demo [output.html]).
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] || join(root, 'dist/demo.html'));

// Inside the bundle, src/data.js is replaced by demo/data-shim.js (which re-exports the real one for the pure helpers).
const useShim = {
  name: 'use-demo-data',
  setup(b) {
    b.onResolve({ filter: /(^|\/)data\.js$/ }, (args) =>
      args.importer.endsWith('demo/data-shim.js') ? undefined : { path: join(root, 'demo/data-shim.js') });
  }
};

const result = await build({
  entryPoints: [join(root, 'demo/entry.js')],
  bundle: true, write: false, minify: true, format: 'iife', target: 'es2020', legalComments: 'none',
  plugins: [useShim], loader: { '.json': 'json' }
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const svg = await readFile(join(root, 'src/assets/hero-pitch.svg'));
const dataUri = `data:image/svg+xml;base64,${svg.toString('base64')}`;
const css = ((await readFile(join(root, 'src/styles.css'), 'utf8')) + '\n' + (await readFile(join(root, 'demo/demo.css'), 'utf8')))
  .replaceAll('url(/assets/hero-pitch.svg)', `url(${dataUri})`);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>TIS Owls Live (preview)</title>
<meta name="theme-color" content="#0a0f1a">
<meta name="color-scheme" content="dark">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700&display=swap">
<style>
${css}
</style>
</head>
<body>
<script>
${js}
</script>
</body>
</html>
`;
await mkdir(dirname(out), { recursive: true });
await writeFile(out, html);
console.log(`Preview written: ${out} (${(html.length / 1024).toFixed(0)} KB)`);
