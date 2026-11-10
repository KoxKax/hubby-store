import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

// Explicit local asset preparation only. Does not publish CMS or deploy.
const assetRoot = resolve("public/visuals");
await mkdir(assetRoot, { recursive: true });
const requireRuntime = createRequire(
  "C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json",
);
const sharp = requireRuntime("sharp");
const input = process.argv.slice(2);
for (let n = 0; n < input.length; n += 2) {
  const [name, file] = input.slice(n, n + 2);
  if (!/^(welcome|students|digital)$/.test(name ?? "") || !file)
    throw new Error("Expected reviewed banner name and generated file path");
  for (const width of [768, 1200]) {
    const target = resolve(assetRoot, `${name}-${width}.webp`);
    const result = await sharp(file)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 84 })
      .toFile(target);
    console.log(name, width, result.size);
  }
}

if (process.env.HUBBY_DOWNLOAD_BRAND_ASSETS === "1") {
  const assets = [
    ["canva.ico", "https://www.canva.com/favicon.ico"],
    [
      "capcut.ico",
      "https://sf16-web-tos-buz.capcutstatic.com/obj/capcut-web-buz-sg/common/images/lv_web-2.ico",
    ],
    [
      "netflix.png",
      "https://assets.nflxext.com/us/ffe/siteui/common/icons/nficon2016.png",
    ],
    [
      "duolingo.png",
      "https://d35aaqx5ub95lt.cloudfront.net/images/duolingo-touch-icon2.png",
    ],
    ["office.ico", "https://www.microsoft.com/favicon.ico"],
    ["google.png", "https://one.google.com/about/public/favicon-32x32.png"],
  ];
  for (const [name, url] of assets) {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (
      !response.ok ||
      !response.headers.get("content-type")?.startsWith("image/")
    )
      throw new Error(`Not a usable official image: ${name}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 250000)
      throw new Error(`Unexpected asset size: ${name}`);
    await writeFile(resolve(assetRoot, name), bytes);
    console.log(name, bytes.length);
  }
}
