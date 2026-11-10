import { z } from "zod";
import { payosAdminClient } from "./payos-store.server";
import type { HubbyEnv } from "./runtime-context.server";
import {
  type StockKeyring,
  type StockSecret,
  sealStockUnit,
} from "./stock-seal.server";

const stockInput = z
  .object({
    stockId: z.uuid(),
    variantId: z.uuid(),
    secret: z.unknown(),
  })
  .strict();

export interface StockProvisionInput {
  stockId: string;
  variantId: string;
  secret: StockSecret;
}

export interface InventoryGateway {
  rpc(
    name:
      | "provision_payos_stock"
      | "payos_stock_counts"
      | "list_payos_stock_units"
      | "quarantine_payos_stock",
    params: Record<string, unknown>,
  ): Promise<unknown>;
}

const stockCounts = z.array(
  z
    .object({
      variantId: z.uuid(),
      available: z.number().int().nonnegative(),
      reserved: z.number().int().nonnegative(),
      delivered: z.number().int().nonnegative(),
      quarantined: z.number().int().nonnegative(),
    })
    .strict(),
);

export async function loadPayosStockCounts(gateway: InventoryGateway) {
  return stockCounts.parse(await gateway.rpc("payos_stock_counts", {}));
}

const stockUnitList = z
  .array(
    z
      .object({
        id: z.uuid(),
        variantId: z.uuid(),
        state: z.enum(["available", "quarantined"]),
        createdAt: z.iso.datetime({ offset: true }),
      })
      .strict(),
  )
  .max(100);

const quarantineInput = z
  .object({
    stockId: z.uuid(),
    actorId: z.uuid(),
    reason: z.enum(["invalid", "compromised", "expired", "other"]),
  })
  .strict();

export type StockQuarantineReason = z.infer<typeof quarantineInput>["reason"];

export async function loadPayosStockUnits(gateway: InventoryGateway) {
  return stockUnitList.parse(
    await gateway.rpc("list_payos_stock_units", { p_limit: 50 }),
  );
}

export async function quarantinePayosStock(
  input: { stockId: string; actorId: string; reason: string },
  gateway: InventoryGateway,
): Promise<boolean> {
  const parsed = quarantineInput.parse(input);
  const result = await gateway.rpc("quarantine_payos_stock", {
    p_stock: parsed.stockId,
    p_actor: parsed.actorId,
    p_reason: parsed.reason,
  });
  if (typeof result !== "boolean")
    throw new Error("Inventory quarantine result is ambiguous");
  return result;
}

export function payosInventoryReady(env: HubbyEnv): boolean {
  return (
    env.APP_ENV === "staging" &&
    env.DATA_MODE === "supabase" &&
    env.SUPABASE_ENVIRONMENT === "staging" &&
    !!env.SUPABASE_URL &&
    !!env.SUPABASE_SECRET_KEY &&
    !!env.INVENTORY_ENCRYPTION_KEY_V1 &&
    /^[0-9a-f]{64}$/i.test(env.INVENTORY_ENCRYPTION_KEY_V1)
  );
}

// A stable, one-use stockId is supplied by the Owner form. A lost response to
// an insert can be retried with the SAME ID: PostgreSQL's primary key fails
// closed instead of allocating a second sellable copy of the same credential.
export async function provisionEncryptedPayosStock(
  input: StockProvisionInput,
  keys: StockKeyring,
  gateway: InventoryGateway,
): Promise<{ stockId: string }> {
  const candidate = stockInput.parse(input);
  const encoded = await sealStockUnit(
    { id: candidate.stockId, variantId: candidate.variantId },
    input.secret,
    1,
    keys,
  );
  const result = await gateway.rpc("provision_payos_stock", {
    p_id: candidate.stockId,
    p_variant: candidate.variantId,
    p_ciphertext: encoded.ciphertext,
    p_nonce: encoded.nonce,
    p_key_version: encoded.key_version,
  });
  if (result !== true)
    throw new Error("Inventory storage did not confirm write");
  return { stockId: candidate.stockId };
}

export function payosInventoryGateway(env: HubbyEnv): InventoryGateway {
  if (!payosInventoryReady(env))
    throw new Error("Encrypted inventory provisioning is disabled");
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Inventory storage unavailable");
  const client = payosAdminClient(url, key);
  return {
    async rpc(name, params) {
      if (
        name !== "provision_payos_stock" &&
        name !== "payos_stock_counts" &&
        name !== "list_payos_stock_units" &&
        name !== "quarantine_payos_stock"
      )
        throw new Error("Unsupported inventory operation");
      const { data, error } = await client.rpc(name, params);
      if (error) throw new Error("Inventory storage unavailable");
      return data;
    },
  };
}
