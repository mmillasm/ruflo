# ADR-321 — Funnel local cold-start seed: a bounded exception to the "zero local promo content" guarantee

**Status**: Accepted
**Date**: 2026-07-28
**Amends**: the "zero local promo content, fully remote-served, fail-closed" guarantee introduced by commit `6193ab7b6` (2026-07-10) and referenced informally as "ADR-311 discipline" in ADR-312 and ADR-318 — see "Naming note" below.
**Related**: ADR-311 (funnel analytics endpoint deployment — the actual numbered ADR-311 document; it specifies the remote feed's deployment, not the zero-local-content policy itself), ADR-301 (funnel content boundaries and ratio), ADR-305 (control precedence), issue #2787, PR #2788 (commit `810b13dcd`)

## Naming note (read before assuming "ADR-311" means what its title says)

The phrase "zero local promo content" and "fail-closed" is **not** written in
the numbered `ADR-311-funnel-analytics-endpoint-deployment.md` document — that
ADR is about where the analytics server lives, its runtime, and its storage
schema. The guarantee actually originates in commit `6193ab7b6`
("feat(funnel): zero local promo content — fully remote-served, fail-closed",
2026-07-10), whose message describes itself as "complet[ing] the ADR-311
remote-message architecture." Later documents (ADR-312 §Consequences,
ADR-318 §Default posture) then cite "ADR-311" as shorthand for that guarantee.
This ADR preserves that informal usage — "the ADR-311 guarantee" below means
the zero-local-content policy from `6193ab7b6`, not the literal text of the
numbered ADR-311 document — because renaming it repo-wide is out of scope
here and would touch files this change has no reason to touch.

## Context

Commit `6193ab7b6` emptied `funnel/messages.ts`'s `MESSAGES` array to `[]` and
made every rotation surface (educational tips, the sponsor promotion, the
disclosure text) exclusively remote-sourced, fetched from
`https://funnel.ruv.io/v1/messages` and cached locally
(`message-transport.ts`). The stated invariant, pinned by a test literally
named `ships ZERO local messages`, was: if the remote feed has never
successfully populated the local cache, the promo row renders nothing. No
local fallback content ships in the package at all.

In practice this meant every fresh install — and every install where the
first remote fetch races the very first statusline render — shows a
completely blank promo/disclosure row for however many 20-second rotation
slots pass before `refreshRemoteMessages()` completes at least once. Because
the disclosure gate (`disclosure.ts`) also sources its text exclusively from
the remote pool, a slow or momentarily-unreachable feed doesn't just delay a
tip — it blocks the disclosure gate itself, so promotional content can never
become eligible (`promoEligible()`) until a disclosure message has rendered
at least once.

Issue #2787 tracked this as a real regression in new-install experience.
Commit `810b13dcd` ("fix: tracker-sweep 2026-07-26 ... + promo seed", PR
#2788) reintroduced a small, hardcoded local seed pool into `MESSAGES` to
close that window, citing "an ADR-311 amendment" that was never actually
drafted as its justification. `funnel.test.ts`'s
`ships ZERO local messages` test was left unmodified and failing at HEAD —
this ADR is that amendment, written after the fact, plus the test rewrite
the original PR should have included.

## Decision

**A bounded local seed in `MESSAGES` is permitted, strictly as a cold-start
fallback, on the following terms:**

1. **Shape stays within the ADR-301 ratio on its own.** The seed pool must
   independently satisfy the same 4-educational-to-1-promotional structural
   ratio the rotation scheduler enforces (`rotation.ts`'s
   `PROMO_SLOT_MODULO = 5`) — not rely on the remote pool to dilute it. At
   the time of this ADR: 8 educational messages, 1 disclosure message, 1
   promotional message (`local.promo.cognitum`, the Cognitum sponsor line).
   A future addition to the seed that breaks this ratio must adjust the
   ratio deliberately, not by accident.
2. **Every seed entry validates through the same untrusted-content pipeline
   as remote messages.** `isValidMessage()` in `messages.ts` makes no
   exception for local origin — schema, 80-column bound, forbidden-sequence
   check, URL allowlist, and (for disclosure-class) the exact manage-tail all
   apply identically. The seed is trusted no more than the remote feed is.
3. **Every seed id is `local.`-prefixed.** This is the mechanism the "remote
   is authoritative" claim actually rests on: `eligibleMessagesFromPools()`
   (`messages.ts`) merges the remote pool and the in-code pool by `id`, remote
   winning on collision. An admin can retire or override any specific seed
   entry — without a CLI release — by having the remote feed ship a message
   with the matching `local.*` id. `disclosure.getDisclosureMessagePool()`
   uses the identical merge for the disclosure surface.
4. **The seed pool must stay small.** It exists to cover a blank-row window
   measured in tens of seconds to low single-digit minutes, not to become a
   parallel content channel. No hard numeric cap is encoded in code today;
   this ADR sets the *expectation* (roughly the current ~10 entries) and
   flags enforcing a cap in `isValidMessage` or a lint/test as a candidate
   follow-up, not a requirement of this decision.

## What this ADR does **not** claim (honesty about the actual mechanism)

The originating commit message (`810b13dcd`) frames the seed as filling
"the ≤ 60s cold-start window before first successful remote fetch" and
states the remote pool "replaces the seed local en cuanto llega" (replaces
the local seed as soon as it arrives). **That framing is not what the code
implements**, and this ADR does not adopt it as a real guarantee:

- `eligibleMessagesFromPools()` has no clock, timer, or "first successful
  fetch" flag. It is a pure function of two arrays: it merges remote ∪ local,
  deduplicated by `id`, remote winning per-`id` on collision. There is no
  code path that removes a `local.*` entry from the merged pool just because
  time has passed or a fetch has succeeded.
- The seed only stops appearing in rotation for a given id if the remote feed
  ships a message with **that exact same id**. If the production
  `funnel.ruv.io/v1/messages` feed's real message ids never collide with
  `local.disclosure.v1` / `local.edu.*` / `local.promo.cognitum` (which is
  the likely case — the live feed was seeded independently, per commit
  `6193ab7b6`, with ids like `disclosure-1..3` and `edu-*` that were never
  verified to match the local seed's naming), the local seed messages
  continue to appear in rotation **indefinitely**, additively alongside the
  remote pool — not just during a bounded cold-start window.
- Concretely: once a remote pool is cached, the merged pool is
  `len(remote) + len(local seed not overridden by id)`. The 1-in-5
  promotional slot then rotates across *all* eligible promotional messages
  from both pools (`rotation.ts`'s `selectMessage`), so
  `local.promo.cognitum` keeps a permanent, non-zero share of promotional
  impressions rather than a cold-start-only one, unless and until the remote
  feed is deliberately updated to reuse its id.

Anyone relying on "the local seed only shows during cold start" as a hard
guarantee — for compliance, for an audit, for a future ADR — is relying on
something this codebase does not enforce. If a true time-boxed handoff is
wanted, it needs an explicit implementation (e.g., suppress `MESSAGES` from
the merge once `getRemoteMessages()` has ever returned a non-empty,
fresh-enough pool) and its own test; that is out of scope for this ADR, which
only formalizes what commit `810b13dcd` actually shipped.

## Consequences

- `funnel.test.ts`'s `ships ZERO local messages` test (and five other tests
  that asserted null/blank-row behavior on an unseeded remote cache) no
  longer hold and are rewritten alongside this ADR to assert the actual
  invariants: the seed's shape and validity, the id-based override
  mechanism, and the (now non-null) cold-start fallback behavior — see the
  rewritten `message content boundaries (ADR-301)`,
  `rotation scheduler (ADR-301 content ratio)`, and
  `promo orchestrator (getFunnelPromo)` blocks in
  `v3/@claude-flow/cli/__tests__/funnel.test.ts`.
- Anyone auditing this codebase against the literal "zero local promo
  content" claim from commit `6193ab7b6` should be pointed at this ADR: the
  claim is no longer true, on purpose, since `810b13dcd` (2026-07-26), and
  this document is where that exception is now recorded rather than left as
  an unreviewed commit-message assertion.
- A genuine time-boxed cold-start-only seed (seed disappears once the remote
  pool is confirmed fresh, not merely once an id collides) remains a
  reasonable future improvement but is explicitly not implemented and not
  claimed here.

## References

- [ADR-311: Funnel analytics endpoint deployment](ADR-311-funnel-analytics-endpoint-deployment.md)
- [ADR-301: (funnel content boundaries — see `funnel/messages.ts` header comment for the enforced ratio/pipeline this ADR's seed pool must also satisfy)]
- [ADR-312: Usage-limit downtime prevention](ADR-312-usage-limit-downtime-prevention.md) — cites "ADR-311 ... zero local content discipline"
- [ADR-318: Spinner verbs surface](ADR-318-spinner-verbs-surface.md) — cites "the ADR-311 informed-consent bar"
- Commit `6193ab7b658c3b82b7f57d01c649776b837286c0` — originating "zero local promo content" change
- Commit `810b13dcd6cc5c90e0b6a1289ad18f358b1a0e48` (PR #2788, issue #2787) — reintroduced the local seed this ADR formalizes
- `v3/@claude-flow/cli/src/funnel/messages.ts` — `MESSAGES`, `isValidMessage`, `eligibleMessagesFromPools`
- `v3/@claude-flow/cli/src/funnel/disclosure.ts` — `getDisclosureMessagePool`, `selectDisclosureMessage`
- `v3/@claude-flow/cli/src/funnel/rotation.ts` — `selectMessage`
