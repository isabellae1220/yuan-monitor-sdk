const normalizeOrigin = value => value.replace(/\/$/, '')

export const MONITOR_SERVER_URL = normalizeOrigin(
  import.meta.env.VITE_MONITOR_SERVER_URL || 'http://localhost:3001'
)

export const apiUrl = path => `${MONITOR_SERVER_URL}${path}`
