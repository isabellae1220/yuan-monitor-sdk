const mongoose = require('mongoose');

const { Schema } = mongoose;

const sessionReplaySchema = new Schema({
  appKey: { type: String, required: true, trim: true },
  sessionId: { type: String, required: true, trim: true },
  timestamp: { type: Number, required: true },
  duration: { type: Number, default: 0, min: 0 },
  errorCount: { type: Number, default: 0, min: 0 },
  errorOffset: { type: Number, default: -1 },
  lastErrorTime: { type: Number },
  events: { type: [Schema.Types.Mixed], default: [] }
}, {
  strict: true,
  minimize: false,
  versionKey: false,
  timestamps: { createdAt: 'receivedAt', updatedAt: false }
});

sessionReplaySchema.index({ appKey: 1, sessionId: 1, timestamp: -1 });
sessionReplaySchema.index({ appKey: 1, errorCount: -1, timestamp: -1 });

module.exports = mongoose.models.SessionReplay ||
  mongoose.model('SessionReplay', sessionReplaySchema);
