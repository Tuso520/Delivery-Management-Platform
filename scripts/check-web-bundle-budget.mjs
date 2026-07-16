import { readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = join(root, 'delivery-platform-web/dist/assets');
const limits = {
  '.js': 850 * 1024,
  '.css': 450 * 1024,
  '.mjs': 1500 * 1024,
};
const totalJsLimit = 2600 * 1024;
const files = readdirSync(assets).map((name) => ({ name, bytes: statSync(join(assets, name)).size }));
const failures = [];

for (const file of files) {
  const limit = limits[extname(file.name)];
  if (limit && file.bytes > limit) failures.push(`${file.name}: ${(file.bytes / 1024).toFixed(1)} KiB > ${(limit / 1024).toFixed(0)} KiB`);
}

const totalJs = files.filter((file) => extname(file.name) === '.js').reduce((total, file) => total + file.bytes, 0);
if (totalJs > totalJsLimit) failures.push(`total JavaScript: ${(totalJs / 1024).toFixed(1)} KiB > ${totalJsLimit / 1024} KiB`);

if (failures.length) {
  console.error('Frontend bundle budget exceeded:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Frontend bundle budget passed: ${files.length} assets, ${(totalJs / 1024).toFixed(1)} KiB JavaScript.`);
