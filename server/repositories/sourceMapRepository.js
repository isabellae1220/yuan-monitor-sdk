const SourceMapArtifact = require('../models/SourceMapArtifact');

const upsertSourceMapArtifacts = async artifacts => {
  let inserted = 0;
  let updated = 0;

  for (const artifact of artifacts) {
    const result = await SourceMapArtifact.updateOne(
      {
        appKey: artifact.appKey,
        environment: artifact.environment,
        release: artifact.release,
        generatedFile: artifact.generatedFile
      },
      {
        $set: {
          rawMap: artifact.rawMap,
          sourceCount: artifact.rawMap.sources.length
        }
      },
      { upsert: true, runValidators: true }
    );

    if (result.upsertedCount === 1) inserted += 1;
    else updated += 1;
  }

  return { inserted, updated };
};

const listSourceMapArtifacts = async ({ appKey, environment, release } = {}) => {
  const filter = {};
  if (appKey) filter.appKey = appKey;
  if (environment) filter.environment = environment;
  if (release) filter.release = release;

  return SourceMapArtifact.find(filter)
    .select({ rawMap: 0 })
    .sort({ uploadedAt: -1 })
    .lean();
};

const findSourceMapArtifact = async ({
  appKey,
  environment,
  release,
  generatedFile
}) => SourceMapArtifact.findOne({
  appKey,
  environment,
  release,
  generatedFile
}).lean();

module.exports = {
  findSourceMapArtifact,
  listSourceMapArtifacts,
  upsertSourceMapArtifacts
};
