/**
 * 生成单次监控事件的唯一 ID。
 * eventId 标识一次具体事件；相同错误的多次发生仍应拥有不同 eventId。
 */
const generateEventId = () => {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
};

/**
 * 创建统一监控事件。
 * 公共字段放在外层，各类型独有字段统一放入 data。
 */
const createMonitorEvent = ({
  eventType,
  subType,
  appKey = '',
  environment = 'development',
  release = '',
  sessionId = '',
  userId = '',
  userData = {},
  timestamp = Date.now(),
  pageUrl = '',
  runtime = {},
  data = {},
  breadcrumbs = []
} = {}) => {
  if (!eventType) {
    throw new Error('MonitorEvent eventType is required');
  }

  return {
    eventId: generateEventId(),
    eventType,
    subType: subType || '',
    appKey,
    environment,
    release,
    sessionId,
    userId,
    userData,
    timestamp,
    pageUrl,
    runtime,
    data,
    breadcrumbs
  };
};

export {
  generateEventId,
  createMonitorEvent
};

export default createMonitorEvent;
