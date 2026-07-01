# Vehicle Tracking (Traccar) — Frame Spec (T2 → future T1 session)

**Status:** Frame complete (T2 planning terminal), research-backed. For a **separate, future T1 session** — build *after* the delivery-signoff units ship.
**Date:** 2026-06-30
**Author:** T2 relay (spec only — no code written here)
**Research:** deep-research run 2026-06-30 (23/25 claims survived 3-way adversarial verification). Key sources: Traccar `TeltonikaProtocolDecoder.java`, Traccar forwarding/API/pricing docs, Teltonika FMC003 wiki, Soracom Beam/VPG docs.

> Frame-level spec: pins down *what/why* and the verified facts so T1's FORGE Frame is a fast
> confirm. Does not prescribe file-level implementation (T1's Order/Render job).
> **Critical framing:** most of this feature is **ops/infra** (a server, SIM config, device
> config) that is NOT application code. The actual **FORGE unit is small** — see §3 vs §4.

---

## 1. Purpose

Get live van GPS positions (from Teltonika FMC003 trackers on Soracom SIMs) into MFS's own
Supabase database, behind a port the app owns, so the **Deliveries page** can show van
positions — and so the data is later usable for **emailing customers ETA updates** and
**internal reporting**. Those two downstream uses are **future, not this build**; this build
delivers the **ingest pipeline + owned store + a clean read seam**.

Hakan's hardware: Teltonika **FMC003** trackers + **Soracom** SIMs. Fleet size: **1–5 vans.**

---

## 2. The verified end-to-end pipeline

```
FMC003 device  →  Soracom Beam (TCP→TCP/TCPS relay)  →  Traccar server (self-hosted VPS)
                                                              │  (built-in position forwarding)
                                                              ▼
                          your app's  /api/tracking/ingest  webhook  →  Supabase vehicle_positions
                                                              │
                                                              ▼
                          Deliveries page reads the Supabase mirror (never Traccar live)
```

**Verified facts behind each hop:**
- **Traccar ↔ FMC003:** Traccar's Teltonika decoder natively supports **Codec 8 + Codec 8
  Extended** (the FMC003's protocol), default **port 5027**. It correctly performs **both**
  Teltonika handshakes — IMEI auth (0x01 accept / 0x00 reject) and the **4-byte record-count
  ACK** that prevents needless resends. No custom binary parsing required. (high confidence, 3-0)
- **Soracom networking (CRITICAL):** a Soracom Air SIM gets **no inbound public IP**, so the
  device cannot dial an arbitrary self-hosted Traccar IP. Solve with **Soracom Beam TCP→TCP/TCPS
  entry point**: device → `beam.soracom.io:8023`, Beam relays raw TCP to your Traccar FQDN+port
  (can add TLS as TCPS — the encryption the FMC003 can't do itself). **Do NOT** use Beam's
  **TCP→HTTP** variant — it Base64-wraps and re-frames the stream, breaking binary Codec 8.
  Beam header-injection options (IMSI/SIM-ID) must be **OFF** or they corrupt the stream.
  (high confidence, 3-0)
- **Ingest is serverless-friendly:** Traccar has **built-in position forwarding** — it POSTs each
  decoded position as JSON to a URL you own (`forward.url` + `forward.type=json`, with
  `forward.retry.enable=true`). So ingest is a **normal webhook**, not an always-on
  WebSocket/poll worker — which matters because **Vercel serverless can't hold a long-lived
  WebSocket**. (forwarding = primary Traccar doc; mirror/poll architecture = medium confidence
  synthesis.)
- **Hosting:** self-host Traccar on a **~£5/mo VPS** beats Traccar's hosted plans ($9.95–$49.95/mo)
  on cost + data ownership for 1–5 vans. Needs a public **FQDN + TLS**. (high, 3-0)
- **License:** Traccar is free, open-source, commercial self-host permitted. (Server license cited
  as GPL-3 in one source, Apache-2.0 in another — either way self-hosting without redistribution
  carries no obligation; confirm only if you ever redistribute a modified server.) (high, 3-0)

---

## 3. OPS / INFRA tasks (NOT a FORGE unit — these are setup, not app code)

These are done by Hakan / an ops session, outside the codebase. T1's FORGE unit (§4) depends on
them but does not perform them:

1. **Stand up a Traccar server** on a small VPS (~£5/mo), with a public FQDN + TLS (Let's Encrypt).
2. **Configure Soracom Beam** TCP→TCP/TCPS: destination = your Traccar FQDN:5027; header injection
   OFF; TLS as TCPS if used.
3. **Configure each FMC003** (Teltonika Configurator, Windows-only, or SMS params):
   - GPRS/APN: `APN=soracom.io`, user `sora`, pass `sora`.
   - First Server: Domain = `beam.soracom.io`, Port = `8023`, Protocol = **TCP**, ACK type = TCP/IP.
   - Enable **Codec 8 Extended**.
   - (SMS form: `setparam 2001:soracom.io;2002:sora;2003:sora;2004:beam.soracom.io;2005:8023;2006:0`)
4. **Register each device** in Traccar (by IMEI) and note its Traccar deviceId.
5. **Bench-test ONE device first** (see §7 risk #1) before rolling out all 5.

---

## 4. The FORGE unit (the app code T1 builds)

Small and clean. Hexagonal, exactly like every other external dependency:

**Scope:**
- **Domain:** `lib/domain/` types — `VehiclePosition` (vehicleId, lat, lng, speed, heading,
  deviceTime, fixTime, accuracy?, attributes?), `Vehicle` (id, label, traccarDeviceId, linked
  driver/route?).
- **Port:** `lib/ports/VehicleTracking.ts` — business operations the app owns, e.g.
  `getLatestPosition(vehicleId)`, `listLatestPositions()`, `getPositionHistory(vehicleId, range)`,
  `recordPosition(input)` (used by the ingest webhook). Plus fake + `__contracts__` contract.
- **Store:** new Supabase **`vehicle_positions`** table (+ a `vehicles` registry mapping a van to
  its Traccar deviceId + optional driver/route link) + migration (full 14-digit filename) + RLS.
- **Ingest webhook:** `app/api/tracking/ingest/route.ts` — receives Traccar's forwarded JSON,
  maps it to a domain `VehiclePosition`, writes via the port. **Must be authenticated** — Traccar's
  `forward.url` carries a shared secret (query token / header); reject un-tokened POSTs (don't let
  anyone spoof van positions). Idempotent on (deviceId, fixTime).
- **Adapter(s):** `lib/adapters/traccar/` — the only place that knows Traccar's wire shape (maps
  Traccar's position JSON → domain; if a poll/history read is needed, calls Traccar's REST API with
  Basic/token auth). The Supabase mirror read/write is a `lib/adapters/supabase/` repository.
  Wiring in `lib/wiring/`.
- **First consumer:** the **Deliveries page** (signoff Unit 2's page, or a follow-on) reads
  `listLatestPositions()` from the Supabase mirror to show van location. The app **never reads
  Traccar live** — only its own mirror. Map rendering reuses the existing leaflet UI-adapter.

**Explicitly OUT of scope for this unit (future):** customer ETA emails, reporting/analytics,
geofencing, route-vs-actual comparison. Build the pipeline + store + read seam first.

**Decision still open for T1's Order (cheap to defer):** ingest via Traccar **forwarding webhook**
(recommended — serverless-clean) vs a **cron poll** of Traccar's REST `/api/positions` (fallback if
forwarding proves fiddly). Spec recommends forwarding; T1 confirms against live Traccar docs.

---

## 5. Architecture guardrails (CLAUDE.md / ADR-0002)

- `VehicleTracking` is a port the app owns; **Traccar is a vendor → its SDK/wire shape lives only
  in `lib/adapters/traccar/`**, mapped to `lib/domain/` (Traccar types never leak past the adapter).
- App (Deliveries page) reads the **Supabase mirror via the port**, never Traccar directly →
  rip-out test stays at **one adapter + one wiring line** (swap Traccar for another telematics
  server = new adapter only).
- New `package.json` entries (if any) need a one-line justification. Migration filename =
  full 14-digit `YYYYMMDDHHMMSS_name.sql`.
- The ingest webhook is a **trust boundary** — authenticate it (shared secret) and validate input.

---

## 6. Acceptance criteria (app FORGE unit)

- A Traccar position POSTed to `/api/tracking/ingest` with the correct secret is mapped to a
  domain `VehiclePosition` and stored in `vehicle_positions`; a POST without the secret is rejected.
- Duplicate forwards (same deviceId + fixTime) don't create duplicate rows (idempotent).
- The Deliveries page renders the latest position per van, read from the Supabase mirror via the
  `VehicleTracking` port — with Traccar/the VPS unreachable, the page still shows last-known
  positions (proves the app doesn't depend on Traccar being live).
- Rip-out test holds (Traccar = one adapter + one wiring line).

---

## 7. Open risks / bench tests before fleet rollout

1. **Beam ACK pass-through (test 1 device first):** confirm Soracom Beam's TCP→TCP relay returns
   Traccar's upstream 4-byte record-count ACK to the FMC003 (a normal TCP proxy does, but Soracom
   docs phrase forwarding one-directionally). If not returned, the device may resend records.
   Also confirm Beam's IMSI/SIM-ID header injection is OFF so it doesn't corrupt Codec 8 or the
   initial IMEI auth packet.
2. **Exact Traccar forward/REST shape:** confirm the current `forward.*` config + REST endpoints
   (`/api/positions?deviceId=`, `/api/session`, auth) against live Traccar docs at build time
   (API shape was medium-confidence synthesis, not primary-verified in the research).
3. **Soracom running cost:** get Soracom's per-MB + Beam request pricing in GBP for the expected
   position-report frequency across 5 vans, to compare true monthly cost vs the £5/mo VPS.
4. **Position frequency vs data/battery:** decide report interval on the FMC003 (moving vs parked)
   — affects data cost, DB volume, and how "live" the Deliveries page feels.

---

## 8. Handoff

This is a **future, separate T1 session**, to run **after the delivery-signoff units ship**. The
ops/infra in §3 should be stood up (and the 1-device bench test passed) before the FORGE unit in §4
is built, since the unit's acceptance needs a live position to flow end-to-end. Touches prod DB +
RLS + a new trust-boundary webhook → **full FORGE + ANVIL**, not frame-light.
