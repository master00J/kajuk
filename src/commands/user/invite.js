const { SlashCommandBuilder } = require('discord.js');
const { getInviteStats, trackInvite, rewardInviterIfEligible } = require('../../services/invites');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('invite')
    .setDescription('Invite rewards system')
    .addSubcommand((sub) =>
      sub.setName('code').setDescription('Get your invite code'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('claim')
        .setDescription('Claim an invite code from a friend')
        .addStringOption((option) =>
          option.setName('code').setDescription('Invite code').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('stats').setDescription('View your invite stats'),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'code' || sub === 'stats') {
      const stats = getInviteStats(interaction.user.id);
      await interaction.reply({
        embeds: [
          infoEmbed(
            'Invite rewards',
            [
              `**Your code:** \`${stats.code}\``,
              `**Successful invites:** ${stats.total}`,
              `**Reward batches claimed:** ${stats.rewardedBatches}`,
              '',
              'Earn a free One Stop key for every **3** friends who claim your code.',
              'Friends use `/invite claim <code>`.',
            ].join('\n'),
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    if (sub === 'claim') {
      const code = interaction.options.getString('code', true).trim().toLowerCase();
      const { db } = require('../../database/db');
      const inviter = db.prepare('SELECT * FROM users WHERE invite_code = ?').get(code);

      if (!inviter) {
        await interaction.reply({
          embeds: [errorEmbed('Invalid code', 'That invite code was not found.')],
          ephemeral: true,
        });
        return;
      }

      const tracked = trackInvite(inviter.discord_id, interaction.user.id);
      if (!tracked.ok) {
        await interaction.reply({
          embeds: [errorEmbed('Claim failed', tracked.error)],
          ephemeral: true,
        });
        return;
      }

      const reward = rewardInviterIfEligible(inviter.discord_id);
      if (reward) {
        try {
          const user = await interaction.client.users.fetch(inviter.discord_id);
          await user.send({
            embeds: [
              successEmbed(
                'Invite reward',
                `You earned a reward key for inviting friends: \`${reward.key}\`\nRedeem it with \`/redeem\`.`,
              ),
            ],
          });
        } catch {
          // Ignore DM failures for rewards
        }
      }

      await interaction.reply({
        embeds: [
          successEmbed(
            'Invite claimed',
            `You claimed <@${inviter.discord_id}>'s invite. Thanks for joining!`,
          ),
        ],
        ephemeral: true,
      });
    }
  },
};
