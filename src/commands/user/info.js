const { SlashCommandBuilder } = require('discord.js');
const { config } = require('../../config');
const { infoEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('How everything works'),

  async execute(interaction) {
    const stores = config.stores.map((store) => `${store.emoji} ${store.name}`).join('\n');

    await interaction.reply({
      embeds: [
        infoEmbed(
          'How Generator Bot works',
          [
            '**1.** Use `/buy` and select a generator.',
            '**2.** Pay the exact amount via the Revolut payment link.',
            '**3.** Click **I\'ve paid** and wait for staff confirmation.',
            '**4.** Your licence key is DMd — redeem it with `/redeem <key>`.',
            '',
            '**Supported stores**',
            stores,
            '',
            '**Also available**',
            '• `/prices` — current pricing, flash sales, VIP status',
            '• `/invite` — invite friends and earn rewards',
            '• `/leaderboard` — generation leaderboard',
            '• `/review` — leave a review after purchase',
            '• `/apply` — apply for staff',
            '',
            '_Payments are verified manually on Revolut. Barcode image generation is not included in this build._',
          ].join('\n'),
        ),
      ],
      ephemeral: true,
    });
  },
};
