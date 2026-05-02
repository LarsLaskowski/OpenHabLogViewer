import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(rootDir, 'dist');
const clientDistDir = path.join(distDir, 'client');
const serverDistDir = path.join(distDir, 'server');

await rm(distDir, { recursive: true, force: true });
await mkdir(clientDistDir, { recursive: true });
await mkdir(serverDistDir, { recursive: true });

await build({
  entryPoints: [path.join(rootDir, 'src', 'server', 'index.ts')],
  outfile: path.join(serverDistDir, 'index.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: true,
  logLevel: 'info'
});

await build({
  entryPoints: [path.join(rootDir, 'src', 'client', 'main.ts')],
  outfile: path.join(clientDistDir, 'main.js'),
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: ['chrome120', 'firefox120', 'safari17'],
  sourcemap: true,
  logLevel: 'info'
});

await cp(path.join(rootDir, 'src', 'client', 'index.html'), path.join(clientDistDir, 'index.html'));
await cp(path.join(rootDir, 'src', 'client', 'styles.css'), path.join(clientDistDir, 'styles.css'));
