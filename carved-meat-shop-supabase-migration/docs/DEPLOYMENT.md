# Initial deployment package

This release retains the existing receipt format and provides a clearly labeled selected-invoice accountant-review CSV export over the same immutable sales. It is not BIR-certified. The application must not be used to selectively suppress reportable sales. Statutory use requires confirmation of the client's registration, tax treatment, required fields and applicable system registration/permits by the accountant/BIR. Tax computation, official fiscal closing and direct Android printing are not implemented.

## Run locally

The existing Windows application continues to run through `npm start`. The receipt format is unchanged. Selected-invoice CSV review is available under Invoices; it is explicitly labeled as a subset and does not replace complete statutory records.

## Container hosting preparation

Docker is not installed in the development environment: the Docker/Caddy configuration is provided but has not been executed here. The production Next.js build and browser workflows are verified separately. Test the container package in staging before launch. No public deployment is authorized or performed by this package.

1. Use a server with Docker Compose, persistent local storage and a hostname that resolves to it. Restrict access as appropriate for the shop. Caddy's standard public certificate issuance requires reachable DNS and ports 80/443; a private LAN installation instead needs locally trusted TLS configured by the host administrator.
2. Create a deployment `.env` **on the server only** with `CARVED_DOMAIN=your-real-hostname` and `BETTER_AUTH_SECRET` set to a cryptographically random secret of at least 32 characters. Never use example credentials, commit secrets, or point this production stack at the sample database.
3. Run `docker compose build`. Then provision the owner before starting the service: `docker compose run --rm -e OWNER_EMAIL -e OWNER_PASSWORD app npm run owner`, with those two variables set securely in the invoking terminal. Remove the password variable afterward. This creates an owner in the persistent named volume; public registration stays disabled.
4. Run `docker compose up -d`. Open the HTTPS hostname, sign in, and change the owner password if a temporary one was used. Do not scale `app` above one process: PGlite is an embedded single-process PostgreSQL engine. Use a shared PostgreSQL deployment and new concurrency verification before horizontal scaling.
5. Configure identity/templates and verify a new sale, stock deduction, payment, receipt output, reprint, return, balanced journals and authorization on the actual client devices. Use staging fixtures before real sales. Confirm the actual Android-to-VOZY printing route; the current browser print fallback alone is not a verified Android hardware integration.
6. Stop `app` for backups: `docker compose stop app`, then run `docker compose run --rm -v /secure/carved-backups:/app/backups app npm run backup`. Create that host backup directory with restricted permissions and make it writable by container UID 1000 first. This bind mount preserves archives after the one-off container exits. Restart with `docker compose up -d app`. Follow docs/BACKUP-RESTORE.md to restore into a fresh directory and compare balances/attachments before cutover. Keep encrypted offsite copies and rehearse recovery. Do not delete the named volume during upgrades. After a forced crash, a stale `.process-lock` may require manual cleanup only after verifying no process still owns the database.

## Release gates

- Local build, unit/integration tests and browser workflow checks.
- Staging container startup, owner creation, persistent-volume restart, HTTPS and backup/restore on the actual host.
- Client/accountant approval of the proposed accounting scope and invoice requirements.
- Actual Android tablet and printer output, including readable amounts, peso characters, margins and cutting.

Prepared deployment files are not evidence that the untested host/device/statutory gates have passed.
