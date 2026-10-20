import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'

const output = new URL('../../dist/', import.meta.url)

test('build output contains a valid MV3 manifest and popup/content assets', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', output), 'utf8'))
  const packageJson = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'))
  assert.equal(manifest.manifest_version, 3)
  assert.equal(manifest.version, packageJson.version)
  assert.equal(manifest.action.default_popup, 'index.html')
  assert.deepEqual(manifest.permissions.sort(), [
    'activeTab',
    'declarativeNetRequest',
    'storage',
  ])
  assert.deepEqual(manifest.content_scripts[0].js, ['content.js'])
  assert.equal(manifest.content_scripts[0].run_at, 'document_start')
  assert.deepEqual(manifest.background, {
    service_worker: 'background.js',
    type: 'module',
  })
  assert.deepEqual(manifest.declarative_net_request.rule_resources, [{
    id: 'youtube_ad_requests',
    enabled: false,
    path: 'rules/youtube-advertising.json',
  }])
  assert.ok(manifest.content_scripts[0].matches.includes('https://youtube.com/*'))
  assert.ok(manifest.content_scripts[0].matches.includes('https://www.youtube.com/*'))
  assert.ok(manifest.content_scripts[0].matches.includes('https://m.youtube.com/*'))

  await Promise.all([
    access(new URL('index.html', output)),
    access(new URL('content.js', output)),
    access(new URL('favicon.svg', output)),
    access(new URL('background.js', output)),
    access(new URL('rules/youtube-advertising.json', output)),
  ])
  const networkRules = JSON.parse(
    await readFile(new URL('rules/youtube-advertising.json', output), 'utf8'),
  )
  assert.equal(networkRules.length, 1)
  assert.equal(networkRules[0].id, 1)
  assert.equal(networkRules[0].priority, 1)
  assert.equal(networkRules[0].action.type, 'block')
  assert.equal(
    networkRules[0].condition.urlFilter,
    '||googleads.g.doubleclick.net/pagead/ads',
  )
  assert.deepEqual(networkRules[0].condition.resourceTypes, ['xmlhttprequest'])
  assert.deepEqual(networkRules[0].condition.initiatorDomains, [
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
  ])
  assert.deepEqual(networkRules[0].condition.requestDomains, ['googleads.g.doubleclick.net'])
  const html = await readFile(new URL('index.html', output), 'utf8')
  assert.match(html, /assets\/index-[^"]+\.js/)
  assert.match(html, /assets\/index-[^"]+\.css/)
  assert.match(html, /favicon\.svg/)
  const bundledAssets = [...html.matchAll(/(?:src|href)="\/?(assets\/[^"]+)"/g)]
    .map((match) => match[1])
  await Promise.all(bundledAssets.map((asset) => access(new URL(asset, output))))
  const contentScript = await readFile(new URL('content.js', output), 'utf8')
  assert.match(contentScript, /movie_player/)
  assert.doesNotMatch(contentScript, /^\s*(?:import|export)\s/m)
  assert.doesNotMatch(contentScript, /\bimport\s*\(/)
  const backgroundScript = await readFile(new URL('background.js', output), 'utf8')
  assert.match(backgroundScript, /updateEnabledRulesets/)
})
