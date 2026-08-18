import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import { apiUrl } from './runtimeConfig.js'

function App({ monitor }) {
  const [count, setCount] = useState(0)
  const [componentErrorTestId, setComponentErrorTestId] = useState(0)
  const [brokenResourceUrl, setBrokenResourceUrl] = useState('')
  const [performanceResourceUrl, setPerformanceResourceUrl] = useState('')
  const [routeDisplay, setRouteDisplay] = useState(
    `${window.location.pathname}${window.location.search}${window.location.hash}`
  )
  const ErrorBoundary = monitor.ErrorBoundary

  // 测试JavaScript运行时错误
  const testRuntimeError = () => {
    console.log('测试JavaScript运行时错误')

    // 放入新的异步任务，并且不使用 try/catch，让错误传播到 window.onerror。
    // 这样验证的是 ErrorCollector 自动捕获，而不是 monitor.reportError() 手动上报。
    setTimeout(() => {
      throw new Error('自动捕获的 JavaScript 运行时错误')
    }, 0)
  }

  // 测试Promise未处理错误
  const testPromiseError = () => {
    console.log('测试Promise未处理错误')

    // 不添加 catch，让浏览器触发 unhandledrejection，验证 ErrorCollector 自动捕获。
    Promise.reject(new Error('自动捕获的 Promise 未处理异常'))
  }

  // 测试资源加载错误
  const testResourceError = () => {
    console.log('测试资源加载错误')
    setBrokenResourceUrl(`/missing-image-${Date.now()}.png`)
  }

  // 测试网络请求监控
  const testFetchSuccess = () => {
    fetch(apiUrl('/api/demo/success'))
      .then(response => response.json())
      .then(data => console.log('Fetch success:', data))
  }

  const testFetchFailure = () => {
    fetch(apiUrl('/api/demo/failure'))
      .then(response => response.json())
      .then(data => console.log('Fetch 500 response:', data))
  }

  const testFetchSlow = () => {
    fetch(apiUrl('/api/demo/slow'))
      .then(response => response.json())
      .then(data => console.log('Fetch slow response:', data))
  }

  const testXHRFailure = () => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', apiUrl('/api/demo/failure'))
    xhr.send()
  }

  const testSensitiveUrl = () => {
    fetch(apiUrl('/api/demo/success?phone=13812345678&token=demo-secret&page=2'))
      .then(response => response.json())
      .then(data => console.log('Sensitive URL response:', data))
  }

  const testIgnoredRequest = () => {
    fetch(apiUrl('/api/demo/ignored'))
      .then(response => response.json())
      .then(data => console.log('Ignored request response:', data))
  }

  // 制造一段可控的同步长任务，用来验证 PerformanceObserver 的 longtask 采集。
  const testLongTask = () => {
    const startTime = performance.now()
    while (performance.now() - startTime < 180) {
      // 故意占用主线程约 180ms；真实业务中不应该这样写。
    }
    console.log(`Long Task 测试结束，主线程占用约 ${Math.round(performance.now() - startTime)}ms`)
  }

  // 动态加载一个带时间戳的静态资源，避免浏览器直接复用相同 URL 的记录。
  const testResourceTiming = () => {
    setPerformanceResourceUrl(`/vite.svg?resource-timing=${Date.now()}`)
  }

  // 测试用户行为追踪
  const testUserBehavior = () => {
    console.log('测试用户行为追踪')
    // 手动添加面包屑
    monitor.addBreadcrumb('custom', {
      message: '用户执行了自定义操作',
      data: { test: 'data' }
    })
  }

  // 测试控制台输出记录
  const testConsoleOutput = () => {
    console.log('测试控制台输出 - log')
    console.warn('测试控制台输出 - warn')
    console.error('测试控制台输出 - error')
  }

  const testPushState = () => {
    const nextUrl = `/monitor-demo?method=push&time=${Date.now()}`
    history.pushState({ source: 'monitor-demo' }, '', nextUrl)
    setRouteDisplay(`${window.location.pathname}${window.location.search}${window.location.hash}`)
  }

  const testReplaceState = () => {
    const nextUrl = `/monitor-demo?method=replace&time=${Date.now()}`
    history.replaceState({ source: 'monitor-demo' }, '', nextUrl)
    setRouteDisplay(`${window.location.pathname}${window.location.search}${window.location.hash}`)
  }

  const testHistoryBack = () => {
    history.back()
    setTimeout(() => {
      setRouteDisplay(`${window.location.pathname}${window.location.search}${window.location.hash}`)
    }, 0)
  }

  // 测试组件错误
  const testComponentError = () => {
    console.log('测试组件错误')
    // 修改 key 会创建新的局部 ErrorBoundary，并渲染真正抛错的测试组件。
    setComponentErrorTestId((id) => id + 1)
  }

  // 手动上报错误
  const testManualErrorReport = () => {
    console.log('测试手动上报错误')
    monitor.reportError(new Error('手动上报的错误'), {
      context: 'test',
      customData: 'custom data'
    })
  }

  return (
    <div className="app">
      <div className="header">
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>TraceLens Monitor Demo</h1>
      <p>点击下方按钮体验前端错误、性能与行为监控</p>

      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
      </div>

      <div className="test-buttons">
        <h3>错误监控测试</h3>
        <button onClick={testRuntimeError}>
          <span aria-hidden="true">⚠️</span>
          测试运行时错误
        </button>
        <button onClick={testPromiseError}>测试Promise错误</button>
        <button onClick={testResourceError}>测试资源加载错误</button>
        <button onClick={testComponentError}>测试组件错误</button>
        <button onClick={testManualErrorReport}>测试手动上报错误</button>

        {brokenResourceUrl && (
          <img
            src={brokenResourceUrl}
            alt="资源加载错误测试"
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
          />
        )}

        <h3>性能与网络测试</h3>
        <button onClick={testLongTask}>制造约 180ms Long Task</button>
        <button onClick={testResourceTiming}>加载静态资源并记录耗时</button>
        <button onClick={testFetchSuccess}>测试 Fetch 成功请求</button>
        <button onClick={testFetchFailure}>测试 Fetch 500</button>
        <button onClick={testFetchSlow}>测试 Fetch 慢请求</button>
        <button onClick={testXHRFailure}>测试 XHR 500</button>
        <button onClick={testSensitiveUrl}>
          联系 13812345678 / isabella@example.com
        </button>
        <button onClick={testIgnoredRequest}>测试忽略请求</button>

        {performanceResourceUrl && (
          <img
            src={performanceResourceUrl}
            alt="Resource Timing 测试"
            width="48"
            height="48"
          />
        )}

        <h3>用户行为测试</h3>
        <p>当前路由：{routeDisplay}</p>
        <button onClick={testPushState}>测试 pushState 路由</button>
        <button onClick={testReplaceState}>测试 replaceState 路由</button>
        <button onClick={testHistoryBack}>测试浏览器后退</button>
        <button onClick={testUserBehavior}>测试自定义行为追踪</button>
        <button onClick={testConsoleOutput}>测试控制台输出记录</button>
      </div>

      {/* 使用局部错误边界，避免测试组件报错后整个 Demo 都被替换 */}
      {ErrorBoundary && (
        <ErrorBoundary
          key={componentErrorTestId}
          fallback={<div role="alert">React 测试组件已出错，但页面其他功能仍可使用</div>}
        >
          {componentErrorTestId > 0 && <ErrorComponent />}
        </ErrorBoundary>
      )}

      <p className="read-the-docs">
        查看浏览器控制台以查看监控SDK的调试信息
      </p>
    </div>
  )
}

// 专门用于验证 React ErrorBoundary 的渲染错误组件
function ErrorComponent() {
  throw new Error('自动捕获的 React 组件渲染错误')
}

export default App
