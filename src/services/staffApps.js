const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');
const { db } = require('../database/db');
const { config } = require('../config');
const { ensureUser } = require('./users');
const { setPerms, PERMS } = require('../utils/permissions');
const { COLORS } = require('../utils/embeds');

function getApplication(id) {
  return db.prepare('SELECT * FROM staff_applications WHERE id = ?').get(id) || null;
}

function getPendingForUser(discordId) {
  return db.prepare(`
    SELECT * FROM staff_applications
    WHERE discord_id = ? AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 1
  `).get(discordId) || null;
}

function submitApplication({ discordId, age, experience, availability, why }) {
  ensureUser(discordId);

  const existing = getPendingForUser(discordId);
  if (existing) {
    return { ok: false, error: 'You already have a pending staff application.', application: existing };
  }

  const result = db.prepare(`
    INSERT INTO staff_applications (discord_id, age, experience, availability, why, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `).run(discordId, age, experience, availability, why);

  return {
    ok: true,
    application: getApplication(result.lastInsertRowid),
  };
}

function getVotes(applicationId) {
  return db.prepare(`
    SELECT * FROM staff_application_votes
    WHERE application_id = ?
    ORDER BY created_at ASC
  `).all(applicationId);
}

function getVoteCounts(applicationId) {
  const votes = getVotes(applicationId);
  const yes = votes.filter((vote) => vote.vote === 'yes');
  const no = votes.filter((vote) => vote.vote === 'no');
  return { votes, yes, no, yesCount: yes.length, noCount: no.length };
}

function formatVoters(list) {
  if (!list.length) return '_None_';
  return list.map((vote) => `<@${vote.voter_id}>`).join(', ');
}

function buildApplicationEmbed(application) {
  const { yes, no, yesCount, noCount } = getVoteCounts(application.id);
  const statusLabel = application.status.toUpperCase();

  let color = COLORS.warn;
  if (application.status === 'approved') color = COLORS.primary;
  if (application.status === 'denied') color = COLORS.danger;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`Staff application #${application.id}`)
    .setDescription(
      [
        `**Applicant:** <@${application.discord_id}>`,
        `**Status:** \`${statusLabel}\``,
        `**Age:** ${application.age}`,
        `**Availability:** ${application.availability}`,
        '',
        `**Experience**\n${application.experience}`,
        '',
        `**Why**\n${application.why}`,
      ].join('\n'),
    )
    .addFields(
      {
        name: `Votes yes (${yesCount})`,
        value: formatVoters(yes),
        inline: false,
      },
      {
        name: `Votes no (${noCount})`,
        value: formatVoters(no),
        inline: false,
      },
    )
    .setFooter({ text: `Application ID: ${application.id}` })
    .setTimestamp(new Date(application.created_at));

  if (application.decided_by) {
    embed.addFields({
      name: 'Decision',
      value: `Handled by <@${application.decided_by}>${application.decision_note ? `\n${application.decision_note}` : ''}`,
    });
  }

  return embed;
}

function buildApplicationComponents(application) {
  if (application.status !== 'pending') {
    return [];
  }

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`staffapp_vote_yes_${application.id}`)
        .setLabel('Vote yes')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`staffapp_vote_no_${application.id}`)
        .setLabel('Vote no')
        .setStyle(ButtonStyle.Danger),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`staffapp_approve_${application.id}`)
        .setLabel('Approve')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`staffapp_deny_${application.id}`)
        .setLabel('Deny')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

async function postApplication(client, application) {
  if (!config.channels.staffApp) {
    console.warn('STAFF_APP_CHANNEL_ID is not set — staff applications will not be posted.');
    return null;
  }

  const channel = await client.channels.fetch(config.channels.staffApp);
  if (!channel?.isTextBased()) return null;

  const message = await channel.send({
    content: 'New staff application — vote below, then approve or deny.',
    embeds: [buildApplicationEmbed(application)],
    components: buildApplicationComponents(application),
  });

  db.prepare(`
    UPDATE staff_applications
    SET message_id = ?, channel_id = ?
    WHERE id = ?
  `).run(message.id, channel.id, application.id);

  return message;
}

async function refreshApplicationMessage(client, applicationId) {
  const application = getApplication(applicationId);
  if (!application?.message_id || !application.channel_id) return application;

  try {
    const channel = await client.channels.fetch(application.channel_id);
    if (!channel?.isTextBased()) return application;
    const message = await channel.messages.fetch(application.message_id);
    await message.edit({
      embeds: [buildApplicationEmbed(application)],
      components: buildApplicationComponents(application),
    });
  } catch (error) {
    console.error('Failed to refresh staff application message:', error.message);
  }

  return application;
}

function castVote(applicationId, voterId, vote) {
  const application = getApplication(applicationId);
  if (!application) return { ok: false, error: 'Application not found.' };
  if (application.status !== 'pending') {
    return { ok: false, error: 'This application is already closed.' };
  }
  if (application.discord_id === voterId) {
    return { ok: false, error: 'You cannot vote on your own application.' };
  }
  if (vote !== 'yes' && vote !== 'no') {
    return { ok: false, error: 'Invalid vote.' };
  }

  db.prepare(`
    INSERT INTO staff_application_votes (application_id, voter_id, vote)
    VALUES (?, ?, ?)
    ON CONFLICT(application_id, voter_id) DO UPDATE SET
      vote = excluded.vote,
      created_at = datetime('now')
  `).run(applicationId, voterId, vote);

  return {
    ok: true,
    application: getApplication(applicationId),
    counts: getVoteCounts(applicationId),
  };
}

async function decideApplication(client, applicationId, staffId, decision, note = null) {
  const application = getApplication(applicationId);
  if (!application) return { ok: false, error: 'Application not found.' };
  if (application.status !== 'pending') {
    return { ok: false, error: `Application is already ${application.status}.` };
  }
  if (decision !== 'approved' && decision !== 'denied') {
    return { ok: false, error: 'Invalid decision.' };
  }

  db.prepare(`
    UPDATE staff_applications
    SET status = ?,
        decided_by = ?,
        decided_at = datetime('now'),
        decision_note = ?
    WHERE id = ?
  `).run(decision, staffId, note, applicationId);

  if (decision === 'approved') {
    setPerms(application.discord_id, [PERMS.STAFF], staffId);
  }

  const updated = getApplication(applicationId);
  await refreshApplicationMessage(client, applicationId);

  try {
    const user = await client.users.fetch(application.discord_id);
    if (decision === 'approved') {
      await user.send({
        content: 'Your staff application has been **approved**. Welcome to the team — an admin may still assign extra permissions with `/allow`.',
      });
    } else {
      await user.send({
        content: [
          'Your staff application has been **denied**.',
          note ? `Reason: ${note}` : 'You can apply again later if you want.',
        ].join('\n'),
      });
    }
  } catch {
    // Applicant DMs closed
  }

  return { ok: true, application: updated };
}

module.exports = {
  getApplication,
  getPendingForUser,
  submitApplication,
  postApplication,
  castVote,
  decideApplication,
  refreshApplicationMessage,
  getVoteCounts,
  buildApplicationEmbed,
  buildApplicationComponents,
};
