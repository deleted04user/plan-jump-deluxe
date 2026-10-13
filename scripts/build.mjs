import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'dist');
if (relative(root, output) !== 'dist') throw new Error('Build output must remain inside the project.');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const path of ['index.html', 'src', 'assets', 'public']) await cp(resolve(root, path), resolve(output, path), { recursive: true });
await writeFile(resolve(output, '.nojekyll'), '');
console.log('Built dist/ — all paths are relative, including audio and the camera worker.');
