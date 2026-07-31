const { db } = require('../database/db');

/**
 * Generation leaderboard storage.
 * Barcode image generation is intentionally not implemented in this build,
 * but stats can still be recorded later when generation is added.
 */
function incrementGeneration(discordId, storeId) {
  db.prepare(`
    INSERT INTO generation_stats (discord_id, store_id, count, last_generated_at)
    VALUES (?, ?, 1, datetime('now'))
    ON CONFLICT(discord_id, store_id) DO UPDATE SET
      count = count + 1,
      last_generated_at = datetime('now')
  `).run(discordId, storeId);
}

function getLeaderboard(limit = 10) {
  return db.prepare(`
    SELECT gs.discord_id, u.username, SUM(gs.count) AS total
    FROM generation_stats gs
    LEFT JOIN users u ON u.discord_id = gs.discord_id
    GROUP BY gs.discord_id
    ORDER BY total DESC
    LIMIT ?
  `).all(limit);
}

module.exports = { incrementGeneration, getLeaderboard };
