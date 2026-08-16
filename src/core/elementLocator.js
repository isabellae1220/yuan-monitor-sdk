const INTERACTIVE_TAGS = new Set([
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'label',
  'summary'
]);

const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'menuitem',
  'checkbox',
  'radio',
  'tab',
  'switch'
]);

const escapeAttributeValue = (value) => String(value)
  .replace(/\\/g, '\\\\')
  .replace(/"/g, '\\"');

const escapeIdentifier = (value) => {
  const text = String(value);
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(text);
  }
  return text.replace(/(^-?\d)|[^a-zA-Z0-9_-]/g, match => `\\${match}`);
};

const getAttribute = (element, name) => {
  if (!element || typeof element.getAttribute !== 'function') return '';
  return element.getAttribute(name) || '';
};

const getClassNames = (element) => {
  const rawClassName = typeof element?.className === 'string'
    ? element.className
    : element?.className?.baseVal;

  return String(rawClassName || '')
    .split(/\s+/)
    .filter(Boolean)
    .filter(className => className.length <= 60)
    .slice(0, 2);
};

const isElement = (value) => Boolean(value && typeof value.tagName === 'string');

const getClickTarget = (event) => {
  if (event && typeof event.composedPath === 'function') {
    const pathTarget = event.composedPath().find(isElement);
    if (pathTarget) return pathTarget;
  }
  return isElement(event?.target) ? event.target : null;
};

const isInteractiveElement = (element) => {
  if (!isElement(element)) return false;
  const tagName = element.tagName.toLowerCase();
  const role = getAttribute(element, 'role').toLowerCase();
  return INTERACTIVE_TAGS.has(tagName) || INTERACTIVE_ROLES.has(role);
};

const findMeaningfulTarget = (target, maxDepth = 5) => {
  if (!isElement(target)) return null;

  const originalTarget = target;
  let current = target;
  let depth = 0;

  while (current && depth <= maxDepth) {
    if (isInteractiveElement(current)) return current;
    if (current.tagName.toLowerCase() === 'body') break;
    current = current.parentElement;
    depth += 1;
  }

  return originalTarget;
};

const getSiblingPosition = (element) => {
  const siblings = Array.from(element?.parentElement?.children || [])
    .filter(sibling => sibling.tagName === element.tagName);

  if (siblings.length <= 1) return '';
  return `:nth-of-type(${siblings.indexOf(element) + 1})`;
};

const buildSelectorSegment = (element) => {
  const tagName = element.tagName.toLowerCase();
  const monitorId = getAttribute(element, 'data-monitor-id');
  if (monitorId) {
    return `${tagName}[data-monitor-id="${escapeAttributeValue(monitorId)}"]`;
  }

  const testId = getAttribute(element, 'data-testid');
  if (testId) {
    return `${tagName}[data-testid="${escapeAttributeValue(testId)}"]`;
  }

  if (element.id) return `#${escapeIdentifier(element.id)}`;

  const semanticAttribute = ['aria-label', 'name', 'role']
    .map(name => [name, getAttribute(element, name)])
    .find(([, value]) => value);

  if (semanticAttribute) {
    const [name, value] = semanticAttribute;
    return `${tagName}[${name}="${escapeAttributeValue(value)}"]${getSiblingPosition(element)}`;
  }

  const classes = getClassNames(element)
    .map(className => `.${escapeIdentifier(className)}`)
    .join('');

  return `${tagName}${classes}${getSiblingPosition(element)}`;
};

const isUniqueSelector = (selector, documentRef) => {
  if (!documentRef || typeof documentRef.querySelectorAll !== 'function') return null;
  try {
    return documentRef.querySelectorAll(selector).length === 1;
  } catch (error) {
    return false;
  }
};

const buildElementSelector = (element, options = {}) => {
  if (!isElement(element)) return { selector: '', isUnique: false };

  const maxDepth = options.maxDepth ?? 5;
  const documentRef = options.documentRef || (
    typeof document !== 'undefined' ? document : null
  );
  const segments = [];
  let current = element;
  let depth = 0;

  while (current && depth < maxDepth) {
    segments.unshift(buildSelectorSegment(current));
    const selector = segments.join(' > ');
    const isUnique = isUniqueSelector(selector, documentRef);

    if (isUnique === true || current.id || getAttribute(current, 'data-monitor-id')) {
      return { selector, isUnique: isUnique !== false };
    }

    if (current.tagName.toLowerCase() === 'body') break;
    current = current.parentElement;
    depth += 1;
  }

  const selector = segments.join(' > ');
  return {
    selector,
    isUnique: isUniqueSelector(selector, documentRef) === true
  };
};

export {
  getClickTarget,
  findMeaningfulTarget,
  buildElementSelector,
  buildSelectorSegment,
  isInteractiveElement
};

