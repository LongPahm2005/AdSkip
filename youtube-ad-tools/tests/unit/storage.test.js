import assert from 'node:assert/strict'
import test from 'node:test'
import {
  appendEvent,
  DEFAULT_SETTINGS,
  getLocal,
  incrementStat,
  MAX_EVENTS,
  setLocal,
  subscribeToSettings,
  STORAGE_KEYS,
} from '../../src/shared/storage.js'

test('storage APIs safely report unavailable storage and use defaults', async () => {
  const originalChrome = globalThis.chrome
  delete globalThis.chrome
  try {
    assert.deepEqual(await getLocal(STORAGE_KEYS.settings, DEFAULT_SETTINGS), {
      value: DEFAULT_SETTINGS,
      available: false,
    })
    assert.deepEqual(await setLocal(STORAGE_KEYS.settings, { enabled: false }), {
      available: false,
    })
  } finally {
    globalThis.chrome = originalChrome
  }
})

test('storage read errors are reported as unavailable', async () => {
  const originalChrome = globalThis.chrome
  globalThis.chrome = { storage: { local: { get: async () => { throw new Error('storage error') } } } }
  const originalWarn = console.warn
  console.warn = () => {}
  try {
    const result = await getLocal(STORAGE_KEYS.settings, DEFAULT_SETTINGS)
    assert.deepEqual(result, { value: DEFAULT_SETTINGS, available: false })
  } finally {
    console.warn = originalWarn
    globalThis.chrome = originalChrome
  }
})

test('event log is capped at the configured maximum', async () => {
  const originalChrome = globalThis.chrome
  const records = Array.from({ length: MAX_EVENTS }, (_, index) => ({ index }))
  globalThis.chrome = {
    storage: {
      local: {
        get: async () => ({ [STORAGE_KEYS.events]: records }),
        set: async (values) => Object.assign(records, values[STORAGE_KEYS.events]),
      },
    },
  }
  try {
    await appendEvent({ index: MAX_EVENTS })
    assert.equal(records.length, MAX_EVENTS)
    assert.equal(records.at(-1).index, MAX_EVENTS)
  } finally {
    globalThis.chrome = originalChrome
  }
})

test('statistics increment only the requested known counter', async () => {
  const originalChrome = globalThis.chrome
  const data = { [STORAGE_KEYS.stats]: { detected: 3, handled: 1, unresolved: 0 } }
  globalThis.chrome = {
    storage: {
      local: {
        get: async (key) => ({ [key]: data[key] }),
        set: async (values) => Object.assign(data, values),
      },
    },
  }
  try {
    const result = await incrementStat('handled')
    assert.deepEqual(result.value, { detected: 3, handled: 2, unresolved: 0 })
    await assert.rejects(incrementStat('not-a-counter'), /Unknown statistic/)
  } finally {
    globalThis.chrome = originalChrome
  }
})

test('content and popup receive persisted setting changes and unsubscribe cleanly', () => {
  let listener
  let removedListener
  let enabled
  const api = {
    storage: {
      onChanged: {
        addListener: (callback) => { listener = callback },
        removeListener: (callback) => { removedListener = callback },
      },
    },
  }
  const unsubscribe = subscribeToSettings((value) => { enabled = value }, api)
  listener({ settings: { newValue: { enabled: false } } }, 'local')
  assert.equal(enabled, false)
  listener({ settings: { newValue: { enabled: true } } }, 'sync')
  assert.equal(enabled, false)
  unsubscribe()
  assert.equal(removedListener, listener)
})
