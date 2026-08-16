const {
  normalizeGeneratedFile,
  validateSourceMapUpload
} = require('../server/sourceMapValidator');

const createMap = overrides => ({
  version: 3,
  file: 'assets/index-abc.js',
  sources: ['../src/App.jsx'],
  names: ['handleClick'],
  mappings: 'AAAA',
  sourcesContent: ['export default function App() {}'],
  ...overrides
});

describe('Source Map 上传校验', () => {
  test('从 Map 的 file 字段提取生成文件 basename', () => {
    expect(normalizeGeneratedFile(
      'dist/assets/ignored.js.map',
      createMap({ file: 'assets/index-abc.js' })
    )).toBe('index-abc.js');
  });

  test('接受合法上传并只保留标准 Source Map 字段', () => {
    const result = validateSourceMapUpload({
      appKey: 'test-app-key',
      environment: 'production',
      release: 'react-demo@1.0.0',
      maps: [{
        fileName: 'assets/index-abc.js.map',
        map: createMap({ unexpected: 'drop-me' })
      }]
    });

    expect(result.valid).toBe(true);
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]).toEqual(expect.objectContaining({
      appKey: 'test-app-key',
      environment: 'production',
      release: 'react-demo@1.0.0',
      generatedFile: 'index-abc.js'
    }));
    expect(result.artifacts[0].rawMap.unexpected).toBeUndefined();
  });

  test('拒绝缺少 release 和 mappings 的上传', () => {
    const result = validateSourceMapUpload({
      appKey: 'test-app-key',
      environment: 'production',
      release: '',
      maps: [{ map: createMap({ mappings: '' }) }]
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'release is required and must not exceed 128 characters'
    ]));
  });

  test('限制单次上传文件数量', () => {
    const result = validateSourceMapUpload({
      appKey: 'test-app-key',
      environment: 'production',
      release: 'react-demo@1.0.0',
      maps: [{ map: createMap() }, { map: createMap() }]
    }, { maxMaps: 1 });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('maps must not contain more than 1 files');
  });
});
