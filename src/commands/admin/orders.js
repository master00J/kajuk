const { SlashCommandBuilder } = require('discord.js');
const {
  listOrders,
  getOrderByReference,
  getOrderById,
  confirmOrder,
  rejectOrder,
} = require('../../services/revolutOrders');
const { requirePerm, PERMS } = require('../../utils/permissions');
const { formatMoney } = require('../../utils/money');
const { infoEmbed, successEmbed, errorEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('orders')
    .setDescription('Manage Revolut payment orders')
    .addSubcommand((sub) =>
      sub
        .setName('pending')
        .setDescription('List orders awaiting payment or confirmation'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('check')
        .setDescription('Check an order by reference or ID')
        .addStringOption((option) =>
          option
            .setName('reference')
            .setDescription('Order reference (ORD-XXXXXX) or numeric ID')
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('confirm')
        .setDescription('Confirm a Revolut payment and deliver the licence key')
        .addStringOption((option) =>
          option
            .setName('reference')
            .setDescription('Order reference (ORD-XXXXXX) or numeric ID')
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('reject')
        .setDescription('Reject a Revolut payment claim')
        .addStringOption((option) =>
          option
            .setName('reference')
            .setDescription('Order reference (ORD-XXXXXX) or numeric ID')
            .setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('reason').setDescription('Optional reason').setRequired(false),
        ),
    ),

  async execute(interaction) {
    if (!requirePerm(interaction, PERMS.SALES)) {
      await interaction.reply({
        embeds: [errorEmbed('No permission', 'You do not have permission to manage orders.')],
        ephemeral: true,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'pending') {
      const awaitingPayment = listOrders('awaiting_payment', 15);
      const awaitingConfirmation = listOrders('awaiting_confirmation', 15);
      const rows = [...awaitingConfirmation, ...awaitingPayment];

      const body = rows.length
        ? rows
          .map(
            (order) =>
              `• \`${order.reference}\` — <@${order.discord_id}> — **${order.product_name}** — ${formatMoney(order.amount_pence)} — \`${order.status}\``,
          )
          .join('\n')
        : '_No open Revolut orders._';

      await interaction.reply({
        embeds: [infoEmbed('Open Revolut orders', body)],
        ephemeral: true,
      });
      return;
    }

    const raw = interaction.options.getString('reference', true).trim();
    const order = resolveOrder(raw);
    if (!order) {
      await interaction.reply({
        embeds: [errorEmbed('Not found', 'No order found for that reference/ID.')],
        ephemeral: true,
      });
      return;
    }

    if (sub === 'check') {
      await interaction.reply({
        embeds: [
          infoEmbed(
            `Order ${order.reference}`,
            [
              `**ID:** ${order.id}`,
              `**Customer:** <@${order.discord_id}>`,
              `**Product:** ${order.product_name}`,
              `**Amount:** ${formatMoney(order.amount_pence)}`,
              `**Status:** ${order.status}`,
              `**Created:** ${order.created_at}`,
              order.paid_at ? `**Marked paid:** ${order.paid_at}` : null,
              order.confirmed_by ? `**Handled by:** <@${order.confirmed_by}>` : null,
              order.sale_id ? `**Sale ID:** ${order.sale_id}` : null,
            ].filter(Boolean).join('\n'),
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    if (sub === 'confirm') {
      await interaction.deferReply({ ephemeral: true });
      const result = await confirmOrder(interaction.client, order.id, interaction.user.id);
      if (!result.ok) {
        await interaction.editReply({
          embeds: [errorEmbed('Confirm failed', result.error)],
        });
        return;
      }

      await interaction.editReply({
        embeds: [
          successEmbed(
            'Order confirmed',
            [
              `Order \`${result.order.reference}\` marked as paid via Revolut.`,
              `Licence key: \`${result.saleResult.key.key}\``,
              result.delivered
                ? 'Key was DMd to the customer.'
                : 'DM failed — key is logged for manual delivery.',
            ].join('\n'),
          ),
        ],
      });
      return;
    }

    if (sub === 'reject') {
      const reason = interaction.options.getString('reason');
      const result = rejectOrder(order.id, interaction.user.id, reason);
      if (!result.ok) {
        await interaction.reply({
          embeds: [errorEmbed('Reject failed', result.error)],
          ephemeral: true,
        });
        return;
      }

      try {
        const user = await interaction.client.users.fetch(order.discord_id);
        await user.send({
          embeds: [
            errorEmbed(
              'Payment not confirmed',
              [
                `Your order \`${order.reference}\` was rejected.`,
                reason ? `**Reason:** ${reason}` : 'Please contact staff if you believe this is a mistake.',
              ].join('\n'),
            ),
          ],
        });
      } catch {
        // ignore DM failures
      }

      await interaction.reply({
        embeds: [
          successEmbed(
            'Order rejected',
            `Order \`${order.reference}\` was rejected.`,
          ),
        ],
        ephemeral: true,
      });
    }
  },
};

function resolveOrder(raw) {
  if (/^\d+$/.test(raw)) {
    return getOrderById(Number(raw));
  }
  return getOrderByReference(raw);
}
