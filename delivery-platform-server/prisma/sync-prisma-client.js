const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const generatedClient = path.join(projectRoot, 'node_modules', '.prisma', 'client');
const clientPackageRoot = path.dirname(
  require.resolve('@prisma/client/package.json', { paths: [projectRoot] }),
);
const clientPackageNodeModules = path.resolve(clientPackageRoot, '..', '..');
const resolverClient = path.join(clientPackageNodeModules, '.prisma', 'client');

function samePath(left, right) {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

if (!fs.existsSync(generatedClient)) {
  throw new Error(`Generated Prisma client not found: ${generatedClient}`);
}

if (samePath(generatedClient, resolverClient)) {
  console.log('[prisma] Resolver client already points to generated client.');
  process.exit(0);
}

fs.rmSync(resolverClient, { recursive: true, force: true });
fs.mkdirSync(path.dirname(resolverClient), { recursive: true });
fs.cpSync(generatedClient, resolverClient, { recursive: true });

console.log(`[prisma] Synced generated client to resolver path: ${resolverClient}`);
