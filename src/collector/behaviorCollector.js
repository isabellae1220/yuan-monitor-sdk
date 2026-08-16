import eventBus from '../core/eventBus';
import {
  getClickTarget,
  findMeaningfulTarget,
  buildElementSelector
} from '../core/elementLocator';
import {
  getFetchRequestInfo,
  isSdkInternalRequest,
  isSuccessfulStatus
} from '../core/requestUtils';
import {
  resolvePrivacyConfig,
  sanitizeBreadcrumbData,
  shouldIgnoreUrl
} from '../core/privacyProcessor';

const normalizeUrl = (url, baseUrl) => {
  try {
    return new URL(String(url), baseUrl).href;
  } catch (error) {
    return String(url || baseUrl || '');
  }
};

class BehaviorCollector {
  constructor(config) {
    this.config = config;
    this.breadcrumbs = [];
    this.lastHref = typeof document !== 'undefined' ? document.location.href : '';

    // 保存原始引用，用于 destroy 时恢复
    this.originalPushState = null;
    this.originalReplaceState = null;
    this.originalXHROpen = null;
    this.originalXHRSend = null;
    this.originalXHRSetRequestHeader = null;
    this.originalFetch = null;
    this.originalConsole = {};

    this.xhrHandlerInitialized = false;
    this.fetchHandlerInitialized = false;

    // 保存事件监听器引用，用于 destroy 时移除
    this._clickHandler = null;
    this._popstateHandler = null;
    this._hashchangeHandler = null;
  }

  init() {
    if (!this.config.behavior.enable) return;

    // 响应面包屑查询
    eventBus.on('behavior:getBreadcrumbs', () => this.getBreadcrumbs());

    if (this.config.behavior.captureClicks) {
      this.setupClickHandler();
    }

    if (this.config.behavior.captureRouteChanges) {
      this.setupRouteChangeHandler();
    }

    if (this.config.behavior.captureNetworkRequests) {
      this.setupNetworkRequestHandler();
    }

    if (this.config.behavior.captureConsole) {
      this.setupConsoleHandler();
    }

    eventBus.emit('collector:behavior:initialized');
  }

  addBreadcrumb(type, data) {
    const safeData = sanitizeBreadcrumbData(
      data,
      resolvePrivacyConfig(this.config.privacy)
    );
    const breadcrumb = {
      type,
      timestamp: Date.now(),
      ...safeData
    };

    this.breadcrumbs.push(breadcrumb);

    // 限制面包屑数量
    if (this.breadcrumbs.length > this.config.behavior.maxBreadcrumbs) {
      this.breadcrumbs.shift();
    }

    eventBus.emit('behavior:breadcrumb', breadcrumb);
    return breadcrumb;
  }

  getBreadcrumbs() {
    return [...this.breadcrumbs];
  }

  clearBreadcrumbs() {
    this.breadcrumbs = [];
    eventBus.emit('behavior:breadcrumbs:cleared');
  }

  setupClickHandler() {
    this._clickHandler = (event) => {
      const rawTarget = getClickTarget(event);
      const target = findMeaningfulTarget(
        rawTarget,
        this.config.behavior.maxSelectorDepth
      );
      if (!target || target.tagName === 'BODY') return;

      const tagName = target.tagName.toLowerCase();
      const id = target.id ? `id="${target.id}"` : '';
      const className = target.className ? `class="${target.className}"` : '';
      const text = target.textContent ? target.textContent.trim().substring(0, 100) : '';

      const domInfo = `<${tagName} ${id} ${className}>${text}</${tagName}>`;
      const locator = buildElementSelector(target, {
        maxDepth: this.config.behavior.maxSelectorDepth
      });

      this.addBreadcrumb('click', {
        dom: domInfo,
        tagName,
        id: target.id,
        className: target.className,
        text,
        selector: locator.selector,
        selectorUnique: locator.isUnique,
        x: event.clientX,
        y: event.clientY
      });
    };
    document.addEventListener('click', this._clickHandler, true);
  }

  setupRouteChangeHandler() {
    // 保存原始 history 方法
    this.originalPushState = history.pushState;
    this.originalReplaceState = history.replaceState;

    const handleRouteChange = (method, from, to) => {
      if (!to || from === to) return;

      this.lastHref = to;
      this.addBreadcrumb('route', {
        method,
        from,
        to,
        fullUrl: to
      });
    };

    const collector = this;

    history.pushState = function(...args) {
      const requestedUrl = args.length > 2 ? args[2] : undefined;
      const from = collector.lastHref || window.location.href;
      const result = collector.originalPushState.apply(this, args);

      if (requestedUrl !== undefined && requestedUrl !== null) {
        const requestedFullUrl = normalizeUrl(requestedUrl, from);
        const browserFullUrl = normalizeUrl(window.location.href, from);
        const to = browserFullUrl !== from ? browserFullUrl : requestedFullUrl;
        handleRouteChange('pushState', from, to);
      }

      return result;
    };

    history.replaceState = function(...args) {
      const requestedUrl = args.length > 2 ? args[2] : undefined;
      const from = collector.lastHref || window.location.href;
      const result = collector.originalReplaceState.apply(this, args);

      if (requestedUrl !== undefined && requestedUrl !== null) {
        const requestedFullUrl = normalizeUrl(requestedUrl, from);
        const browserFullUrl = normalizeUrl(window.location.href, from);
        const to = browserFullUrl !== from ? browserFullUrl : requestedFullUrl;
        handleRouteChange('replaceState', from, to);
      }

      return result;
    };

    // 监听 popstate 事件
    this._popstateHandler = () => {
      const from = this.lastHref;
      const to = normalizeUrl(window.location.href, from);
      handleRouteChange('popstate', from, to);
    };
    window.addEventListener('popstate', this._popstateHandler);

    // 监听 hashchange 事件
    this._hashchangeHandler = (event) => {
      const from = normalizeUrl(event?.oldURL || this.lastHref, window.location.href);
      const to = normalizeUrl(event?.newURL || window.location.href, from);
      handleRouteChange('hashchange', from, to);
    };
    window.addEventListener('hashchange', this._hashchangeHandler);
  }

  setupNetworkRequestHandler() {
    this.setupXHRHandler();
    this.setupFetchHandler();
  }

  setupXHRHandler() {
    if (!window.XMLHttpRequest) return;
    if (this.xhrHandlerInitialized) return;
    this.xhrHandlerInitialized = true;

    // 保存原始方法
    this.originalXHROpen = XMLHttpRequest.prototype.open;
    this.originalXHRSend = XMLHttpRequest.prototype.send;
    this.originalXHRSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
    const collector = this;

    XMLHttpRequest.prototype.open = function(method, url, ...args) {
      this._monitor = {
        method: method.toUpperCase(),
        url: normalizeUrl(url, window.location.href),
        headers: {}
      };
      return collector.originalXHROpen.apply(this, [method, url, ...args]);
    };

    if (this.originalXHRSetRequestHeader) {
      XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
        if (this._monitor) {
          this._monitor.headers[String(name).toLowerCase()] = String(value);
        }
        return collector.originalXHRSetRequestHeader.apply(this, [name, value]);
      };
    }

    XMLHttpRequest.prototype.send = function(body, ...args) {
      const isInternal = this._monitor && isSdkInternalRequest({
        url: this._monitor.url,
        headers: this._monitor.headers,
        serverUrl: collector.config.serverUrl,
        baseUrl: window.location.href
      });
      const isIgnored = this._monitor && shouldIgnoreUrl(
        this._monitor.url,
        resolvePrivacyConfig(collector.config.privacy).ignoreUrls
      );

      if (isInternal || isIgnored) {
        return collector.originalXHRSend.apply(this, [body, ...args]);
      }

      if (this._monitor) {
        this._monitor.startTime = Date.now();

        const xhr = this;
        let completed = false;

        const reportResult = (errorType = '') => {
          if (completed) return;
          completed = true;

          const endTime = Date.now();
          const success = !errorType && isSuccessfulStatus(xhr.status);
          collector.addBreadcrumb('xhr', {
            method: xhr._monitor.method,
            url: xhr._monitor.url,
            startTime: xhr._monitor.startTime,
            endTime,
            elapsedTime: endTime - xhr._monitor.startTime,
            status: xhr.status,
            success,
            error: !success,
            errorType: errorType || (success ? '' : 'http'),
            type: 'xhr'
          });
        };

        xhr.addEventListener('load', () => reportResult());
        xhr.addEventListener('error', () => reportResult('network'));
        xhr.addEventListener('abort', () => reportResult('abort'));
        xhr.addEventListener('timeout', () => reportResult('timeout'));
      }

      return collector.originalXHRSend.apply(this, [body, ...args]);
    };
  }

  setupFetchHandler() {
    if (!window.fetch) return;
    if (this.fetchHandlerInitialized) return;
    this.fetchHandlerInitialized = true;

    this.originalFetch = window.fetch;

    const collector = this;

    window.fetch = async (input, config = {}) => {
      const requestInfo = getFetchRequestInfo(input, config, window.location.href);
      const isSdkInternal = isSdkInternalRequest({
        ...requestInfo,
        serverUrl: collector.config.serverUrl,
        baseUrl: window.location.href
      });
      const isIgnored = shouldIgnoreUrl(
        requestInfo.url,
        resolvePrivacyConfig(collector.config.privacy).ignoreUrls
      );

      if (isSdkInternal || isIgnored) {
        // 原生 fetch 需要保留 window 作为调用上下文，否则部分浏览器会抛出 Illegal invocation
        return collector.originalFetch.call(window, input, config);
      }

      const startTime = Date.now();

      const monitorData = {
        method: requestInfo.method,
        url: requestInfo.url,
        startTime,
        type: 'fetch'
      };

      try {
        const response = await collector.originalFetch.call(window, input, config);
        const endTime = Date.now();
        const success = typeof response.ok === 'boolean'
          ? response.ok
          : isSuccessfulStatus(response.status);

        monitorData.endTime = endTime;
        monitorData.elapsedTime = endTime - startTime;
        monitorData.status = response.status;
        monitorData.success = success;
        monitorData.error = !success;
        monitorData.errorType = success ? '' : 'http';

        collector.addBreadcrumb('fetch', monitorData);

        return response;
      } catch (error) {
        const endTime = Date.now();

        monitorData.endTime = endTime;
        monitorData.elapsedTime = endTime - startTime;
        monitorData.success = false;
        monitorData.error = true;
        monitorData.errorType = 'network';
        monitorData.errorMessage = error.message;

        collector.addBreadcrumb('fetch', {
          ...monitorData,
          error: true
        });

        throw error;
      }
    };
  }

  setupConsoleHandler() {
    const consoleMethods = ['log', 'info', 'warn', 'error', 'debug'];

    consoleMethods.forEach(method => {
      if (typeof console[method] === 'function') {
        this.originalConsole[method] = console[method];

        console[method] = (...args) => {
          this.addBreadcrumb('console', {
            method,
            args: args.map(arg => {
              try {
                if (typeof arg === 'object') {
                  return JSON.stringify(arg);
                }
                return String(arg);
              } catch (e) {
                return '[Object]';
              }
            })
          });

          return this.originalConsole[method].apply(console, args);
        };
      }
    });
  }

  destroy() {
    // 恢复原始 history 方法
    if (this.originalPushState) {
      history.pushState = this.originalPushState;
      this.originalPushState = null;
    }
    if (this.originalReplaceState) {
      history.replaceState = this.originalReplaceState;
      this.originalReplaceState = null;
    }

    // 恢复原始 XHR 方法
    if (this.originalXHROpen) {
      XMLHttpRequest.prototype.open = this.originalXHROpen;
      this.originalXHROpen = null;
    }
    if (this.originalXHRSend) {
      XMLHttpRequest.prototype.send = this.originalXHRSend;
      this.originalXHRSend = null;
    }
    if (this.originalXHRSetRequestHeader) {
      XMLHttpRequest.prototype.setRequestHeader = this.originalXHRSetRequestHeader;
      this.originalXHRSetRequestHeader = null;
    }

    // 恢复原始 fetch
    if (this.originalFetch) {
      window.fetch = this.originalFetch;
      this.originalFetch = null;
    }

    // 恢复原始控制台方法
    for (const method in this.originalConsole) {
      if (this.originalConsole.hasOwnProperty(method)) {
        console[method] = this.originalConsole[method];
      }
    }
    this.originalConsole = {};

    // 移除 DOM 事件监听
    if (this._clickHandler) {
      document.removeEventListener('click', this._clickHandler, true);
      this._clickHandler = null;
    }
    if (this._popstateHandler) {
      window.removeEventListener('popstate', this._popstateHandler);
      this._popstateHandler = null;
    }
    if (this._hashchangeHandler) {
      window.removeEventListener('hashchange', this._hashchangeHandler);
      this._hashchangeHandler = null;
    }

    // 移除 EventBus 监听
    eventBus.off('behavior:getBreadcrumbs');

    this.xhrHandlerInitialized = false;
    this.fetchHandlerInitialized = false;

    eventBus.emit('collector:behavior:destroyed');
  }
}

export default BehaviorCollector;
