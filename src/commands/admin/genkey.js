const { SlashCommandBuilder } = require('discord.js');
const { createKey } = require('../../services/licenses');
const { getActiveProducts } = require('../../services/pricing');
const { requirePerm, PERMS } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('genkey')
    .setDescription('Generate a licence key manually')
    .addStringOption((option) => {
      option
        .setName('product')
        .setDescription('Product to generate a key for')
        .setRequired(true);

      for (const product of getActiveProducts()) {
        option.addChoices({ name: product.name, value: product.id });
      }
      return option;
    })
    .addStringOption((option) =>
      option.setName('note').setDescription('Optional note').setRequired(false),
    )
    .addUserOption((option) =>
      option.setName('user').setDescription('Optionally DM the key to a user').setRequired(false),
    ),

  async execute(interaction) {
    if (!requirePerm(interaction, PERMS.KEYS)) {
      await interaction.reply({
        embeds: [errorEmbed('No permission', 'You do not have permission to generate keys.')],
        ephemeral: true,
      });
      return;
    }

    const productId = interaction.options.getString('product', true);
    const note = interaction.options.getString('note');
    const target = interaction.options.getUser('user');

    const key = createKey({
      productId,
      createdBy: interaction.user.id,
      note,
    });

    if (target) {
      try {
        await target.send({
          embeds: [
            successEmbed(
              'Licence key',
              `A staff member generated a key for you:\n\`${key.key}\`\n\nRedeem with \`/redeem\`.`,
            ),
          ],
        });
      } catch {
        await interaction.reply({
          embeds: [
            successEmbed(
              'Key generated (DM failed)',
              `Key: \`${key.key}\`\nCould not DM <@${target.id}>.`,
            ),
          ],
          ephemeral: true,
        });
        return;
      }
    }

    await interaction.reply({
      embeds: [
        successEmbed(
          'Key generated',
          [
            `**Key:** \`${key.key}\``,
            `**Product:** ${key.product_name}`,
            note ? `**Note:** ${note}` : null,
            target ? `**DMd to:** <@${target.id}>` : null,
          ].filter(Boolean).join('\n'),
        ),
      ],
      ephemeral: true,
    });
  },
};
