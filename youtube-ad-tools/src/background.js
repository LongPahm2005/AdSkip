const RULESET_ID = 'youtube_ad_requests'
let settingsRevision = 0
let ruleUpdates = Promise.resolve()

async function syncRuleSet(enabled) {
  if (!globalThis.chrome?.declarativeNetRequest?.updateEnabledRulesets) {
    console.warn('YouTube Ad Tools declarativeNetRequest API is unavailable.')
    return
  }

  try {
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: enabled ? [RULESET_ID] : [],
      disableRulesetIds: enabled ? [] : [RULESET_ID],
    })
  } catch (error) {
    console.warn('YouTube Ad Tools could not update its network rules.', error)
  }
}

function queueRuleSetUpdate(enabled) {
  ruleUpdates = ruleUpdates.then(() => syncRuleSet(enabled))
  return ruleUpdates
}

async function syncFromStorage() {
  const revision = ++settingsRevision
  try {
    const values = await chrome.storage.local.get('settings')
    if (revision === settingsRevision) {
      await queueRuleSetUpdate(values?.settings?.enabled === true)
    }
  } catch (error) {
    console.warn('YouTube Ad Tools could not read settings for network rules.', error)
    if (revision === settingsRevision) await queueRuleSetUpdate(false)
  }
}

chrome.runtime.onInstalled.addListener(syncFromStorage)
chrome.runtime.onStartup.addListener(syncFromStorage)
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.settings) {
    settingsRevision += 1
    return queueRuleSetUpdate(changes.settings.newValue?.enabled === true)
  }
})

void syncFromStorage()
