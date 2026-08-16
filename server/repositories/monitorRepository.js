const mongoose = require('mongoose');
const MonitorEvent = require('../models/MonitorEvent');
const ErrorGroup = require('../models/ErrorGroup');
const SessionReplay = require('../models/SessionReplay');

const normalizePositiveInteger = (value, fallback, max) => {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(number, max);
};

const buildTimeFilter = (startTime, endTime) => {
  const timestamp = {};
  const start = Number(startTime);
  const end = Number(endTime);

  if (Number.isFinite(start) && start > 0) timestamp.$gte = start;
  if (Number.isFinite(end) && end > 0) timestamp.$lte = end;

  return Object.keys(timestamp).length > 0 ? timestamp : null;
};

const HOUR_IN_MS = 60 * 60 * 1000;
const DAY_IN_MS = 24 * HOUR_IN_MS;

/**
 * 趋势图需要在可读性和数据点数量之间取平衡：短时间范围按小时，
 * 7～30 天按天，更长时间按周。它只决定聚合粒度，不修改事件时间。
 */
const resolveTrendBucketSize = (startTime, endTime) => {
  const duration = Math.max(endTime - startTime, 0);
  if (duration <= DAY_IN_MS) return HOUR_IN_MS;
  if (duration <= 31 * DAY_IN_MS) return DAY_IN_MS;
  return 7 * DAY_IN_MS;
};

const upsertErrorGroup = async event => {
  if (event.eventType !== 'error' || !event.fingerprint) return;

  const occurrenceCount = Math.max(Number(event.occurrenceCount) || 1, 1);
  const firstSeenAt = event.firstSeenAt || event.timestamp;
  const lastSeenAt = event.lastSeenAt || event.timestamp;

  await ErrorGroup.updateOne(
    {
      appKey: event.appKey,
      environment: event.environment || 'development',
      fingerprint: event.fingerprint
    },
    {
      $setOnInsert: {
        subType: event.subType,
        message: event.data?.message || ''
      },
      $inc: { occurrenceCount },
      $min: { firstSeenAt },
      $max: { lastSeenAt },
      $set: {
        latestEventId: event.eventId,
        latestSessionId: event.sessionId || '',
        latestUserId: event.userId || '',
        latestPageUrl: event.pageUrl || '',
        latestRelease: event.release || '',
        latestRuntime: event.runtime || {},
        latestData: event.data || {},
        latestBreadcrumbs: event.breadcrumbs || []
      }
    },
    { upsert: true, runValidators: true }
  );
};

/**
 * 持久化统一事件。eventId 使用 upsert 保证客户端重试不会重复落库，
 * 只有首次插入的错误事件才累加 ErrorGroup。
 */
const storeMonitorEvents = async events => {
  let inserted = 0;
  let duplicates = 0;

  for (const event of events) {
    const result = await MonitorEvent.updateOne(
      { eventId: event.eventId },
      { $setOnInsert: event },
      { upsert: true, runValidators: true }
    );

    if (result.upsertedCount === 1) {
      inserted += 1;
      await upsertErrorGroup(event);
    } else {
      duplicates += 1;
    }
  }

  return { inserted, duplicates };
};

const listEvents = async ({
  appKey,
  environment,
  eventType,
  subType,
  sessionId,
  startTime,
  endTime,
  page = 1,
  pageSize = 20
} = {}) => {
  const filter = {};
  if (appKey) filter.appKey = appKey;
  if (environment) filter.environment = environment;
  if (eventType) filter.eventType = eventType;
  if (subType) filter.subType = subType;
  if (sessionId) filter.sessionId = sessionId;

  const timestamp = buildTimeFilter(startTime, endTime);
  if (timestamp) filter.timestamp = timestamp;

  const safePage = normalizePositiveInteger(page, 1, 100000);
  const safePageSize = normalizePositiveInteger(pageSize, 20, 100);

  const [items, total] = await Promise.all([
    MonitorEvent.find(filter)
      .sort({ timestamp: -1 })
      .skip((safePage - 1) * safePageSize)
      .limit(safePageSize)
      .lean(),
    MonitorEvent.countDocuments(filter)
  ]);

  return {
    items,
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      total,
      totalPages: Math.ceil(total / safePageSize)
    }
  };
};

const listErrorGroups = async ({
  appKey,
  environment,
  subType,
  startTime,
  endTime,
  page,
  pageSize
} = {}) => {
  const filter = {};
  if (appKey) filter.appKey = appKey;
  if (environment) filter.environment = environment;
  if (subType) filter.subType = subType;

  const lastSeenAt = buildTimeFilter(startTime, endTime);
  if (lastSeenAt) filter.lastSeenAt = lastSeenAt;

  const safePage = normalizePositiveInteger(page, 1, 100000);
  const safePageSize = normalizePositiveInteger(pageSize, 20, 100);

  const [items, total] = await Promise.all([
    ErrorGroup.find(filter)
      .sort({ lastSeenAt: -1 })
      .skip((safePage - 1) * safePageSize)
      .limit(safePageSize)
      .lean(),
    ErrorGroup.countDocuments(filter)
  ]);

  return {
    items,
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      total,
      totalPages: Math.ceil(total / safePageSize)
    }
  };
};

const getErrorGroupById = async id => {
  if (!mongoose.isValidObjectId(id)) return null;
  return ErrorGroup.findById(id).lean();
};

/**
 * 查询某个错误组对应的原始错误事件。
 * 前端只传错误组 id，关联规则由服务端统一维护，避免前端自行拼接
 * appKey、environment 和 fingerprint 后产生错配。
 */
const listErrorEventsByGroupId = async (id, {
  page = 1,
  pageSize = 20
} = {}) => {
  if (!mongoose.isValidObjectId(id)) return null;

  const group = await ErrorGroup.findById(id).lean();
  if (!group) return null;

  const filter = {
    eventType: 'error',
    appKey: group.appKey,
    environment: group.environment,
    fingerprint: group.fingerprint
  };
  const safePage = normalizePositiveInteger(page, 1, 100000);
  const safePageSize = normalizePositiveInteger(pageSize, 20, 100);

  const [items, total] = await Promise.all([
    MonitorEvent.find(filter)
      .sort({ timestamp: -1 })
      .skip((safePage - 1) * safePageSize)
      .limit(safePageSize)
      .lean(),
    MonitorEvent.countDocuments(filter)
  ]);

  return {
    group,
    items,
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      total,
      totalPages: Math.ceil(total / safePageSize)
    }
  };
};

const getPerformanceOverview = async ({ appKey, environment, startTime, endTime } = {}) => {
  const baseMatch = { eventType: 'performance' };
  if (appKey) baseMatch.appKey = appKey;
  if (environment) baseMatch.environment = environment;

  const timestamp = buildTimeFilter(startTime, endTime);
  if (timestamp) baseMatch.timestamp = timestamp;

  const [webVitalRows, longTaskRows, resourceRows] = await Promise.all([
    MonitorEvent.aggregate([
      {
        $match: {
          ...baseMatch,
          subType: 'web-vital',
          'data.name': { $type: 'string' },
          'data.value': { $type: 'number' }
        }
      },
      {
        $group: {
          _id: '$data.name',
          count: { $sum: 1 },
          average: { $avg: '$data.value' },
          min: { $min: '$data.value' },
          max: { $max: '$data.value' },
          p75: {
            $percentile: {
              input: '$data.value',
              p: [0.75],
              method: 'approximate'
            }
          },
          p90: {
            $percentile: {
              input: '$data.value',
              p: [0.90],
              method: 'approximate'
            }
          },
          p95: {
            $percentile: {
              input: '$data.value',
              p: [0.95],
              method: 'approximate'
            }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]),
    MonitorEvent.aggregate([
      {
        $match: {
          ...baseMatch,
          subType: 'long-task',
          'data.duration': { $type: 'number' }
        }
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          averageDuration: { $avg: '$data.duration' },
          maxDuration: { $max: '$data.duration' }
        }
      }
    ]),
    MonitorEvent.aggregate([
      {
        $match: {
          ...baseMatch,
          subType: 'resource',
          'data.duration': { $type: 'number' }
        }
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          averageDuration: { $avg: '$data.duration' },
          maxDuration: { $max: '$data.duration' }
        }
      }
    ])
  ]);

  const webVitals = webVitalRows.reduce((result, row) => {
    result[row._id] = {
      count: row.count,
      average: row.average,
      min: row.min,
      max: row.max,
      p75: row.p75?.[0] ?? null,
      p90: row.p90?.[0] ?? null,
      p95: row.p95?.[0] ?? null
    };
    return result;
  }, {});

  const formatDurationSummary = row => row
    ? {
        count: row.count,
        averageDuration: row.averageDuration,
        maxDuration: row.maxDuration
      }
    : { count: 0, averageDuration: 0, maxDuration: 0 };

  return {
    webVitals,
    longTasks: formatDurationSummary(longTaskRows[0]),
    resources: formatDurationSummary(resourceRows[0])
  };
};

/**
 * 按“时间桶 + Web Vital 名称”聚合趋势数据。
 * overview 回答整个筛选范围的分布，trends 回答指标随时间怎样变化。
 */
const getPerformanceTrends = async ({ appKey, environment, startTime, endTime } = {}) => {
  const now = Date.now();
  const parsedEnd = Number(endTime);
  const parsedStart = Number(startTime);
  const safeEndTime = Number.isFinite(parsedEnd) && parsedEnd > 0 ? parsedEnd : now;
  const safeStartTime = Number.isFinite(parsedStart) && parsedStart > 0 && parsedStart < safeEndTime
    ? parsedStart
    : safeEndTime - 7 * DAY_IN_MS;
  const bucketSize = resolveTrendBucketSize(safeStartTime, safeEndTime);

  const match = {
    eventType: 'performance',
    subType: 'web-vital',
    timestamp: { $gte: safeStartTime, $lte: safeEndTime },
    'data.name': { $type: 'string' },
    'data.value': { $type: 'number' }
  };
  if (appKey) match.appKey = appKey;
  if (environment) match.environment = environment;

  const rows = await MonitorEvent.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          name: '$data.name',
          bucket: {
            $subtract: [
              '$timestamp',
              { $mod: ['$timestamp', bucketSize] }
            ]
          }
        },
        count: { $sum: 1 },
        average: { $avg: '$data.value' },
        p75: {
          $percentile: {
            input: '$data.value',
            p: [0.75],
            method: 'approximate'
          }
        },
        p95: {
          $percentile: {
            input: '$data.value',
            p: [0.95],
            method: 'approximate'
          }
        }
      }
    },
    { $sort: { '_id.bucket': 1, '_id.name': 1 } }
  ]);

  const metrics = rows.reduce((result, row) => {
    const metricName = row._id.name;
    if (!result[metricName]) result[metricName] = [];
    result[metricName].push({
      timestamp: row._id.bucket,
      count: row.count,
      average: row.average,
      p75: row.p75?.[0] ?? null,
      p95: row.p95?.[0] ?? null
    });
    return result;
  }, {});

  return {
    startTime: safeStartTime,
    endTime: safeEndTime,
    bucketSize,
    metrics
  };
};

const listSlowRequests = async ({
  appKey,
  environment,
  startTime,
  endTime,
  minDuration = 0,
  requestType,
  result,
  page = 1,
  pageSize,
  limit = 20
} = {}) => {
  const filter = {
    eventType: 'behavior',
    subType: ['fetch', 'xhr'].includes(requestType)
      ? requestType
      : { $in: ['fetch', 'xhr'] },
    'data.elapsedTime': { $type: 'number', $gte: Math.max(Number(minDuration) || 0, 0) }
  };
  if (appKey) filter.appKey = appKey;
  if (environment) filter.environment = environment;

  if (result === 'success') {
    filter['data.success'] = true;
  } else if (result === 'failure') {
    filter.$or = [
      { 'data.success': false },
      { 'data.status': { $gte: 400 } }
    ];
  }

  const timestamp = buildTimeFilter(startTime, endTime);
  if (timestamp) filter.timestamp = timestamp;

  const safePage = normalizePositiveInteger(page, 1, 100000);
  const safePageSize = normalizePositiveInteger(pageSize || limit, 20, 100);
  const [items, total, summaryRows] = await Promise.all([
    MonitorEvent.find(filter)
      .sort({ 'data.elapsedTime': -1, timestamp: -1 })
      .skip((safePage - 1) * safePageSize)
      .limit(safePageSize)
      .lean(),
    MonitorEvent.countDocuments(filter),
    MonitorEvent.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          averageElapsedTime: { $avg: '$data.elapsedTime' },
          maxElapsedTime: { $max: '$data.elapsedTime' },
          failureCount: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $eq: ['$data.success', false] },
                    { $gte: ['$data.status', 400] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      }
    ])
  ]);

  const summary = summaryRows[0] || {};

  return {
    items: items.map(item => ({
      eventId: item.eventId,
      appKey: item.appKey,
      sessionId: item.sessionId,
      timestamp: item.timestamp,
      pageUrl: item.pageUrl,
      requestType: item.subType,
      method: item.data?.method,
      url: item.data?.url,
      status: item.data?.status,
      success: item.data?.success,
      errorType: item.data?.errorType,
      elapsedTime: item.data?.elapsedTime
    })),
    summary: {
      total,
      averageElapsedTime: summary.averageElapsedTime || 0,
      maxElapsedTime: summary.maxElapsedTime || 0,
      failureCount: summary.failureCount || 0
    },
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      total,
      totalPages: Math.ceil(total / safePageSize)
    }
  };
};

const storeSessionReplay = async payload => {
  const replayData = payload.data || {};
  return SessionReplay.create({
    appKey: payload.appKey,
    sessionId: payload.sessionId,
    timestamp: payload.timestamp || Date.now(),
    duration: replayData.duration || 0,
    errorCount: replayData.errorCount || 0,
    errorOffset: replayData.errorOffset ?? -1,
    lastErrorTime: replayData.lastErrorTime,
    events: replayData.events || []
  });
};

const clearAllData = async () => {
  await Promise.all([
    MonitorEvent.deleteMany({}),
    ErrorGroup.deleteMany({}),
    SessionReplay.deleteMany({})
  ]);
};

const getDataSnapshot = async ({ limit = 500 } = {}) => {
  const safeLimit = normalizePositiveInteger(limit, 500, 1000);
  const [errors, performance, behavior, sessionReplay, occurrenceResult] = await Promise.all([
    ErrorGroup.find({}).sort({ lastSeenAt: -1 }).limit(safeLimit).lean(),
    MonitorEvent.find({ eventType: 'performance' })
      .sort({ timestamp: -1 }).limit(safeLimit).lean(),
    MonitorEvent.find({ eventType: 'behavior' })
      .sort({ timestamp: -1 }).limit(safeLimit).lean(),
    SessionReplay.find({}).sort({ timestamp: -1 }).limit(safeLimit).lean(),
    ErrorGroup.aggregate([
      { $group: { _id: null, total: { $sum: '$occurrenceCount' } } }
    ])
  ]);

  return {
    errors,
    performance,
    behavior,
    sessionReplay,
    summary: {
      errors: errors.length,
      errorOccurrences: occurrenceResult[0]?.total || 0,
      performance: performance.length,
      behavior: behavior.length,
      sessionReplay: sessionReplay.length
    }
  };
};

module.exports = {
  buildTimeFilter,
  clearAllData,
  getDataSnapshot,
  getErrorGroupById,
  getPerformanceOverview,
  getPerformanceTrends,
  listErrorEventsByGroupId,
  listErrorGroups,
  listEvents,
  listSlowRequests,
  normalizePositiveInteger,
  resolveTrendBucketSize,
  storeMonitorEvents,
  storeSessionReplay
};
