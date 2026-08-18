# TraceLens 在线部署指南

本项目推荐使用以下结构部署：

```text
React Demo（Render Static Site）
        │ SDK 上报
        ▼
Express API（Render Web Service） ── MongoDB Atlas
        ▲
        │ 查询 API
React Dashboard（Render Static Site）
```

这样保留了项目原本的“采集端、服务端、展示端”分层，也方便面试时演示完整监控闭环。

## 当前线上地址

- Demo：https://tracelens-demo.onrender.com
- Dashboard：https://tracelens-dashboard.onrender.com/errors
- API 健康检查：https://tracelens-api-oiko.onrender.com/api/health

Render 为 API 分配了带随机后缀的公开域名，部署配置必须以实际域名 `tracelens-api-oiko.onrender.com` 为准，不能根据服务名自行推测地址。

## 0. 部署前提

云平台读取的是 GitHub 仓库，而不是电脑里的本地文件。因此必须先把当前完整版本提交并推送到 GitHub，再创建 Render 服务。

## 1. 创建 MongoDB Atlas 数据库

1. 在 MongoDB Atlas 创建免费集群。
2. 创建一个数据库用户，保存用户名和强密码。
3. 在 Network Access 中允许 Render 服务访问数据库。
4. 复制连接串并把密码、数据库名补全，例如：

```text
mongodb+srv://monitor_user:<password>@<cluster>/yuan_monitor?retryWrites=true&w=majority
```

该值稍后保存为 Render API 服务的 `MONGODB_URI`，不要提交到 Git。

## 2. 部署 Express API

在 Render 创建 Web Service，连接当前维护的 GitHub 仓库 `isabellae1220/yuan-monitor-sdk`：

```text
Runtime: Node
Build Command: npm ci --omit=dev
Start Command: npm start
Health Check Path: /api/health
```

设置环境变量：

```text
NODE_ENV=production
MONGODB_URI=<Atlas 连接串>
ADMIN_API_TOKEN=<足够长的随机字符串>
CORS_ORIGINS=
```

本次部署得到的 API 地址为：

```text
https://tracelens-api-oiko.onrender.com
```

访问以下地址，看到 `success: true` 表示 API 和数据库连接均已启动：

```text
https://tracelens-api-oiko.onrender.com/api/health
```

## 3. 部署 React Demo

在 Render 创建 Static Site，仍连接同一个仓库：

```text
Build Command: npm ci && npm ci --prefix test-react-app && npm run build --prefix test-react-app && npm run upload:sourcemaps --prefix test-react-app
Publish Directory: test-react-app/dist
```

设置环境变量：

```text
VITE_MONITOR_SERVER_URL=<第 2 步的 API 地址，不要以 / 结尾>
MONITOR_ADMIN_TOKEN=<与 API 的 ADMIN_API_TOKEN 完全相同>
```

`MONITOR_ADMIN_TOKEN` 没有 `VITE_` 前缀，只供构建阶段上传 Source Map 使用，不会进入浏览器产物。

添加 SPA Rewrite：

```text
Source: /*
Destination: /index.html
Action: Rewrite
```

## 4. 部署 React Dashboard

创建第二个 Render Static Site：

```text
Build Command: npm ci --prefix monitor-dashboard && npm run build --prefix monitor-dashboard
Publish Directory: monitor-dashboard/dist
```

设置环境变量：

```text
VITE_API_BASE_URL=<第 2 步的 API 地址>/api
```

同样添加 SPA Rewrite：

```text
Source: /*
Destination: /index.html
Action: Rewrite
```

## 5. 补全 API 跨域白名单

得到 Demo 和 Dashboard 的线上地址后，回到 API 服务更新：

```text
CORS_ORIGINS=https://<demo>.onrender.com,https://<dashboard>.onrender.com
```

保存后让 API 重新部署。地址之间使用英文逗号，不要带路径，也不要在末尾加 `/`。

## 6. 上线验收

按以下顺序验证：

1. 打开 API `/api/health`，应返回成功。
2. 打开 Demo，点击一次“测试运行时错误”和“制造约 180ms Long Task”。
3. 等待约 5 秒，让 DataReporter 刷新批次。
4. 打开 Dashboard，选择 `test-app-key`、`production` 和合适时间范围。
5. 检查错误列表、性能数据、慢接口和错误详情。
6. 打开错误详情，确认原始堆栈存在；构建时 Source Map 上传成功后，还应看到还原状态与源码位置。

## 7. 本地运行不受影响

没有提供 Vite 环境变量时仍使用本地默认值：

```text
Demo API: http://localhost:3001
Dashboard API: /api（由 Vite 代理到 127.0.0.1:3001）
```

本地启动顺序：

```bash
# 终端 1
npm start

# 终端 2
npm run dev --prefix test-react-app

# 终端 3
npm run dev --prefix monitor-dashboard
```

## 上线边界

这个部署适合作品集和面试演示，不应描述为企业级生产系统。当前仍未实现登录权限、租户鉴权、告警、限流、数据生命周期管理和高可用部署。Render 免费 Web Service 还可能在无人访问后休眠，首次打开需要等待冷启动。
