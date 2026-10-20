import { AD_DOM_SELECTOR } from './ad-detector.js'

const OBSERVER_OPTIONS = {
  attributes: true,
  attributeFilter: ['aria-disabled', 'aria-hidden', 'aria-label', 'class', 'disabled', 'style', 'title'],
  childList: true,
  characterData: true,
  subtree: true,
}

const NAVIGATION_EVENTS = ['yt-navigate-finish', 'yt-page-data-updated']
const PLAYER_SELECTOR = '#movie_player'
const AD_UI_SELECTOR = AD_DOM_SELECTOR.replace('#movie_player, ', '')

function isElement(node) {
  return node?.nodeType === 1
}

function containsAdElement(node) {
  return isElement(node) &&
    (
      node.matches(AD_UI_SELECTOR) ||
      node.matches('button, [role="button"]') ||
      Boolean(node.querySelector?.(AD_UI_SELECTOR)) ||
      Boolean(node.querySelector?.('button, [role="button"]'))
    )
}

function containsPlayerElement(node) {
  return isElement(node) &&
    (node.matches(PLAYER_SELECTOR) || Boolean(node.querySelector?.(PLAYER_SELECTOR)))
}

function isRelevantMutation(record) {
  const target = isElement(record.target) ? record.target : record.target.parentElement
  if (!target) return false
  if (record.type === 'characterData') {
    return Boolean(
      target.closest?.(`${PLAYER_SELECTOR} button, ${PLAYER_SELECTOR} [role="button"]`),
    )
  }
  if (record.type === 'attributes') {
    if (target.matches?.(PLAYER_SELECTOR)) return true
    return target.closest?.(PLAYER_SELECTOR) &&
      (target.matches?.('video') || target.matches?.(AD_UI_SELECTOR))
  }

  if (
    target.closest?.(PLAYER_SELECTOR) &&
    (target.matches?.(PLAYER_SELECTOR) || target.closest?.(AD_UI_SELECTOR))
  ) {
    return true
  }
  const changedNodes = [...record.addedNodes, ...record.removedNodes]
  if (target.matches?.(PLAYER_SELECTOR) || target.closest?.(PLAYER_SELECTOR)) {
    return changedNodes.some(containsAdElement)
  }
  return changedNodes.some(containsPlayerElement)
}

export function observeAdChanges(
  root,
  onChange,
  {
    Observer = globalThis.MutationObserver,
    schedule = (callback, delay) => setTimeout(callback, delay),
    cancel = (timer) => clearTimeout(timer),
    documentTarget = globalThis.document,
    windowTarget = globalThis.window,
    onNavigation = onChange,
  } = {},
) {
  if (!root || !Observer) throw new Error('A DOM root and MutationObserver are required.')

  let timer = null
  const queueScan = (delay = 120, replace = false) => {
    if (timer !== null) {
      if (!replace) return
      cancel(timer)
    }
    timer = schedule(() => {
      timer = null
      onChange()
    }, delay)
  }

  const observer = new Observer((records) => {
    if (records.some(isRelevantMutation)) queueScan()
  })
  observer.observe(root, OBSERVER_OPTIONS)

  const handleNavigation = () => {
    onNavigation()
    queueScan(180, true)
  }

  for (const eventName of NAVIGATION_EVENTS) {
    documentTarget?.addEventListener?.(eventName, handleNavigation)
  }
  for (const eventName of ['popstate', 'hashchange']) {
    windowTarget?.addEventListener?.(eventName, handleNavigation)
  }

  return () => {
    if (timer !== null) cancel(timer)
    observer.disconnect()
    for (const eventName of NAVIGATION_EVENTS) {
      documentTarget?.removeEventListener?.(eventName, handleNavigation)
    }
    for (const eventName of ['popstate', 'hashchange']) {
      windowTarget?.removeEventListener?.(eventName, handleNavigation)
    }
  }
}
