/* eslint-disable */
// End-to-end smoke test of cart -> checkout -> M-Pesa -> fulfilment against a
// REAL, MIGRATED Postgres, with a fake Daraja server standing in for Safaricom.
//
//   npm run build && DATABASE_URL=postgres://... node scripts/smoke-checkout.js
//
// It seeds its own branch/product/users (unique SKU per run) and leaves them behind.
require("reflect-metadata");
const http = require("http");
const assert = require("assert/strict");
const { randomUUID } = require("crypto");
const { Client } = require("pg");
const jwt = require("jsonwebtoken");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required");
const SECRET = "smoke-jwt-secret";
const CALLBACK_SECRET = "smoke-callback-secret-0123456789";

// ---------- fake Daraja ----------
const daraja = { pushes: [], queryMode: "processing", n: 0 };
const darajaServer = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const send = (code, body) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
    if (req.url.startsWith("/oauth/")) return send(200, { access_token: "tok", expires_in: "3599" });
    const body = raw ? JSON.parse(raw) : {};
    if (req.url.startsWith("/mpesa/stkpush/")) {
      daraja.pushes.push(body);
      const n = ++daraja.n;
      return send(200, { MerchantRequestID: `mr-${n}`, CheckoutRequestID: `ws_CO_${Date.now()}_${n}`, ResponseCode: "0", ResponseDescription: "Success", CustomerMessage: "Success. Request accepted for processing" });
    }
    if (req.url.startsWith("/mpesa/stkpushquery/")) {
      if (daraja.queryMode === "processing") return send(500, { errorCode: "500.001.1001", errorMessage: "The transaction is being processed" });
      return send(200, { ResponseCode: "0", ResultCode: "0", ResultDesc: "The service request is processed successfully." });
    }
    send(404, {});
  });
});

let baseUrl;
let ipCounter = 10;
async function api(method, path, { body, headers = {}, token, ip } = {}) {
  const res = await fetch(baseUrl + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      // Each simulated customer comes from its own IP (exercises trust-proxy + per-IP throttling).
      "X-Forwarded-For": ip ?? `10.0.0.${ipCounter++}`,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

let passed = 0;
const ok = (name) => { passed++; console.log(`  PASS  ${name}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await new Promise((r) => darajaServer.listen(0, r));
  Object.assign(process.env, {
    DATABASE_URL,
    JWT_ACCESS_SECRET: SECRET,
    MPESA_BASE_URL: `http://127.0.0.1:${darajaServer.address().port}`,
    MPESA_CONSUMER_KEY: "k", MPESA_CONSUMER_SECRET: "s", MPESA_SHORTCODE: "174379", MPESA_PASSKEY: "pk",
    MPESA_CALLBACK_URL: "https://example.test/api/v1/webhooks/mpesa/callback", MPESA_CALLBACK_SECRET: CALLBACK_SECRET,
    DELIVERY_FEE_KES: "500", ORDER_PAYMENT_TTL_MINUTES: "30",
  });

  const { NestFactory } = require("@nestjs/core");
  const { ValidationPipe } = require("@nestjs/common");
  const { AppModule } = require("../dist/app.module");
  const { HttpExceptionFilter } = require("../dist/common/filters/http-exception.filter");
  const { OrderExpiryService } = require("../dist/modules/orders/order-expiry.service");
  const app = await NestFactory.create(AppModule, { logger: ["error"] });
  app.set("trust proxy", 1);
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.listen(0);
  baseUrl = `http://127.0.0.1:${app.getHttpServer().address().port}/api/v1`;

  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();
  const q = async (sql, params) => (await db.query(sql, params)).rows;
  const stock = async (productId, branchId) => Number((await q("SELECT quantity FROM inventory WHERE product_id=$1 AND branch_id=$2", [productId, branchId]))[0]?.quantity ?? 0);

  // ---------- seed ----------
  const run = Date.now();
  const [{ id: branchId }] = await q("INSERT INTO branches (name, city) VALUES ($1, 'Test') RETURNING id", [`Smoke ${run}`]);
  const [{ id: categoryId }] = await q("SELECT id FROM categories WHERE slug='tires'");
  const [{ id: productId }] = await q(
    `INSERT INTO products (sku, category_id, name, condition, price, discount_pct) VALUES ($1,$2,'Smoke Tire 205/55R16','new',10000,10) RETURNING id`,
    [`SMK-${run}`, categoryId]);
  await q("INSERT INTO tire_specs (product_id, width_mm, aspect_ratio, rim_diameter_in) VALUES ($1,205,55,16)", [productId]);
  await q("INSERT INTO inventory (product_id, branch_id, quantity) VALUES ($1,$2,5)", [productId, branchId]);
  const staffId = randomUUID(), customerId = randomUUID();
  await q("INSERT INTO users (id,email,full_name,user_type) VALUES ($1,$2,'Smoke Staff','staff'),($3,$4,'Smoke Customer','customer')",
    [staffId, `staff-${run}@t.test`, customerId, `cust-${run}@t.test`]);
  const staff = jwt.sign({ sub: staffId, email: "s@t.test", roles: ["super_admin"] }, SECRET);
  const customer = jwt.sign({ sub: customerId, email: "c@t.test", roles: ["customer"] }, SECRET);

  const contact = { fullName: "Wanjiku Kamau", phone: "0712 345 678" };
  const delivery = { deliveryMethod: "delivery", contact, deliveryAddress: { line1: "Ngong Rd 12", city: "Nairobi" } };
  const newGuestOrder = async (qty, extra = {}) => {
    const session = randomUUID();
    const h = { "X-Cart-Session": session, ...(extra.headers ?? {}) };
    const ip = extra.ip ?? `10.1.${ipCounter++ % 250}.${ipCounter % 250}`;
    const add = await api("POST", "/cart/items", { body: { productId, quantity: qty }, headers: h, ip });
    if (add.status !== 201) return { add };
    const order = await api("POST", "/orders", { body: extra.dto ?? delivery, headers: h, ip });
    return { add, order, session, ip, token: order.body.guestToken, id: order.body.id };
  };

  console.log("Catalog / catalog money types");
  const list = await api("GET", "/products?size=205/55R16");
  assert.equal(list.status, 200);
  const listed = list.body.data.find((p) => p.id === productId);
  assert.equal(typeof listed.price, "number", "price should be numeric, not a string");
  ok("size search finds the product; price is a number");

  console.log("Cart");
  const sA = randomUUID();
  const cart = await api("POST", "/cart/items", { body: { productId, quantity: 2 }, headers: { "X-Cart-Session": sA } });
  assert.equal(cart.status, 201);
  assert.equal(cart.body.subtotal, 18000);
  assert.equal(cart.body.items[0].unitPrice, 9000);
  ok("discount applied (10000 -10% = 9000 x2 = 18000)");
  const tooMany = await api("POST", "/cart/items", { body: { productId, quantity: 10 }, headers: { "X-Cart-Session": sA } });
  assert.equal(tooMany.status, 409);
  assert.equal(tooMany.body.code, "INSUFFICIENT_STOCK");
  assert.equal(tooMany.body.items[0].available, 5);
  ok("cannot add more than stock (409 with structured details)");
  const sv = await api("PATCH", `/cart/items/${productId}/save-for-later`, { body: { saved: true }, headers: { "X-Cart-Session": sA } });
  assert.equal(sv.body.items.length, 0); assert.equal(sv.body.savedForLater.length, 1); assert.equal(sv.body.subtotal, 0);
  await api("PATCH", `/cart/items/${productId}/save-for-later`, { body: { saved: false }, headers: { "X-Cart-Session": sA } });
  ok("save for later removes item from totals and back");

  console.log("Checkout");
  const key = `idem-${run}-a`;
  const o1 = await api("POST", "/orders", { body: delivery, headers: { "X-Cart-Session": sA, "Idempotency-Key": key } });
  assert.equal(o1.status, 201, JSON.stringify(o1.body));
  assert.equal(o1.body.subtotal, 18000); assert.equal(o1.body.deliveryFee, 500); assert.equal(o1.body.total, 18500);
  assert.match(o1.body.orderNumber, /^WG\d+$/);
  assert.ok(o1.body.guestToken);
  assert.equal(await stock(productId, branchId), 3);
  ok("order created: total 18,500 incl. delivery; stock 5 -> 3");
  const replay = await api("POST", "/orders", { body: delivery, headers: { "X-Cart-Session": sA, "Idempotency-Key": key } });
  assert.equal(replay.body.id, o1.body.id);
  assert.equal(await stock(productId, branchId), 3);
  const orderId = o1.body.id, gtok = replay.body.guestToken;
  ok("idempotent replay returns the same order, no second reservation");
  const empty = await api("POST", "/orders", { body: delivery, headers: { "X-Cart-Session": sA } });
  assert.equal(empty.status, 400);
  ok("cart is emptied by checkout (second checkout -> 400)");
  assert.equal((await api("GET", `/orders/${orderId}`)).status, 404);
  assert.equal((await api("GET", `/orders/${orderId}`, { headers: { "X-Order-Token": o1.body.guestToken } })).status, 404, "old token invalid after replay rotation");
  assert.equal((await api("GET", `/orders/${orderId}`, { headers: { "X-Order-Token": gtok } })).status, 200);
  ok("guest access needs the token (none/stale -> 404, current -> 200)");
  const tr = await api("GET", `/orders/track?orderNumber=${o1.body.orderNumber}&phone=0712345678`);
  assert.equal(tr.status, 200); assert.equal(tr.body.status, "pending"); assert.equal(tr.body.contact, undefined);
  assert.equal((await api("GET", `/orders/track?orderNumber=${o1.body.orderNumber}&phone=0722000000`)).status, 404);
  ok("public tracking works with order number + phone, leaks no PII, wrong phone -> 404");

  console.log("Concurrency: 6 shoppers race for the last 3 tyres");
  const shoppers = [];
  for (let i = 0; i < 6; i++) {
    const session = randomUUID(); const ip = `10.2.0.${i + 1}`;
    const add = await api("POST", "/cart/items", { body: { productId, quantity: 1 }, headers: { "X-Cart-Session": session }, ip });
    assert.equal(add.status, 201);
    shoppers.push({ session, ip });
  }
  const results = await Promise.all(shoppers.map((s) =>
    api("POST", "/orders", { body: { deliveryMethod: "pickup", branchId, contact }, headers: { "X-Cart-Session": s.session }, ip: s.ip })));
  const won = results.filter((r) => r.status === 201).length;
  assert.equal(won, 3, `expected exactly 3 winners, got ${won}: ${results.map((r) => r.status)}`);
  assert.ok(results.filter((r) => r.status !== 201).every((r) => r.status === 409));
  assert.equal(await stock(productId, branchId), 0);
  const [{ s: ledger }] = await q("SELECT COALESCE(SUM(change_qty),0) AS s FROM stock_movements WHERE product_id=$1 AND reason='sale'", [productId]);
  assert.equal(Number(ledger), -5);
  ok("exactly 3 orders won, 3 got 409, stock is 0 (never negative), ledger sums to -5");

  console.log("Admin inventory");
  const adj = await api("POST", "/admin/inventory/adjust", { token: staff, body: { productId, branchId, changeQty: 20, reason: "purchase" } });
  assert.equal(adj.status, 201, JSON.stringify(adj.body)); assert.equal(adj.body.quantity, 20);
  const neg = await api("POST", "/admin/inventory/adjust", { token: staff, body: { productId, branchId, changeQty: -999, reason: "adjustment" } });
  assert.equal(neg.status, 409);
  assert.equal((await api("POST", "/admin/inventory/adjust", { token: customer, body: { productId, branchId, changeQty: 1, reason: "purchase" } })).status, 403);
  assert.equal((await api("POST", "/admin/inventory/adjust", { body: { productId, branchId, changeQty: 1, reason: "purchase" } })).status, 401);
  ok("stock-in works; negative result -> 409; customer 403; anonymous 401");
  const stockBeforeOrder1Cancel = 20;

  console.log("M-Pesa STK");
  const payH = { "X-Order-Token": gtok };
  const pay = await api("POST", `/orders/${orderId}/pay`, { body: { method: "mpesa", phone: "0712345678" }, headers: payH, ip: "10.9.0.1" });
  assert.equal(pay.status, 201, JSON.stringify(pay.body));
  const push = daraja.pushes.at(-1);
  assert.equal(push.Amount, 18500); assert.equal(push.PartyA, "254712345678"); assert.equal(push.AccountReference, o1.body.orderNumber);
  assert.ok(push.CallBackURL.endsWith(`/${CALLBACK_SECRET}`));
  assert.equal(Buffer.from(push.Password, "base64").toString().startsWith("174379pk"), true);
  ok("STK push sent: amount 18500, phone normalised, callback URL carries the secret");
  const dup = await api("POST", `/orders/${orderId}/pay`, { body: { method: "mpesa" }, headers: payH, ip: "10.9.0.1" });
  assert.equal(dup.status, 409); assert.equal(dup.body.code, "PAYMENT_IN_PROGRESS");
  assert.equal(daraja.pushes.length, 1);
  ok("double-click does not send a second prompt");
  const paymentId = pay.body.payment.id;
  const [{ checkout_request_id: checkoutId }] = await q("SELECT checkout_request_id FROM payments WHERE id=$1", [paymentId]);
  const cbBody = (id, { code = 0, amount = 18500, receipt = "RCP" + run } = {}) => ({
    Body: { stkCallback: { MerchantRequestID: "mr", CheckoutRequestID: id, ResultCode: code, ResultDesc: code ? "Request cancelled by user" : "The service request is processed successfully.",
      ...(code ? {} : { CallbackMetadata: { Item: [{ Name: "Amount", Value: amount }, { Name: "MpesaReceiptNumber", Value: receipt }, { Name: "TransactionDate", Value: 20260921101500 }, { Name: "PhoneNumber", Value: 254712345678 }] } }) } } });
  assert.equal((await api("POST", "/webhooks/mpesa/callback/wrong-secret", { body: cbBody(checkoutId) })).status, 403);
  assert.equal((await api("GET", `/orders/${orderId}`, { headers: payH })).body.status, "pending");
  ok("callback with the wrong secret -> 403, order untouched");
  const cb = await api("POST", `/webhooks/mpesa/callback/${CALLBACK_SECRET}`, { body: cbBody(checkoutId) });
  assert.equal(cb.status, 200); assert.equal(cb.body.ResultCode, 0);
  let o = (await api("GET", `/orders/${orderId}`, { headers: payH })).body;
  assert.equal(o.status, "confirmed"); assert.equal(o.payments[0].status, "completed"); assert.equal(o.payments[0].providerRef, "RCP" + run);
  ok("valid callback -> payment completed with receipt, order confirmed");
  await api("POST", `/webhooks/mpesa/callback/${CALLBACK_SECRET}`, { body: cbBody(checkoutId) });
  o = (await api("GET", `/orders/${orderId}`, { headers: payH })).body;
  assert.equal(o.history.filter((h) => h.status === "confirmed").length, 1);
  ok("replayed callback is idempotent (still one 'confirmed' history entry)");

  console.log("M-Pesa: failure paths");
  const f = await newGuestOrder(1);
  assert.equal(f.order.status, 201, JSON.stringify(f.order.body));
  const fp = await api("POST", `/orders/${f.id}/pay`, { body: { method: "mpesa" }, headers: { "X-Order-Token": f.token }, ip: "10.9.0.2" });
  const [{ checkout_request_id: fCheckout }] = await q("SELECT checkout_request_id FROM payments WHERE id=$1", [fp.body.payment.id]);
  await api("POST", `/webhooks/mpesa/callback/${CALLBACK_SECRET}`, { body: cbBody(fCheckout, { code: 1032 }) });
  let fo = (await api("GET", `/orders/${f.id}`, { headers: { "X-Order-Token": f.token } })).body;
  assert.equal(fo.status, "pending"); assert.equal(fo.payments[0].status, "failed");
  ok("customer cancels the prompt -> payment failed, order stays pending (can retry)");

  const u = await newGuestOrder(1);
  const up = await api("POST", `/orders/${u.id}/pay`, { body: { method: "mpesa" }, headers: { "X-Order-Token": u.token }, ip: "10.9.0.3" });
  const [{ checkout_request_id: uCheckout }] = await q("SELECT checkout_request_id FROM payments WHERE id=$1", [up.body.payment.id]);
  await api("POST", `/webhooks/mpesa/callback/${CALLBACK_SECRET}`, { body: cbBody(uCheckout, { amount: 1, receipt: "SHORT" + run }) });
  const uo = (await api("GET", `/orders/${u.id}`, { headers: { "X-Order-Token": u.token } })).body;
  assert.equal(uo.status, "pending"); assert.equal(uo.payments[0].status, "failed");
  ok("underpayment (KES 1 vs 9,500) is NOT accepted");

  console.log("M-Pesa: lost callback recovered via status query");
  const v = await newGuestOrder(1);
  const vp = await api("POST", `/orders/${v.id}/pay`, { body: { method: "mpesa" }, headers: { "X-Order-Token": v.token }, ip: "10.9.0.4" });
  let ver = await api("POST", `/payments/${vp.body.payment.id}/verify`, { headers: { "X-Order-Token": v.token }, ip: "10.9.0.4" });
  assert.equal(ver.status, 200); assert.equal(ver.body.status, "pending");
  daraja.queryMode = "success";
  ver = await api("POST", `/payments/${vp.body.payment.id}/verify`, { headers: { "X-Order-Token": v.token }, ip: "10.9.0.4" });
  assert.equal(ver.body.status, "completed");
  assert.equal((await api("GET", `/orders/${v.id}`, { headers: { "X-Order-Token": v.token } })).body.status, "confirmed");
  ok("still-processing stays pending; once Daraja says success the order is confirmed");

  console.log("Cash on delivery + fulfilment");
  const c = await newGuestOrder(1);
  const cp = await api("POST", `/orders/${c.id}/pay`, { body: { method: "cod" }, headers: { "X-Order-Token": c.token }, ip: "10.9.0.5" });
  assert.equal(cp.status, 201);
  assert.equal((await api("GET", `/orders/${c.id}`, { headers: { "X-Order-Token": c.token } })).body.status, "confirmed");
  assert.equal((await api("PATCH", `/admin/orders/${c.id}/status`, { token: staff, body: { status: "delivered" } })).status, 409);
  for (const s of ["packed", "dispatched", "delivered"]) {
    const r = await api("PATCH", `/admin/orders/${c.id}/status`, { token: staff, body: { status: s } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
  await sleep(300);
  const co = (await api("GET", `/orders/${c.id}`, { headers: { "X-Order-Token": c.token } })).body;
  assert.equal(co.status, "delivered"); assert.equal(co.payments[0].status, "completed");
  assert.equal((await api("PATCH", `/admin/orders/${c.id}/status`, { token: staff, body: { status: "cancelled" } })).status, 409);
  ok("COD confirms immediately; skipping steps -> 409; delivered marks cash collected; terminal state is final");
  const adminView = await api("GET", `/admin/orders/${c.id}`, { token: staff });
  assert.ok("note" in adminView.body.history[0]);
  assert.ok(!("note" in co.history[0]));
  ok("staff see internal history notes; customers don't");

  console.log("Cancellation returns stock");
  const beforeCancel = await stock(productId, branchId);
  const cancel = await api("PATCH", `/admin/orders/${orderId}/status`, { token: staff, body: { status: "cancelled", note: "customer request" } });
  assert.equal(cancel.status, 200); assert.equal(cancel.body.refundRequired, true);
  assert.equal(await stock(productId, branchId), beforeCancel + 2);
  ok("cancelling the paid order restores 2 units and flags refundRequired");

  console.log("Expiry sweep");
  const e = await newGuestOrder(2);
  const beforeExpiry = await stock(productId, branchId);
  await q("UPDATE orders SET created_at = now() - interval '2 hours' WHERE id=$1", [e.id]);
  const swept = await app.get(OrderExpiryService).sweep();
  assert.ok(swept >= 1);
  assert.equal((await api("GET", `/orders/${e.id}`, { headers: { "X-Order-Token": e.token } })).body.status, "cancelled");
  assert.equal(await stock(productId, branchId), beforeExpiry + 2);
  ok("stale unpaid order auto-cancelled and its stock released");

  console.log("Cart merge on login");
  const gs = randomUUID();
  await api("POST", "/cart/items", { body: { productId, quantity: 2 }, headers: { "X-Cart-Session": gs } });
  const merged = await api("GET", "/cart", { token: customer, headers: { "X-Cart-Session": gs } });
  assert.equal(merged.body.items[0].quantity, 2);
  const guestLeft = await api("GET", "/cart", { headers: { "X-Cart-Session": gs } });
  assert.equal(guestLeft.body.items.length, 0);
  const mine = await api("POST", "/orders", { token: customer, body: { deliveryMethod: "pickup", branchId, contact }, headers: { "X-Cart-Session": gs } });
  assert.equal(mine.status, 201); assert.equal(mine.body.guestToken, null);
  assert.equal((await api("GET", "/orders", { token: customer })).body.meta.total, 1);
  assert.equal((await api("GET", `/orders/${mine.body.id}`)).status, 404);
  ok("guest cart merged into the customer's on first authed request; customer order listing & ownership enforced");

  console.log("Card");
  const cd = await newGuestOrder(1);
  assert.equal((await api("POST", `/orders/${cd.id}/pay`, { body: { method: "card" }, headers: { "X-Order-Token": cd.token }, ip: "10.9.0.6" })).status, 501);
  ok("card payments explicitly return 501 until a processor is chosen");

  console.log(`\n${passed} checks passed`);
  await db.end(); await app.close(); darajaServer.close();
}

main().catch((err) => { console.error("\nSMOKE TEST FAILED:", err); process.exit(1); });
