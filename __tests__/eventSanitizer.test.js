const {
  MASKED_VALUE,
  sanitizeMonitorEvent,
  sanitizeUrl
} = require('../server/eventSanitizer');

describe('服务端事件脱敏', () => {
  test('URL 只隐藏敏感参数并保留定位信息', () => {
    const result = decodeURIComponent(sanitizeUrl(
      '/api/orders?token=secret&phone=13812345678&page=2'
    ));

    expect(result).toContain('/api/orders?');
    expect(result).toContain('token=[MASKED]');
    expect(result).toContain('phone=[MASKED]');
    expect(result).toContain('page=2');
    expect(result).not.toContain('secret');
    expect(result).not.toContain('13812345678');
  });

  test('递归遮盖字段名敏感信息和文本中的个人信息', () => {
    const result = sanitizeMonitorEvent({
      userData: {
        username: 'isabella',
        password: '123456',
        profile: { authorization: 'Bearer abc' }
      },
      data: {
        text: '联系 13812345678 或 isabella@example.com'
      }
    });

    expect(result.userData).toEqual({
      username: 'isabella',
      password: MASKED_VALUE,
      profile: { authorization: MASKED_VALUE }
    });
    expect(result.data.text).toBe('联系 138****5678 或 i***@example.com');
  });

  test('脱敏返回副本，不修改路由收到的原事件', () => {
    const event = {
      pageUrl: 'http://test.com/?token=secret',
      data: { phone: '13812345678' }
    };

    const result = sanitizeMonitorEvent(event);

    expect(result).not.toBe(event);
    expect(result.data).not.toBe(event.data);
    expect(event.data.phone).toBe('13812345678');
    expect(result.data.phone).toBe(MASKED_VALUE);
  });

  test('限制数组、对象键和递归深度，避免异常数据放大处理成本', () => {
    const result = sanitizeMonitorEvent({
      data: {
        list: Array.from({ length: 60 }, (_, index) => index),
        deep: { a: { b: { c: { d: { e: { f: { g: 'too deep' } } } } } } }
      }
    });

    expect(result.data.list).toHaveLength(50);
    expect(JSON.stringify(result)).toContain('[TRUNCATED]');
  });
});
