const AD_MARKER_SELECTOR = [
  '.ytp-ad-player-overlay',
  '.ytp-ad-preview-container',
  '.ytp-ad-text',
  '.ytp-ad-message-container',
].join(',')

export const SKIP_BUTTON_SELECTOR = [
  '.ytp-ad-skip-button',
  '.ytp-ad-skip-button-modern',
  '.ytp-skip-ad-button',
].join(',')

export const AD_DOM_SELECTOR = [
  '#movie_player',
  'video',
  AD_MARKER_SELECTOR,
  SKIP_BUTTON_SELECTOR,
  'button[aria-label]',
  'button[title]',
  '[role="button"][aria-label]',
  '[role="button"][title]',
].join(',')

const SKIP_LABELS = [
  /^skip(?:\s+ad(?:s)?)?$/i,
  /^bỏ qua(?:\s+quảng cáo)?$/i,
  /^saltar(?:\s+el\s+anuncio)?$/i,
  /^omitir(?:\s+el\s+anuncio)?$/i,
  /^pular(?:\s+anúncio)?$/i,
  /^saltar(?:\s+el)?\s+anuncio$/i,
  /^omitir(?:\s+el)?\s+anuncio$/i,
  /^ignorer(?:\s+la)?\s+publicité$/i,
  /^anzeige überspringen$/i,
  /^reklamayı atla$/i,
  /^reklamı atla$/i,
  /^광고 건너뛰기$/,
  /^広告をスキップ$/,
  /^跳过广告$/,
  /^пропустить рекламу$/i,
]

function textMatchesSkipLabel(value) {
  const label = value?.replace(/\s+/g, ' ').trim()
  return Boolean(label && SKIP_LABELS.some((pattern) => pattern.test(label)))
}

export function isVisible(element, windowRef = globalThis.window) {
  if (!element || element.hidden || element.getAttribute?.('aria-hidden') === 'true') {
    return false
  }
  if (element.isConnected === false) return false
  if (element.disabled || element.getAttribute?.('aria-disabled') === 'true') return false

  if (windowRef?.getComputedStyle) {
    const style = windowRef.getComputedStyle(element)
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.visibility === 'collapse' ||
      style.pointerEvents === 'none' ||
      style.opacity === '0'
    ) {
      return false
    }
  }

  const rects = element.getClientRects?.()
  if (!rects?.length) return false
  const rect = element.getBoundingClientRect?.()
  return !rect || (rect.width > 0 && rect.height > 0)
}

function queryAll(root, selector) {
  return Array.from(root.querySelectorAll?.(selector) ?? [])
}

function isSemanticButton(element) {
  return element.tagName?.toLowerCase() === 'button' ||
    element.getAttribute?.('role') === 'button'
}

export function findSkipButton(player, windowRef = globalThis.window) {
  const selectorButtons = queryAll(player, SKIP_BUTTON_SELECTOR)
  const classButtonControls = selectorButtons.flatMap((element) => [
    ...(isSemanticButton(element) ? [element] : []),
    ...queryAll(element, 'button, [role="button"]'),
  ])
  const semanticClassButton = classButtonControls.find((button) =>
    typeof button.click === 'function' && isVisible(button, windowRef),
  )
  if (semanticClassButton) return semanticClassButton

  const labeledButton = queryAll(player, 'button, [role="button"]').find((button) => {
    if (typeof button.click !== 'function' || !isVisible(button, windowRef)) return false
    return [
      button.getAttribute?.('aria-label'),
      button.getAttribute?.('title'),
      button.textContent,
    ].some(textMatchesSkipLabel)
  }) ?? null
  if (labeledButton) return labeledButton

  return selectorButtons.find((button) =>
    typeof button.click === 'function' && isVisible(button, windowRef),
  ) ?? null
}

export function detectAdState(documentRef = globalThis.document, windowRef = globalThis.window) {
  const player = documentRef?.querySelector?.('#movie_player')
  if (!player) return { state: 'unknown', skipButton: null }

  const video = player.querySelector?.('video') ?? null
  const classSignals = Number(player.classList?.contains('ad-showing') === true) +
    Number(video?.classList?.contains('ad-showing') === true)

  const adMarkers = queryAll(player, AD_MARKER_SELECTOR)
    .filter((marker) => isVisible(marker, windowRef))
  const skipButton = findSkipButton(player, windowRef)
  const uiSignals = Number(adMarkers.length > 0) + Number(skipButton !== null)

  if (classSignals + uiSignals < 2) {
    return {
      state: classSignals + uiSignals === 1 ? 'transitioning' : 'no-ad',
      skipButton: null,
    }
  }

  return {
    state: skipButton ? 'ad-skippable' : 'ad-unskippable',
    skipButton,
  }
}
