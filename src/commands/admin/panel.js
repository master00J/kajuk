const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} = require('discord.js');
const { getActiveProducts, calculatePrice } = require('../../services/pricing');
const { requirePerm, PERMS } = require('../../utils/permissions');
const { formatMoney } = require('../../utils/money');
const { infoEmbed, successEmbed, errorEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Send panels to a channel')
    .addSubcommand((sub) =>
      sub
        .setName('generators')
        .setDescription('Send the generators panel to a channel')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Target channel')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        ),
    ),

  async execute(interaction) {
    if (!requirePerm(interaction, PERMS.PANEL)) {
      await interaction.reply({
        embeds: [errorEmbed('No permission', 'You do not have permission to send panels.')],
        ephemeral: true,
      });
      return;
    }

    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const products = getActiveProducts();

    const lines = products.map((product) => {
      const priced = calculatePrice(product.id);
      return `• **${product.name}** — ${formatMoney(priced.finalPence)}\n  ${product.description}`;
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('panel_buy')
        .setLabel('Buy generator')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('panel_prices')
        .setLabel('View prices')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('panel_info')
        .setLabel('How it works')
        .setStyle(ButtonStyle.Primary),
    );

    await channel.send({
      embeds: [
        infoEmbed(
          'Generator store',
          [
            'Purchase a licence via Revolut, redeem it, and unlock store access on your Discord account.',
            '',
            ...lines,
            '',
            'Use the buttons below or run `/buy`, `/redeem`, `/prices`, `/info`.',
          ].join('\n'),
        ),
      ],
      components: [row],
    });

    await interaction.reply({
      embeds: [successEmbed('Panel sent', `Generators panel posted in ${channel}.`)],
      ephemeral: true,
    });
  },
};
