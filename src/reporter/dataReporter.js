import eventBus from '../core/eventBus';
import createMonitorEvent from '../core/eventBuilder';
import createErrorFingerprint from '../core/errorFingerprint';

class DataReporter {
  constructor(config) {
    this.config = config;
    this.queue = [];
    this.timer = null;
    this.retryCount = {};
    this._boundHandlers = {};  // 保存绑定后的回调引用，用于正确取消订阅
    this._unloadHandler = null;
  }

  init() {
    // 保存绑定后的回调引用，确保 off 时能正确匹配
    this._boundHandlers = {
      errorCaptured: this._reportError.bind(this),
      webVital: this._reportPerformance.bind(this),
      resource: this._reportPerformance.bind(this),
      longTask: this._reportPerformance.bind(this),
      memory: this._reportPerformance.bind(this),
      breadcrumb: this._reportBehavior.bind(this)
    };

    eventBus.on('error:captured', this._boundHandlers.errorCaptured);
    eventBus.on('performance:web-vital', this._boundHandlers.webVital);
    eventBus.on('performance:resource', this._boundHandlers.resource);
    eventBus.on('performance:long-task', this._boundHandlers.longTask);
    eventBus.on('performance:memory', this._boundHandlers.memory);
    eventBus.on('behavior:breadcrumb', this._boundHandlers.breadcrumb);

    // 页面卸载时上报剩余数据
    this._unloadHandler = (event) => this._onPageUnload(event);
    window.addEventListener('visibilitychange', this._unloadHandler);
    window.addEventListener('pagehide', this._unloadHandler);

    eventBus.emit('reporter:initialized');
  }

  /**
   * 页面卸载时上报队列中的剩余数据
   */
  _onPageUnload(event) {
    const isPageHide = event?.type === 'pagehide';
    const isDocumentHidden = document.visibilityState === 'hidden';

    if ((isPageHide || isDocumentHidden) && this.queue.length > 0) {
      this.flushQueue({ preferBeacon: true });
    }
  }

  addToQueue(data) {
    if (!data || !this.config.serverUrl) return;

    if (this._mergeDuplicateError(data)) return;

    this.queue.push(data);

    if (this.config.debug) {
      console.log(`[Monitor] 数据入队: ${data.eventType || data.type || 'unknown'}，当前队列 ${this.queue.length} 条`);
    }

    // 队列超过最大限制，立即上报
    if (this.queue.length >= this.config.reporter.maxQueueSize) {
      this.flushQueue();
      return;
    }

    // 队列达到批量大小，立即上报
    if (this.queue.length >= this.config.reporter.batchSize) {
      this.flushQueue();
      return;
    }

    // 设置定时上报
    this.scheduleFlush();
  }

  scheduleFlush() {
    if (this.timer) return;

    this.timer = setTimeout(() => {
      this.flushQueue();
    }, this.config.reporter.batchInterval);
  }

  flushQueue({ preferBeacon = false } = {}) {
    if (this.queue.length === 0) return;

    const batchData = [...this.queue];
    this.queue = [];

    if (this.config.debug) {
      console.log(`[Monitor] 开始批量上报: ${batchData.length} 条`);
    }

    // 清除定时器
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    this.report(batchData, { preferBeacon });
  }

  _reportError(errorData) {
    // 通过 EventBus 同步获取面包屑
    const breadcrumbs = eventBus.emit('behavior:getBreadcrumbs') || [];

    // 提取可序列化的错误信息，避免循环引用导致 JSON.stringify 失败
    const safeErrorData = {
      message: errorData.message,
      stack: errorData.stack,
      source: errorData.source,
      lineno: errorData.lineno,
      colno: errorData.colno,
      tagName: errorData.tagName,
      componentStack: errorData.componentStack,  // React ErrorBoundary
      originalStack: errorData.originalStack,    // Source Map 还原结果
      info: errorData.info,                      // Vue errorHandler
      outerHTML: errorData.outerHTML,            // 资源加载错误
      resourceUrl: errorData.resourceUrl,        // 加载失败的资源地址
      componentName: errorData.componentName,    // Vue/React 组件名
      context: errorData.context                 // 手动上报的上下文
    };

    const event = this._createEvent({
      eventType: 'error',
      subType: errorData.type,
      timestamp: errorData.timestamp || Date.now(),
      pageUrl: errorData.url,
      data: safeErrorData,
      breadcrumbs
    });

    event.fingerprint = createErrorFingerprint(event);
    event.occurrenceCount = 1;
    event.firstSeenAt = event.timestamp;
    event.lastSeenAt = event.timestamp;

    this.addToQueue(event);
  }

  _mergeDuplicateError(event) {
    if (event.eventType !== 'error' || !event.fingerprint) return false;

    const errorConfig = this.config.error || {};
    if (errorConfig.enableDedupe === false) return false;

    const dedupeWindow = errorConfig.dedupeWindow ?? 5000;
    const duplicate = this.queue.find(item => (
      item.eventType === 'error' &&
      item.fingerprint === event.fingerprint &&
      Math.abs(event.timestamp - (item.lastSeenAt || item.timestamp)) <= dedupeWindow
    ));

    if (!duplicate) return false;

    duplicate.occurrenceCount = (duplicate.occurrenceCount || 1) + 1;
    duplicate.lastSeenAt = Math.max(duplicate.lastSeenAt || duplicate.timestamp, event.timestamp);

    if (this.config.debug) {
      console.log(
        `[Monitor] 合并重复错误: ${event.fingerprint}，累计 ${duplicate.occurrenceCount} 次`
      );
    }

    return true;
  }

  _reportPerformance(performanceData) {
    const detail = { ...performanceData };
    delete detail.type;
    delete detail.timestamp;

    const event = this._createEvent({
      eventType: 'performance',
      subType: performanceData.type,
      timestamp: performanceData.timestamp || Date.now(),
      data: detail
    });

    this.addToQueue(event);
  }

  _reportBehavior(behaviorData) {
    if (!this.config.behavior.enable) return;

    const detail = { ...behaviorData };
    delete detail.type;
    delete detail.timestamp;

    const event = this._createEvent({
      eventType: 'behavior',
      subType: behaviorData.type,
      timestamp: behaviorData.timestamp || Date.now(),
      data: detail
    });

    this.addToQueue(event);
  }

  _createEvent({ eventType, subType, timestamp, pageUrl, data, breadcrumbs = [] }) {
    const sessionId = eventBus.emit('core:getSessionId') || '';
    const userId = eventBus.emit('core:getUserId') || '';
    const userData = eventBus.emit('core:getUserData') || {};

    return createMonitorEvent({
      eventType,
      subType,
      appKey: this.config.appKey,
      environment: this.config.environment || 'development',
      release: this.config.release || '',
      sessionId,
      userId,
      userData,
      timestamp,
      pageUrl: pageUrl || window.location.href,
      runtime: {
        userAgent: navigator.userAgent,
        language: navigator.language,
        referrer: document.referrer,
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      data,
      breadcrumbs
    });
  }

  report(data, { preferBeacon = false } = {}) {
    if (!data || !this.config.serverUrl) return;

    const reportData = {
      sentAt: Date.now(),
      sdkVersion: this.config.sdkVersion || '1.0.0',
      events: Array.isArray(data) ? data : [data]
    };

    const serializedData = JSON.stringify(reportData);

    // 页面隐藏或卸载时优先交给浏览器异步发送，降低数据丢失概率。
    if (preferBeacon) {
      this.reportBeacon(serializedData);
      return;
    }

    switch (this.config.reporter.reportMethod) {
      case 'beacon':
        this.reportBeacon(serializedData);
        break;
      case 'image':
        this.reportImage(serializedData);
        break;
      case 'fetch':
      default:
        this.reportFetch(serializedData);
        break;
    }
  }

  reportFetch(data, retryAttempt = 0) {
    if (!window.fetch) {
      return this.reportImage(data);
    }

    fetch(`${this.config.serverUrl}/api/report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-SDK-Internal': 'true'
      },
      body: data,
      credentials: 'include',
      keepalive: true
    })
      .then((response) => {
        if (!response.ok) {
          const error = new Error(`Report request failed with status ${response.status}`);
          error.status = response.status;
          error.retryable = response.status === 408 ||
            response.status === 429 ||
            response.status >= 500;
          throw error;
        }

        if (this.config.debug) {
          console.log(`[Monitor] 上报成功: ${response.status}`);
        }
      })
      .catch((error) => {
        if (this.config.debug) {
          console.warn(
            `[Monitor] 上报失败，第 ${retryAttempt + 1} 次尝试:`,
            error.message
          );
        }

        // 参数、鉴权和地址等 4xx 问题不会因等待而自动恢复，直接报告失败。
        if (error.retryable === false) {
          eventBus.emit('reporter:report:failed', { data, error });
          return;
        }

        // 网络异常没有 HTTP 状态，408/429/5xx 属于可能恢复的临时故障。
        this.handleReportError(data, error, retryAttempt);
      });
  }

  reportBeacon(data) {
    if (!window.navigator.sendBeacon) {
      return this.reportFetch(data);
    }

    const blob = new Blob([data], { type: 'application/json' });
    const success = window.navigator.sendBeacon(`${this.config.serverUrl}/api/report`, blob);
    if (!success) {
      this.reportFetch(data);
    }
  }

  reportImage(data) {
    try {
      const img = new Image();
      const encodedData = encodeURIComponent(data);
      const url = `${this.config.serverUrl}/api/report?data=${encodedData}`;

      img.src = url;
      img.onload = () => {
        img.onload = null;
        img.onerror = null;
      };
      img.onerror = () => {
        this.handleReportError(data, new Error('Image beacon failed'));
        img.onload = null;
        img.onerror = null;
      };
    } catch (error) {
      this.handleReportError(data, error);
    }
  }

  handleReportError(data, error, retryAttempt = 0) {
    if (retryAttempt < this.config.reporter.retryCount) {
      setTimeout(() => {
        // 重试同一份序列化数据，避免再次包装导致数据无限膨胀
        this.reportFetch(data, retryAttempt + 1);
      }, this.config.reporter.retryDelay * Math.pow(2, retryAttempt));
    } else {
      if (this.config.debug) {
        console.error(`[Monitor] 上报失败，已达到最大重试次数 ${this.config.reporter.retryCount}`);
      }
      eventBus.emit('reporter:report:failed', { data, error });
    }
  }

  flush() {
    this.flushQueue();
  }

  destroy() {
    // 上报剩余数据
    this.flushQueue();

    // 使用保存的引用正确取消订阅
    eventBus.off('error:captured', this._boundHandlers.errorCaptured);
    eventBus.off('performance:web-vital', this._boundHandlers.webVital);
    eventBus.off('performance:resource', this._boundHandlers.resource);
    eventBus.off('performance:long-task', this._boundHandlers.longTask);
    eventBus.off('performance:memory', this._boundHandlers.memory);
    eventBus.off('behavior:breadcrumb', this._boundHandlers.breadcrumb);

    // 移除页面卸载监听
    if (this._unloadHandler) {
      window.removeEventListener('visibilitychange', this._unloadHandler);
      window.removeEventListener('pagehide', this._unloadHandler);
      this._unloadHandler = null;
    }

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    this._boundHandlers = {};

    eventBus.emit('reporter:destroyed');
  }
}

export default DataReporter;
