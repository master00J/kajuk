const { db } = require('../database/db');
const { config } = require('../config');
const { infoEmbed } = require('../utils/embeds');

function createReviewPrompt(saleId, discordId) {
  db.prepare(`
    INSERT OR IGNORE INTO review_prompts (sale_id, discord_id)
    VALUES (?, ?)
  `).run(saleId, discordId);
}

function submitReview({ discordId, rating, comment = null, saleId = null }) {
  const result = db.prepare(`
    INSERT INTO reviews (discord_id, rating, comment, prompted_sale_id)
    VALUES (?, ?, ?, ?)
  `).run(discordId, rating, comment, saleId);

  if (saleId) {
    db.prepare(`
      UPDATE review_prompts SET completed = 1 WHERE sale_id = ?
    `).run(saleId);
  }

  return db.prepare('SELECT * FROM reviews WHERE id = ?').get(result.lastInsertRowid);
}

async function postReview(client, review) {
  if (!config.channels.review) return;

  try {
    const channel = await client.channels.fetch(config.channels.review);
    if (!channel?.isTextBased()) return;

    const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
    await channel.send({
      embeds: [
        infoEmbed(
          'New review',
          [
            `**From:** <@${review.discord_id}>`,
            `**Rating:** ${stars} (${review.rating}/5)`,
            review.comment ? `**Comment:** ${review.comment}` : '_No comment_',
          ].join('\n'),
        ),
      ],
    });
  } catch (error) {
    console.error('Failed to post review:', error.message);
  }
}

module.exports = { createReviewPrompt, submitReview, postReview };
