import { createErrorFingerprint } from '../src/core/errorFingerprint';

const createJsEvent = (overrides = {}) => ({
  eventType: 'error',
  subType: 'js',
  data: {
    message: 'Cannot read properties of null',
    source: 'http://localhost:5180/src/App.jsx?t=111',
    lineno: 14,
    colno: 13,
    ...overrides
  }
});

describe('Error Fingerprint', () => {
  test('相同 JS 错误生成相同指纹', () => {
    expect(createErrorFingerprint(createJsEvent()))
      .toBe(createErrorFingerprint(createJsEvent()));
  });

  test('忽略 URL 查询参数变化', () => {
    const first = createJsEvent({ source: 'http://localhost:5180/src/App.jsx?t=111' });
    const second = createJsEvent({ source: 'http://localhost:5180/src/App.jsx?t=222' });

    expect(createErrorFingerprint(first)).toBe(createErrorFingerprint(second));
  });

  test('相同行为但不同代码位置不会被合并', () => {
    const first = createJsEvent({ lineno: 14 });
    const second = createJsEvent({ lineno: 30 });

    expect(createErrorFingerprint(first)).not.toBe(createErrorFingerprint(second));
  });

  test('不同资源地址生成不同指纹', () => {
    const first = {
      eventType: 'error',
      subType: 'resource',
      data: { tagName: 'IMG', resourceUrl: 'https://cdn.test/a.png?t=1' }
    };
    const second = {
      eventType: 'error',
      subType: 'resource',
      data: { tagName: 'IMG', resourceUrl: 'https://cdn.test/b.png?t=1' }
    };

    expect(createErrorFingerprint(first)).not.toBe(createErrorFingerprint(second));
  });

  test('React 错误使用首个组件区分', () => {
    const base = {
      eventType: 'error',
      subType: 'react',
      data: { message: 'render failed' }
    };
    const first = {
      ...base,
      data: { ...base.data, componentStack: '\n at UserInfo (UserInfo.jsx:1:1)\n at App' }
    };
    const second = {
      ...base,
      data: { ...base.data, componentStack: '\n at OrderInfo (OrderInfo.jsx:1:1)\n at App' }
    };

    expect(createErrorFingerprint(first)).not.toBe(createErrorFingerprint(second));
  });
});
