require('dotenv').config();

const { assertRuntimeConfig } = require('./config');
const { deployCommands } = require('./services/deployCommands');

async function main() {
  assertRuntimeConfig();
  await deployCommands();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
