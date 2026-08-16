/**
 * BehaviorCollector 单元测试
 */
import eventBus from '../src/core/eventBus';
import BehaviorCollector from '../src/collector/behaviorCollector';

// Mock window
Object.defineProperty(global, 'window', {
  value: {
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    location: { href: 'http://test.com', origin: 'http://test.com' },
    fetch: jest.fn(() => Promise.resolve({ status: 200 }))
  },
  writable: true
});

// Mock document
Object.defineProperty(global, 'document', {
  value: {
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    location: { href: 'http://test.com' }
  },
  writable: true
});

// Mock history
Object.defineProperty(global, 'history', {
  value: {
    pushState: jest.fn(),
    replaceState: jest.fn()
  },
  writable: true
});

// Mock XMLHttpRequest
const mockXHROpen = jest.fn();
const mockXHRSend = jest.fn();
global.XMLHttpRequest = jest.fn(() => ({
  open: mockXHROpen,
  send: mockXHRSend,
  addEventListener: jest.fn(),
  _monitor: null,
  status: 200
}));
XMLHttpRequest.prototype = {
  open: mockXHROpen,
  send: mockXHRSend
};
window.XMLHttpRequest = global.XMLHttpRequest;

describe('BehaviorCollector', () => {
  let collector;
  const defaultConfig = {
    behavior: {
      enable: true,
      captureClicks: false,
      captureRouteChanges: false,
      captureNetworkRequests: false,
      captureConsole: false,
      maxBreadcrumbs: 20
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    eventBus.clear();
    window.location.href = 'http://test.com/';
    window.fetch = jest.fn(() => Promise.resolve({ status: 200, ok: true }));
    document.location.href = 'http://test.com/';
    collector = new BehaviorCollector({ ...defaultConfig });
  });

  afterEach(() => {
    collector.destroy();
  });

  test('init 时注册面包屑查询接口', () => {
    collector.init();

    const breadcrumbs = eventBus.emit('behavior:getBreadcrumbs');
    expect(breadcrumbs).toEqual([]);
  });

  test('enable 为 false 时不初始化', () => {
    collector = new BehaviorCollector({
      behavior: { enable: false, maxBreadcrumbs: 20 }
    });
    collector.init();

    // 不应注册查询接口
    const result = eventBus.emit('behavior:getBreadcrumbs');
    expect(result).toBeUndefined();
  });

  test('addBreadcrumb 添加面包屑并通过 EventBus 查询', () => {
    collector.init();

    collector.addBreadcrumb('click', { dom: '<button>Test</button>' });
    collector.addBreadcrumb('route', { from: '/home', to: '/about' });

    const breadcrumbs = eventBus.emit('behavior:getBreadcrumbs');
    expect(breadcrumbs.length).toBe(2);
    expect(breadcrumbs[0].type).toBe('click');
    expect(breadcrumbs[1].type).toBe('route');
  });

  test('addBreadcrumb 触发 behavior:breadcrumb 事件', () => {
    collector.init();

    const emittedBreadcrumbs = [];
    eventBus.on('behavior:breadcrumb', (data) => emittedBreadcrumbs.push(data));

    collector.addBreadcrumb('custom', { message: 'test' });

    expect(emittedBreadcrumbs.length).toBe(1);
    expect(emittedBreadcrumbs[0].type).toBe('custom');
  });

  test('面包屑数量超过 maxBreadcrumbs 时移除最早的', () => {
    collector = new BehaviorCollector({
      behavior: { ...defaultConfig.behavior, maxBreadcrumbs: 3 }
    });
    collector.init();

    collector.addBreadcrumb('type1', { index: 1 });
    collector.addBreadcrumb('type2', { index: 2 });
    collector.addBreadcrumb('type3', { index: 3 });
    collector.addBreadcrumb('type4', { index: 4 });

    const breadcrumbs = eventBus.emit('behavior:getBreadcrumbs');
    expect(breadcrumbs.length).toBe(3);
    expect(breadcrumbs[0].index).toBe(2); // 最早的被移除
  });

  test('clearBreadcrumbs 清空面包屑', () => {
    collector.init();

    collector.addBreadcrumb('click', { dom: '<button>' });
    collector.clearBreadcrumbs();

    const breadcrumbs = eventBus.emit('behavior:getBreadcrumbs');
    expect(breadcrumbs).toEqual([]);
  });

  test('destroy 时移除 EventBus 监听', () => {
    collector.init();
    collector.addBreadcrumb('click', { dom: '<button>' });

    collector.destroy();

    // destroy 后查询接口应不可用
    const result = eventBus.emit('behavior:getBreadcrumbs');
    expect(result).toBeUndefined();
  });

  test('getBreadcrumbs 返回副本而非引用', () => {
    collector.init();

    collector.addBreadcrumb('click', { dom: '<button>' });

    const breadcrumbs1 = collector.getBreadcrumbs();
    const breadcrumbs2 = collector.getBreadcrumbs();

    expect(breadcrumbs1).toEqual(breadcrumbs2);
    expect(breadcrumbs1).not.toBe(breadcrumbs2); // 不同引用
  });

  test('pushState 执行原始方法并记录规范化后的完整 URL', () => {
    const originalPushState = history.pushState;
    collector = new BehaviorCollector({
      behavior: {
        ...defaultConfig.behavior,
        captureRouteChanges: true
      }
    });
    collector.init();

    history.pushState({ page: 'orders' }, '', '/orders?tab=all');

    expect(originalPushState).toHaveBeenCalledWith(
      { page: 'orders' },
      '',
      '/orders?tab=all'
    );
    const breadcrumbs = collector.getBreadcrumbs();
    expect(breadcrumbs).toHaveLength(1);
    expect(breadcrumbs[0]).toEqual(expect.objectContaining({
      type: 'route',
      method: 'pushState',
      from: 'http://test.com/',
      to: 'http://test.com/orders?tab=all',
      fullUrl: 'http://test.com/orders?tab=all'
    }));
  });

  test('replaceState 记录路由，popstate 记录浏览器后退', () => {
    collector = new BehaviorCollector({
      behavior: {
        ...defaultConfig.behavior,
        captureRouteChanges: true
      }
    });
    collector.init();

    history.replaceState({}, '', '/profile');
    window.location.href = 'http://test.com/home';
    const popstateHandler = window.addEventListener.mock.calls
      .find(([eventName]) => eventName === 'popstate')[1];
    popstateHandler();

    const breadcrumbs = collector.getBreadcrumbs();
    expect(breadcrumbs.map(item => item.method)).toEqual(['replaceState', 'popstate']);
    expect(breadcrumbs[1]).toEqual(expect.objectContaining({
      from: 'http://test.com/profile',
      to: 'http://test.com/home'
    }));
  });

  test('destroy 恢复原始 History 方法', () => {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    collector = new BehaviorCollector({
      behavior: {
        ...defaultConfig.behavior,
        captureRouteChanges: true
      }
    });
    collector.init();

    expect(history.pushState).not.toBe(originalPushState);
    expect(history.replaceState).not.toBe(originalReplaceState);

    collector.destroy();

    expect(history.pushState).toBe(originalPushState);
    expect(history.replaceState).toBe(originalReplaceState);
  });

  test('劫持 fetch 后调用原生方法时保留 window 上下文', async () => {
    const contextAwareFetch = jest.fn(function () {
      if (this !== window) {
        return Promise.reject(new TypeError('Illegal invocation'));
      }
      return Promise.resolve({ status: 200 });
    });
    window.fetch = contextAwareFetch;

    collector = new BehaviorCollector({
      behavior: {
        ...defaultConfig.behavior,
        captureNetworkRequests: true
      }
    });
    collector.init();

    await window.fetch('http://localhost:3001/api/report', {
      headers: { 'X-SDK-Internal': 'true' }
    });

    expect(contextAwareFetch).toHaveBeenCalledTimes(1);
    expect(contextAwareFetch.mock.instances[0]).toBe(window);
  });

  test('Fetch 500 记录为 HTTP 异常，但仍把 Response 返回业务', async () => {
    const response = { status: 500, ok: false };
    window.fetch = jest.fn(() => Promise.resolve(response));
    collector = new BehaviorCollector({
      serverUrl: 'http://localhost:3001',
      behavior: {
        ...defaultConfig.behavior,
        captureNetworkRequests: true
      }
    });
    collector.init();

    const businessResponse = await window.fetch('/api/failure');
    const breadcrumb = collector.getBreadcrumbs()[0];

    expect(businessResponse).toBe(response);
    expect(breadcrumb).toEqual(expect.objectContaining({
      type: 'fetch',
      status: 500,
      success: false,
      error: true,
      errorType: 'http'
    }));
  });

  test('Fetch 网络异常记录后继续抛给业务', async () => {
    const networkError = new TypeError('Failed to fetch');
    window.fetch = jest.fn(() => Promise.reject(networkError));
    collector = new BehaviorCollector({
      serverUrl: 'http://localhost:3001',
      behavior: {
        ...defaultConfig.behavior,
        captureNetworkRequests: true
      }
    });
    collector.init();

    await expect(window.fetch('/api/offline')).rejects.toBe(networkError);
    expect(collector.getBreadcrumbs()[0]).toEqual(expect.objectContaining({
      type: 'fetch',
      success: false,
      error: true,
      errorType: 'network',
      errorMessage: 'Failed to fetch'
    }));
  });

  test('XHR 500 在 load 事件中按状态码记录为 HTTP 异常', () => {
    collector = new BehaviorCollector({
      serverUrl: 'http://localhost:3001',
      behavior: {
        ...defaultConfig.behavior,
        captureNetworkRequests: true
      }
    });
    collector.init();

    const listeners = {};
    const xhr = {
      status: 500,
      addEventListener: (eventName, callback) => {
        listeners[eventName] = callback;
      }
    };

    XMLHttpRequest.prototype.open.call(xhr, 'GET', '/api/failure');
    XMLHttpRequest.prototype.send.call(xhr);
    listeners.load();

    expect(collector.getBreadcrumbs()[0]).toEqual(expect.objectContaining({
      type: 'xhr',
      status: 500,
      success: false,
      error: true,
      errorType: 'http'
    }));
  });

  test('请求正常使用原始 URL，但面包屑中的敏感参数被脱敏', async () => {
    const originalFetch = jest.fn(() => Promise.resolve({ status: 200, ok: true }));
    window.fetch = originalFetch;
    collector = new BehaviorCollector({
      serverUrl: 'http://localhost:3001',
      privacy: { enable: true },
      behavior: {
        ...defaultConfig.behavior,
        captureNetworkRequests: true
      }
    });
    collector.init();

    const rawUrl = 'http://test.com/api/user?phone=13812345678&token=secret&page=2';
    await window.fetch(rawUrl);

    expect(originalFetch).toHaveBeenCalledWith(rawUrl, {});
    const safeUrl = decodeURIComponent(collector.getBreadcrumbs()[0].url);
    expect(safeUrl).toContain('phone=[MASKED]');
    expect(safeUrl).toContain('token=[MASKED]');
    expect(safeUrl).toContain('page=2');
    expect(safeUrl).not.toContain('13812345678');
    expect(safeUrl).not.toContain('secret');
  });

  test('命中 ignoreUrls 时请求继续执行但不产生请求面包屑', async () => {
    const originalFetch = jest.fn(() => Promise.resolve({ status: 200, ok: true }));
    window.fetch = originalFetch;
    collector = new BehaviorCollector({
      serverUrl: 'http://localhost:3001',
      privacy: { ignoreUrls: ['/api/ignored'] },
      behavior: {
        ...defaultConfig.behavior,
        captureNetworkRequests: true
      }
    });
    collector.init();

    await window.fetch('http://test.com/api/ignored');

    expect(originalFetch).toHaveBeenCalledTimes(1);
    expect(collector.getBreadcrumbs()).toEqual([]);
  });

  test('点击文字和 DOM 描述中的手机号、邮箱在入队前脱敏', () => {
    collector.init();

    collector.addBreadcrumb('click', {
      text: '联系 13812345678 / isabella@example.com',
      dom: '<button>联系 13812345678 / isabella@example.com</button>'
    });

    const breadcrumb = collector.getBreadcrumbs()[0];
    expect(breadcrumb.text).toBe('联系 138****5678 / i***@example.com');
    expect(breadcrumb.dom).not.toContain('13812345678');
    expect(breadcrumb.dom).not.toContain('isabella@example.com');
  });
});
