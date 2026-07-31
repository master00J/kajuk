const { SlashCommandBuilder } = require('discord.js');
const { getActiveProducts, setProductPrice } = require('../../services/pricing');
const { poundsToPence, formatMoney } = require('../../utils/money');
const { requirePerm, PERMS } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setprice')
    .setDescription('Set custom pricing for a product')
    .addStringOption((option) => {
      option
        .setName('product')
        .setDescription('Product')
        .setRequired(true);

      for (const product of getActiveProducts()) {
        option.addChoices({ name: product.name, value: product.id });
      }
      return option;
    })
    .addNumberOption((option) =>
      option
        .setName('amount')
        .setDescription('New price in pounds')
        .setRequired(true)
        .setMinValue(0.5),
    ),

  async execute(interaction) {
    if (!requirePerm(interaction, PERMS.SALES)) {
      await interaction.reply({
        embeds: [errorEmbed('No permission', 'You do not have permission to change prices.')],
        ephemeral: true,
      });
      return;
    }

    const productId = interaction.options.getString('product', true);
    const amount = interaction.options.getNumber('amount', true);
    const product = setProductPrice(productId, poundsToPence(amount));

    if (!product) {
      await interaction.reply({
        embeds: [errorEmbed('Not found', 'Product not found.')],
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      embeds: [
        successEmbed(
          'Price updated',
          `**${product.name}** is now **${formatMoney(product.price_pence)}**.`,
        ),
      ],
      ephemeral: true,
    });
  },
};
