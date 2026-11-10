import { z } from "zod";

// Inventory secrets are encrypted before they ever reach the database.
// This module is server-only; a stock unit's AAD binds its ID, variant and key
// version, preventing an encrypted payload being moved to another SKU.
const inventory = z.discriminatedUnion("type", [
  z
    .object({ type: z.literal("raw_text"), text: z.string().min(1).max(6000) })
    .strict(),
  z
    .object({
      type: z.literal("account"),
      login: z.string().min(1).max(1024),
      password: z.string().min(1).max(1024),
    })
    .strict(),
  z
    .object({
      type: z.literal("license_key"),
      licenseKey: z.string().min(1).max(2048),
    })
    .strict(),
  z
    .object({
      type: z.literal("activation_link"),
      url: z.url().startsWith("https://").max(2048),
    })
    .strict(),
]);

export type StockSecret = z.infer<typeof inventory>;
export interface StockIdentity {
  id: string;
  variantId: string;
}
export interface EncryptedStock {
  ciphertext: string;
  nonce: string;
  key_version: number;
}

// Key material must come from Worker secrets; never persist this map in SQL.
export type StockKeyring = Readonly<Record<number, string>>;

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function context(identity: StockIdentity, version: number): Uint8Array {
  const id = z.uuid().parse(identity.id);
  const variantId = z.uuid().parse(identity.variantId);
  if (!Number.isInteger(version) || version < 1 || version > 1000)
    throw new Error("Invalid stock key version");
  return encoder.encode(`hubby:stock:v1:${id}:${variantId}:${version}`);
}

async function importKey(version: number, keyring: StockKeyring) {
  const material = keyring[version];
  if (!material || !/^[0-9a-fA-F]{64}$/.test(material))
    throw new Error("Stock encryption key unavailable");
  const bytes = new Uint8Array(
    (material.match(/../g) ?? []).map((pair) => Number.parseInt(pair, 16)),
  );
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

function base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value: string): Uint8Array {
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  )
    throw new Error("Invalid encrypted stock encoding");
  const bytes = Uint8Array.from(atob(value), (character) =>
    character.charCodeAt(0),
  );
  if (base64(bytes) !== value)
    throw new Error("Invalid encrypted stock encoding");
  return bytes;
}

export async function sealStockUnit(
  identity: StockIdentity,
  secret: StockSecret,
  keyVersion: number,
  keys: StockKeyring,
): Promise<EncryptedStock> {
  const aad = context(identity, keyVersion);
  const payload = encoder.encode(JSON.stringify(inventory.parse(secret)));
  if (payload.byteLength > 8192) throw new Error("Stock payload exceeds limit");
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: new Uint8Array(nonce),
        additionalData: new Uint8Array(aad),
        tagLength: 128,
      },
      await importKey(keyVersion, keys),
      payload,
    ),
  );
  return {
    ciphertext: base64(ciphertext),
    nonce: base64(nonce),
    key_version: keyVersion,
  };
}

export async function openStockUnit(
  identity: StockIdentity,
  stored: EncryptedStock,
  keys: StockKeyring,
): Promise<StockSecret> {
  const aad = context(identity, stored.key_version);
  if (
    stored.nonce.length !== 16 ||
    stored.ciphertext.length < 32 ||
    stored.ciphertext.length > 32000
  )
    throw new Error("Invalid encrypted stock record");
  const nonce = fromBase64(stored.nonce);
  const ciphertext = fromBase64(stored.ciphertext);
  if (nonce.length !== 12 || ciphertext.length < 16)
    throw new Error("Invalid encrypted stock record");
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: new Uint8Array(nonce),
      additionalData: new Uint8Array(aad),
      tagLength: 128,
    },
    await importKey(stored.key_version, keys),
    new Uint8Array(ciphertext),
  );
  return inventory.parse(JSON.parse(decoder.decode(plaintext)));
}
