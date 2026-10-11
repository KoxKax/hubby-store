import { RouterContextProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { getStorefrontContent } from "../app/content/fixtures";
import { publishedContent } from "../app/server/content-repository.server";
import { csrfToken, secureForm } from "../app/server/form-security.server";
import { runtimeContext } from "../app/server/runtime-context.server";
import { identity } from "../app/server/supabase.server";

function context() {
  const context = new RouterContextProvider();
  context.set(runtimeContext, {
    env: {
      APP_ENV: "local",
      DATA_MODE: "fixtures",
      PAYMENTS_MODE: "mock",
      SUPPLIERS_MODE: "mock",
    },
    ctx: {} as ExecutionContext,
    responseHeaders: new Headers(),
    responseCookies: new Map(),
  });
  return context;
}
const nonce = "a".repeat(43);
function form(body: string, token = nonce) {
  return new Request("http://127.0.0.1:5174/admin", {
    method: "POST",
    headers: {
      Origin: "http://127.0.0.1:5174",
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: `hubby-local-csrf=${token}`,
    },
    body,
  });
}
describe("server form/cookie boundaries", () => {
  it("accepts only matching origin + CSRF and enforces actual byte limit", async () => {
    expect(
      (await secureForm(form(`csrf=${nonce}&name=demo`))).get("name"),
    ).toBe("demo");
    await expect(secureForm(form("csrf=invalid"))).rejects.toHaveProperty(
      "status",
      403,
    );
    await expect(
      secureForm(form(`csrf=${nonce}`, "b".repeat(43))),
    ).rejects.toHaveProperty("status", 403);
    await expect(
      secureForm(form(`csrf=${nonce}&body=${"x".repeat(500)}`), 100),
    ).rejects.toHaveProperty("status", 413);
  });
  it("issues one per-request token and secure HttpOnly host cookies on HTTPS", () => {
    const ctx = context();
    const request = new Request("https://staging.example.test/dang-nhap");
    const token = csrfToken(request, ctx);
    expect(token).toHaveLength(43);
    expect(csrfToken(request, ctx)).toBe(token);
    const cookies = [...ctx.get(runtimeContext).responseCookies.values()];
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatch(/__Host-hubby-csrf=/);
    expect(cookies[0]).toMatch(/HttpOnly/);
    expect(cookies[0]).toMatch(/Secure/);
    expect(cookies[0]).toMatch(/SameSite=Lax/i);
  });
  it("fixture mode performs no auth/database network calls", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const request = new Request("http://127.0.0.1:5174/");
      const ctx = context();
      expect(await identity(request, ctx)).toBeNull();
      expect(await publishedContent(request, ctx)).toEqual(
        getStorefrontContent(),
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
