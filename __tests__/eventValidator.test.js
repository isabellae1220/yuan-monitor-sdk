const {
  extractMonitorEvents,
  validateMonitorEvent
} = require('../server/eventValidator');

const createValidEvent = overrides => ({
  eventId: 'evt-1',
  eventType: 'error',
  subType: 'js',
  appKey: 'app-1',
  timestamp: 1000,
  pageUrl: 'http://test.com/',
  data: { message: 'test error' },
  ...overrides
});

describe('服务端监控事件校验', () => {
  test('提取统一 events 批次', () => {
    const events = [createValidEvent()];

    expect(extractMonitorEvents({ events })).toEqual({ ok: true, events });
  });

  test('兼容旧 data 数组格式', () => {
    const events = [createValidEvent()];

    expect(extractMonitorEvents({ data: events })).toEqual({ ok: true, events });
  });

  test('拒绝空批次和无法识别的请求体', () => {
    expect(extractMonitorEvents({ events: [] })).toEqual(expect.objectContaining({ ok: false }));
    expect(extractMonitorEvents({ foo: 'bar' })).toEqual(expect.objectContaining({ ok: false }));
  });

  test('拒绝超过数量限制的批次', () => {
    const events = Array.from({ length: 3 }, (_, index) => (
      createValidEvent({ eventId: `evt-${index}` })
    ));

    expect(extractMonitorEvents({ events }, { maxBatchSize: 2 })).toEqual({
      ok: false,
      error: 'batch size must not exceed 2',
      events: []
    });
  });

  test('接受完整的统一事件', () => {
    expect(validateMonitorEvent(createValidEvent())).toEqual({
      valid: true,
      errors: []
    });
  });

  test('拒绝未知 eventType', () => {
    const result = validateMonitorEvent(createValidEvent({ eventType: 'unknown' }));

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('eventType must be error, performance, or behavior');
  });

  test('一次返回缺失字段的全部原因', () => {
    const result = validateMonitorEvent({});

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'eventId is required',
      'subType is required',
      'appKey is required',
      'timestamp must be a positive number',
      'data must be an object'
    ]));
  });

  test('限制公共字符串字段长度', () => {
    const result = validateMonitorEvent(createValidEvent({
      eventId: 'e'.repeat(129),
      subType: 's'.repeat(65),
      appKey: 'a'.repeat(129),
      release: 'r'.repeat(129),
      pageUrl: 'u'.repeat(2049)
    }));

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(5);
  });

  test('接受合法业务 release，拒绝非字符串 release', () => {
    expect(validateMonitorEvent(createValidEvent({
      release: 'react-demo@2026.08.10-1'
    })).valid).toBe(true);

    const result = validateMonitorEvent(createValidEvent({ release: 100 }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('release must be a string no longer than 128 characters');
  });
});
