const { SlashCommandBuilder } = require('discord.js');
const { getKey, deleteKey } = require('../../services/licenses');
const { requirePerm, PERMS } = require('../../utils/permissions');
const { infoEmbed, successEmbed, errorEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('key')
    .setDescription('Manage licence keys')
    .addSubcommand((sub) =>
      sub
        .setName('check')
        .setDescription("Check a key's status")
        .addStringOption((option) =>
          option.setName('key').setDescription('Licence key').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('Revoke a key')
        .addStringOption((option) =>
          option.setName('key').setDescription('Licence key').setRequired(true),
        ),
    ),

  async execute(interaction) {
    if (!requirePerm(interaction, PERMS.KEYS)) {
      await interaction.reply({
        embeds: [errorEmbed('No permission', 'You do not have permission to manage keys.')],
        ephemeral: true,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();
    const keyValue = interaction.options.getString('key', true).trim().toUpperCase();

    if (sub === 'check') {
      const key = getKey(keyValue);
      if (!key) {
        await interaction.reply({
          embeds: [errorEmbed('Not found', 'That key does not exist.')],
          ephemeral: true,
        });
        return;
      }

      await interaction.reply({
        embeds: [
          infoEmbed(
            'Key status',
            [
              `**Key:** \`${key.key}\``,
              `**Product:** ${key.product_name}`,
              `**Status:** ${key.status}`,
              `**Created by:** ${key.created_by || 'unknown'}`,
              `**Created at:** ${key.created_at}`,
              key.redeemed_by ? `**Redeemed by:** <@${key.redeemed_by}>` : '**Redeemed by:** —',
              key.redeemed_at ? `**Redeemed at:** ${key.redeemed_at}` : null,
              key.note ? `**Note:** ${key.note}` : null,
            ].filter(Boolean).join('\n'),
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    if (sub === 'delete') {
      const key = deleteKey(keyValue);
      if (!key) {
        await interaction.reply({
          embeds: [errorEmbed('Not found', 'That key does not exist.')],
          ephemeral: true,
        });
        return;
      }

      await interaction.reply({
        embeds: [
          successEmbed(
            'Key revoked',
            `Key \`${key.key}\` is now **${key.status}**. Linked ownership from this key was removed.`,
          ),
        ],
        ephemeral: true,
      });
    }
  },
};
