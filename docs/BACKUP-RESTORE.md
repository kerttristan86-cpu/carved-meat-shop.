# Backup and restore

Backups include the full PostgreSQL database (users/password hashes, sessions, documents, stock, journals, audit history, retry keys, settings) and private expense attachment bytes. CSV export is not a restorable backup. The archive is not encrypted; store it on an encrypted disk with restricted access and maintain an offsite copy.

1. Stop the app server. Never run two processes against a live PGlite data directory. The process lock also prevents backup from opening an active database.
2. From the application directory with the intended `.env.local` / `DATABASE_DIR`, run `npm run backup`.
3. Copy the printed `backups/carved-….carved-backup.json` file to protected external storage. The script fails if an attachment referenced by the database is missing; investigate rather than accepting an incomplete backup.
4. Restart the app. Make backups daily and before upgrades; choose retention with the client.

Restore safely into a **new, nonexistent** directory:

```powershell
npm run restore -- backups/carved-EXAMPLE.carved-backup.json ./data/restored-check
```

The command refuses to overwrite an existing directory and prints the restored document count. Stop the server, set `DATABASE_DIR=./data/restored-check` in `.env.local`, keep the existing `BETTER_AUTH_SECRET` and origin, and start the app. Log in and verify invoice totals, stock by location, trial balance and an expense attachment. Close sessions if restoring after a security incident. Keep the former data directory untouched until the restore has been accepted.

Automated tests create a gzip database dump, restore it into a separate PostgreSQL instance, and compare documents, movements and financial results. A second test exercises the actual backup bundle/restore functions with an expense attachment and confirms refusal to overwrite an existing target. The target production computer, storage media and offsite recovery must still be rehearsed with the client.

If the host crashes, restart after verifying the previous process has ended. Stale or incomplete process locks are deliberately refused to avoid competing processes removing each other's locks: confirm no process owns the database before manually removing only its adjacent `.process-lock` file. Do not synchronize a live database using OneDrive; synchronize completed backup archives.
