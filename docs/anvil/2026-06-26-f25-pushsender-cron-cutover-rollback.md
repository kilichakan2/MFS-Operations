# F-25 — Rollback note (code-only, no migration)

Date: 2026-06-26
Branch: feat/f25-pushsender-cron-cutover
PR: #85

## What changed

A behaviour-preserving hexagonal re-point. The `web-push` SDK + two raw-Supabase
tables (`push_subscriptions`, `alarm_sessions`) moved behind 3 new owned ports
(`PushSender`, `PushSubscriptionsRepository`, `AlarmSessionsRepository`); the cron's
escalation/cleanup logic lifted into the `runHaccpAlarmCheck` usecase; `lib/webpush.ts`
deleted. **NO migration, NO RLS change, NO new dependency, NO schema change, NO UI
change.** The `push_subscriptions` and `alarm_sessions` tables are read/written with
the exact same columns and semantics as before the PR.

🗣 In plain English: nothing about the database changed — only the wiring of the code
that talks to it. So undoing this is purely a code rollback; there is no data to
recover and nothing to un-migrate.

## Rollback = revert the merge (Vercel auto-redeploys)

Because there is no migration and no schema change, the only rollback action is to
put the old code back:

```
# Option A — Vercel instant rollback (fastest; promotes the previous prod build)
#   Vercel dashboard → Deployments → previous production deploy → "Promote to Production"
#   (or: vercel rollback <previous-prod-deployment-url>)

# Option B — git revert the squash-merge commit and let Vercel redeploy on push
git revert <squash-merge-sha-of-PR-#85>
git push origin main
```

No `supabase db push`. No `supabase db reset`. No PITR. No data migration to reverse.

## Why no PITR

There is no destructive migration (no `DROP` / `TRUNCATE` / `ALTER … TYPE` /
`DROP NOT NULL`) — in fact no migration at all. The data in `push_subscriptions` and
`alarm_sessions` is untouched by this PR in shape or content, so a code revert is
fully sufficient and lossless.

🗣 In plain English: PITR is the "restore the database to an earlier point" lifeboat —
you only need it when a change could damage data. This change can't, so the lifeboat
isn't required; clicking "use the previous build" is the whole rollback.
