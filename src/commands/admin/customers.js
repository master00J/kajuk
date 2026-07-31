const { SlashCommandBuilder } = require('discord.js');
const { listCustomers } = require('../../services/users');
const { requirePerm, PERMS } = require('../../utils/permissions');
const { formatMoney } = require('../../utils/money');
const { infoEmbed, errorEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('customers')
    .setDescription('List all customers'),

  async execute(interaction) {
    if (!requirePerm(interaction, PERMS.CUSTOMERS)) {
      await interaction.reply({
        embeds: [errorEmbed('No permission', 'You do not have permission to view customers.')],
        ephemeral: true,
      });
      return;
    }

    const customers = listCustomers(40);
    const body = customers.length
      ? customers
        .map((user, index) => {
          const vip = user.is_vip ? ' VIP' : '';
          const name = user.username || user.discord_id;
          return `**${index + 1}.** <@${user.discord_id}> (${name}) — ${formatMoney(user.total_spent_pence)}${vip}`;
        })
        .join('\n')
      : '_No customers yet._';

    await interaction.reply({
      embeds: [infoEmbed('Customers', body)],
      ephemeral: true,
    });
  },
};
