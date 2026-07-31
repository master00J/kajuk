require('dotenv').config();

const { REST, Routes } = require('discord.js');
const { config, assertRuntimeConfig } = require('./config');
const { loadCommands } = require('./loadCommands');

async function deploy() {
  assertRuntimeConfig();
  const commands = loadCommands();
  const body = [...commands.values()].map((command) => command.data.toJSON());

  const rest = new REST({ version: '10' }).setToken(config.token);

  if (config.guildId) {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
      body,
    });
    console.log(`Deployed ${body.length} guild commands to ${config.guildId}.`);
  } else {
    await rest.put(Routes.applicationCommands(config.clientId), { body });
    console.log(`Deployed ${body.length} global commands.`);
  }
}

deploy().catch((error) => {
  console.error(error);
  process.exit(1);
});
