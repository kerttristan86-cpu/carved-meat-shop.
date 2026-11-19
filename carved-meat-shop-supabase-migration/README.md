# CARVED Meat Shop

Local, online-first shop operations built with Next.js 16, React 19, TypeScript, Better Auth, Drizzle and persistent embedded PostgreSQL (PGlite). The supplied logo and sky-blue theme are retained. No public deployment has been made.

## Install and create the owner

Use Node.js 22.18 or later and one server process. Run from this directory:

```powershell
npm ci
Copy-Item .env.example .env.local
```

Edit `.env.local`: generate a random secret of at least 32 characters for `BETTER_AUTH_SECRET`, set the exact `BETTER_AUTH_URL` (default `http://localhost:3000`), and set `DATABASE_DIR` to a persistent directory. The local default is `./data/production`. For actual operations, put the database on a local disk **outside OneDrive or other live file synchronization**; use the backup procedure to synchronize archives instead. Do not share a live data directory between processes or machines. Database access is guarded by a process lock.

Create your owner from a PowerShell terminal. Enter the password interactively; it is never printed by the setup script:

```powershell
$env:OWNER_EMAIL = Read-Host 'Owner email'
$ownerSecret = Read-Host 'Owner password (12+ characters)' -AsSecureString
$env:OWNER_PASSWORD = [System.Net.NetworkCredential]::new('', $ownerSecret).Password
npm run owner
Remove-Item Env:OWNER_PASSWORD
Remove-Item Env:OWNER_EMAIL
```

The owner command refuses to run if an account exists. Public signup is disabled. Store the password securely. Change it under Settings using the existing password; there is no email/password-recovery integration. Recovery from loss of the sole owner credential requires a verified administrator procedure, not an exposed reset route.

```powershell
npm run build
npm start
```

Open the configured URL and sign in. `npm run dev` is available for development. CLI scripts load `.env.local` automatically. Migrations run transactionally at startup and are recorded in `schema_migrations`. Keep migrations and the lockfile with the application when moving it.

## Tablet connectivity

The server runs on the shop computer, and tablets must reach that computer. The default launch binds to loopback for local development. For private shop-network access, configure a stable hostname and HTTPS reverse proxy, set `BETTER_AUTH_URL` to that exact HTTPS origin, and start Next on the proxy's private interface. Do not expose the server to the public internet without a deployment/security review. HTTPS enables secure cookies; local HTTP is for loopback development. Secure the host account, disk and backups. The single owner has access to every module; staff permissions have not been added.

The app requires connectivity to its server at checkout. It preserves the cart on the tablet; it does not queue offline financial transactions. If a checkout response is lost, the original request and retry key are preserved locally. Retry checkout to confirm that original request before editing. Do not clear browser storage while a checkout outcome is uncertain.

## Separate demo

Stop any running server before using CLI commands on its database.

```powershell
$env:DATABASE_DIR = './data/demo'
npm run demo
npm run owner
npm run dev
```

The demo seed refuses any directory that does not end in `/demo`. Prices and opening balances are fixtures, not shop production prices. Demo and production have separate users, stock and records. Remove `Env:DATABASE_DIR` when returning to the `.env.local` configuration.

## Operation

See [User guide](docs/USER-GUIDE.md), [Accounting and assumptions](docs/ACCOUNTING.md), [Backup and restore](docs/BACKUP-RESTORE.md), and [Verification](docs/VERIFICATION.md).

## Verification commands

```powershell
npm test
npm run typecheck
npm run build
npx tsx scripts/qa.ts
```

The browser test uses installed Chrome (set `QA_BROWSER=msedge` to use Edge), a separate generated database, an ephemeral owner/password and port 3100. It does not touch production data or publish anything. Browser screenshots and an 80mm receipt PDF are written to ignored `test-results/`. It requires permission to connect to localhost and launch the browser. The production build must be current before running it.

## Remaining client checks

- Confirm service charge unit, product list, actual prices, opening counts, supplier costs and location names.
- Review the proposed bookkeeping scope and account treatment with the client/accountant. Configure registration details and document wording before statutory use. Customizable output is **not** BIR certification.
- Test actual tablet OS and VOZY G80 connection/protocol, printable width, margins, density and cutter. BLE ESC/POS printing for compatible browsers, system print and receipt-image export are implemented; physical tablet printing remains unverified. See [Android and iOS printing](docs/ANDROID-PRINTING.md).
- Validate shop-network HTTPS, host availability, backups and restore on the intended production computer. PGlite is single-process embedded PostgreSQL; a multi-server deployment requires replacing the database connection layer with a shared PostgreSQL service and validating concurrency again.

Integration references used: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Better Auth Drizzle adapter](https://better-auth.com/docs/adapters/drizzle), [Better Auth Next.js integration](https://better-auth.com/docs/integrations/next), [PGlite API](https://pglite.dev/docs/api), [PGlite filesystems](https://pglite.dev/docs/filesystems). Exact installed versions are pinned in `package-lock.json`.
