import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  decryptSourceSnapshotArchive,
  encryptSourceSnapshotArchive,
} from "./source-snapshot-crypto";

const createKeyPair = () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });

  return {
    privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    publicKeyPem: publicKey.export({ format: "pem", type: "spki" }).toString(),
  };
};

test("source snapshot encryption round-trips protected bytes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "source-snapshot-crypto-test-"));
  const inputPath = join(directory, "source.tar.gz");
  const encryptedPath = join(directory, "source.tar.gz.enc");
  const wrappedKeyPath = join(directory, "source.key.enc");
  const decryptedPath = join(directory, "decrypted.tar.gz");
  const source = Buffer.from("private customer and bearer data\0".repeat(2_048));
  const { privateKeyPem, publicKeyPem } = createKeyPair();

  try {
    await writeFile(inputPath, source, { mode: 0o600 });
    const encryption = await encryptSourceSnapshotArchive({
      inputPath,
      outputPath: encryptedPath,
      publicKeyPem,
      wrappedKeyPath,
    });

    assert.notDeepEqual(await readFile(encryptedPath), source);
    await decryptSourceSnapshotArchive({
      encryption,
      inputPath: encryptedPath,
      outputPath: decryptedPath,
      privateKeyPem,
      wrappedKey: await readFile(wrappedKeyPath),
    });
    assert.deepEqual(await readFile(decryptedPath), source);
    await assert.rejects(
      decryptSourceSnapshotArchive({
        encryption,
        inputPath: encryptedPath,
        outputPath: decryptedPath,
        privateKeyPem,
        wrappedKey: await readFile(wrappedKeyPath),
      }),
      { code: "EEXIST" },
    );
    assert.deepEqual(await readFile(decryptedPath), source);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("source snapshot authentication rejects modified ciphertext", async () => {
  const directory = await mkdtemp(join(tmpdir(), "source-snapshot-tamper-test-"));
  const inputPath = join(directory, "source.tar.gz");
  const encryptedPath = join(directory, "source.tar.gz.enc");
  const wrappedKeyPath = join(directory, "source.key.enc");
  const decryptedPath = join(directory, "decrypted.tar.gz");
  const { privateKeyPem, publicKeyPem } = createKeyPair();

  try {
    await writeFile(inputPath, "sensitive snapshot", { mode: 0o600 });
    const encryption = await encryptSourceSnapshotArchive({
      inputPath,
      outputPath: encryptedPath,
      publicKeyPem,
      wrappedKeyPath,
    });
    const ciphertext = await readFile(encryptedPath);

    ciphertext[0] = (ciphertext[0] ?? 0) ^ 0xff;
    await writeFile(encryptedPath, ciphertext);

    await assert.rejects(
      decryptSourceSnapshotArchive({
        encryption,
        inputPath: encryptedPath,
        outputPath: decryptedPath,
        privateKeyPem,
        wrappedKey: await readFile(wrappedKeyPath),
      }),
    );
    await assert.rejects(readFile(decryptedPath), { code: "ENOENT" });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("source snapshot encryption never deletes an existing output", async () => {
  const directory = await mkdtemp(join(tmpdir(), "source-snapshot-existing-test-"));
  const inputPath = join(directory, "source.tar.gz");
  const encryptedPath = join(directory, "source.tar.gz.enc");
  const wrappedKeyPath = join(directory, "source.key.enc");
  const { publicKeyPem } = createKeyPair();

  try {
    await writeFile(inputPath, "new snapshot", { mode: 0o600 });
    await writeFile(encryptedPath, "existing snapshot", { mode: 0o600 });

    await assert.rejects(
      encryptSourceSnapshotArchive({
        inputPath,
        outputPath: encryptedPath,
        publicKeyPem,
        wrappedKeyPath,
      }),
      { code: "EEXIST" },
    );
    assert.equal(await readFile(encryptedPath, "utf8"), "existing snapshot");
    await assert.rejects(readFile(wrappedKeyPath), { code: "ENOENT" });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
