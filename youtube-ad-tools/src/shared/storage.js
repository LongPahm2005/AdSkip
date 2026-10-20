export const STORAGE_KEYS = {
  settings: 'settings',
  stats: 'stats',
  events: 'events',
}

export const DEFAULT_SETTINGS = { enabled: false }
export const DEFAULT_STATS = { detected: 0, handled: 0, unresolved: 0 }
export const MAX_EVENTS = 100

function storageArea() {
  return globalThis.chrome?.storage?.local ?? null
}

export async function getLocal(key, fallback) {
  const area = storageArea()
  if (!area) return { value: fallback, available: false }

  try {
    const values = await area.get(key)
    return {
      value: values?.[key] ?? fallback,
      available: true,
    }
  } catch (error) {
    console.warn(`Unable to read local extension storage (${key}).`, error)
    return { value: fallback, available: false }
  }
}

export async function setLocal(key, value) {
  const area = storageArea()
  if (!area) return { available: false }

  try {
    await area.set({ [key]: value })
    return { available: true }
  } catch (error) {
    console.warn(`Unable to write local extension storage (${key}).`, error)
    return { available: false }
  }
}

export function subscribeToSettings(onEnabledChange, extensionApi = globalThis.chrome) {
  const changesEvent = extensionApi?.storage?.onChanged
  if (!changesEvent?.addListener) return () => {}

  const listener = (changes, areaName) => {
    if (areaName === 'local' && changes[STORAGE_KEYS.settings]) {
      onEnabledChange(changes[STORAGE_KEYS.settings].newValue?.enabled !== false)
    }
  }

  changesEvent.addListener(listener)
  return () => changesEvent.removeListener?.(listener)
}

export async function incrementStat(name) {
  if (!Object.hasOwn(DEFAULT_STATS, name)) {
    throw new Error(`Unknown statistic: ${name}`)
  }
  const { value, available } = await getLocal(STORAGE_KEYS.stats, DEFAULT_STATS)
  const next = {
    ...DEFAULT_STATS,
    ...value,
    [name]: (Number.isFinite(value?.[name]) ? value[name] : 0) + 1,
  }
  const result = await setLocal(STORAGE_KEYS.stats, next)
  return { value: next, available: available && result.available }
}

export async function appendEvent(event) {
  const { value, available } = await getLocal(STORAGE_KEYS.events, [])
  const events = [...(Array.isArray(value) ? value : []), event].slice(-MAX_EVENTS)
  const result = await setLocal(STORAGE_KEYS.events, events)
  return { available: available && result.available }
}
