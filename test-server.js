const express = require('express');
const cors = require('cors');
const { connectDatabase } = require('./server/database');
const { extractMonitorEvents, validateMonitorEvent } = require('./server/eventValidator');
const { sanitizeMonitorEvent } = require('./server/eventSanitizer');
const { validateSourceMapUpload } = require('./server/sourceMapValidator');
const { symbolicateMonitorEvent } = require('./server/sourceMapSymbolicator');
const {
  clearAllData,
  getDataSnapshot,
  getErrorGroupById,
  getPerformanceOverview,
  getPerformanceTrends,
  listErrorEventsByGroupId,
  listErrorGroups,
  listEvents,
  listSlowRequests,
  storeMonitorEvents,
  storeSessionReplay
} = require('./server/repositories/monitorRepository');
const {
  listSourceMapArtifacts,
  upsertSourceMapArtifacts
} = require('./server/repositories/sourceMapRepository');
const app = express();

const localOrigins = [
  'http://localhost:5175',
  'http://localhost:5174',
  'http://localhost:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:5180',
  'http://localhost:5190',
  'http://localhost:5191'
];
const deployedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);
const allowedOrigins = new Set([...localOrigins, ...deployedOrigins]);

app.use(cors({
  origin(origin, callback) {
    // curl、健康检查和服务间请求通常不携带 Origin。
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS origin not allowed: ${origin}`));
  },
  credentials: true
}));

const eventJsonParser = express.json({ limit: '1mb' });
const replayJsonParser = express.json({ limit: '10mb' });
const sourceMapJsonParser = express.json({ limit: '15mb' });

const requireAdminToken = (req, res, next) => {
  const expectedToken = process.env.ADMIN_API_TOKEN;
  if (!expectedToken && process.env.NODE_ENV !== 'production') {
    next();
    return;
  }

  if (!expectedToken) {
    res.status(503).json({ success: false, message: '服务端未配置 ADMIN_API_TOKEN' });
    return;
  }

  const authorization = req.get('authorization') || '';
  const bearerToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const providedToken = req.get('x-admin-token') || bearerToken;

  if (providedToken !== expectedToken) {
    res.status(401).json({ success: false, message: '管理员令牌无效' });
    return;
  }

  next();
};

app.get('/api/health', (req, res) => {
  res.json({ success: true, service: 'yuan-monitor-api' });
});

// Demo 使用的稳定本地接口，避免依赖外部测试网站。
app.get('/api/demo/success', (req, res) => {
  res.json({ success: true, message: '本地成功接口' });
});

app.get('/api/demo/failure', (req, res) => {
  res.status(500).json({ success: false, message: '本地模拟 500' });
});

app.get('/api/demo/slow', (req, res) => {
  setTimeout(() => {
    res.json({ success: true, message: '本地慢接口', delay: 1200 });
  }, 1200);
});

app.get('/api/demo/ignored', (req, res) => {
  res.json({ success: true, message: '该请求应执行，但不进入监控数据' });
});

// 错误/性能/行为上报端点
app.post('/api/report', eventJsonParser, async (req, res) => {
  const data = req.body;
  const batchResult = extractMonitorEvents(data, { maxBatchSize: 50 });

  if (!batchResult.ok) {
    return res.status(400).json({
      success: false,
      message: batchResult.error
    });
  }

  const rejectedEvents = [];
  const acceptedEvents = [];

  batchResult.events.forEach((item, index) => {
    const validation = validateMonitorEvent(item);
    if (!validation.valid) {
      rejectedEvents.push({ index, eventId: item?.eventId, errors: validation.errors });
      return;
    }

    const sanitizedItem = sanitizeMonitorEvent(item);

    const type = sanitizedItem.eventType;
    const detail = sanitizedItem.data;
    const timestamp = sanitizedItem.timestamp;
    console.log(`\n=== 收到数据 [${type}] ===`);
    console.log('  时间:', new Date(timestamp).toLocaleString());
    console.log('  EventID:', sanitizedItem.eventId || 'N/A');
    console.log('  AppKey:', sanitizedItem.appKey || 'N/A');
    console.log('  SessionID:', sanitizedItem.sessionId || 'N/A');
    console.log('  UserID:', sanitizedItem.userId || 'N/A');

    if (type === 'error') {
      console.log('  错误类型:', sanitizedItem.subType || detail.type);
      console.log('  错误消息:', detail.message);
      if (detail.stack) console.log('  堆栈:', detail.stack.substring(0, 200));
      if (sanitizedItem.breadcrumbs && sanitizedItem.breadcrumbs.length > 0) {
        console.log('  面包屑数:', sanitizedItem.breadcrumbs.length);
      }
    } else if (type === 'performance') {
      console.log('  性能类型:', sanitizedItem.subType || detail.name);
      console.log('  值:', detail.value || detail.duration || 'N/A');
    } else if (type === 'behavior') {
      console.log('  行为类型:', sanitizedItem.subType);
    }

    acceptedEvents.push(sanitizedItem);
  });

  if (acceptedEvents.length === 0) {
    return res.status(400).json({
      success: false,
      message: '所有事件均未通过校验',
      accepted: 0,
      rejected: rejectedEvents.length,
      errors: rejectedEvents
    });
  }

  try {
    // Source Map 是增强链路：单条解析失败时仍返回原事件，不能阻断落库。
    const enrichedEvents = await Promise.all(
      acceptedEvents.map(event => symbolicateMonitorEvent(event))
    );
    const storageResult = await storeMonitorEvents(enrichedEvents);
    const statusCode = rejectedEvents.length > 0 ? 202 : 200;
    return res.status(statusCode).json({
      success: true,
      message: rejectedEvents.length > 0 ? '部分数据被拒绝' : '数据已接收并持久化',
      accepted: acceptedEvents.length,
      rejected: rejectedEvents.length,
      inserted: storageResult.inserted,
      duplicates: storageResult.duplicates,
      errors: rejectedEvents
    });
  } catch (error) {
    console.error('[Monitor Server] 数据持久化失败:', error.message);
    return res.status(500).json({ success: false, message: '数据持久化失败' });
  }
});

// Session Replay 上报端点
app.post('/api/session-replay', replayJsonParser, async (req, res) => {
  const data = req.body;
  const replayData = data.data || {};

  if (!data.appKey || !data.sessionId) {
    return res.status(400).json({
      success: false,
      message: 'appKey and sessionId are required'
    });
  }

  console.log('\n=== 收到 Session Replay 数据 ===');
  console.log('  时间:', new Date(data.timestamp || Date.now()).toLocaleString());
  console.log('  AppKey:', data.appKey || 'N/A');
  console.log('  SessionID:', data.sessionId || 'N/A');
  console.log('  事件数量:', replayData.events?.length || 0);
  console.log('  录制时长:', replayData.duration ? `${(replayData.duration / 1000).toFixed(1)}s` : 'N/A');
  console.log('  错误数量:', replayData.errorCount || 0);
  console.log('  错误偏移:', replayData.errorOffset >= 0 ? replayData.errorOffset : 'N/A');
  console.log('  最近错误时间:', replayData.lastErrorTime ? new Date(replayData.lastErrorTime).toLocaleString() : 'N/A');

  try {
    const replay = await storeSessionReplay(data);
    return res.json({
      success: true,
      message: 'Session replay 数据已持久化',
      id: replay._id
    });
  } catch (error) {
    console.error('[Monitor Server] 录屏持久化失败:', error.message);
    return res.status(500).json({ success: false, message: '录屏持久化失败' });
  }
});

// 构建系统上传 Source Map。当前练习项目未加鉴权，生产环境必须限制调用方。
app.post('/api/source-maps', requireAdminToken, sourceMapJsonParser, async (req, res) => {
  const validation = validateSourceMapUpload(req.body);
  if (!validation.valid) {
    return res.status(400).json({
      success: false,
      message: 'Source Map 上传数据不合法',
      errors: validation.errors
    });
  }

  try {
    const result = await upsertSourceMapArtifacts(validation.artifacts);
    return res.json({
      success: true,
      message: 'Source Map 已保存',
      release: req.body.release,
      files: validation.artifacts.map(item => item.generatedFile),
      ...result
    });
  } catch (error) {
    console.error('[Monitor Server] Source Map 保存失败:', error.message);
    return res.status(500).json({ success: false, message: 'Source Map 保存失败' });
  }
});

// 只返回元数据，不向 Dashboard 暴露 rawMap 和 sourcesContent。
app.get('/api/source-maps', async (req, res) => {
  try {
    return res.json({
      items: await listSourceMapArtifacts(req.query)
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Source Map 查询失败' });
  }
});

// 统一原始事件分页查询。
app.get('/api/events', async (req, res) => {
  try {
    return res.json(await listEvents(req.query));
  } catch (error) {
    return res.status(500).json({ success: false, message: '事件查询失败' });
  }
});

// 聚合错误列表与详情查询。
app.get('/api/errors', async (req, res) => {
  try {
    return res.json(await listErrorGroups(req.query));
  } catch (error) {
    return res.status(500).json({ success: false, message: '错误查询失败' });
  }
});

app.get('/api/errors/:id/events', async (req, res) => {
  try {
    const result = await listErrorEventsByGroupId(req.params.id, req.query);
    if (!result) {
      return res.status(404).json({ success: false, message: '错误组不存在' });
    }
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ success: false, message: '错误事件查询失败' });
  }
});

app.get('/api/errors/:id', async (req, res) => {
  try {
    const errorGroup = await getErrorGroupById(req.params.id);
    if (!errorGroup) {
      return res.status(404).json({ success: false, message: '错误组不存在' });
    }
    return res.json(errorGroup);
  } catch (error) {
    return res.status(500).json({ success: false, message: '错误详情查询失败' });
  }
});

app.get('/api/performance/overview', async (req, res) => {
  try {
    return res.json(await getPerformanceOverview(req.query));
  } catch (error) {
    console.error('[Monitor Server] 性能聚合失败:', error.message);
    return res.status(500).json({ success: false, message: '性能聚合失败' });
  }
});

app.get('/api/performance/trends', async (req, res) => {
  try {
    return res.json(await getPerformanceTrends(req.query));
  } catch (error) {
    console.error('[Monitor Server] 性能趋势聚合失败:', error.message);
    return res.status(500).json({ success: false, message: '性能趋势聚合失败' });
  }
});

app.get('/api/requests/slow', async (req, res) => {
  try {
    return res.json(await listSlowRequests(req.query));
  } catch (error) {
    return res.status(500).json({ success: false, message: '慢接口查询失败' });
  }
});

// 获取所有接收到的数据
app.get('/api/data', async (req, res) => {
  try {
    return res.json(await getDataSnapshot({ limit: req.query.limit }));
  } catch (error) {
    return res.status(500).json({ success: false, message: '数据查询失败' });
  }
});

// 清空数据
app.delete('/api/clear', requireAdminToken, async (req, res) => {
  try {
    await clearAllData();
    return res.json({ success: true, message: '数据库监控数据已清空' });
  } catch (error) {
    return res.status(500).json({ success: false, message: '数据清空失败' });
  }
});

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';

const startServer = async () => {
  const connection = await connectDatabase();
  console.log(`[Monitor Server] MongoDB 已连接: ${connection.name}`);

  return app.listen(PORT, HOST, () => {
  console.log('\n===========================================');
  console.log('  监控服务器已启动！');
  console.log(`  地址: http://${HOST}:${PORT}`);
  console.log('===========================================');
  console.log('\n可用端点:');
  console.log(`  GET  /api/health         - 服务健康检查`);
  console.log(`  POST /api/report         - 接收错误和性能数据`);
  console.log(`  POST /api/session-replay - 接收录屏数据`);
  console.log(`  POST /api/source-maps    - 上传 Source Map`);
  console.log(`  GET  /api/data           - 获取所有接收的数据`);
  console.log(`  GET  /api/events         - 分页查询原始事件`);
  console.log(`  GET  /api/errors         - 分页查询错误组`);
  console.log(`  GET  /api/errors/:id/events - 查询错误组原始事件`);
  console.log(`  GET  /api/performance/overview - 查询性能概览`);
  console.log(`  GET  /api/performance/trends - 查询性能趋势`);
  console.log(`  GET  /api/requests/slow  - 查询慢接口排行`);
  console.log(`  GET  /api/source-maps    - 查询 Source Map 元数据`);
  console.log(`  DELETE /api/clear        - 清空所有数据`);
  console.log('');
  });
};

if (require.main === module) {
  startServer().catch(error => {
    console.error('[Monitor Server] 启动失败:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { app, startServer };
