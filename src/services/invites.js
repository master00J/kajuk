const { db } = require('../database/db');
const { ensureUser, getUser } = require('./users');
const { createKey } = require('./licenses');

function getInviteCode(discordId) {
  const user = ensureUser(discordId);
  return user.invite_code;
}

function trackInvite(inviterId, inviteeId) {
  if (inviterId === inviteeId) {
    return { ok: false, error: 'You cannot invite yourself.' };
  }

  ensureUser(inviterId);
  ensureUser(inviteeId);

  const existing = db.prepare('SELECT * FROM invite_tracking WHERE invitee_id = ?').get(inviteeId);
  if (existing) {
    return { ok: false, error: 'This user was already referred.' };
  }

  db.prepare(`
    INSERT INTO invite_tracking (inviter_id, invitee_id)
    VALUES (?, ?)
  `).run(inviterId, inviteeId);

  db.prepare(`
    UPDATE users SET invited_by = ?, updated_at = datetime('now') WHERE discord_id = ?
  `).run(inviterId, inviteeId);

  return { ok: true };
}

function rewardInviterIfEligible(inviterId, minInvites = 3) {
  const pending = db.prepare(`
    SELECT COUNT(*) AS count FROM invite_tracking
    WHERE inviter_id = ? AND rewarded = 0
  `).get(inviterId);

  if ((pending?.count || 0) < minInvites) {
    return null;
  }

  const key = createKey({
    productId: 'onestop',
    createdBy: 'invite_reward',
    note: `Invite reward for ${inviterId}`,
  });

  const pendingRows = db.prepare(`
    SELECT invitee_id FROM invite_tracking
    WHERE inviter_id = ? AND rewarded = 0
    ORDER BY created_at ASC
    LIMIT ?
  `).all(inviterId, minInvites);

  const markRewarded = db.prepare(`
    UPDATE invite_tracking SET rewarded = 1 WHERE invitee_id = ?
  `);
  const tx = db.transaction(() => {
    for (const row of pendingRows) {
      markRewarded.run(row.invitee_id);
    }
  });
  tx();

  db.prepare(`
    UPDATE users
    SET invite_rewards = invite_rewards + 1, updated_at = datetime('now')
    WHERE discord_id = ?
  `).run(inviterId);

  return key;
}

function getInviteStats(discordId) {
  const user = getUser(discordId) || ensureUser(discordId);
  const invites = db.prepare(`
    SELECT * FROM invite_tracking WHERE inviter_id = ? ORDER BY created_at DESC
  `).all(discordId);

  return {
    code: user.invite_code,
    total: invites.length,
    rewardedBatches: user.invite_rewards,
    invites,
  };
}

module.exports = {
  getInviteCode,
  trackInvite,
  rewardInviterIfEligible,
  getInviteStats,
};
