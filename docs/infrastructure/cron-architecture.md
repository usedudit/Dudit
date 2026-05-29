# WhatsApp Automation — Cron Architecture

## Overview

The WhatsApp automation system uses a **fully serverless architecture**:

```
cron-job.org (scheduler)
  → protected API routes (ingress)
    → Trigger.dev (async execution)
      → WhatsApp API / Database updates / Audit logs
```

**No Railway cron workers. No secondary services. No polling containers. No long-running processes.**

---

## Architecture Flow

```
┌────────────────────┐
│   cron-job.org     │
│   (every 5 min)    │
└────────┬───────────┘
         │ POST + Bearer token
         ▼
┌────────────────────────────────────┐
│  /api/internal/jobs/*              │
│                                    │
│  1. Validate auth (Bearer token)   │
│  2. Rate limit by IP               │
│  3. Acquire Redis idempotency lock │
│  4. Claim items from DB (atomic)   │
│  5. Enqueue to Trigger.dev         │
│  6. Return quickly (< 5s)          │
└────────────────┬───────────────────┘
                 │
                 ▼
┌────────────────────────────────────┐
│  Trigger.dev (async workers)       │
│                                    │
│  • whatsapp-scheduled-job          │
│  • whatsapp-send-message           │
│  • whatsapp-retry-failed-sends     │
│                                    │
│  With retry, backoff, dead-letter  │
└────────────────────────────────────┘
```

---

## Endpoints

| Endpoint | Purpose | Schedule |
|----------|---------|----------|
| `POST /api/internal/jobs/process-whatsapp-reminders` | Process due scheduled jobs (reminders, quotes) | Every 5 min |
| `POST /api/internal/jobs/process-pending-automations` | Process pending WhatsApp messages | Every 5 min |
| `POST /api/internal/jobs/retry-failed-whatsapp` | Retry failed messages + dead-letter handling | Every 10 min |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `INTERNAL_CRON_SECRET` | **Yes** | Bearer token for cron-job.org authentication |
| `TRIGGER_SECRET_KEY` | **Yes** | Trigger.dev project API key |
| `KV_REST_API_URL` | **Yes** | Upstash Redis URL (for idempotency locks) |
| `KV_REST_API_TOKEN` | **Yes** | Upstash Redis token |

### Generating INTERNAL_CRON_SECRET

```bash
openssl rand -hex 32
```

---

## cron-job.org Setup

### 1. Create Jobs

For each endpoint, create a cron job at [cron-job.org](https://cron-job.org):

**Job 1: Process Reminders**
- URL: `https://your-domain.com/api/internal/jobs/process-whatsapp-reminders`
- Method: `POST`
- Schedule: `*/5 * * * *` (every 5 minutes)
- Headers:
  ```
  Authorization: Bearer YOUR_INTERNAL_CRON_SECRET
  Content-Type: application/json
  ```

**Job 2: Process Pending Messages**
- URL: `https://your-domain.com/api/internal/jobs/process-pending-automations`
- Method: `POST`
- Schedule: `*/5 * * * *` (every 5 minutes)
- Headers:
  ```
  Authorization: Bearer YOUR_INTERNAL_CRON_SECRET
  Content-Type: application/json
  ```

**Job 3: Retry Failed Messages**
- URL: `https://your-domain.com/api/internal/jobs/retry-failed-whatsapp`
- Method: `POST`
- Schedule: `*/10 * * * *` (every 10 minutes)
- Headers:
  ```
  Authorization: Bearer YOUR_INTERNAL_CRON_SECRET
  Content-Type: application/json
  ```

### 2. Expected Responses

| Status | Body | Meaning |
|--------|------|---------|
| `200` | `{ success: true, enqueued: N }` | Jobs enqueued successfully |
| `200` | `{ success: true, skipped: true, reason: "lock_active" }` | Previous execution still running — safe skip |
| `401` | `{ error: "Unauthorized" }` | Missing or invalid Bearer token |
| `405` | `{ error: "Method not allowed" }` | Must use POST |
| `429` | `{ error: "Rate limited" }` | Too many requests from this IP |
| `500` | `{ error: "..." }` | Server error — check logs |

---

## Security

1. **Bearer Token**: Every request must include `Authorization: Bearer INTERNAL_CRON_SECRET`
2. **Method Validation**: Only POST is accepted
3. **Rate Limiting**: 60 requests/minute per IP via Upstash Redis
4. **Idempotency Lock**: Redis-based lock prevents overlapping executions (55s TTL)
5. **Claim-before-enqueue**: DB rows are atomically claimed before enqueue to prevent race conditions

---

## Dead-Letter Handling

Messages that fail more than `max_retries` times (default: 5) are marked as `failed_permanently`:

- Status: `failed_permanently`
- Error message includes last error and attempt count
- Timestamp recorded
- These messages are NOT retried automatically

To reprocess dead-letter messages manually, update their status back to `pending` in the database.

---

## Retry Strategy

### Message Retries (in Trigger.dev)
- 3 attempts per task execution
- Exponential backoff: 3s → 6s → 12s → ... → 60s max

### Enqueue Retries (in cron endpoint)
- 3 attempts to enqueue to Trigger.dev
- Exponential backoff with jitter: 500ms → 1s → 2s

### Retry Jitter (to avoid Meta API bursts)
- Failed messages are re-enqueued with 30-60 second random delay
- Plus 2-second stagger between items in the same batch

---

## Troubleshooting

### Jobs not processing
1. Verify `INTERNAL_CRON_SECRET` is set in your environment
2. Verify `TRIGGER_SECRET_KEY` is set and valid
3. Check cron-job.org execution history for HTTP errors
4. Check application logs for structured JSON entries with `job:` prefix

### Duplicate sends
1. Check if idempotency keys are being generated correctly
2. Verify the `claim_whatsapp_messages` RPC is working (atomically sets status)
3. Check Redis lock status: `cron:lock:process-pending-automations`

### Messages stuck in processing
1. Messages claimed but not enqueued will auto-recover on next cron cycle
2. Failed-to-enqueue messages are reset to `pending` by the cron endpoint

---

## Migration from Railway Cron

| Old (Railway) | New (Serverless) |
|---------------|------------------|
| `scripts/whatsapp-cron.mjs` | **Deleted** — cron-job.org calls API directly |
| `/api/cron/whatsapp-process` | **Deleted** — replaced by 3 internal endpoints |
| `npm run cron:whatsapp` | **Deleted** — no npm cron script |
| `CRON_SECRET` (for WhatsApp) | `INTERNAL_CRON_SECRET` (new, separate) |
| Railway cron container | cron-job.org free tier |
| Inline processing | Trigger.dev async tasks |
| Silent fallback on Trigger.dev failure | Explicit error + cron recovery sweep |
