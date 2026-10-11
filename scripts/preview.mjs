import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
// Never persist business records inside build/: rebuilding replaces that directory.
const storage = fileURLToPath(
  new URL("../.wrangler/hubby-preview-state", import.meta.url),
);
const cli = fileURLToPath(
  new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
);
const child = spawn(
  process.execPath,
  [
    cli,
    "dev",
    "--local",
    "--config",
    "build/server/wrangler.json",
    "--persist-to",
    storage,
    "--ip",
    "127.0.0.1",
    "--port",
    "5174",
  ],
  { cwd: root, stdio: "inherit" },
);
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 0;
});
process.on("SIGTERM", () => child.kill("SIGTERM"));
process.on("SIGINT", () => child.kill("SIGINT"));
