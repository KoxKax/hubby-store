import { describe, expect, it, vi } from "vitest";
import { action } from "../app/routes/payos-webhook";
import type { PayosReceipt } from "../app/server/payos.server";
import {
  payosStoreFromRpc,
  payosSupabaseStore,
} from "../app/server/payos-store.server";
import { runtimeContext } from "../app/server/runtime-context.server";

const receipt: PayosReceipt = {
  provider: "payos",
  numericCode: 12001,
  paymentLinkId: "124c33293c43417ab7879e14c8d9eb18",
  receivingAccount: "000000001234",
  reference: "SYNTHETIC-REFERENCE-1",
  amountVnd: 49_000,
  transactionAt: Date.parse("2026-10-26T12:30:00+07:00"),
};

describe("payOS durable-store adapter, no real Supabase connection", () => {
  it("uses exactly the trusted receipt fields in the guarded RPC", async () => {
    const rpc = vi.fn(async () => ({ data: "paid", error: null }));
    const response = await payosStoreFromRpc(rpc).commit(receipt);
    expect(response).toEqual({ durable: true, outcome: "paid" });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("record_payos_receipt", {
      p_reference: receipt.reference,
      p_code: receipt.numericCode,
      p_link_id: receipt.paymentLinkId,
      p_account: receipt.receivingAccount,
      p_amount: receipt.amountVnd,
      p_transferred_at: "2026-10-26T05:30:00.000Z",
    });
  });

  it("acknowledges persisted duplicates/reconciliation but rejects database errors", async () => {
    for (const outcome of ["duplicate", "reconciliation"] as const) {
      expect(
        await payosStoreFromRpc(async () => ({
          data: outcome,
          error: null,
        })).commit(receipt),
      ).toEqual({ durable: true, outcome });
    }
    for (const result of [
      { data: "unknown", error: null },
      { data: null, error: { message: "synthetic database offline" } },
    ]) {
      await expect(
        payosStoreFromRpc(async () => result).commit(receipt),
      ).rejects.toHaveProperty("status", 503);
    }
  });

  it("refuses untrusted database URL or credentials before network access", () => {
    for (const [url, key] of [
      ["https://example.com", "sb_secret_synthetic"],
      ["http://example.supabase.co", "sb_secret_synthetic"],
      ["https://example.supabase.co/path", "sb_secret_synthetic"],
      ["https://example.supabase.co", "sb_publishable_synthetic"],
    ] as const) {
      expect(() => payosSupabaseStore(url, key)).toThrowError();
    }
  });

  it("returns 503 when payOS isn't explicitly enabled by all staging gates", async () => {
    const request = new Request("https://hubby.example.test/webhooks/payos", {
      method: "POST",
      body: "{}",
    });
    const env = {
      APP_ENV: "staging",
      DATA_MODE: "supabase",
      SUPABASE_ENVIRONMENT: "staging",
      PAYMENTS_MODE: "mock",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SECRET_KEY: "sb_secret_synthetic",
      PAYOS_CHECKSUM_KEY: "synthetic-checksum-long-enough-for-adapter",
    };
    const context = {
      get: (key: unknown) => {
        expect(key).toBe(runtimeContext);
        return { env };
      },
    };
    const result = await action({ request, context } as never);
    expect(result.status).toBe(503);
    expect(result.headers.get("Cache-Control")).toBe("no-store");
    expect(result.headers.get("Retry-After")).toBe("300");
  });
});
