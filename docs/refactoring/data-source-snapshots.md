# Protected source snapshots

Status: tooling ready; production capture pending

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
2. reads only the configured columns of `Payments`, `StripeEvents`,
   `SuccessfulCustomers`, `TelegramAccessTokens`, `TelegramUserBindings`,
   `MonthlySalesReports`, and `EmailCampaignLeads`;
3. writes an internal manifest with source times, row counts, Git revision, file sizes,
   and SHA-256 checksums;
4. packs the three plaintext files inside an ephemeral mode-`0700` directory;
5. encrypts the archive with a new AES-256-GCM key and wraps that key with
   RSA-OAEP-SHA256;
6. deletes the plaintext workspace and uploads only the ciphertext, wrapped key, and
   PII-free public manifest.

AES-GCM authenticates the entire archive. The public manifest records the ciphertext
and wrapped-key SHA-256 values, IV, authentication tag, and RSA public-key fingerprint.
The RSA private key never enters GitHub, Vercel, application runtime, or the artifact.

GitHub artifacts are retained for 90 days. If the DATA and cutover phases will exceed
that window, take a new protected snapshot before the old artifact expires. A fresh
snapshot is required again immediately before production cutover; this initial source
snapshot is not a substitute for the `CUT-02` backup.

## One-time key setup

Generate a dedicated RSA key pair outside Git. The local directory is ignored, but the
private key must also be copied to an owner-controlled password manager or encrypted
offline backup before relying on a production snapshot.

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

Add the public PEM as `DATA_SNAPSHOT_PUBLIC_KEY` to both GitHub Environments used for
captures. `Preview` and `Production` also require:

- `DATABASE_URL_UNPOOLED`;
- `GOOGLE_PRIVATE_KEY`;
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`;
- `GOOGLE_SHEETS_SPREADSHEET_ID`.

The Google service account needs only read access for this workflow. Existing runtime
credentials currently have broader compatibility permissions; reducing that account
to a dedicated read-only snapshot principal is optional hardening and is not required
to preserve current behavior.

## Controlled capture

Run the `Protected data source snapshot` workflow manually. Development is accepted
only from `dev` with `snapshot-development`; production is accepted only from `main`
with `snapshot-production`. The selected GitHub Environment scopes database and Google
credentials, and concurrency prevents overlapping captures for one target.

For a local rehearsal with a compatible `pg_dump`/`pg_restore` client:

```bash
DATABASE_ENV=development npm run db:snapshot:sources -- \
  --target=development \
  --confirmation=snapshot-development \
  --public-key-path=.data-snapshots/source-snapshot-public.pem \
  --output-dir=.data-snapshots
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

Download all three files from the same workflow artifact, then decrypt into a protected
temporary path:

```bash
npm run db:snapshot:decrypt -- \
  --manifest=.data-snapshots/<capture>.manifest.json \
  --archive=.data-snapshots/<capture>.tar.gz.enc \
  --wrapped-key=.data-snapshots/<capture>.key.enc \
  --private-key=.data-snapshots/source-snapshot-private.pem \
  --output=.data-snapshots/<capture>.tar.gz
```

The command verifies both public checksums before unwrapping the key, and AES-GCM
rejects any modified ciphertext. Inspect with `tar -tzf`; extract only into a temporary
mode-`0700` directory. Never restore the dump over development or production. Actual
restore validation belongs in an isolated disposable PostgreSQL instance.

## DATA-01 acceptance evidence

Record the final workflow URL, artifact expiry, capture ID, cut-off time, ciphertext
SHA-256, public-key fingerprint, Sheet counts, and recovery-check result here and in
the roadmap. Do not record artifact contents or the private key.

| Target      | Workflow | Capture ID | Cut-off | Recovery check |
| ----------- | -------- | ---------- | ------- | -------------- |
| development | pending  | pending    | pending | pending        |
| production  | pending  | pending    | pending | pending        |
