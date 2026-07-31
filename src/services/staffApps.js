const { db } = require('../database/db');
const { config } = require('../config');
const { infoEmbed } = require('../utils/embeds');
const { ensureUser } = require('./users');

function submitApplication({ discordId, age, experience, availability, why }) {
  ensureUser(discordId);
  const result = db.prepare(`
    INSERT INTO staff_applications (discord_id, age, experience, availability, why)
    VALUES (?, ?, ?, ?, ?)
  `).run(discordId, age, experience, availability, why);

  return db.prepare('SELECT * FROM staff_applications WHERE id = ?').get(result.lastInsertRowid);
}

async function postApplication(client, application) {
  if (!config.channels.staffApp) return;

  try {
    const channel = await client.channels.fetch(config.channels.staffApp);
    if (!channel?.isTextBased()) return;

    await channel.send({
      embeds: [
        infoEmbed(
          'New staff application',
          [
            `**Applicant:** <@${application.discord_id}>`,
            `**Age:** ${application.age}`,
            `**Experience:** ${application.experience}`,
            `**Availability:** ${application.availability}`,
            `**Why:** ${application.why}`,
          ].join('\n'),
        ),
      ],
    });
  } catch (error) {
    console.error('Failed to post staff application:', error.message);
  }
}

module.exports = { submitApplication, postApplication };
