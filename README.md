# Jusclick

Jusclick is a gate-access and security operations app for TF Commodities. It provides visitor passcodes, gate check-in and check-out, people-on-site visibility, user and department administration, and an audit trail.

The application is built with React, TypeScript, and Vite, with Convex providing authentication, server functions, and persistent data. Access control is enforced by the Convex backend; hiding a control in the interface is not treated as authorization.

## Features

- Create time-limited access passcodes for visitors, contractors, and suppliers.
- Inspect passcodes at the gate and record check-in, check-out, and rejected visits.
- View people currently on site and notify hosts about arrivals.
- Manage user roles, activation, departments, invitations, and facility settings.
- Review security events and audit records.
- Use responsive web and installable PWA interfaces on supported devices.
- Apply server-side authorization, rate limits, CSRF checks, and audit logging to protected operations.

## Roles and signup

| Role | Access |
| --- | --- |
| Admin | User, department, settings, and audit management, plus operational access |
| Security | Gate operations and all-department passcode and on-site views |
| Report (Department Head) | Reporting and passcode views scoped to the assigned department |
| Staff | Passcode operations scoped to the staff member and their assigned department |

The first account to create a profile becomes the active primary admin. An account created later without a valid invitation is assigned the Staff role and remains inactive until an admin approves it. A valid invitation applies its assigned role and department.

## Requirements

- Node.js 18 or newer
- npm
- A Convex deployment for authentication and shared, persistent application data

## Run locally

1. Install dependencies:

   ```sh
   npm install
   ```

2. Start Convex development and follow its prompts to select or create a project:

   ```sh
   npx convex dev
   ```

   Keep this process running. Convex generates the application API files and supplies the development deployment configuration.

3. In a second terminal, start the web app:

   ```sh
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000).

For email verification and password-reset codes, configure the Resend settings on the Convex deployment:

```sh
npx convex env set AUTH_RESEND_KEY re_your_key
npx convex env set AUTH_EMAIL_FROM "Jusclick <no-reply@yourdomain>"
```

Use a sender address verified with Resend. Without `AUTH_RESEND_KEY`, email verification and password reset are not enabled by the password provider.

### Environment variables

The Vite client reads `VITE_CONVEX_URL` from `.env.local`. If it is unset, the client uses the Convex URL currently configured in [`src/main.tsx`](./src/main.tsx). Set this variable when the app should use a different Convex deployment:

```dotenv
VITE_CONVEX_URL=https://your-deployment.convex.cloud
```

`AUTH_RESEND_KEY` and `AUTH_EMAIL_FROM` are server-side Convex environment variables; do not put the Resend API key in a `VITE_` variable or expose it to the browser.

## Local host setup wizard

The interactive setup wizard can write facility settings, create startup launchers, and optionally build the app:

```sh
npm run setup
```

It generates `Jusclick.host.json` and, if `.env.local` does not already exist, can create that file with the selected host settings. It also creates `start-Jusclick-windows.bat` and `start-Jusclick-unix.sh`. Review generated settings before sharing or committing them. The wizard does not provision a Convex deployment or replace the Convex development/deployment steps above.

Alternatively, run `setup-windows.bat` on Windows or `setup-unix.sh` on macOS/Linux.

## Build and checks

```sh
npm run typecheck
npm run build
```

The web build is written to `dist/`. The package also defines `build:android`, `build:ios`, and `build:windows`; native packaging requires the relevant platform tooling and configuration.

## Security notes

- Passcodes are generated on the server with cryptographically secure randomness. Only a SHA-256 hash is stored; the plaintext code is returned when issued and should be shared with its intended visitor.
- Passcodes are single-use, expire, and can be revoked. Gate check-in is separate from inspecting a code.
- Fifteen unknown passcodes within ten minutes trigger a ten-minute gate lockout and alert active admins and security users.
- Backend functions derive the current user from the Convex Auth session and enforce permissions server-side.
- Audit records include permitted and denied sensitive operations. Treat visitor details and audit data as sensitive operational information.

Review the lockout policy and operational procedures with your security team before using the system at a live facility.
