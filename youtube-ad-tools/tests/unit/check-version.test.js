import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const scriptPath = fileURLToPath(new URL('../../scripts/check-version.js', import.meta.url))

function runCheckVersion(environment) {
  return spawnSync(process.execPath, [scriptPath], {
    encoding: 'utf8',
    env: { ...process.env, ...environment },
  })
}

test('does not treat a pull request merge ref as a release tag', () => {
  const result = runCheckVersion({
    GITHUB_REF: 'refs/pull/2/merge',
    GITHUB_REF_NAME: '2/merge',
    GITHUB_REF_TYPE: 'branch',
  })

  assert.equal(result.status, 0, result.stderr)
})

test('accepts a tag matching the project version', () => {
  const result = runCheckVersion({
    GITHUB_REF: 'refs/tags/v1.0.0',
    GITHUB_REF_NAME: 'v1.0.0',
    GITHUB_REF_TYPE: 'tag',
  })

  assert.equal(result.status, 0, result.stderr)
})

test('rejects a tag that does not match the project version', () => {
  const result = runCheckVersion({
    GITHUB_REF: 'refs/tags/v2.0.0',
    GITHUB_REF_NAME: 'v2.0.0',
    GITHUB_REF_TYPE: 'tag',
  })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Release tag v2\.0\.0 does not match project version v1\.0\.0/)
})
