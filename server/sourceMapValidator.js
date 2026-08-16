const path = require('path');

const isPlainObject = value => (
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value)
);

const normalizeGeneratedFile = (fileName, rawMap) => {
  const declaredFile = typeof rawMap?.file === 'string' ? rawMap.file : '';
  const uploadedFile = typeof fileName === 'string' ? fileName : '';
  const candidate = declaredFile || uploadedFile.replace(/\.map$/i, '');
  return path.basename(candidate.replace(/[?#].*$/, ''));
};

const normalizeRawSourceMap = rawMap => ({
  version: rawMap.version,
  file: typeof rawMap.file === 'string' ? rawMap.file : '',
  sourceRoot: typeof rawMap.sourceRoot === 'string' ? rawMap.sourceRoot : '',
  sources: rawMap.sources.slice(0, 5000),
  names: Array.isArray(rawMap.names) ? rawMap.names.slice(0, 10000) : [],
  mappings: rawMap.mappings,
  sourcesContent: Array.isArray(rawMap.sourcesContent)
    ? rawMap.sourcesContent.slice(0, 5000)
    : []
});

const validateSourceMapUpload = (body, { maxMaps = 50 } = {}) => {
  const errors = [];

  if (!isPlainObject(body)) {
    return { valid: false, errors: ['request body must be an object'], artifacts: [] };
  }

  const appKey = typeof body.appKey === 'string' ? body.appKey.trim() : '';
  const environment = typeof body.environment === 'string' ? body.environment.trim() : '';
  const release = typeof body.release === 'string' ? body.release.trim() : '';

  if (!appKey || appKey.length > 128) errors.push('appKey is required and must not exceed 128 characters');
  if (!environment || environment.length > 64) errors.push('environment is required and must not exceed 64 characters');
  if (!release || release.length > 128) errors.push('release is required and must not exceed 128 characters');
  if (!Array.isArray(body.maps) || body.maps.length === 0) {
    errors.push('maps must be a non-empty array');
  } else if (body.maps.length > maxMaps) {
    errors.push(`maps must not contain more than ${maxMaps} files`);
  }

  if (errors.length > 0) return { valid: false, errors, artifacts: [] };

  const artifacts = [];
  body.maps.forEach((entry, index) => {
    if (!isPlainObject(entry) || !isPlainObject(entry.map)) {
      errors.push(`maps[${index}].map must be an object`);
      return;
    }

    const rawMap = entry.map;
    if (rawMap.version !== 3) errors.push(`maps[${index}].map.version must be 3`);
    if (!Array.isArray(rawMap.sources)) errors.push(`maps[${index}].map.sources must be an array`);
    if (typeof rawMap.mappings !== 'string' || !rawMap.mappings) {
      errors.push(`maps[${index}].map.mappings is required`);
    }

    const generatedFile = normalizeGeneratedFile(entry.fileName, rawMap);
    if (!generatedFile || generatedFile.length > 255) {
      errors.push(`maps[${index}] generated file is invalid`);
    }

    if (
      rawMap.version === 3 &&
      Array.isArray(rawMap.sources) &&
      typeof rawMap.mappings === 'string' &&
      rawMap.mappings &&
      generatedFile
    ) {
      artifacts.push({
        appKey,
        environment,
        release,
        generatedFile,
        rawMap: normalizeRawSourceMap(rawMap)
      });
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    artifacts: errors.length === 0 ? artifacts : []
  };
};

module.exports = {
  isPlainObject,
  normalizeGeneratedFile,
  normalizeRawSourceMap,
  validateSourceMapUpload
};
