const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const generatedClient = path.join(projectRoot, 'node_modules', '.prisma', 'client');
const clientPackageRoot = path.dirname(
  require.resolve('@prisma/client/package.json', { paths: [projectRoot] }),
);
const clientPackageNodeModules = path.resolve(clientPackageRoot, '..', '..');
const resolverClient = path.join(clientPackageNodeModules, '.prisma', 'client');
const clientPackageEmbeddedClient = path.join(clientPackageRoot, '.prisma', 'client');

function samePath(left, right) {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

function hasGeneratedClient(clientDir) {
  return (
    fs.existsSync(path.join(clientDir, 'index.js')) &&
    fs.existsSync(path.join(clientDir, 'default.js')) &&
    fs.existsSync(path.join(clientDir, 'schema.prisma'))
  );
}

const sourceClient = [
  generatedClient,
  resolverClient,
  clientPackageEmbeddedClient,
  clientPackageRoot,
].find(hasGeneratedClient);

if (!sourceClient) {
  throw new Error(
    `Generated Prisma client not found. Checked: ${[
      generatedClient,
      resolverClient,
      clientPackageEmbeddedClient,
      clientPackageRoot,
    ].join(', ')}`,
  );
}

if (samePath(sourceClient, resolverClient)) {
  console.log('[prisma] Resolver client already points to generated client.');
  process.exit(0);
}

fs.rmSync(resolverClient, { recursive: true, force: true });
fs.mkdirSync(path.dirname(resolverClient), { recursive: true });
fs.cpSync(sourceClient, resolverClient, { recursive: true });

console.log(`[prisma] Synced generated client to resolver path: ${resolverClient}`);
