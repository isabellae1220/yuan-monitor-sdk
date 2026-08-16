# 前端监控与分析平台：简历项目完整讲解与面试指南

> 使用目标：只围绕最终简历中的“前端监控与分析平台”准备面试。先理解主链路，再练口述，不背脱离代码的漂亮答案。
>
> 事实基线：当前仓库代码、测试、构建和浏览器验证优先于旧版 README、原项目题库与宣传文案。

## 阅读目录

1. 最终简历事实校准与项目整体理解
2. 60秒、3至5分钟项目介绍
3. 模块化架构与EventBus
4. 异常、请求、行为和统一事件模型
5. 队列、Beacon、重试与幂等
6. Source Map生产还原闭环
7. Web Vitals、Long Task与性能分析
8. Express、MongoDB与React可视化
9. 两条端到端链路与真实故障复盘
10. 技术选型、纠错清单和未问到的高频问题
11. 高频问答、代码地图、诚实边界与最终自检

## 0. 最终简历原文与事实校准

### 项目定位

**项目名称：** 前端监控与分析平台

**技术栈：** JavaScript、React、Node.js、Express、MongoDB、Web Vitals、Ant Design、ECharts

**项目简介：** 面向 Web 应用的前端监控 SDK 与可视化分析平台，覆盖异常、性能、请求及用户行为数据的采集、可靠上报、服务端治理与可视化排查。

### 简历五条主线

1. **模块化架构：** 基于发布—订阅模式实现 EventBus，解耦错误监控、性能采集与行为追踪模块，支持通过配置开关按需启用；Webpack 生产构建全部 JavaScript 产物 gzip 合计约 24.9 KiB。
2. **异常与请求采集：** 覆盖 JavaScript 运行时错误、Promise 未处理异常、资源加载失败及 React、Vue 框架错误，构建统一事件模型并保留堆栈与运行环境；同时劫持 Fetch、XHR 记录接口状态、耗时与失败类型。
3. **Source Map 还原：** 参考 Sentry 实践构建错误还原链路，由 SDK 采集原始 stack 与行列位置，结合构建阶段生成的 Source Map 和 release 版本匹配，由服务端解析压缩堆栈并还原至源码位置。
4. **性能分析：** 基于 Web Vitals 采集 FCP、LCP、CLS、INP、TTFB，结合 PerformanceObserver 补充 Long Task 与资源耗时，并通过请求链路数据辅助定位页面和接口性能瓶颈。
5. **服务端与可视化：** 基于 Express、MongoDB 完成结构校验、二次脱敏、eventId 幂等写入、fingerprint 错误聚合与性能分位数计算；在 React 控制台展示错误现场、面包屑、性能趋势和慢接口排行。

### 当前验证证据

- 2026-08-12 重新运行：23 个 Jest 测试套件、164 个测试全部通过。
- SDK Webpack 生产构建通过：主产物约 46 KiB，异步 Web Vitals chunk 约 7.07 KiB，二者均为压缩后但未 gzip 的输出大小。
- 当前两个 JavaScript 产物使用 `gzip -c` 重新计算，合计约 16.3 KiB。
- 简历中的 24.9 KiB 是较早一次构建记录；后续将客户端 Source Map 解析职责移到服务端后，当前产物已经更小。面试时不要把 24.9 KiB 和当前 16.3 KiB 说成同一次构建结果。
- Dashboard Vite 生产构建通过，主 JavaScript 产物约 1.65 MB、gzip 约 540.56 KiB，存在分包警告。这是监控后台体积，不是 SDK 体积。
- React 错误、点击、路由、Fetch/XHR、约 180ms Long Task、资源事件、MongoDB 持久化、错误聚合、性能查询、慢接口及 Source Map 生产还原均完成过真实链路验证。
- React 已端到端验证；Vue 集成当前主要有实现与单元测试，不应声称完成了 Vue 真实业务端到端验收。

### 不属于最终简历主线

rrweb 录屏、白屏检测虽然仓库中存在代码与测试，但最终简历没有写，不作为主要卖点。真正插件系统、Tree Shaking、告警、IndexedDB 离线队列、完整鉴权、限流和生产级权限治理尚未完成，也不能当作已经实现的功能。

---

## 1. 项目整体理解

### 1.1 一句话定位

这是一个前端可观测性练习项目：浏览器 SDK 低侵入地采集错误、性能、请求和行为数据，经过可靠上报发送到 Express 服务端，再由 MongoDB 完成持久化、幂等、聚合和查询，最后在 React 控制台中进行可视化排查。

### 1.2 它解决什么问题

线上用户反馈“页面崩了”“按钮很卡”“接口没反应”时，开发环境往往无法直接复现。这个项目希望回答三类问题：

- **发生了什么：** 哪类错误、什么堆栈、哪个页面、什么浏览器环境。
- **发生前做了什么：** 用户点击、路由变化、请求链路等面包屑。
- **影响有多大：** 同类错误出现次数、性能分布、趋势和慢接口排行。

SDK只是浏览器里的“数据探针”，完整价值来自下面的闭环：

```text
浏览器运行时
  → 数据采集
  → 数据标准化
  → 队列与可靠上报
  → 服务端校验和治理
  → MongoDB存储与聚合
  → React控制台分析与排查
```

### 1.3 为什么做成 SDK，而不是散落在业务代码里埋点

- 统一采集规则和事件格式，避免不同页面各写一套。
- 业务只负责初始化和少量框架接入，降低侵入性。
- 错误、性能、行为、上报策略可以集中维护和复用。
- 修复采集逻辑时不需要逐个业务页面修改。
- SDK可以独立测试和构建，服务端也可以按统一协议治理数据。

它并不意味着“完全零侵入”：业务仍需要提供 `appKey`、`serverUrl`、`environment`、`release`，React需要使用 ErrorBoundary，Vue需要安装错误处理器，特殊业务错误也需要手动上报。

### 1.4 为什么不直接使用 Sentry

错误回答是“因为 Sentry 配置复杂，所以我做了一个更好的替代品”。当前项目远达不到替代成熟平台的程度。

更稳妥的回答：

> Sentry 是成熟方案，能力和生产治理都远强于这个练习项目。我做这个项目不是为了替代 Sentry，而是为了亲自走通前端监控的核心链路，理解错误如何采集、统一建模、可靠上报、服务端聚合、Source Map 还原和可视化。自己实现后，我也更能理解成熟平台为什么需要采样、幂等、权限和数据治理。

### 1.5 四个运行单元的职责

| 单元 | 职责 | 不负责什么 |
|---|---|---|
| React Demo | 模拟真实被监控业务，制造错误、慢请求和长任务 | 不负责分析和存储监控数据 |
| 浏览器 SDK | 采集、标准化、面包屑、排队和上报 | 不负责长期存储和大规模聚合 |
| Express + MongoDB | 校验、脱敏、Source Map还原、幂等、聚合、查询 | 不直接控制业务页面 |
| React Dashboard | 调用查询API并展示错误、性能和慢接口 | 不直连数据库，不在浏览器计算全部大数据 |

### 1.6 完整架构

```text
被监控Web应用
  → init(options)
  → YuanMonitor / MonitorCore
  → ErrorCollector / PerformanceCollector / BehaviorCollector
  → EventBus同步发布
  → DataReporter统一事件模型
  → 客户端短窗口合并
  → 内存队列：数量阈值 + 时间阈值
  → Fetch / Beacon上报
  → POST /api/report
  → Express JSON解析与批次校验
  → 每条事件结构校验
  → 服务端二次脱敏
  → Source Map增强解析（错误事件）
  → MonitorEvent按eventId幂等写入
  → ErrorGroup按fingerprint聚合
  → 查询API与MongoDB聚合
  → React + Ant Design + ECharts展示
```

---

## 2. 项目介绍口述稿

### 2.1 60秒版本

> 我做的是一个前端监控 SDK 和可视化分析平台。浏览器端通过错误、性能和行为采集器，覆盖 JavaScript错误、Promise异常、资源失败、React/Vue框架错误、Web Vitals、Long Task、资源耗时以及Fetch/XHR请求。各采集器只负责采集并通过EventBus发布，DataReporter再将数据包装为统一MonitorEvent，加入内存队列，按数量或时间批量发送，页面卸载时使用Beacon兜底。
>
> 服务端使用Express和MongoDB完成结构校验、二次脱敏、eventId幂等写入和fingerprint错误聚合，并计算性能分位数和慢接口排行。针对生产压缩堆栈，我还按照appKey、环境、release和生成文件匹配Source Map，在服务端还原源码位置。最后通过React控制台展示错误现场、面包屑、性能趋势和慢接口，从采集到分析形成完整闭环。

### 2.2 3至5分钟版本

> 这个项目的背景是线上问题难复现。用户只说页面崩溃或卡顿时，开发者通常缺少错误堆栈、用户操作轨迹和当时的运行环境。因此我把系统拆成浏览器SDK、Express服务端、MongoDB和React控制台四部分。
>
> SDK入口通过init创建核心实例，根据配置启动错误、性能和行为采集器。错误部分用window.onerror、unhandledrejection和捕获阶段的error事件覆盖JS、Promise和资源错误；React使用ErrorBoundary，Vue使用errorHandler。行为部分通过document事件代理记录点击，并包装History、Fetch和XHR获得路由及请求轨迹。性能部分用web-vitals采集FCP、LCP、CLS、INP和TTFB，用PerformanceObserver补充Long Task与Resource Timing。
>
> 采集器不直接依赖上报器，而是通过同步EventBus发布事件。DataReporter订阅后创建统一MonitorEvent，补充eventId、appKey、environment、release、sessionId、pageUrl和runtime等公共字段。错误会生成fingerprint，在仍位于队列且命中5秒窗口时合并。队列达到5条立即发送，否则5秒后发送，最大长度20条；页面隐藏或pagehide时优先Beacon。网络错误、408、429和5xx会有限重试，默认是首次外再试3次，间隔1、2、4秒。
>
> 服务端先验证批次和事件结构，再二次脱敏，随后对错误进行Source Map还原。原始stack始终保留，还原结果作为resolvedStack附加；解析失败不会阻断事件落库。MonitorEvent按eventId幂等写入，ErrorGroup再按appKey、environment和fingerprint聚合同类错误。
>
> React控制台通过API查询服务端已经分页和聚合的数据，展示错误组、单次错误现场、面包屑、Web Vitals的P75/P95趋势以及慢接口排行。这样既能看一个具体用户当时发生了什么，也能看哪类问题最频繁、哪些性能指标最差。
>
> 项目目前完成了23个测试套件、164个测试，并真实验证过MongoDB持久化、重复eventId、慢接口、Long Task和生产Source Map还原。它仍是练习项目，没有告警、离线持久化、完整鉴权和大规模异步分析，所以我不会把它描述成生产级Sentry替代品。

---

## 3. 简历第一条：模块化架构与 EventBus

### 3.1 简洁理解

Collector负责“看见数据”，EventBus负责“传递数据”，DataReporter负责“统一处理并发送数据”。模块之间只依赖事件协议，不直接互相调用。

### 3.2 初始化链路

```text
业务调用 init(options)
  → 创建 YuanMonitor 单例
  → 构造 MonitorCore、各 Collector、DataReporter和框架集成
  → setupEventListeners()注册订阅
  → instance.init()
  → MonitorCore.init()
  → 发布 core:initialized
  → 各模块分别 init()
```

先注册订阅再启动Core，可以避免初始化事件已经发出但没有订阅者的问题。

### 3.3 为什么不用 Collector 直接调用 Reporter

直接调用并非不能工作，但会产生紧耦合：

```text
ErrorCollector
  → DataReporter
  → Session模块
  → 日志模块
  → 未来其他处理模块
```

当订阅者变化时需要回到采集器修改，采集器同时承担采集和业务编排职责。使用EventBus后：

```text
ErrorCollector → emit('error:captured', data)
DataReporter   → on('error:captured', handler)
其他模块       → 按需订阅
```

采集器只知道事件名和数据协议，不知道有多少消费者。

### 3.4 EventBus的当前机制

- `on(event, callback)`：订阅，保存回调。
- `emit(event, ...args)`：同步、按注册顺序执行回调。
- `off(event, callback)`：取消指定订阅。
- `once()`：包装一次性回调。
- `clear()`：清空所有事件。
- 每个回调都有 `try/catch`，一个订阅者报错不会阻止后续订阅者。
- 当前还支持同步返回值，用于获取 `sessionId`、用户数据和面包屑。

### 3.5 同步EventBus的优缺点

优点：实现简单、时序清晰，错误发生后Reporter能立即接收并入队，获取面包屑时也可同步返回。

代价：

- 慢订阅者会阻塞发布者和主线程。
- 订阅顺序可能影响行为。
- 不自动处理背压和异步任务。
- 字符串事件名缺少编译期约束。
- 全局单例若生命周期处理不好，测试和多实例可能互相影响。

若系统扩大，可增加事件常量、类型约束、优先级、异步任务队列，或将关键数据流改为显式管道。

### 3.6 为什么 destroy 很重要

SDK会修改全局环境，`destroy()`必须：

- 恢复 `window.onerror`、`window.onunhandledrejection`。
- 移除资源、点击、路由、pagehide等监听器。
- 恢复 `history.pushState/replaceState`。
- 恢复 `fetch` 和 XHR原型方法。
- 断开PerformanceObserver。
- 清理timer和interval。
- 取消EventBus订阅并清空状态。

否则热更新、微前端卸载或重复初始化时会多次采集、重复上报并泄漏资源。

### 3.7 配置开关不等于真正按需打包

当前配置可以关闭某个模块的运行：

```js
performance: { enable: false }
```

但 `src/index.js` 仍静态引入并创建这些模块，因此关闭后主要减少运行时开销，不一定显著减少包体积。真正的按需构建需要：

- 将功能拆为独立入口或插件包。
- 业务只导入需要的插件。
- 使用ES Module静态结构支持Tree Shaking。
- 确保模块没有妨碍摇树的副作用。

因此简历写“配置开关按需启用”是准确的，不能说成“已经实现插件化按需打包”。

### 3.8 为什么 SDK 用 JavaScript + Webpack

项目基于原仓库的JavaScript和Webpack继续增量完善，没有为追求技术栈统一而整体迁移TypeScript。这样能在有限时间内聚焦监控主链路，并保持原有测试和文档可对应。

Webpack用于输出UMD库，便于CommonJS、AMD和全局变量等接入方式，并将React、rrweb设为external。React Demo与Dashboard使用Vite，是因为它们是应用而不是库，开发启动和热更新更直接。

TypeScript能提升配置、事件协议和插件接口的类型安全，是后续合理演进，但不能说当前SDK已经使用TypeScript。

### 3.9 面试回答

> 我把采集器和上报器通过EventBus解耦。采集器只负责监听浏览器API、格式化最原始数据并发布事件；DataReporter订阅错误、性能和行为事件，统一补充公共字段、去重、入队和发送。这样增加新的消费者时不需要修改采集器。当前EventBus是同步发布，为每个订阅者做了异常隔离，优点是时序简单，但慢订阅者可能阻塞主线程，因此我会要求订阅回调只做轻量处理，把重任务放到异步链路。配置开关目前是运行时按需启用，不等于Tree Shaking或真正插件化。

### 3.10 高频追问

**问：EventBus是不是一定比直接调用好？**

不是。模块很少、调用关系固定时直接依赖更清晰；当一条事件需要多个独立消费者且经常扩展时，发布订阅更合适。代价是链路变隐式、调试困难和顺序依赖风险。

**问：一个订阅者报错会怎样？**

当前 `emit` 对每个回调单独 `try/catch`，会记录警告并继续执行后续订阅者，不让监控模块的错误扩大到整个SDK。

**问：为什么保存 bind 后的函数？**

`bind()`每次都会创建新函数。订阅和取消订阅若分别调用 `bind()`，引用不同，`off()`无法移除原回调，所以DataReporter保存 `_boundHandlers`。

---

## 4. 简历第二条：异常、请求和行为采集

### 4.1 错误采集覆盖

| 类型 | 捕获入口 | 主要信息 | 边界 |
|---|---|---|---|
| JS运行时错误 | `window.onerror` | message、source、line、column、stack | 跨域脚本未配置CORS可能只有`Script error.` |
| Promise未处理异常 | `window.onunhandledrejection` | reason、message、stack | 已被业务catch的拒绝不会触发 |
| 资源加载失败 | 捕获阶段 `error` 监听 | tagName、resourceUrl、outerHTML | 主要覆盖SCRIPT/LINK/IMG |
| React错误 | ErrorBoundary的`componentDidCatch` | JS stack、componentStack | 不捕获普通事件处理器、任意异步回调、边界自身错误 |
| Vue错误 | Vue 2/3的`errorHandler` | message、stack、componentName、info | 当前真实E2E证据弱于React |
| 业务错误 | `monitor.reportError()` | error、context | 由业务判断网络成功但业务失败等场景 |

### 4.2 `throw new Error()`到底由谁捕获

- 普通同步代码中抛出且未捕获：通常进入 `window.onerror`。
- Promise链或async函数中的未处理拒绝：进入 `unhandledrejection`。
- React组件渲染、构造或生命周期中的错误：最近的ErrorBoundary处理。
- React点击事件处理器中直接抛出的错误：ErrorBoundary通常不负责，可能进入全局错误链路。

不能只看 `throw` 关键字判断错误类型，必须看它发生在哪个执行上下文以及有没有被处理。

### 4.3 为什么资源错误使用捕获阶段

资源加载错误不会像普通冒泡事件一样可靠冒泡到window，因此通过：

```js
window.addEventListener('error', handler, true)
```

在捕获阶段提前拿到事件，并通过 `event.target` 判断是SCRIPT、LINK还是IMG。`window.onerror`和捕获阶段的`error`监听作用不同，不能相互替代。

### 4.4 React的两个堆栈

- `error.stack`：JavaScript调用堆栈，适合结合Source Map定位源码。
- `errorInfo.componentStack`：React组件树层级，适合判断错误出现在什么组件关系中。

两者应该同时展示，而不是用其中一个覆盖另一个。

### 4.5 统一事件模型

不同采集器的特征字段不同，但公共字段统一：

```js
{
  eventId,
  eventType,      // error / performance / behavior
  subType,        // js / promise / resource / click / web-vital ...
  appKey,
  environment,
  release,
  sessionId,
  userId,
  userData,
  timestamp,
  pageUrl,
  runtime,
  data,
  breadcrumbs
}
```

统一模型的价值：

- Reporter可以用同一协议排队和上报。
- 服务端可以统一校验、存储和分页。
- MongoDB可按公共字段建立索引。
- Dashboard可共享项目、环境和时间筛选。
- 各类特征信息仍放在 `data` 中，不强行使用完全相同的字段。

### 4.6 eventId、sessionId和fingerprint

- `eventId`：一次具体事件的唯一标识。不同发生通常有不同eventId；重试同一批数据保持不变。
- `sessionId`：一次用户会话，可关联同一访问过程中的点击、路由、请求和错误。
- `fingerprint`：一类相同错误的稳定标识，用于短窗口合并和服务端聚合。

项目按错误类型提取相对稳定特征：

- JS：错误类型、message、source、line、column。
- Promise：message和首个有效业务堆栈帧。
- Resource：tagName和去掉查询参数后的资源URL。
- React：message和首个组件。
- Manual：message和业务errorCode/code。

指纹是启发式规则，不保证永远完美：特征太少会误合并，特征太多又会把同一问题拆散。生产系统通常还允许业务自定义fingerprint。

### 4.7 三种“去重”不能混淆

| 机制 | 位置 | 标识 | 目的 |
|---|---|---|---|
| 客户端短窗口合并 | Reporter待发送队列 | fingerprint + 时间窗口 | 减少瞬时重复上报 |
| 服务端幂等写入 | MonitorEvent | eventId唯一索引 | 防止同一批重试重复落库 |
| 错误聚合 | ErrorGroup | appKey + environment + fingerprint | 统计同类错误发生次数 |

例子：两个不同eventId但fingerprint相同，会保存两条MonitorEvent，但只对应一个ErrorGroup，`occurrenceCount`增加到2。

### 4.8 点击行为和自动元素定位

SDK只在document上使用一次捕获阶段监听，通过事件代理覆盖动态节点。执行过程：

```text
用户点击图标或文字
  → event.composedPath() / event.target
  → 向上寻找最近的可交互元素
  → 生成selector
  → 脱敏和裁剪文本
  → 写入面包屑并发布behavior事件
```

选择器优先级大致为：

```text
data-monitor-id
→ data-testid
→ id
→ aria-label / name / role
→ class + nth-of-type
→ 向上拼接有限层级
```

这能降低业务手动绑定ID的要求，但不能声称CSS路径在动态DOM中永久唯一。列表插入、动态class、Shadow DOM和iframe都会影响稳定性。

### 4.9 面包屑

面包屑记录错误前最近的点击、路由和请求轨迹。当前使用数组加 `shift()` 模拟固定长度FIFO，默认最多20条：

- 新行为从尾部加入。
- 超过上限删除最旧记录。
- `getBreadcrumbs()`返回浅拷贝，避免外部直接修改内部数组。

它只能提供排查线索，不能单独证明根因。保存无限行为会增加内存、网络和存储压力，也降低排查信噪比。

### 4.10 SPA路由监控

SPA调用 `pushState/replaceState` 不会触发页面重新加载，也没有原生统一的“路由改变”事件，因此SDK包装这两个方法，并监听：

- `pushState`：新增历史记录。
- `replaceState`：替换当前历史记录。
- `popstate`：浏览器前进后退。
- `hashchange`：hash变化。

包装时必须保存原方法、保留 `this`、参数和返回值，先调用原方法再记录实际URL，并在destroy时恢复。

### 4.11 Fetch劫持

执行链：

```text
业务调用fetch
  → SDK记录开始时间并调用原始fetch
  → resolve：读取status/ok，记录耗时，返回原Response
  → reject：记录network错误，再把原错误throw给业务
```

关键边界：

- HTTP 500代表服务器已经响应，Fetch Promise通常仍然resolve，需要检查 `response.ok/status`。
- 断网、DNS失败等没有正常Response，会进入catch。
- SDK不能为了监控主动把500改成reject，否则会改变业务原有语义。
- SDK不调用 `response.json()`，否则可能消费响应体；本项目只读取元数据并把原Response交还业务。
- 调用原生fetch时保留window上下文，避免 `Illegal invocation`。

### 4.12 XHR劫持

- 包装 `open()` 保存method和URL。
- 包装 `setRequestHeader()`仅用于识别内部标记。
- 在 `send()` 时开始计时，因为send才真正发起请求。
- 监听 `load/error/abort/timeout`，区分HTTP、网络、取消和超时。
- destroy时恢复原型方法。

### 4.13 如何避免SDK捕获自己的上报

如果 `/api/report` 也被Fetch/XHR采集，会形成：

```text
上报 → 被采集 → 产生新事件 → 再上报 → 请求风暴
```

当前双重过滤：

- Fetch正常上报增加 `X-SDK-Internal: true`。
- 同时过滤配置的 `serverUrl/api/report` 和 `/api/session-replay`。

只依赖Header不够，因为Beacon不能自由添加自定义Header；只依赖URL也要处理相对地址、代理和多上报域名。

### 4.14 隐私与数据最小化

默认不采集完整请求头、请求体和响应体，只记录定位问题所需的method、URL、status、elapsedTime、success和errorType。

客户端清洗：

- password、token、authorization、cookie、secret等字段替换为`[MASKED]`。
- 手机号、邮箱、身份证号按规则遮盖。
- URL查询参数按字段名脱敏。
- 限制字符串、数组和嵌套深度。
- 支持ignoreUrls，业务请求继续执行但不产生监控记录。

服务端仍会二次脱敏，因为客户端代码可被绕过、旧SDK可能漏规则、攻击者也可以直接调用上报API。脱敏只能降低泄露风险，不能替代HTTPS、权限、审计和数据保留策略。

### 4.15 面试回答

> 错误采集不是只依赖window.onerror。我分别用window.onerror处理运行时错误，用unhandledrejection处理未消费的Promise拒绝，用捕获阶段的error事件处理SCRIPT、LINK、IMG资源失败，React通过ErrorBoundary，Vue通过errorHandler接入。不同错误先提取可序列化字段，再包装成统一MonitorEvent并生成fingerprint。
>
> 请求监控通过包装Fetch和XHR实现，但必须保证监控对业务透明：保留this、参数、返回Response和reject语义，HTTP 500只记录为HTTP失败，不擅自改变成网络异常；网络异常记录后继续抛给业务。SDK还通过内部Header和上报URL过滤自身请求，避免递归上报。

---

## 5. 可靠上报：简历中“可靠上报”的实现依据

### 5.1 为什么不每条立即发送

每条事件单独请求会增加网络握手、请求头、浏览器连接和服务端处理开销。项目使用内存队列做削峰：

- `batchSize = 5`：达到5条立即发送。
- `batchInterval = 5000`：未满5条时，5秒后发送已有事件。
- `maxQueueSize = 20`：达到最大队列长度立即刷新，限制内存增长。
- 同一队列只保留一个定时器；数量触发后清掉旧定时器。

这三个配置解决不同问题，不能只用其中一个代替全部。

### 5.2 页面关闭时为什么用Beacon

普通Fetch可能在页面卸载时被取消。项目监听 `visibilitychange` 和 `pagehide`，若队列仍有数据则优先 `sendBeacon()`。

Beacon的优点：浏览器负责在页面生命周期结束时异步发送，调用不会阻塞卸载。

边界：

- 不能自由添加自定义Header。
- 调用方看不到普通HTTP响应。
- 浏览器有负载和队列限制。
- 返回true只表示浏览器接受发送任务，不保证服务端成功落库。
- Beacon不可用或返回false时，项目回退到 `fetch(..., { keepalive: true })`。

### 5.3 Image上报的边界

代码存在Image GET上报，但最终简历没有将“Fetch → Beacon → Image无损降级”作为卖点。Image受URL长度、GET语义、编码和服务端协议限制，也无法携带任意Header，不适合大批量事件。面试中将它描述为极端兼容思路，而不是与Fetch等价的可靠主通道。

### 5.4 哪些失败应该重试

- 网络异常、408、429、5xx：可能是临时故障，可以有限重试。
- 400、401、403、404、422：通常是数据、鉴权、权限或地址问题，重复相同请求不会自动恢复，不盲目重试。
- 202：本项目表示批次部分成功，仍属于 `response.ok`，不重试整个批次，避免重复发送已成功事件。

### 5.5 指数退避

`retryCount = 3` 表示首次请求之外最多再试3次，总共最多4次；当前间隔为1秒、2秒、4秒。

重试复用同一份序列化字符串，避免重新包装导致数据膨胀，并保持eventId不变以配合服务端幂等。

生产环境还应加入随机抖动jitter，避免大量客户端在相同时间同时重试；还可读取429的 `Retry-After`。

### 5.6 当前可靠性边界

- 内存队列在标签页崩溃、进程终止或长时间离线时会丢失。
- 没有IndexedDB离线恢复队列。
- 没有跨标签页协调和配额治理。
- Beacon和重试都只能提高送达概率，不能承诺绝对不丢。

### 5.7 面试回答

> 我把可靠上报拆成削峰、卸载兜底、失败重试和服务端幂等四层。客户端先用内存队列按5条或5秒批量发送，页面隐藏或pagehide时优先Beacon，失败再回退keepalive Fetch。对网络异常、408、429和5xx做有限指数退避，400等确定性错误不盲目重试。重试复用同一序列化批次并保持eventId稳定，服务端使用唯一索引保证不会重复落库。这个设计能提高可靠性，但当前没有IndexedDB离线队列，因此不能保证完全不丢。

---

## 6. 简历第三条：Source Map源码还原

### 6.1 为什么需要Source Map

生产构建经过压缩后，堆栈可能只有：

```text
index-HeplAP1C.js:9:37655
```

Source Map建立“生成代码行列位置 → 原始源码行列位置”的映射，使服务端可以还原为：

```text
../../src/App.jsx:23:12
```

### 6.2 为什么在服务端解析

- 避免将Map和源码内容公开给所有浏览器。
- 避免把 `source-map` 解析成本和依赖加入SDK。
- 服务端可以集中管理release、缓存、权限和失败重试。
- 不同客户端保持轻量，只上传原始事实。

SDK只负责采集原始stack、行列号以及 `appKey + environment + release`。

### 6.3 sdkVersion与release

- `sdkVersion`：监控SDK自身版本。
- `release`：被监控业务应用的本次构建版本。

即使SDK版本不变，只要业务重新构建且产物发生变化，就应该使用新的release。否则相同文件名可能对应不同代码布局，Source Map会还原到错误位置，而且结果可能看似合理，风险比“明确失败”更高。

### 6.4 为什么匹配四个字段

SourceMapArtifact唯一键：

```text
appKey + environment + release + generatedFile
```

- appKey隔离不同应用。
- environment隔离production、staging等环境。
- release隔离不同业务构建。
- generatedFile找到堆栈中的具体产物。

### 6.5 完整链路

```text
Vite生产构建，生成hidden Source Map
  → 上传脚本扫描dist中的.js.map
  → POST /api/source-maps
  → 校验appKey/environment/release/maps
  → MongoDB按四字段upsert SourceMapArtifact
  → 上传成功后从公开dist删除.map

浏览器发生生产错误
  → SDK上报原始stack + release
  → 服务端解析V8 stack帧
  → 按四字段查找Map
  → SourceMapConsumer.originalPositionFor()
  → 原始stack保留
  → resolvedStack和symbolication附加
  → MonitorEvent/ErrorGroup保存
  → Dashboard同时展示压缩位置与源码位置
```

### 6.6 hidden Source Map

Demo使用 `sourcemap: 'hidden'`：构建会生成独立 `.map` 文件，但生产JS末尾不写公开的 `sourceMappingURL`。上传成功后脚本删除公开dist中的Map，降低源码被直接下载的风险。

这并不等于完整安全：上传接口仍需要鉴权，Map应放受控存储并设置生命周期、访问审计和权限隔离。

### 6.7 解析失败为什么不能阻断主链路

Source Map是增强能力，原始错误才是主数据。服务端对每条事件解析时内部捕获Map缺失或损坏：

- `resolved`：全部可解析帧成功。
- `partial`：只有部分帧成功。
- `map_not_found`：没有匹配Map。
- `failed`：Map已匹配但内容损坏或解析失败。
- `missing_release`：事件缺少业务版本。
- `no_frames`：堆栈中没有识别到可映射帧。

无论增强状态如何，原始 `data.stack` 都保留，事件仍可落库。这里普通 `Promise.all` 不是天然异常隔离，安全的前提是每个解析任务内部不再把可预期错误reject出去。

### 6.8 真实证据

真实Vite生产构建中：

- release：`react-demo@1.0.0+source-map-e2e-20260810-1`。
- 浏览器原始位置：`index-HeplAP1C.js:9:37655`。
- 服务端还原位置：`../../src/App.jsx:23:12`。
- Dashboard展示状态：`resolved`，进度 `1/1`。

### 6.9 面试回答

> 线上压缩堆栈无法直接定位源码，所以我让SDK只采集原始stack、appKey、environment和release。构建阶段生成hidden Source Map，通过脚本上传到服务端，并以appKey、环境、release和生成文件作为唯一匹配条件。服务端解析V8堆栈帧，再通过SourceMapConsumer把生成代码行列映射到源码位置。
>
> 我始终保留原始stack，把还原结果追加为resolvedStack；Map缺失或损坏只记录解析状态，不阻断错误落库。真实生产构建中，我把`index-HeplAP1C.js:9:37655`还原到了`src/App.jsx:23:12`，并在Dashboard同时展示两种位置。

### 6.10 高频追问

**问：为什么不能只按文件名找Map？**

不同项目、环境和构建版本可能生成相同文件名，只按文件名可能静默映射到错误源码。

**问：相同四字段再次上传怎样处理？**

使用upsert更新原记录；release不同则保存为独立记录。

**问：为什么不覆盖原始stack？**

原始stack是浏览器上报事实，还原算法或Map可能失败。附加结果便于审计、降级和重新解析。

**问：Source Map链路还缺什么生产能力？**

上传鉴权、项目权限、对象存储、缓存、异步解析队列、Map清理策略、审计和多浏览器堆栈格式支持。

---

## 7. 简历第四条：Web Vitals与性能分析

### 7.1 五个指标

| 指标 | 简洁含义 | 主要定位方向 |
|---|---|---|
| TTFB | 导航开始到收到响应首字节 | 服务端处理、网络和缓存 |
| FCP | 页面第一次绘制文本、图片等内容 | 初始内容出现速度 |
| LCP | 视口内最大主要内容元素完成绘制 | 主内容加载体验 |
| CLS | 页面生命周期内意外布局偏移 | 图片无尺寸、异步插入、字体等 |
| INP | 用户交互到下一帧呈现的响应延迟 | 输入等待、事件处理、渲染与绘制 |

注意：TTFB不是“首个字节绘制”；FCP不是“页面全部加载完成”；LCP可能在加载过程中出现多个候选值，库最终报告稳定结果；CLS是无单位分数；INP不是接口总耗时。

### 7.2 为什么使用web-vitals，而不是全部手写

Web Vitals底层仍依赖Performance相关API，但官方库处理了指标定义、候选更新、页面生命周期和浏览器差异。手写可以学习原理，却容易在CLS会话窗口、LCP最终值、INP交互聚合等细节上出错。

项目通过动态导入降低主入口负担；加载失败时只放弃Vitals，不让整个SDK崩溃。

### 7.3 PerformanceObserver补充什么

- `resource`：图片、脚本、样式等资源的duration、transferSize、缓存和协议。
- `longtask`：主线程持续超过约50ms的任务，记录startTime、duration和有限attribution。

Fetch、XHR和Beacon从Resource Timing中过滤，因为请求劫持已经记录业务请求，避免同一请求产生两类重复事件。

### 7.4 Long Task到底是什么

浏览器主线程一次只能执行一个任务。JavaScript、事件回调、React更新、样式计算、布局和部分绘制准备都可能占用主线程。单个任务超过50ms，就会被Long Tasks API记录。

例如：

```text
点击
  → 同步计算180ms
  → React渲染30ms
  → 下一帧绘制
```

同步计算会形成Long Task，且本次交互的INP可能超过210ms。

但Long Task记录通常只能说明“什么时间阻塞了多久”，`attribution`常见为window或unknown，不能直接定位到源码某一行，也不能直接判断一定是某张图片或某个组件。

真实定位需要：

- 按sessionId和timestamp对齐点击、INP、Long Task和请求事件。
- 使用Chrome Performance主线程火焰图、Bottom-Up和Call Tree。
- React问题结合React DevTools Profiler。
- 对业务计算增加 `performance.mark/measure`。

Source Map不能自动还原Long Task，因为Long Task通常没有包含文件、行和列的错误堆栈。

### 7.5 INP与Long Task的关系

INP可粗略理解为：

```text
输入等待时间 + 事件处理时间 + 呈现延迟
```

Long Task如果覆盖了用户交互，可能让点击等待或延迟绘制，因此二者相关。但不能仅凭同一页面同时出现Long Task和差INP就断定因果，必须对齐发生时间。

网络慢也不一定直接导致INP差。若点击后立即绘制Loading，再等待1200ms接口，INP可以很好；若接口返回后同步解析300ms并渲染5000个节点，则主线程任务和渲染更可能导致交互或页面卡顿。

### 7.6 Resource Timing、请求监控和Long Task的区别

| 数据 | 回答的问题 |
|---|---|
| Resource Timing | 哪个图片、脚本或样式加载慢 |
| Fetch/XHR监控 | 哪个业务接口耗时、状态和失败类型是什么 |
| Long Task | 主线程在什么时候被长时间占用 |
| Web Vitals | 用户感知到的加载、稳定和交互质量如何 |

定位问题时需要组合证据，不是找到一个指标就完成根因分析。

### 7.7 P75、P90、P95和平均值

- 平均值容易被极端值影响，也可能掩盖少部分严重用户。
- P75表示大约75%的样本不超过该值。
- P95更关注尾部较慢用户。
- 分位数必须结合count；样本很少时P95可能接近最大值，代表性弱。

本项目服务端计算count、average、min、max、P75、P90和P95。性能趋势按时间范围动态分桶：24小时内按小时，31天内按天，更长按周。

Overview回答“整个时间范围的总体分布”，Trends回答“指标随时间如何变化”，不能用一个总体P75直接画出七天趋势。

### 7.8 面试回答

> 性能部分我用web-vitals采集FCP、LCP、CLS、INP和TTFB，再用PerformanceObserver补充Long Task和静态资源耗时。请求类资源由Fetch/XHR劫持单独记录，因此在Resource Timing里过滤，避免重复。
>
> 分析时我不会只看平均值，而是结合count、P75和P95。比如INP差且同时有Long Task，我只会认为可能相关，再按sessionId和时间对齐交互及长任务，并用Chrome Performance或React Profiler确认具体是同步计算、React渲染还是布局造成。当前Long Task只能定位阻塞时间段，不能直接给出源码行。

### 7.9 高频场景判断

- 白屏后很久才出现主要内容：结合FCP、LCP、TTFB和资源/请求链路。
- 页面元素突然挤动：CLS。
- 点击很久没有下一帧反馈：INP，结合Long Task和React渲染。
- 服务端很久才返回首字节：TTFB。
- 图片加载慢：Resource Timing。
- 接口返回慢：Fetch/XHR的elapsedTime。
- 接口100ms但返回后解析300ms、渲染5000项：重点看Long Task、INP、Chrome Performance和React Profiler，而不是优先看FCP/LCP。

---

## 8. 简历第五条：Express、MongoDB与React可视化

### 8.1 为什么选择Express

Express轻量、路由和中间件模型简单，足够承载练习项目的接收、校验和查询API，且便于理解请求从入口到Repository的链路。

NestJS能提供依赖注入、模块和更强约束，适合较大团队，但当前规模会增加学习和样板成本。选择Express是范围取舍，不代表它比NestJS普遍更好。

### 8.2 为什么选择MongoDB

错误、性能和行为事件都有统一公共字段，但 `data` 内部结构差异较大。MongoDB文档模型适合保存这类半结构化事件，Mongoose则提供Schema、索引和查询封装。

代价是Mixed字段内部约束较弱，因此必须通过服务端Validator、Sanitizer和测试补足。MySQL也能做，但动态事件字段可能需要JSON列或拆多张表；若业务强事务和复杂关系查询更多，关系数据库可能更合适。

### 8.3 服务端请求链路

```text
POST /api/report
  → express.json({ limit: '1mb' })
  → extractMonitorEvents检查外壳和批次上限50
  → validateMonitorEvent逐条检查字段
  → 无效事件进入rejected，有效事件继续
  → sanitizeMonitorEvent二次脱敏和裁剪
  → symbolicateMonitorEvent增强错误堆栈
  → storeMonitorEvents写MongoDB
  → 全部成功返回200，部分接收返回202，全部无效返回400
```

部分失败不应让其余合法事件全部丢失，因此批次外壳合法后采用逐条校验。

### 8.4 校验和脱敏不是一回事

- 校验：判断系统能否处理，例如eventId、eventType、subType、appKey、timestamp和data是否合法。
- 脱敏：在允许处理的数据中遮盖不应保存的信息。

顺序为基本结构校验 → 二次脱敏 → 持久化。服务端还限制对象键数量、数组长度、字符串长度、嵌套深度，并丢弃 `__proto__`、`prototype`、`constructor` 等危险键。

### 8.5 MonitorEvent与ErrorGroup

**MonitorEvent：** 保存一次具体现场，例如eventId、sessionId、页面、运行环境、data、breadcrumbs和resolvedStack。

**ErrorGroup：** 保存一类问题的统计视图，例如fingerprint、occurrenceCount、firstSeenAt、lastSeenAt和最近一次现场摘要。

只保存ErrorGroup会失去每次发生的现场；只保存MonitorEvent又很难快速判断哪个错误最频繁，所以需要“原始事件 + 聚合视图”。

### 8.6 eventId幂等

```js
MonitorEvent.updateOne(
  { eventId },
  { $setOnInsert: event },
  { upsert: true }
)
```

配合eventId唯一索引：

- 第一次事件插入成功，`upsertedCount === 1`。
- 同一eventId重试不会新增第二条。
- 只有首次插入才更新ErrorGroup，避免重复计数。

幂等解决的是“同一次请求重放”，不是同类错误聚合。

### 8.7 fingerprint错误聚合

ErrorGroup以 `appKey + environment + fingerprint` 为唯一键：

- `$inc`累加发生次数。
- `$min`维护首次发生时间。
- `$max`维护最近发生时间。
- `$set`更新最近一次eventId、sessionId、页面、runtime、data和breadcrumbs。

当前没有把release加入错误组唯一键，因此同一项目和环境的同类错误可跨版本累计，最近版本保存在latestRelease。若产品需要按版本区分影响，应在查询或模型设计中增加release维度。

### 8.8 查询和聚合为什么放服务端

Dashboard不应直连MongoDB：

- 暴露数据库凭据和网络入口，权限风险高。
- 前端可以绕过业务规则直接读写。
- 大量原始数据传到浏览器会增加网络、内存和渲染负担。
- 聚合规则会分散到不同页面，难以统一。

服务端先用 `$match` 筛选项目、环境、类型和时间，再用 `$group` 计算统计，只返回页面真正需要的结果。

### 8.9 核心查询API

- `GET /api/events`：统一原始事件分页。
- `GET /api/errors`：错误组列表和分页。
- `GET /api/errors/:id/events`：由服务端根据组ID关联原始事件。
- `GET /api/performance/overview`：Web Vitals分位数、Long Task和资源汇总。
- `GET /api/performance/trends`：按时间桶输出趋势。
- `GET /api/requests/slow`：按请求耗时倒序分页和筛选。

### 8.10 为什么React控制台通过API，而不重复处理原始数据

控制台负责交互和展示，服务端负责数据治理和聚合。React页面通过Axios调用API，拿到分页或汇总结果，再用Ant Design展示表格、抽屉、描述列表和时间线，用ECharts绘制趋势。

Axios公共实例负责baseURL、超时、成功解包和错误标准化；`monitorApi.js`只定义具体业务接口，职责分开，避免一个文件同时承担传输细节和业务API。

### 8.11 全局状态与局部状态

Zustand保存多个页面共享的：

- appKey
- environment
- timeRange

页面自己的items、loading、error、page、selectedEvent留在局部state。共享状态变化后，useEffect重新请求。

时间范围在store中保存“7d”等意图，请求时再按当前 `Date.now()`计算startTime/endTime，避免长期保存已经过期的绝对时间戳。

### 8.12 AbortController解决什么

快速切换筛选条件时，旧请求可能晚于新请求返回并覆盖UI。Effect为每轮请求创建AbortController，清理函数中abort上一轮等待。

它可以取消浏览器/Axios继续等待并避免旧响应更新当前页面，但不保证已经进入Express或MongoDB的查询立即停止。

### 8.13 错误页的数据层次

- 外层ErrorGroup列表：看错误类型、指纹、次数、首次/最近发生。
- 内层MonitorEvent详情：看某次事件的原始stack、React组件栈、runtime、页面、release、Source Map结果和breadcrumbs。

错误详情只传groupId，服务端负责按group的appKey、environment和fingerprint关联事件，避免前端拼错条件。

### 8.14 性能趋势与ECharts生命周期

React先获取overview和trends。ECharts组件：

- DOM挂载后 `echarts.init()`。
- 数据变化时复用实例 `setOption()`。
- ResizeObserver触发 `resize()`。
- 卸载时断开observer并 `dispose()`。
- 更新使用 `notMerge: true`，避免旧series残留。

当前Dashboard包体较大，主要来自Ant Design和ECharts，后续应使用路由懒加载、按需拆分和包体分析；不能把控制台体积与SDK轻量体积混为一谈。

### 8.15 面试回答

> 服务端接收批次后先校验外壳和每条MonitorEvent，再做二次脱敏，然后对错误执行Source Map增强，最后写MongoDB。MonitorEvent按eventId唯一索引幂等写入，只有首次插入才按appKey、environment和fingerprint更新ErrorGroup，这样既保存单次现场，又能统计同类错误影响。
>
> Dashboard不直连数据库，而是调用服务端已经分页和聚合的API。全局筛选放Zustand，页面列表和loading等放局部state；快速切换筛选时使用AbortController降低旧响应覆盖新UI的竞态。错误页展示错误组和具体事件，性能页展示P75/P95趋势，慢接口页按elapsedTime倒序并区分成功但慢与请求失败。

---

## 9. 两条必须能盲讲的端到端链路

### 9.1 一条React生产错误

```text
React子组件渲染抛错
  → 最近ErrorBoundary.componentDidCatch(error, errorInfo)
  → 发布 error:captured
  → DataReporter提取message/stack/componentStack
  → 查询最近breadcrumbs
  → 创建统一MonitorEvent
  → 生成fingerprint
  → 客户端队列短窗口合并
  → 5条或5秒触发Fetch上报
  → Express解析、校验、二次脱敏
  → 根据appKey/environment/release/generatedFile查Source Map
  → 保留原stack并追加resolvedStack
  → MonitorEvent按eventId幂等写入
  → ErrorGroup按fingerprint累计
  → Dashboard错误组列表
  → 打开Drawer查看具体事件、两类堆栈、Source Map和面包屑
```

### 9.2 一次慢接口与交互排查

```text
用户点击按钮
  → document事件代理记录click面包屑和selector
  → 业务调用fetch
  → SDK包装器记录开始时间
  → 原fetch返回Response
  → 记录status/ok/elapsedTime/errorType
  → 生成behavior:fetch统一事件并上报
  → MongoDB保存
  → /api/requests/slow按elapsedTime筛选、排序和分页
  → Dashboard展示慢请求汇总、排行与详情
```

如果同时出现差INP和Long Task，只能认为存在关联，再按sessionId和timestamp对齐点击、请求、Long Task及性能事件，并用Performance工具确认根因。

---

## 10. 项目中真实遇到的问题与解决过程

### 10.1 Fetch出现Illegal invocation

**现象：** 队列能入队，但 `/api/report` 没有真正发送，随后页面经过一段时间崩溃。

**排查：** 逐步关闭Session Replay、Performance和serverUrl做对照，确认采集本身正常，故障在上报阶段。最终发现保存的原生fetch脱离window上下文调用。

**原因：** 某些浏览器原生方法依赖正确调用上下文。

**修复：** 使用 `originalFetch.call(window, input, config)`，并补回归测试。

**面试价值：** 劫持原生API不仅要记录数据，还必须保留this、参数、返回值和异常语义。

### 10.2 重试数据不断膨胀并接近无限重试

**现象：** 页面约几十秒后崩溃，上报数据被反复包装。

**原因：** 失败后把已序列化上报信封重新传入高层report，再次包装；重试次数状态也没有正确沿调用链传递。

**修复：** 重试复用同一份序列化数据，显式传递retryAttempt，达到上限后停止。

**面试价值：** 可靠性代码本身也可能制造故障；重试必须有次数、退避、稳定幂等键和相同载荷。

### 10.3 Source Map不应继续在浏览器异步解析

**问题：** 旧SourceMapParser订阅顺序和异步处理无法保证DataReporter入队前完成，还会把解析依赖带入浏览器。

**解决：** SDK只上报原始stack和release，把Map匹配及解析统一移到服务端，在校验和脱敏之后、落库之前完成。

**结果：** 职责更清晰，SDK包更小，解析失败也能集中隔离。

### 10.4 Resource与Long Task支持判断错误

**问题：** 旧代码错误使用不存在的能力字段以及数组 `in` 判断。

**解决：** 使用 `PerformanceObserver.supportedEntryTypes.includes()`，优先 `{type, buffered:true}`，不支持时回退 `{entryTypes}`。

### 10.5 FID过时

**问题：** 原项目仍把FID作为核心交互指标。

**解决：** 升级为INP，并在服务端与Dashboard按统一name聚合和展示。

### 10.6 Dashboard旧响应覆盖新筛选

**风险：** 用户快速切换项目、环境或时间范围时，早发出的请求可能晚返回。

**解决：** 每轮Effect创建AbortController，清理上一轮；筛选变化时页码归一为1。

### 10.7 Source Map版本错配风险

**问题：** 只按文件名或SDK版本找Map可能匹配到其他业务构建。

**解决：** 引入业务release，并按appKey、environment、release、generatedFile精确匹配；不同构建使用不同release。

---

## 11. 技术选型对比速查

### EventBus vs 直接调用

- 多消费者、希望解耦：EventBus更合适。
- 关系固定、调用链短：直接调用更显式。
- 当前选择EventBus，但承担隐式依赖、同步阻塞和字符串协议成本。

### JavaScript vs TypeScript

- 当前沿用原仓库JS，降低重构风险，聚焦两周主链路。
- TS更适合长期维护事件协议和配置，属于后续演进。

### Webpack vs Vite

- SDK使用Webpack输出UMD库和externals。
- Demo/Dashboard使用Vite获得快速应用开发体验。
- 不能简单说其中一个全面优于另一个。

### web-vitals vs 手写Performance API

- web-vitals负责标准指标细节和浏览器生命周期。
- PerformanceObserver补充Long Task和Resource Timing。
- 手写更可控但规范细节和维护成本更高。

### Fetch vs XHR

- 现代业务以Fetch为主，但仍劫持XHR覆盖旧库和Axios的XHR适配器场景。
- 两者错误语义不同，必须分别处理。

### Beacon vs Fetch keepalive

- Beacon适合卸载场景，但Header和响应能力有限。
- Fetch keepalive更接近普通请求但也有限制。
- 两者是能力不同的兜底，不是无损替换。

### MongoDB vs MySQL

- MongoDB适合统一外壳、内部结构多样的事件文档。
- MySQL适合强关系和事务，也可用JSON列实现，但建模方式不同。
- MongoDB Mixed仍需要应用层验证。

### Express vs NestJS

- Express轻量直观，适合当前规模。
- NestJS约束和模块化更强，适合大型服务，但样板和学习成本更高。

### Axios vs Fetch（Dashboard）

- Axios实例便于统一baseURL、超时、响应解包和错误标准化。
- Fetch原生且无额外依赖，但需要自行封装非2xx、超时和JSON处理。

### Zustand vs Context/Redux

- 当前只有少量跨页筛选，Zustand API简单且避免层层Provider。
- Context适合低频简单全局值，但频繁变化时需注意重渲染。
- Redux适合复杂可追踪状态，但当前规模成本偏高。

### ECharts vs纯表格

- 表格适合精确查看数值；ECharts适合看趋势和变化。
- 图表输入必须来自按时间桶聚合的数据，不能拿一个总体平均值伪造趋势。

---

## 12. 今天已覆盖内容的纠错清单

- 正确术语是INP，不是IMP。
- FCP是首次内容绘制，不是所有页面加载完成。
- TTFB是首字节响应时间，不是绘制时间，也不是TDFB/TTFP。
- Long Task超过约50ms，能说明阻塞时间段，通常不能直接定位源码行。
- INP差和Long Task多只表示可能相关，不自动证明因果。
- 网络1200ms但立即显示Loading，INP不一定差。
- 接口100ms、返回后同步解析300ms并渲染5000项，应重点看Long Task、INP、Performance和React Profiler，不优先看FCP/LCP。
- HTTP 500通常仍让Fetch resolve；断网等网络异常才reject。
- ErrorBoundary不捕获所有throw，是否捕获取决于发生上下文。
- `eventId`不是sessionId；eventId标识事件，sessionId标识会话。
- fingerprint相同不会“让fingerprint加一”；增加的是ErrorGroup的occurrenceCount。
- 配置关闭模块不是Tree Shaking，也不等于真正插件化。
- Sentry是参考和对比对象，不是当前项目能够替代的产品。
- rrweb未写在最终简历中，不纳入本次五条主线复习。

---

## 13. 今天没有逐题问到但简历很容易被追问的内容

### 13.1 跨域脚本为什么只有Script error

跨域脚本若没有正确设置资源端CORS响应头并使用合适的 `crossorigin`，浏览器出于安全原因可能隐藏详细错误，只暴露 `Script error.`。SDK不能凭空恢复浏览器未提供的信息。

### 13.2 采样率应该在哪里生效

采样可以在会话初始化阶段决定本次用户是否采集，避免同一会话中一会采一会不采。错误通常可配置更高采样率，性能和行为按成本降低。当前生产级稳定采样、服务端动态配置和用户一致性采样仍可继续完善。

### 13.3 为什么性能事件不复制完整面包屑

每条Resource或Long Task都复制20条面包屑会造成数据膨胀。当前错误事件携带有限面包屑；性能事件主要用sessionId和timestamp关联。生产系统可对异常性能事件只附最近少量交互。

### 13.4 为什么URL不能原样保存

URL可能含token、手机号、邮箱、搜索词和业务标识。项目保留定位需要的路径和普通参数，对敏感查询参数脱敏。更严格系统还会配置允许参数白名单或只保存模板化路由。

### 13.5 429应该怎样处理

429表示服务端限流，除指数退避外应优先读取 `Retry-After`，加入jitter，并考虑客户端采样、队列上限和服务端配额，避免重试进一步放大压力。

### 13.6 为什么appKey不是密钥

appKey用于区分被监控项目，会出现在浏览器中，不能当作秘密凭据。生产上报鉴权需要短期令牌、签名、同源代理、域名限制或其他可信机制。

### 13.7 CORS和CSRF的区别

CORS限制浏览器脚本读取跨源响应，不是CSRF防护。使用Cookie和`credentials`时，还需要SameSite、CSRF Token或Origin校验。当前本地服务使用明确CORS白名单，但还不是完整生产安全方案。

### 13.8 存储型XSS风险

错误message、URL、DOM文本和面包屑都是不可信数据，可能先进入MongoDB再在管理员Dashboard执行。React文本插值默认转义，不应随意使用 `dangerouslySetInnerHTML`；若展示HTML或Markdown，需要可靠的白名单清洗。

### 13.9 数据量扩大后怎么演进

- SDK端采样、限额、压缩和IndexedDB离线队列。
- 上报服务增加鉴权、限流、消息队列和异步消费。
- 热数据与冷数据分层，设置TTL和数据保留策略。
- 错误聚合与Source Map解析异步化。
- 分区/分片、索引审计和查询缓存。
- 告警基于频率、影响用户、版本变化和性能阈值，而不是每条事件触发。

回答时先说明这些是生产演进方案，不是当前已经实现。

---

## 14. 高频面试问答速记

### Q1：这个项目最核心的技术难点是什么？

不是某个API，而是保证监控“低侵入、可靠、可分析”：劫持浏览器API时不改变业务语义；统一事件后做队列、重试与幂等；最终把原始事件变成错误聚合、分位数和可视化排查结果。

### Q2：一条事件从哪里产生到哪里结束？

Collector采集 → EventBus发布 → DataReporter统一建模和入队 → Fetch/Beacon上报 → Express校验脱敏 → MongoDB幂等与聚合 → React Dashboard查询展示。

### Q3：为什么错误既要eventId又要fingerprint？

eventId识别一次事件，解决重试幂等；fingerprint识别一类错误，解决聚合分析。相同fingerprint的不同事件仍应保留不同eventId。

### Q4：为什么客户端去重后服务端还要幂等？

客户端只合并当前队列时间窗口内的同类错误，不能防止网络重试、多个标签页或恶意重复请求；服务端必须以eventId作为最终一致性防线。

### Q5：为什么错误聚合不能只保存count？

count只能判断频率，无法还原具体用户、页面、浏览器、堆栈和行为现场，所以同时保留MonitorEvent。

### Q6：Fetch 500为什么不进入catch？

Fetch只要取得了HTTP响应通常就resolve，500是HTTP层失败，不是网络层失败，需要检查response.ok/status。

### Q7：网络异常记录后为什么还要throw？

监控SDK不能吞掉业务本应感知的异常，否则会改变业务catch、降级和提示逻辑。

### Q8：点击元素怎样无侵入定位？

document事件代理拿到composedPath/target，向上归一到可交互祖先，再按稳定属性、语义属性、class和nth-of-type生成有限深度selector。它是排查线索，不保证动态DOM永久唯一。

### Q9：为什么只保留最近面包屑？

错误通常与最近操作最相关；固定长度FIFO限制内存和上报体积，提高信噪比。

### Q10：为什么页面关闭要Beacon？

普通请求可能被卸载取消，Beacon由浏览器在页面结束时异步调度。但它不能任意加Header、无法读取响应，也不保证服务端成功。

### Q11：为什么重试用指数退避？

固定间隔容易让大量客户端同步重试。指数退避降低请求频率；生产还应增加jitter和Retry-After。

### Q12：Source Map为什么必须有release？

同一业务不同构建的代码布局不同，只按文件名可能匹配错误Map。release将错误与构建产物绑定。

### Q13：为什么Source Map失败仍返回成功接收事件？

源码还原是增强能力，原始错误是主数据。失败只标记状态并保留原stack，不能让辅助链路阻断落库。

### Q14：INP差且Long Task多，能断定根因吗？

不能。先按session和时间对齐，确认Long Task覆盖慢交互，再用Performance火焰图和React Profiler定位。

### Q15：为什么不只看平均性能？

平均值可能掩盖尾部用户，需结合P75/P95和样本量；样本少时分位数也可能不可靠。

### Q16：为什么Dashboard不直连MongoDB？

安全、权限、数据量和规则统一。服务端先分页、筛选和聚合，只返回页面需要的数据。

### Q17：AbortController能取消数据库查询吗？

当前只能取消浏览器/Axios等待并阻止过期结果更新UI，不保证服务端已经开始的MongoDB操作立即停止。

### Q18：项目还能怎么改进？

真正插件包和Tree Shaking、IndexedDB离线队列、jitter、动态采样、告警、鉴权限流、数据生命周期、Source Map对象存储与异步解析、Dashboard分包和更完整E2E测试。

---

## 15. 代码定位地图

| 需求 | 文件 |
|---|---|
| SDK公共入口、init、destroy | `src/index.js` |
| 默认配置和开关 | `src/core/config.js` |
| EventBus | `src/core/eventBus.js` |
| 统一事件 | `src/core/eventBuilder.js` |
| 错误指纹 | `src/core/errorFingerprint.js` |
| 点击selector | `src/core/elementLocator.js` |
| 客户端隐私 | `src/core/privacyProcessor.js` |
| 错误采集 | `src/collector/errorCollector.js` |
| 性能采集 | `src/collector/performanceCollector.js` |
| 点击、路由、Fetch/XHR | `src/collector/behaviorCollector.js` |
| 队列、Beacon、重试 | `src/reporter/dataReporter.js` |
| React ErrorBoundary | `src/framework/reactIntegration.js` |
| Vue错误集成 | `src/framework/vueIntegration.js` |
| Express路由 | `test-server.js` |
| 服务端结构校验 | `server/eventValidator.js` |
| 服务端二次脱敏 | `server/eventSanitizer.js` |
| MongoDB模型 | `server/models/` |
| 幂等、聚合、分页和性能查询 | `server/repositories/monitorRepository.js` |
| Source Map上传校验 | `server/sourceMapValidator.js` |
| Source Map解析 | `server/sourceMapSymbolicator.js` |
| Source Map存取 | `server/repositories/sourceMapRepository.js` |
| Source Map构建上传 | `test-react-app/scripts/upload-source-maps.mjs` |
| Dashboard API | `monitor-dashboard/src/api/` |
| Dashboard全局筛选 | `monitor-dashboard/src/store/filterStore.js` |
| 错误页面 | `monitor-dashboard/src/pages/ErrorsPage.jsx` |
| 性能页面 | `monitor-dashboard/src/pages/PerformancePage.jsx` |
| 慢接口页面 | `monitor-dashboard/src/pages/RequestsPage.jsx` |
| Source Map展示 | `monitor-dashboard/src/components/SourceMapPanel.jsx` |
| ECharts趋势 | `monitor-dashboard/src/components/PerformanceTrendChart.jsx` |

---

## 16. 诚实边界：面试中不能夸大的内容

- 不说“替代Sentry”，说“参考成熟平台走通核心链路”。
- 不说“完全零侵入”，说“低侵入，仍需要初始化、配置和框架接入”。
- 不说“配置关闭就实现Tree Shaking”，只说“运行时按需启用”。
- 不说“完全不丢数据”，说“批量、Beacon、有限重试和幂等提高可靠性”。
- 不说“CSS selector永久唯一”，说“在当前DOM中尽量唯一、用于辅助定位”。
- 不说“Long Task直接定位源码行”，说“定位阻塞时间段，再用性能工具分析”。
- 不说“客户端脱敏后绝对安全”，说“数据最小化和双层清洗降低风险”。
- 不说“Vue已完整E2E验证”，说“React完成真实链路，Vue完成实现和单元测试”。
- 不说“企业级Source Map平台”，说明当前缺鉴权、对象存储、清理和异步队列。
- 不把Dashboard约540 KiB gzip说成SDK体积。
- 不将旧24.9 KiB和当前16.3 KiB说成同一次构建结果。
- 不把在指导下完成的部分包装成从零独立生产经验；可以说自己能够追踪、解释、修改并完成真实验证。

---

## 17. 最后复习法

### 第一轮：只背骨架，不背细节

```text
为什么做
→ 四个运行单元
→ Collector / EventBus / Reporter
→ Express / MongoDB
→ Dashboard
```

### 第二轮：盲讲两条链路

- React生产错误到源码还原和Dashboard。
- 点击后慢接口/Long Task到性能分析。

### 第三轮：简历五条各回答五问

1. 为什么做？
2. 为什么选这个方案，替代方案是什么？
3. 代码入口和完整执行链是什么？
4. 怎样验证？
5. 有什么边界和下一步？

### 第四轮：故意练“不确定”

面试遇到未实现或记不清的细节时：

> 这个生产规模我没有实际验证过。我当前实现的是……，能确定的边界是……。如果扩展到这个场景，我会先用……确认瓶颈，再考虑……方案。

这比用绝对化语言编造生产经验更可靠。

### 最终自检

- [ ] 能用60秒介绍项目。
- [ ] 能画出完整数据流。
- [ ] 能区分eventId、sessionId和fingerprint。
- [ ] 能区分客户端合并、服务端幂等和错误聚合。
- [ ] 能说清Fetch 500与网络异常。
- [ ] 能说明EventBus同步代价和destroy必要性。
- [ ] 能说明五个Web Vitals及Long Task边界。
- [ ] 能说清Source Map四字段匹配和失败隔离。
- [ ] 能解释MonitorEvent与ErrorGroup为什么同时存在。
- [ ] 能说明分位数、趋势分桶和样本量。
- [ ] 能讲两个真实故障：Illegal invocation与重试膨胀。
- [ ] 能主动说出项目未完成的生产能力。
