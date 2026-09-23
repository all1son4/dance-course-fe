# Protected source snapshots

Status: complete
Implemented: 2026-08-11

Operational update: `DROP-03` retired live Google credentials on 2026-09-05 after the
final dev/prod captures below. Live capture commands are retained as historical
operator instructions, not routine tasks to rerun with revoked credentials. Offline
decryption/restore needs only the encrypted triplet and its separate recovery key.
`DROP-05` adds a separate PostgreSQL-only contract archive described below; it never
loads the Google adapter or requires a Google credential.
The former `db:snapshot:sources` command and live Google capture implementation were
removed on dev during `DROP-05`; their examples below document already accepted
captures and are not available in the current revision.

## Purpose

`DATA-01` creates a restorable PostgreSQL logical dump and an exact, read-only export
of the seven migration-owned Google Sheets ranges. These files contain personal data,
Telegram bearer values, invite links, and financial records. They must never be
committed, printed to logs, or uploaded without application-level encryption.

The capture does not change application flags, pause checkout, synchronize Sheet
headers, or write to either source.

## Protection model

Each run:

1. captures `database.dump` with PostgreSQL custom format and validates its archive
   directory with `pg_restore --list`;
2. requests the `spreadsheets.readonly` OAuth scope and reads only the configured
   columns of `Payments`, `StripeEvents`,
   `SuccessfulCustomers`, `TelegramAccessTokens`, `TelegramUserBindings`,
   `MonthlySalesReports`, and `EmailCampaignLeads`;
3. writes an internal manifest with source times, row counts, Git revision, file sizes,
   and SHA-256 checksums;
4. packs the three plaintext files inside an ephemeral mode-`0700` directory;
5. encrypts the archive with a new AES-256-GCM key and wraps that key with
   RSA-OAEP-SHA256;
6. deletes the plaintext workspace and retains only the ciphertext, wrapped key, and
   PII-free public manifest in the ignored local snapshot directory.

AES-GCM authenticates the entire archive. The public manifest records the ciphertext
and wrapped-key SHA-256 values, IV, authentication tag, and RSA public-key fingerprint.
The RSA private key never enters GitHub, Vercel, application runtime, or the encrypted
artifact. Capture used the then-existing local Google/database environment values;
no additional credential copy was created for snapshot automation. `DROP-03` later
removed the retired Google values while preserving database configuration.

The local `.data-snapshots` directory is excluded from Git and restricted to the owner.
Keep the encrypted triplets and private key in the owner's normal encrypted computer
backup until at least 30 days after final cutover. A fresh protected snapshot is still
required immediately before production cutover; this initial source snapshot is not a
substitute for the `CUT-02` backup.

## One-time key setup

Generate a dedicated RSA key pair outside Git. The local directory is ignored and its
permissions prevent other local users from reading the key. The key must be retained
with the owner's normal encrypted computer backup; losing it makes every snapshot
unrecoverable.

```bash
mkdir -p .data-snapshots
chmod 700 .data-snapshots
openssl genpkey \
  -algorithm RSA \
  -pkeyopt rsa_keygen_bits:3072 \
  -out .data-snapshots/source-snapshot-private.pem
chmod 600 .data-snapshots/source-snapshot-private.pem
openssl pkey \
  -in .data-snapshots/source-snapshot-private.pem \
  -pubout \
  -out .data-snapshots/source-snapshot-public.pem
```

Before credential retirement, the capture command used local database and Google
environment values. It requested a `spreadsheets.readonly` OAuth token even with
broader service-account permissions; the credential was not copied to GitHub.

## Historical controlled source capture

Before credential retirement, this was run locally with a PostgreSQL client at least as
new as the source server. The accepted captures used the keg-only Homebrew PostgreSQL
`17.10` client without relinking or starting its persistent service. Do not run these
removed commands now.

```bash
PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH" \
npm run db:snapshot:sources -- \
  --target=development \
  --confirmation=snapshot-development \
  --public-key-path=.data-snapshots/source-snapshot-public.pem \
  --output-dir=.data-snapshots/development
```

Production is always explicit:

```bash
PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH" \
npm run db:snapshot:sources -- \
  --target=production \
  --confirmation=snapshot-production \
  --public-key-path=.data-snapshots/source-snapshot-public.pem \
  --output-dir=.data-snapshots/production
```

The command refuses an implicit target, an incorrect typed confirmation, conflicting
public-key inputs, a generic database URL without an explicit `DEV`/`PROD` marker, and
existing output filenames. Output directories and files are restricted to mode
`0700`/`0600`.

## DROP-05 PostgreSQL-only contract archive

Before rehearsing or applying a contract migration, capture the selected database
without re-enabling Google access:

```bash
PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH" \
npm run db:snapshot:legacy-contract -- \
  --target=development \
  --confirmation=snapshot-development \
  --public-key-path=.data-snapshots/source-snapshot-public.pem \
  --output-dir=.data-snapshots/development
```

Production uses the corresponding explicit `production` target, confirmation and
output directory only as an owner-approved release operation. The selected database
URL must come from an environment-specific variable containing `DEV` or `PROD`; common
`DATABASE_URL` fallbacks are rejected even when `DATABASE_ENV` is set.

This mode writes manifest schema version 2 with `scope: "database"`. Its encrypted
archive has exactly `database.dump` and `manifest.json`; it cannot contain
`google-sheets.json`. Before encryption, `pg_restore --list` must prove that the dump
contains table data for `purchases`, `purchase_side_effects`, `invoices`, and
`data_backfill_runs`. The dump is captured in one serializable, deferrable PostgreSQL
transaction. The existing decrypt command supports both historical version-1 source
archives and version-2 database-only archives.

### September 19 production compatibility capture

Immediately before the approved non-destructive production compatibility rollout,
capture `production-database-20260919T101949842Z-fefe405f9c39` completed at
`2026-09-19T10:19:55.455Z`. Encrypted archive SHA-256:
`76a5e4e3aebcf43be668ea18797aa980d14342eeecc13e46b50109b97983afad`.
The existing recovery public key was reused.

Checksum authentication and AES-GCM decryption passed. The archive contained exactly
`database.dump` and `manifest.json` and restored with PostgreSQL 17 into a disposable
local database. The restored pre-expand state had 19 migrations, 21 public tables,
108 purchases, 76 retained legacy exports, 45 invoices, zero populated PDF keys, one
completed backfill run, and zero invalid indexes. The local cluster and all plaintext
files were deleted immediately after verification; the encrypted archive, wrapped key,
and public manifest remain in the ignored protected production snapshot directory.

This recovery evidence authorized only the additive `0019`/`0020` rollout. It does not
authorize DROP-05 deletion and does not replace the fresh production snapshot required
immediately before the later contract migration.

### September 23 contract candidate capture

After the 30-day boundary, production capture
`production-database-20260923T064357941Z-aff9a8bf1c35` completed at
`2026-09-23T06:44:03.383Z`. Its encrypted archive SHA-256 is
`ff4d82f582c3c3001f03b4052c7010936861429ed3dd0bd10fe4dca4f4ff4049`;
the public key fingerprint remains
`727e890bb14185efcb4a4d8150de5730653c19793a1ce249de1996ed5fdafa87`.
Authentication, decryption, two-file inventory and PostgreSQL 17 restore passed.
The isolated copy matched the live read-only audit: 21 migrations, 21 public tables,
108 purchases, 76 retired export rows, 45 invoices, zero populated PDF keys, one
completed backfill checkpoint and zero invalid indexes. Contract migration `0021`
was rehearsed on that copy; a separate restore verified that a PDF-key blocker leaves
the database unchanged. The encrypted archive remains protected locally. If the live
release is delayed, repeat the capture and restore check immediately before deletion.

### September 23 live contract captures

After explicit owner approval, development capture
`development-database-20260923T082503175Z-067371319559` completed at
`2026-09-23T08:25:08.841Z`. Its encrypted archive SHA-256 is
`02ae0fabca6913dd4ed54a5f357756c837f9066d758a17351104606790bf05b3`.
Authentication, two-file inventory and PostgreSQL 17 restore passed. The guarded
contract SQL ran successfully on the restored copy: 29 retired exports removed,
43 purchases and five invoices retained. The dev workflow applied `0021` only after
the live preflight and deployed-code checks passed.

Immediately before the production contract workflow, capture
`production-database-20260923T083812232Z-26af475fc85f` completed at
`2026-09-23T08:38:16.698Z`. Its encrypted archive SHA-256 is
`3f7e87c1f303558c70faf86b4343c623f46b52aa955f1f5b538aceedfa6f22f1`;
the recovery public key fingerprint remains
`727e890bb14185efcb4a4d8150de5730653c19793a1ce249de1996ed5fdafa87`.
Authentication, two-file inventory and PostgreSQL 17 restore passed with 21 migrations,
108 purchases, 76 retired exports, 45 invoices and one completed checkpoint.
Migration `0021` passed on that isolated copy, deleting 76 exports while preserving
all 108 purchases and 45 invoices. The live production preflight again had zero
blockers and the guarded workflow then applied the same contract. Both disposable
plaintext restores and local PostgreSQL clusters were deleted after verification;
the encrypted archives, wrapped keys, manifests and separate private key remain
protected locally for recovery.

## Cut-off semantics

PostgreSQL and Google Sheets cannot share a transaction. The public and internal
manifests therefore record:

- one short capture window;
- each source's own start and completion time;
- `cutOffAt`, defined as the upper bound of that window;
- an explicit statement that changes inside the window require delta reconciliation.

The two source captures run concurrently to minimize the window. `DATA-02` must use
the immutable files in this archive as its initial source, and `DATA-03` must reconcile
the live delta after `cutOffAt`. We deliberately do not claim false cross-system
point-in-time consistency and do not interrupt user purchases to obtain it.

## Recovery check

Use the encrypted archive, wrapped key and public manifest from one capture and decrypt
only into a protected temporary path:

```bash
npm run db:snapshot:decrypt -- \
  --manifest=.data-snapshots/<target>/<capture>.manifest.json \
  --archive=.data-snapshots/<target>/<capture>.tar.gz.enc \
  --wrapped-key=.data-snapshots/<target>/<capture>.key.enc \
  --private-key=.data-snapshots/source-snapshot-private.pem \
  --output=/private/tmp/<capture>.tar.gz
```

The command verifies both public checksums before unwrapping the key, and AES-GCM
rejects any modified ciphertext. Both accepted captures were extracted into separate
mode-`0700` temporary directories and restored into isolated disposable PostgreSQL
17 clusters. The clusters, decrypted archives, raw Sheet exports, and plaintext dumps
were deleted immediately after aggregate verification. Never restore over development
or production.

## DATA-01 acceptance evidence

Public-key fingerprint for both captures:
`727e890bb14185efcb4a4d8150de5730653c19793a1ce249de1996ed5fdafa87`.

| Target      | Capture ID                                     | Cut-off                    | Encrypted archive SHA-256                                          | Recovery check                                         |
| ----------- | ---------------------------------------------- | -------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------ |
| development | `development-20260811T112201570Z-065d71053dd1` | `2026-08-11T11:22:07.662Z` | `2d83476ef92f03657e4234b70ada7cbbb9ef4852257e03349c6ec1028e2f9bd5` | PostgreSQL 17 restore passed; 20 tables, 14 migrations |
| production  | `production-20260811T112456139Z-065d71053dd1`  | `2026-08-11T11:25:02.023Z` | `f456bd24c0f4b7cb8721fa33d976c4a12c3eebf07037f034bf5d11e0862d8e04` | PostgreSQL 17 restore passed; 20 tables, 14 migrations |

Development Sheet counts were `44/86/35/33/6/2/1`; production counts were
`75/140/60/20/17/5/1`, in the documented Sheet order. Restored development aggregates
were 38 purchases, 112 Stripe events, 5 invoices, and 40 entitlements. Restored
production aggregates were 75 purchases, 171 Stripe events, 23 invoices, and 93
entitlements. These are identifier-free verification summaries, not backfill input.

## DROP-03 final source archives — 2026-09-05

Both archives use the same dedicated snapshot public-key fingerprint recorded above,
AES-256-GCM encryption and RSA-OAEP-SHA256 key wrapping. The private recovery key is
not the retired Google key. Capture tooling revision was `cd7b4ef`; this records the
operator's tooling revision, not a claim that dev code was deployed to production.

| Target      | Capture ID                                     | Cut-off                    | Encrypted archive SHA-256                                          |
| ----------- | ---------------------------------------------- | -------------------------- | ------------------------------------------------------------------ |
| production  | `production-20260905T212429218Z-cd7b4ef32d7e`  | `2026-09-05T21:25:30.938Z` | `c7f01f133e4d27af386d3a68de37a54ee2bb0ad6743e6c9385a638dcb1e33f88` |
| development | `development-20260905T212531429Z-cd7b4ef32d7e` | `2026-09-05T21:25:37.667Z` | `2beedec8ac1955d788bcbb642a5f51e4a76eac2e6692ff861af330198578d1ea` |

Ciphertext, wrapped key, inner file checksums, and all seven Sheet counts were
verified. Both archives restored with `pg_restore --exit-on-error` into isolated local
PostgreSQL 17 databases: 21 public tables, 19 migrations, zero invalid indexes each.
Production restored 105 purchases, 308 Stripe events, 42 invoices, 127 entitlements;
development restored 43 purchases, 137 events, five invoices, 45 entitlements.
Sheet row counts in the documented order were `81/148/81/21/18/5/3` for production and
`46/87/38/34/6/2/1` for development.

The test cluster and decrypted files were removed after successful verification;
the encrypted triplets remain in ignored `.data-snapshots/production` and
`.data-snapshots/development` with owner-only permissions. Keep these and the separate
private recovery key in the owner's encrypted backup. No off-device backup upload
was performed or independently verified during this step. Keep the September 23
minimum retention boundary and do not delete the originals as part of `DROP-04`.
