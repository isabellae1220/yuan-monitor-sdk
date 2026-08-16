const ALLOWED_EVENT_TYPES = new Set(['error', 'performance', 'behavior']);

const isPlainObject = value => (
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value)
);

/**
 * 从新旧上报格式中提取事件数组。批次结构错误时整批拒绝。
 */
const extractMonitorEvents = (body, { maxBatchSize = 50 } = {}) => {
  if (!isPlainObject(body)) {
    return { ok: false, error: 'request body must be an object', events: [] };
  }

  let events;

  if (Array.isArray(body.events)) {
    events = body.events;
  } else if (Array.isArray(body.data)) {
    events = body.data;
  } else if (isPlainObject(body.data)) {
    events = [body.data];
  } else if (body.eventType || body.type) {
    events = [body];
  } else {
    return { ok: false, error: 'events array is required', events: [] };
  }

  if (events.length === 0) {
    return { ok: false, error: 'events array must not be empty', events: [] };
  }

  if (events.length > maxBatchSize) {
    return {
      ok: false,
      error: `batch size must not exceed ${maxBatchSize}`,
      events: []
    };
  }

  return { ok: true, events };
};

/**
 * 校验统一 MonitorEvent。返回全部可读错误，便于定位坏数据来源。
 */
const validateMonitorEvent = event => {
  const errors = [];

  if (!isPlainObject(event)) {
    return { valid: false, errors: ['event must be an object'] };
  }

  if (typeof event.eventId !== 'string' || !event.eventId.trim()) {
    errors.push('eventId is required');
  } else if (event.eventId.length > 128) {
    errors.push('eventId must not exceed 128 characters');
  }

  if (!ALLOWED_EVENT_TYPES.has(event.eventType)) {
    errors.push('eventType must be error, performance, or behavior');
  }

  if (typeof event.subType !== 'string' || !event.subType.trim()) {
    errors.push('subType is required');
  } else if (event.subType.length > 64) {
    errors.push('subType must not exceed 64 characters');
  }

  if (typeof event.appKey !== 'string' || !event.appKey.trim()) {
    errors.push('appKey is required');
  } else if (event.appKey.length > 128) {
    errors.push('appKey must not exceed 128 characters');
  }

  if (event.release !== undefined && (
    typeof event.release !== 'string' || event.release.length > 128
  )) {
    errors.push('release must be a string no longer than 128 characters');
  }

  if (!Number.isFinite(event.timestamp) || event.timestamp <= 0) {
    errors.push('timestamp must be a positive number');
  }

  if (!isPlainObject(event.data)) {
    errors.push('data must be an object');
  }

  if (event.pageUrl !== undefined && (
    typeof event.pageUrl !== 'string' || event.pageUrl.length > 2048
  )) {
    errors.push('pageUrl must be a string no longer than 2048 characters');
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

module.exports = {
  ALLOWED_EVENT_TYPES,
  extractMonitorEvents,
  isPlainObject,
  validateMonitorEvent
};
