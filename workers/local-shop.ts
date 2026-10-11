import { DurableObject } from "cloudflare:workers";
import { z } from "zod";
import { experienceOf } from "../app/content/experience";
import { getStorefrontContent } from "../app/content/fixtures";
import {
  createWorkspace,
  type LocalWorkspace,
  parseWorkspace,
  publishLocal,
  restoreLocal,
  saveLocalDraft,
} from "../app/domain/cms";
import {
  type Activity,
  activityTTL,
  type Feedback,
  feedbackInput,
  recentActivities,
} from "../app/domain/engagement";
import {
  audit,
  cancel,
  checkout,
  emptyShop,
  expire,
  fulfill,
  observe,
  ownOrder,
  projection,
  refund,
  replace,
  report,
  ShopError,
  type ShopState,
} from "../app/domain/local-shop";
import { seal, unseal } from "../app/server/seal.server";

const uuid = z.uuid();
const common = { actor: z.string().regex(/^[a-f0-9]{64}$/) };
const command = z.discriminatedUnion("action", [
  z.object({ ...common, action: z.literal("catalog") }).strict(),
  z.object({ ...common, action: z.literal("cms_get") }).strict(),
  z
    .object({
      ...common,
      action: z.literal("cms_save"),
      snapshot: z.unknown(),
      version: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      ...common,
      action: z.enum(["cms_publish", "cms_restore"]),
      id: z.string().min(1).max(80),
      version: z.number().int().nonnegative(),
    })
    .strict(),
  z.object({ ...common, action: z.literal("list") }).strict(),
  z.object({ ...common, action: z.literal("ops") }).strict(),
  z.object({ ...common, action: z.literal("activity_list") }).strict(),
  z
    .object({
      ...common,
      action: z.literal("activity_cart"),
      key: uuid,
      variantId: z.string().max(80),
    })
    .strict(),
  feedbackInput.extend({ ...common, action: z.literal("feedback") }).strict(),
  z
    .object({ ...common, action: z.literal("feedback_review"), id: uuid })
    .strict(),
  z.object({ ...common, action: z.literal("get"), id: uuid }).strict(),
  z
    .object({
      ...common,
      action: z.literal("checkout"),
      key: uuid,
      lines: z
        .array(
          z
            .object({
              variantId: z.string().max(80),
              quantity: z.number().int().min(1).max(10),
            })
            .strict(),
        )
        .min(1)
        .max(19),
      coupon: z.string().max(30),
      expectedTotal: z.number().int().nonnegative().max(200_000_000_000),
    })
    .strict(),
  z
    .object({
      ...common,
      action: z.enum([
        "pay",
        "retry",
        "cancel",
        "refund",
        "replace",
        "reveal",
        "resend",
      ]),
      id: uuid,
      unitId: z.string().max(100).optional(),
      scenario: z
        .enum(["exact", "underpaid", "overpaid", "wrong_account", "deferred"])
        .optional(),
      key: uuid.optional(),
    })
    .strict(),
  z
    .object({
      ...common,
      action: z.literal("ticket"),
      id: uuid,
      subject: z.string().trim().min(3).max(120),
      text: z.string().trim().min(3).max(1500),
    })
    .strict(),
  z
    .object({
      ...common,
      action: z.literal("reply"),
      id: uuid,
      text: z.string().trim().min(3).max(1500),
      close: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...common,
      action: z.literal("import"),
      variantId: z.string().max(80),
      quantity: z.number().int().min(1).max(30),
    })
    .strict(),
  z
    .object({ ...common, action: z.literal("switch"), enabled: z.boolean() })
    .strict(),
]);

// Public fixture key only. This object and its administrative simulator must never run outside local/mock.
export class LocalShop extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.guard();
      ctx.storage.sql.exec(
        "CREATE TABLE IF NOT EXISTS cms (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL)",
      );
      if (
        !ctx.storage.sql.exec("SELECT id FROM cms WHERE id=1").toArray().length
      )
        ctx.storage.sql.exec(
          "INSERT INTO cms(id,payload) VALUES(1,?)",
          JSON.stringify(createWorkspace(getStorefrontContent())),
        );
      ctx.storage.sql.exec(
        "CREATE TABLE IF NOT EXISTS ledger (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL)",
      );
      ctx.storage.sql.exec(
        "CREATE TABLE IF NOT EXISTS limits (actor TEXT NOT NULL, minute INTEGER NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(actor,minute))",
      );
      ctx.storage.sql.exec(
        "CREATE TABLE IF NOT EXISTS guest_sessions(actor TEXT PRIMARY KEY,expires INTEGER NOT NULL)",
      );
      ctx.storage.sql.exec(
        "CREATE TABLE IF NOT EXISTS feedback (id TEXT PRIMARY KEY,actor TEXT NOT NULL,key TEXT NOT NULL,at INTEGER NOT NULL,payload TEXT NOT NULL,UNIQUE(actor,key))",
      );
      ctx.storage.sql.exec(
        "CREATE TABLE IF NOT EXISTS activity (id TEXT PRIMARY KEY,actor TEXT NOT NULL,key TEXT NOT NULL,variant TEXT NOT NULL,at INTEGER NOT NULL,payload TEXT NOT NULL,UNIQUE(actor,key))",
      );
      ctx.storage.sql.exec(
        "CREATE INDEX IF NOT EXISTS activity_actor_time ON activity(actor,at)",
      );
      ctx.storage.sql.exec(
        "CREATE INDEX IF NOT EXISTS feedback_actor_time ON feedback(actor,at)",
      );
      if (
        !ctx.storage.sql.exec("SELECT id FROM ledger WHERE id=1").toArray()
          .length
      ) {
        const s = emptyShop();
        for (const p of getStorefrontContent().products)
          for (const v of p.variants)
            for (let n = 0; n < v.stock; n++)
              s.stock.push(await this.unit(v.id));
        ctx.storage.sql.exec(
          "INSERT INTO ledger(id,payload) VALUES(1,?)",
          JSON.stringify(s),
        );
      }
    });
  }
  guard() {
    if (
      this.env.APP_ENV !== "local" ||
      this.env.DATA_MODE !== "fixtures" ||
      this.env.PAYMENTS_MODE !== "mock" ||
      this.env.SUPPLIERS_MODE !== "mock"
    )
      throw new ShopError("Local sandbox only", 503);
  }
  async unit(variantId: string) {
    const id = crypto.randomUUID();
    return {
      id,
      variantId,
      state: "available" as const,
      cost: 0,
      sealed: await seal(
        `DEMO-ONLY / ${variantId} / ${id} / KHÔNG PHẢI TÀI KHOẢN HAY LICENSE THẬT`,
        `${id}:${variantId}`,
        this.env.DEMO_INVENTORY_KEY,
      ),
    };
  }
  workspace() {
    return parseWorkspace(
      JSON.parse(
        this.ctx.storage.sql
          .exec<{ payload: string }>("SELECT payload FROM cms WHERE id=1")
          .one().payload,
      ),
    );
  }
  catalog() {
    const w = this.workspace();
    const content = w.revisions.find((r) => r.id === w.publishedId)?.snapshot;
    if (!content) throw new ShopError("CMS published pointer missing", 503);
    return content;
  }
  async fetch(request: Request) {
    try {
      this.guard();
      if (request.method !== "POST") return new Response(null, { status: 405 });
      const c = command.parse(await request.json());
      const now = Date.now();
      this.ctx.storage.sql.exec(
        "INSERT INTO guest_sessions(actor,expires) VALUES(?,?) ON CONFLICT(actor) DO NOTHING",
        c.actor,
        now + 86_400_000,
      );
      const expiry = this.ctx.storage.sql
        .exec<{ expires: number }>(
          "SELECT expires FROM guest_sessions WHERE actor=?",
          c.actor,
        )
        .one().expires;
      if (expiry <= now)
        throw new ShopError(
          "Phiên demo đã hết hạn; tải lại để bắt đầu phiên mới.",
          401,
        );
      const minute = Math.floor(now / 60_000);
      this.ctx.storage.sql.exec(
        "DELETE FROM limits WHERE minute < ?",
        minute - 2,
      );
      this.ctx.storage.sql.exec(
        "INSERT INTO limits(actor,minute,count) VALUES(?,?,1) ON CONFLICT(actor,minute) DO UPDATE SET count=count+1",
        c.actor,
        minute,
      );
      const used = this.ctx.storage.sql
        .exec<{ count: number }>(
          "SELECT count FROM limits WHERE actor=? AND minute=?",
          c.actor,
          minute,
        )
        .one().count;
      if (
        used > 120 &&
        !["catalog", "cms_get", "list", "get", "ops", "activity_list"].includes(
          c.action,
        )
      )
        throw new ShopError(
          "Bạn thao tác quá nhanh; thử lại sau một phút.",
          429,
        );
      const additions =
        c.action === "import"
          ? await Promise.all(
              Array.from({ length: c.quantity }, () => this.unit(c.variantId)),
            )
          : [];
      let delivery: {
        sealed: Parameters<typeof unseal>[0];
        aad: string;
      } | null = null;
      const result = this.ctx.storage.transactionSync(() => {
        const s = JSON.parse(
          this.ctx.storage.sql
            .exec<{ payload: string }>("SELECT payload FROM ledger WHERE id=1")
            .one().payload,
        ) as ShopState;
        expire(s, now);
        let result: unknown;
        if (c.action === "catalog") {
          const catalog = structuredClone(this.catalog());
          for (const p of catalog.products)
            for (const v of p.variants)
              v.stock = s.stock.filter(
                (i) => i.variantId === v.id && i.state === "available",
              ).length;
          result = catalog;
        } else if (c.action === "activity_list") {
          const events = this.ctx.storage.sql
            .exec<{ payload: string }>(
              "SELECT payload FROM activity WHERE at>? ORDER BY at ASC LIMIT 200",
              now - activityTTL,
            )
            .toArray()
            .map((r) => JSON.parse(r.payload) as Activity);
          result = {
            events:
              experienceOf(this.catalog()).activityNotifications !== false
                ? recentActivities(events, now)
                : [],
          };
        } else if (c.action === "activity_cart") {
          const catalog = this.catalog();
          const product = catalog.products.find((p) =>
            p.variants.some((v) => v.id === c.variantId),
          );
          const variant = product?.variants.find((v) => v.id === c.variantId);
          if (
            !product ||
            !variant ||
            variant.priceConfigured === false ||
            !s.stock.some(
              (i) => i.variantId === c.variantId && i.state === "available",
            )
          )
            throw new ShopError("Gói chưa có sẵn.", 409);
          // Cart telemetry is user-triggered, not a verified sale. Avoid fabricated identities.
          this.ctx.storage.sql.exec(
            "DELETE FROM activity WHERE at<=?",
            now - activityTTL,
          );
          const recent = this.ctx.storage.sql
            .exec<{ variant: string; at: number }>(
              "SELECT variant,at FROM activity WHERE actor=? AND at>?",
              c.actor,
              now - 60_000,
            )
            .toArray();
          const replay = this.ctx.storage.sql
            .exec(
              "SELECT id FROM activity WHERE actor=? AND key=?",
              c.actor,
              c.key,
            )
            .toArray().length;
          if (
            !replay &&
            !recent.length &&
            experienceOf(catalog).activityNotifications !== false
          ) {
            const count = this.ctx.storage.sql
              .exec<{ count: number }>("SELECT COUNT(*) AS count FROM activity")
              .one().count;
            if (count < 200) {
              const event: Activity = {
                id: crypto.randomUUID(),
                kind: "cart",
                product: product.name,
                variant: variant.label,
                customer: "Một khách",
                at: now,
              };
              this.ctx.storage.sql.exec(
                "INSERT INTO activity(id,actor,key,variant,at,payload) VALUES(?,?,?,?,?,?)",
                event.id,
                c.actor,
                c.key,
                c.variantId,
                now,
                JSON.stringify(event),
              );
            }
          }
          result = { ok: true };
        } else if (c.action === "feedback") {
          const replay = this.ctx.storage.sql
            .exec(
              "SELECT id FROM feedback WHERE actor=? AND key=?",
              c.actor,
              c.key,
            )
            .toArray().length;
          if (!replay) {
            const count = this.ctx.storage.sql
              .exec<{ count: number }>("SELECT COUNT(*) AS count FROM feedback")
              .one().count;
            const recent = this.ctx.storage.sql
              .exec(
                "SELECT id FROM feedback WHERE actor=? AND at>?",
                c.actor,
                now - 86_400_000,
              )
              .toArray();
            if (count >= 1000 || recent.length >= 10)
              throw new ShopError(
                "Bạn đã gửi nhiều góp ý hôm nay. Hãy thử lại sau nhé.",
                429,
              );
            const entry: Feedback = {
              id: crypto.randomUUID(),
              category: c.category,
              message: c.message,
              at: now,
              state: "new",
            };
            this.ctx.storage.sql.exec(
              "INSERT INTO feedback(id,actor,key,at,payload) VALUES(?,?,?,?,?)",
              entry.id,
              c.actor,
              c.key,
              now,
              JSON.stringify(entry),
            );
            audit(s, "feedback_received", entry.id, now);
          }
          result = { ok: true };
        } else if (c.action === "feedback_review") {
          const row = this.ctx.storage.sql
            .exec<{ payload: string }>(
              "SELECT payload FROM feedback WHERE id=?",
              c.id,
            )
            .toArray()[0];
          if (!row) throw new ShopError("Không tìm thấy góp ý.", 404);
          const entry = JSON.parse(row.payload) as Feedback;
          entry.state = "reviewed";
          this.ctx.storage.sql.exec(
            "UPDATE feedback SET payload=? WHERE id=?",
            JSON.stringify(entry),
            c.id,
          );
          audit(s, "feedback_reviewed", c.id, now);
          result = { ok: true };
        } else if (c.action === "cms_get") result = this.workspace();
        else if (
          c.action === "cms_save" ||
          c.action === "cms_publish" ||
          c.action === "cms_restore"
        ) {
          let workspace: LocalWorkspace = this.workspace();
          if (workspace.headVersion !== c.version)
            throw new ShopError(
              "CMS đã đổi. Tải lại trước khi lưu/xuất bản.",
              409,
            );
          if (c.action === "cms_save")
            workspace = saveLocalDraft(workspace, c.snapshot, c.version);
          else if (c.action === "cms_restore")
            workspace = restoreLocal(workspace, c.id);
          else {
            if (workspace.revisions.at(-1)?.id !== c.id)
              throw new ShopError(
                "Chỉ xuất bản nháp mới nhất; hãy khôi phục bản cũ thành nháp mới.",
                409,
              );
            workspace = publishLocal(workspace, c.id);
          }
          this.ctx.storage.sql.exec(
            "UPDATE cms SET payload=? WHERE id=1",
            JSON.stringify(workspace),
          );
          audit(s, c.action, String(workspace.headVersion), now);
          result = { ok: true };
        } else if (c.action === "list")
          result = {
            orders: s.orders.filter((o) => o.actor === c.actor).map(projection),
            tickets: s.tickets
              .filter((t) => t.actor === c.actor)
              .map(({ actor, ...t }) => t),
          };
        else if (c.action === "ops")
          result = {
            orders: s.orders.map(projection).reverse(),
            stock: this.catalog().products.flatMap((p) =>
              p.variants.map((v) => ({
                variantId: v.id,
                name: `${p.name} / ${v.label}`,
                available: s.stock.filter(
                  (i) => i.variantId === v.id && i.state === "available",
                ).length,
                reserved: s.stock.filter(
                  (i) => i.variantId === v.id && i.state === "reserved",
                ).length,
                assigned: s.stock.filter(
                  (i) => i.variantId === v.id && i.state === "assigned",
                ).length,
              })),
            ),
            report: report(s),
            payments: s.payments,
            jobs: s.jobs,
            tickets: s.tickets.map(({ actor, ...t }) => t),
            audit: [...s.audit].reverse().slice(0, 80),
            checkoutEnabled: s.checkoutEnabled,
            feedback: this.ctx.storage.sql
              .exec<{ payload: string }>(
                "SELECT payload FROM feedback ORDER BY at DESC LIMIT 1000",
              )
              .toArray()
              .map((r) => JSON.parse(r.payload) as Feedback),
          };
        else if (c.action === "checkout")
          result = projection(checkout(s, this.catalog(), c, now));
        else if (c.action === "switch") {
          s.checkoutEnabled = c.enabled;
          audit(s, "checkout_switch", c.actor.slice(0, 8), now);
          result = { ok: true };
        } else if (c.action === "import") {
          if (
            !this.catalog().products.some((p) =>
              p.variants.some((v) => v.id === c.variantId),
            ) ||
            s.stock.length + additions.length > 1000
          )
            throw new ShopError(
              "Gói không hợp lệ hoặc vượt giới hạn kho demo.",
            );
          s.stock.push(...additions);
          audit(s, "synthetic_import", c.variantId, now);
          result = { ok: true };
        } else if (c.action === "reply") {
          const ticket = s.tickets.find((t) => t.id === c.id);
          if (!ticket) throw new ShopError("Không tìm thấy ticket.", 404);
          if (ticket.messages.length >= 40)
            throw new ShopError("Ticket demo đạt giới hạn.");
          ticket.messages.push({
            id: crypto.randomUUID(),
            role: "operator",
            text: c.text,
            at: now,
          });
          ticket.state = c.close ? "closed" : "open";
          audit(s, "mock_support_reply", ticket.id, now);
          result = { ok: true };
        } else {
          const o = ownOrder(s, c.id, c.actor);
          if (c.action === "get")
            result = {
              order: projection(o),
              tickets: s.tickets
                .filter((t) => t.orderId === o.id)
                .map(({ actor, ...t }) => t),
            };
          else if (c.action === "pay") {
            const scenario = c.scenario ?? "exact";
            const outcome = observe(
              s,
              {
                id: c.key ?? crypto.randomUUID(),
                orderId: o.id,
                amount:
                  scenario === "underpaid"
                    ? Math.max(0, o.total - 1000)
                    : scenario === "overpaid"
                      ? o.total + 1000
                      : o.total,
                currency: "VND",
                account:
                  scenario === "wrong_account" ? "WRONG" : "DEMO-NOT-A-BANK",
                direction: "in",
                test: true,
              },
              now,
            );
            if (scenario !== "deferred" && outcome === "matched")
              fulfill(s, o.id, now);
            result = { outcome, order: projection(o) };
          } else if (c.action === "retry") {
            fulfill(s, o.id, now);
            result = { order: projection(o) };
          } else if (c.action === "cancel") {
            cancel(s, o, now);
            result = { order: projection(o) };
          } else if (c.action === "refund") {
            refund(
              s,
              o,
              c.key ?? crypto.randomUUID(),
              o.paid - o.refunded,
              now,
            );
            result = { order: projection(o) };
          } else if (c.action === "replace") {
            replace(s, o, c.unitId ?? "", now);
            result = { order: projection(o) };
          } else if (c.action === "resend") {
            if (o.state !== "delivered" || o.refunded)
              throw new ShopError("Không có giao hàng hợp lệ.", 409);
            audit(s, "mock_resend_same_delivery", o.id, now);
            result = {
              message:
                "Thông báo mẫu được ghi nhận; không gửi email, không cấp kho mới.",
            };
          } else if (c.action === "reveal") {
            if (o.state !== "delivered" || o.refunded)
              throw new ShopError("Sản phẩm chưa thể mở.", 403);
            const history = o.generations[c.unitId ?? ""];
            const unit = s.stock.find((i) => i.id === history?.at(-1));
            if (!unit || unit.orderId !== o.id)
              throw new ShopError("Không tìm thấy sản phẩm.", 404);
            delivery = {
              sealed: unit.sealed,
              aad: `${unit.id}:${unit.variantId}`,
            };
            audit(s, "mock_reveal", o.id, now);
            result = { ok: true };
          } else if (c.action === "ticket") {
            if (s.tickets.filter((t) => t.actor === c.actor).length >= 30)
              throw new ShopError("Đạt giới hạn ticket thử nghiệm.", 429);
            const id = crypto.randomUUID();
            s.tickets.push({
              id,
              orderId: o.id,
              actor: c.actor,
              subject: c.subject,
              state: "open",
              messages: [
                {
                  id: crypto.randomUUID(),
                  role: "customer",
                  text: c.text,
                  at: now,
                },
              ],
            });
            audit(s, "ticket_created", id, now);
            result = { ok: true };
          }
        }
        this.ctx.storage.sql.exec(
          "UPDATE ledger SET payload=? WHERE id=1",
          JSON.stringify(s),
        );
        return result;
      });
      if (delivery) {
        const encrypted = delivery as {
          sealed: Parameters<typeof unseal>[0];
          aad: string;
        };
        return Response.json(
          {
            payload: await unseal(
              encrypted.sealed,
              encrypted.aad,
              this.env.DEMO_INVENTORY_KEY,
            ),
          },
          { headers: { "Cache-Control": "private, no-store" } },
        );
      }
      return Response.json(result, {
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof ShopError
              ? error.message
              : "Yêu cầu sandbox không hợp lệ.",
        },
        { status: error instanceof ShopError ? error.status : 400 },
      );
    }
  }
}
