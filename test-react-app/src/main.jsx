import React, { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { init } from 'yuan-monitor-sdk'
import { APP_RELEASE } from './release.js'
import { MONITOR_SERVER_URL } from './runtimeConfig.js'

// 初始化监控SDK
const monitor = init({
  appKey: 'test-app-key',
  environment: import.meta.env.PROD ? 'production' : 'development',
  release: APP_RELEASE,
  serverUrl: MONITOR_SERVER_URL,
  debug: !import.meta.env.PROD,
  privacy: {
    ignoreUrls: ['/api/demo/ignored']
  },
  framework: {
    react: true
  },
  // 分项开启性能采集；内存指标仍关闭，因为 performance.memory 只在部分浏览器可用
  performance: {
    enable: true,
    captureWebVitals: true,
    captureResourceTiming: true,
    captureLongTasks: true,
    captureMemory: false
  },
  advanced: {
    // 暂时关闭录屏，验证浏览器崩溃是否由 rrweb/SessionReplay 引起
    enableSessionReplay: false,
    sessionReplaySampleRate: 1
  },
  reporter: {
    reportMethod: 'fetch',
    batchSize: 5,
    batchInterval: 5000,
    maxQueueSize: 20,
    retryCount: 3,
    retryDelay: 1000,
    debug: true
  }
})

// 主动传入 React 引用，确保 ErrorBoundary 立即可用
monitor.setReact(React)

const ErrorBoundary = monitor.ErrorBoundary || React.Fragment

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App monitor={monitor} />
    </ErrorBoundary>
  </StrictMode>,
)
