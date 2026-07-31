const { SlashCommandBuilder } = require('discord.js');
const { redeemKey } = require('../../services/licenses');
const { config } = require('../../config');
const { successEmbed, errorEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('redeem')
    .setDescription('Link a licence key to your account')
    .addStringOption((option) =>
      option
        .setName('key')
        .setDescription('Your licence key')
        .setRequired(true),
    ),

  async execute(interaction) {
    const key = interaction.options.getString('key', true).trim().toUpperCase();
    const result = redeemKey(key, interaction.user.id, interaction.user.username);

    if (!result.ok) {
      await interaction.reply({
        embeds: [errorEmbed('Redeem failed', result.error)],
        ephemeral: true,
      });
      return;
    }

    const storeNames = result.ownership
      .filter((row) => row.store_id)
      .map((row) => {
        const store = config.stores.find((s) => s.id === row.store_id);
        return store ? store.name : row.store_id;
      });

    const uniqueStores = [...new Set(storeNames)];

    await interaction.reply({
      embeds: [
        successEmbed(
          'Licence redeemed',
          [
            `Key \`${result.key.key}\` is now linked to your account.`,
            `**Product:** ${result.key.product_name}`,
            `**Unlocked stores:** ${uniqueStores.length ? uniqueStores.join(', ') : 'None'}`,
            '',
            '_Barcode generation is not included in this bot build. Store access is unlocked for when generation is added._',
          ].join('\n'),
        ),
      ],
      ephemeral: true,
    });
  },
};
