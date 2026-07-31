const fs = require('fs');
const path = require('path');

function loadCommands() {
  const commands = new Map();
  const roots = [
    path.join(__dirname, 'commands', 'user'),
    path.join(__dirname, 'commands', 'admin'),
  ];

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const files = fs.readdirSync(root).filter((file) => file.endsWith('.js'));

    for (const file of files) {
      const command = require(path.join(root, file));
      if (!command?.data?.name || typeof command.execute !== 'function') {
        console.warn(`Skipping invalid command file: ${file}`);
        continue;
      }
      commands.set(command.data.name, command);
    }
  }

  return commands;
}

module.exports = { loadCommands };
