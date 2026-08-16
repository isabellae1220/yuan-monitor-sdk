import { create } from 'zustand'

const DEFAULT_FILTERS = {
  appKey: 'test-app-key',
  environment: 'development',
  timeRange: '7d'
}

const RANGE_DURATIONS = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000
}

export const buildMonitorQuery = (filters, now = Date.now()) => {
  const query = {
    appKey: filters.appKey,
    environment: filters.environment
  }
  const duration = RANGE_DURATIONS[filters.timeRange]

  if (duration) {
    query.startTime = now - duration
    query.endTime = now
  }

  return query
}

export const useFilterStore = create(set => ({
  ...DEFAULT_FILTERS,
  setAppKey: appKey => set({ appKey }),
  setEnvironment: environment => set({ environment }),
  setTimeRange: timeRange => set({ timeRange }),
  resetFilters: () => set(DEFAULT_FILTERS)
}))
