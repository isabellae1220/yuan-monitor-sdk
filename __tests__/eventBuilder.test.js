import { createMonitorEvent, generateEventId } from '../src/core/eventBuilder';

describe('MonitorEvent Builder', () => {
  test('创建包含公共字段和类型数据的统一事件', () => {
    const event = createMonitorEvent({
      eventType: 'error',
      subType: 'react',
      appKey: 'test-app',
      environment: 'development',
      release: 'react-demo@1.0.0',
      sessionId: 'session-1',
      userId: 'user-1',
      timestamp: 1000,
      pageUrl: 'http://test.com/page',
      runtime: { language: 'zh-CN' },
      data: { message: 'render failed' },
      breadcrumbs: [{ type: 'click' }]
    });

    expect(event).toEqual(expect.objectContaining({
      eventType: 'error',
      subType: 'react',
      appKey: 'test-app',
      release: 'react-demo@1.0.0',
      sessionId: 'session-1',
      userId: 'user-1',
      timestamp: 1000,
      pageUrl: 'http://test.com/page',
      runtime: { language: 'zh-CN' },
      data: { message: 'render failed' },
      breadcrumbs: [{ type: 'click' }]
    }));
    expect(event.eventId).toMatch(/^evt_/);
  });

  test('不同事件拥有不同 eventId', () => {
    expect(generateEventId()).not.toBe(generateEventId());
  });

  test('未传可选字段时使用安全默认值', () => {
    const event = createMonitorEvent({ eventType: 'behavior' });

    expect(event.subType).toBe('');
    expect(event.release).toBe('');
    expect(event.userData).toEqual({});
    expect(event.runtime).toEqual({});
    expect(event.data).toEqual({});
    expect(event.breadcrumbs).toEqual([]);
    expect(typeof event.timestamp).toBe('number');
  });

  test('缺少 eventType 时拒绝创建无类型事件', () => {
    expect(() => createMonitorEvent()).toThrow('MonitorEvent eventType is required');
  });
});
