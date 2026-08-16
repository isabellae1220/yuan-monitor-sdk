const mongoose = require('mongoose');

const { Schema } = mongoose;

const monitorEventSchema = new Schema({
  eventId: { type: String, required: true, trim: true },
  eventType: {
    type: String,
    required: true,
    enum: ['error', 'performance', 'behavior']
  },
  subType: { type: String, required: true, trim: true },
  appKey: { type: String, required: true, trim: true },
  environment: { type: String, default: 'development', trim: true },
  release: { type: String, default: '', trim: true },
  sessionId: { type: String, default: '', trim: true },
  userId: { type: String, default: '', trim: true },
  userData: { type: Schema.Types.Mixed, default: {} },
  timestamp: { type: Number, required: true },
  pageUrl: { type: String, default: '' },
  runtime: { type: Schema.Types.Mixed, default: {} },
  data: { type: Schema.Types.Mixed, required: true },
  breadcrumbs: { type: [Schema.Types.Mixed], default: [] },
  fingerprint: { type: String, default: '' },
  occurrenceCount: { type: Number, default: 1, min: 1 },
  firstSeenAt: { type: Number },
  lastSeenAt: { type: Number }
}, {
  strict: true,
  minimize: false,
  versionKey: false,
  timestamps: { createdAt: 'receivedAt', updatedAt: false }
});

// 同一次客户端事件即使因网络问题重试，也只能落库一次。
monitorEventSchema.index({ eventId: 1 }, { unique: true });

// 支持监控后台按项目、事件大类和时间范围倒序查询。
monitorEventSchema.index({ appKey: 1, eventType: 1, timestamp: -1 });
monitorEventSchema.index({ appKey: 1, sessionId: 1, timestamp: 1 });
monitorEventSchema.index({ appKey: 1, subType: 1, timestamp: -1 });
monitorEventSchema.index({
  appKey: 1,
  environment: 1,
  eventType: 1,
  fingerprint: 1,
  timestamp: -1
});

module.exports = mongoose.models.MonitorEvent ||
  mongoose.model('MonitorEvent', monitorEventSchema);
