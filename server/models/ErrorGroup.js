const mongoose = require('mongoose');

const { Schema } = mongoose;

const errorGroupSchema = new Schema({
  appKey: { type: String, required: true, trim: true },
  environment: { type: String, default: 'development', trim: true },
  fingerprint: { type: String, required: true, trim: true },
  subType: { type: String, required: true, trim: true },
  message: { type: String, default: '' },
  occurrenceCount: { type: Number, default: 1, min: 1 },
  firstSeenAt: { type: Number, required: true },
  lastSeenAt: { type: Number, required: true },
  latestEventId: { type: String, default: '' },
  latestSessionId: { type: String, default: '' },
  latestUserId: { type: String, default: '' },
  latestPageUrl: { type: String, default: '' },
  latestRelease: { type: String, default: '' },
  latestRuntime: { type: Schema.Types.Mixed, default: {} },
  latestData: { type: Schema.Types.Mixed, default: {} },
  latestBreadcrumbs: { type: [Schema.Types.Mixed], default: [] }
}, {
  strict: true,
  minimize: false,
  versionKey: false,
  timestamps: true
});

// 相同项目、环境和 fingerprint 只对应一个错误组。
errorGroupSchema.index(
  { appKey: 1, environment: 1, fingerprint: 1 },
  { unique: true }
);
errorGroupSchema.index({ appKey: 1, lastSeenAt: -1 });

module.exports = mongoose.models.ErrorGroup ||
  mongoose.model('ErrorGroup', errorGroupSchema);
