const { SlashCommandBuilder } = require('discord.js');
const { submitReview, postReview } = require('../../services/reviews');
const { successEmbed, errorEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('review')
    .setDescription('Leave a review')
    .addIntegerOption((option) =>
      option
        .setName('rating')
        .setDescription('Rating from 1 to 5')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(5),
    )
    .addStringOption((option) =>
      option
        .setName('comment')
        .setDescription('Optional comment')
        .setRequired(false),
    ),

  async execute(interaction) {
    const rating = interaction.options.getInteger('rating', true);
    const comment = interaction.options.getString('comment');

    if (rating < 1 || rating > 5) {
      await interaction.reply({
        embeds: [errorEmbed('Invalid rating', 'Rating must be between 1 and 5.')],
        ephemeral: true,
      });
      return;
    }

    const review = submitReview({
      discordId: interaction.user.id,
      rating,
      comment,
    });

    await postReview(interaction.client, review);

    await interaction.reply({
      embeds: [successEmbed('Thanks!', 'Your review has been submitted.')],
      ephemeral: true,
    });
  },
};
