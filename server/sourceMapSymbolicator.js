const path = require('path');
const { SourceMapConsumer } = require('source-map');
const {
  findSourceMapArtifact
} = require('./repositories/sourceMapRepository');

const DEFAULT_MAX_STACK_DEPTH = 20;

const getGeneratedFile = fileUrl => {
  if (typeof fileUrl !== 'string' || !fileUrl) return '';

  try {
    return path.basename(new URL(fileUrl).pathname);
  } catch (error) {
    const cleanPath = fileUrl.split(/[?#]/, 1)[0];
    return path.basename(cleanPath.replace(/\\/g, '/'));
  }
};

const parseStackFrames = (stack, maxDepth = DEFAULT_MAX_STACK_DEPTH) => {
  if (typeof stack !== 'string' || !stack.trim()) return [];

  const frames = [];
  const stackLines = stack.split('\n');

  for (const stackLine of stackLines) {
    if (frames.length >= maxDepth) break;

    // V8/Chrome: at fn (https://site/assets/index.js:1:20)
    // 匿名函数: at https://site/assets/index.js:1:20
    const match = stackLine.match(
      /^\s*at\s+(?:(.*?)\s+\()?(.+?):(\d+):(\d+)\)?\s*$/
    );
    if (!match) continue;

    const fileUrl = match[2];
    const generatedFile = getGeneratedFile(fileUrl);
    if (!generatedFile) continue;

    frames.push({
      functionName: match[1] || '<anonymous>',
      fileUrl,
      generatedFile,
      line: Number(match[3]),
      column: Number(match[4])
    });
  }

  return frames;
};

const createFrameResult = frame => ({
  generated: {
    functionName: frame.functionName,
    fileUrl: frame.fileUrl,
    file: frame.generatedFile,
    line: frame.line,
    column: frame.column
  },
  original: null,
  status: 'map_not_found'
});

const summarizeStatus = frameResults => {
  const resolvedCount = frameResults.filter(item => item.status === 'resolved').length;
  const failedCount = frameResults.filter(item => item.status === 'failed').length;
  const missingCount = frameResults.filter(item => item.status === 'map_not_found').length;

  let status = 'map_not_found';
  if (resolvedCount === frameResults.length) status = 'resolved';
  else if (resolvedCount > 0) status = 'partial';
  else if (failedCount > 0) status = 'failed';

  return {
    status,
    frameCount: frameResults.length,
    resolvedCount,
    failedCount,
    missingCount
  };
};

const attachSymbolication = (event, symbolication, resolvedStack = []) => ({
  ...event,
  data: {
    ...event.data,
    resolvedStack,
    symbolication
  }
});

const symbolicateMonitorEvent = async (
  event,
  {
    findArtifact = findSourceMapArtifact,
    SourceMapConsumerClass = SourceMapConsumer,
    maxStackDepth = DEFAULT_MAX_STACK_DEPTH
  } = {}
) => {
  if (event?.eventType !== 'error' || typeof event?.data?.stack !== 'string') {
    return event;
  }

  if (!event.release) {
    return attachSymbolication(event, {
      status: 'missing_release',
      frameCount: 0,
      resolvedCount: 0,
      failedCount: 0,
      missingCount: 0
    });
  }

  const frames = parseStackFrames(event.data.stack, maxStackDepth);
  if (frames.length === 0) {
    return attachSymbolication(event, {
      status: 'no_frames',
      frameCount: 0,
      resolvedCount: 0,
      failedCount: 0,
      missingCount: 0
    });
  }

  const frameResults = frames.map(createFrameResult);
  const frameGroups = new Map();

  frames.forEach((frame, index) => {
    const indexes = frameGroups.get(frame.generatedFile) || [];
    indexes.push(index);
    frameGroups.set(frame.generatedFile, indexes);
  });

  await Promise.all([...frameGroups.entries()].map(async ([generatedFile, indexes]) => {
    try {
      const artifact = await findArtifact({
        appKey: event.appKey,
        environment: event.environment || 'development',
        release: event.release,
        generatedFile
      });

      if (!artifact?.rawMap) return;

      await SourceMapConsumerClass.with(artifact.rawMap, null, consumer => {
        indexes.forEach(index => {
          const frame = frames[index];
          const original = consumer.originalPositionFor({
            line: frame.line,
            column: frame.column
          });

          if (!original.source || original.line == null || original.column == null) {
            return;
          }

          frameResults[index] = {
            ...frameResults[index],
            original: {
              source: original.source,
              line: original.line,
              column: original.column,
              functionName: original.name || frame.functionName
            },
            status: 'resolved'
          };
        });
      });
    } catch (error) {
      console.warn(
        `[Source Map] ${generatedFile} 解析失败，已保留原始堆栈:`,
        error.message
      );
      indexes.forEach(index => {
        frameResults[index] = {
          ...frameResults[index],
          status: 'failed',
          reason: 'invalid_source_map'
        };
      });
    }
  }));

  return attachSymbolication(
    event,
    summarizeStatus(frameResults),
    frameResults
  );
};

module.exports = {
  getGeneratedFile,
  parseStackFrames,
  symbolicateMonitorEvent
};
