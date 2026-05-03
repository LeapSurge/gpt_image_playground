# Manual Test Checklist

## Purpose
Use this checklist before limited rollout, after major gateway/auth/quota changes, and before production deployments.

This checklist covers:
- anonymous trial flow
- customer login and quota flow
- admin console flow
- failure handling and release regression

## Test Setup

### Environments
- Local: use the current managed dev URL
- Production: use the current public Vercel URL

### Required inputs
- One valid `ADMIN_SECRET`
- One existing customer account, or permission to create one in `/admin`
- A simple prompt:

```text
a red apple on a white background
```

- A heavier prompt for slow/failure checks:

```text
a cinematic night market in the rain, crowded street, neon reflections, steam, umbrellas, realistic photo
```

### Recommended tools
- Browser DevTools
- Network tab filtered to:
  - `/api/session`
  - `/api/login`
  - `/api/logout`
  - `/api/generate`
  - `/api/admin/`

## 1. Anonymous Trial Flow

### 1.1 Initial anonymous session
1. Open the site in an incognito window.
2. Wait for the page to finish loading.

Expected:
- No white screen
- Main app renders
- Header shows anonymous state
- Trial information is visible in the UI
- `GET /api/session` returns `200`
- Session payload contains:
  - `customer: null`
  - `trial.remainingCredits > 0`

### 1.2 Anonymous generation success
1. Stay anonymous.
2. Enter the simple prompt.
3. Submit generation.

Expected:
- Submit is allowed before login
- `POST /api/generate` is sent
- Response returns `200`
- A new task/result appears in the UI
- Trial balance decreases by exactly `1`

### 1.3 Trial balance persists
1. Refresh the page.
2. Check the UI and `GET /api/session` again.

Expected:
- Still anonymous
- Trial balance remains reduced
- Balance matches server response

### 1.4 Trial exhaustion
1. Repeat anonymous generation until the trial is exhausted.
2. Attempt one more generation.

Expected:
- Remaining trial count eventually reaches `0`
- Next submit is blocked
- UI prompts user to log in
- No successful upstream generation happens after exhaustion

Notes:
- Trial is tracked server-side per IP window
- Opening a new tab or incognito window should not reset it

## 2. Customer Login and Quota Flow

### 2.1 Login modal
1. Open the login modal.

Expected:
- Email field is visible
- Access code field is visible
- Copy explains that logged-in customers can continue after trial exhaustion

### 2.2 Valid login
1. Log in with a valid customer email and access code.

Expected:
- `POST /api/login` returns `200`
- Header shows customer email
- Header shows customer credits
- `GET /api/session` now returns a non-null `customer`

### 2.3 Logged-in generation
1. Submit the simple prompt while logged in.

Expected:
- `POST /api/generate` returns `200`
- Output is displayed
- Customer credits decrease by exactly `1`
- Anonymous trial balance is no longer the active quota source

### 2.4 Multiple requests
1. Submit `2` to `3` more generations.

Expected:
- Each request either succeeds or fails with a clear message
- Successful requests deduct credits exactly once
- No duplicate deductions

### 2.5 Insufficient customer credits
1. Use a customer with low or zero credits.
2. Attempt generation.

Expected:
- Request is blocked before successful generation
- UI shows quota exhaustion message
- Customer credits do not go negative

### 2.6 Logout
1. Click logout.

Expected:
- `POST /api/logout` succeeds
- Header returns to anonymous state
- `GET /api/session` returns `customer: null`

## 3. Admin Console Flow

### 3.1 Admin access protection
1. Open `/admin` in a fresh incognito session.

Expected:
- Admin dashboard data is not visible before admin login
- Admin secret prompt or admin login screen is shown

### 3.2 Admin login
1. Enter valid `ADMIN_SECRET`.

Expected:
- `POST /api/admin/session` returns `200`
- Admin UI becomes available
- Refresh keeps admin session valid until logout or expiry

### 3.3 Customer list
1. Load the customer list.

Expected:
- `GET /api/admin/customers` returns `200`
- Customers show:
  - email
  - name
  - remaining credits
  - status

### 3.4 Create customer
1. Create a customer with test data.

Suggested values:
- Email: `test+date@example.com`
- Name: `Manual Test`
- Credits: `10`

Expected:
- `POST /api/admin/customers` returns `200`
- Customer appears in the list
- Access code is returned once

Important:
- Access code should be recorded immediately
- It is not expected to be re-readable in plain text later

### 3.5 Login with the newly created customer
1. Use the returned email/access code in the main app.

Expected:
- Login succeeds
- Customer quota matches created value

### 3.6 Manual credit grant
1. In `/admin`, add credits to a customer.

Suggested value:
- Add `20`

Expected:
- `POST /api/admin/credits` returns `200`
- Customer balance updates immediately in admin UI
- Main app reflects updated balance after refresh

### 3.7 Recent usage view
1. Open recent usage in admin.

Expected:
- `GET /api/admin/usage` returns `200`
- Records include:
  - customer identity
  - credit delta
  - provider info
  - success or failure status
  - timestamp

## 4. Failure and Boundary Cases

### 4.1 Upstream/provider failure
1. Use a heavier prompt or otherwise trigger a provider-side failure in a safe environment.

Expected:
- UI shows a clear error
- No silent failure
- Failed request does not corrupt customer quota

### 4.2 Oversized image payload
1. Upload large reference images.
2. Attempt generation.

Expected:
- Request is rejected with a clear message
- App remains responsive
- No white screen or infinite spinner

### 4.3 Unauthorized admin API access
1. Request `/api/admin/customers` without admin session.

Expected:
- Request is rejected
- No customer data is leaked

### 4.4 Session restore
1. Refresh after customer login.
2. Refresh after admin login.

Expected:
- Customer session persists correctly
- Admin session persists correctly
- Refresh alone does not log the user out

## 5. Release Regression Checklist

Run these checks before release:

### 5.1 Local verification
Run:

```bash
npm run ci:local
```

If `npm run ci:local` is not usable in the current shell, run the equivalent:

```bash
npm run build
npm test
```

Expected:
- Build succeeds
- Tests pass

### 5.2 Anonymous regression
Verify:
- Anonymous homepage load
- Trial visible
- Anonymous generation succeeds
- Trial balance decreases

### 5.3 Customer regression
Verify:
- Login succeeds
- Logged-in generation succeeds
- Customer credits decrease exactly once
- Logout succeeds

### 5.4 Admin regression
Verify:
- `/admin` login succeeds
- Customer creation works
- Credit grant works
- Usage list loads

## Pass Criteria
Manual testing passes only if all of the following are true:
- Anonymous trial can generate and decrements correctly
- Trial exhaustion forces login
- Logged-in customer generation works
- Customer quota decrements correctly
- Admin login works
- Admin can create customers
- Admin can grant credits
- Admin can view recent usage
- No major browser-facing flow fails silently

## Current Known Non-Blocking Issues
- GitHub release version check may return `403` when anonymous GitHub API rate limits are exhausted
- This should not block core generation, login, quota, or admin flows
