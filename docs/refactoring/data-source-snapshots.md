# Protected source snapshots

Status: complete
Implemented: 2026-08-11

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
artifact. Google and database credentials remain in the existing local environment;
no additional credential copy was created for snapshot automation.

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

The capture command uses the existing local database and Google environment values. It
requests a `spreadsheets.readonly` OAuth token even when the runtime service account has
broader compatibility permissions, and the credential is not copied to GitHub.

## Controlled capture

Run locally with a PostgreSQL client at least as new as the source server. The accepted
captures used the keg-only Homebrew PostgreSQL `17.10` client without relinking or
starting its persistent service.

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
public-key inputs, and existing output filenames. Output directories and files are
restricted to mode `0700`/`0600`.

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

Use all three files from one capture and decrypt only into a protected temporary path:

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
