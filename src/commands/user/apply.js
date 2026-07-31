const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');
const { submitApplication, postApplication } = require('../../services/staffApps');
const { successEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('apply')
    .setDescription('Apply for staff'),

  async execute(interaction) {
    const modal = new ModalBuilder()
      .setCustomId('staff_application_modal')
      .setTitle('Staff application');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('age')
          .setLabel('Age')
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('experience')
          .setLabel('Relevant experience')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('availability')
          .setLabel('Availability')
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('why')
          .setLabel('Why do you want to join?')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true),
      ),
    );

    await interaction.showModal(modal);
  },

  async handleModal(interaction) {
    const application = submitApplication({
      discordId: interaction.user.id,
      age: interaction.fields.getTextInputValue('age'),
      experience: interaction.fields.getTextInputValue('experience'),
      availability: interaction.fields.getTextInputValue('availability'),
      why: interaction.fields.getTextInputValue('why'),
    });

    await postApplication(interaction.client, application);

    await interaction.reply({
      embeds: [successEmbed('Application submitted', 'Staff will review your application soon.')],
      ephemeral: true,
    });
  },
};
