const { db } = require('../database/db');
const { generateLicenceKey } = require('../utils/keys');
const { ensureUser } = require('./users');
const { getProduct } = require('./pricing');
const { config } = require('../config');

function createKey({
  productId,
  createdBy = 'system',
  note = null,
  saleId = null,
  customKey = null,
}) {
  const product = getProduct(productId);
  if (!product) {
    throw new Error(`Unknown product: ${productId}`);
  }

  const key = customKey || generateLicenceKey();
  db.prepare(`
    INSERT INTO licence_keys (
      key, product_id, store_id, unlocks_all, created_by, note, sale_id, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'unused')
  `).run(
    key,
    product.id,
    product.store_id,
    product.unlocks_all,
    createdBy,
    note,
    saleId,
  );

  return getKey(key);
}

function getKey(key) {
  return db.prepare(`
    SELECT lk.*, p.name AS product_name
    FROM licence_keys lk
    JOIN products p ON p.id = lk.product_id
    WHERE lk.key = ?
  `).get(key) || null;
}

function deleteKey(key) {
  const existing = getKey(key);
  if (!existing) return null;

  db.prepare(`
    UPDATE licence_keys
    SET status = 'revoked', revoked_at = datetime('now')
    WHERE key = ?
  `).run(key);

  if (existing.redeemed_by) {
    if (existing.unlocks_all) {
      db.prepare('DELETE FROM ownership WHERE discord_id = ? AND source_key = ?')
        .run(existing.redeemed_by, key);
    } else if (existing.store_id) {
      db.prepare('DELETE FROM ownership WHERE discord_id = ? AND store_id = ? AND source_key = ?')
        .run(existing.redeemed_by, existing.store_id, key);
    }
  }

  return getKey(key);
}

function grantOwnership(discordId, keyRow) {
  ensureUser(discordId);

  if (keyRow.unlocks_all) {
    const insert = db.prepare(`
      INSERT INTO ownership (discord_id, store_id, unlocks_all, source_key)
      VALUES (?, ?, 1, ?)
      ON CONFLICT(discord_id, store_id) DO UPDATE SET
        unlocks_all = 1,
        source_key = excluded.source_key,
        granted_at = datetime('now')
    `);

    const tx = db.transaction(() => {
      for (const store of config.stores) {
        insert.run(discordId, store.id, keyRow.key);
      }
    });
    tx();
    return;
  }

  db.prepare(`
    INSERT INTO ownership (discord_id, store_id, unlocks_all, source_key)
    VALUES (?, ?, 0, ?)
    ON CONFLICT(discord_id, store_id) DO UPDATE SET
      source_key = excluded.source_key,
      granted_at = datetime('now')
  `).run(discordId, keyRow.store_id, keyRow.key);
}

function redeemKey(key, discordId, username = null) {
  ensureUser(discordId, username);
  const keyRow = getKey(key);

  if (!keyRow) {
    return { ok: false, error: 'Invalid licence key.' };
  }
  if (keyRow.status === 'revoked') {
    return { ok: false, error: 'This licence key has been revoked.' };
  }
  if (keyRow.status === 'redeemed') {
    return { ok: false, error: 'This licence key has already been redeemed.' };
  }

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE licence_keys
      SET status = 'redeemed', redeemed_by = ?, redeemed_at = datetime('now')
      WHERE key = ?
    `).run(discordId, key);
    grantOwnership(discordId, keyRow);
  });

  tx();

  return { ok: true, key: getKey(key), ownership: getUserOwnership(discordId) };
}

function getUserOwnership(discordId) {
  return db.prepare(`
    SELECT * FROM ownership WHERE discord_id = ? ORDER BY granted_at DESC
  `).all(discordId);
}

function userOwnsStore(discordId, storeId) {
  const store = db.prepare(`
    SELECT 1 FROM ownership WHERE discord_id = ? AND store_id = ? LIMIT 1
  `).get(discordId, storeId);

  return Boolean(store);
}

function lookupUser(discordId) {
  const user = ensureUser(discordId);
  const ownership = getUserOwnership(discordId);
  const keys = db.prepare(`
    SELECT * FROM licence_keys WHERE redeemed_by = ? ORDER BY redeemed_at DESC
  `).all(discordId);
  const sales = db.prepare(`
    SELECT * FROM sales WHERE discord_id = ? ORDER BY created_at DESC
  `).all(discordId);

  return { user, ownership, keys, sales };
}

module.exports = {
  createKey,
  getKey,
  deleteKey,
  redeemKey,
  getUserOwnership,
  userOwnsStore,
  lookupUser,
  grantOwnership,
};
