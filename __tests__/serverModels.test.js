const MonitorEvent = require('../server/models/MonitorEvent');
const ErrorGroup = require('../server/models/ErrorGroup');
const SessionReplay = require('../server/models/SessionReplay');
const SourceMapArtifact = require('../server/models/SourceMapArtifact');

const hasIndex = (indexes, expectedFields, expectedOptions = {}) => (
  indexes.some(([fields, options]) => (
    JSON.stringify(fields) === JSON.stringify(expectedFields) &&
    Object.entries(expectedOptions).every(([key, value]) => options[key] === value)
  ))
);

describe('MongoDB 服务端模型', () => {
  test('MonitorEvent 校验统一事件必填字段', async () => {
    const validEvent = new MonitorEvent({
      eventId: 'evt-1',
      eventType: 'performance',
      subType: 'long-task',
      appKey: 'app-1',
      timestamp: 1000,
      data: { duration: 120 }
    });

    await expect(validEvent.validate()).resolves.toBeUndefined();

    const invalidEvent = new MonitorEvent({ eventType: 'unknown' });
    const validationError = await invalidEvent.validate().catch(error => error);
    const errors = validationError.errors;
    expect(errors.eventId).toBeDefined();
    expect(errors.eventType).toBeDefined();
    expect(errors.subType).toBeDefined();
    expect(errors.appKey).toBeDefined();
    expect(errors.timestamp).toBeDefined();
    expect(errors.data).toBeDefined();
  });

  test('MonitorEvent 建立 eventId 唯一索引和常用查询索引', () => {
    const indexes = MonitorEvent.schema.indexes();

    expect(hasIndex(indexes, { eventId: 1 }, { unique: true })).toBe(true);
    expect(hasIndex(indexes, { appKey: 1, eventType: 1, timestamp: -1 })).toBe(true);
    expect(hasIndex(indexes, { appKey: 1, sessionId: 1, timestamp: 1 })).toBe(true);
    expect(hasIndex(indexes, {
      appKey: 1,
      environment: 1,
      eventType: 1,
      fingerprint: 1,
      timestamp: -1
    })).toBe(true);
  });

  test('ErrorGroup 使用项目、环境和 fingerprint 唯一聚合', () => {
    const indexes = ErrorGroup.schema.indexes();

    expect(hasIndex(
      indexes,
      { appKey: 1, environment: 1, fingerprint: 1 },
      { unique: true }
    )).toBe(true);
  });

  test('SessionReplay 按项目、会话和时间建立索引', () => {
    const indexes = SessionReplay.schema.indexes();

    expect(hasIndex(indexes, { appKey: 1, sessionId: 1, timestamp: -1 })).toBe(true);
  });

  test('SourceMapArtifact 按项目、环境、release 和生成文件唯一存储', () => {
    const indexes = SourceMapArtifact.schema.indexes();

    expect(hasIndex(indexes, {
      appKey: 1,
      environment: 1,
      release: 1,
      generatedFile: 1
    }, { unique: true })).toBe(true);
  });
});
