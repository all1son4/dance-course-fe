import { spawn } from "node:child_process";
import { createHash, createPublicKey } from "node:crypto";
import { constants as fileConstants, createReadStream } from "node:fs";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import { getDatabaseEnvSelection, getRequiredDatabaseUrlFromEnv } from "./env";
import { loadDatabaseEnvConfig } from "./load-env";
import { encryptSourceSnapshotArchive } from "./source-snapshot-crypto";
import {
  assertLegacyContractArchiveTables,
  assertSnapshotDatabaseEnvVariable,
  LEGACY_CONTRACT_ARCHIVE_ENTRIES,
  type SourceSnapshotTarget,
} from "./source-snapshot-plan";

type CommandResult = {
  stderr: string;
  stdout: string;
};

const getArgumentValue = (name: string) => {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));

  return argument?.slice(prefix.length).trim() ?? "";
};

const getTarget = (): SourceSnapshotTarget => {
  const target = getArgumentValue("target").toLowerCase();

  if (target === "development" || target === "production") {
    return target;
  }

  throw new Error("Pass --target=development or --target=production explicitly.");
};

const runCommand = async (
  command: string,
  args: string[],
  options?: {
    env?: NodeJS.ProcessEnv;
    redact?: string[];
  },
): Promise<CommandResult> =>
  new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      env: options?.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      if (exitCode === 0) {
        resolvePromise({ stderr, stdout });
        return;
      }

      const redacted = (options?.redact ?? [])
        .reduce(
          (message, secret) =>
            secret ? message.replaceAll(secret, "[REDACTED]") : message,
          stderr.trim(),
        )
        .replaceAll(/postgres(?:ql)?:\/\/[^\s"]+/giu, "[REDACTED_DATABASE_URL]");

      reject(
        new Error(
          `${command} exited with code ${exitCode ?? "unknown"}${
            redacted ? `: ${redacted}` : ""
          }`,
        ),
      );
    });
  });

const sha256File = async (path: string) =>
  new Promise<string>((resolvePromise, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);

    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolvePromise(hash.digest("hex")));
  });

const getFileEvidence = async (path: string) => ({
  bytes: (await stat(path)).size,
  file: basename(path),
  sha256: await sha256File(path),
});

const getPublicKeyFingerprint = (publicKeyPem: string) => {
  const der = createPublicKey(publicKeyPem).export({
    format: "der",
    type: "spki",
  });

  return createHash("sha256").update(der).digest("hex");
};

const getGitSha = async () => {
  const environmentSha = (process.env.GITHUB_SHA ?? "").trim();

  if (environmentSha) {
    return environmentSha;
  }

  return (await runCommand("git", ["rev-parse", "HEAD"])).stdout.trim();
};

const writePrivateJson = async (path: string, value: unknown) => {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
};

const getPostgresCommand = ({
  databaseUrl,
  program,
  programArgs,
  workingDirectory,
}: {
  databaseUrl: string;
  program: "pg_dump" | "pg_restore";
  programArgs: string[];
  workingDirectory: string;
}) => {
  const mode = (process.env.DATA_SNAPSHOT_PG_MODE ?? "native").trim().toLowerCase();
  let parsedDatabaseUrl: URL;

  try {
    parsedDatabaseUrl = new URL(databaseUrl);
  } catch {
    throw new Error("Snapshot database URL is invalid.");
  }

  const databaseName = decodeURIComponent(parsedDatabaseUrl.pathname.replace(/^\//u, ""));
  const databaseUser = decodeURIComponent(parsedDatabaseUrl.username);
  const databasePassword = decodeURIComponent(parsedDatabaseUrl.password);

  if (
    !databaseName ||
    !databaseUser ||
    !databasePassword ||
    !parsedDatabaseUrl.hostname
  ) {
    throw new Error("Snapshot database URL is incomplete.");
  }

  const env = {
    ...process.env,
    PGDATABASE: databaseName,
    PGHOST: parsedDatabaseUrl.hostname,
    PGPASSWORD: databasePassword,
    PGPORT: parsedDatabaseUrl.port || "5432",
    PGSSLMODE: parsedDatabaseUrl.searchParams.get("sslmode") || "require",
    PGUSER: databaseUser,
  };

  if (mode === "native") {
    return {
      args: programArgs,
      command: program,
      env,
      redact: [databaseUrl, databasePassword, databaseUser],
    };
  }

  if (mode !== "docker") {
    throw new Error("DATA_SNAPSHOT_PG_MODE must be native or docker.");
  }

  const image = (process.env.DATA_SNAPSHOT_POSTGRES_IMAGE ?? "postgres:17-alpine").trim();
  const containerPath = (path: string) => `/snapshot/${basename(path)}`;
  const mappedArgs = programArgs.map((argument) => {
    if (argument.startsWith(workingDirectory)) {
      return containerPath(argument);
    }

    const filePrefix = `--file=${workingDirectory}`;

    if (argument.startsWith(filePrefix)) {
      return `--file=${containerPath(argument.slice("--file=".length))}`;
    }

    return argument;
  });
  const user =
    typeof process.getuid === "function" && typeof process.getgid === "function"
      ? ["--user", `${process.getuid()}:${process.getgid()}`]
      : [];

  return {
    args: [
      "run",
      "--rm",
      "--env",
      "PGDATABASE",
      "--env",
      "PGHOST",
      "--env",
      "PGPASSWORD",
      "--env",
      "PGPORT",
      "--env",
      "PGSSLMODE",
      "--env",
      "PGUSER",
      "--volume",
      `${workingDirectory}:/snapshot`,
      ...user,
      image,
      program,
      ...mappedArgs,
    ],
    command: "docker",
    env,
    redact: [databaseUrl, databasePassword, databaseUser],
  };
};

const runPostgresCommand = async ({
  databaseUrl,
  program,
  programArgs,
  workingDirectory,
}: {
  databaseUrl: string;
  program: "pg_dump" | "pg_restore";
  programArgs: string[];
  workingDirectory: string;
}) => {
  const invocation = getPostgresCommand({
    databaseUrl,
    program,
    programArgs,
    workingDirectory,
  });

  return runCommand(invocation.command, invocation.args, {
    env: invocation.env,
    redact: invocation.redact ?? [databaseUrl],
  });
};

const captureDatabaseDump = async ({
  databaseUrl,
  dumpPath,
  workingDirectory,
}: {
  databaseUrl: string;
  dumpPath: string;
  workingDirectory: string;
}) => {
  const captureStartedAt = new Date().toISOString();

  await runPostgresCommand({
    databaseUrl,
    program: "pg_dump",
    programArgs: [
      "--format=custom",
      "--compress=9",
      "--no-owner",
      "--no-acl",
      "--serializable-deferrable",
      `--file=${dumpPath}`,
    ],
    workingDirectory,
  });
  const restoreListing = await runPostgresCommand({
    databaseUrl,
    program: "pg_restore",
    programArgs: ["--list", dumpPath],
    workingDirectory,
  });

  return {
    captureCompletedAt: new Date().toISOString(),
    captureStartedAt,
    restoreListing: restoreListing.stdout,
  };
};

const getPostgresToolVersion = async ({
  databaseUrl,
  workingDirectory,
}: {
  databaseUrl: string;
  workingDirectory: string;
}) =>
  (
    await runPostgresCommand({
      databaseUrl,
      program: "pg_dump",
      programArgs: ["--version"],
      workingDirectory,
    })
  ).stdout.trim();

const getPublicKey = async () => {
  const path = getArgumentValue("public-key-path");
  const value = process.env.DATA_SNAPSHOT_PUBLIC_KEY?.trim() ?? "";

  if (path && value) {
    throw new Error(
      "Use either --public-key-path or DATA_SNAPSHOT_PUBLIC_KEY, not both.",
    );
  }

  if (path) {
    return readFile(resolve(process.cwd(), path), "utf8");
  }

  if (value) {
    return value.replace(/\\n/g, "\n");
  }

  throw new Error(
    "Missing snapshot RSA public key. Set DATA_SNAPSHOT_PUBLIC_KEY or pass --public-key-path.",
  );
};

const main = async () => {
  const target = getTarget();
  const confirmation = getArgumentValue("confirmation");
  const expectedConfirmation = `snapshot-${target}`;

  if (confirmation !== expectedConfirmation) {
    throw new Error(`Pass --confirmation=${expectedConfirmation} exactly.`);
  }

  process.env.DATABASE_ENV = target;
  loadDatabaseEnvConfig();

  const databaseSelection = getDatabaseEnvSelection("unpooled");

  if (databaseSelection.deploymentEnvironment !== target) {
    throw new Error(
      `Resolved ${databaseSelection.deploymentEnvironment} database for ${target} snapshot.`,
    );
  }

  assertSnapshotDatabaseEnvVariable({
    target,
    variableName: databaseSelection.variableName,
  });

  const databaseUrl = getRequiredDatabaseUrlFromEnv({
    kind: "unpooled",
    purpose: `${target} legacy contract snapshot`,
  });
  const publicKeyPem = await getPublicKey();
  const publicKeySha256 = getPublicKeyFingerprint(publicKeyPem);
  const outputDirectory = resolve(
    process.cwd(),
    getArgumentValue("output-dir") || ".data-snapshots",
  );
  const workingDirectory = await mkdtemp(join(tmpdir(), "dance-course-data-snapshot-"));
  const captureStartedAt = new Date().toISOString();
  const gitSha = await getGitSha();
  const timestamp = captureStartedAt.replaceAll(/[-:.]/gu, "");
  const captureId = `${target}-database-${timestamp}-${gitSha.slice(0, 12)}`;
  const encryptedArchiveName = `${captureId}.tar.gz.enc`;
  const wrappedKeyName = `${captureId}.key.enc`;
  const publicManifestName = `${captureId}.manifest.json`;
  const finalEncryptedArchivePath = join(outputDirectory, encryptedArchiveName);
  const finalWrappedKeyPath = join(outputDirectory, wrappedKeyName);
  const finalPublicManifestPath = join(outputDirectory, publicManifestName);
  const dumpPath = join(workingDirectory, "database.dump");
  const internalManifestPath = join(workingDirectory, "manifest.json");
  const plainArchivePath = join(workingDirectory, `${captureId}.tar.gz`);
  const encryptedArchivePath = join(workingDirectory, encryptedArchiveName);
  const wrappedKeyPath = join(workingDirectory, wrappedKeyName);
  const createdFinalPaths: string[] = [];

  await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
  await chmod(outputDirectory, 0o700);

  try {
    const postgresToolVersion = await getPostgresToolVersion({
      databaseUrl,
      workingDirectory,
    });
    const databaseCapture = await captureDatabaseDump({
      databaseUrl,
      dumpPath,
      workingDirectory,
    });
    const captureCompletedAt = new Date().toISOString();
    const { restoreListing, ...databaseCaptureEvidence } = databaseCapture;
    const databaseFile = await getFileEvidence(dumpPath);
    const legacyContractArchiveTables = assertLegacyContractArchiveTables(restoreListing);
    const internalManifest = {
      captureId,
      captureWindow: {
        completedAt: captureCompletedAt,
        startedAt: captureStartedAt,
      },
      cutOffAt: captureCompletedAt,
      cutOffPolicy:
        "PostgreSQL custom-format dump captured from one serializable, deferrable transaction.",
      database: {
        ...databaseCaptureEvidence,
        file: databaseFile,
        toolVersion: postgresToolVersion,
      },
      gitSha,
      legacyContractArchiveTables,
      schemaVersion: 2 as const,
      scope: "database" as const,
      target,
    };

    await writePrivateJson(internalManifestPath, internalManifest);
    await runCommand("tar", [
      "-czf",
      plainArchivePath,
      "-C",
      workingDirectory,
      ...LEGACY_CONTRACT_ARCHIVE_ENTRIES,
    ]);
    await chmod(plainArchivePath, 0o600);

    const encryption = await encryptSourceSnapshotArchive({
      inputPath: plainArchivePath,
      outputPath: encryptedArchivePath,
      publicKeyPem,
      wrappedKeyPath,
    });
    await copyFile(
      encryptedArchivePath,
      finalEncryptedArchivePath,
      fileConstants.COPYFILE_EXCL,
    );
    createdFinalPaths.push(finalEncryptedArchivePath);
    await copyFile(wrappedKeyPath, finalWrappedKeyPath, fileConstants.COPYFILE_EXCL);
    createdFinalPaths.push(finalWrappedKeyPath);
    await Promise.all([
      chmod(finalEncryptedArchivePath, 0o600),
      chmod(finalWrappedKeyPath, 0o600),
    ]);

    const [encryptedArchive, wrappedKey] = await Promise.all([
      getFileEvidence(finalEncryptedArchivePath),
      getFileEvidence(finalWrappedKeyPath),
    ]);
    const publicManifest = {
      captureId,
      captureWindow: internalManifest.captureWindow,
      cutOffAt: internalManifest.cutOffAt,
      encryption,
      files: {
        encryptedArchive,
        wrappedKey,
      },
      gitSha,
      legacyContractArchiveTables,
      publicKeySha256,
      schemaVersion: internalManifest.schemaVersion,
      scope: internalManifest.scope,
      target,
    };

    await writePrivateJson(finalPublicManifestPath, publicManifest);
    createdFinalPaths.push(finalPublicManifestPath);
    process.stdout.write(
      `${JSON.stringify({
        captureId,
        cutOffAt: internalManifest.cutOffAt,
        encryptedArchiveSha256: encryptedArchive.sha256,
        outputDirectory,
        publicKeySha256,
        scope: internalManifest.scope,
        target,
      })}\n`,
    );
  } catch (error) {
    await Promise.all(createdFinalPaths.map((path) => rm(path, { force: true })));
    throw error;
  } finally {
    await rm(workingDirectory, { force: true, recursive: true });
  }
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown snapshot error";

  console.error(`Failed to capture protected legacy contract snapshot: ${message}`);
  process.exitCode = 1;
});
