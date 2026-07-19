import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(rootDir, 'dist');
const clientDistDir = path.join(distDir, 'client');
const serverDistDir = path.join(distDir, 'server');
const clientAssetsDir = path.join(clientDistDir, 'assets');
const packageJson = JSON.parse(await readFile(path.join(rootDir, 'package.json'), 'utf8'));

await rm(distDir, { recursive: true, force: true });
await mkdir(clientDistDir, { recursive: true });
await mkdir(serverDistDir, { recursive: true });
await mkdir(clientAssetsDir, { recursive: true });

await build({
  entryPoints: [path.join(rootDir, 'src', 'server', 'index.ts')],
  outfile: path.join(serverDistDir, 'index.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  sourcemap: true,
  logLevel: 'info'
});

await build({
  entryPoints: [path.join(rootDir, 'src', 'client', 'entry.ts')],
  outfile: path.join(clientDistDir, 'main.js'),
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: ['chrome120', 'firefox120', 'safari17'],
  sourcemap: true,
  logLevel: 'info'
});

const clientIndexTemplate = await readFile(path.join(rootDir, 'src', 'client', 'index.html'), 'utf8');
await writeFile(path.join(clientDistDir, 'index.html'), clientIndexTemplate.replaceAll('__APP_VERSION__', packageJson.version));
await cp(path.join(rootDir, 'src', 'client', 'styles.css'), path.join(clientDistDir, 'styles.css'));
await cp(path.join(rootDir, 'src', 'assets', 'openHAB_appicon.svg'), path.join(clientAssetsDir, 'openHAB_appicon.svg'));
await cp(
  path.join(rootDir, 'src', 'assets', 'openHAB_darkBG_appicon.svg'),
  path.join(clientAssetsDir, 'openHAB_darkBG_appicon.svg')
);
await cp(path.join(rootDir, 'src', 'assets', 'openHAB_workswith.svg'), path.join(clientAssetsDir, 'openHAB_workswith.svg'));
await cp(
  path.join(rootDir, 'src', 'assets', 'openHAB_workswith_darkBG.svg'),
  path.join(clientAssetsDir, 'openHAB_workswith_darkBG.svg')
);
