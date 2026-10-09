# Jusclick

React + TypeScript frontend, Convex backend, Convex Auth (email + password).
Auth -> RBAC -> backend function -> database. The browser is never trusted.

## Run it
    npm install
    npx convex dev        # log in, create a project; it writes VITE_CONVEX_URL to .env.local
    npx @convex-dev/auth  # one-time: generates JWT keys for Convex Auth
    npx convex env set AUTH_RESEND_KEY re_xxx   # optional in dev, REQUIRED in production (email verification + password reset)
    npx convex env set AUTH_EMAIL_FROM "Jusclick <no-reply@yourdomain>"
    npm run dev           # in a second terminal (or use: npm run dev)

The first account created becomes Owner/Admin. Later accounts start as "report" (read-only audit)
and the admin promotes them in the Users tab.

## Deploy
    npx convex deploy
    npm run build         # host /dist anywhere (Vercel, Netlify, Cloudflare Pages)
    # set VITE_CONVEX_URL to your production Convex URL at build time

## Security notes for review
- Identity comes from the Convex session (getAuthUserId), never from client arguments.
- RBAC lives in convex/lib.ts (PERMS) and is checked in every function.
- Passcodes: 6 digits from crypto.getRandomValues, stored as SHA-256 only, shown once,
  single use, expiry enforced. Hashes are never returned to the browser.
- Every allowed and denied attempt is written to the audit table.

## What is included
Auth (sign-up/in, email verification, password reset), server-side RBAC (admin, security, staff, report),
passcode issue/validate/revoke (visitor, contractor, supplier, company, host department), brute-force lockout
(15 unknown codes in 10 min locks the gate and alerts admin/security), real-time notifications (arrivals,
lockouts, denied admin actions), dashboard metrics, departments, user management (role, department,
deactivate), branding and validity settings, full audit log of allowed and denied actions.

## Before go-live (recommended by the author)
- Run `npm run typecheck` once `npx convex dev` has generated `convex/_generated`; this project was written without network access and has not been compiled or run.
- Add automated tests (convex-test) for convex/lib.ts permissions and the passcode lifecycle.
- Have your IT manager review the lockout policy: it is global by design, so an attacker can lock the gate for 10 minutes (safer than guessing, but a nuisance).
- Set AUTH_RESEND_KEY in production so unverified emails cannot sign up.


### UPDATE THE LOCAL REPO 
git pull origin main
