import {
  getHeader,
  getFetchRequestInfo,
  isSdkInternalRequest,
  isSuccessfulStatus
} from '../src/core/requestUtils';

describe('请求监控工具', () => {
  test('Header 名称大小写不影响内部请求判断', () => {
    expect(getHeader({ 'x-sdk-internal': 'true' }, 'X-SDK-Internal')).toBe('true');
    expect(isSdkInternalRequest({
      url: 'http://api.test/user',
      headers: { 'x-sdk-internal': 'true' }
    })).toBe(true);
  });

  test('解析字符串形式的 Fetch 请求', () => {
    expect(getFetchRequestInfo('/api/user', { method: 'post' }, 'http://test.com/'))
      .toEqual(expect.objectContaining({
        url: 'http://test.com/api/user',
        method: 'POST'
      }));
  });

  test('解析 Request 风格对象', () => {
    const request = {
      url: 'http://test.com/api/orders',
      method: 'PATCH',
      headers: { Authorization: 'masked' }
    };

    expect(getFetchRequestInfo(request)).toEqual(expect.objectContaining({
      url: 'http://test.com/api/orders',
      method: 'PATCH',
      headers: request.headers
    }));
  });

  test('即使没有 Header，也会按上报 URL 过滤 SDK 自身请求', () => {
    expect(isSdkInternalRequest({
      url: 'http://localhost:3001/api/report',
      serverUrl: 'http://localhost:3001'
    })).toBe(true);
  });

  test('区分成功与异常 HTTP 状态码', () => {
    expect(isSuccessfulStatus(200)).toBe(true);
    expect(isSuccessfulStatus(302)).toBe(true);
    expect(isSuccessfulStatus(404)).toBe(false);
    expect(isSuccessfulStatus(500)).toBe(false);
  });
});

