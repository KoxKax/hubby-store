import { readFileSync } from "node:fs";
import { hostingPreflight } from "../app/server/hosting-preflight.ts";

let input;
try {
  input = JSON.parse(
    readFileSync(
      new URL(
        "../.wrangler/hosted-build/server/wrangler.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
} catch {
  // Never echo config contents or errors containing input values.
}
const report = hostingPreflight(input);
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.configurationAccepted ? 0 : 2;
