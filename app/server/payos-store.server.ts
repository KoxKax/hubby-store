import { createClient } from "@supabase/supabase-js";
import type { PayosPaymentStore } from "./payos.server";

type PayosRpc = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

// Never forward a secret Worker binding into a browser-facing loader.
export function payosStoreFromRpc(rpc: PayosRpc): PayosPaymentStore {
  return {
    async commit(receipt) {
      const { data, error } = await rpc("record_payos_receipt_v2", {
        p_reference: receipt.reference,
        p_code: receipt.numericCode,
        p_link_id: receipt.paymentLinkId,
        p_account: receipt.receivingAccount,
        p_virtual_account: receipt.virtualAccount ?? null,
        p_amount: receipt.amountVnd,
        p_transferred_at: new Date(receipt.transactionAt).toISOString(),
      });
      if (
        error ||
        !["paid", "duplicate", "reconciliation"].includes(String(data))
      )
        throw new Response("Chưa ghi nhận được giao dịch.", { status: 503 });
      return {
        durable: true as const,
        outcome: data as "paid" | "duplicate" | "reconciliation",
      };
    },
  };
}

export function payosSupabaseStore(
  url: string,
  secretKey: string,
): PayosPaymentStore {
  const client = payosAdminClient(url, secretKey);
  return payosStoreFromRpc(async (name, args) => await client.rpc(name, args));
}

export function payosAdminClient(url: string, secretKey: string) {
  let origin: URL;
  try {
    origin = new URL(url);
  } catch {
    throw new Response("Máy chủ thanh toán chưa sẵn sàng.", { status: 503 });
  }
  if (
    origin.origin !== url ||
    origin.protocol !== "https:" ||
    !origin.hostname.endsWith(".supabase.co") ||
    !secretKey.startsWith("sb_secret_")
  )
    throw new Response("Máy chủ thanh toán chưa sẵn sàng.", { status: 503 });

  const client = createClient(origin.origin, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: AbortSignal.any([
            ...(init?.signal ? [init.signal] : []),
            AbortSignal.timeout(10_000),
          ]),
        }),
    },
  });
  return client;
}
