import type { SupabaseClient } from "@supabase/supabase-js";
import { RouterContextProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { action as authenticate } from "../app/routes/auth";
import { loader as callback } from "../app/routes/auth-callback";
import {
  action as confirm,
  loader as confirmLanding,
} from "../app/routes/auth-confirm";
import { authAvailability } from "../app/server/auth-availability.server";
import { runtimeContext } from "../app/server/runtime-context.server";
import {
  identity,
  requireOwner,
  signedInDestination,
} from "../app/server/supabase.server";

const origin = "http://127.0.0.1:5174";
const csrf = "a".repeat(43);
function setup(owner = false, aal2 = false) {
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: {
            id: "synthetic-user",
            email: "owner@example.test",
            // Client-controlled profile metadata must never grant authority.
            user_metadata: { role: "owner", owner: true, aal2: true },
          },
        },
        error: null,
      }),
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
      verifyOtp: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      updateUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signUp: vi.fn().mockResolvedValue({ data: {}, error: null }),
      resetPasswordForEmail: vi
        .fn()
        .mockResolvedValue({ data: {}, error: null }),
    },
    rpc: vi.fn().mockResolvedValue({ data: { owner, aal2 }, error: null }),
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
  return { context, client };
}
function request(path = "/admin?tab=products") {
  return new Request(`${origin}${path}`);
}
function post(path: string, fields: Record<string, string>) {
  return new Request(`${origin}${path}`, {
    method: "POST",
    headers: {
      Origin: origin,
      Cookie: `hubby-local-csrf=${csrf}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ csrf, ...fields }),
  });
}
async function thrownResponse(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(Response);
    return error as Response;
  }
  throw new Error("Expected an authorization rejection");
}
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Provider network disabled in tests");
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("verified admin entry, never local sandbox authentication", () => {
  it.each(["local", "staging"] as const)(
    "trusted matching policy skips MFA in %s; identity is never promoted to AAL2",
    async (env) => {
      const { context, client } = setup(true, false);
      context.get(runtimeContext).env.APP_ENV = env;
      client.rpc.mockResolvedValue({
        data: {
          owner: true,
          aal2: false,
          mfa_required: false,
          password_only_issuer:
            "https://hubby-staging-test.supabase.co/auth/v1",
        },
        error: null,
      });
      const verified = await requireOwner(request(), context);
      expect(verified.user.aal2).toBe(false);
      expect(verified.user.mfaRequired).toBe(false);
      expect(await signedInDestination(request(), context, "/tai-khoan")).toBe(
        "/admin",
      );
    },
  );
  it.each([
    ["local", false, "https://other.supabase.co/auth/v1"],
    ["local", "false", "https://hubby-staging-test.supabase.co/auth/v1"],
    ["staging", false, null],
  ] as const)(
    "MFA remains required for env=%s, flag=%s, issuer=%s",
    async (env, flag, issuer) => {
      const { context, client } = setup(true, false);
      context.get(runtimeContext).env.APP_ENV = env;
      client.rpc.mockResolvedValue({
        data: {
          owner: true,
          aal2: false,
          mfa_required: flag,
          password_only_issuer: issuer,
        },
        error: null,
      });
      const response = await thrownResponse(() =>
        requireOwner(request(), context),
      );
      expect(response.headers.get("Location")).toBe(
        "/xac-thuc?next=%2Fadmin%3Ftab%3Dproducts",
      );
    },
  );
  it("unconfigured mode fails closed and never contacts a provider", async () => {
    const { context } = setup();
    const runtime = context.get(runtimeContext);
    runtime.env.DATA_MODE = "fixtures";
    runtime.client = undefined;
    expect(await identity(request(), context)).toBeNull();
    expect(
      (await thrownResponse(() => requireOwner(request(), context))).status,
    ).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("anonymous and expired sessions require sign-in before CMS", async () => {
    const { context, client } = setup();
    client.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });
    const response = await thrownResponse(() =>
      requireOwner(request(), context),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "/dang-nhap?next=%2Fadmin%3Ftab%3Dproducts",
    );
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it("customer metadata cannot grant admin even with claimed MFA", async () => {
    const { context } = setup(false, true);
    expect(
      (await thrownResponse(() => requireOwner(request(), context))).status,
    ).toBe(403);
  });
  it("Owner AAL1 must pass MFA; requested CMS section is preserved", async () => {
    const { context } = setup(true, false);
    const response = await thrownResponse(() =>
      requireOwner(request(), context),
    );
    expect(response.headers.get("Location")).toBe(
      "/xac-thuc?next=%2Fadmin%3Ftab%3Dproducts",
    );
  });
  it("only verified Owner AAL2 receives the privileged client", async () => {
    const { context, client } = setup(true, true);
    const result = await requireOwner(request(), context);
    expect(result.user.owner).toBe(true);
    expect(result.client).toBe(client);
    expect(client.rpc).toHaveBeenCalledWith("owner_status");
  });
  it("membership lookup failure cannot grant admin", async () => {
    const { context, client } = setup(true, true);
    client.rpc.mockResolvedValueOnce({
      data: { owner: true, aal2: true },
      error: { message: "unavailable" },
    });
    expect(
      (await thrownResponse(() => requireOwner(request(), context))).status,
    ).toBe(403);
  });
  it("revoking membership is enforced on the next request", async () => {
    const initial = setup(true, true);
    await requireOwner(request(), initial.context);
    const revoked = setup(false, true);
    expect(
      (await thrownResponse(() => requireOwner(request(), revoked.context)))
        .status,
    ).toBe(403);
  });
  it.each([
    [false, false, "/tai-khoan"],
    [false, true, "/tai-khoan"],
    [true, false, "/xac-thuc?next=%2Fadmin"],
    [true, true, "/admin"],
  ])(
    "default login destination owner=%s aal2=%s",
    async (owner, aal2, target) => {
      const { context } = setup(owner, aal2);
      expect(await signedInDestination(request(), context, "/tai-khoan")).toBe(
        target,
      );
    },
  );
  it("re-verifies a changed session rather than using pre-login identity", async () => {
    const { context, client } = setup(true, true);
    context.get(runtimeContext).identity = Promise.resolve(null);
    expect(await signedInDestination(request(), context, null)).toBe("/admin");
    expect(client.auth.getUser).toHaveBeenCalledTimes(1);
  });
  it("keeps recovery/cart targets and sanitizes external redirects", async () => {
    const { context } = setup(true, true);
    expect(
      await signedInDestination(request(), context, "/dat-lai-mat-khau"),
    ).toBe("/dat-lai-mat-khau");
    expect(await signedInDestination(request(), context, "/gio-hang")).toBe(
      "/gio-hang",
    );
    expect(
      await signedInDestination(
        request(),
        context,
        "//evil.example.test/admin",
      ),
    ).toBe("/admin");
  });
  it("successful SDK response without a verified session cannot claim sign-in", async () => {
    const { context, client } = setup(true, true);
    client.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });
    expect(
      (
        await thrownResponse(() =>
          signedInDestination(request(), context, "/admin"),
        )
      ).status,
    ).toBe(401);
  });
});

describe("auth handlers use server-verified landing", () => {
  it.each(["/dang-ky", "/quen-mat-khau", "/dang-xuat", "/dat-lai-mat-khau"])(
    "uses normalized app URL instead of transport %s.data",
    async (path) => {
      const { context, client } = setup();
      const req = post(`${path}.data`, {
        email: "owner@example.test",
        password: "synthetic-long-password",
        confirm: "synthetic-long-password",
        name: "Owner",
      });
      await authenticate({
        url: new URL(`${origin}${path}`),
        pattern: path,
        context,
        params: {},
        request: req,
      });
      expect(client.auth.signInWithPassword).not.toHaveBeenCalled();
      if (path === "/dang-ky")
        expect(client.auth.signUp).toHaveBeenCalledTimes(1);
      else if (path === "/quen-mat-khau")
        expect(client.auth.resetPasswordForEmail).toHaveBeenCalledTimes(1);
      else if (path === "/dat-lai-mat-khau")
        expect(client.auth.updateUser).toHaveBeenCalledTimes(1);
      else expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    },
  );
  it("Single Fetch admin redirects use the real destination, not .data or _routes", async () => {
    const { context } = setup(true, false);
    const response = await thrownResponse(() =>
      requireOwner(
        request("/admin.data?tab=products&_routes=routes%2Fadmin"),
        context,
        new URL(`${origin}/admin?tab=products`),
      ),
    );
    expect(response.headers.get("Location")).toBe(
      "/xac-thuc?next=%2Fadmin%3Ftab%3Dproducts",
    );
  });
  it("email-scanner GET never consumes a valid token or queries identity", () => {
    const { context, client } = setup();
    const req = request(
      `/auth/confirm?token_hash=${"a".repeat(64)}&type=email`,
    );
    const result = confirmLanding({
      url: new URL(req.url),
      pattern: "/auth/confirm",
      params: {},
      context,
      request: req,
    });
    expect(result.type).toBe("email");
    expect(client.auth.verifyOtp).not.toHaveBeenCalled();
    expect(client.auth.getUser).not.toHaveBeenCalled();
  });
  it.each(["signup", "invite", "magiclink"])(
    "unsupported confirmation type %s never consumes a token",
    async (type) => {
      const { context, client } = setup();
      const req = post("/auth/confirm", { hash: "a".repeat(64), type });
      expect(
        (
          await thrownResponse(() =>
            confirm({
              url: new URL(req.url),
              pattern: "/auth/confirm",
              params: {},
              context,
              request: req,
            }),
          )
        ).status,
      ).toBe(400);
      expect(client.auth.verifyOtp).not.toHaveBeenCalled();
    },
  );
  it("disabled Google cannot start OAuth, even from a forged direct POST", async () => {
    const { context } = setup();
    context.get(runtimeContext).authAvailability = Promise.resolve({
      available: true,
      email: true,
      google: false,
    });
    const result = await authenticate({
      url: new URL(`${origin}/dang-nhap`),
      pattern: "/dang-nhap",
      context,
      params: {},
      request: post("/dang-nhap", { intent: "google" }),
    });
    expect(result).toMatchObject({
      init: { status: 503 },
      data: { error: expect.stringContaining("Google chưa sẵn sàng") },
    });
  });
  it.each(["/dang-ky", "/quen-mat-khau"])(
    "does not claim an email was sent after a provider configuration failure: %s",
    async (path) => {
      const { context, client } = setup();
      const failure = {
        data: {},
        error: { code: "email_address_not_authorized" },
      };
      client.auth.signUp.mockResolvedValue(failure);
      client.auth.resetPasswordForEmail.mockResolvedValue(failure);
      const result = await authenticate({
        url: new URL(`${origin}${path}`),
        pattern: path,
        context,
        params: {},
        request: post(path, {
          email: "owner@example.test",
          password: "synthetic-long-password",
          name: "Owner",
        }),
      });
      expect(result).toMatchObject({
        init: { status: 503 },
        data: { message: "", error: expect.stringContaining("chưa được") },
      });
    },
  );
  it.each([
    [false, undefined],
    [true, "/admin"],
  ])("modal sign-in owner=%s", async (owner, redirectTo) => {
    const { context } = setup(owner, true);
    const result = await authenticate({
      url: new URL(`${origin}/dang-nhap`),
      pattern: "/dang-nhap",
      context,
      params: {},
      request: post("/dang-nhap", {
        email: "owner@example.test",
        password: "synthetic-password",
        presentation: "modal",
        next: "/tai-khoan",
      }),
    });
    expect(result).toMatchObject({ signedIn: true, redirectTo });
  });
  it("Google PKCE callback routes Owner to MFA", async () => {
    const { context, client } = setup(true, false);
    const response = await callback({
      url: new URL(`${origin}/auth/callback?code=synthetic&next=/tai-khoan`),
      pattern: "/auth/callback",
      context,
      params: {},
      request: request("/auth/callback?code=synthetic&next=/tai-khoan"),
    });
    expect(client.auth.exchangeCodeForSession).toHaveBeenCalledWith(
      "synthetic",
    );
    expect(response.headers.get("Location")).toBe("/xac-thuc?next=%2Fadmin");
  });
  it("failed PKCE exchange never queries roles or redirects to admin", async () => {
    const { context, client } = setup(true, true);
    client.auth.exchangeCodeForSession.mockResolvedValueOnce({
      error: { message: "expired" },
    });
    const response = await callback({
      url: new URL(`${origin}/auth/callback?code=synthetic`),
      pattern: "/auth/callback",
      context,
      params: {},
      request: request("/auth/callback?code=synthetic"),
    });
    expect(response.headers.get("Location")).toBe(
      "/dang-nhap?notice=callback-failed",
    );
    expect(client.rpc).not.toHaveBeenCalled();
    expect(client.auth.exchangeCodeForSession).toHaveBeenCalledWith(
      "synthetic",
    );
  });
  it("email confirmation routes Owner to admin but recovery remains password reset", async () => {
    for (const type of ["email", "recovery"]) {
      const { context } = setup(true, true);
      const response = await confirm({
        url: new URL(`${origin}/auth/confirm`),
        pattern: "/auth/confirm",
        context,
        params: {},
        request: post("/auth/confirm", { hash: "a".repeat(64), type }),
      });
      if (!(response instanceof Response))
        throw new Error("Expected redirect after confirmation");
      expect(response.headers.get("Location")).toBe(
        type === "email" ? "/admin" : "/dat-lai-mat-khau",
      );
    }
  });
  it("logout errors are not reported as a successful logout", async () => {
    const { context, client } = setup(true, true);
    client.auth.signOut.mockResolvedValueOnce({
      error: { message: "unavailable" },
    });
    expect(
      (
        await thrownResponse(() =>
          authenticate({
            url: new URL(`${origin}/dang-xuat`),
            pattern: "/dang-xuat",
            context,
            params: {},
            request: post("/dang-xuat", {}),
          }),
        )
      ).status,
    ).toBe(503);
  });
  it("logout discards the cached identity", async () => {
    const { context, client } = setup(true, true);
    await identity(request(), context);
    const response = await authenticate({
      url: new URL(`${origin}/dang-xuat`),
      pattern: "/dang-xuat",
      context,
      params: {},
      request: post("/dang-xuat", {}),
    });
    expect(response).toBeInstanceOf(Response);
    expect(context.get(runtimeContext).identity).toBeUndefined();
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});

describe("public provider availability, separate from authorization", () => {
  it("fixtures never connect and provider booleans never come from truthy strings", async () => {
    const { context } = setup();
    context.get(runtimeContext).env.DATA_MODE = "fixtures";
    expect(await authAvailability(request(), context)).toEqual({
      available: false,
      email: false,
      google: false,
    });
    expect(fetch).not.toHaveBeenCalled();
    context.get(runtimeContext).env.DATA_MODE = "supabase";
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ external: { google: "true", email: true } }),
      ),
    );
    expect(await authAvailability(request(), context)).toEqual({
      available: true,
      google: false,
      email: true,
    });
    await authAvailability(request(), context);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([null, {}, { external: null }])(
    "malformed settings %j fail closed",
    async (settings) => {
      const { context } = setup();
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify(settings)),
      );
      expect(await authAvailability(request(), context)).toEqual({
        available: false,
        email: false,
        google: false,
      });
    },
  );
  it("provider failures and mismatched origins do not enable sign-in", async () => {
    const { context } = setup();
    expect(
      await authAvailability(
        new Request("https://other.example.test/"),
        context,
      ),
    ).toEqual({ available: false, email: false, google: false });
    expect(fetch).not.toHaveBeenCalled();
    expect(await authAvailability(request(), context)).toEqual({
      available: false,
      email: false,
      google: false,
    });
  });
});
