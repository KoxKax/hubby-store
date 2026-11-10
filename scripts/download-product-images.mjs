import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

// Explicit inbound public-asset preparation. No credentials, CMS or provider writes.
const requireRuntime = createRequire(
  "C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json",
);
const sharp = requireRuntime("sharp");
const output = resolve("public/visuals/products");
await mkdir(output, { recursive: true });
const apps = [
  {
    key: "canva",
    id: 897446215,
    bundle: "com.canva.canvaeditor",
    seller: "Canva Pty Ltd",
  },
  {
    key: "capcut",
    id: 1500855883,
    bundle: "com.lemon.lvoverseas",
    seller: "BYTEDANCE PTE. LTD.",
  },
  {
    key: "netflix",
    id: 363590051,
    bundle: "com.netflix.Netflix",
    seller: "Netflix, Inc.",
  },
  {
    key: "duolingo",
    id: 570060128,
    bundle: "com.duolingo.DuolingoMobile",
    seller: "Duolingo, Inc",
  },
  {
    key: "google",
    id: 6477489729,
    bundle: "com.google.gemini",
    seller: "Google LLC",
  },
];
const approvedHosts = new Set([
  "is1-ssl.mzstatic.com",
  "is2-ssl.mzstatic.com",
  "is3-ssl.mzstatic.com",
  "is4-ssl.mzstatic.com",
  "is5-ssl.mzstatic.com",
  "msftstories.thesourcemediaassets.com",
]);
async function save(key, src) {
  const url = new URL(src);
  if (url.protocol !== "https:" || !approvedHosts.has(url.hostname))
    throw new Error("Unapproved image host");
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (
    !response.ok ||
    !response.headers.get("content-type")?.startsWith("image/")
  )
    throw new Error(`Invalid image ${key}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 2000000) throw new Error("Oversized source image");
  for (const width of [160, 320]) {
    const info = await sharp(bytes)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 90 })
      .toFile(resolve(output, `${key}-${width}.webp`));
    console.log(
      JSON.stringify({ product: key, width, bytes: info.size, source: src }),
    );
  }
}
for (const app of apps) {
  const response = await fetch(
    `https://itunes.apple.com/lookup?id=${app.id}&country=us`,
    { signal: AbortSignal.timeout(20000) },
  );
  if (!response.ok) throw new Error(`Metadata unavailable ${app.key}`);
  const data = await response.json();
  const result = data.results?.find(
    (item) =>
      item.trackId === app.id &&
      item.bundleId === app.bundle &&
      item.sellerName === app.seller,
  );
  if (!result?.artworkUrl512)
    throw new Error(`Publisher not verified ${app.key}`);
  await save(app.key, result.artworkUrl512);
}
await save(
  "office",
  "https://msftstories.thesourcemediaassets.com/2019/11/Microsoft365_logo_horiz_c-gray_rgb.png",
);
