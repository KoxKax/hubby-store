export function imageKind(
  bytes: Uint8Array,
): "image/png" | "image/jpeg" | "image/webp" | "image/avif" | null {
  if (bytes.length < 12) return null;
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n))
    return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return "image/jpeg";
  const text = new TextDecoder("ascii");
  if (
    text.decode(bytes.slice(0, 4)) === "RIFF" &&
    text.decode(bytes.slice(8, 12)) === "WEBP"
  )
    return "image/webp";
  if (
    text.decode(bytes.slice(4, 8)) === "ftyp" &&
    ["avif", "avis"].includes(text.decode(bytes.slice(8, 12)))
  )
    return "image/avif";
  return null;
}
