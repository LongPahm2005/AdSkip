import assert from 'node:assert/strict'
import test from 'node:test'

test('enables and disables the static DNR ruleset with the saved setting', async () => {
  const updates = []
  let setting = { enabled: false }
  let onInstalled
  let onChanged
  const originalChrome = globalThis.chrome
  globalThis.chrome = {
    runtime: {
      onInstalled: { addListener: (listener) => { onInstalled = listener } },
      onStartup: { addListener() {} },
    },
    storage: {
      local: { get: async () => ({ settings: setting }) },
      onChanged: { addListener: (listener) => { onChanged = listener } },
    },
    declarativeNetRequest: {
      updateEnabledRulesets: async (update) => { updates.push(update) },
    },
  }

  try {
    await import('../../src/background.js')
    await new Promise((resolve) => setImmediate(resolve))
    updates.length = 0

    setting = { enabled: true }
    await onInstalled()
    await new Promise((resolve) => setImmediate(resolve))
    assert.deepEqual(updates.at(-1), {
      enableRulesetIds: ['youtube_ad_requests'],
      disableRulesetIds: [],
    })

    await onChanged({ settings: { newValue: { enabled: false } } }, 'local')
    await new Promise((resolve) => setImmediate(resolve))
    assert.deepEqual(updates.at(-1), {
      enableRulesetIds: [],
      disableRulesetIds: ['youtube_ad_requests'],
    })

    await onChanged({ settings: { newValue: { enabled: true } } }, 'sync')
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(updates.length, 2)
  } finally {
    globalThis.chrome = originalChrome
  }
})
