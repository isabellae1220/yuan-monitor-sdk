jest.mock('../server/models/MonitorEvent', () => ({
  aggregate: jest.fn(),
  find: jest.fn(),
  countDocuments: jest.fn()
}));

jest.mock('../server/models/ErrorGroup', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  countDocuments: jest.fn()
}));

jest.mock('../server/models/SessionReplay', () => ({}));

const MonitorEvent = require('../server/models/MonitorEvent');
const ErrorGroup = require('../server/models/ErrorGroup');
const {
  getPerformanceTrends,
  listErrorEventsByGroupId,
  listErrorGroups,
  listSlowRequests,
  resolveTrendBucketSize
} = require('../server/repositories/monitorRepository');

const VALID_GROUP_ID = '507f1f77bcf86cd799439011';

const createEventQuery = items => ({
  sort: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue(items)
});

describe('monitorRepository 错误组事件查询', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('无效错误组 id 直接返回 null，不查询数据库', async () => {
    await expect(listErrorEventsByGroupId('invalid-id')).resolves.toBeNull();
    expect(ErrorGroup.findById).not.toHaveBeenCalled();
    expect(MonitorEvent.find).not.toHaveBeenCalled();
  });

  test('根据错误组真实字段分页查询关联 MonitorEvent', async () => {
    const group = {
      _id: VALID_GROUP_ID,
      appKey: 'app-1',
      environment: 'production',
      fingerprint: 'fp-payment'
    };
    const items = [{ eventId: 'evt-2' }, { eventId: 'evt-1' }];
    const eventQuery = createEventQuery(items);

    ErrorGroup.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue(group)
    });
    MonitorEvent.find.mockReturnValue(eventQuery);
    MonitorEvent.countDocuments.mockResolvedValue(42);

    const result = await listErrorEventsByGroupId(VALID_GROUP_ID, {
      page: 2,
      pageSize: 10
    });

    const expectedFilter = {
      eventType: 'error',
      appKey: 'app-1',
      environment: 'production',
      fingerprint: 'fp-payment'
    };
    expect(MonitorEvent.find).toHaveBeenCalledWith(expectedFilter);
    expect(MonitorEvent.countDocuments).toHaveBeenCalledWith(expectedFilter);
    expect(eventQuery.sort).toHaveBeenCalledWith({ timestamp: -1 });
    expect(eventQuery.skip).toHaveBeenCalledWith(10);
    expect(eventQuery.limit).toHaveBeenCalledWith(10);
    expect(result).toEqual({
      group,
      items,
      pagination: {
        page: 2,
        pageSize: 10,
        total: 42,
        totalPages: 5
      }
    });
  });

  test('错误组列表按项目、环境、类型和时间范围筛选', async () => {
    const groupQuery = createEventQuery([{ _id: 'group-1' }]);
    ErrorGroup.find.mockReturnValue(groupQuery);
    ErrorGroup.countDocuments.mockResolvedValue(1);

    const result = await listErrorGroups({
      appKey: 'app-1',
      environment: 'production',
      subType: 'promise',
      startTime: 1000,
      endTime: 2000,
      page: 1,
      pageSize: 10
    });

    const expectedFilter = {
      appKey: 'app-1',
      environment: 'production',
      subType: 'promise',
      lastSeenAt: { $gte: 1000, $lte: 2000 }
    };
    expect(ErrorGroup.find).toHaveBeenCalledWith(expectedFilter);
    expect(ErrorGroup.countDocuments).toHaveBeenCalledWith(expectedFilter);
    expect(groupQuery.sort).toHaveBeenCalledWith({ lastSeenAt: -1 });
    expect(groupQuery.skip).toHaveBeenCalledWith(0);
    expect(groupQuery.limit).toHaveBeenCalledWith(10);
    expect(result.pagination.total).toBe(1);
  });
});

describe('monitorRepository 性能趋势查询', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('根据时间范围选择小时、天和周作为聚合粒度', () => {
    const hour = 60 * 60 * 1000;
    const day = 24 * hour;

    expect(resolveTrendBucketSize(0, 12 * hour)).toBe(hour);
    expect(resolveTrendBucketSize(0, 7 * day)).toBe(day);
    expect(resolveTrendBucketSize(0, 60 * day)).toBe(7 * day);
  });

  test('按时间桶和指标名称返回可绘图的趋势数据', async () => {
    const day = 24 * 60 * 60 * 1000;
    const startTime = 10 * day;
    const endTime = 17 * day;
    MonitorEvent.aggregate.mockResolvedValue([
      {
        _id: { name: 'LCP', bucket: 10 * day },
        count: 3,
        average: 2100,
        p75: [2400],
        p95: [2800]
      },
      {
        _id: { name: 'LCP', bucket: 11 * day },
        count: 2,
        average: 2500,
        p75: [2700],
        p95: [3000]
      },
      {
        _id: { name: 'INP', bucket: 10 * day },
        count: 4,
        average: 180,
        p75: [200],
        p95: [260]
      }
    ]);

    const result = await getPerformanceTrends({
      appKey: 'app-1',
      environment: 'production',
      startTime,
      endTime
    });

    expect(result.bucketSize).toBe(day);
    expect(result.metrics.LCP).toHaveLength(2);
    expect(result.metrics.INP[0]).toEqual({
      timestamp: 10 * day,
      count: 4,
      average: 180,
      p75: 200,
      p95: 260
    });

    const pipeline = MonitorEvent.aggregate.mock.calls[0][0];
    expect(pipeline[0].$match).toEqual(expect.objectContaining({
      eventType: 'performance',
      subType: 'web-vital',
      appKey: 'app-1',
      environment: 'production',
      timestamp: { $gte: startTime, $lte: endTime }
    }));
    expect(pipeline[1].$group._id).toEqual(expect.objectContaining({
      name: '$data.name'
    }));
  });
});

describe('monitorRepository 慢接口查询', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('按耗时、请求类型和失败结果分页并返回汇总', async () => {
    const requestQuery = createEventQuery([{
      eventId: 'evt-request-1',
      appKey: 'app-1',
      subType: 'fetch',
      timestamp: 2000,
      data: {
        method: 'POST',
        url: '/api/order',
        status: 500,
        success: false,
        errorType: 'http',
        elapsedTime: 1200
      }
    }]);
    MonitorEvent.find.mockReturnValue(requestQuery);
    MonitorEvent.countDocuments.mockResolvedValue(6);
    MonitorEvent.aggregate.mockResolvedValue([{
      averageElapsedTime: 800,
      maxElapsedTime: 1600,
      failureCount: 4
    }]);

    const result = await listSlowRequests({
      appKey: 'app-1',
      environment: 'production',
      requestType: 'fetch',
      result: 'failure',
      minDuration: 500,
      startTime: 1000,
      endTime: 3000,
      page: 2,
      pageSize: 5
    });

    const expectedFilter = {
      eventType: 'behavior',
      subType: 'fetch',
      'data.elapsedTime': { $type: 'number', $gte: 500 },
      appKey: 'app-1',
      environment: 'production',
      $or: [
        { 'data.success': false },
        { 'data.status': { $gte: 400 } }
      ],
      timestamp: { $gte: 1000, $lte: 3000 }
    };
    expect(MonitorEvent.find).toHaveBeenCalledWith(expectedFilter);
    expect(requestQuery.skip).toHaveBeenCalledWith(5);
    expect(requestQuery.limit).toHaveBeenCalledWith(5);
    expect(result.summary).toEqual({
      total: 6,
      averageElapsedTime: 800,
      maxElapsedTime: 1600,
      failureCount: 4
    });
    expect(result.pagination.totalPages).toBe(2);
    expect(result.items[0]).toEqual(expect.objectContaining({
      eventId: 'evt-request-1',
      requestType: 'fetch',
      elapsedTime: 1200
    }));
  });
});
