export default {
  // 基础配置
  appKey: '',
  serverUrl: '',
  environment: 'development',
  sdkVersion: '1.0.0',
  // 被监控业务应用的发布版本，用于匹配对应构建产物的 Source Map。
  release: '',
  sampleRate: 1,

  // 隐私与数据最小化配置
  privacy: {
    enable: true,
    maskFields: [
      'password', 'passwd', 'token', 'authorization', 'cookie', 'secret',
      'apiKey', 'phone', 'mobile', 'email', 'idCard', 'bankCard', 'cardNo'
    ],
    ignoreUrls: [],
    maxTextLength: 100,
    maxValueLength: 500
  },
  
  // 错误监控配置
  error: {
    enable: true,
    captureGlobalErrors: true,
    capturePromiseRejections: true,
    captureResourceErrors: true,
    enableDedupe: true,
    dedupeWindow: 5000
  },
  
  // 性能监控配置
  performance: {
    enable: true,
    captureWebVitals: true,
    captureResourceTiming: true,
    captureLongTasks: true,
    captureMemory: true
  },
  
  // 用户行为监控配置
  behavior: {
    enable: true,
    captureClicks: true,
    captureRouteChanges: true,
    captureNetworkRequests: true,
    captureConsole: false,
    maxBreadcrumbs: 20,
    maxSelectorDepth: 5
  },
  
  // 高级功能配置
  advanced: {
    enableSessionReplay: false,
    sessionReplaySampleRate: 0.1,
    replayBeforeError: 30,     // 保留错误前多少秒的录屏（默认30秒）
    replayAfterError: 10,      // 错误后继续录制多少秒（默认10秒）
    maxReplayDuration: 60,     // 环形缓冲区最大保留时长（秒）
    enableWhiteScreenDetection: false,
    whiteScreenDetection: {
      enable: false,
      delay: 3000,             // 页面加载后延迟检测时间（ms）
      rootSelectors: ['#root', '#app', '#__next'],
      sampleRows: 10,          // 采样行数
      sampleCols: 10,          // 采样列数
      threshold: 0.9,          // 白屏阈值
      continuous: true,        // 持续监控
      continuousInterval: 10000 // 持续监控间隔（ms）
    },
    sourceMap: {
      // 历史开发配置；生产错误通过 release 匹配后在监控服务端还原。
      enable: false,
      mapUrlTemplate: '',      // Source Map URL 模板
      serverParseUrl: '',      // 服务端解析接口
      cache: true,
      maxCacheSize: 50,
      maxStackDepth: 10
    }
  },
  
  // 上报配置
  reporter: {
    batchSize: 5,
    batchInterval: 5000,
    maxQueueSize: 20,
    reportMethod: 'fetch',
    retryCount: 3,
    retryDelay: 1000
  },
  
  // 框架集成配置
  framework: {
    vue: false,
    react: false
  },
  
  // 调试配置
  debug: false
}
