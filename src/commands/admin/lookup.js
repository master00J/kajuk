const { SlashCommandBuilder } = require('discord.js');
const { lookupUser } = require('../../services/licenses');
const { requirePerm, PERMS } = require('../../utils/permissions');
const { config } = require('../../config');
const { formatMoney } = require('../../utils/money');
const { infoEmbed, errorEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lookup')
    .setDescription('See what a user owns')
    .addUserOption((option) =>
      option.setName('user').setDescription('User to look up').setRequired(true),
    ),

  async execute(interaction) {
    if (!requirePerm(interaction, PERMS.CUSTOMERS)) {
      await interaction.reply({
        embeds: [errorEmbed('No permission', 'You do not have permission to look up users.')],
        ephemeral: true,
      });
      return;
    }

    const user = interaction.options.getUser('user', true);
    const data = lookupUser(user.id);

    const stores = data.ownership
      .filter((row) => row.store_id)
      .map((row) => {
        const store = config.stores.find((s) => s.id === row.store_id);
        return store ? store.name : row.store_id;
      });

    const uniqueStores = [...new Set(stores)];

    await interaction.reply({
      embeds: [
        infoEmbed(
          `Lookup: ${user.username}`,
          [
            `**Discord:** <@${user.id}>`,
            `**Total spent:** ${formatMoney(data.user.total_spent_pence)}`,
            `**VIP:** ${data.user.is_vip ? 'Yes' : 'No'}`,
            `**Stores:** ${uniqueStores.length ? uniqueStores.join(', ') : 'None'}`,
            `**Redeemed keys:** ${data.keys.length}`,
            `**Sales:** ${data.sales.length}`,
            '',
            data.keys.length
              ? data.keys
                .slice(0, 10)
                .map((key) => `• \`${key.key}\` — ${key.status} — ${key.product_id}`)
                .join('\n')
              : '_No redeemed keys._',
          ].join('\n'),
        ),
      ],
      ephemeral: true,
    });
  },
};
