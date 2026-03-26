# k6 Exam Load Test

This script simulates examinees:
- Login
- Start exam
- Save answers for `mcq`, `theory`, and `passage` (sub-questions)
- Submit exam

## 1) Prepare CSV

Copy the template and add real examinee credentials:

```powershell
Copy-Item .\loadtest\users.csv.example .\loadtest\users.csv
```

## 2) Run test

```powershell
k6 run `
  -e BASE_URL=http://localhost:5011 `
  -e EXAM_ID=PUT_REAL_EXAM_ID `
  -e USERS_CSV=.\loadtest\users.csv `
  .\loadtest\k6-exam-flow.js
```

## 3) Tune load

Default ramp:
- 10 -> 50 VUs in 1 minute
- 50 -> 200 VUs in 3 minutes
- down to 0 in 1 minute

Override stages:

```powershell
k6 run `
  -e BASE_URL=http://localhost:5011 `
  -e EXAM_ID=PUT_REAL_EXAM_ID `
  -e USERS_CSV=.\loadtest\users.csv `
  -e START_VUS=20 `
  -e STAGE_1_TARGET=200 -e STAGE_1_DURATION=2m `
  -e STAGE_2_TARGET=500 -e STAGE_2_DURATION=5m `
  -e STAGE_3_TARGET=0   -e STAGE_3_DURATION=2m `
  .\loadtest\k6-exam-flow.js
```

## Notes
- Provide enough users in CSV for your target concurrency.
- Your backend currently has rate-limit on `/api/*` (`max: 100` per 10 min/IP). For high-load tests, adjust this in `server/server.js` temporarily or tests will be throttled.
