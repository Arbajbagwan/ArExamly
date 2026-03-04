const Redis = require('ioredis');

let client = null;

const buildRedisOptions = () => {
  const redisUrl = process.env.REDIS_URL;
  const useTls = String(process.env.REDIS_TLS || '').toLowerCase() === 'true';

  const common = {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    retryStrategy: (times) => {
      if (times > 10) return null;
      return Math.min(times * 500, 5000);
    }
  };

  if (redisUrl) {
    return {
      redisUrl,
      options: {
        ...common,
        ...(redisUrl.startsWith('rediss://') || useTls ? { tls: {} } : {})
      }
    };
  }

  if (!process.env.REDIS_HOST) return null;

  return {
    redisUrl: null,
    options: {
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT || 6379),
      password: process.env.REDIS_PASSWORD || undefined,
      ...common,
      ...(useTls ? { tls: {} } : {})
    }
  };
};

const initRedis = async () => {
  if (client) return client;

  const cfg = buildRedisOptions();
  if (!cfg) return null;

  try {
    client = cfg.redisUrl
      ? new Redis(cfg.redisUrl, cfg.options)
      : new Redis(cfg.options);

    client.on('connect', () => console.log('Redis connected'));
    client.on('ready', () => console.log('Redis ready'));
    client.on('error', (err) => {
      console.error('Redis error:', err?.message || err, err?.code ? `(code=${err.code})` : '');
    });

    await client.connect().catch(() => {});
    return client;
  } catch (error) {
    console.error('Redis init failed:', error?.message || error);
    client = null;
    return null;
  }
};

const getRedis = () => client;

module.exports = {
  initRedis,
  getRedis
};
