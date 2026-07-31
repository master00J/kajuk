const { config } = require('../config');
const { db } = require('../database/db');

const PERMS = {
  ADMIN: 'admin',
  KEYS: 'keys',
  SALES: 'sales',
  CUSTOMERS: 'customers',
  PANEL: 'panel',
  STAFF: 'staff',
  STOCK: 'stock',
};

function getUserPerms(discordId) {
  if (config.ownerIds.includes(discordId)) {
    return Object.values(PERMS);
  }

  const row = db
    .prepare('SELECT perms FROM staff_permissions WHERE discord_id = ?')
    .get(discordId);

  if (!row) return [];
  return row.perms.split(',').map((p) => p.trim()).filter(Boolean);
}

function hasPerm(discordId, perm) {
  const perms = getUserPerms(discordId);
  return perms.includes(PERMS.ADMIN) || perms.includes(perm);
}

function requirePerm(interaction, perm) {
  if (!hasPerm(interaction.user.id, perm)) {
    return false;
  }
  return true;
}

function setPerms(discordId, perms, grantedBy) {
  const value = [...new Set(perms)].join(',');
  db.prepare(`
    INSERT INTO staff_permissions (discord_id, perms, granted_by)
    VALUES (?, ?, ?)
    ON CONFLICT(discord_id) DO UPDATE SET
      perms = excluded.perms,
      granted_by = excluded.granted_by,
      granted_at = datetime('now')
  `).run(discordId, value, grantedBy);
}

module.exports = { PERMS, getUserPerms, hasPerm, requirePerm, setPerms };
