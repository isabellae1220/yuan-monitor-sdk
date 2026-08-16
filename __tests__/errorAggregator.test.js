const { storeError, countErrorOccurrences } = require('../server/errorAggregator');

describe('服务端错误聚合', () => {
  let errors;
  let seenEventIds;

  beforeEach(() => {
    errors = [];
    seenEventIds = new Set();
  });

  test('跨批次的同指纹错误合并并累计次数', () => {
    storeError(errors, {
      eventId: 'evt-1',
      appKey: 'app-1',
      environment: 'production',
      fingerprint: 'fp-same',
      timestamp: 1000,
      firstSeenAt: 1000,
      lastSeenAt: 1000,
      occurrenceCount: 1,
      sessionId: 'session-1',
      breadcrumbs: [{ type: 'click', text: '第一次' }]
    }, seenEventIds);

    storeError(errors, {
      eventId: 'evt-2',
      appKey: 'app-1',
      environment: 'production',
      fingerprint: 'fp-same',
      timestamp: 2000,
      firstSeenAt: 2000,
      lastSeenAt: 2000,
      occurrenceCount: 1,
      sessionId: 'session-2',
      breadcrumbs: [{ type: 'click', text: '第二次' }]
    }, seenEventIds);

    expect(errors).toHaveLength(1);
    expect(errors[0].eventId).toBe('evt-1');
    expect(errors[0].occurrenceCount).toBe(2);
    expect(errors[0].firstSeenAt).toBe(1000);
    expect(errors[0].lastSeenAt).toBe(2000);
    expect(errors[0].latestEventId).toBe('evt-2');
    expect(errors[0].latestBreadcrumbs[0].text).toBe('第二次');
    expect(countErrorOccurrences(errors)).toBe(2);
  });

  test('不同指纹或不同项目的错误不会合并', () => {
    storeError(errors, {
      eventId: 'evt-1', appKey: 'app-1', environment: 'production', fingerprint: 'fp-a'
    }, seenEventIds);
    storeError(errors, {
      eventId: 'evt-2', appKey: 'app-1', environment: 'production', fingerprint: 'fp-b'
    }, seenEventIds);
    storeError(errors, {
      eventId: 'evt-3', appKey: 'app-2', environment: 'production', fingerprint: 'fp-a'
    }, seenEventIds);

    expect(errors).toHaveLength(3);
  });

  test('相同 eventId 的重试请求不会重复计数', () => {
    const event = {
      eventId: 'evt-retry',
      appKey: 'app-1',
      environment: 'production',
      fingerprint: 'fp-a',
      occurrenceCount: 1
    };

    storeError(errors, event, seenEventIds);
    storeError(errors, { ...event }, seenEventIds);

    expect(errors).toHaveLength(1);
    expect(errors[0].occurrenceCount).toBe(1);
  });
});
