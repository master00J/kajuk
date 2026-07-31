const { SlashCommandBuilder } = require('discord.js');
const { config } = require('../../config');
const { getUserPerms, isOwner } = require('../../utils/permissions');
const { infoEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('whoami')
    .setDescription('Show your Discord ID and bot permissions'),

  async execute(interaction) {
    const owner = isOwner(interaction.user.id);
    const perms = getUserPerms(interaction.user.id);

    await interaction.reply({
      embeds: [
        infoEmbed(
          'Your bot access',
          [
            `**User:** <@${interaction.user.id}>`,
            `**Discord ID:** \`${interaction.user.id}\``,
            `**Owner:** ${owner ? 'yes' : 'no'}`,
            `**Permissions:** ${perms.length ? perms.join(', ') : 'none'}`,
            `**Owners loaded by bot:** ${config.ownerIds.length}`,
            config.ownerIds.length
              ? `**Configured owner IDs:** ${config.ownerIds.map((id) => `\`${id}\``).join(', ')}`
              : '**Configured owner IDs:** _none — set OWNER_IDS on the host_',
          ].join('\n'),
        ),
      ],
      ephemeral: true,
    });
  },
};
