# ArExamly HLD and Architecture

## 1. Purpose
ArExamly is a role-based online examination platform built on a MERN-style stack.
It supports:
- Admin management of super users
- Super user management of examinees, subjects, questions, passages, and exams
- Examinee exam taking, resume, submission, and result viewing
- Mixed question types: MCQ, Theory, and Passage-based sub-questions
- Per-user attempt tracking with strict server-controlled time expiry

## 2. Technology Stack
### Frontend
- React
- React Router
- Axios
- Tailwind CSS
- DaisyUI
- React Quill / KaTeX for rich question content
- jsPDF / jspdf-autotable / JSZip for result exports

### Backend
- Node.js
- Express
- Mongoose
- JWT authentication
- Cookie parser
- Helmet
- HPP
- express-rate-limit
- Redis / ioredis for rate-limit/cache integration
- PDFKit for attempt PDF generation
- Multer for Excel bulk upload

### Data Stores
- MongoDB as primary datastore
- Redis as optional cache/rate-limit store

## 3. High-Level Architecture
```text
Browser (React SPA at /arexamly)
    |
    | HTTPS
    v
Reverse Proxy (Apache / Nginx)
    |
    | Proxy /arexamly -> Node static SPA
    | Proxy /api -> Node API
    v
Express Application
    |
    |-- Auth + RBAC middleware
    |-- Domain routes/controllers
    |-- Rate limiter
    |-- Error handler
    |
    +--> MongoDB
    +--> Redis (optional but supported)
```

## 4. Logical Components
### 4.1 Frontend SPA
Main responsibilities:
- Authentication state and token persistence
- Role-based routing
- Super user CRUD screens
- Examinee instruction, exam-taking, timer, autosave, and results
- Shared alert UX via DaisyUI-backed alert context

Important frontend modules:
- `client/src/App.jsx`: route map and role-gated route layout
- `client/src/contexts/AuthContext.jsx`: login/logout/auth bootstrap
- `client/src/contexts/ExamContext.jsx`: shared superuser data cache
- `client/src/services/api.js`: Axios instance, token attach, 401 redirect behavior
- `client/src/components/examinee/ExamInterface.jsx`: exam flow, autosave, submit, timer integration
- `client/src/components/examinee/Timer.jsx`: server-synced countdown using `expiresAt`
- `client/src/components/common/SessionChecker.jsx`: examinee session takeover polling

### 4.2 Backend API Layer
Main responsibilities:
- JWT auth and role enforcement
- CRUD/business operations for users, subjects, questions, passages, exams, attempts
- Exam start/resume/submit logic
- Strict exam timing and forced expiry handling
- Bulk upload handling for users and questions
- PDF generation for attempt reports

Important backend modules:
- `server/server.js`: app bootstrap, security middleware, route mounting, SPA serving
- `server/middleware/authMiddleware.js`: JWT validation and current user load
- `server/middleware/roleMiddleware.js`: role-based access control
- `server/middleware/errorHandler.js`: centralized API error response formatting
- `server/controllers/*.js`: route business logic

### 4.3 Persistence Layer
Mongoose models:
- `User`
- `Subject`
- `Question`
- `Passage`
- `Exam`
- `ExamAttempt`

## 5. Roles and Access Model
### Admin
- Creates and manages super users
- Can view protected admin routes

### Superuser
- Creates and manages examinees
- Creates and manages subjects
- Creates and manages questions and passages
- Creates exams and assigns questions/examinees
- Evaluates theory/passage theory answers
- Downloads result PDFs

### Examinee
- Sees assigned exams only
- Starts/resumes exam
- Saves answers
- Submits exam
- Views own result attempts

## 6. Core Domain Model
### 6.1 User
Source: `server/models/User.js`

Fields:
- `firstname`, `lastname`
- `username` (unique, lowercase)
- `email` (optional, sparse)
- `password` (bcrypt hashed)
- `role`: `admin | superuser | examinee`
- `isActive`
- `createdBy`
- `lastLogin`
- `sessionToken` for examinee single-session enforcement

Behavior:
- Password hashed in `pre('save')`
- Supports `comparePassword()`
- Supports `changedPasswordAfter()`

### 6.2 Subject
Purpose:
- Logical grouping for questions
- Scoped to creator for superuser views

### 6.3 Passage
Purpose:
- Shared reading block attached to a passage-type question

Fields:
- `title`
- `text`
- `topic`
- `complexity`
- `marksLabel`
- `createdBy`
- `isActive`

### 6.4 Question
Purpose:
- Stores standalone MCQ/Theory or Passage shell with sub-questions

Effective types in code:
- `mcq`
- `theory`
- `passage`

Important fields:
- `question` (HTML-rich content)
- `options[]`
- `correctOption`
- `credit`
- `subject`
- `topic`
- `difficulty`
- `passageRef`
- `subQuestions[]` for passage questions

### 6.5 Exam
Source: `server/models/Exam.js`

Purpose:
- Defines scheduled assessment and assignment scope

Important fields:
- `title`, `description`
- `duration`
- `totalMarks`, `passingMarks`
- `instructions`, `customInstructions[]`, `instructionLink`
- `startAt`, `endAt`
- legacy compatibility: `scheduledDate`, `startTime`, `endTime`
- `questions[]` with explicit order
- `assignedTo[]`
- `selectionMode`: `manual | random`
- `randomConfig`
- `shuffleQuestions`, `shuffleOptions`
- `status`: `draft | scheduled | active | completed | cancelled`
- `createdBy`
- `isActive`

### 6.6 ExamAttempt
Source: `server/models/ExamAttempt.js`

Purpose:
- Single attempt per examinee per exam
- Stores answers, score, and strict timing

Important fields:
- `exam`
- `examinee`
- `startedAt`
- `expiresAt`
- `submittedAt`
- `timeSpent`
- `answers[]`
- `totalMarksObtained`
- `totalMarksPossible`
- `percentage`
- `status`: `in-progress | submitted | evaluated | auto-submitted`
- `ipAddress`, `userAgent`

Timing model:
- `startedAt` is set when attempt is created
- `expiresAt` is fixed at start and governs resume/save/submit
- This enables strict no-pause timer behavior

## 7. Request Flow Overview
### 7.1 Login Flow
1. Client posts credentials to `/api/auth/login`
2. Backend verifies user and password
3. JWT token returned in JSON and HTTP-only cookie
4. For examinee, `sessionToken` is rotated and returned
5. Frontend stores token in local storage and session token for examinee

### 7.2 Superuser Management Flow
1. Superuser route mounts `ExamProvider`
2. Provider fetches exams, questions, subjects, and examinees once
3. Screens reuse context state and refresh selectively

### 7.3 Exam Start / Resume Flow
1. Examinee opens instruction screen via `/api/exams/:id`
2. On proceed, client posts to `/api/attempts/:examId/start`
3. Backend validates:
   - assignment
   - exam window
   - prior attempt state
   - expiry
4. Backend either:
   - creates new attempt with `startedAt` and `expiresAt`, or
   - resumes existing in-progress attempt
5. Response returns attempt, question payload, `serverNow`, and `expiresAt`

### 7.4 Answer Save Flow
- MCQ answers save immediately
- Theory answers are debounced on frontend and flushed on blur/submit
- Backend validates attempt is still active and not expired

### 7.5 Submit Flow
1. Client flushes pending text saves
2. Client posts to `/api/attempts/:attemptId/submit`
3. Backend checks expiry
4. Backend calculates objective marks and finalizes attempt status

### 7.6 Evaluation Flow
1. Superuser fetches attempts for an exam
2. Opens evaluation modal for theory / passage-theory answers
3. Posts marks and feedback to `/api/attempts/:attemptId/evaluate`
4. Backend recalculates totals and marks attempt `evaluated`

## 8. Timing and Session Guarantees
### 8.1 Exam Timer
Current design is server-authoritative.

Strict rules:
- Browser time is not trusted
- `expiresAt` is fixed at attempt creation
- Resume does not pause time
- If a 60-minute exam starts and user disconnects after 30 minutes, then returns 15 minutes later, remaining time is 15 minutes

### 8.2 Session Takeover
Current model:
- Examinee receives `sessionToken` at login
- `SessionChecker` calls `/api/auth/check-session` periodically on exam route
- If another login rotates the token, old session is invalidated client-side

Current architecture note:
- This is polling-based, not websocket-based
- Backend still enforces auth on protected routes

## 9. Security Controls
Implemented controls:
- JWT auth (`Authorization: Bearer <token>` and cookie support)
- RBAC middleware
- bcrypt password hashing
- Helmet
- HPP
- Rate limiting on `/api`
- Proxy trust enabled: `app.set('trust proxy', 1)`

Observed security-relevant behavior:
- SPA is served under `/arexamly`
- API is mounted under `/api`
- Missing asset requests under `/arexamly` do not fall back to `index.html` if they contain file extensions

## 10. Deployment View
### Runtime Endpoints
- SPA base: `/arexamly`
- API base: `/api`

### Static Serving
- Express serves built frontend from `server/public`
- Reverse proxy should route:
  - `/arexamly/*` -> Node app
  - `/api/*` -> Node app

### Environment Inputs
Typical backend env keys inferred from code:
- `PORT`
- `NODE_ENV`
- `MONGO_URI`
- `FRONTEND_URL`
- `REDIS_URL` or `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_TLS`

## 11. API Contract Summary
Note: response payloads below reflect current implemented controller behavior. Error payloads generally follow:

```json
{
  "success": false,
  "message": "Error message"
}
```

### 11.1 Auth APIs
#### POST `/api/auth/login`
Request:
```json
{
  "username": "john",
  "password": "secret"
}
```
Success 200:
```json
{
  "success": true,
  "token": "jwt-token",
  "user": {
    "_id": "userId",
    "username": "john",
    "role": "examinee",
    "firstname": "John",
    "lastname": "Doe"
  },
  "sessionToken": "hex-token"
}
```
Failure 400/401:
```json
{
  "success": false,
  "message": "Please provide credentials"
}
```
or
```json
{
  "success": false,
  "message": "Invalid credentials"
}
```

#### POST `/api/auth/register`
Success 201:
```json
{
  "success": true,
  "message": "User created successfully",
  "user": {
    "id": "userId",
    "username": "newuser",
    "role": "examinee"
  }
}
```

#### GET `/api/auth/me`
Success 200:
```json
{
  "success": true,
  "user": {
    "_id": "userId",
    "firstname": "John",
    "lastname": "Doe",
    "username": "john",
    "role": "superuser"
  }
}
```

#### PUT `/api/auth/change-password`
Success 200:
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

#### POST `/api/auth/check-session`
Success 200:
```json
{
  "success": true
}
```
Failure 401:
```json
{
  "success": false,
  "message": "Logged in on another device"
}
```

#### POST `/api/auth/logout`
Success 200:
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### 11.2 User APIs
#### GET `/api/users`
Success 200:
```json
{
  "success": true,
  "count": 10,
  "users": []
}
```

#### GET `/api/users/:id`
Success 200:
```json
{
  "success": true,
  "user": {}
}
```

#### PUT `/api/users/:id`
Success 200:
```json
{
  "success": true,
  "message": "User updated successfully",
  "user": {}
}
```

#### DELETE `/api/users/:id`
Success 200:
```json
{
  "success": true,
  "message": "User deleted successfully"
}
```

#### POST `/api/users/bulk-delete`
Success 200:
```json
{
  "success": true,
  "message": "5 users deleted"
}
```

#### POST `/api/users/bulk-activate`
Success 200:
```json
{
  "success": true,
  "message": "5 users activated"
}
```

#### POST `/api/users/bulk-upload`
Success 201:
```json
{
  "success": true,
  "message": "Bulk upload completed!",
  "created": 100,
  "skipped": 2,
  "total": 102,
  "tip": "Skipped rows had duplicate username/email",
  "skippedRows": [
    {
      "row": 4,
      "username": "john",
      "email": "john@example.com",
      "reason": "username already exists"
    }
  ]
}
```
Validation failure 400:
```json
{
  "success": false,
  "message": "Invalid Excel format",
  "errors": []
}
```

#### PUT `/api/users/:id/reset-password`
Success 200:
```json
{
  "success": true,
  "message": "Password reset successfully"
}
```

### 11.3 Subject APIs
#### GET `/api/subjects`
Success 200:
```json
{
  "success": true,
  "count": 4,
  "subjects": []
}
```

#### POST `/api/subjects`
Success 201:
```json
{
  "success": true,
  "message": "Subject created successfully",
  "subject": {}
}
```

#### GET `/api/subjects/:id`
Success 200:
```json
{
  "success": true,
  "subject": {}
}
```

#### PUT `/api/subjects/:id`
Success 200:
```json
{
  "success": true,
  "message": "Subject updated successfully",
  "subject": {}
}
```

#### DELETE `/api/subjects/:id`
Success 200:
```json
{
  "success": true,
  "message": "Subject deleted successfully"
}
```

#### GET `/api/subjects/:id/questions`
Success 200:
```json
{
  "success": true,
  "count": 12,
  "questions": []
}
```

### 11.4 Passage APIs
#### GET `/api/passages`
Success 200:
```json
{
  "success": true,
  "passages": []
}
```

#### POST `/api/passages`
Success 201:
```json
{
  "success": true,
  "passage": {}
}
```

#### PUT `/api/passages/:id`
Success 200:
```json
{
  "success": true,
  "passage": {}
}
```

#### DELETE `/api/passages/:id`
Success 200:
```json
{
  "success": true,
  "message": "Passage deleted"
}
```

### 11.5 Question APIs
#### GET `/api/questions`
Success 200:
```json
{
  "success": true,
  "count": 20,
  "questions": []
}
```

#### GET `/api/questions/:id`
Success 200:
```json
{
  "success": true,
  "question": {}
}
```

#### POST `/api/questions`
Success 201:
```json
{
  "success": true,
  "message": "Question created successfully",
  "question": {}
}
```

#### PUT `/api/questions/:id`
Success 200:
```json
{
  "success": true,
  "message": "Question updated successfully",
  "question": {}
}
```

#### DELETE `/api/questions/:id`
Success 200:
```json
{
  "success": true,
  "message": "Question deleted successfully"
}
```

#### GET `/api/questions/stats`
Success 200:
```json
{
  "success": true,
  "stats": []
}
```

#### POST `/api/questions/bulk-upload`
Success 201:
```json
{
  "success": true,
  "message": "Successfully created 10 questions",
  "createdQuestions": [],
  "failedQuestions": []
}
```

#### POST `/api/questions/upload-image`
Disabled 410:
```json
{
  "success": false,
  "message": "Question image upload is disabled. Use editor text or hosted image URLs."
}
```

### 11.6 Exam APIs
#### GET `/api/exams`
Success 200:
```json
{
  "success": true,
  "count": 5,
  "exams": []
}
```
Notes:
- examinee payload includes `myAttemptStatus` and `myAttemptSubmittedAt`
- superuser payload includes `completedUsersCount`

#### GET `/api/exams/:id`
Success 200:
```json
{
  "success": true,
  "exam": {}
}
```

#### POST `/api/exams`
Success 201:
```json
{
  "success": true,
  "message": "Exam created successfully",
  "exam": {}
}
```

#### PUT `/api/exams/:id`
Success 200:
```json
{
  "success": true,
  "message": "Exam updated successfully",
  "exam": {}
}
```

#### DELETE `/api/exams/:id`
Success 200:
```json
{
  "success": true,
  "message": "Exam deleted successfully"
}
```

#### POST `/api/exams/:id/questions`
Success 200:
```json
{
  "success": true,
  "message": "Questions assigned successfully",
  "exam": {}
}
```

#### POST `/api/exams/:id/assign`
Success 200:
```json
{
  "success": true,
  "message": "Examinees assigned successfully",
  "exam": {}
}
```

#### POST `/api/exams/:id/generate-questions`
Success 200:
```json
{
  "success": true,
  "message": "Random rules saved! Questions will be picked uniquely when each users starts.",
  "exam": {}
}
```

#### POST `/api/exams/upload-instruction-pdf`
Disabled 410:
```json
{
  "success": false,
  "message": "Instruction PDF upload is disabled. Use custom instructions text or an instruction link instead."
}
```

### 11.7 Attempt APIs
#### POST `/api/attempts/:examId/start`
Success 200:
```json
{
  "success": true,
  "message": "Exam started!",
  "attempt": {
    "_id": "attemptId",
    "startedAt": "2026-03-12T10:00:00.000Z",
    "expiresAt": "2026-03-12T11:00:00.000Z",
    "answers": []
  },
  "exam": {},
  "serverNow": "2026-03-12T10:00:01.000Z",
  "expiresAt": "2026-03-12T11:00:00.000Z"
}
```
Resume case message may be `Resuming exam...`

Failure 400 examples:
```json
{
  "success": false,
  "message": "Exam has not started yet"
}
```
```json
{
  "success": false,
  "message": "Exam has ended"
}
```
```json
{
  "success": false,
  "message": "Exam time is over"
}
```

#### PUT `/api/attempts/:attemptId/answer`
Success 200:
```json
{
  "success": true,
  "message": "Answer saved successfully"
}
```
Failure 400 example:
```json
{
  "success": false,
  "message": "Time limit exceeded. Exam auto-submitted."
}
```

#### POST `/api/attempts/:attemptId/submit`
Success 200:
```json
{
  "success": true,
  "message": "Exam submitted successfully",
  "attempt": {}
}
```

#### GET `/api/attempts/my`
Success 200:
```json
{
  "success": true,
  "attempts": []
}
```

#### GET `/api/attempts/exam/:examId`
Success 200:
```json
{
  "success": true,
  "count": 10,
  "attempts": []
}
```

#### PUT `/api/attempts/:attemptId/evaluate`
Success 200:
```json
{
  "success": true,
  "message": "Theory answers evaluated successfully",
  "attempt": {}
}
```

#### DELETE `/api/attempts/:attemptId`
Success 200:
```json
{
  "success": true,
  "message": "Attempt deleted successfully"
}
```

#### GET `/api/attempts/:attemptId/pdf`
Success:
- Binary PDF stream with `Content-Type: application/pdf`

## 12. Frontend Architecture Notes
### Routing
- `BrowserRouter` with basename from `import.meta.env.BASE_URL`
- Public routes:
  - `/login`
  - `/unauthorized`
- Admin routes:
  - `/admin/*`
- Superuser routes:
  - `/superuser/dashboard`
  - `/superuser/exams`
  - `/superuser/subjects`
  - `/superuser/questions`
  - `/superuser/examinees`
- Examinee routes:
  - `/examinee/dashboard`
  - `/examinee/exam/:examId`
  - `/examinee/results`

### State Strategy
- `AuthContext` for user/session state
- `ExamContext` for superuser management datasets
- Local component state for form-heavy screens

### Request Minimization Already Present
- `ExamContext` fetches common superuser datasets once per provider mount
- `SessionChecker` is scoped to examinee exam route
- Theory answer autosave is debounced on frontend

## 13. Known Architectural Constraints
These are present in code as of this review:
- Session takeover uses polling, not websocket push
- `window.confirm()` is still native in several screens; only alerts have been standardized globally
- `ExamContext` still preloads all superuser datasets together; this is simple but not the minimum-request architecture
- Bulk uploads still use disk-backed Multer temp files
- Some backup/non-runtime files exist in repo, such as `server/server copy.js`

## 14. Recommended Next Architecture Steps
1. Replace native `window.confirm()` with shared DaisyUI confirm dialog
2. Introduce websocket-based session invalidation and reduce polling cadence
3. Split superuser data fetching by route instead of preloading all datasets
4. Move bulk uploads to memory storage or async job processing for larger files
5. Add API schema/versioning documentation if third-party clients will consume the APIs

## 15. Document Scope
This document reflects the current implementation as reviewed from:
- `server/server.js`
- `server/models/*`
- `server/routes/*`
- `server/controllers/*`
- `client/src/App.jsx`
- `client/src/contexts/*`
- `client/src/services/*`
- `client/src/components/examinee/*`
