import { createHash } from 'node:crypto'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const SHA_PATTERN = /^[0-9a-f]{40}$/u
const DIGEST_IMAGE_PATTERN = /^ghcr\.io\/[a-z0-9_.-]+\/[a-z0-9_./-]+@sha256:[0-9a-f]{64}$/u
const CHECKSUM_PATTERN = /^[0-9a-f]{64}$/u

function fail(message) {
  throw new Error(message)
}

function parseArguments(values) {
  const result = {}
  for (let index = 0; index < values.length; index += 1) {
    const current = values[index]
    if (!current.startsWith('--')) fail(`unexpected argument: ${current}`)
    const key = current.slice(2)
    const value = values[index + 1]
    if (!value || value.startsWith('--')) fail(`missing value for --${key}`)
    if (Object.hasOwn(result, key)) fail(`duplicate argument: --${key}`)
    result[key] = value
    index += 1
  }
  return result
}

function requireValue(argumentsMap, key) {
  const value = argumentsMap[key]?.trim()
  if (!value) fail(`--${key} is required`)
  return value
}

async function sha256(filePath) {
  const content = await readFile(filePath)
  return createHash('sha256').update(content).digest('hex')
}

export function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    fail('release manifest must be an object')
  }
  if (manifest.schemaVersion !== 1) fail('unsupported release manifest schemaVersion')
  if (!SHA_PATTERN.test(manifest.releaseId)) fail('releaseId must be a full lowercase commit SHA')
  if (manifest.shortReleaseId !== manifest.releaseId.slice(0, 12)) {
    fail('shortReleaseId does not match releaseId')
  }
  if (typeof manifest.repository !== 'string' || !manifest.repository.trim()) {
    fail('repository is required')
  }
  for (const component of ['backend', 'migrator']) {
    const image = manifest.components?.[component]?.image
    if (!DIGEST_IMAGE_PATTERN.test(image ?? '')) {
      fail(`${component} image must be a lowercase GHCR reference pinned by sha256 digest`)
    }
  }
  const frontend = manifest.components?.frontend
  if (!frontend || typeof frontend !== 'object') fail('frontend component is required')
  if (typeof frontend.artifact !== 'string' || !frontend.artifact.startsWith('ghcr.io/')) {
    fail('frontend artifact must be a GHCR OCI reference')
  }
  if (!CHECKSUM_PATTERN.test(frontend.sha256 ?? '')) fail('frontend sha256 is invalid')
  if (!Number.isSafeInteger(frontend.bytes) || frontend.bytes <= 0) {
    fail('frontend bytes must be a positive integer')
  }
  if (!Number.isSafeInteger(manifest.migrations?.expectedCount) || manifest.migrations.expectedCount <= 0) {
    fail('migrations.expectedCount must be a positive integer')
  }
  return manifest
}

async function createManifest(argumentsMap) {
  const releaseId = requireValue(argumentsMap, 'release-id')
  if (!SHA_PATTERN.test(releaseId)) fail('--release-id must be a full lowercase commit SHA')
  const frontendPath = resolve(requireValue(argumentsMap, 'frontend-file'))
  const frontendStats = await stat(frontendPath)
  if (!frontendStats.isFile() || frontendStats.size <= 0) fail('frontend bundle must be a non-empty file')
  const expectedCount = Number.parseInt(requireValue(argumentsMap, 'migration-count'), 10)
  const manifest = validateManifest({
    schemaVersion: 1,
    releaseId,
    shortReleaseId: releaseId.slice(0, 12),
    repository: requireValue(argumentsMap, 'repository'),
    components: {
      backend: { image: requireValue(argumentsMap, 'backend-image') },
      migrator: { image: requireValue(argumentsMap, 'migrator-image') },
      frontend: {
        artifact: requireValue(argumentsMap, 'frontend-artifact'),
        file: basename(frontendPath),
        sha256: await sha256(frontendPath),
        bytes: frontendStats.size,
      },
    },
    migrations: { expectedCount },
  })
  const outputPath = resolve(requireValue(argumentsMap, 'output'))
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  process.stdout.write(`${outputPath}\n`)
}

async function verifyManifest(argumentsMap) {
  const manifestPath = resolve(requireValue(argumentsMap, 'manifest'))
  const manifest = validateManifest(JSON.parse(await readFile(manifestPath, 'utf8')))
  if (argumentsMap['release-id'] && manifest.releaseId !== argumentsMap['release-id']) {
    fail('manifest releaseId does not match the expected release')
  }
  if (argumentsMap['frontend-file']) {
    const frontendPath = resolve(argumentsMap['frontend-file'])
    const frontendStats = await stat(frontendPath)
    if (frontendStats.size !== manifest.components.frontend.bytes) {
      fail('frontend bundle size does not match the manifest')
    }
    if ((await sha256(frontendPath)) !== manifest.components.frontend.sha256) {
      fail('frontend bundle checksum does not match the manifest')
    }
  }
  process.stdout.write(`${manifest.releaseId}\n`)
}

async function main() {
  const [command, ...values] = process.argv.slice(2)
  const argumentsMap = parseArguments(values)
  if (command === 'create') return createManifest(argumentsMap)
  if (command === 'verify') return verifyManifest(argumentsMap)
  fail('usage: release-manifest.mjs <create|verify> [arguments]')
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`[release-manifest] ${error.message}\n`)
    process.exitCode = 1
  })
}
