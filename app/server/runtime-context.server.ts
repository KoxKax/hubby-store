import type { SupabaseClient } from "@supabase/supabase-js";
import { createContext } from "react-router";
import type { StorefrontContent } from "../content/types";

export type HubbyEnv = Omit<
  Env,
  "APP_ENV" | "DATA_MODE" | "LOCAL_SHOP" | "DEMO_INVENTORY_KEY"
> & {
  APP_ENV: "local" | "staging" | "production";
  DATA_MODE?: "fixtures" | "supabase";
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_ENVIRONMENT?: "staging";
  SITE_ORIGIN?: string;
  DEMO_INVENTORY_KEY?: string;
  LOCAL_SHOP?: Env["LOCAL_SHOP"];
};
export interface VerifiedIdentity {
  id: string;
  email: string;
  owner: boolean;
  aal2: boolean;
}
export interface RuntimeState {
  env: HubbyEnv;
  ctx: ExecutionContext;
  responseHeaders: Headers;
  responseCookies: Map<string, string>;
  client?: SupabaseClient;
  identity?: Promise<VerifiedIdentity | null>;
  csrfToken?: string;
  guestActor?: Promise<string>;
  publishedContent?: Promise<StorefrontContent>;
}

// React Router 8 uses typed context providers instead of a plain context object.
export const runtimeContext = createContext<RuntimeState>();
