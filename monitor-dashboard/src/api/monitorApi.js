import http from './http.js'

const withParams = (params, config = {}) => ({ ...config, params })

export const getDataSnapshot = (params, config) =>
  http.get('/data', withParams(params, config))

export const getEvents = (params, config) =>
  http.get('/events', withParams(params, config))

export const getErrorGroups = (params, config) =>
  http.get('/errors', withParams(params, config))

export const getErrorGroupDetail = (id, config) =>
  http.get(`/errors/${id}`, config)

export const getErrorGroupEvents = (id, params, config) =>
  http.get(`/errors/${id}/events`, withParams(params, config))

export const getPerformanceOverview = (params, config) =>
  http.get('/performance/overview', withParams(params, config))

export const getPerformanceTrends = (params, config) =>
  http.get('/performance/trends', withParams(params, config))

export const getSlowRequests = (params, config) =>
  http.get('/requests/slow', withParams(params, config))
