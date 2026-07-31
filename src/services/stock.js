const { db } = require('../database/db');

function addStock(productLabel, credentials) {
  const result = db.prepare(`
    INSERT INTO account_stock (product_label, credentials, status)
    VALUES (?, ?, 'available')
  `).run(productLabel, credentials);

  return db.prepare('SELECT * FROM account_stock WHERE id = ?').get(result.lastInsertRowid);
}

function deliverNextAccount(productLabel, discordId) {
  const item = db.prepare(`
    SELECT * FROM account_stock
    WHERE product_label = ? AND status = 'available'
    ORDER BY created_at ASC
    LIMIT 1
  `).get(productLabel);

  if (!item) return null;

  db.prepare(`
    UPDATE account_stock
    SET status = 'delivered', delivered_to = ?, delivered_at = datetime('now')
    WHERE id = ?
  `).run(discordId, item.id);

  return db.prepare('SELECT * FROM account_stock WHERE id = ?').get(item.id);
}

function stockCounts() {
  return db.prepare(`
    SELECT product_label,
      SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) AS available,
      SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered
    FROM account_stock
    GROUP BY product_label
    ORDER BY product_label ASC
  `).all();
}

module.exports = { addStock, deliverNextAccount, stockCounts };
