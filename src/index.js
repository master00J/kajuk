const {
  Client,
  GatewayIntentBits,
  Partials,
  ActivityType,
} = require('discord.js');
const { config, assertRuntimeConfig } = require('./config');
const { loadCommands } = require('./loadCommands');
const { handleInteraction } = require('./events/interactionCreate');
const { startWebhookServer } = require('./server/webhook');
const { startDailySummary } = require('./services/dailySummary');
require('./database/db');

assertRuntimeConfig();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

client.commands = loadCommands();

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  client.user.setActivity('generators | /info', { type: ActivityType.Watching });
  startWebhookServer(client);
  startDailySummary(client);
});

client.on('interactionCreate', (interaction) => handleInteraction(interaction, client.commands));

client.login(config.token);

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});
