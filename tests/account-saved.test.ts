import type { SupabaseClient } from "@supabase/supabase-js";
import { RouterContextProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStorefrontContent } from "../app/content/fixtures";
import { action } from "../app/routes/saved-products";
import { runtimeContext } from "../app/server/runtime-context.server";
import {
  accountSavedProducts,
  changeSavedProduct,
} from "../app/server/saved-products.server";

vi.mock("../app/server/content-repository.server", async () => {
  const { getStorefrontContent } = await import("../app/content/fixtures");
  return { publishedContent: vi.fn(async () => getStorefrontContent()) };
});
const origin = "http://127.0.0.1:5174";
const csrf = "a".repeat(43);
const customer = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const productUuid = "11111111-1111-4111-8111-111111111111";
function setup(userId: string | null = customer) {
  const reads: { table: string; filters: [string, unknown][] }[] = [];
  const writes: {
    action: string;
    row?: unknown;
    filters?: [string, unknown][];
  }[] = [];
  const rows = [
    { product_id: productUuid, products: { catalog_key: "canva" } },
  ];
  const results: {
    list: unknown;
    listError: { code: string } | null;
    writeError: { code: string } | null;
    found: unknown;
  } = {
    list: rows,
    listError: null,
    writeError: null,
    found: { id: productUuid },
  };
  const client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: userId
            ? {
                id: userId,
                email: "buyer@example.test",
                user_metadata: { owner: true, role: "owner" },
              }
            : null,
        },
        error: null,
      })),
    },
    rpc: vi.fn(async () => ({
      data: { owner: false, aal2: false },
      error: null,
    })),
    from: vi.fn((table: string) => {
      const query = { table, filters: [] as [string, unknown][] };
      reads.push(query);
      let deleting = false;
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn((field: string, value: unknown) => {
          query.filters.push([field, value]);
          return chain;
        }),
        order: vi.fn(() => chain),
        limit: vi.fn(async () => ({
          data: results.list,
          error: results.listError,
        })),
        maybeSingle: vi.fn(async () => ({ data: results.found, error: null })),
        insert: vi.fn(async (row: unknown) => {
          writes.push({ action: "insert", row });
          return { data: null, error: results.writeError };
        }),
        delete: vi.fn(() => {
          deleting = true;
          return chain;
        }),
        // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are intentionally awaitable.
        then: (resolve: (value: unknown) => unknown) => {
          if (deleting)
            writes.push({ action: "delete", filters: query.filters });
          return Promise.resolve({
            data: null,
            error: results.writeError,
          }).then(resolve);
        },
      };
      return chain;
    }),
  };
  const context = new RouterContextProvider();
  context.set(runtimeContext, {
    env: {
      APP_ENV: "local",
      DATA_MODE: "supabase",
      SUPABASE_ENVIRONMENT: "staging",
      SUPABASE_URL: "https://hubby-staging-test.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic",
      SITE_ORIGIN: origin,
      PAYMENTS_MODE: "mock",
      SUPPLIERS_MODE: "mock",
    },
    ctx: {} as ExecutionContext,
    responseHeaders: new Headers(),
    responseCookies: new Map(),
    client: client as unknown as SupabaseClient,
  });
  return { context, client, reads, writes, results };
}
const get = () => new Request(`${origin}/tai-khoan/yeu-thich`);
function post(fields: Record<string, string>, requestOrigin = origin) {
  return new Request(`${origin}/tai-khoan/yeu-thich`, {
    method: "POST",
    headers: { Origin: requestOrigin, Cookie: `hubby-local-csrf=${csrf}` },
    body: new URLSearchParams({
      csrf,
      productId: "canva",
      intent: "save",
      ...fields,
    }),
  });
}
function callAction(request: Request, context: RouterContextProvider) {
  return action({
    request,
    context,
    params: {},
    url: new URL(request.url),
    pattern: "/tai-khoan/yeu-thich",
  });
}
async function responseError(run: () => Promise<unknown>) {
  try {
    await run();
    throw new Error("Expected response error");
  } catch (error) {
    expect(error).toBeInstanceOf(Response);
    return error as Response;
  }
}
beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    throw new Error("Provider network disabled in tests");
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("account wishlist stays server-owned and private", () => {
  it("redirects guests before any table read/write", async () => {
    const state = setup(null);
    const error = await responseError(() =>
      accountSavedProducts(get(), state.context),
    );
    expect(error.status).toBe(302);
    expect(state.client.from).not.toHaveBeenCalled();
  });
  it.each([customer, other])(
    "reads only verified customer %s and published products",
    async (userId) => {
      const state = setup(userId);
      const products = await accountSavedProducts(get(), state.context);
      expect(products.map((product) => product.id)).toEqual(["canva"]);
      expect(state.reads[0]?.filters).toContainEqual(["user_id", userId]);
      expect(state.reads[0]?.filters).toContainEqual([
        "products.status",
        "published",
      ]);
      expect(state.client.auth.getUser).toHaveBeenCalledOnce();
      expect(products[0]).toEqual(getStorefrontContent().products[0]);
    },
  );
  it("writes exact verified user, not editable Owner metadata or a submitted identity", async () => {
    const state = setup();
    await changeSavedProduct(get(), state.context, "canva", true);
    expect(state.writes).toEqual([
      { action: "insert", row: { user_id: customer, product_id: productUuid } },
    ]);
  });
  it("keeps most recently saved products first", async () => {
    const state = setup();
    const products = getStorefrontContent().products;
    const second = products[1];
    if (!second) throw new Error("Expected a second catalog fixture");
    state.results.list = [
      { product_id: productUuid, products: { catalog_key: second.id } },
      { product_id: productUuid, products: { catalog_key: "canva" } },
    ];
    expect(
      (await accountSavedProducts(get(), state.context)).map((item) => item.id),
    ).toEqual([second.id, "canva"]);
  });
  it("treats duplicate save as idempotent without extra grants or updates", async () => {
    const state = setup();
    state.results.writeError = { code: "23505" };
    await expect(
      changeSavedProduct(get(), state.context, "canva", true),
    ).resolves.toBeUndefined();
    expect(state.writes).toHaveLength(1);
  });
  it("scopes removal to the verified user's exact product", async () => {
    const state = setup(other);
    await changeSavedProduct(get(), state.context, "canva", false);
    expect(state.writes).toEqual([
      {
        action: "delete",
        filters: [
          ["user_id", other],
          ["product_id", productUuid],
        ],
      },
    ]);
  });
  it("unknown/missing published products cannot become saved records", async () => {
    const state = setup();
    expect(
      (
        await responseError(() =>
          changeSavedProduct(get(), state.context, "unknown", true),
        )
      ).status,
    ).toBe(404);
    state.results.found = null;
    expect(
      (
        await responseError(() =>
          changeSavedProduct(get(), state.context, "canva", true),
        )
      ).status,
    ).toBe(404);
    expect(state.writes).toEqual([]);
  });
  it("does not claim success after RLS/service failure or malformed list response", async () => {
    const state = setup();
    state.results.writeError = { code: "42501" };
    expect(
      (
        await responseError(() =>
          changeSavedProduct(get(), state.context, "canva", true),
        )
      ).status,
    ).toBe(503);
    state.results.list = [{ product_id: productUuid, products: null }];
    expect(
      (await responseError(() => accountSavedProducts(get(), state.context)))
        .status,
    ).toBe(503);
  });
  it("rejects spoofed user/extra fields and foreign Origin before a write", async () => {
    const attempts: Record<string, string>[] = [
      { userId: other },
      { intent: "promote" },
    ];
    for (const fields of attempts) {
      const state = setup();
      const result = await callAction(post(fields), state.context);
      expect("data" in result && result.data.ok).toBe(false);
      expect(state.writes).toEqual([]);
    }
    const state = setup();
    await callAction(post({}, "https://attacker.example"), state.context);
    expect(state.writes).toEqual([]);
  });
});
