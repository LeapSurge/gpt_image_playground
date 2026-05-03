# Implementation Plan: Vercel Managed Gateway

## Overview
This plan upgrades the current Vite frontend from direct or user-configured provider access to a Vercel-hosted managed gateway. The target rollout is a small-customer product shape, not a full self-serve SaaS. Users should log in, consume quota, and generate images without seeing provider URLs, API keys, or proxy settings.

Reference spec: [managed-api-gateway-spec.md](./managed-api-gateway-spec.md)

## Scope
- Keep the frontend deployed on Vercel
- Use Vercel Functions for first-party API routes
- Hide all upstream provider secrets on the server
- Support at least two upstream image providers with automatic fallback
- Add minimal customer identity and quota enforcement
- Keep billing manual for the first release

## Non-Goals
- Full self-serve billing and subscription lifecycle
- Complex admin dashboard from day one
- Async queue or job polling architecture
- Fine-grained provider cost accounting exposed to customers

## Architecture Decisions
- Frontend only talks to first-party routes such as `/api/generate`
- Vercel Functions own provider selection, secret injection, timeout handling, and response normalization
- Customer identity is required before image generation is exposed publicly
- Quota is stored server-side and deducted only after successful generation according to explicit rules
- Manual top-ups are acceptable for the first release
- First-release image transport returns `base64` directly to the client rather than storing assets and returning URLs
- First-release generation scope assumes one image per request
- First-release authentication uses a built-in email + access code login flow with a server-issued session cookie
- Local development uses a file-backed store; deployed environments should provide `DATABASE_URL` for durable quota and session storage

## Delivery Strategy
Recommended scope: 7 slices.

Implementation order:
1. Slice 1: Frontend Deconfiguration
2. Slice 4: Vercel Gateway Skeleton
3. Slice 5: First Provider and Multi-Provider Fallback
4. Slice 2: Identity and Customer Foundation
5. Slice 3: Quota Model and Manual Grants
6. Slice 6: Quota Enforcement and Production Hardening
7. Slice 7: Admin Console

This order gets the first-party gateway path working before identity and quota are enforced, which reduces early integration risk.

## Decisions Still Required
- Durable data store for deployed environments: confirm Neon/Postgres provisioning before rollout
- Gateway response shape for generated images: keep the first release on direct `base64`, and define the future switch point for stored URLs only if payload size or provider behavior becomes a problem
- First-release quota unit: decide between flat per-generation charging and weighted credits by output size or quality
- Quota deduction timing and rollback rule: define exactly when usage is committed and when failed requests do not consume quota
- Operator quota grant workflow: decide whether the first release uses a script, internal page, or another controlled tool
- Legacy settings migration: decide whether old client-side API settings are silently discarded, migrated once, or preserved only for local export compatibility
- Rollout gate before public exposure: decide whether the unauthenticated gateway slices will live only in preview/dev until auth enforcement is added
- Multi-image behavior: explicitly decide whether unsupported or partial upstream `n > 1` behavior will be blocked, downgraded to single-image, or handled by server-side fan-out later
- Input-image payload policy: define how much reference-image capability is acceptable before moving to a pre-upload flow
- Admin access model: confirm the first rollout will use `ADMIN_SECRET` rather than a separate administrator identity system

## Slice 1: Frontend Deconfiguration

**Description:** Remove all user-facing provider and proxy configuration from the main UX and switch the frontend request path to a first-party route contract.

**Acceptance criteria:**
- [ ] Settings UI no longer shows API URL, API key, proxy toggle, or provider profile controls
- [ ] Frontend request adapter targets first-party routes only
- [ ] Browser network inspector no longer shows direct third-party image API calls

**Verification:**
- [ ] Build succeeds: `npm run build`
- [ ] Tests pass: `npm test`
- [ ] Manual check: generate flow still renders and submits through the updated UI path

**Dependencies:** None

**Files likely touched:**
- `src/components/SettingsModal.tsx`
- `src/lib/openaiCompatibleImageApi.ts`
- `src/lib/devProxy.ts`
- `src/store.ts`

**Estimated scope:** Medium

## Slice 2: Identity and Customer Foundation

**Description:** Introduce minimal application authentication and customer identity so each request can be tied to a specific customer before quota enforcement is added.

**Acceptance criteria:**
- [ ] Unauthenticated requests to protected first-party routes are rejected
- [ ] Authenticated requests resolve to a stable customer identifier
- [ ] Minimal login flow exists without exposing user-managed provider setup

**Verification:**
- [ ] Build succeeds: `npm run build`
- [ ] Tests pass for auth guards and session lookup
- [ ] Manual check: unauthenticated user is blocked, authenticated user can access the app

**Dependencies:** Slice 4

**Files likely touched:**
- `api/` authentication helpers and route guards
- `src/` auth entry points or provider wiring
- database schema or integration config

**Estimated scope:** Medium

## Slice 3: Quota Model and Manual Grants

**Description:** Add the minimal server-side data model required to track available quota, generation usage, and manual operator grants for a small-customer rollout.

**Acceptance criteria:**
- [ ] Each customer has a queryable current quota balance
- [ ] Usage records can be written for each completed generation
- [ ] Operators can manually add quota without direct database edits

**Verification:**
- [ ] Tests pass for quota math and ledger updates
- [ ] Manual check: grant quota, generate once, and confirm usage record is created
- [ ] Manual check: inspect one customer record and verify remaining balance changed as expected

**Dependencies:** Slice 2

**Files likely touched:**
- database schema or SQL migrations
- `api/` quota helpers
- optional lightweight admin script or internal page

**Estimated scope:** Medium

## Slice 4: Vercel Gateway Skeleton

**Description:** Introduce the first-party Vercel Function routes and server-side adapter boundary that the frontend will rely on for image generation.

**Acceptance criteria:**
- [ ] `api/` routes exist for at least image generation
- [ ] Provider credentials are read from server environment variables only
- [ ] Gateway request and response shapes are defined and stable
- [ ] The first-release response contract for generated images is defined around direct `base64`

**Verification:**
- [ ] Build succeeds: `npm run build`
- [ ] Vercel local or preview deployment returns a valid mock or single-provider response from `/api/generate`
- [ ] Browser network inspector shows only first-party API traffic

**Dependencies:** Slice 1

**Files likely touched:**
- `api/generate.ts` or equivalent route file
- `src/lib/` frontend request adapter
- shared types for gateway requests and responses

**Estimated scope:** Medium

## Slice 5: First Provider and Multi-Provider Fallback

**Description:** Connect the first real provider through the gateway, then add a second provider plus fallback logic, timeout handling, and normalized error behavior.

**Acceptance criteria:**
- [ ] First provider can generate images end-to-end through the gateway
- [ ] Second provider can be used as a fallback
- [ ] Primary provider failure or timeout triggers fallback automatically
- [ ] Frontend receives one normalized success shape and one normalized error shape
- [ ] First-release implementation handles one generated image per request reliably

**Verification:**
- [ ] Tests pass for provider selection and fallback order
- [ ] Manual check: primary provider success path returns an image
- [ ] Manual check: force provider failure and confirm fallback succeeds

**Dependencies:** Slice 4

**Files likely touched:**
- `api/` provider adapters
- provider selection and timeout utilities
- gateway response normalization logic

**Estimated scope:** Medium

## Slice 6: Quota Enforcement and Production Hardening

**Description:** Enforce quota during generation, record usage, add rate limiting and logging, and document the production deployment and failure model for a Vercel-only rollout.

**Acceptance criteria:**
- [ ] Generate requests require authentication and sufficient quota
- [ ] Successful requests deduct quota and create usage logs
- [ ] Failed requests follow explicit non-deduct or rollback rules
- [ ] Production logs show customer, provider, and fallback outcome without leaking secrets
- [ ] Deployment docs state required plan, env vars, and timeout assumptions

**Verification:**
- [ ] Tests pass for quota enforcement, rollback rules, and protected route behavior
- [ ] Manual check: exhausted customer is blocked before upstream provider call
- [ ] Manual check: successful request deducts quota exactly once
- [ ] Manual check: failed request does not corrupt quota balance

**Dependencies:** Slices 2, 3, and 5

**Files likely touched:**
- `api/generate.ts` and shared middleware
- quota service and logging helpers
- deployment documentation

**Estimated scope:** Large

## Slice 7: Admin Console

**Description:** Add a minimal internal admin surface so operators can manage customers and quota without using the CLI directly.

**Acceptance criteria:**
- [ ] `/admin` routes are protected by a server-managed `ADMIN_SECRET` login flow
- [ ] Operators can view customers, current balances, and account status
- [ ] Operators can create customers and issue manual credit grants from the UI
- [ ] Operators can inspect recent usage records without direct database access
- [ ] Admin APIs do not expose provider secrets or raw session tokens

**Verification:**
- [ ] Build succeeds: `npm run build`
- [ ] Tests pass for admin auth guard and key admin actions
- [ ] Manual check: unauthenticated `/admin` access is blocked
- [ ] Manual check: authenticated operator can create a customer and add credits
- [ ] Manual check: usage list shows recent records for at least one customer

**Dependencies:** Slices 2, 3, and 6

**Files likely touched:**
- `api/admin/*`
- `server/` admin auth helpers
- `src/` admin page and shared UI state
- deployment docs for `ADMIN_SECRET`

**Estimated scope:** Medium

## Checkpoint: Gateway Path Ready
After Slices 1, 4, and 5:
- [ ] Frontend no longer calls third-party APIs directly
- [ ] First-party gateway works end-to-end
- [ ] Multi-provider fallback works in manual smoke tests
- [ ] Review before adding identity and quota

## Checkpoint: Customer Controls Ready
After Slices 2 and 3:
- [ ] Authenticated customer identity is stable
- [ ] Quota can be granted and queried
- [ ] Data model is sufficient for manual operations

## Checkpoint: Production Candidate
After Slices 6 and 7:
- [ ] Protected generate flow works end-to-end
- [ ] Quota enforcement is correct
- [ ] Logs and deployment notes are complete
- [ ] Operators can manage customers without CLI access
- [ ] Ready for limited-customer rollout

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Upstream image generation exceeds Vercel function duration | High | Start with synchronous flow, test on target providers early, and keep the option to move only the gateway off Vercel later |
| Generated image payloads exceed Vercel function request or response limits | Medium | First release stays on single-image `base64`; re-evaluate only when larger sizes, more providers, or different output formats are introduced |
| Auth and quota design expands into full SaaS scope | High | Keep manual grants and minimal login in scope; defer self-serve billing and complex RBAC |
| Provider responses differ too much | Medium | Normalize on the server and keep the frontend contract narrow |
| Upstream multi-image behavior is inconsistent | Medium | Treat one image per request as the supported first-release contract and defer server-side fan-out until later |
| Quota deduction bugs create billing disputes | High | Use explicit success criteria for deduction timing, plus unit tests around rollback rules |
| Abuse or cost spikes from exposed gateway routes | Medium | Add authentication first, then rate limiting and provider logging before wider rollout |
| Admin console scope expands into a full back-office product | Medium | Keep the first release limited to customer creation, credit grants, and recent usage only |

## Operational Notes
- Start with manual billing outside the product, such as invoice or payment link plus operator-applied quota grants
- Prefer a simple credit model over provider-specific per-image pricing in the first release
- Keep provider routing policy static at first; dynamic health scoring can wait
- Keep the first release on one image per request unless later provider testing justifies a broader contract
- Keep the first admin release protected by a single `ADMIN_SECRET` session instead of a separate admin user system

## Future Slice Candidates
These are intentionally out of scope for the first rollout:
- Automatic Stripe webhooks that grant quota after payment
- Self-serve account management
- Customer-visible billing history
- Async job queue or polling for long-running generations
- Advanced provider routing based on latency, cost, or health scoring
