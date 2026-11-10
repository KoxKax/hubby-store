import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Local build only. No upload, resource creation, credential read or deployment.
const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(
      new URL("../node_modules/@react-router/dev/bin.cjs", import.meta.url),
    ),
    "build",
  ],
  {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env: { ...process.env, HUBBY_BUILD_TARGET: "hosted-staging" },
    stdio: "inherit",
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
