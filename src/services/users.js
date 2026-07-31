const { db } = require('../database/db');
const { config } = require('../config');
const crypto = require('crypto');

function ensureUser(discordId, username = null) {
  const existing = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(discordId);
  if (existing) {
    if (username && existing.username !== username) {
      db.prepare(`
        UPDATE users SET username = ?, updated_at = datetime('now') WHERE discord_id = ?
      `).run(username, discordId);
      return db.prepare('SELECT * FROM users WHERE discord_id = ?').get(discordId);
    }
    return existing;
  }

  const inviteCode = crypto.randomBytes(4).toString('hex');
  db.prepare(`
    INSERT INTO users (discord_id, username, invite_code)
    VALUES (?, ?, ?)
  `).run(discordId, username, inviteCode);

  return db.prepare('SELECT * FROM users WHERE discord_id = ?').get(discordId);
}

function addSpend(discordId, amountPence) {
  ensureUser(discordId);
  db.prepare(`
    UPDATE users
    SET total_spent_pence = total_spent_pence + ?,
        updated_at = datetime('now')
    WHERE discord_id = ?
  `).run(amountPence, discordId);

  const user = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(discordId);
  if (!user.is_vip && user.total_spent_pence >= config.vipThresholdPence) {
    db.prepare(`
      UPDATE users
      SET is_vip = 1, vip_since = datetime('now'), updated_at = datetime('now')
      WHERE discord_id = ?
    `).run(discordId);
    return { ...user, is_vip: 1, newlyVip: true };
  }

  return user;
}

function getUser(discordId) {
  return db.prepare('SELECT * FROM users WHERE discord_id = ?').get(discordId) || null;
}

function listCustomers(limit = 50) {
  return db.prepare(`
    SELECT * FROM users
    WHERE total_spent_pence > 0 OR discord_id IN (SELECT DISTINCT redeemed_by FROM licence_keys WHERE redeemed_by IS NOT NULL)
    ORDER BY total_spent_pence DESC, created_at DESC
    LIMIT ?
  `).all(limit);
}

module.exports = { ensureUser, addSpend, getUser, listCustomers };
