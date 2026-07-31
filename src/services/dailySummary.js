const cron = require('node-cron');
const { config } = require('../config');
const { getTodaySales, getSalesStats } = require('./sales');
const { formatMoney } = require('../utils/money');
const { infoEmbed } = require('../utils/embeds');

function startDailySummary(client) {
  // Midnight Europe/London
  cron.schedule(
    '0 0 * * *',
    async () => {
      if (!config.channels.sales) return;

      try {
        const channel = await client.channels.fetch(config.channels.sales);
        if (!channel?.isTextBased()) return;

        const today = getTodaySales();
        const revenue = today.reduce((sum, sale) => sum + sale.amount_pence, 0);
        const stats = getSalesStats();

        const lines = today.length
          ? today
            .slice(0, 15)
            .map(
              (sale) =>
                `• ${sale.product_name} — ${formatMoney(sale.amount_pence)} — <@${sale.discord_id}>`,
            )
            .join('\n')
          : '_No sales today._';

        await channel.send({
          embeds: [
            infoEmbed(
              'Daily sales summary',
              [
                `**Today's sales:** ${today.length}`,
                `**Today's revenue:** ${formatMoney(revenue)}`,
                `**All-time sales:** ${stats.totals.total_sales}`,
                `**All-time revenue:** ${formatMoney(stats.totals.revenue_pence)}`,
                '',
                lines,
              ].join('\n'),
            ),
          ],
        });
      } catch (error) {
        console.error('Daily summary failed:', error.message);
      }
    },
    { timezone: 'Europe/London' },
  );
}

module.exports = { startDailySummary };
