const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');
const buy = require('../commands/user/buy');
const apply = require('../commands/user/apply');
const prices = require('../commands/user/prices');
const info = require('../commands/user/info');
const { submitReview, postReview } = require('../services/reviews');
const {
  markPaidByCustomer,
  cancelOrder,
  notifyStaffPendingPayment,
  confirmOrder,
  rejectOrder,
  getOrderById,
} = require('../services/revolutOrders');
const { hasPerm, PERMS } = require('../utils/permissions');
const { errorEmbed, successEmbed, warnEmbed } = require('../utils/embeds');

async function handleInteraction(interaction, commands) {
  try {
    if (interaction.isChatInputCommand()) {
      const command = commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction);
      return;
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'buy_select_product') {
        await buy.handleSelect(interaction);
      }
      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId === 'panel_buy') {
        await buy.execute(interaction);
        return;
      }

      if (interaction.customId === 'panel_prices') {
        await prices.execute(interaction);
        return;
      }

      if (interaction.customId === 'panel_info') {
        await info.execute(interaction);
        return;
      }

      if (interaction.customId.startsWith('revolut_paid_')) {
        const orderId = Number(interaction.customId.replace('revolut_paid_', ''));
        const result = markPaidByCustomer(orderId, interaction.user.id);

        if (!result.ok) {
          await interaction.reply({
            embeds: [errorEmbed('Could not mark as paid', result.error)],
            ephemeral: true,
          });
          return;
        }

        if (!result.alreadyMarked) {
          await notifyStaffPendingPayment(interaction.client, result.order);
        }

        await interaction.reply({
          embeds: [
            successEmbed(
              result.alreadyMarked ? 'Already submitted' : 'Payment submitted',
              [
                `Order \`${result.order.reference}\` is waiting for staff confirmation.`,
                'Once verified in Revolut, your licence key will be DMd to you.',
              ].join('\n'),
            ),
          ],
          ephemeral: true,
        });
        return;
      }

      if (interaction.customId.startsWith('revolut_cancel_')) {
        const orderId = Number(interaction.customId.replace('revolut_cancel_', ''));
        const result = cancelOrder(orderId, interaction.user.id);

        if (!result.ok) {
          await interaction.reply({
            embeds: [errorEmbed('Cancel failed', result.error)],
            ephemeral: true,
          });
          return;
        }

        await interaction.update({
          embeds: [
            warnEmbed(
              'Order cancelled',
              `Order \`${result.order.reference}\` was cancelled. Use \`/buy\` to start again.`,
            ),
          ],
          components: [],
        });
        return;
      }

      if (interaction.customId.startsWith('revolut_confirm_')) {
        if (!hasPerm(interaction.user.id, PERMS.SALES)) {
          await interaction.reply({
            embeds: [errorEmbed('No permission', 'Only staff can confirm payments.')],
            ephemeral: true,
          });
          return;
        }

        const orderId = Number(interaction.customId.replace('revolut_confirm_', ''));
        await interaction.deferUpdate();

        const result = await confirmOrder(interaction.client, orderId, interaction.user.id);
        if (!result.ok) {
          await interaction.followUp({
            embeds: [errorEmbed('Confirm failed', result.error)],
            ephemeral: true,
          });
          return;
        }

        await interaction.editReply({
          embeds: [
            successEmbed(
              'Payment confirmed',
              [
                `Order \`${result.order.reference}\` confirmed by <@${interaction.user.id}>.`,
                `Customer: <@${result.order.discord_id}>`,
                `Key: \`${result.saleResult.key.key}\``,
                result.delivered ? 'Licence key DMd to customer.' : 'DM failed — check log channel.',
              ].join('\n'),
            ),
          ],
          components: [],
        });
        return;
      }

      if (interaction.customId.startsWith('revolut_reject_')) {
        if (!hasPerm(interaction.user.id, PERMS.SALES)) {
          await interaction.reply({
            embeds: [errorEmbed('No permission', 'Only staff can reject payments.')],
            ephemeral: true,
          });
          return;
        }

        const orderId = Number(interaction.customId.replace('revolut_reject_', ''));
        const order = getOrderById(orderId);
        const result = rejectOrder(orderId, interaction.user.id, 'Rejected by staff');

        if (!result.ok) {
          await interaction.reply({
            embeds: [errorEmbed('Reject failed', result.error)],
            ephemeral: true,
          });
          return;
        }

        if (order) {
          try {
            const user = await interaction.client.users.fetch(order.discord_id);
            await user.send({
              embeds: [
                errorEmbed(
                  'Payment not confirmed',
                  `Your order \`${order.reference}\` was rejected. Contact staff if you already paid.`,
                ),
              ],
            });
          } catch {
            // ignore
          }
        }

        await interaction.update({
          embeds: [
            warnEmbed(
              'Payment rejected',
              `Order \`${result.order.reference}\` rejected by <@${interaction.user.id}>.`,
            ),
          ],
          components: [],
        });
        return;
      }

      if (interaction.customId.startsWith('review_prompt_')) {
        const saleId = interaction.customId.replace('review_prompt_', '');
        const modal = new ModalBuilder()
          .setCustomId(`review_modal_${saleId}`)
          .setTitle('Leave a review');

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('rating')
              .setLabel('Rating (1-5)')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMinLength(1)
              .setMaxLength(1),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('comment')
              .setLabel('Comment')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false),
          ),
        );

        await interaction.showModal(modal);
        return;
      }
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'staff_application_modal') {
        await apply.handleModal(interaction);
        return;
      }

      if (interaction.customId.startsWith('review_modal_')) {
        const saleId = Number(interaction.customId.replace('review_modal_', ''));
        const rating = Number(interaction.fields.getTextInputValue('rating'));
        const comment = interaction.fields.getTextInputValue('comment') || null;

        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
          await interaction.reply({
            embeds: [errorEmbed('Invalid rating', 'Please enter a number from 1 to 5.')],
            ephemeral: true,
          });
          return;
        }

        const review = submitReview({
          discordId: interaction.user.id,
          rating,
          comment,
          saleId,
        });
        await postReview(interaction.client, review);

        await interaction.reply({
          embeds: [successEmbed('Thanks!', 'Your review has been submitted.')],
          ephemeral: true,
        });
      }
    }
  } catch (error) {
    console.error('Interaction error:', error);
    const payload = {
      embeds: [errorEmbed('Error', 'Something went wrong while handling that interaction.')],
      ephemeral: true,
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
}

module.exports = { handleInteraction };
