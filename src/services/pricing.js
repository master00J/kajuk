const { db } = require('../database/db');
const { config } = require('../config');
const { getUser } = require('./users');

function getActiveProducts() {
  return db.prepare(`
    SELECT * FROM products WHERE active = 1 ORDER BY sort_order ASC, name ASC
  `).all();
}

function getProduct(productId) {
  return db.prepare('SELECT * FROM products WHERE id = ?').get(productId) || null;
}

function setProductPrice(productId, pricePence) {
  db.prepare(`
    UPDATE products SET price_pence = ? WHERE id = ?
  `).run(pricePence, productId);
  return getProduct(productId);
}

function getActiveFlashSale(productId = null) {
  const now = new Date().toISOString();
  if (productId) {
    return db.prepare(`
      SELECT * FROM flash_sales
      WHERE active = 1
        AND starts_at <= ?
        AND ends_at >= ?
        AND (product_id IS NULL OR product_id = ?)
      ORDER BY discount_percent DESC
      LIMIT 1
    `).get(now, now, productId) || null;
  }

  return db.prepare(`
    SELECT * FROM flash_sales
    WHERE active = 1
      AND starts_at <= ?
      AND ends_at >= ?
    ORDER BY discount_percent DESC
  `).all(now, now);
}

function createFlashSale({ productId = null, discountPercent, startsAt, endsAt, label = null }) {
  const result = db.prepare(`
    INSERT INTO flash_sales (product_id, discount_percent, starts_at, ends_at, label)
    VALUES (?, ?, ?, ?, ?)
  `).run(productId, discountPercent, startsAt, endsAt, label);

  return db.prepare('SELECT * FROM flash_sales WHERE id = ?').get(result.lastInsertRowid);
}

function calculatePrice(productId, discordId = null) {
  const product = getProduct(productId);
  if (!product) return null;

  let price = product.price_pence;
  let discountPercent = 0;
  const reasons = [];

  const flash = getActiveFlashSale(productId);
  if (flash) {
    discountPercent = Math.max(discountPercent, flash.discount_percent);
    reasons.push(`Flash sale ${flash.discount_percent}%${flash.label ? ` (${flash.label})` : ''}`);
  }

  if (discordId) {
    const user = getUser(discordId);
    if (user?.is_vip) {
      discountPercent = Math.max(discountPercent, config.vipDiscountPercent);
      reasons.push(`VIP ${config.vipDiscountPercent}%`);
    }
  }

  const discountPence = Math.round(price * (discountPercent / 100));
  const finalPence = Math.max(0, price - discountPence);

  return {
    product,
    basePence: price,
    discountPercent,
    discountPence,
    finalPence,
    reasons,
  };
}

module.exports = {
  getActiveProducts,
  getProduct,
  setProductPrice,
  getActiveFlashSale,
  createFlashSale,
  calculatePrice,
};
