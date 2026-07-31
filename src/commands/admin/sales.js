const { SlashCommandBuilder } = require('discord.js');
const { getSalesStats, getTodaySales } = require('../../services/sales');
const { requirePerm, PERMS } = require('../../utils/permissions');
const { formatMoney } = require('../../utils/money');
const { infoEmbed, errorEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sales')
    .setDescription('View sales data')
    .addSubcommand((sub) =>
      sub.setName('stats').setDescription('View revenue + sales breakdown'),
    )
    .addSubcommand((sub) =>
      sub.setName('today').setDescription("Today's sales"),
    ),

  async execute(interaction) {
    if (!requirePerm(interaction, PERMS.SALES)) {
      await interaction.reply({
        embeds: [errorEmbed('No permission', 'You do not have permission to view sales.')],
        ephemeral: true,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'stats') {
      const stats = getSalesStats();
      const byProduct = stats.byProduct.length
        ? stats.byProduct
          .map((row) => `• **${row.name}** — ${row.count} sales — ${formatMoney(row.revenue_pence)}`)
          .join('\n')
        : '_No sales yet._';

      await interaction.reply({
        embeds: [
          infoEmbed(
            'Sales stats',
            [
              `**Total sales:** ${stats.totals.total_sales}`,
              `**Revenue:** ${formatMoney(stats.totals.revenue_pence)}`,
              `**Discounts given:** ${formatMoney(stats.totals.discount_pence)}`,
              '',
              '**By product**',
              byProduct,
            ].join('\n'),
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    if (sub === 'today') {
      const today = getTodaySales();
      const revenue = today.reduce((sum, sale) => sum + sale.amount_pence, 0);
      const lines = today.length
        ? today
          .map(
            (sale) =>
              `• ${sale.product_name} — ${formatMoney(sale.amount_pence)} — <@${sale.discord_id}>`,
          )
          .join('\n')
        : '_No sales today._';

      await interaction.reply({
        embeds: [
          infoEmbed(
            "Today's sales",
            [
              `**Count:** ${today.length}`,
              `**Revenue:** ${formatMoney(revenue)}`,
              '',
              lines,
            ].join('\n'),
          ),
        ],
        ephemeral: true,
      });
    }
  },
};
