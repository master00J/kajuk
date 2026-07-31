const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');
const { getActiveProducts, calculatePrice } = require('../../services/pricing');
const { formatMoney } = require('../../utils/money');
const { infoEmbed, errorEmbed } = require('../../utils/embeds');
const { config } = require('../../config');
const {
  createRevolutOrder,
  buildCustomerPaymentComponents,
  buildCustomerPaymentEmbed,
} = require('../../services/revolutOrders');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Browse and purchase generators via Revolut'),

  async execute(interaction) {
    if (!config.revolut.paymentLink) {
      await interaction.reply({
        embeds: [
          errorEmbed(
            'Payments unavailable',
            'Revolut is not configured yet. An admin must set `REVOLUT_PAYMENT_LINK` in the bot `.env`.',
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    const products = getActiveProducts();
    if (!products.length) {
      await interaction.reply({
        embeds: [errorEmbed('Unavailable', 'No generators are currently for sale.')],
        ephemeral: true,
      });
      return;
    }

    const lines = products.map((product) => {
      const priced = calculatePrice(product.id, interaction.user.id);
      const discountNote = priced.discountPercent
        ? ` ~~${formatMoney(priced.basePence)}~~ **${formatMoney(priced.finalPence)}** (-${priced.discountPercent}%)`
        : ` **${formatMoney(priced.finalPence)}**`;
      return `• **${product.name}** —${discountNote}\n  ${product.description}`;
    });

    const select = new StringSelectMenuBuilder()
      .setCustomId('buy_select_product')
      .setPlaceholder('Select a generator to purchase')
      .addOptions(
        products.map((product) => {
          const priced = calculatePrice(product.id, interaction.user.id);
          return {
            label: product.name.slice(0, 100),
            description: formatMoney(priced.finalPence).slice(0, 100),
            value: product.id,
          };
        }),
      );

    await interaction.reply({
      embeds: [
        infoEmbed(
          'Generator shop',
          [
            'Select a generator below to pay with **Revolut**.',
            'After you pay, click **I\'ve paid** — staff will verify and DM your licence key.',
            '',
            ...lines,
            '',
            config.revolut.revtag
              ? `_Pay to Revolut: ${config.revolut.revtag}_`
              : '_Pay using the Revolut payment link shown at checkout._',
          ].join('\n'),
        ),
      ],
      components: [new ActionRowBuilder().addComponents(select)],
      ephemeral: true,
    });
  },

  async handleSelect(interaction) {
    const productId = interaction.values[0];

    try {
      const { order, priced } = createRevolutOrder({
        discordId: interaction.user.id,
        productId,
        username: interaction.user.username,
      });

      await interaction.update({
        embeds: [buildCustomerPaymentEmbed(order, priced)],
        components: buildCustomerPaymentComponents(order),
      });
    } catch (error) {
      await interaction.update({
        embeds: [errorEmbed('Checkout failed', error.message)],
        components: [],
      });
    }
  },
};
