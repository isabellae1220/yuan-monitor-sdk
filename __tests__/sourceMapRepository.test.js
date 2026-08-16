jest.mock('../server/models/SourceMapArtifact', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  updateOne: jest.fn()
}));

const SourceMapArtifact = require('../server/models/SourceMapArtifact');
const {
  findSourceMapArtifact,
  listSourceMapArtifacts,
  upsertSourceMapArtifacts
} = require('../server/repositories/sourceMapRepository');

describe('Source Map Repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('以 release 和生成文件为边界执行幂等更新', async () => {
    SourceMapArtifact.updateOne
      .mockResolvedValueOnce({ upsertedCount: 1 })
      .mockResolvedValueOnce({ upsertedCount: 0 });

    const base = {
      appKey: 'app-1',
      environment: 'production',
      release: 'release-1',
      generatedFile: 'index.js',
      rawMap: { sources: ['App.jsx'], mappings: 'AAAA' }
    };
    const result = await upsertSourceMapArtifacts([base, base]);

    expect(result).toEqual({ inserted: 1, updated: 1 });
    expect(SourceMapArtifact.updateOne).toHaveBeenCalledWith(
      {
        appKey: 'app-1',
        environment: 'production',
        release: 'release-1',
        generatedFile: 'index.js'
      },
      {
        $set: {
          rawMap: base.rawMap,
          sourceCount: 1
        }
      },
      { upsert: true, runValidators: true }
    );
  });

  test('元数据查询排除 rawMap', async () => {
    const query = {
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([{ generatedFile: 'index.js' }])
    };
    SourceMapArtifact.find.mockReturnValue(query);

    const result = await listSourceMapArtifacts({
      appKey: 'app-1',
      environment: 'production',
      release: 'release-1'
    });

    expect(SourceMapArtifact.find).toHaveBeenCalledWith({
      appKey: 'app-1',
      environment: 'production',
      release: 'release-1'
    });
    expect(query.select).toHaveBeenCalledWith({ rawMap: 0 });
    expect(result).toEqual([{ generatedFile: 'index.js' }]);
  });

  test('还原时按项目、环境、release 和生成文件精确查询 rawMap', async () => {
    const artifact = { generatedFile: 'index.js', rawMap: { mappings: 'AAAA' } };
    const query = {
      lean: jest.fn().mockResolvedValue(artifact)
    };
    SourceMapArtifact.findOne.mockReturnValue(query);

    const result = await findSourceMapArtifact({
      appKey: 'app-1',
      environment: 'production',
      release: 'release-2',
      generatedFile: 'index.js'
    });

    expect(SourceMapArtifact.findOne).toHaveBeenCalledWith({
      appKey: 'app-1',
      environment: 'production',
      release: 'release-2',
      generatedFile: 'index.js'
    });
    expect(result).toBe(artifact);
  });
});
