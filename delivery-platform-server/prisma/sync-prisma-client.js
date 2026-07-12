const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const sourceSchema = path.join(__dirname, 'schema.prisma');
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

const clientLocations = [
  generatedClient,
  resolverClient,
  clientPackageEmbeddedClient,
  clientPackageRoot,
];
const clientCandidates = clientLocations.filter(hasGeneratedClient);
const expectedSchema = fs.readFileSync(sourceSchema, 'utf8');

function matchesSourceSchema(clientDir) {
  return fs.readFileSync(path.join(clientDir, 'schema.prisma'), 'utf8') === expectedSchema;
}

const sourceClient = clientCandidates.sort((left, right) => {
  const sourceMatchDifference =
    Number(matchesSourceSchema(right)) - Number(matchesSourceSchema(left));
  if (sourceMatchDifference !== 0) return sourceMatchDifference;
  if (samePath(left, resolverClient)) return -1;
  if (samePath(right, resolverClient)) return 1;
  const leftGeneratedAt = fs.statSync(path.join(left, 'schema.prisma')).mtimeMs;
  const rightGeneratedAt = fs.statSync(path.join(right, 'schema.prisma')).mtimeMs;
  return rightGeneratedAt - leftGeneratedAt;
})[0];

if (!sourceClient) {
  throw new Error(
    `Generated Prisma client not found. Checked: ${[
      ...clientLocations,
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
