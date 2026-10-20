import assert from 'node:assert/strict'
import test from 'node:test'
import { detectAdState, findSkipButton, isVisible } from '../../src/content/ad-detector.js'
import { attemptSkip, canAttemptSkip } from '../../src/content/ad-handler.js'
import { observeAdChanges } from '../../src/content/ad-observer.js'

function makeElement({ visible = true, disabled = false, connected = true } = {}) {
  return {
    disabled,
    isConnected: connected,
    hidden: false,
    getAttribute: () => null,
    getClientRects: () => visible ? [{}] : [],
    getBoundingClientRect: () => ({ width: visible ? 10 : 0, height: visible ? 10 : 0 }),
    clickCount: 0,
    click() {
      this.clickCount += 1
    },
  }
}

function makeDocument({
  player = true,
  adShowing = false,
  videoAdShowing = false,
  marker = false,
  skip = false,
  labeledSkip = null,
} = {}) {
  const state = { player, adShowing, videoAdShowing, marker, skip, labeledSkip }
  const markerElement = makeElement()
  const skipButton = makeElement()
  const video = {
    classList: { contains: (name) => name === 'ad-showing' && state.videoAdShowing },
  }
  const labeledButton = makeElement()
  labeledButton.getAttribute = (name) => name === 'aria-label' ? state.labeledSkip : null
  const playerElement = {
    classList: { contains: (name) => name === 'ad-showing' && state.adShowing },
    querySelector(selector) {
      if (selector === 'video') return video
      return null
    },
    querySelectorAll(selector) {
      if (selector.includes('.ytp-ad-player-overlay')) return state.marker ? [markerElement] : []
      if (selector.includes('.ytp-ad-skip-button')) return state.skip ? [skipButton] : []
      if (selector === 'button, [role="button"]') return state.labeledSkip ? [labeledButton] : []
      if (selector === '.ytp-ad-progress-list') return [makeElement()]
      return []
    },
  }
  return {
    document: { querySelector: () => state.player ? playerElement : null },
    skipButton,
    state,
  }
}

test('reports unknown when the YouTube player is absent', () => {
  assert.equal(detectAdState({ querySelector: () => null }).state, 'unknown')
})

test('reports no ad when neither ad signal is present', () => {
  const { document } = makeDocument()
  assert.equal(detectAdState(document).state, 'no-ad')
})

test('requires both player and visible ad signals before classifying an ad', () => {
  const onlyPlayerSignal = makeDocument({ adShowing: true })
  const onlyVideoSignal = makeDocument({ videoAdShowing: true })
  const onlyMarkerSignal = makeDocument({ marker: true })
  assert.equal(detectAdState(onlyPlayerSignal.document).state, 'transitioning')
  assert.equal(detectAdState(onlyVideoSignal.document).state, 'transitioning')
  assert.equal(detectAdState(onlyMarkerSignal.document).state, 'transitioning')
})

test('distinguishes skippable and currently unskippable ads', () => {
  const skippable = makeDocument({ adShowing: true, marker: true, skip: true })
  const unskippable = makeDocument({ adShowing: true, marker: true })
  assert.equal(detectAdState(skippable.document).state, 'ad-skippable')
  assert.equal(detectAdState(unskippable.document).state, 'ad-unskippable')
})

test('corroborates player and video ad classes without requiring an overlay', () => {
  const fixture = makeDocument({ adShowing: true, videoAdShowing: true })
  assert.equal(detectAdState(fixture.document).state, 'ad-unskippable')
})

test('uses a localized official Skip label only inside the player', () => {
  const fixture = makeDocument({ adShowing: true, labeledSkip: 'Bỏ qua' })
  assert.equal(detectAdState(fixture.document).state, 'ad-skippable')
  assert.ok(findSkipButton(fixture.document.querySelector('#movie_player')))
})

test('clicks the semantic button inside a skip-control wrapper', () => {
  const wrapper = makeElement()
  const button = makeElement()
  button.tagName = 'BUTTON'
  wrapper.querySelectorAll = (selector) => selector === 'button, [role="button"]' ? [button] : []
  const player = {
    querySelectorAll(selector) {
      return selector.includes('.ytp-ad-skip-button') ? [wrapper] : []
    },
  }

  assert.equal(findSkipButton(player), button)
  assert.deepEqual(attemptSkip(findSkipButton(player)), { success: true, reason: null })
  assert.equal(wrapper.clickCount, 0)
  assert.equal(button.clickCount, 1)
})

test('does not accept non-ad controls merely because their labels contain Skip', () => {
  const fixture = makeDocument({ adShowing: true, labeledSkip: 'Skip navigation' })
  assert.equal(findSkipButton(fixture.document.querySelector('#movie_player')), null)
  assert.equal(detectAdState(fixture.document).state, 'transitioning')
})

test('does not treat the normal-player ad progress list as an ad signal', () => {
  const fixture = makeDocument()
  assert.equal(detectAdState(fixture.document).state, 'no-ad')
})

test('does not classify a hidden skip control as actionable', () => {
  const { document, skipButton } = makeDocument({ adShowing: true, marker: true, skip: true })
  skipButton.getClientRects = () => []
  assert.equal(detectAdState(document).state, 'ad-unskippable')
})

test('rejects a skip button that disappears before the click attempt', () => {
  const button = makeElement({ connected: false })
  const result = attemptSkip(button)
  assert.deepEqual(result, { success: false, reason: 'skip-button-unavailable' })
  assert.equal(button.clickCount, 0)
})

test('clicks an official skip button at most once per ad episode', () => {
  const button = makeElement()
  const clicked = new WeakSet()
  assert.deepEqual(attemptSkip(button, clicked), { success: true, reason: null })
  assert.deepEqual(attemptSkip(button, clicked), {
    success: false,
    reason: 'skip-button-already-clicked',
  })
  assert.equal(button.clickCount, 1)
  assert.equal(attemptSkip(button, new WeakSet()).success, true)
  assert.equal(button.clickCount, 2)
})

test('allows only a bounded number of skip attempts per ad episode', () => {
  assert.equal(canAttemptSkip('ad-skippable', false, false), false)
  assert.equal(canAttemptSkip('ad-skippable', true, true), false)
  assert.equal(canAttemptSkip('ad-skippable', true, false, 1), true)
  assert.equal(canAttemptSkip('ad-skippable', true, false, 2), false)
  assert.equal(canAttemptSkip('no-ad', true, false), false)
  assert.equal(canAttemptSkip('ad-unskippable', true, false), false)
  assert.equal(canAttemptSkip('ad-skippable', true, false), true)
})

test('detects a late ad marker and a skip button added after the first scan', () => {
  const fixture = makeDocument()
  assert.equal(detectAdState(fixture.document).state, 'no-ad')
  fixture.state.adShowing = true
  fixture.state.marker = true
  assert.equal(detectAdState(fixture.document).state, 'ad-unskippable')
  fixture.state.skip = true
  assert.equal(detectAdState(fixture.document).state, 'ad-skippable')
})

test('player state returns from ad to normal content when ad signals clear', () => {
  const fixture = makeDocument()
  assert.equal(detectAdState(fixture.document).state, 'no-ad')

  fixture.state.adShowing = true
  fixture.state.videoAdShowing = true
  assert.equal(detectAdState(fixture.document).state, 'ad-unskippable')

  fixture.state.adShowing = false
  fixture.state.videoAdShowing = false
  assert.equal(detectAdState(fixture.document).state, 'no-ad')
})

test('schedules relevant DOM changes and removes SPA listeners when disconnected', () => {
  let mutationCallback
  const schedules = []
  let cancelled = 0
  let disconnected = false
  let scans = 0
  let navigations = 0
  function eventTarget() {
    const listeners = new Map()
    return {
      addEventListener: (name, listener) => listeners.set(name, listener),
      removeEventListener: (name) => listeners.delete(name),
      dispatch: (name) => listeners.get(name)?.(),
      listeners,
    }
  }
  const documentTarget = eventTarget()
  const windowTarget = eventTarget()
  class FakeObserver {
    constructor(callback) {
      mutationCallback = callback
    }

    observe() {}
    disconnect() {
      disconnected = true
    }
  }
  const stop = observeAdChanges(
    {},
    () => { scans += 1 },
    {
      Observer: FakeObserver,
      schedule: (callback, delay) => {
        schedules.push({ callback, delay })
        return schedules.length
      },
      cancel: () => { cancelled += 1 },
      documentTarget,
      windowTarget,
      onNavigation: () => { navigations += 1 },
    },
  )
  mutationCallback([{
    type: 'childList',
    target: { nodeType: 1, closest: () => null },
    addedNodes: [{ nodeType: 1, matches: (selector) => selector === '#movie_player' }],
    removedNodes: [],
  }])
  mutationCallback([{
    type: 'childList',
    target: { nodeType: 1, closest: () => null },
    addedNodes: [{ nodeType: 1, matches: () => false, querySelector: () => null }],
    removedNodes: [],
  }])
  assert.equal(schedules.length, 1)
  assert.equal(schedules[0].delay, 120)
  documentTarget.dispatch('yt-navigate-finish')
  assert.equal(navigations, 1)
  assert.equal(cancelled, 1)
  assert.equal(schedules[1].delay, 180)
  schedules[1].callback()
  assert.equal(scans, 1)
  stop()
  assert.equal(disconnected, true)
  assert.equal(documentTarget.listeners.size, 0)
  assert.equal(windowTarget.listeners.size, 0)
})

test('observes Skip text changes inside an existing player button', () => {
  let mutationCallback
  let scan
  class FakeObserver {
    constructor(callback) {
      mutationCallback = callback
    }

    observe() {}
    disconnect() {}
  }
  observeAdChanges({}, () => { scan = true }, {
    Observer: FakeObserver,
    schedule: (callback) => {
      setImmediate(callback)
      return 1
    },
    cancel: () => {},
    documentTarget: null,
    windowTarget: null,
  })
  mutationCallback([{
    type: 'characterData',
    target: {
      parentElement: {
        nodeType: 1,
        closest: (selector) => selector.includes('button') ? {} : null,
      },
    },
    addedNodes: [],
    removedNodes: [],
  }])
  return new Promise((resolve) => setImmediate(() => {
    assert.equal(scan, true)
    resolve()
  }))
})

test('does not dispatch a regular page control if the click callback throws', () => {
  const button = makeElement()
  button.click = () => { throw new Error('detached control') }
  assert.deepEqual(attemptSkip(button), { success: false, reason: 'skip-click-failed' })
})

test('visibility check rejects disabled controls', () => {
  assert.equal(isVisible(makeElement({ disabled: true })), false)
})
