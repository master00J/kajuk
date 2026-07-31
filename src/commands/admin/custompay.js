const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { createCustomPaymentSession } = require('../../services/stripe');
const { poundsToPence, formatMoney } = require('../../utils/money');
const { requirePerm, PERMS } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('custompay')
    .setDescription('Create a custom Stripe payment link')
    .addUserOption((option) =>
      option.setName('user').setDescription('Customer').setRequired(true),
    )
    .addNumberOption((option) =>
      option
        .setName('amount')
        .setDescription('Amount in pounds (e.g. 12.50)')
        .setRequired(true)
        .setMinValue(0.5),
    )
    .addStringOption((option) =>
      option.setName('description').setDescription('Payment description').setRequired(false),
    ),

  async execute(interaction) {
    if (!requirePerm(interaction, PERMS.SALES)) {
      await interaction.reply({
        embeds: [errorEmbed('No permission', 'You do not have permission to create custom payments.')],
        ephemeral: true,
      });
      return;
    }

    const user = interaction.options.getUser('user', true);
    const amount = interaction.options.getNumber('amount', true);
    const description = interaction.options.getString('description') || 'Custom payment';
    const amountPence = poundsToPence(amount);

    try {
      const { session } = await createCustomPaymentSession({
        discordId: user.id,
        amountPence,
        description,
        createdBy: interaction.user.id,
        username: user.username,
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Open payment link')
          .setStyle(ButtonStyle.Link)
          .setURL(session.url),
      );

      await interaction.reply({
        embeds: [
          successEmbed(
            'Custom payment created',
            [
              `**Customer:** <@${user.id}>`,
              `**Amount:** ${formatMoney(amountPence)}`,
              `**Description:** ${description}`,
              '',
              'Send the payment link to the customer.',
            ].join('\n'),
          ),
        ],
        components: [row],
        ephemeral: true,
      });
    } catch (error) {
      await interaction.reply({
        embeds: [errorEmbed('Failed', error.message)],
        ephemeral: true,
      });
    }
  },
};
