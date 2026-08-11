import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import {
  decryptSourceSnapshotArchive,
  type SourceSnapshotEncryption,
} from "./source-snapshot-crypto";

type PublicManifest = {
  captureId: string;
  encryption: SourceSnapshotEncryption;
  files: {
    encryptedArchive: {
      file: string;
      sha256: string;
    };
    wrappedKey: {
      file: string;
      sha256: string;
    };
  };
  schemaVersion: 1;
};

const getArgumentValue = (name: string) => {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));

  return argument?.slice(prefix.length).trim() ?? "";
};

const sha256File = async (path: string) =>
  new Promise<string>((resolvePromise, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);

    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolvePromise(hash.digest("hex")));
  });

const parseManifest = (value: unknown): PublicManifest => {
  if (!value || typeof value !== "object") {
    throw new Error("Snapshot manifest is not an object.");
  }

  const manifest = value as Partial<PublicManifest>;

  if (
    manifest.schemaVersion !== 1 ||
    typeof manifest.captureId !== "string" ||
    manifest.encryption?.algorithm !== "aes-256-gcm" ||
    manifest.encryption.keyWrap !== "rsa-oaep-sha256" ||
    typeof manifest.encryption.authTagBase64 !== "string" ||
    typeof manifest.encryption.ivBase64 !== "string" ||
    typeof manifest.files?.encryptedArchive?.file !== "string" ||
    typeof manifest.files.encryptedArchive.sha256 !== "string" ||
    typeof manifest.files.wrappedKey?.file !== "string" ||
    typeof manifest.files.wrappedKey.sha256 !== "string"
  ) {
    throw new Error("Unsupported or incomplete snapshot manifest.");
  }

  return manifest as PublicManifest;
};

const requirePathArgument = (name: string) => {
  const value = getArgumentValue(name);

  if (!value) {
    throw new Error(`Pass --${name}=PATH explicitly.`);
  }

  return resolve(process.cwd(), value);
};

const main = async () => {
  const manifestPath = requirePathArgument("manifest");
  const encryptedArchivePath = requirePathArgument("archive");
  const wrappedKeyPath = requirePathArgument("wrapped-key");
  const privateKeyPath = requirePathArgument("private-key");
  const outputPath = requirePathArgument("output");
  const manifest = parseManifest(JSON.parse(await readFile(manifestPath, "utf8")));

  if (
    basename(encryptedArchivePath) !== manifest.files.encryptedArchive.file ||
    basename(wrappedKeyPath) !== manifest.files.wrappedKey.file
  ) {
    throw new Error("Snapshot filenames do not match the public manifest.");
  }

  const [archiveSha256, wrappedKeySha256] = await Promise.all([
    sha256File(encryptedArchivePath),
    sha256File(wrappedKeyPath),
  ]);

  if (archiveSha256 !== manifest.files.encryptedArchive.sha256) {
    throw new Error("Encrypted archive SHA-256 does not match the manifest.");
  }

  if (wrappedKeySha256 !== manifest.files.wrappedKey.sha256) {
    throw new Error("Wrapped key SHA-256 does not match the manifest.");
  }

  await decryptSourceSnapshotArchive({
    encryption: manifest.encryption,
    inputPath: encryptedArchivePath,
    outputPath,
    privateKeyPem: await readFile(privateKeyPath, "utf8"),
    wrappedKey: await readFile(wrappedKeyPath),
  });

  process.stdout.write(
    `${JSON.stringify({ captureId: manifest.captureId, outputPath })}\n`,
  );
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown decryption error";

  console.error(`Failed to decrypt DATA source snapshot: ${message}`);
  process.exitCode = 1;
});
