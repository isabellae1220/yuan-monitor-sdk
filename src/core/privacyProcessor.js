const DEFAULT_MASK_FIELDS = [
  'password',
  'passwd',
  'token',
  'authorization',
  'cookie',
  'secret',
  'apiKey',
  'phone',
  'mobile',
  'email',
  'idCard',
  'bankCard',
  'cardNo'
];

const MASKED_VALUE = '[MASKED]';

const normalizeFieldName = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '');

const resolvePrivacyConfig = (config = {}) => ({
  enable: config.enable !== false,
  maskFields: Array.isArray(config.maskFields)
    ? config.maskFields
    : DEFAULT_MASK_FIELDS,
  ignoreUrls: Array.isArray(config.ignoreUrls) ? config.ignoreUrls : [],
  maxTextLength: config.maxTextLength ?? 100,
  maxValueLength: config.maxValueLength ?? 500
});

const isSensitiveField = (fieldName, maskFields = DEFAULT_MASK_FIELDS) => {
  const normalizedField = normalizeFieldName(fieldName);
  return maskFields.some(field => {
    const normalizedMask = normalizeFieldName(field);
    return normalizedMask && normalizedField.includes(normalizedMask);
  });
};

const maskSensitiveText = (value, maxLength = 500) => String(value || '')
  .replace(/\b1[3-9]\d{9}\b/g, phone => `${phone.slice(0, 3)}****${phone.slice(-4)}`)
  .replace(/\b([A-Z0-9._%+-])[^@\s]*@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi, '$1***@$2')
  .replace(/\b(\d{6})\d{8}(\d{3}[\dXx])\b/g, '$1********$2')
  .slice(0, maxLength);

const sanitizeUrl = (value, config = {}) => {
  const privacy = resolvePrivacyConfig(config);
  if (!privacy.enable || !value) return String(value || '');

  try {
    const url = new URL(String(value), typeof window !== 'undefined' ? window.location.href : undefined);
    url.searchParams.forEach((parameterValue, parameterName) => {
      if (isSensitiveField(parameterName, privacy.maskFields)) {
        url.searchParams.set(parameterName, MASKED_VALUE);
      } else {
        url.searchParams.set(
          parameterName,
          maskSensitiveText(parameterValue, privacy.maxValueLength)
        );
      }
    });

    url.hash = maskSensitiveText(url.hash, privacy.maxValueLength)
      .replace(/(password|token|authorization|secret)=([^&]+)/gi, `$1=${MASKED_VALUE}`);
    return url.href;
  } catch (error) {
    return maskSensitiveText(value, privacy.maxValueLength);
  }
};

const shouldIgnoreUrl = (url, ignoreUrls = []) => ignoreUrls.some(rule => {
  if (rule instanceof RegExp) return rule.test(url);
  return String(url).includes(String(rule));
});

const URL_FIELDS = new Set(['url', 'resourceurl', 'pageurl', 'fullurl', 'from', 'to']);

const sanitizeValue = (value, config = {}, fieldName = '', depth = 0) => {
  const privacy = resolvePrivacyConfig(config);
  if (!privacy.enable) return value;
  if (depth > 5) return '[TRUNCATED]';
  if (isSensitiveField(fieldName, privacy.maskFields)) return MASKED_VALUE;

  if (typeof value === 'string') {
    if (URL_FIELDS.has(normalizeFieldName(fieldName))) {
      return sanitizeUrl(value, privacy);
    }
    const maxLength = normalizeFieldName(fieldName) === 'text'
      ? privacy.maxTextLength
      : privacy.maxValueLength;
    return maskSensitiveText(value, maxLength);
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map(item => sanitizeValue(item, privacy, '', depth + 1));
  }

  if (value && typeof value === 'object') {
    return Object.keys(value).reduce((result, key) => {
      result[key] = sanitizeValue(value[key], privacy, key, depth + 1);
      return result;
    }, {});
  }

  return value;
};

const sanitizeBreadcrumbData = (data, config = {}) => sanitizeValue(data, config);

export {
  DEFAULT_MASK_FIELDS,
  MASKED_VALUE,
  resolvePrivacyConfig,
  isSensitiveField,
  maskSensitiveText,
  sanitizeUrl,
  shouldIgnoreUrl,
  sanitizeValue,
  sanitizeBreadcrumbData
};

