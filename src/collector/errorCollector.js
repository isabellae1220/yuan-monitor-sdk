import eventBus from '../core/eventBus';

class ErrorCollector {
  constructor(config) {
    this.config = config;
    this.originalOnerror = null;
    this.originalOnunhandledrejection = null;
    this.globalErrorHandler = null;
    this.promiseRejectionHandler = null;
    this.resourceErrorHandler = null;
  }
  
  init() {
    if (!this.config.error.enable) return;
    
    this.setupGlobalErrorHandler();
    this.setupPromiseRejectionHandler();
    this.setupResourceErrorHandler();
    
    eventBus.emit('collector:error:initialized');
  }
  
  setupGlobalErrorHandler() {
    if (!this.config.error.captureGlobalErrors) return;
    
    this.originalOnerror = window.onerror;
    
    this.globalErrorHandler = (message, source, lineno, colno, error) => {
      // 跨域脚本未正确配置 CORS 时，浏览器可能只暴露不含详情的 Script error
      if (typeof message === 'string' && message.startsWith('Script error')) {
        return this.originalOnerror?.(message, source, lineno, colno, error);
      }
      
      this.handleError({
        type: 'js',
        message: message?.toString() || 'Unknown error',
        source,
        lineno,
        colno,
        stack: error?.stack,
        error
      });
      
      return this.originalOnerror?.(message, source, lineno, colno, error);
    };

    window.onerror = this.globalErrorHandler;
  }
  
  setupPromiseRejectionHandler() {
    if (!this.config.error.capturePromiseRejections) return;
    
    this.originalOnunhandledrejection = window.onunhandledrejection;
    
    this.promiseRejectionHandler = (event) => {
      const reason = event.reason;
      const message = reason?.message || (
        reason !== undefined && reason !== null
          ? String(reason)
          : 'Unhandled promise rejection'
      );
      
      this.handleError({
        type: 'promise',
        message,
        stack: reason?.stack,
        reason,
        promise: event.promise
      });
      
      return this.originalOnunhandledrejection?.(event);
    };

    window.onunhandledrejection = this.promiseRejectionHandler;
  }
  
  setupResourceErrorHandler() {
    if (!this.config.error.captureResourceErrors) return;
    
    this.resourceErrorHandler = (event) => {
      const target = event.target;
      if (target && (target.tagName === 'SCRIPT' || target.tagName === 'LINK' || target.tagName === 'IMG')) {
        this.handleError({
          type: 'resource',
          tagName: target.tagName,
          resourceUrl: target.src || target.href,
          outerHTML: target.outerHTML
        });
      }
    };
    
    window.addEventListener('error', this.resourceErrorHandler, true);
  }
  
  handleError(errorData) {
    const error = {
      ...errorData,
      timestamp: Date.now(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      language: navigator.language
    };
    
    eventBus.emit('error:captured', error);
  }
  
  destroy() {
    // 恢复原始的错误处理函数
    if (window.onerror === this.globalErrorHandler) {
      window.onerror = this.originalOnerror;
    }
    
    if (window.onunhandledrejection === this.promiseRejectionHandler) {
      window.onunhandledrejection = this.originalOnunhandledrejection;
    }
    
    if (this.resourceErrorHandler) {
      window.removeEventListener('error', this.resourceErrorHandler, true);
    }

    this.globalErrorHandler = null;
    this.promiseRejectionHandler = null;
    this.resourceErrorHandler = null;
    
    eventBus.emit('collector:error:destroyed');
  }
}

export default ErrorCollector;
