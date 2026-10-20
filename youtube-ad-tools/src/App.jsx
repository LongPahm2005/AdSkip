import { useEffect, useState } from 'react'
import {
  DEFAULT_SETTINGS,
  DEFAULT_STATS,
  getLocal,
  setLocal,
  subscribeToSettings,
  STORAGE_KEYS,
} from './shared/storage.js'
import './App.css'

const STATUS_LABELS = {
  'no-ad': 'Không phát hiện quảng cáo',
  'ad-skippable': 'Có quảng cáo · Có nút bỏ qua',
  'ad-unskippable': 'Quảng cáo chưa thể bỏ qua',
  transitioning: 'Đang xác định trạng thái',
  unknown: 'Chưa xác định được trạng thái',
}

const EVENT_LABELS = {
  AD_SIGNAL_DETECTED: 'Phát hiện tín hiệu quảng cáo',
  AD_BLOCK_UNCONFIRMED: 'Chưa xác nhận xử lý được quảng cáo',
  AD_SIGNAL_CLEARED_AFTER_SKIP_ACTION: 'Tín hiệu quảng cáo đã hết sau thao tác Skip',
  SKIP_ACTION_PERFORMED: 'Đã gửi thao tác Skip (chưa xác nhận)',
  SKIP_ACTION_UNCONFIRMED: 'Chưa thấy trạng thái đổi sau Skip',
  SKIP_ACTION_FAILED: 'Không thể gửi thao tác Skip',
  VIDEO_PLAYBACK_ERROR: 'Video báo lỗi phát',
  STATE_CHANGE: 'Trạng thái player thay đổi',
}

function formatEventTime(timestamp) {
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString()
}

function isYouTubeUrl(url) {
  try {
    const hostname = new URL(url).hostname
    return hostname === 'youtube.com' ||
      hostname === 'www.youtube.com' ||
      hostname === 'm.youtube.com'
  } catch {
    return false
  }
}

async function getActiveTab() {
  if (!globalThis.chrome?.tabs?.query) return null
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab ?? null
}

function App() {
  const [enabled, setEnabled] = useState(DEFAULT_SETTINGS.enabled)
  const [stats, setStats] = useState(DEFAULT_STATS)
  const [events, setEvents] = useState([])
  const [status, setStatus] = useState('unknown')
  const [tabState, setTabState] = useState('loading')
  const [storageAvailable, setStorageAvailable] = useState(true)
  const [showHelp, setShowHelp] = useState(false)
  const [error, setError] = useState('')
  const version = globalThis.chrome?.runtime?.getManifest?.().version ?? '1.0.0'

  useEffect(() => {
    let active = true
    let settingsRevision = 0
    const unsubscribeSettings = subscribeToSettings((nextEnabled) => {
      settingsRevision += 1
      setEnabled(nextEnabled)
    })

    async function refresh() {
      const revision = settingsRevision
      const [settings, storedStats, storedEvents] = await Promise.all([
        getLocal(STORAGE_KEYS.settings, DEFAULT_SETTINGS),
        getLocal(STORAGE_KEYS.stats, DEFAULT_STATS),
        getLocal(STORAGE_KEYS.events, []),
      ])
      if (!active) return
      if (revision === settingsRevision) setEnabled(settings.value.enabled !== false)
      setStats({ ...DEFAULT_STATS, ...storedStats.value })
      setEvents(Array.isArray(storedEvents.value) ? storedEvents.value : [])
      setStorageAvailable(settings.available && storedStats.available && storedEvents.available)

      try {
        const tab = await getActiveTab()
        if (!active) return
        if (!tab || !isYouTubeUrl(tab.url ?? '')) {
          setTabState('not-youtube')
          setStatus('unknown')
          return
        }
        if (!globalThis.chrome?.tabs?.sendMessage || tab.id == null) {
          setTabState('unavailable')
          return
        }
        const result = await chrome.tabs.sendMessage(tab.id, { type: 'GET_STATUS' })
        if (!active) return
        if (result?.state) {
          setStatus(result.state)
          setTabState('connected')
        } else {
          setTabState('unavailable')
        }
      } catch {
        if (active) setTabState('unavailable')
      }
    }

    refresh().catch(() => {
      if (active) setError('Không thể tải cài đặt hoặc trạng thái extension.')
    })

    const onChanged = (changes, areaName) => {
      if (areaName !== 'local') return
      if (changes[STORAGE_KEYS.stats]) {
        setStats({ ...DEFAULT_STATS, ...changes[STORAGE_KEYS.stats].newValue })
      }
      if (changes[STORAGE_KEYS.events]) {
        const nextEvents = changes[STORAGE_KEYS.events].newValue
        setEvents(Array.isArray(nextEvents) ? nextEvents : [])
      }
    }
    globalThis.chrome?.storage?.onChanged?.addListener(onChanged)

    return () => {
      active = false
      unsubscribeSettings()
      globalThis.chrome?.storage?.onChanged?.removeListener(onChanged)
    }
  }, [])

  async function toggleEnabled() {
    const next = !enabled
    setEnabled(next)
    setError('')
    const result = await setLocal(STORAGE_KEYS.settings, { enabled: next })
    setStorageAvailable(result.available)
    if (!result.available) {
      setEnabled(enabled)
      setError('Không thể lưu cài đặt. Hãy kiểm tra quyền lưu trữ của extension.')
    }
  }

  const statusLabel = STATUS_LABELS[status] ?? STATUS_LABELS.unknown
  const tabMessage = {
    loading: 'Đang kiểm tra tab hiện tại…',
    'not-youtube': 'Mở một trang YouTube để xem trạng thái nhận diện.',
    unavailable: 'Chưa kết nối được với trang. Hãy tải lại tab YouTube.',
    connected: statusLabel,
  }[tabState]

  return (
    <main className="popup">
      <header className="header">
        <div className="brand-mark" aria-hidden="true">YT</div>
        <div className="brand-copy">
          <h1>YouTube Ad Tools</h1>
          <p>Phiên bản {version}</p>
        </div>
        <span className={`power-state ${enabled ? 'is-on' : 'is-off'}`}>
          <span aria-hidden="true">{enabled ? '●' : '○'}</span>
          {enabled ? 'Đang bật' : 'Đang tắt'}
        </span>
      </header>

      <section className="status-card" aria-live="polite">
        <div className="section-label">TAB YOUTUBE HIỆN TẠI</div>
        <p className="status-line">
          <span className={`status-dot status-${status}`} aria-hidden="true" />
          {tabMessage}
        </p>
        {tabState === 'connected' && status === 'ad-unskippable' && (
          <p className="status-note">Quy tắc mạng hẹp đã bật; chỉ nhấn nút bỏ qua chính thức khi khả dụng.</p>
        )}
      </section>

      <section className="setting-row">
        <div>
          <h2>Tự động xử lý</h2>
          <p>Dùng quy tắc mạng hẹp và nút bỏ qua chính thức khi khả dụng.</p>
        </div>
        <button
          className={`switch ${enabled ? 'switch-on' : ''}`}
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Bật hoặc tắt tự động xử lý"
          onClick={toggleEnabled}
        >
          <span />
        </button>
      </section>

      <section className="stats" aria-label="Thống kê cục bộ">
        <h2>Thống kê nhận diện</h2>
        <div className="stat-grid">
          <div className="stat">
            <strong>{stats.detected}</strong>
            <span>Đã nhận diện</span>
          </div>
          <div className="stat">
            <strong>{stats.handled}</strong>
            <span>Đã xử lý</span>
          </div>
          <div className="stat">
            <strong>{stats.unresolved}</strong>
            <span>Chưa xử lý</span>
          </div>
        </div>
        {!stats.detected && <p className="empty-note">Chưa có dữ liệu nhận diện.</p>}
      </section>

      <section className="event-log" aria-label="Nhật ký xử lý gần đây">
        <h2>Nhật ký gần đây</h2>
        {events.length ? (
          <ol>
            {events.slice(-5).reverse().map((event, index) => (
              <li key={`${event.timestamp ?? 'event'}-${index}`}>
                <span>{EVENT_LABELS[event.eventType] ?? event.eventType ?? event.action ?? 'Sự kiện'}</span>
                <small>
                  {[formatEventTime(event.timestamp), event.reason?.replaceAll('-', ' ')]
                    .filter(Boolean)
                    .join(' · ')}
                </small>
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty-note">Chưa có sự kiện xử lý.</p>
        )}
        <p className="empty-note">Không có sự kiện khớp rule mạng trong bản production.</p>
      </section>

      {!storageAvailable && (
        <p className="message warning">Lưu trữ cục bộ không khả dụng; cài đặt có thể không được giữ lại.</p>
      )}
      {error && <p className="message error" role="alert">{error}</p>}

      <footer className="footer">
        <button className="help-button" type="button" onClick={() => setShowHelp(!showHelp)}>
          {showHelp ? 'Đóng hướng dẫn' : 'Hướng dẫn sử dụng'}
          <span aria-hidden="true">{showHelp ? '−' : '＋'}</span>
        </button>
      </footer>
      {showHelp && (
        <section className="help-panel">
          <h2>Cách sử dụng</h2>
          <ol>
            <li>Mở video trên youtube.com và bật extension.</li>
            <li>Extension áp dụng một quy tắc mạng quảng cáo hẹp và tự nhấn nút bỏ qua chính thức khi đủ dấu hiệu.</li>
            <li>Không chặn request media/video; quảng cáo có thể vẫn phát nếu YouTube phân phối qua endpoint khác.</li>
          </ol>
          <p>Trang đã mở trước khi cài extension cần tải lại. Tắt công tắc sẽ dừng quy tắc mạng và tự động nhấn Skip.</p>
        </section>
      )}
      <p className="privacy-note">Thống kê và nhật ký được lưu trên thiết bị. Không gửi dữ liệu ra ngoài.</p>
    </main>
  )
}

export default App
