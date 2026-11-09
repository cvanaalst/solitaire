import { readFile, writeFile, mkdir, mkdtemp, rm, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'dist');
const OUT_FILE = join(OUT_DIR, 'solitaire.html');
const SITE_DIR = join(OUT_DIR, 'site');

const SITE_ASSETS = [
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'src/cards.js',
  'src/deals.js',
  'src/engine.js',
  'src/input.js',
  'src/layout.js',
  'src/main.js',
  'src/persist.js',
  'src/render.js',
  'src/rules.js',
  'src/stats.js',
  'src/variants.js',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

const MODULES = [
  'src/cards.js',
  'src/variants.js',
  'src/engine.js',
  'src/layout.js',
  'src/render.js',
  'src/input.js',
  'src/persist.js',
  'src/rules.js',
  'src/stats.js',
  'src/deals.js',
  'src/main.js',
];

function transform(source, name) {
  const stripped = source
    .replace(/^\s*import\s+[^;]*?from\s+'[^']+';?\s*$/gm, '')
    .replace(/^\s*export\s*\{[^}]*\};?\s*$/gm, '')
    .replace(/^(\s*)export\s+(?=(async\s+)?(function|const|let|var|class)\b)/gm, '$1');

  if (/^\s*export\s/m.test(stripped)) {
    throw new Error('Unhandled export syntax left in ' + name);
  }
  return '/* ' + name + ' */\n' + stripped.trim() + '\n';
}

function exportedNames(source) {
  const names = new Set();
  const declaration = /^\s*export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z0-9_$]+)/gm;
  let match;
  while ((match = declaration.exec(source))) names.add(match[1]);
  const list = /^\s*export\s*\{([^}]*)\}/gm;
  while ((match = list.exec(source))) {
    match[1]
      .split(',')
      .map((part) => part.trim().split(/\s+as\s+/)[0].trim())
      .filter(Boolean)
      .forEach((name) => names.add(name));
  }
  return names;
}

function importedNames(source) {
  const imports = [];
  const pattern = /^\s*import\s+(?:\*\s+as\s+([A-Za-z0-9_$]+)|\{([^}]*)\})\s+from\s+'([^']+)'/gm;
  let match;
  while ((match = pattern.exec(source))) {
    const [, namespace, list, from] = match;
    if (namespace) {
      imports.push({ namespace, names: [], from });
      continue;
    }
    const names = list
      .split(',')
      .map((part) => part.trim().split(/\s+as\s+/)[0].trim())
      .filter(Boolean);
    imports.push({ namespace: null, names, from });
  }
  return imports;
}

async function checkSyntax(sources) {
  const folder = await mkdtemp(join(tmpdir(), 'solitaire-build-'));
  for (const [name, source] of sources) {
    const file = join(folder, name.replace(/[^a-z0-9]/gi, '_') + '.mjs');
    await writeFile(file, source, 'utf8');
    try {
      await run(process.execPath, ['--check', file]);
    } catch (error) {
      throw new Error(name + ' has a syntax error:\n' + (error.stderr || error.message));
    }
  }
}

async function build() {
  const html = await readFile(join(ROOT, 'index.html'), 'utf8');
  const css = await readFile(join(ROOT, 'styles.css'), 'utf8');
  const icon = await readFile(join(ROOT, 'icons', 'icon-180.png'));
  const manifest = JSON.parse(await readFile(join(ROOT, 'manifest.webmanifest'), 'utf8'));

  const sources = new Map();
  for (const name of MODULES) {
    sources.set(name, await readFile(join(ROOT, name), 'utf8'));
  }

  for (const [name, source] of sources) {
    for (const entry of importedNames(source)) {
      const target = './' + entry.from.replace(/^\.\//, '');
      const resolved = MODULES.find((candidate) => candidate === target || candidate.endsWith(target.replace('./', '')));
      if (!resolved) {
        throw new Error(name + ' imports from a module that is not bundled: ' + entry.from);
      }
      if (entry.namespace) continue;
      const available = exportedNames(sources.get(resolved));
      for (const imported of entry.names) {
        if (!available.has(imported)) {
          throw new Error(name + ' imports ' + imported + ' which ' + resolved + ' does not export');
        }
      }
    }
  }

  const parts = [];
  for (const name of MODULES) {
    parts.push(transform(sources.get(name), name));
  }

  await checkSyntax(sources);

  const script = [
    '<script>',
    'window.__SOLITAIRE_INLINE__ = true;',
    '(function () {',
    "'use strict';",
    parts.join('\n'),
    '})();',
    '</script>',
  ].join('\n');

  const iconData = 'data:image/png;base64,' + icon.toString('base64');
  const manifestData =
    'data:application/manifest+json,' + encodeURIComponent(JSON.stringify(manifest));

  let output = html
    .replace(
      '<link rel="stylesheet" href="styles.css" />',
      '<style>\n' + css + '\n</style>'
    )
    .replace(
      '<link rel="manifest" href="manifest.webmanifest" />',
      '<link rel="manifest" href="' + manifestData + '" />'
    )
    .replace(
      '<link rel="apple-touch-icon" href="icons/icon-180.png" />',
      '<link rel="apple-touch-icon" href="' + iconData + '" />'
    )
    .replace(
      '<link rel="icon" href="icons/icon-192.png" />',
      '<link rel="icon" href="' + iconData + '" />'
    )
    .replace(
      '<script type="module" src="src/main.js"></script>',
      script
    );

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, output, 'utf8');

  const kb = (Buffer.byteLength(output) / 1024).toFixed(1);
  console.log('built ' + OUT_FILE + ' (' + kb + ' KB, single file, runs from file://)');

  const version = await assetVersion();
  const swSource = await readFile(join(ROOT, 'sw.js'), 'utf8');
  if (!/const CACHE = '[^']+'/.test(swSource)) {
    throw new Error('sw.js has no CACHE constant to replace');
  }
  const sw = swSource.replace(/const CACHE = '[^']+';/, "const CACHE = 'solitaire-" + version + "';");

  await rm(SITE_DIR, { recursive: true, force: true });
  for (const asset of SITE_ASSETS) {
    const target = join(SITE_DIR, asset);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(ROOT, asset), target);
  }
  await writeFile(join(SITE_DIR, 'sw.js'), sw, 'utf8');
  await mkdir(join(SITE_DIR, 'dist'), { recursive: true });
  await writeFile(join(SITE_DIR, 'dist', 'solitaire.html'), output, 'utf8');

  console.log('built ' + SITE_DIR + ' (service worker cache: solitaire-' + version + ')');
}

async function assetVersion() {
  const hash = createHash('sha256');
  for (const asset of SITE_ASSETS) {
    hash.update(asset);
    hash.update(await readFile(join(ROOT, asset)));
  }
  return hash.digest('hex').slice(0, 10);
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
