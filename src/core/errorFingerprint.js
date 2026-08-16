const normalizeText = (value) => String(value || '').trim().replace(/\s+/g, ' ');

const normalizeUrl = (value) => {
  return normalizeText(value).replace(/[?#].*$/, '');
};

const getFirstUsefulStackFrame = (stack) => {
  const lines = String(stack || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const frame = lines.find(line => (
    line.startsWith('at ') &&
    !line.includes('node_modules') &&
    !line.includes('react-dom')
  )) || lines[1] || '';

  // 去掉 Vite 等开发服务器注入的查询参数，同时保留行号和列号。
  return frame.replace(/\?[^:\s)]+(?=:\d+(?::\d+)?)/g, '');
};

const getFirstComponent = (componentStack) => {
  const firstLine = String(componentStack || '')
    .split('\n')
    .map(line => line.trim())
    .find(line => line.startsWith('at '));

  return (firstLine || '').replace(/\s+\(.*\)$/, '');
};

const stableHash = (value) => {
  let hash = 2166136261;
  const text = String(value);

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `fp_${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

const createErrorFingerprint = (event) => {
  const subType = event?.subType || 'unknown';
  const data = event?.data || {};
  const message = normalizeText(data.message);
  let parts;

  switch (subType) {
    case 'js':
      parts = [subType, message, normalizeUrl(data.source), data.lineno, data.colno];
      break;
    case 'promise':
      parts = [subType, message, getFirstUsefulStackFrame(data.stack)];
      break;
    case 'resource':
      parts = [subType, data.tagName, normalizeUrl(data.resourceUrl)];
      break;
    case 'react':
      parts = [subType, message, getFirstComponent(data.componentStack)];
      break;
    case 'manual':
      parts = [
        subType,
        message,
        data.context?.errorCode || data.context?.code || ''
      ];
      break;
    default:
      parts = [subType, message, getFirstUsefulStackFrame(data.stack)];
  }

  return stableHash(parts.map(normalizeText).join('|'));
};

export {
  normalizeUrl,
  getFirstUsefulStackFrame,
  getFirstComponent,
  stableHash,
  createErrorFingerprint
};

export default createErrorFingerprint;
