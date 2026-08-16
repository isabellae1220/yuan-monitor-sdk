const getHeader = (headers, targetName) => {
  if (!headers) return '';
  const normalizedName = targetName.toLowerCase();

  if (typeof headers.get === 'function') {
    return headers.get(targetName) || headers.get(normalizedName) || '';
  }

  if (Array.isArray(headers)) {
    const pair = headers.find(([name]) => String(name).toLowerCase() === normalizedName);
    return pair ? pair[1] : '';
  }

  const key = Object.keys(headers)
    .find(name => name.toLowerCase() === normalizedName);
  return key ? headers[key] : '';
};

const normalizeRequestUrl = (input, baseUrl = '') => {
  const rawUrl = typeof input === 'string' || input instanceof URL
    ? String(input)
    : String(input?.url || input || '');

  try {
    return new URL(rawUrl, baseUrl).href;
  } catch (error) {
    return rawUrl;
  }
};

const getFetchRequestInfo = (input, init = {}, baseUrl = '') => ({
  url: normalizeRequestUrl(input, baseUrl),
  method: String(init.method || input?.method || 'GET').toUpperCase(),
  headers: init.headers || input?.headers || null,
  body: init.body
});

const isSdkInternalRequest = ({ url, headers, serverUrl = '', baseUrl = '' }) => {
  if (String(getHeader(headers, 'X-SDK-Internal')).toLowerCase() === 'true') {
    return true;
  }

  if (!serverUrl || !url) return false;

  const requestUrl = normalizeRequestUrl(url, baseUrl);
  const reportBase = String(serverUrl).replace(/\/$/, '');
  return (
    requestUrl.startsWith(`${reportBase}/api/report`) ||
    requestUrl.startsWith(`${reportBase}/api/session-replay`)
  );
};

const isSuccessfulStatus = (status) => status >= 200 && status < 400;

export {
  getHeader,
  normalizeRequestUrl,
  getFetchRequestInfo,
  isSdkInternalRequest,
  isSuccessfulStatus
};

