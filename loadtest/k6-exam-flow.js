import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:5011";
const EXAM_ID = __ENV.EXAM_ID || "";
const USERS_CSV = __ENV.USERS_CSV || "./users.csv";
const SAVE_DELAY_MS = Number(__ENV.SAVE_DELAY_MS || 100);
const SUBMIT_AT_END = String(__ENV.SUBMIT_AT_END || "false").toLowerCase() === "true";
const STAGE_1_DURATION = __ENV.STAGE_1_DURATION || "1m";
const STAGE_2_DURATION = __ENV.STAGE_2_DURATION || "3m";
const STAGE_3_DURATION = __ENV.STAGE_3_DURATION || "1m";
const STAGE_4_DURATION = __ENV.STAGE_4_DURATION || "";
const STAGE_5_DURATION = __ENV.STAGE_5_DURATION || "";

if (!EXAM_ID) {
  throw new Error("Missing EXAM_ID env var");
}

const csvText = open(USERS_CSV);
const users = parseUsers(csvText);

if (!users.length) {
  throw new Error("No users found in CSV");
}

function buildStages() {
  const stages = [
    { duration: STAGE_1_DURATION, target: Number(__ENV.STAGE_1_TARGET || 50) },
    { duration: STAGE_2_DURATION, target: Number(__ENV.STAGE_2_TARGET || 200) },
    { duration: STAGE_3_DURATION, target: Number(__ENV.STAGE_3_TARGET || 0) },
  ];

  if (STAGE_4_DURATION) {
    stages.push({
      duration: STAGE_4_DURATION,
      target: Number(__ENV.STAGE_4_TARGET || 0),
    });
  }

  if (STAGE_5_DURATION) {
    stages.push({
      duration: STAGE_5_DURATION,
      target: Number(__ENV.STAGE_5_TARGET || 0),
    });
  }

  return stages;
}

export const options = {
  scenarios: {
    exam_flow: {
      executor: "ramping-vus",
      startVUs: Number(__ENV.START_VUS || 10),
      stages: buildStages(),
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<3000"],
  },
};

const JSON_HEADERS = { "Content-Type": "application/json" };
let startFailureLogs = 0;
const loginDuration = new Trend("login_duration", true);
const startDuration = new Trend("start_duration", true);
const answerDuration = new Trend("answer_duration", true);
const submitDuration = new Trend("submit_duration", true);

export default function () {
  const user = users[(__VU - 1) % users.length];
  const token = login(user);
  if (!token) return;

  const started = startExam(token);
  if (!started) return;

  const { attemptId, questions } = started;
  for (const q of questions) {
    answerQuestion(token, attemptId, q);
    sleep(SAVE_DELAY_MS / 1000);
  }

  if (SUBMIT_AT_END) {
    submitExam(token, attemptId);
  }
}

function login(user) {
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ username: user.username, password: user.password }),
    { headers: JSON_HEADERS }
  );
  loginDuration.add(res.timings.duration);

  const ok = check(res, {
    "login status is 200": (r) => r.status === 200,
    "login has token": (r) => !!safeJson(r)?.token,
  });
  if (!ok) return null;

  return safeJson(res).token;
}

function startExam(token) {
  const res = http.post(
    `${BASE_URL}/api/attempts/${EXAM_ID}/start`,
    "{}",
    authParams(token)
  );
  startDuration.add(res.timings.duration);

  const body = safeJson(res);
  if (res.status !== 200 && startFailureLogs < 15) {
    // eslint-disable-next-line no-console
    console.log(`[start-failed] status=${res.status} body=${res.body}`);
    startFailureLogs += 1;
  }

  const ok = check(res, {
    "start status is 200": (r) => r.status === 200,
    "start returns attempt": () => !!body?.attempt?._id,
    "start returns questions": () => Array.isArray(body?.exam?.questions),
  });
  if (!ok) return null;

  const questions = (body.exam.questions || []).map((x) => x.question).filter(Boolean);
  return { attemptId: body.attempt._id, questions };
}

function answerQuestion(token, attemptId, q) {
  if (q.type === "mcq") {
    saveAnswer(token, attemptId, {
      questionId: q._id,
      selectedOption: 0,
    });
    return;
  }

  if (q.type === "theory") {
    saveAnswer(token, attemptId, {
      questionId: q._id,
      textAnswer: "Load test theory answer",
    });
    return;
  }

  if (q.type === "passage") {
    for (const sq of q.subQuestions || []) {
      if (sq.type === "mcq") {
        saveAnswer(token, attemptId, {
          questionId: q._id,
          subQuestionId: sq._id,
          selectedOption: 0,
        });
      } else {
        saveAnswer(token, attemptId, {
          questionId: q._id,
          subQuestionId: sq._id,
          textAnswer: "Load test passage theory answer",
        });
      }
    }
  }
}

function saveAnswer(token, attemptId, payload) {
  const res = http.put(
    `${BASE_URL}/api/attempts/${attemptId}/answer`,
    JSON.stringify(payload),
    authParams(token)
  );
  answerDuration.add(res.timings.duration);
  check(res, { "save answer status 200": (r) => r.status === 200 });
}

function submitExam(token, attemptId) {
  const res = http.post(
    `${BASE_URL}/api/attempts/${attemptId}/submit`,
    "{}",
    authParams(token)
  );
  submitDuration.add(res.timings.duration);
  check(res, { "submit status 200": (r) => r.status === 200 });
}

function authParams(token) {
  return {
    headers: {
      ...JSON_HEADERS,
      Authorization: `Bearer ${token}`,
    },
  };
}

function safeJson(res) {
  try {
    return res.json();
  } catch (_) {
    return null;
  }
}

function parseUsers(raw) {
  const lines = (raw || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const hasHeader = lines[0].toLowerCase().includes("username");
  const start = hasHeader ? 1 : 0;
  const out = [];

  for (let i = start; i < lines.length; i += 1) {
    const parts = lines[i].split(",").map((p) => p.trim());
    if (parts.length < 2) continue;
    out.push({ username: parts[0], password: parts[1] });
  }

  return out;
}
