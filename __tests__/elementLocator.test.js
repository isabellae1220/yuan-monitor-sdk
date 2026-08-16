import {
  getClickTarget,
  findMeaningfulTarget,
  buildElementSelector
} from '../src/core/elementLocator';

const createElement = (tagName, options = {}) => {
  const attributes = options.attributes || {};
  return {
    tagName: tagName.toUpperCase(),
    id: options.id || '',
    className: options.className || '',
    parentElement: null,
    children: [],
    getAttribute: name => attributes[name] || ''
  };
};

const append = (parent, ...children) => {
  children.forEach(child => {
    child.parentElement = parent;
    parent.children.push(child);
  });
};

describe('元素定位器', () => {
  test('优先从 composedPath 获取真实点击节点', () => {
    const svg = createElement('svg');
    const event = {
      target: createElement('div'),
      composedPath: () => [svg, createElement('button')]
    };

    expect(getClickTarget(event)).toBe(svg);
  });

  test('点击按钮内部图标时向上找到有业务意义的 button', () => {
    const button = createElement('button');
    const span = createElement('span');
    const svg = createElement('svg');
    append(button, span);
    append(span, svg);

    expect(findMeaningfulTarget(svg)).toBe(button);
  });

  test('优先使用 data-monitor-id 生成选择器', () => {
    const button = createElement('button', {
      attributes: { 'data-monitor-id': 'login-submit' }
    });

    expect(buildElementSelector(button, { documentRef: null }).selector)
      .toBe('button[data-monitor-id="login-submit"]');
  });

  test('存在稳定 id 时使用 id 选择器', () => {
    const button = createElement('button', { id: 'login-button' });

    expect(buildElementSelector(button, { documentRef: null }).selector)
      .toBe('#login-button');
  });

  test('相同兄弟元素使用 nth-of-type 区分位置', () => {
    const list = createElement('ul', { className: 'menu' });
    const first = createElement('li');
    const second = createElement('li');
    const third = createElement('li');
    append(list, first, second, third);

    expect(buildElementSelector(second, { documentRef: null, maxDepth: 1 }).selector)
      .toBe('li:nth-of-type(2)');
  });
});

