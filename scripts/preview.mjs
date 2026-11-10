import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const value = (flag, fallback) =>
  args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
const port = Number(value("--port", "5174"));
const stateName = value("--state", "hubby-preview-state");
const staging = args.includes("--staging");
if (
  !Number.isInteger(port) ||
  port < 1024 ||
  port > 65535 ||
  !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(stateName)
)
  throw new Error("Invalid local preview port/state name");
if (staging && (port !== 5176 || stateName !== "hubby-staging-state"))
  throw new Error("Staging must use isolated port5176 and state");
// Never persist business records inside build/: rebuilding replaces that directory.
const storage = fileURLToPath(
  new URL(`../.wrangler/${stateName}`, import.meta.url),
);
const cli = fileURLToPath(
  new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
);
let stopping = false;
let currentChild = null;

function start() {
  if (stopping) return;
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
      String(port),
      ...(staging
        ? [
            "--env-file",
            fileURLToPath(new URL("../.dev.vars.staging", import.meta.url)),
            "--inspector-port",
            "9236",
          ]
        : []),
    ],
    { cwd: root, stdio: ["ignore", "inherit", "inherit"] },
  );
  currentChild = child;

  child.on("error", (error) => {
    console.error(`[preview.mjs] child error: ${error.message}`);
  });

  child.on("exit", (code, signal) => {
    console.log(
      `[preview.mjs] wrangler dev exited with code ${code}, signal ${signal}`,
    );
    currentChild = null;
    if (!stopping) {
      console.log("[preview.mjs] auto-restarting wrangler dev in 1s...");
      setTimeout(start, 1000);
    }
  });
}

process.on("uncaughtException", (error) => {
  console.error("[preview.mjs] uncaughtException:", error);
});
process.on("unhandledRejection", (reason) => {
  console.error("[preview.mjs] unhandledRejection:", reason);
});
process.on("SIGTERM", () => {
  stopping = true;
  if (currentChild) currentChild.kill("SIGTERM");
});
process.on("SIGINT", () => {
  stopping = true;
  if (currentChild) currentChild.kill("SIGINT");
});

// Keep process active indefinitely
setInterval(() => {}, 60_000);

start();
