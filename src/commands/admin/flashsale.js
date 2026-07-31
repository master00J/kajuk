const { SlashCommandBuilder } = require('discord.js');
const { createFlashSale, getActiveProducts } = require('../../services/pricing');
const { requirePerm, PERMS } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('flashsale')
    .setDescription('Create a time-limited discount')
    .addIntegerOption((option) =>
      option
        .setName('percent')
        .setDescription('Discount percent')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(90),
    )
    .addIntegerOption((option) =>
      option
        .setName('hours')
        .setDescription('Duration in hours')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(720),
    )
    .addStringOption((option) => {
      option
        .setName('product')
        .setDescription('Product (leave empty for all products)')
        .setRequired(false);

      for (const product of getActiveProducts()) {
        option.addChoices({ name: product.name, value: product.id });
      }
      return option;
    })
    .addStringOption((option) =>
      option.setName('label').setDescription('Optional label').setRequired(false),
    ),

  async execute(interaction) {
    if (!requirePerm(interaction, PERMS.SALES)) {
      await interaction.reply({
        embeds: [errorEmbed('No permission', 'You do not have permission to create flash sales.')],
        ephemeral: true,
      });
      return;
    }

    const percent = interaction.options.getInteger('percent', true);
    const hours = interaction.options.getInteger('hours', true);
    const productId = interaction.options.getString('product');
    const label = interaction.options.getString('label');

    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + hours * 60 * 60 * 1000);

    const sale = createFlashSale({
      productId,
      discountPercent: percent,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      label,
    });

    await interaction.reply({
      embeds: [
        successEmbed(
          'Flash sale created',
          [
            `**Discount:** ${sale.discount_percent}%`,
            `**Product:** ${sale.product_id || 'All products'}`,
            `**Ends:** <t:${Math.floor(endsAt.getTime() / 1000)}:F>`,
            label ? `**Label:** ${label}` : null,
          ].filter(Boolean).join('\n'),
        ),
      ],
      ephemeral: true,
    });
  },
};
