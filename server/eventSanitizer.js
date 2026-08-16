const MASKED_VALUE = '[MASKED]';
const TRUNCATED_VALUE = '[TRUNCATED]';
const SENSITIVE_FIELDS = [
  'password', 'passwd', 'token', 'authorization', 'cookie', 'secret',
  'apikey', 'phone', 'mobile', 'email', 'idcard', 'bankcard', 'cardno'
];
const URL_FIELDS = new Set([
  'url', 'pageurl', 'resourceurl', 'fullurl', 'from', 'to', 'source'
]);
const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

const normalizeFieldName = value => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '');

const isSensitiveField = fieldName => {
  const normalized = normalizeFieldName(fieldName);
  return SENSITIVE_FIELDS.some(field => normalized.includes(field));
};

const maskSensitiveText = (value, maxLength = 5000) => String(value || '')
  .replace(/\b1[3-9]\d{9}\b/g, phone => `${phone.slice(0, 3)}****${phone.slice(-4)}`)
  .replace(/\b([A-Z0-9._%+-])[^@\s]*@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi, '$1***@$2')
  .replace(/\b(\d{6})\d{8}(\d{3}[\dXx])\b/g, '$1********$2')
  .slice(0, maxLength);

const sanitizeUrl = value => {
  const original = String(value || '');
  if (!original) return original;

  try {
    const isAbsolute = /^[a-z][a-z\d+.-]*:\/\//i.test(original);
    const url = new URL(original, 'http://monitor.local');

    url.searchParams.forEach((parameterValue, parameterName) => {
      url.searchParams.set(
        parameterName,
        isSensitiveField(parameterName)
          ? MASKED_VALUE
          : maskSensitiveText(parameterValue, 500)
      );
    });

    url.hash = maskSensitiveText(url.hash, 500)
      .replace(/(password|token|authorization|secret)=([^&]+)/gi, `$1=${MASKED_VALUE}`);

    return isAbsolute
      ? url.href
      : `${url.pathname}${url.search}${url.hash}`;
  } catch (error) {
    return maskSensitiveText(original);
  }
};

const sanitizeValue = (value, fieldName = '', depth = 0) => {
  if (depth > 6) return TRUNCATED_VALUE;
  if (isSensitiveField(fieldName)) return MASKED_VALUE;

  if (typeof value === 'string') {
    return URL_FIELDS.has(normalizeFieldName(fieldName))
      ? sanitizeUrl(value)
      : maskSensitiveText(value);
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map(item => sanitizeValue(item, '', depth + 1));
  }

  if (value && typeof value === 'object') {
    return Object.keys(value).slice(0, 100).reduce((result, key) => {
      if (!BLOCKED_KEYS.has(key)) {
        result[key] = sanitizeValue(value[key], key, depth + 1);
      }
      return result;
    }, {});
  }

  return value;
};

const sanitizeMonitorEvent = event => sanitizeValue(event);

module.exports = {
  MASKED_VALUE,
  TRUNCATED_VALUE,
  isSensitiveField,
  maskSensitiveText,
  sanitizeMonitorEvent,
  sanitizeUrl,
  sanitizeValue
};
