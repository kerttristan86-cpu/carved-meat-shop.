# Setting up another branch

Each branch runs its own copy of the app with its own database. The branches share nothing: stock, sales, receipts, expenses and owner login are all separate, so their records cannot overlap. There are no combined reports or automatic stock transfers between them, and two databases cannot be merged later. Decide this with the owner before the branch starts real operations.

## Before you start

The branch needs:

- A Windows computer that stays on during shop hours, with Node.js 22.18 or later.
- A tablet, a printer and a stable shop network, tested as described in [Android and iOS printing](ANDROID-PRINTING.md).
- The accountant's or RDO's confirmation of what the branch needs for registration and invoices. This app is not BIR-certified.

## 1. Package the application

On the computer holding the existing project, run this from the project folder:

```powershell
git archive --format=zip -o ..\carved-branch-app.zip HEAD
```

The zip contains committed application files only, so commit any changes first. It has no database, `.env.local` or backups, so it cannot carry the first branch's records. Never copy the `data` folder or `.env.local` to the branch.

## 2. Install on the branch computer

Extract the zip to a local folder, open PowerShell in it, and run the following, choosing a new database location on a local disk outside OneDrive:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup-branch.ps1 -DatabaseDir C:\CarvedData\branch-2
```

The script asks for the branch owner's email and password, then installs, builds, generates a new secret and creates the empty database and owner. It stops without changing anything if the folder is already configured or the database location already exists.

Add `-AppUrl https://your-branch-hostname` once private-network HTTPS is set up for tablets. It must exactly match the address people open. See the Tablet connectivity section of the [README](../README.md).

## 3. Configure the branch

1. Run `npm start` and sign in.
2. In Settings, enter this branch's name, address, contact and receipt wording. Do not change the receipt layout.
3. Add this branch's locations, products, prices, suppliers and opening stock counts. These are entered separately for each branch.
4. Print a real receipt on the branch printer and check the amounts, peso signs, margins and cutting. Sales cannot be erased from the records, so have the owner agree how to handle this first sale, and use the separate demo database in the README for practice.

## 4. Turn on daily backups

Choose a time when the branch is closed. The backup stops the server briefly and restarts it.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\schedule-backup.ps1 -At 23:30 -CopyTo E:\CarvedBackups
```

`-CopyTo` is optional but recommended: use an external or protected location. If it is unavailable, the backup stays in `backups\` and the run is logged as failed. Add `-Port` and `-HostName` if the server does not use the defaults.

- The Windows user must be signed in at the scheduled time, and the computer must be on.
- A missed run is not repeated later, so it cannot stop the server during shop hours.
- Check `backups\backup.log` weekly. Each good run says `Backup OK and restorable`.
- Old backups are not deleted automatically. Agree a retention period with the client.
- Backups are not encrypted and contain password hashes and business records. See [Backup and restore](BACKUP-RESTORE.md).

To run one backup now, or to remove the schedule:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\daily-backup.ps1
```

```powershell
powershell -ExecutionPolicy Bypass -File scripts\schedule-backup.ps1 -Remove
```

## 5. Keep this safe

Store a protected copy of the branch's `.env.local` away from the computer. Backups do not include it, and a restore must keep the same `BETTER_AUTH_SECRET`. Each branch needs its own updates and backups: install every app update on both, and back up before each one.
