const { SlashCommandBuilder } = require('discord.js');
const { getActiveProducts, calculatePrice, getActiveFlashSale } = require('../../services/pricing');
const { formatMoney } = require('../../utils/money');
const { infoEmbed } = require('../../utils/embeds');
const { config } = require('../../config');
const { getUser } = require('../../services/users');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('prices')
    .setDescription('View pricing'),

  async execute(interaction) {
    const products = getActiveProducts();
    const flashSales = getActiveFlashSale();
    const user = getUser(interaction.user.id);

    const lines = products.map((product) => {
      const priced = calculatePrice(product.id, interaction.user.id);
      if (priced.discountPercent) {
        return `• **${product.name}** — ~~${formatMoney(priced.basePence)}~~ **${formatMoney(priced.finalPence)}** (-${priced.discountPercent}%)`;
      }
      return `• **${product.name}** — **${formatMoney(priced.finalPence)}**`;
    });

    const flashLines = flashSales.length
      ? flashSales.map((sale) => {
        const target = sale.product_id || 'All products';
        return `• ${sale.discount_percent}% off **${target}** until <t:${Math.floor(new Date(sale.ends_at).getTime() / 1000)}:R>${sale.label ? ` — ${sale.label}` : ''}`;
      })
      : ['_No active flash sales._'];

    await interaction.reply({
      embeds: [
        infoEmbed(
          'Pricing',
          [
            ...lines,
            '',
            '**Flash sales**',
            ...flashLines,
            '',
            `**VIP:** Spend ${formatMoney(config.vipThresholdPence)}+ for a permanent ${config.vipDiscountPercent}% discount.`,
            user?.is_vip ? '_You currently have VIP pricing._' : '_You are not VIP yet._',
          ].join('\n'),
        ),
      ],
      ephemeral: true,
    });
  },
};
