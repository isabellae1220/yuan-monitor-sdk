/**
 * 将同一类错误聚合成一个错误组。
 *
 * fingerprint 判断“是不是同一类错误”；eventId 防止同一上报请求重试时重复计数。
 */
const storeError = (errors, event, seenEventIds = new Set()) => {
  if (!event) return null;

  if (event.eventId && seenEventIds.has(event.eventId)) {
    return errors.find(item => item.eventId === event.eventId) || null;
  }

  if (event.eventId) seenEventIds.add(event.eventId);

  const group = event.fingerprint
    ? errors.find(item => (
      item.fingerprint === event.fingerprint &&
      item.appKey === event.appKey &&
      item.environment === event.environment
    ))
    : null;

  if (!group) {
    errors.push(event);
    return event;
  }

  group.occurrenceCount = (group.occurrenceCount || 1) + (event.occurrenceCount || 1);
  group.firstSeenAt = Math.min(
    group.firstSeenAt || group.timestamp,
    event.firstSeenAt || event.timestamp
  );
  group.lastSeenAt = Math.max(
    group.lastSeenAt || group.timestamp,
    event.lastSeenAt || event.timestamp
  );

  // 错误组保留首次事件，同时记录最近一次现场，便于查看最新用户操作路径。
  group.latestEventId = event.eventId;
  group.latestSessionId = event.sessionId;
  group.latestBreadcrumbs = event.breadcrumbs || [];
  group.latestRuntime = event.runtime;

  return group;
};

const countErrorOccurrences = (errors) => {
  return errors.reduce((total, item) => total + (item.occurrenceCount || 1), 0);
};

module.exports = {
  storeError,
  countErrorOccurrences
};
