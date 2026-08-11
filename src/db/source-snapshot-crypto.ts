import {
  constants,
  createCipheriv,
  createDecipheriv,
  privateDecrypt,
  publicEncrypt,
  randomBytes,
} from "node:crypto";
import { createReadStream } from "node:fs";
import { open, rm } from "node:fs/promises";
import { pipeline } from "node:stream/promises";

const CONTENT_KEY_BYTES = 32;
const GCM_IV_BYTES = 12;

export type SourceSnapshotEncryption = {
  algorithm: "aes-256-gcm";
  authTagBase64: string;
  ivBase64: string;
  keyWrap: "rsa-oaep-sha256";
};

const removeIncompleteOutput = async (path: string) => {
  await rm(path, { force: true });
};

export const encryptSourceSnapshotArchive = async ({
  inputPath,
  outputPath,
  publicKeyPem,
  wrappedKeyPath,
}: {
  inputPath: string;
  outputPath: string;
  publicKeyPem: string;
  wrappedKeyPath: string;
}): Promise<SourceSnapshotEncryption> => {
  const contentKey = randomBytes(CONTENT_KEY_BYTES);
  const iv = randomBytes(GCM_IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", contentKey, iv);
  let encryptedOutputCreated = false;
  let wrappedKeyCreated = false;

  try {
    const encryptedOutputHandle = await open(outputPath, "wx", 0o600);

    encryptedOutputCreated = true;
    await pipeline(
      createReadStream(inputPath),
      cipher,
      encryptedOutputHandle.createWriteStream(),
    );

    const wrappedKey = publicEncrypt(
      {
        key: publicKeyPem,
        oaepHash: "sha256",
        padding: constants.RSA_PKCS1_OAEP_PADDING,
      },
      contentKey,
    );

    const wrappedKeyHandle = await open(wrappedKeyPath, "wx", 0o600);

    wrappedKeyCreated = true;
    try {
      await wrappedKeyHandle.writeFile(wrappedKey);
    } finally {
      await wrappedKeyHandle.close();
    }

    return {
      algorithm: "aes-256-gcm",
      authTagBase64: cipher.getAuthTag().toString("base64"),
      ivBase64: iv.toString("base64"),
      keyWrap: "rsa-oaep-sha256",
    };
  } catch (error) {
    await Promise.all([
      encryptedOutputCreated ? removeIncompleteOutput(outputPath) : Promise.resolve(),
      wrappedKeyCreated ? removeIncompleteOutput(wrappedKeyPath) : Promise.resolve(),
    ]);
    throw error;
  } finally {
    contentKey.fill(0);
  }
};

export const decryptSourceSnapshotArchive = async ({
  encryption,
  inputPath,
  outputPath,
  privateKeyPem,
  wrappedKey,
}: {
  encryption: SourceSnapshotEncryption;
  inputPath: string;
  outputPath: string;
  privateKeyPem: string;
  wrappedKey: Buffer;
}) => {
  if (
    encryption.algorithm !== "aes-256-gcm" ||
    encryption.keyWrap !== "rsa-oaep-sha256"
  ) {
    throw new Error("Unsupported source snapshot encryption.");
  }

  const contentKey = privateDecrypt(
    {
      key: privateKeyPem,
      oaepHash: "sha256",
      padding: constants.RSA_PKCS1_OAEP_PADDING,
    },
    wrappedKey,
  );
  const decipher = createDecipheriv(
    "aes-256-gcm",
    contentKey,
    Buffer.from(encryption.ivBase64, "base64"),
  );

  decipher.setAuthTag(Buffer.from(encryption.authTagBase64, "base64"));
  let outputCreated = false;

  try {
    const outputHandle = await open(outputPath, "wx", 0o600);

    outputCreated = true;
    await pipeline(
      createReadStream(inputPath),
      decipher,
      outputHandle.createWriteStream(),
    );
  } catch (error) {
    if (outputCreated) {
      await removeIncompleteOutput(outputPath);
    }
    throw error;
  } finally {
    contentKey.fill(0);
  }
};
