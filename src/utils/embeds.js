const { EmbedBuilder } = require('discord.js');

const COLORS = {
  primary: 0x2ecc71,
  info: 0x3498db,
  warn: 0xf1c40f,
  danger: 0xe74c3c,
  muted: 0x95a5a6,
};

function baseEmbed(title, description, color = COLORS.primary) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

function successEmbed(title, description) {
  return baseEmbed(title, description, COLORS.primary);
}

function infoEmbed(title, description) {
  return baseEmbed(title, description, COLORS.info);
}

function errorEmbed(title, description) {
  return baseEmbed(title, description, COLORS.danger);
}

function warnEmbed(title, description) {
  return baseEmbed(title, description, COLORS.warn);
}

module.exports = {
  COLORS,
  baseEmbed,
  successEmbed,
  infoEmbed,
  errorEmbed,
  warnEmbed,
};
