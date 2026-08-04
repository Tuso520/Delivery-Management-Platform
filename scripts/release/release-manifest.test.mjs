import assert from 'node:assert/strict'
import { test } from 'node:test'

import { validateManifest } from './release-manifest.mjs'

const sha = 'a'.repeat(40)
const digest = 'b'.repeat(64)
const checksum = 'c'.repeat(64)

function validManifest() {
  return {
    schemaVersion: 1,
    releaseId: sha,
    shortReleaseId: sha.slice(0, 12),
    repository: 'owner/delivery-platform',
    components: {
      backend: { image: `ghcr.io/owner/delivery-platform/backend@sha256:${digest}` },
      migrator: { image: `ghcr.io/owner/delivery-platform/migrator@sha256:${digest}` },
      frontend: {
        artifact: `ghcr.io/owner/delivery-platform/frontend-release:sha-${sha}`,
        file: 'frontend.tar.gz',
        sha256: checksum,
        bytes: 1024,
      },
    },
    migrations: { expectedCount: 46 },
  }
}

test('accepts a complete immutable release manifest', () => {
  assert.equal(validateManifest(validManifest()).releaseId, sha)
})

test('rejects mutable backend image tags', () => {
  const manifest = validManifest()
  manifest.components.backend.image = 'ghcr.io/owner/delivery-platform/backend:latest'
  assert.throws(() => validateManifest(manifest), /pinned by sha256 digest/u)
})

test('rejects a short release mismatch', () => {
  const manifest = validManifest()
  manifest.shortReleaseId = '0123456789ab'
  assert.throws(() => validateManifest(manifest), /does not match/u)
})
