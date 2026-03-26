# ArExamly

Role-based online examination platform with support for `MCQ`, `Theory`, and `Passage` question types.

## 1. Tech Stack
- Frontend: React + Vite + Tailwind + DaisyUI
- Backend: Node.js + Express + MongoDB (Mongoose)
- Auth: JWT + cookie + examinee session token takeover check
- Optional cache: Redis
- Reports: PDF generation (`pdfkit` backend, `jspdf` frontend export flows)
- Load testing: `k6` scripts in `loadtest/`

## 2. Core Features
- Role-based access:
  - `admin`: manages superusers
  - `superuser`: manages subjects, passages, questions, exams, examinees
  - `examinee`: takes assigned exams, views own results
- Question types:
  - `mcq`
  - `theory`
  - `passage` (single passage with mixed sub-questions: MCQ + Theory)
- Exam creation modes:
  - Manual question selection
  - Auto-pick (random) with per-type counts: MCQ, Theory, Passage
- Exam experience:
  - Start/resume attempt
  - Auto-save answers
  - Timer + proctoring wrapper
  - Submit + evaluation pipeline
- Evaluation:
  - Auto-score MCQ
  - Manual evaluation for theory (including passage theory sub-questions)
- Reports:
  - Individual attempt PDF
  - Download all PDFs as ZIP (superuser/admin)

## 3. Repository Structure
```text
ArExamly/
  client/      # React frontend
  server/      # Express backend
  loadtest/    # k6 performance scripts
```

## 4. Prerequisites
- Node.js 18+
- MongoDB 6+
- Redis (optional, for caching)
- k6 (optional, for load testing)

## 5. Local Setup

### Backend
```powershell
cd server
npm install
```

Create `server/.env`:
```env
NODE_ENV=development
PORT=5011
MONGO_URI=mongodb://127.0.0.1:27017/arexamly
JWT_SECRET=replace-with-strong-secret
FRONTEND_URL=http://localhost:5173

# Optional Redis
# REDIS_HOST=127.0.0.1
# REDIS_PORT=6379
# REDIS_PASSWORD=
```

Run backend:
```powershell
npm run dev
```

### Frontend
```powershell
cd client
npm install
```

Create `client/.env` (or copy from `client/.env.example`):
```env
VITE_API_URL=http://localhost:5011/api
VITE_SESSION_INITIAL_DELAY_MS=1500
VITE_SESSION_POLL_EXAM_MS=30000
VITE_SESSION_POLL_IDLE_MS=90000
VITE_SESSION_BACKOFF_STEP_MS=10000
VITE_SESSION_BACKOFF_MAX_MS=60000
VITE_SESSION_MAX_FAILURES=2
```

Run frontend:
```powershell
npm run dev
```

Build frontend:
```powershell
npm run build
```

## 6. Main API Groups
- `POST /api/auth/login`
- `POST /api/auth/register` (protected, role-restricted)
- `GET /api/auth/me`
- `POST /api/auth/check-session`

- `GET/POST /api/subjects`
- `GET/POST /api/passages`
- `GET/POST /api/questions`
- `GET/POST /api/exams`

- `POST /api/attempts/:examId/start`
- `PUT /api/attempts/:attemptId/answer`
- `POST /api/attempts/:attemptId/submit`
- `PUT /api/attempts/:attemptId/evaluate`
- `GET /api/attempts/:attemptId/pdf`
- `GET /api/attempts/my`

## 7. Passage Question Model (Functional Summary)
- Passage content is stored as a dedicated passage entity and linked from question via `passageRef`.
- A `passage` question contains `subQuestions`.
- Each sub-question can be:
  - `mcq` (auto-evaluated)
  - `theory` (manual evaluation)
- In attempts, passage answers are stored in `passageResponses`.

## 8. Security and Access Rules
- JWT-based route protection (`Authorization: Bearer <token>` and cookie support)
- Role middleware enforces admin/superuser/examinee boundaries
- Examinees only see their own attempts/results
- Superusers/admins work within their created scope (ownership filtering)

## 9. Performance and Load Testing
Use files in `loadtest/`:
- [k6 script](loadtest/k6-exam-flow.js)
- [example users CSV](loadtest/users.csv.example)
- [loadtest guide](loadtest/README.md)

Quick run:
```powershell
k6 run `
  -e BASE_URL=http://localhost:5011 `
  -e EXAM_ID=PUT_REAL_EXAM_ID `
  -e USERS_CSV=.\loadtest\users.csv `
  .\loadtest\k6-exam-flow.js
```

Note: default backend rate limit may throttle high concurrency tests (`server/server.js`).

## 10. Deployment Checklist (Own Server)
1. Provision Node.js + MongoDB (+ optional Redis) and reverse proxy (Nginx).
2. Set production env vars (`JWT_SECRET`, `MONGO_URI`, `FRONTEND_URL`, etc.).
3. Build frontend and serve static files (or host separately).
4. Run backend via process manager (`pm2`, `systemd`, or Docker).
5. Enable HTTPS and secure cookie settings.
6. Configure backups for MongoDB.
7. Run staged load test before live exams.
8. Monitor CPU, memory, DB latency, and API error rates during exams.

### Scripted Deployment (Recommended)
This repository includes:
- PM2 app config: `ecosystem.config.js`
- Linux deploy script: `deploy/deploy.sh`
- Windows deploy script: `deploy/deploy.ps1`
- CI deploy workflow: `.github/workflows/deploy.yml`

Linux server deploy:
```bash
cd /var/www/arexamly
chmod +x deploy/deploy.sh
APP_DIR=/var/www/arexamly BRANCH=main API_NAME=arexamly-api ./deploy/deploy.sh
```

Windows server deploy:
```powershell
cd D:\apps\arexamly
powershell -ExecutionPolicy Bypass -File .\deploy\deploy.ps1 -AppDir "D:\apps\arexamly" -Branch "main" -ApiName "arexamly-api"
```

PM2 initial start:
```bash
pm2 start ecosystem.config.js --only arexamly-api --env production
pm2 save
```

GitHub Actions secrets required:
- `SERVER_HOST`
- `SERVER_USER`
- `SERVER_SSH_KEY`
- `SERVER_PORT`
- `APP_DIR`

## 11. Known Operational Notes
- Session check polling is adaptive:
  - faster during exam
  - slower outside exam
  - paused when tab is hidden
- Theory evaluation is required for final scoring when theory answers exist.
- Large concurrency requires infra tuning (DB indexes, rate limits, horizontal scaling).

## 12. License / Ownership
Project-internal usage unless a separate license is defined by your team.
