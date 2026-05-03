# Spec: Managed Multi-API Gateway for Web Frontend

## Assumptions
1. The frontend must not expose upstream provider URLs, API keys, or proxy details to end users.
2. The frontend can be changed to call one first-party endpoint instead of calling provider APIs directly.
3. The first rollout targets image generation requests only.
4. Automatic provider switching means server-side routing and fallback, not user-visible profile switching.
5. The first release targets a small-customer rollout with minimal authentication and quota enforcement, not a full self-serve SaaS.
6. Vercel remains acceptable as the hosting platform unless function duration or operational limits become unacceptable.

## Objective
Replace user-managed API configuration with a server-managed gateway that:
- exposes a single first-party API to the frontend
- stores all upstream API credentials server-side
- automatically selects and falls back between multiple upstream image APIs
- supports minimal customer identity and quota enforcement for a limited rollout

Users should only use the app. They should not configure:
- API URL
- API key
- proxy route
- provider-specific flags

## Tech Stack
- Frontend: existing React + Vite app
- Gateway: Vercel Functions in `api/`
- Secret storage: Vercel environment variables
- Identity: built-in email + access code login with server-issued session cookie
- Identity/quota storage: local JSON file in development, `DATABASE_URL`-backed Neon/Postgres in deployed environments
- Optional routing state: static provider order for the first release

## First-Release Constraints
- Return generated images to the frontend as `base64` in the gateway response
- Default to one generated image per request
- Do not promise multi-image generation in the first release
- Limit reference-image request payloads so they stay within Vercel function body limits
- Keep the option to switch to stored asset URLs later if provider behavior, payload size, or product requirements change

## Commands
Current:
- Dev: `npm run dev`
- Build: `npm run build`
- Test: `npm test`

Gateway-oriented future commands depend on framework choice, but the target frontend behavior is:
- Frontend calls `/api/generate`
- Frontend calls `/api/edit`
- Frontend never calls third-party providers directly

## Project Structure
- `src/` -> shared frontend app
- `src/lib/` -> frontend request adapter should point to first-party gateway only
- `docs/` -> architecture and rollout specs
- `api/` or framework-specific server route directory -> gateway handlers

## Code Style
Provider routing should be isolated behind a server-side interface.

```ts
interface ProviderAdapter {
  name: string
  supports(request: GatewayRequest): boolean
  invoke(request: GatewayRequest): Promise<GatewayResponse>
}
```

The frontend should only know:

```ts
await fetch('/api/generate', { method: 'POST', body: JSON.stringify(payload) })
```

## Testing Strategy
- Unit tests for provider selection and fallback order
- Unit tests for response normalization
- Manual smoke tests for:
  - primary provider success
  - fallback on provider failure
  - hidden credentials in browser network inspector
  - unchanged user flow in UI

## Boundaries
- Always:
  - Keep upstream secrets server-side only
  - Normalize provider responses before returning to frontend
  - Return one stable response shape to the client
- Ask first:
  - Adding persistence for provider health state
  - Introducing queues or async job polling
  - Changing hosting platform away from Vercel
- Never:
  - Put provider API keys in frontend code, env injected into client bundle, or user settings
  - Require end users to pick providers or proxy routes
  - Expose raw upstream provider failures without normalization

## Success Criteria
- No user-facing API URL or API key fields remain in the UI
- Browser network requests only target first-party routes
- Provider credentials live only on the server
- Gateway can automatically route between at least two upstream providers
- Gateway can fail over when the primary provider errors or times out
- Authenticated customer requests can be tied to a stable customer identity
- Server-side quota can be enforced without exposing provider configuration to the client
- Frontend behavior remains simple and provider-agnostic

## Recommended Architecture
Use a backend gateway, not rewrites and not direct frontend fetches.

### Why frontend-only fails
- Secrets cannot be hidden in frontend code
- Automatic multi-provider routing would still expose provider topology
- Browser CORS and per-provider behavior would leak into the client

### Why rewrite-only fails
- Rewrites can proxy one path to one destination
- Rewrites cannot make runtime routing decisions based on health, latency, or error responses
- Rewrites cannot combine retries, fallback, secret injection, or response normalization cleanly

### Backend gateway behavior
1. Frontend sends one request to first-party route
2. Gateway chooses provider based on rule set
3. Gateway injects provider secret server-side
4. Gateway normalizes response into one stable schema
5. If provider fails, gateway retries or falls back to the next provider

## Slice Proposal
Recommended scope: 7 slices.

### Slice 1: Frontend Deconfiguration
- Remove user-facing API URL / API key / proxy configuration path from the main UX
- Replace client request target with one first-party route

### Slice 2: Identity and Customer Foundation
- Add minimal built-in authentication and stable customer identity
- Protect first-party routes from unauthenticated access

### Slice 3: Quota Model and Manual Grants
- Add a minimal server-side quota model
- Support manual operator grants for the first rollout via controlled tooling

### Slice 4: Gateway Skeleton
- Add server route(s) for generate/edit
- Move provider credentials to server env
- Define normalized request/response schema

### Slice 5: First Provider and Multi-Provider Fallback
- Implement one provider end-to-end through the gateway
- Add a second provider plus timeout handling, fallback, and normalized errors

### Slice 6: Quota Enforcement and Hardening
- Enforce auth and quota on generation routes
- Add observability, rate limiting, docs, and deployment settings
- Validate duration limits and production failure modes

### Slice 7: Admin Console
- Add a minimal internal admin console for operators
- Protect admin routes with a server-managed `ADMIN_SECRET` login flow
- Support customer listing, customer creation, manual credit grants, and recent usage inspection
- Keep the admin surface intentionally narrow and internal-only

## Platform Recommendation
Preferred: backend gateway.

For your stated requirements, this is the only clean fit.

### On Vercel
This can work if request duration stays within Vercel Function limits.

Risk:
- image generation requests may run long
- some upstreams already take multiple minutes

If request duration becomes unreliable, move only the gateway backend off Vercel while keeping the frontend on Vercel.

## Open Questions
1. Do you want synchronous image responses only, or can the gateway return job IDs and poll?
2. Is provider priority static, or should routing prefer healthiest/fastest provider dynamically?
3. What is the first-release quota unit: per generation, per image, or weighted credits by size/quality?
4. Should the first release keep the current built-in access-code login, or swap to a third-party auth provider later?
5. When should the project move from file-backed local development storage to mandatory Postgres-backed persistence for all environments?
6. Should the first admin rollout expose only customer + quota operations, or also include trial-IP inspection and reset tools?
