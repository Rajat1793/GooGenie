# Sprint 0: KPI and Observability Baseline

## Product KPIs
- Time to respond to email.
- Time to schedule meeting.
- AI acceptance rate.

## Platform Reliability KPIs
- Webhook processing lag.
- Retry volume.
- Dead-letter queue count.

## Security and AuthZ KPIs
- authz_denied_count (by endpoint, role).
- out_of_scope_attempt_count.
- role_change_count.

## Initial Telemetry Requirements
- Attach trace_id to all error responses.
- Emit structured logs for authz allow and deny decisions.
- Tag all logs by tenant_id and actor_user_id where applicable.

## Review Status
- Status: Baseline approved for instrumentation in Sprint 1 and 2.
