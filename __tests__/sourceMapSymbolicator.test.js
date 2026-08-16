const { SourceMapGenerator } = require('source-map');

jest.mock('../server/repositories/sourceMapRepository', () => ({
  findSourceMapArtifact: jest.fn()
}));

const {
  findSourceMapArtifact
} = require('../server/repositories/sourceMapRepository');
const {
  getGeneratedFile,
  parseStackFrames,
  symbolicateMonitorEvent
} = require('../server/sourceMapSymbolicator');

const createEvent = (overrides = {}) => ({
  eventId: 'evt-1',
  eventType: 'error',
  subType: 'js',
  appKey: 'shop-web',
  environment: 'production',
  release: 'shop-web@1.0.1',
  data: {
    message: '支付失败',
    stack: `Error: 支付失败
    at t (https://example.com/assets/index.js?v=1:1:10)`
  },
  ...overrides
});

const createRawMap = () => {
  const generator = new SourceMapGenerator({ file: 'index.js' });
  generator.addMapping({
    generated: { line: 1, column: 10 },
    original: { line: 46, column: 13 },
    source: 'src/pages/Payment.jsx',
    name: 'submitOrder'
  });
  generator.setSourceContent('src/pages/Payment.jsx', 'throw new Error("支付失败")');
  return generator.toJSON();
};

describe('服务端 Source Map 还原', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('从带查询参数的 URL 中提取生成文件', () => {
    expect(getGeneratedFile('https://example.com/assets/index.js?v=1#x'))
      .toBe('index.js');
  });

  test('把 V8 堆栈拆成结构化帧', () => {
    const frames = parseStackFrames(createEvent().data.stack);

    expect(frames).toEqual([{
      functionName: 't',
      fileUrl: 'https://example.com/assets/index.js?v=1',
      generatedFile: 'index.js',
      line: 1,
      column: 10
    }]);
  });

  test('按 release 查找 Map 并保留原始堆栈、附加源码位置', async () => {
    findSourceMapArtifact.mockResolvedValue({ rawMap: createRawMap() });
    const event = createEvent();

    const result = await symbolicateMonitorEvent(event);

    expect(findSourceMapArtifact).toHaveBeenCalledWith({
      appKey: 'shop-web',
      environment: 'production',
      release: 'shop-web@1.0.1',
      generatedFile: 'index.js'
    });
    expect(result.data.stack).toBe(event.data.stack);
    expect(result.data.symbolication).toEqual({
      status: 'resolved',
      frameCount: 1,
      resolvedCount: 1,
      failedCount: 0,
      missingCount: 0
    });
    expect(result.data.resolvedStack[0].original).toEqual({
      source: 'src/pages/Payment.jsx',
      line: 46,
      column: 13,
      functionName: 'submitOrder'
    });
  });

  test('没有对应 release 的 Map 时仍返回可存储的原事件', async () => {
    findSourceMapArtifact.mockResolvedValue(null);
    const event = createEvent();

    const result = await symbolicateMonitorEvent(event);

    expect(result.data.stack).toBe(event.data.stack);
    expect(result.data.symbolication.status).toBe('map_not_found');
    expect(result.data.resolvedStack[0].original).toBeNull();
  });

  test('Map 损坏时隔离异常并把事件标记为 failed', async () => {
    findSourceMapArtifact.mockResolvedValue({ rawMap: { version: 3 } });
    const event = createEvent();

    const result = await symbolicateMonitorEvent(event);

    expect(result.data.stack).toBe(event.data.stack);
    expect(result.data.symbolication.status).toBe('failed');
    expect(result.data.resolvedStack[0].reason).toBe('invalid_source_map');
  });

  test('缺少 release 时不冒险查询其他版本', async () => {
    const event = createEvent({ release: '' });

    const result = await symbolicateMonitorEvent(event);

    expect(findSourceMapArtifact).not.toHaveBeenCalled();
    expect(result.data.symbolication.status).toBe('missing_release');
    expect(result.data.stack).toBe(event.data.stack);
  });

  test('性能和行为事件不进入 Source Map 解析', async () => {
    const event = createEvent({ eventType: 'performance' });

    const result = await symbolicateMonitorEvent(event);

    expect(result).toBe(event);
    expect(findSourceMapArtifact).not.toHaveBeenCalled();
  });
});
