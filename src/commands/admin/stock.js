const { SlashCommandBuilder } = require('discord.js');
const { addStock, deliverNextAccount, stockCounts } = require('../../services/stock');
const { requirePerm, PERMS } = require('../../utils/permissions');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stock')
    .setDescription('Manage account stock pool')
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Add credentials to the stock pool')
        .addStringOption((option) =>
          option.setName('label').setDescription('Product label').setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('credentials').setDescription('Account credentials').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('deliver')
        .setDescription('Auto-deliver next available account')
        .addStringOption((option) =>
          option.setName('label').setDescription('Product label').setRequired(true),
        )
        .addUserOption((option) =>
          option.setName('user').setDescription('Customer').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('View stock counts'),
    ),

  async execute(interaction) {
    if (!requirePerm(interaction, PERMS.STOCK)) {
      await interaction.reply({
        embeds: [errorEmbed('No permission', 'You do not have permission to manage stock.')],
        ephemeral: true,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const label = interaction.options.getString('label', true);
      const credentials = interaction.options.getString('credentials', true);
      const item = addStock(label, credentials);

      await interaction.reply({
        embeds: [
          successEmbed(
            'Stock added',
            `Added account #${item.id} under **${item.product_label}**.`,
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    if (sub === 'deliver') {
      const label = interaction.options.getString('label', true);
      const user = interaction.options.getUser('user', true);
      const item = deliverNextAccount(label, user.id);

      if (!item) {
        await interaction.reply({
          embeds: [errorEmbed('Out of stock', `No available accounts for **${label}**.`)],
          ephemeral: true,
        });
        return;
      }

      try {
        await user.send({
          embeds: [
            successEmbed(
              'Account delivery',
              [
                `Here are your **${item.product_label}** credentials:`,
                '',
                `\`\`\`\n${item.credentials}\n\`\`\``,
              ].join('\n'),
            ),
          ],
        });
      } catch {
        await interaction.reply({
          embeds: [
            errorEmbed(
              'DM failed',
              `Account #${item.id} was reserved/delivered in DB but DM failed.\nCredentials: ||${item.credentials}||`,
            ),
          ],
          ephemeral: true,
        });
        return;
      }

      await interaction.reply({
        embeds: [
          successEmbed(
            'Account delivered',
            `Delivered **${item.product_label}** account #${item.id} to <@${user.id}>.`,
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    if (sub === 'list') {
      const rows = stockCounts();
      const body = rows.length
        ? rows
          .map((row) => `• **${row.product_label}** — available: ${row.available}, delivered: ${row.delivered}`)
          .join('\n')
        : '_Stock pool is empty._';

      await interaction.reply({
        embeds: [infoEmbed('Account stock', body)],
        ephemeral: true,
      });
    }
  },
};
