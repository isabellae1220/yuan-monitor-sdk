const mongoose = require('mongoose');

const { Schema } = mongoose;

const sourceMapArtifactSchema = new Schema({
  appKey: { type: String, required: true, trim: true },
  environment: { type: String, required: true, trim: true },
  release: { type: String, required: true, trim: true },
  generatedFile: { type: String, required: true, trim: true },
  sourceCount: { type: Number, default: 0, min: 0 },
  rawMap: { type: Schema.Types.Mixed, required: true }
}, {
  strict: true,
  minimize: false,
  versionKey: false,
  timestamps: { createdAt: 'uploadedAt', updatedAt: 'updatedAt' }
});

// 同一个项目、环境和发布版本中，一个生成文件只能对应一份 Map。
sourceMapArtifactSchema.index(
  { appKey: 1, environment: 1, release: 1, generatedFile: 1 },
  { unique: true }
);
sourceMapArtifactSchema.index({ appKey: 1, environment: 1, release: 1 });

module.exports = mongoose.models.SourceMapArtifact ||
  mongoose.model('SourceMapArtifact', sourceMapArtifactSchema);
