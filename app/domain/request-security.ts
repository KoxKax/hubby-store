function unsafePath(value: string) {
  return [...value].some((char) => char === "\\" || char.charCodeAt(0) <= 32);
}
export function safeNext(value: unknown, fallback = "/tai-khoan") {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    unsafePath(value)
  )
    return fallback;
  try {
    const url = new URL(value, "https://hubby.invalid");
    const decoded = decodeURIComponent(url.pathname);
    if (
      url.origin !== "https://hubby.invalid" ||
      unsafePath(decoded) ||
      decoded.startsWith("//")
    )
      return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("Origin");
  if (
    request.method !== "POST" ||
    origin !== new URL(request.url).origin ||
    request.headers.get("Sec-Fetch-Site") === "cross-site"
  )
    throw new Response("Yêu cầu không hợp lệ", { status: 403 });
}
export function equalToken(a: string, b: string) {
  if (a.length !== 43 || b.length !== 43) return false;
  let diff = 0;
  for (let i = 0; i < 43; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
