# Spec: Tauri Desktop Introduction for HantuAI

## Assumptions
1. The existing Vite + React web app remains the primary codebase.
2. Vercel deployment must continue to serve the current web experience without requiring Rust or Tauri on CI.
3. The desktop app is a packaging and capability-extension effort, not a rewrite.
4. The current browser-only API proxy approach is not sufficient for packaged desktop builds and will need a Tauri-side replacement.
5. Windows is the first desktop target; macOS/Linux can follow if the architecture stays cross-platform.

## Objective
Introduce a Tauri desktop target for the existing app while preserving the current Vercel-hosted web deployment.

User outcomes:
- Web users continue using the current Vercel deployment with no regression.
- Desktop users get a packaged app that can call image APIs without browser CORS limitations.
- The team can ship web and desktop from the same frontend codebase with minimal divergence.

Success means:
- One shared React frontend works for both web and Tauri.
- Vercel still builds and serves the web app from the same repository.
- Desktop production does not depend on the Vite dev proxy or the Docker/Nginx proxy path.

## Tech Stack
- Existing frontend: React 19 + TypeScript + Vite 6 + Zustand + Tailwind CSS
- Proposed desktop shell: Tauri 2.x + Rust
- Proposed desktop networking: Tauri-side HTTP/proxy capability instead of browser-only proxy

## Commands
Current commands:
- Dev: `npm run dev`
- Build: `npm run build`
- Test: `npm test`

Proposed additional commands after Tauri adoption:
- Desktop dev: `npm run tauri:dev`
- Desktop build: `npm run tauri:build`
- Web build verification: `npm run build`
- Web tests: `npm test`

## Project Structure
- `src/` -> shared frontend application code
- `public/` -> web-only static assets; some PWA assets may become web-only
- `deploy/` -> current Docker/Nginx deployment support for web
- `docs/` -> specs and rollout notes
- `src-tauri/` -> Tauri Rust shell, config, permissions, desktop-side networking

## Code Style
Shared frontend should keep a platform-gated adapter boundary instead of branching UI logic throughout the app.

```ts
export interface ImageApiTransport {
  postJson<T>(path: string, body: unknown, headers?: Record<string, string>): Promise<T>
}

export const imageApiTransport: ImageApiTransport =
  isTauriDesktop() ? createTauriTransport() : createBrowserTransport()
```

Conventions:
- Keep most UI and state logic platform-agnostic.
- Isolate platform-specific behavior behind narrow adapters.
- Avoid scattering `isTauri` checks across components.

## Testing Strategy
- Continue using `vitest` for frontend unit tests.
- Add adapter-level tests for platform-specific transport selection.
- Keep web build verification mandatory for all desktop-related PRs.
- Add one manual smoke checklist for Tauri:
  - launch app
  - save/load local state
  - generate one image through desktop networking path
  - confirm web build still works

## Boundaries
- Always:
  - Keep web build working after every slice.
  - Prefer shared frontend code over desktop forks.
  - Verify both `npm run build` and `npm test` for slices touching shared code.
- Ask first:
  - Moving persistence from IndexedDB to a native store.
  - Adding new third-party Rust or JS dependencies.
  - Changing release/distribution strategy or CI pipeline.
- Never:
  - Break Vercel deployment to make Tauri easier.
  - Replace the entire frontend with a Tauri-specific UI.
  - Tie the desktop app to local-only hacks that cannot be expressed as explicit platform adapters.

## Success Criteria
- `npm run build` still produces the current web bundle for Vercel.
- Desktop dev mode can load the same frontend via Tauri.
- Desktop production can make image API requests without relying on browser CORS behavior.
- No desktop-only code path is required for core UI rendering.
- Web and desktop can be versioned from the same repo.

## Slice Proposal
Recommended scope: 6 slices.

### Slice 1: Tauri Shell Bootstrap
- Add `src-tauri/` and minimal Tauri config.
- Run existing frontend inside Tauri dev mode.
- No behavior change to web app.

Acceptance:
- Desktop window opens the current app.
- Web build remains unchanged.

### Slice 2: Platform Boundary Extraction
- Introduce a platform adapter layer for environment checks and network transport selection.
- Keep current web behavior as default.

Acceptance:
- Shared frontend still works in browser.
- Desktop code can choose a different transport path without touching UI components.

### Slice 3: Desktop Networking Path
- Implement Tauri-side HTTP/proxy capability for image API calls.
- Stop depending on Vite dev proxy for packaged desktop builds.

Acceptance:
- Desktop app can call the target API successfully.
- Web app still uses current browser/proxy path.

### Slice 4: Web/Desktop Feature Gating
- Make service worker / manifest / PWA behaviors web-only.
- Audit drag-drop and clipboard behavior in Tauri, especially on Windows.

Acceptance:
- Desktop app runs cleanly without irrelevant PWA behavior.
- No regression in existing web PWA behavior.

### Slice 5: Persistence and Export Review
- Validate that IndexedDB-based storage is acceptable in Tauri WebView.
- If needed, introduce a storage adapter later; do not migrate prematurely.

Acceptance:
- Existing task/image persistence works in desktop smoke tests.
- Export/import still works.

### Slice 6: Packaging and Dual Deployment
- Add scripts, docs, and release notes for desktop packaging.
- Keep Vercel deployment path unchanged.

Acceptance:
- Web deployment instructions remain valid.
- Desktop packaging is documented and repeatable.

## Vercel Compatibility
Yes, Vercel deployment can remain in place.

Recommended model:
- Keep the current Vite web build as the web target.
- Add Tauri as an additional shell around the same frontend.
- Do not move shared frontend logic into Rust unless desktop-only capability requires it.
- Treat Tauri as an optional product target, not the new default runtime.

This only becomes risky if:
- shared code starts assuming Tauri APIs at render time, or
- the API path is rewritten globally for desktop and accidentally breaks browser builds.

## Recommended Implementation Order
1. Slice 1
2. Slice 2
3. Slice 3
4. Slice 4
5. Slice 5
6. Slice 6

## Open Questions
1. Is Windows the only required desktop platform for the first release?
2. Should desktop keep IndexedDB initially, or do you want native filesystem persistence from day one?
3. Do you want desktop packaging only, or also desktop-specific capabilities like file save dialogs and native update flow?
