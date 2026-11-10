import { z } from "zod";

type Row = Record<string, unknown>;
function row(v: unknown): Row {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : {};
}
export function biteId(v: unknown): string | null {
  const id = typeof v === "number" && Number.isSafeInteger(v) ? String(v) : v;
  return typeof id === "string" && /^[0-9]{1,20}$/.test(id) ? id : null;
}
function decimal(v: unknown): string | null {
  const s = typeof v === "number" || typeof v === "string" ? String(v) : "";
  return /^[0-9]{1,12}(\.[0-9]{1,6})?$/.test(s) ? s : null;
}
export class BiteError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 0,
  ) {
    super("Bite request unavailable");
  }
}
async function request(
  path: string,
  apiKey: string,
  purchase?: { productId: string; idempotencyKey: string },
) {
  if (!apiKey) throw new BiteError("missing_key");
  const headers: Record<string, string> = {
    "X-API-Key": apiKey,
    Accept: "application/json",
  };
  if (purchase) {
    headers["Content-Type"] = "application/json";
    headers["Idempotency-Key"] = purchase.idempotencyKey;
  }
  let response: Response;
  try {
    response = await fetch(`https://reseller.bite-store.com${path}`, {
      method: purchase ? "POST" : "GET",
      headers,
      ...(purchase
        ? { body: JSON.stringify({ productId: purchase.productId, quantity: 1 }) }
        : {}),
      // Observe GET redirects without forwarding the reseller key. A POST
      // could already have charged the wallet, so leave its transport strict.
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    // Only log allowlisted diagnostics. Fetch errors may otherwise include
    // request details, and a purchase POST could already have reached Bite.
    const name = error instanceof Error ? error.name : "unknown";
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    const kind =
      name === "TimeoutError" || message.includes("timed out")
        ? "timeout"
        : message.includes("redirect")
          ? "redirect"
          : message.includes("certificate") || message.includes("tls")
            ? "tls"
            : message.includes("dns")
              ? "dns"
              : "fetch";
    console.warn("Bite transport failure", { kind, name, operation: purchase ? "purchase" : "read" });
    throw new BiteError(kind === "timeout" ? "network_timeout" : "network_unavailable");
  }
  if (response.status >= 300 && response.status < 400) {
    {
      const location = response.headers.get("location");
      let destination = "missing";
      try {
        const host = new URL(location ?? "", "https://reseller.bite-store.com").hostname;
        destination = /^[a-z0-9.-]{1,120}$/i.test(host) ? host : "invalid";
      } catch {
        destination = "invalid";
      }
      console.warn("Bite read-only redirect rejected", {
        status: response.status,
        destination,
      });
    }
    throw new BiteError("source_redirect", response.status);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new BiteError("empty_response", response.status);
  let size = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > (path.startsWith("/v1/products?") ? 2_000_000 : 48_000)) {
      await reader.cancel();
      throw new BiteError("response_limit", response.status);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (!response.ok)
    throw new BiteError(`http_${response.status}`, response.status);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new BiteError("invalid_json", response.status);
  }
  if (row(body).ok === false)
    throw new BiteError("provider_rejected", response.status);
  return {
    body,
    evidence: Array.from(text).slice(0, 1500).join("") || "Empty response",
  };
}
export interface BiteProduct {
  externalId: string;
  name: string;
  description: string;
  category: string;
  price: string;
  currency: string | null;
  normalPrice: string | null;
  stock: number | null;
  inStock: boolean;
  promotion: string;
  delivery: string;
}
export async function fetchBiteProducts(
  apiKey: string,
  page: number,
): Promise<BiteProduct[]> {
  z.number().int().min(1).max(100).parse(page);
  const { body } = await request(
    `/v1/products?page=${page}&per_page=100&live=0`,
    apiKey,
  );
  const envelope = row(body),
    data = envelope.data;
  const list = Array.isArray(body)
    ? body
    : Array.isArray(envelope.products)
      ? envelope.products
      : Array.isArray(data)
        ? data
        : row(data).products;
  if (!Array.isArray(list) || list.length > 100)
    throw new BiteError("catalog_schema");
  const products = list.map((value) => {
    const p = row(value),
      externalId = biteId(p.id ?? p.productId),
      price = decimal(p.price);
    const stock =
      typeof p.stock === "number" &&
      Number.isSafeInteger(p.stock) &&
      p.stock >= 0
        ? p.stock
        : null;
    const inStock =
      typeof p.inStock === "boolean"
        ? p.inStock
        : stock !== null
          ? stock > 0
          : null;
    if (
      !externalId ||
      !price ||
      typeof p.name !== "string" ||
      !p.name.trim() ||
      inStock === null
    )
      throw new BiteError("product_schema");
    const category =
      typeof p.category === "string" || typeof p.category === "number"
        ? String(p.category)
        : row(p.category).name;
    return {
      externalId,
      name: p.name.slice(0, 300),
      description:
        typeof p.description === "string" ? p.description.slice(0, 4000) : "",
      category: typeof category === "string" ? category.slice(0, 200) : "",
      price,
      normalPrice: decimal(p.normalPrice),
      currency:
        typeof p.currency === "string" && /^[A-Za-z_]{1,20}$/.test(p.currency)
          ? p.currency.toUpperCase()
          : null,
      stock,
      inStock,
      promotion: p.promotion ? JSON.stringify(p.promotion).slice(0, 4000) : "",
      delivery:
        typeof p.deliveryType === "string"
          ? p.deliveryType.slice(0, 80)
          : typeof p.format === "string"
            ? p.format.slice(0, 80)
            : "",
    };
  });
  if (new Set(products.map((p) => p.externalId)).size !== products.length)
    throw new BiteError("duplicate_product");
  return products;
}
export interface BiteOrderResult {
  outcome: "received" | "waiting" | "failed" | "file_ready" | "uncertain";
  orderId: string | null;
  status: string;
  amount: string | null;
  currency: string | null;
  text?: string;
  evidence: string;
}
function orderResult(
  body: unknown,
  evidence: string,
  expectedId?: string,
  purchase = false,
): BiteOrderResult {
  const value = row(body),
    p = typeof value.data === "object" ? row(value.data) : value;
  const orderId = biteId(p.orderId ?? p.id),
    status = typeof p.status === "string" ? p.status.toLowerCase() : "unknown";
  if (
    !orderId ||
    (expectedId && orderId !== expectedId) ||
    (purchase && value.ok !== true && p.ok !== true)
  )
    return {
      outcome: "uncertain",
      orderId: null,
      status: "unknown",
      amount: null,
      currency: null,
      evidence,
    };
  const base = {
    orderId,
    status,
    amount: decimal(p.amount),
    currency:
      typeof p.currency === "string" && /^[A-Za-z_]{1,20}$/.test(p.currency)
        ? p.currency.toUpperCase()
        : null,
    evidence,
  };
  if (status === "failed") return { ...base, outcome: "failed" };
  if (["pending", "processing"].includes(status))
    return { ...base, outcome: "waiting" };
  if (status === "delivered" && p.deliveredFileRef)
    return { ...base, outcome: "file_ready" };
  const keys = z
    .array(z.string().min(1).max(6000))
    .length(1)
    .safeParse(p.deliveredKeys);
  if (
    status === "delivered" &&
    keys.success &&
    new TextEncoder().encode(keys.data[0]).length <= 6000
  )
    return { ...base, outcome: "received", text: keys.data[0] };
  return { ...base, outcome: "uncertain" };
}
export async function purchaseBiteOnce(
  productId: string,
  apiKey: string,
  idempotencyKey: string,
) {
  if (!biteId(productId) || !/^[A-Za-z0-9:-]{10,120}$/.test(idempotencyKey))
    throw new BiteError("invalid_identity");
  const result = await request("/v1/orders", apiKey, {
    productId,
    idempotencyKey,
  });
  return orderResult(result.body, result.evidence, undefined, true);
}
export async function fetchBiteOrder(orderId: string, apiKey: string) {
  if (!biteId(orderId)) throw new BiteError("invalid_order");
  const result = await request(`/v1/orders/${orderId}`, apiKey);
  return orderResult(result.body, result.evidence, orderId);
}

// Owner-only read operations. Bite does not publish a stable typed response
// schema for these endpoints; expose only financial/status fields, never raw
// order payloads (which may contain delivered keys or customer information).
const FINANCE_FIELD = /^(usd|points?|balance|available|locked|pending|spent|total|credit|currency|amount|wallet|remaining|refunded|value|rate|\w*(?:_balance|_points|_amount|_usd))$/i;
const TRANSACTION_FIELDS = [
  "id", "orderId", "transactionId", "type", "kind", "status",
  "amount", "currency", "points", "delta", "createdAt", "created_at",
  "timestamp", "productId", "usdAmount", "refunded", "refundAmount",
] as const;

function safeValue(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value))
    return String(value);
  if (typeof value !== "string" || value.length > 80) return null;
  // Prevent accidental display of credentials, URLs, customer text or keys.
  return /^[A-Za-z0-9_.: -]{1,80}$/.test(value) ? value : null;
}

function balanceFields(
  input: unknown,
  prefix = "",
  depth = 0,
  result: { field: string; value: string }[] = [],
) {
  if (depth > 3 || result.length >= 30) return result;
  for (const [key, value] of Object.entries(row(input)).slice(0, 40)) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(key)) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      balanceFields(value, path, depth + 1, result);
    } else if (FINANCE_FIELD.test(key)) {
      const safe = safeValue(value);
      if (safe !== null) result.push({ field: path, value: safe });
    }
    if (result.length >= 30) break;
  }
  return result;
}

export async function fetchBiteWallet(apiKey: string) {
  const { body } = await request("/v1/balance", apiKey);
  return {
    fields: balanceFields(body),
    // For an undocumented schema, field names help the Owner report a change
    // without disclosing raw values or reseller credentials.
    topLevelFields: Object.keys(row(body)).slice(0, 20),
  };
}

function safeTransactions(input: unknown) {
  const source = row(input);
  const groups: {
    name: string;
    count: number;
    items: Record<string, string>[];
  }[] = [];
  for (const [name, value] of Object.entries(source)) {
    if (!/^(transactions|history|ledger|orders|recentTransactions|recentOrders)$/i.test(name) || !Array.isArray(value))
      continue;
    groups.push({
      name,
      count: value.length,
      items: value.slice(0, 20).map((entry) => {
        const detail = row(entry);
        return Object.fromEntries(
          TRANSACTION_FIELDS.flatMap((key) => {
            const safe = safeValue(detail[key]);
            return safe === null ? [] : [[key, safe] as const];
          }),
        );
      }),
    });
  }
  return groups.slice(0, 3);
}

export async function fetchBiteTransactions(apiKey: string) {
  const { body } = await request("/v1/transactions?limit=20", apiKey);
  const envelope = row(body);
  const groups = [...safeTransactions(envelope), ...safeTransactions(envelope.data)];
  if (Array.isArray(body))
    groups.push({
      name: "transactions",
      count: body.length,
      items: body.slice(0, 20).map((entry) => {
        const detail = row(entry);
        return Object.fromEntries(
          TRANSACTION_FIELDS.flatMap((key) => {
            const safe = safeValue(detail[key]);
            return safe === null ? [] : [[key, safe] as const];
          }),
        );
      }),
    });
  return {
    groups: groups.slice(0, 3),
    topLevelFields: Object.keys(envelope).slice(0, 20),
  };
}
