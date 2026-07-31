const { db } = require('../database/db');
const { config } = require('../config');
const { createKey } = require('./licenses');
const { addSpend, ensureUser } = require('./users');
const { getProduct } = require('./pricing');

function recordSale({
  discordId,
  productId,
  amountPence,
  discountPence = 0,
  paymentMethod = 'stripe',
  stripeSessionId = null,
  username = null,
}) {
  ensureUser(discordId, username);
  const product = getProduct(productId);
  if (!product) {
    throw new Error(`Unknown product: ${productId}`);
  }

  const insertSale = db.prepare(`
    INSERT INTO sales (
      discord_id, product_id, amount_pence, discount_pence, currency,
      payment_method, stripe_session_id, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'completed')
  `);

  const result = insertSale.run(
    discordId,
    productId,
    amountPence,
    discountPence,
    config.currency,
    paymentMethod,
    stripeSessionId,
  );

  const saleId = result.lastInsertRowid;
  const keyRow = createKey({
    productId,
    createdBy: 'sale',
    saleId,
    note: `Auto-delivered via ${paymentMethod}`,
  });

  db.prepare('UPDATE sales SET licence_key = ? WHERE id = ?').run(keyRow.key, saleId);
  const user = addSpend(discordId, amountPence);

  return {
    sale: db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId),
    key: keyRow,
    user,
    product,
  };
}

function getSalesStats() {
  const totals = db.prepare(`
    SELECT
      COUNT(*) AS total_sales,
      COALESCE(SUM(amount_pence), 0) AS revenue_pence,
      COALESCE(SUM(discount_pence), 0) AS discount_pence
    FROM sales
    WHERE status = 'completed'
  `).get();

  const byProduct = db.prepare(`
    SELECT p.name, COUNT(*) AS count, COALESCE(SUM(s.amount_pence), 0) AS revenue_pence
    FROM sales s
    JOIN products p ON p.id = s.product_id
    WHERE s.status = 'completed'
    GROUP BY s.product_id
    ORDER BY revenue_pence DESC
  `).all();

  const byDay = db.prepare(`
    SELECT date(created_at) AS day, COUNT(*) AS count, COALESCE(SUM(amount_pence), 0) AS revenue_pence
    FROM sales
    WHERE status = 'completed'
    GROUP BY date(created_at)
    ORDER BY day DESC
    LIMIT 14
  `).all();

  return { totals, byProduct, byDay };
}

function getTodaySales() {
  return db.prepare(`
    SELECT s.*, p.name AS product_name, u.username
    FROM sales s
    JOIN products p ON p.id = s.product_id
    LEFT JOIN users u ON u.discord_id = s.discord_id
    WHERE s.status = 'completed'
      AND date(s.created_at) = date('now')
    ORDER BY s.created_at DESC
  `).all();
}

function getSaleByStripeSession(sessionId) {
  return db.prepare('SELECT * FROM sales WHERE stripe_session_id = ?').get(sessionId) || null;
}

module.exports = {
  recordSale,
  getSalesStats,
  getTodaySales,
  getSaleByStripeSession,
};
