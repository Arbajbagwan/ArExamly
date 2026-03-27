const { randomUUID } = require('crypto');

const jobs = new Map();
const JOB_TTL_MS = 60 * 60 * 1000;

const createJob = ({ type, ownerId }) => {
  const id = randomUUID();
  const now = Date.now();
  jobs.set(id, {
    id,
    type,
    ownerId: String(ownerId || ''),
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    result: null,
    error: null
  });
  return id;
};

const updateJob = (id, patch = {}) => {
  const job = jobs.get(id);
  if (!job) return null;
  const updated = { ...job, ...patch, updatedAt: Date.now() };
  jobs.set(id, updated);
  return updated;
};

const getJob = (id) => jobs.get(id) || null;

const canAccessJob = (job, user) => {
  if (!job || !user) return false;
  if (user.role === 'admin') return true;
  return String(job.ownerId) === String(user._id);
};

setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (now - (job.updatedAt || job.createdAt || now) > JOB_TTL_MS) {
      jobs.delete(id);
    }
  }
}, 10 * 60 * 1000).unref();

module.exports = {
  createJob,
  updateJob,
  getJob,
  canAccessJob
};
