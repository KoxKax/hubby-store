import type { SupabaseClient } from "@supabase/supabase-js";
import { createContext } from "react-router";
import type { StorefrontContent } from "../content/types";

export type HubbyEnv = Omit<
  Env,
  | "APP_ENV"
  | "DATA_MODE"
  | "LOCAL_SHOP"
  | "DEMO_INVENTORY_KEY"
  | "PAYMENTS_MODE"
  | "SUPPLIERS_MODE"
> & {
  APP_ENV: "local" | "staging" | "production";
  DATA_MODE?: "fixtures" | "supabase";
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_ENVIRONMENT?: "staging";
  SUPABASE_SECRET_KEY?: string;
  PAYMENTS_MODE?: "mock" | "payos";
  SUPPLIERS_MODE?: "mock" | "bite";
  BITE_API_KEY?: string;
  TELEGRAM_CONFIG?: string;
  CANVA_TELEGRAM?: DurableObjectNamespace;
  BITE_READY?: string;
  BITE_SCHEMA_READY?: string;
  BITE_TRACKING_READY?: string;
  PAYOS_CHECKOUT_READY?: string;
  GUEST_CLAIM_READY?: string;
  PAYOS_CLIENT_ID?: string;
  PAYOS_API_KEY?: string;
  PAYOS_CHECKSUM_KEY?: string;
  INVENTORY_ENCRYPTION_KEY_V1?: string;
  SITE_ORIGIN?: string;
  SITE_ALIAS?: string;
  DEMO_INVENTORY_KEY?: string;
  LOCAL_SHOP?: Env["LOCAL_SHOP"];
};
export interface VerifiedIdentity {
  id: string;
  email: string;
  /** True only when Supabase verified the current address, not profile metadata. */
  emailVerified: boolean;
  owner: boolean;
  aal2: boolean;
  mfaRequired: boolean;
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
  authAvailability?: Promise<{
    available: boolean;
    email: boolean;
    google: boolean;
  }>;
}

// React Router 8 uses typed context providers instead of a plain context object.
export const runtimeContext = createContext<RuntimeState>();
