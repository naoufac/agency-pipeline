// ecom:check — THE PQ2 GATE (a store must actually SELL). Deterministic, no LLM, no live server:
//   RENDER layer: products/cart/checkout sections produce the real primitives (shop grid wired to the
//     data API, cart runtime, checkout posting to /api/site/:id/order) and the store guarantee injects
//     them when a composed model forgot.
//   ORDER layer: against a REAL scratch schema — placeOrder writes order + line items in one
//     transaction with SERVER-side pricing (client prices ignored), snapshots unit prices, and
//     rejects bad input (empty cart, unknown product, qty 0, missing name). Torn down after.
// Exit 1 on any failure. Run: npm run ecom:check.
import { randomUUID } from 'node:crypto';
import { makePool } from './db.ts';
import * as appdb from './appdb.ts';
import { renderPage } from './render.ts';
import { normalizeSite } from './spec.ts';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = '') => { if (cond) pass++; else { fail++; console.error(`  ✗ ${name} ${extra}`); } };

// ---- RENDER layer ----
const pages = [{ slug: 'index', title: 'Home' }, { slug: 'shop', title: 'Shop' }, { slug: 'cart', title: 'Cart' }, { slug: 'checkout', title: 'Checkout' }];
const shop = renderPage({ brand: { name: 'Kiln', tokens: { bg: '#ffffff', primary: '#7a1f1f' } }, sections: [
  { type: 'hero', headline: 'Handmade ceramics' }, { type: 'products', title: 'The collection', table: 'products' }] },
  { pages, slug: 'shop', title: 'Shop' });
ok('shop grid wired to the products table', shop.includes('data-products="products"'));
ok('shop grid loads via the data API + add-to-cart runtime', shop.includes("'.products[data-products]'") && shop.includes('relayCartAdd'));
const cart = renderPage({ brand: { name: 'Kiln', tokens: {} }, sections: [{ type: 'hero', headline: 'Cart' }, { type: 'cart', title: 'Your cart' }] }, { pages, slug: 'cart', title: 'Cart' });
ok('cart section renders the cart container', cart.includes('data-cart="full"'));
const co = renderPage({ brand: { name: 'Kiln', tokens: {} }, sections: [{ type: 'hero', headline: 'Checkout' }, { type: 'checkout', title: 'Checkout' }] }, { pages, slug: 'checkout', title: 'Checkout' });
ok('checkout renders buyer form + summary', co.includes('data-cart="summary"') && co.includes('relayCheckout') && co.includes('name="customer_name"'));
ok('checkout posts to the ORDER endpoint (server-priced)', co.includes("/order'"));

// store guarantee: a composed model that FORGOT the store sections gets them injected
{
  const model = { pages: [
    { slug: 'index', title: 'Home', sections: [{ type: 'hero', headline: 'Hi there friend' }, { type: 'features', items: [{ title: 'A', body: 'b' }] }] },
    { slug: 'cart', title: 'Cart', sections: [{ type: 'hero', headline: 'Your cart page' }, { type: 'split', body: 'why buy' }] },
    { slug: 'checkout', title: 'Checkout', sections: [{ type: 'hero', headline: 'Nearly done now' }, { type: 'split', body: 'checkout info' }] },
  ] };
  const r = normalizeSite(model, model.pages.map(p => ({ slug: p.slug, title: p.title })), { archetype: 'store', tables: ['products', 'orders', 'order_items'], forms: { products: [{ name: 'title', type: 'text', nullable: false }] }, primaryTable: 'products' });
  ok('store guarantee: products grid injected', r.site.pages[0].sections.some((s: any) => s.type === 'products'));
  ok('store guarantee: cart injected on cart page', r.site.pages[1].sections.some((s: any) => s.type === 'cart'));
  ok('store guarantee: checkout injected on checkout page', r.site.pages[2].sections.some((s: any) => s.type === 'checkout'));
}

// ---- ORDER layer (real scratch schema) ----
const pool = makePool();
const id = randomUUID();
const schema = appdb.schemaName(id);
const MODEL = JSON.stringify({ entities: [
  { name: 'products', public: true, display: 'title', fields: [{ name: 'title', type: 'text', required: true }, { name: 'price', type: 'money', required: true }],
    seed: [{ title: 'Mug', price: 24 }, { title: 'Bowl', price: 38.5 }, { title: 'Vase', price: 64 }] },
  { name: 'orders', fields: [{ name: 'customer_name', type: 'text', required: true }, { name: 'email', type: 'email' }, { name: 'phone', type: 'text' }, { name: 'notes', type: 'longtext' }, { name: 'status', type: 'status' }, { name: 'total', type: 'money' }] },
  { name: 'order_items', fields: [{ name: 'order', type: 'ref:orders', required: true }, { name: 'product', type: 'ref:products', required: true }, { name: 'qty', type: 'int', required: true }, { name: 'unit_price', type: 'money' }] },
] });
try {
  await appdb.provision(pool, id, MODEL);
  // the happy path: 2× Mug + 1× Bowl = 2*24 + 38.5 = 86.5 — computed SERVER-side
  const r = await appdb.placeOrder(pool, id, { customer_name: 'Ada Buyer', email: 'ada@example.com', phone: '123', notes: 'gift wrap' }, [{ id: 1, qty: 2 }, { id: 2, qty: 1 }]);
  ok('order placed', r.ok === true, JSON.stringify(r));
  ok('total computed server-side (86.5)', r.total === 86.5, String(r.total));
  const orow = (await pool.query(`select customer_name, email, status, total::numeric from "${schema}"."orders" where id=$1`, [r.order])).rows[0];
  ok('order row real (name/email/status/total)', orow && orow.customer_name === 'Ada Buyer' && orow.email === 'ada@example.com' && orow.status === 'new' && Number(orow.total) === 86.5, JSON.stringify(orow));
  const items = (await pool.query(`select product_id, qty, unit_price::numeric from "${schema}"."order_items" where order_id=$1 order by product_id`, [r.order])).rows;
  ok('2 line items with unit-price snapshots', items.length === 2 && Number(items[0].unit_price) === 24 && items[0].qty === 2 && Number(items[1].unit_price) === 38.5, JSON.stringify(items));
  // zero trust in the client: rejects garbage
  ok('rejects empty cart', !(await appdb.placeOrder(pool, id, { customer_name: 'A', email: 'a@b.co' }, [])).ok);
  ok('rejects qty 0', !(await appdb.placeOrder(pool, id, { customer_name: 'A', email: 'a@b.co' }, [{ id: 1, qty: 0 }])).ok);
  ok('rejects unknown product', !(await appdb.placeOrder(pool, id, { customer_name: 'A', email: 'a@b.co' }, [{ id: 999, qty: 1 }])).ok);
  ok('rejects missing name', !(await appdb.placeOrder(pool, id, { email: 'a@b.co' }, [{ id: 1, qty: 1 }])).ok);
  ok('rejects bad email', !(await appdb.placeOrder(pool, id, { customer_name: 'A', email: 'nope' }, [{ id: 1, qty: 1 }])).ok);
  ok('nothing partially written on rejects', Number((await pool.query(`select count(*)::int n from "${schema}"."orders"`)).rows[0].n) === 1);
  // a non-store schema answers honestly
  const other = randomUUID();
  await appdb.provision(pool, other, JSON.stringify({ entities: [{ name: 'notes', fields: [{ name: 'body', type: 'text' }] }] }));
  ok('non-store site refuses orders honestly', /no store/.test((await appdb.placeOrder(pool, other, { customer_name: 'A', email: 'a@b.co' }, [{ id: 1, qty: 1 }])).error || ''));
  await pool.query(`drop schema if exists "${appdb.schemaName(other)}" cascade`).catch(() => {});
} catch (e: any) {
  fail++; console.error('  ✗ threw:', e?.message ?? e);
} finally {
  await pool.query(`drop schema if exists "${schema}" cascade`).catch(() => {});
}
console.log(`\necom:check — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
