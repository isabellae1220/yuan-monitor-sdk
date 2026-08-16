import {
  MASKED_VALUE,
  maskSensitiveText,
  sanitizeUrl,
  shouldIgnoreUrl,
  sanitizeBreadcrumbData
} from '../src/core/privacyProcessor';

describe('隐私处理器', () => {
  test('URL 敏感参数值被隐藏，普通参数保留', () => {
    const result = decodeURIComponent(sanitizeUrl(
      'http://test.com/api/user?phone=13812345678&access_token=secret&page=2'
    ));

    expect(result).toContain('phone=[MASKED]');
    expect(result).toContain('access_token=[MASKED]');
    expect(result).toContain('page=2');
    expect(result).not.toContain('13812345678');
    expect(result).not.toContain('secret');
  });

  test('点击文字中的手机号、邮箱和身份证号被脱敏', () => {
    const result = maskSensitiveText(
      '用户 13812345678，邮箱 isabella@example.com，身份证 110101199001011234'
    );

    expect(result).toContain('138****5678');
    expect(result).toContain('i***@example.com');
    expect(result).toContain('110101********1234');
  });

  test('自定义面包屑中的嵌套敏感字段被替换', () => {
    const result = sanitizeBreadcrumbData({
      username: 'isabella',
      password: '123456',
      profile: { mobile: '13812345678' }
    });

    expect(result).toEqual({
      username: 'isabella',
      password: MASKED_VALUE,
      profile: { mobile: MASKED_VALUE }
    });
  });

  test('支持字符串和正则形式的 URL 忽略规则', () => {
    expect(shouldIgnoreUrl('http://test.com/api/health', ['/api/health'])).toBe(true);
    expect(shouldIgnoreUrl('http://test.com/api/payment/1', [/\/api\/payment/])).toBe(true);
    expect(shouldIgnoreUrl('http://test.com/api/user', ['/api/health'])).toBe(false);
  });
});

