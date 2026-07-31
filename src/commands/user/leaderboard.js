const { SlashCommandBuilder } = require('discord.js');
const { getLeaderboard } = require('../../services/leaderboard');
const { infoEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Barcode generation leaderboard'),

  async execute(interaction) {
    const rows = getLeaderboard(10);

    const body = rows.length
      ? rows
        .map((row, index) => {
          const name = row.username ? `${row.username}` : `<@${row.discord_id}>`;
          return `**${index + 1}.** ${name} — ${row.total} generations`;
        })
        .join('\n')
      : '_No generations recorded yet._\n_Barcode image generation is not included in this build, so the board stays empty until that feature is added._';

    await interaction.reply({
      embeds: [infoEmbed('Generation leaderboard', body)],
      ephemeral: false,
    });
  },
};
