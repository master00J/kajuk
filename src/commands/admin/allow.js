const { SlashCommandBuilder } = require('discord.js');
const { setPerms, getUserPerms, PERMS, hasPerm } = require('../../utils/permissions');
const { config } = require('../../config');
const { successEmbed, errorEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('allow')
    .setDescription('Grant staff permissions')
    .addUserOption((option) =>
      option.setName('user').setDescription('Staff member').setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('perms')
        .setDescription('Comma-separated permissions (admin,keys,sales,customers,panel,staff,stock)')
        .setRequired(true),
    ),

  async execute(interaction) {
    const canManage =
      config.ownerIds.includes(interaction.user.id) ||
      hasPerm(interaction.user.id, PERMS.ADMIN);

    if (!canManage) {
      await interaction.reply({
        embeds: [errorEmbed('No permission', 'Only owners/admins can grant permissions.')],
        ephemeral: true,
      });
      return;
    }

    const user = interaction.options.getUser('user', true);
    const raw = interaction.options.getString('perms', true);
    const perms = raw
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter((part) => Object.values(PERMS).includes(part));

    if (!perms.length) {
      await interaction.reply({
        embeds: [
          errorEmbed(
            'Invalid permissions',
            `Valid values: ${Object.values(PERMS).join(', ')}`,
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    setPerms(user.id, perms, interaction.user.id);

    await interaction.reply({
      embeds: [
        successEmbed(
          'Permissions updated',
          `<@${user.id}> now has: \`${getUserPerms(user.id).join(', ')}\``,
        ),
      ],
      ephemeral: true,
    });
  },
};
