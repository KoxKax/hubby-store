import type { Sealed } from "../domain/local-shop";

const encoder = new TextEncoder();
function base64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}
function decode(text: string) {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}
async function key(material: string) {
  if (!/^[0-9a-f]{64}$/.test(material))
    throw new Error("Encryption key configuration invalid");
  return crypto.subtle.importKey(
    "raw",
    Uint8Array.from(material.match(/../g) ?? [], (b) => Number.parseInt(b, 16)),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}
export async function seal(
  text: string,
  aad: string,
  material: string,
): Promise<Sealed> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, additionalData: encoder.encode(aad) },
    await key(material),
    encoder.encode(text),
  );
  return {
    version: 1,
    nonce: base64(nonce),
    ciphertext: base64(new Uint8Array(cipher)),
  };
}
export async function unseal(payload: Sealed, aad: string, material: string) {
  if (payload.version !== 1) throw new Error("Unknown key version");
  const bytes = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: decode(payload.nonce),
      additionalData: encoder.encode(aad),
    },
    await key(material),
    decode(payload.ciphertext),
  );
  return new TextDecoder().decode(bytes);
}
export async function digest(text: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(text)),
  );
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
