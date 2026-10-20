import {
  attemptSkip,
  canAttemptSkip,
  MAX_SKIP_ATTEMPTS_PER_AD,
} from './ad-handler.js'
import { detectAdState } from './ad-detector.js'
import { observeAdChanges } from './ad-observer.js'
import {
  appendEvent,
  DEFAULT_SETTINGS,
  getLocal,
  incrementStat,
  subscribeToSettings,
  STORAGE_KEYS,
} from '../shared/storage.js'

const SKIP_CONFIRMATION_TIMEOUT_MS = 5000

let clickedButtons = new WeakSet()
let enabled = DEFAULT_SETTINGS.enabled
let currentState = 'unknown'
let adEpisodeActive = false
let episodeHandled = false
let skipAttempts = 0
let detectedCounted = false
let unresolvedCounted = false
let skipActionPending = false
let pendingSkipTimer = null
let settingsRevision = 0
let started = false

function recordEvent(event) {
  appendEvent({ timestamp: new Date().toISOString(), ...event })
    .then(({ available }) => {
      if (!available) console.warn('YouTube Ad Tools could not persist an event.')
    })
    .catch((error) => console.warn('YouTube Ad Tools could not record an event.', error))
}

function recordStat(name) {
  incrementStat(name)
    .then(({ available }) => {
      if (!available) console.warn(`YouTube Ad Tools could not persist the ${name} statistic.`)
    })
    .catch((error) => console.warn(`YouTube Ad Tools could not update the ${name} statistic.`, error))
}

function recordUnconfirmed(reason, previousState = currentState) {
  if (unresolvedCounted) return
  unresolvedCounted = true
  skipActionPending = false
  recordStat('unresolved')
  recordEvent({
    eventType: 'AD_BLOCK_UNCONFIRMED',
    before: previousState,
    after: currentState,
    action: 'none',
    success: false,
    reason,
  })
}

function finishAdEpisode(reason, previousState, nextState) {
  if (!adEpisodeActive || episodeHandled || unresolvedCounted) return
  if (skipActionPending) {
    if (pendingSkipTimer !== null) clearTimeout(pendingSkipTimer)
    pendingSkipTimer = null
    skipActionPending = false
    episodeHandled = true
    recordStat('handled')
    recordEvent({
      eventType: 'AD_SIGNAL_CLEARED_AFTER_SKIP_ACTION',
      before: previousState,
      after: nextState,
      action: 'skip-confirmed',
      success: true,
      reason: null,
    })
    return
  }
  if (skipAttempts === 0 && !enabled) {
    recordEvent({
      eventType: 'AD_BLOCK_UNCONFIRMED',
      before: previousState,
      after: nextState,
      action: 'none',
      success: false,
      reason: 'automatic-handling-disabled',
    })
    return
  }
  currentState = nextState
  recordUnconfirmed(reason, previousState)
}

function handleState(result) {
  const previousState = currentState
  currentState = result.state

  const recognizedAd = result.state === 'ad-skippable' || result.state === 'ad-unskippable'
  if (recognizedAd && !adEpisodeActive) {
    adEpisodeActive = true
    episodeHandled = false
    skipAttempts = 0
    clickedButtons = new WeakSet()
    detectedCounted = false
    unresolvedCounted = false
  }

  if (recognizedAd && !detectedCounted) {
    detectedCounted = true
    recordStat('detected')
    recordEvent({
      eventType: 'AD_SIGNAL_DETECTED',
      before: previousState,
      after: result.state,
      action: 'detected',
      success: true,
      reason: null,
    })
  } else if (result.state !== previousState) {
    recordEvent({
      eventType: 'STATE_CHANGE',
      before: previousState,
      after: result.state,
      action: 'state-change',
      success: true,
      reason: null,
    })
  }

  if (result.state === 'unknown') return

  if (result.state === 'no-ad') {
    if (adEpisodeActive) finishAdEpisode('ad-ended-without-successful-skip', previousState, result.state)
    adEpisodeActive = false
    episodeHandled = false
    skipAttempts = 0
    detectedCounted = false
    unresolvedCounted = false
    return
  }

  if (!canAttemptSkip(result.state, enabled, episodeHandled, skipAttempts)) return

  const attempt = attemptSkip(result.skipButton, clickedButtons)
  if (attempt.success) {
    skipAttempts += 1
    skipActionPending = true
    if (pendingSkipTimer !== null) clearTimeout(pendingSkipTimer)
    recordEvent({
      eventType: 'SKIP_ACTION_PERFORMED',
      before: result.state,
      after: 'skip-click-dispatched',
      action: 'official-skip-button',
      success: true,
      confirmed: false,
      reason: 'awaiting-player-state-confirmation',
    })
    pendingSkipTimer = setTimeout(() => {
      pendingSkipTimer = null
      if (!adEpisodeActive || episodeHandled || unresolvedCounted) return
      recordEvent({
        eventType: 'SKIP_ACTION_UNCONFIRMED',
        before: currentState,
        after: currentState,
        action: 'official-skip-button',
        success: false,
        reason: 'skip-transition-not-observed',
      })
      if (enabled && skipAttempts < MAX_SKIP_ATTEMPTS_PER_AD) {
        clickedButtons = new WeakSet()
        scan()
        if (pendingSkipTimer !== null) return
      }
      if (currentState === 'ad-skippable' || currentState === 'ad-unskippable') {
        recordUnconfirmed(
          !enabled
            ? 'automatic-handling-disabled'
            : skipAttempts >= MAX_SKIP_ATTEMPTS_PER_AD
            ? 'skip-transition-not-observed-after-maximum-attempts'
            : 'skip-button-not-available',
        )
      }
    }, SKIP_CONFIRMATION_TIMEOUT_MS)
  } else if (attempt.reason !== 'skip-button-already-clicked') {
    recordEvent({
      eventType: 'SKIP_ACTION_FAILED',
      before: result.state,
      after: result.state,
      action: 'official-skip-button',
      success: false,
      reason: attempt.reason,
    })
  }
}

function scan() {
  try {
    for (const video of document.querySelectorAll('#movie_player video')) {
      if (observedVideos.has(video)) continue
      observedVideos.add(video)
      video.addEventListener('error', () => {
        recordEvent({
          eventType: 'VIDEO_PLAYBACK_ERROR',
          errorCode: video.error?.code ?? null,
          reason: 'video-element-error',
        })
      })
    }
    handleState(detectAdState(document, window))
  } catch (error) {
    console.warn('YouTube Ad Tools could not inspect the current player.', error)
    handleState({ state: 'unknown', skipButton: null })
  }
}

const observedVideos = new WeakSet()

function start() {
  if (started) return
  started = true
  observeAdChanges(document.documentElement ?? document, scan, {
    onNavigation: () => {
      if (pendingSkipTimer !== null) clearTimeout(pendingSkipTimer)
      pendingSkipTimer = null
      currentState = 'unknown'
      adEpisodeActive = false
      episodeHandled = false
      skipAttempts = 0
      skipActionPending = false
      clickedButtons = new WeakSet()
      detectedCounted = false
      unresolvedCounted = false
    },
  })
  scan()
}

async function initialize() {
  start()
  const revision = settingsRevision
  const { value, available } = await getLocal(STORAGE_KEYS.settings, DEFAULT_SETTINGS)
  if (revision === settingsRevision) enabled = value.enabled !== false
  if (!available) console.warn('YouTube Ad Tools is using the safe default setting.')
  scan()
}

const initialization = initialize().catch((error) => {
  console.warn('YouTube Ad Tools could not initialize; automatic handling is disabled.', error)
  enabled = false
  scan()
})

subscribeToSettings((nextEnabled) => {
  settingsRevision += 1
  enabled = nextEnabled
  scan()
})

globalThis.chrome?.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'GET_STATUS') {
    initialization.then(() => sendResponse({ state: currentState, enabled }))
    return true
  }
})
