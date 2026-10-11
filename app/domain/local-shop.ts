import type { StorefrontContent } from "../content/types";
import { calculateLineTotal } from "./money";

export interface Sealed {
  version: 1;
  nonce: string;
  ciphertext: string;
}
export interface Stock {
  id: string;
  variantId: string;
  sealed: Sealed;
  cost: number;
  state: "available" | "reserved" | "assigned" | "retired";
  orderId?: string;
}
export interface Item {
  variantId: string;
  product: string;
  label: string;
  price: number;
  quantity: number;
  stockIds: string[];
  activation: boolean;
}
export interface LocalOrder {
  id: string;
  actor: string;
  key: string;
  fingerprint: string;
  created: number;
  expires: number;
  items: Item[];
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  refunded: number;
  state:
    | "pending_payment"
    | "paid"
    | "delivered"
    | "expired"
    | "cancelled"
    | "review_required"
    | "refunded";
  generations: Record<string, string[]>;
}
export interface Observation {
  id: string;
  orderId: string;
  amount: number;
  currency: string;
  account: string;
  direction: string;
  test: boolean;
  outcome?: string;
}
export interface Ticket {
  id: string;
  orderId: string;
  actor: string;
  subject: string;
  state: "open" | "closed";
  messages: {
    id: string;
    role: "customer" | "operator";
    text: string;
    at: number;
  }[];
}
export interface ShopState {
  version: 1;
  stock: Stock[];
  orders: LocalOrder[];
  payments: Observation[];
  jobs: { orderId: string; state: "pending" | "done" | "cancelled" }[];
  tickets: Ticket[];
  audit: { eventId: string; action: string; id: string; at: number }[];
  refunds: { id: string; orderId: string; amount: number }[];
  checkoutEnabled: boolean;
}
export class ShopError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function emptyShop(): ShopState {
  return {
    version: 1,
    stock: [],
    orders: [],
    payments: [],
    jobs: [],
    tickets: [],
    audit: [],
    refunds: [],
    checkoutEnabled: true,
  };
}
export function audit(s: ShopState, action: string, id: string, now: number) {
  s.audit.push({ eventId: crypto.randomUUID(), action, id, at: now });
  s.audit = s.audit.slice(-2000);
}
export function expire(s: ShopState, now: number) {
  for (const order of s.orders)
    if (order.state === "pending_payment" && order.expires <= now) {
      order.state = "expired";
      release(s, order);
      audit(s, "reservation_expired", order.id, now);
    }
}
function release(s: ShopState, o: LocalOrder) {
  for (const stock of s.stock)
    if (stock.orderId === o.id && stock.state === "reserved") {
      stock.state = "available";
      delete stock.orderId;
    }
}
export function ownOrder(s: ShopState, id: string, actor: string) {
  const order = s.orders.find((o) => o.id === id && o.actor === actor);
  if (!order) throw new ShopError("Không tìm thấy đơn trong phiên này.", 404);
  return order;
}
export function checkout(
  s: ShopState,
  content: StorefrontContent,
  input: {
    actor: string;
    key: string;
    lines: { variantId: string; quantity: number }[];
    coupon: string;
    expectedTotal: number;
  },
  now: number,
) {
  expire(s, now);
  if (
    !input.actor ||
    !/^[0-9a-f-]{36}$/.test(input.key) ||
    !Array.isArray(input.lines) ||
    input.lines.length < 1 ||
    input.lines.length > 19
  )
    throw new ShopError("Lựa chọn không hợp lệ.");
  const lines = [...input.lines].sort((a, b) =>
    a.variantId.localeCompare(b.variantId),
  );
  if (new Set(lines.map((l) => l.variantId)).size !== lines.length)
    throw new ShopError("Gói bị trùng.");
  const fingerprint = JSON.stringify({
    lines,
    coupon: input.coupon.trim().toUpperCase(),
    expectedTotal: input.expectedTotal,
  });
  const replay = s.orders.find(
    (o) => o.actor === input.actor && o.key === input.key,
  );
  if (replay) {
    if (replay.fingerprint !== fingerprint)
      throw new ShopError("Yêu cầu đã thay đổi; hãy tạo lượt đặt mới.", 409);
    return replay;
  }
  if (!s.checkoutEnabled)
    throw new ShopError("Checkout thử nghiệm đang tạm dừng.", 503);
  if (s.orders.length >= 500)
    throw new ShopError("Sandbox đã đạt giới hạn 500 đơn.", 429);
  const allocated = new Set<string>();
  let subtotal = 0;
  const items = lines.map((line) => {
    if (
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > 10
    )
      throw new ShopError("Số lượng cần từ 1–10.");
    const product = content.products.find((p) =>
      p.variants.some((v) => v.id === line.variantId),
    );
    const variant = product?.variants.find((v) => v.id === line.variantId);
    if (!product || !variant)
      throw new ShopError("Gói không còn được bán.", 409);
    if (variant.priceConfigured === false)
      throw new ShopError(
        "Gói chưa có giá niêm yết. Vui lòng liên hệ Hubby.",
        409,
      );
    const stock = s.stock
      .filter(
        (i) =>
          i.variantId === variant.id &&
          i.state === "available" &&
          !allocated.has(i.id),
      )
      .slice(0, line.quantity);
    if (stock.length !== line.quantity)
      throw new ShopError(
        `${product.name} / ${variant.label} không đủ kho thử nghiệm.`,
        409,
      );
    for (const unit of stock) allocated.add(unit.id);
    subtotal += calculateLineTotal(variant.priceVnd, line.quantity);
    return {
      variantId: variant.id,
      product: product.name,
      label: variant.label,
      price: variant.priceVnd,
      quantity: line.quantity,
      stockIds: stock.map((i) => i.id),
      activation: product.activationRequired,
    };
  });
  const coupon = input.coupon.trim().toUpperCase();
  if (coupon && coupon !== content.coupon.code)
    throw new ShopError("Mã giảm giá không hợp lệ.");
  const discount = coupon
    ? Math.min(
        Math.floor((subtotal * content.coupon.percent) / 100),
        content.coupon.maxDiscountVnd,
      )
    : 0;
  if (input.expectedTotal !== subtotal - discount)
    throw new ShopError(
      "Giá trên máy chủ đã khác bản xem trước. Tải lại để xác nhận giá đã xuất bản, không tự động đổi tổng tiền.",
      409,
    );
  const order: LocalOrder = {
    id: crypto.randomUUID(),
    actor: input.actor,
    key: input.key,
    fingerprint,
    created: now,
    expires: now + 15 * 60_000,
    items,
    subtotal,
    discount,
    total: subtotal - discount,
    paid: 0,
    refunded: 0,
    state: "pending_payment",
    generations: {},
  };
  for (const unit of s.stock)
    if (allocated.has(unit.id)) {
      unit.state = "reserved";
      unit.orderId = order.id;
    }
  s.orders.push(order);
  audit(s, "checkout_reserved", order.id, now);
  return order;
}
export function observe(s: ShopState, event: Observation, now: number) {
  expire(s, now);
  const replay = s.payments.find((p) => p.id === event.id);
  if (replay) {
    if (
      JSON.stringify({ ...replay, outcome: undefined }) !==
      JSON.stringify({ ...event, outcome: undefined })
    )
      throw new ShopError("Mã giao dịch trùng với nội dung khác.", 409);
    return replay.outcome;
  }
  if (
    !Number.isSafeInteger(event.amount) ||
    event.amount < 0 ||
    !event.id ||
    s.payments.length >= 2000
  )
    throw new ShopError("Giao dịch mẫu không hợp lệ.");
  const order = s.orders.find((o) => o.id === event.orderId);
  let outcome = "unmatched";
  if (
    event.currency !== "VND" ||
    event.account !== "DEMO-NOT-A-BANK" ||
    event.direction !== "in" ||
    !event.test
  )
    outcome = "rejected";
  else if (order) {
    if (order.state !== "pending_payment")
      outcome = order.paid ? "duplicate_payment_review" : "late_review";
    else if (event.amount !== order.total)
      outcome =
        event.amount < order.total ? "underpaid_review" : "overpaid_review";
    else {
      outcome = "matched";
      order.paid = event.amount;
      order.state = "paid";
      s.jobs.push({ orderId: order.id, state: "pending" });
      audit(s, "mock_payment_matched", order.id, now);
    }
  }
  s.payments.push({ ...event, outcome });
  return outcome;
}
export function fulfill(s: ShopState, id: string, now: number) {
  const o = s.orders.find((x) => x.id === id);
  const job = s.jobs.find((j) => j.orderId === id);
  if (!o || !job || job.state !== "pending") return;
  if (o.paid !== o.total || o.refunded || o.state !== "paid")
    throw new ShopError("Đơn chưa đủ điều kiện giao.", 409);
  const ids = o.items.flatMap((i) => i.stockIds);
  if (
    ids.some(
      (id) =>
        !s.stock.some(
          (i) => i.id === id && i.orderId === o.id && i.state === "reserved",
        ),
    )
  ) {
    o.state = "review_required";
    audit(s, "fulfillment_review", id, now);
    return;
  }
  for (const unit of s.stock)
    if (ids.includes(unit.id)) {
      unit.state = "assigned";
      o.generations[unit.id] = [unit.id];
    }
  o.state = "delivered";
  job.state = "done";
  audit(s, "mock_delivery_committed", id, now);
}
export function cancel(s: ShopState, o: LocalOrder, now: number) {
  if (o.state !== "pending_payment")
    throw new ShopError("Chỉ hủy đơn chưa thanh toán.", 409);
  o.state = "cancelled";
  release(s, o);
  audit(s, "cancelled", o.id, now);
}
export function refund(
  s: ShopState,
  o: LocalOrder,
  id: string,
  amount: number,
  now: number,
) {
  const old = s.refunds.find((r) => r.id === id);
  if (old) {
    if (old.orderId !== o.id || old.amount !== amount)
      throw new ShopError("Refund replay khác nội dung.", 409);
    return;
  }
  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    amount > o.paid - o.refunded
  )
    throw new ShopError("Refund không được vượt số tiền mẫu đã nhận.", 409);
  s.refunds.push({ id, orderId: o.id, amount });
  o.refunded += amount;
  if (o.refunded === o.paid) {
    o.state = "refunded";
    for (const job of s.jobs)
      if (job.orderId === o.id && job.state === "pending")
        job.state = "cancelled";
    for (const unit of s.stock)
      if (unit.orderId === o.id) unit.state = "retired";
  }
  audit(s, "mock_refund", o.id, now);
}
export function replace(
  s: ShopState,
  o: LocalOrder,
  originalId: string,
  now: number,
) {
  if (o.state !== "delivered" || o.refunded)
    throw new ShopError("Đơn không thể đổi mẫu.", 409);
  const history = o.generations[originalId];
  const old = s.stock.find((i) => i.id === history?.at(-1));
  if (!history || !old)
    throw new ShopError("Không tìm thấy đơn vị đã giao.", 404);
  const unit = s.stock.find(
    (i) => i.variantId === old.variantId && i.state === "available",
  );
  if (!unit) throw new ShopError("Không đủ kho thay thế.", 409);
  old.state = "retired";
  unit.state = "assigned";
  unit.orderId = o.id;
  history.push(unit.id);
  audit(s, "replacement_generation", o.id, now);
}
export function projection(o: LocalOrder) {
  return {
    id: o.id,
    created: o.created,
    expires: o.expires,
    items: o.items.map(({ stockIds, ...item }) => ({
      ...item,
      unitIds: stockIds,
    })),
    subtotal: o.subtotal,
    discount: o.discount,
    total: o.total,
    paid: o.paid,
    refunded: o.refunded,
    state: o.state,
  };
}
export function report(s: ShopState) {
  return {
    orders: s.orders.length,
    received: s.orders.reduce((n, o) => n + o.paid, 0),
    refunded: s.orders.reduce((n, o) => n + o.refunded, 0),
    net: s.orders.reduce((n, o) => n + o.paid - o.refunded, 0),
    pendingJobs: s.jobs.filter((j) => j.state === "pending").length,
    openTickets: s.tickets.filter((t) => t.state === "open").length,
    available: s.stock.filter((i) => i.state === "available").length,
  };
}
