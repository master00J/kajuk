const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { config } = require('../config');
const { formatMoney } = require('../utils/money');
const { successEmbed, infoEmbed } = require('../utils/embeds');
const { createReviewPrompt } = require('./reviews');

async function dmLicenceKey(client, discordId, { key, product, sale, newlyVip = false }) {
  try {
    const user = await client.users.fetch(discordId);
    const embed = successEmbed(
      'Purchase complete',
      [
        `Thanks for your purchase of **${product.name}**.`,
        '',
        `**Licence key:** \`${key.key}\``,
        `**Amount paid:** ${formatMoney(sale.amount_pence, sale.currency)}`,
        '',
        'Redeem with `/redeem` and then use your unlocked store access.',
        '',
        '_Barcode image generation is not included in this bot build._',
      ].join('\n'),
    );

    if (newlyVip) {
      embed.addFields({
        name: 'VIP unlocked',
        value: `You have spent ${formatMoney(config.vipThresholdPence)}+ and now receive a permanent **${config.vipDiscountPercent}%** discount.`,
      });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`review_prompt_${sale.id}`)
        .setLabel('Leave a review')
        .setStyle(ButtonStyle.Primary),
    );

    await user.send({ embeds: [embed], components: [row] });
    createReviewPrompt(sale.id, discordId);
    return true;
  } catch (error) {
    console.error(`Failed to DM licence key to ${discordId}:`, error.message);
    return false;
  }
}

async function dmCustomPaymentReceipt(client, discordId, amountPence) {
  try {
    const user = await client.users.fetch(discordId);
    await user.send({
      embeds: [
        successEmbed(
          'Payment received',
          `Your custom payment of **${formatMoney(amountPence)}** was received. A staff member will follow up if needed.`,
        ),
      ],
    });
    return true;
  } catch (error) {
    console.error(`Failed to DM custom payment receipt to ${discordId}:`, error.message);
    return false;
  }
}

async function logSale(client, saleResult) {
  if (!config.channels.sales) return;

  try {
    const channel = await client.channels.fetch(config.channels.sales);
    if (!channel?.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('New sale')
      .addFields(
        { name: 'Customer', value: `<@${saleResult.sale.discord_id}>`, inline: true },
        { name: 'Product', value: saleResult.product.name, inline: true },
        {
          name: 'Amount',
          value: formatMoney(saleResult.sale.amount_pence, saleResult.sale.currency),
          inline: true,
        },
        { name: 'Key', value: `\`${saleResult.key.key}\``, inline: false },
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Failed to log sale:', error.message);
  }
}

async function notifyOwnerDeliveryFallback(client, discordId, key) {
  if (!config.channels.log) return;
  try {
    const channel = await client.channels.fetch(config.channels.log);
    if (!channel?.isTextBased()) return;
    await channel.send({
      embeds: [
        infoEmbed(
          'DM delivery failed',
          `Could not DM <@${discordId}>. Licence key: \`${key}\`\nAsk them to enable DMs and re-send manually.`,
        ),
      ],
    });
  } catch (error) {
    console.error('Failed to post delivery fallback log:', error.message);
  }
}

module.exports = {
  dmLicenceKey,
  dmCustomPaymentReceipt,
  logSale,
  notifyOwnerDeliveryFallback,
};
