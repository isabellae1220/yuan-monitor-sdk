const mongoose = require('mongoose');

const DEFAULT_MONGODB_URI = 'mongodb://127.0.0.1:27017/yuan_monitor';

const connectDatabase = async (uri = process.env.MONGODB_URI || DEFAULT_MONGODB_URI) => {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000
  });

  return mongoose.connection;
};

const disconnectDatabase = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
};

module.exports = {
  DEFAULT_MONGODB_URI,
  connectDatabase,
  disconnectDatabase
};
