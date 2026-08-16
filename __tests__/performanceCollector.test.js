import eventBus from '../src/core/eventBus';
import PerformanceCollector from '../src/collector/performanceCollector';

const mockOnCLS = jest.fn();
const mockOnFCP = jest.fn();
const mockOnINP = jest.fn();
const mockOnLCP = jest.fn();
const mockOnTTFB = jest.fn();

jest.mock('web-vitals', () => ({
  onCLS: mockOnCLS,
  onFCP: mockOnFCP,
  onINP: mockOnINP,
  onLCP: mockOnLCP,
  onTTFB: mockOnTTFB
}));

class MockPerformanceObserver {
  static supportedEntryTypes = ['resource', 'longtask'];

  static instances = [];

  constructor(callback) {
    this.callback = callback;
    this.observe = jest.fn();
    this.disconnect = jest.fn();
    MockPerformanceObserver.instances.push(this);
  }

  emit(entries) {
    this.callback({ getEntries: () => entries });
  }
}

const defaultConfig = {
  performance: {
    enable: true,
    captureWebVitals: false,
    captureResourceTiming: false,
    captureLongTasks: false,
    captureMemory: false
  }
};

describe('PerformanceCollector', () => {
  let collector;

  beforeEach(() => {
    jest.clearAllMocks();
    eventBus.clear();
    MockPerformanceObserver.instances = [];
    MockPerformanceObserver.supportedEntryTypes = ['resource', 'longtask'];

    global.window = {
      PerformanceObserver: MockPerformanceObserver,
      performance: {
        getEntriesByType: jest.fn(() => [])
      },
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    };

    collector = new PerformanceCollector(defaultConfig);
  });

  afterEach(() => {
    collector.destroy();
  });

  test('Web Vitals 使用 INP 而不是已废弃的 FID', async () => {
    await collector.setupWebVitalsCollector();

    expect(mockOnINP).toHaveBeenCalledWith(expect.any(Function));
    expect(mockOnCLS).toHaveBeenCalledWith(expect.any(Function));
    expect(mockOnLCP).toHaveBeenCalledWith(expect.any(Function));
  });

  test('资源监控使用 PerformanceObserver 持续监听并过滤接口请求', () => {
    const resourceEvents = [];
    eventBus.on('performance:resource', data => resourceEvents.push(data));

    collector.setupResourceTimingCollector();
    const observer = MockPerformanceObserver.instances[0];

    expect(observer.observe).toHaveBeenCalledWith({ type: 'resource', buffered: true });

    observer.emit([
      {
        name: 'http://test.com/logo.png',
        entryType: 'resource',
        initiatorType: 'img',
        startTime: 10,
        duration: 80,
        responseEnd: 90,
        transferSize: 100,
        encodedBodySize: 80,
        decodedBodySize: 120,
        nextHopProtocol: 'h2'
      },
      {
        name: 'http://test.com/api/orders',
        entryType: 'resource',
        initiatorType: 'fetch',
        duration: 20
      }
    ]);

    expect(resourceEvents).toHaveLength(1);
    expect(resourceEvents[0]).toEqual(expect.objectContaining({
      type: 'resource',
      name: 'http://test.com/logo.png',
      initiatorType: 'img',
      duration: 80
    }));
  });

  test('Long Task 监控发布耗时和开始时间', () => {
    const longTaskEvents = [];
    eventBus.on('performance:long-task', data => longTaskEvents.push(data));

    collector.setupLongTasksCollector();
    const observer = MockPerformanceObserver.instances[0];
    observer.emit([{ duration: 120, startTime: 500, attribution: [] }]);

    expect(observer.observe).toHaveBeenCalledWith({ type: 'longtask', buffered: true });
    expect(longTaskEvents[0]).toEqual(expect.objectContaining({
      type: 'long-task',
      duration: 120,
      startTime: 500
    }));
  });

  test('浏览器不支持对应 entry type 时不创建监听器', () => {
    MockPerformanceObserver.supportedEntryTypes = ['paint'];

    collector.setupResourceTimingCollector();
    collector.setupLongTasksCollector();

    expect(MockPerformanceObserver.instances).toHaveLength(0);
  });

  test('destroy 断开已经创建的 Observer', () => {
    collector.setupResourceTimingCollector();
    collector.setupLongTasksCollector();
    const observers = [...MockPerformanceObserver.instances];

    collector.destroy();

    observers.forEach(observer => {
      expect(observer.disconnect).toHaveBeenCalled();
    });
  });
});
