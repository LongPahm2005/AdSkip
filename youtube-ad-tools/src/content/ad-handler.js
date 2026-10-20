import { isVisible } from './ad-detector.js'

export const MAX_SKIP_ATTEMPTS_PER_AD = 2

export function canAttemptSkip(
  state,
  enabled,
  episodeHandled,
  attempts = 0,
) {
  return enabled &&
    state === 'ad-skippable' &&
    !episodeHandled &&
    attempts < MAX_SKIP_ATTEMPTS_PER_AD
}

export function attemptSkip(button, clickedButtons = new WeakSet(), windowRef = globalThis.window) {
  if (!button || !isVisible(button, windowRef)) {
    return { success: false, reason: 'skip-button-unavailable' }
  }
  if (clickedButtons.has(button)) {
    return { success: false, reason: 'skip-button-already-clicked' }
  }
  if (typeof button.click !== 'function') {
    return { success: false, reason: 'skip-button-not-interactive' }
  }

  clickedButtons.add(button)
  try {
    button.click()
  } catch {
    return { success: false, reason: 'skip-click-failed' }
  }
  return { success: true, reason: null }
}
