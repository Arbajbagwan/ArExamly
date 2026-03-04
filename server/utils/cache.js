const { getRedis } = require('../config/redisClient');

const isReady = (redis) => redis && redis.status === 'ready';

const getCache = async (key) => {
  const redis = getRedis();
  if (!isReady(redis)) return null;

  try {
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    return null;
  }
};

const setCache = async (key, value, ttlSeconds = 60) => {
  const redis = getRedis();
  if (!isReady(redis)) return false;

  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    return true;
  } catch (error) {
    return false;
  }
};

const delCache = async (key) => {
  const redis = getRedis();
  if (!isReady(redis)) return false;

  try {
    await redis.del(key);
    return true;
  } catch (error) {
    return false;
  }
};

module.exports = {
  getCache,
  setCache,
  delCache
};

