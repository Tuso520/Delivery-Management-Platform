import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnection } from 'node:net';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const strictDocker = process.argv.includes('--require-docker');
const failures = [];
const warnings = [];

function portIsOpen(port) {
  return new Promise((resolvePort) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(250);
    socket.once('connect', () => {
      socket.destroy();
      resolvePort(true);
    });
    const close = () => {
      socket.destroy();
      resolvePort(false);
    };
    socket.once('error', close);
    socket.once('timeout', close);
  });
}

function commandVersion(command, args = ['--version']) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return undefined;
  }
}

function pnpmVersion() {
  if (process.platform !== 'win32') return commandVersion('pnpm');
  try {
    return execFileSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'pnpm --version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
}

if (Number(process.versions.node.split('.')[0]) !== 20) failures.push(`Node.js 20 required; found ${process.version}`);
const pnpm = pnpmVersion();
if (pnpm !== '10.34.4') failures.push(`pnpm 10.34.4 required; found ${pnpm ?? 'not installed'}`);

for (const workspace of ['delivery-platform-web', 'delivery-platform-server']) {
  for (const file of ['package.json', 'pnpm-lock.yaml']) {
    if (!existsSync(join(root, workspace, file))) failures.push(`${workspace}/${file} is missing`);
  }
  if (!existsSync(join(root, workspace, 'node_modules'))) warnings.push(`${workspace}/node_modules is missing; run pnpm install`);
}
if (!existsSync(join(root, 'delivery-platform-server/node_modules/@prisma/client/index.js'))) {
  warnings.push('Prisma Client is not generated; run pnpm --dir delivery-platform-server prisma:generate');
}

const docker = commandVersion('docker', ['compose', 'version']);
if (!docker) (strictDocker ? failures : warnings).push('Docker Compose is unavailable; real dependency acceptance cannot run');

const localEnv = join(root, '.env.local');
if (!existsSync(localEnv)) {
  warnings.push('.env.local is missing; copy .env.local.example before real dependency acceptance');
} else {
  const env = readFileSync(localEnv, 'utf8');
  for (const name of ['SEED_ADMIN_PASSWORD', 'SEED_DEFAULT_PASSWORD']) {
    const value = env.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1]?.trim();
    if (!value || /^CHANGE_ME/i.test(value)) failures.push(`${name} must be explicitly configured in .env.local`);
  }
}

const ports = [13000, 13306, 16379, 18080, 19000, 19001];
const occupiedPorts = [];
for (const port of ports) {
  if (await portIsOpen(port)) occupiedPorts.push(port);
}
if (occupiedPorts.length) warnings.push(`local acceptance ports already in use: ${occupiedPorts.join(', ')}`);

console.log(`Node.js ${process.version}; pnpm ${pnpm ?? 'unavailable'}; Docker Compose ${docker ?? 'unavailable'}`);
warnings.forEach((warning) => console.warn(`WARN: ${warning}`));
if (failures.length) {
  failures.forEach((failure) => console.error(`ERROR: ${failure}`));
  process.exit(1);
}
console.log('Development preflight passed.');
