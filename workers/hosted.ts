// Hosted builds never export the local simulator's Durable Object class.
// Scheduled work is inert until an explicitly approved cron trigger exists.
import { runPayosMaintenancePass } from "../app/server/payos-maintenance.server";
import type { HubbyEnv } from "../app/server/runtime-context.server";
import requestHandler from "./request-handler.server";

export default {
  fetch: requestHandler.fetch,
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(runPayosMaintenancePass(env).then(() => undefined));
  },
} satisfies ExportedHandler<HubbyEnv>;
