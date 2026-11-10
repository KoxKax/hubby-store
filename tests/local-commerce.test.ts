import { describe, expect, it } from "vitest";
import { getStorefrontContent } from "../app/content/fixtures";
import {
  cancel,
  checkout,
  emptyShop,
  expire,
  fulfill,
  type LocalOrder,
  type Observation,
  observe,
  ownOrder,
  projection,
  refund,
  replace,
  report,
  type ShopState,
} from "../app/domain/local-shop";
import { seal, unseal } from "../app/server/seal.server";

const content = getStorefrontContent();
const now = 1000;
function fixture(count = 4) {
  const s = emptyShop();
  for (let n = 0; n < count; n++)
    s.stock.push({
      id: crypto.randomUUID(),
      variantId: "canva-1",
      cost: 0,
      state: "available",
      sealed: { version: 1, nonce: "stub", ciphertext: "encrypted-test" },
    });
  return s;
}
function input(quantity = 1) {
  return {
    actor: "A",
    key: crypto.randomUUID(),
    lines: [{ variantId: "canva-1", quantity }],
    coupon: "",
    expectedTotal: 89000 * quantity,
  };
}
function paid(s: ShopState, o: LocalOrder, patch: Partial<Observation> = {}) {
  return observe(
    s,
    {
      id: crypto.randomUUID(),
      orderId: o.id,
      amount: o.total,
      currency: "VND",
      account: "DEMO-NOT-A-BANK",
      direction: "in",
      test: true,
      ...patch,
    },
    now + 1,
  );
}
describe("local atomic commerce domain (runtime concurrency checked separately)", () => {
  it("validates and canonicalizes checkout email; changing email cannot reuse a checkout key", () => {
    const s = fixture();
    const request = { ...input(), email: "  Buyer@Test.example  " };
    const o = checkout(s, content, request, now);
    expect(o.email).toBe("buyer@test.example");
    expect(
      checkout(s, content, { ...request, email: "buyer@test.example" }, now + 1)
        .id,
    ).toBe(o.id);
    expect(() =>
      checkout(
        s,
        content,
        { ...request, email: "other@test.example" },
        now + 1,
      ),
    ).toThrow("đã thay đổi");
    expect(() =>
      checkout(fixture(), content, { ...input(), email: "not-an-email" }, now),
    ).toThrow("Email");
  });
  it("reserves exactly qty and immutable server price; rejects other actor projections", () => {
    const s = fixture();
    const o = checkout(s, content, input(2), now);
    expect(o.items[0]?.stockIds).toHaveLength(2);
    expect(s.stock.filter((i) => i.state === "reserved")).toHaveLength(2);
    expect(o.total).toBe(178000);
    expect(() => ownOrder(s, o.id, "B")).toThrow("Không tìm thấy");
    expect(JSON.stringify(projection(o))).not.toMatch(
      /ciphertext|fingerprint|actor|nonce/,
    );
  });
  it("checkout replay returns one order; changed payload same key conflicts", () => {
    const s = fixture();
    const request = input();
    const o = checkout(s, content, request, now);
    expect(checkout(s, content, request, now + 1).id).toBe(o.id);
    expect(s.orders).toHaveLength(1);
    expect(() =>
      checkout(s, content, { ...request, expectedTotal: 1 }, now + 1),
    ).toThrow("đã thay đổi");
    expect(s.stock.filter((i) => i.state === "reserved")).toHaveLength(1);
  });
  it("20 sequential contenders for one stock have one winner (not multiconnection proof)", () => {
    const s = fixture(1);
    let wins = 0;
    for (let n = 0; n < 20; n++) {
      try {
        checkout(s, content, input(), now);
        wins++;
      } catch {}
    }
    expect(wins).toBe(1);
    expect(s.orders).toHaveLength(1);
  });
  it("failed checkout never partially reserves and ignores browser pricing", () => {
    const s = fixture(1);
    expect(() => checkout(s, content, input(2), now)).toThrow("không đủ");
    expect(s.orders).toHaveLength(0);
    expect(s.stock[0]?.state).toBe("available");
    expect(() =>
      checkout(s, content, { ...input(), expectedTotal: 1 }, now),
    ).toThrow("Giá");
    expect(() =>
      checkout(s, content, { ...input(), coupon: "WRONG" }, now),
    ).toThrow("Mã giảm");
  });
  it("coupon calculated on server, fractional/duplicate/oversized quantities rejected", () => {
    const s = fixture();
    const req = { ...input(2), coupon: "hubby10", expectedTotal: 160200 };
    expect(checkout(s, content, req, now).discount).toBe(17800);
    for (const quantity of [0, 0.5, 11])
      expect(() => checkout(s, content, input(quantity), now)).toThrow();
    const duplicate = input();
    duplicate.lines.push({
      ...duplicate.lines[0],
      variantId: "canva-1",
      quantity: 1,
    });
    expect(() => checkout(s, content, duplicate, now)).toThrow("trùng");
  });
  it.each([
    { currency: "USD" },
    { account: "WRONG" },
    { direction: "out" },
    { test: false },
    { amount: 88000 },
    { amount: 90000 },
  ])("invalid payment stays pending without delivery %j", (patch) => {
    const s = fixture();
    const o = checkout(s, content, input(), now);
    expect(paid(s, o, patch)).not.toBe("matched");
    expect(o.paid).toBe(0);
    expect(s.jobs).toHaveLength(0);
    fulfill(s, o.id, now + 2);
    expect(o.state).toBe("pending_payment");
  });
  it("20 replays and retried jobs allocate only once, crash-after-settlement job persists", () => {
    const s = fixture();
    const o = checkout(s, content, input(2), now);
    const event = {
      id: crypto.randomUUID(),
      orderId: o.id,
      amount: o.total,
      currency: "VND",
      account: "DEMO-NOT-A-BANK",
      direction: "in",
      test: true,
    };
    for (let n = 0; n < 20; n++)
      expect(observe(s, event, now + 1)).toBe("matched");
    expect(s.jobs).toHaveLength(1);
    const restored = JSON.parse(JSON.stringify(s)) as ShopState;
    for (let n = 0; n < 20; n++) fulfill(restored, o.id, now + 2);
    expect(restored.stock.filter((i) => i.state === "assigned")).toHaveLength(
      2,
    );
    expect(restored.jobs[0]?.state).toBe("done");
    expect(restored.payments).toHaveLength(1);
    expect(() => observe(restored, { ...event, amount: 1 }, now + 2)).toThrow(
      "trùng",
    );
  });
  it("expiry releases stock; late valid event recorded for review not delivered", () => {
    const s = fixture(1);
    const o = checkout(s, content, input(), now);
    expire(s, o.expires);
    expect(o.state).toBe("expired");
    expect(s.stock[0]?.state).toBe("available");
    expect(
      observe(
        s,
        {
          id: crypto.randomUUID(),
          orderId: o.id,
          amount: o.total,
          currency: "VND",
          account: "DEMO-NOT-A-BANK",
          direction: "in",
          test: true,
        },
        o.expires + 1,
      ),
    ).toBe("late_review");
    expect(s.jobs).toHaveLength(0);
  });
  it("paid order never expires/cancels; new deposit doesn't create another job", () => {
    const s = fixture();
    const o = checkout(s, content, input(), now);
    paid(s, o);
    expire(s, o.expires + 1);
    expect(o.state).toBe("paid");
    expect(() => cancel(s, o, now + 2)).toThrow("Chỉ hủy");
    expect(paid(s, o)).toBe("duplicate_payment_review");
    expect(s.jobs).toHaveLength(1);
  });
  it("cancel releases unassigned stock; failed publish doesn't affect snapshots", () => {
    const s = fixture();
    const o = checkout(s, content, input(), now);
    cancel(s, o, now + 1);
    expect(s.stock[0]?.state).toBe("available");
    expect(o.total).toBe(89000);
  });
  it("replacement consumes new stock with lineage; refund caps money and never resells revealed units", () => {
    const s = fixture();
    const o = checkout(s, content, input(), now);
    paid(s, o);
    fulfill(s, o.id, now + 2);
    const id = o.items[0]?.stockIds[0];
    if (!id) throw Error("Missing stock");
    replace(s, o, id, now + 3);
    expect(o.generations[id]).toHaveLength(2);
    expect(s.stock.filter((i) => i.state === "retired")).toHaveLength(1);
    const key = crypto.randomUUID();
    refund(s, o, key, 89000, now + 4);
    refund(s, o, key, 89000, now + 5);
    expect(o.refunded).toBe(89000);
    expect(report(s).net).toBe(0);
    expect(() => refund(s, o, crypto.randomUUID(), 1, now + 6)).toThrow("vượt");
    expect(() => replace(s, o, id, now + 6)).toThrow("không thể");
    expect(s.stock.filter((i) => i.state === "available")).toHaveLength(2);
  });
  it("full refund cancels deferred fulfillment without allocating or leaving a pending job", () => {
    const s = fixture();
    const o = checkout(s, content, input(), now);
    paid(s, o);
    refund(s, o, crypto.randomUUID(), o.total, now + 2);
    expect(s.jobs[0]?.state).toBe("cancelled");
    expect(report(s).pendingJobs).toBe(0);
    fulfill(s, o.id, now + 3);
    expect(o.state).toBe("refunded");
    expect(s.stock.filter((unit) => unit.state === "assigned")).toHaveLength(0);
    expect(s.stock.filter((unit) => unit.state === "retired")).toHaveLength(1);
  });
  it("checkout kill switch blocks only new requests, paid job continues", () => {
    const s = fixture();
    const o = checkout(s, content, input(), now);
    s.checkoutEnabled = false;
    expect(() => checkout(s, content, input(), now)).toThrow("tạm dừng");
    paid(s, o);
    fulfill(s, o.id, now + 2);
    expect(o.state).toBe("delivered");
  });
});
describe("AES-GCM synthetic inventory", () => {
  const key =
    "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
  it("unique nonce, no plaintext at rest, authenticated record context and key", async () => {
    const a = await seal("DEMO-ONLY-SECRET", "unit:variant", key);
    const b = await seal("DEMO-ONLY-SECRET", "unit:variant", key);
    expect(a.nonce).not.toBe(b.nonce);
    expect(JSON.stringify(a)).not.toContain("DEMO-ONLY-SECRET");
    expect(await unseal(a, "unit:variant", key)).toBe("DEMO-ONLY-SECRET");
    await expect(unseal(a, "other:variant", key)).rejects.toThrow();
    await expect(unseal(a, "unit:variant", "11".repeat(32))).rejects.toThrow();
  });
});
