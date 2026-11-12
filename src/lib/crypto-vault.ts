import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { verifyMessage } from "viem";

const ALGORITHM = "aes-256-gcm";

export interface EncryptedSecretPayload {
  ciphertextB64: string;
  ivB64: string;
  authTagB64: string;
  last4: string;
}

function getServerMasterKey(): Buffer {
  const raw =
    process.env.ISLAND_KEY_ENCRYPTION_SECRET ||
    process.env.AGENT_OPERATOR_PRIVATE_KEY ||
    process.env.DATABASE_URL ||
    "mezocity-local-dev-ephemeral-secret";
  return createHash("sha256")
    .update(`MEZOCITY_ISLAND_GEMINI_KEY_V1:${raw}`)
    .digest();
}

export function encryptIslandGeminiKey(plainApiKey: string): EncryptedSecretPayload {
  const trimmed = plainApiKey.trim();
  if (trimmed.length < 16) {
    throw new Error("Gemini API key appears too short to be valid.");
  }

  const key = getServerMasterKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(trimmed, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertextB64: encrypted.toString("base64"),
    ivB64: iv.toString("base64"),
    authTagB64: authTag.toString("base64"),
    last4: trimmed.slice(-4),
  };
}

export function decryptIslandGeminiKey(payload: {
  ciphertextB64: string;
  ivB64: string;
  authTagB64: string;
}): string {
  const key = getServerMasterKey();
  const iv = Buffer.from(payload.ivB64, "base64");
  const authTag = Buffer.from(payload.authTagB64, "base64");
  const encrypted = Buffer.from(payload.ciphertextB64, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

export function buildIslandAuthMessage(params: {
  address: string;
  islandId: string;
  action: "SAVE_GEMINI_KEY" | "RUN_ISLAND_CYCLE" | "CREATE_AGENT" | "CREATE_VAULT";
  nonce: string;
}): string {
  return [
    "MezoCity Sub-Island Authorization",
    "Chain ID: 31611 (Mezo Testnet)",
    `Wallet: ${params.address.toLowerCase()}`,
    `Island: ${params.islandId}`,
    `Action: ${params.action}`,
    `Nonce: ${params.nonce}`,
  ].join("\n");
}

export async function verifyIslandOwnerSignature(params: {
  expectedAddress: string;
  message: string;
  signature: `0x${string}`;
}): Promise<boolean> {
  try {
    return await verifyMessage({
      address: params.expectedAddress as `0x${string}`,
      message: params.message,
      signature: params.signature,
    });
  } catch {
    return false;
  }
}

export function generateSingleUseNonce(): string {
  return randomBytes(16).toString("hex");
}
