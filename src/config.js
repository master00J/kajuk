require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function cleanId(value) {
  return String(value || '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .replace(/[^\d]/g, '');
}

function list(name) {
  const raw = process.env[name] || '';
  return raw
    .split(/[,\s;]+/)
    .map((part) => cleanId(part))
    .filter((part) => part.length >= 15);
}

const STORES = [
  { id: 'asda', name: 'Asda', emoji: '🛒' },
  { id: 'sainsburys', name: "Sainsbury's", emoji: '🟠' },
  { id: 'mands', name: 'M&S', emoji: '🟢' },
  { id: 'boots', name: 'Boots', emoji: '💙' },
  { id: 'onestop', name: 'One Stop', emoji: '🏪' },
  { id: 'waitrose', name: 'Waitrose', emoji: '🌿' },
];

const DEFAULT_PRODUCTS = [
  {
    id: 'asda',
    storeId: 'asda',
    name: 'Asda Generator',
    description: 'Unlock unlimited Asda barcode generation.',
    pricePence: 1500,
  },
  {
    id: 'sainsburys',
    storeId: 'sainsburys',
    name: "Sainsbury's Generator",
    description: "Unlock unlimited Sainsbury's barcode generation.",
    pricePence: 1500,
  },
  {
    id: 'mands',
    storeId: 'mands',
    name: 'M&S Generator',
    description: 'Unlock unlimited M&S barcode generation.',
    pricePence: 2000,
  },
  {
    id: 'boots',
    storeId: 'boots',
    name: 'Boots Generator',
    description: 'Unlock unlimited Boots barcode generation.',
    pricePence: 1500,
  },
  {
    id: 'onestop',
    storeId: 'onestop',
    name: 'One Stop Generator',
    description: 'Unlock unlimited One Stop barcode generation.',
    pricePence: 1200,
  },
  {
    id: 'waitrose',
    storeId: 'waitrose',
    name: 'Waitrose Generator',
    description: 'Unlock unlimited Waitrose barcode generation.',
    pricePence: 2000,
  },
  {
    id: 'all_stores',
    storeId: null,
    name: 'All Stores Bundle',
    description: 'Unlock every supported store generator.',
    pricePence: 6500,
    unlocksAll: true,
  },
];

const config = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID,
  guildId: process.env.DISCORD_GUILD_ID || null,
  ownerIds: [...new Set([...list('OWNER_IDS'), ...list('OWNER_ID')])],
  channels: {
    log: process.env.LOG_CHANNEL_ID || null,
    sales: process.env.SALES_CHANNEL_ID || null,
    payments: process.env.PAYMENTS_CHANNEL_ID || process.env.SALES_CHANNEL_ID || null,
    review: process.env.REVIEW_CHANNEL_ID || null,
    staffApp: process.env.STAFF_APP_CHANNEL_ID || null,
    panel: process.env.PANEL_CHANNEL_ID || null,
  },
  revolut: {
    paymentLink: process.env.REVOLUT_PAYMENT_LINK || null,
    revtag: process.env.REVOLUT_REVTAG || null,
    instructions: process.env.REVOLUT_INSTRUCTIONS || null,
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || null,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || null,
    successUrl: process.env.STRIPE_SUCCESS_URL || 'https://discord.com/channels/@me',
    cancelUrl: process.env.STRIPE_CANCEL_URL || 'https://discord.com/channels/@me',
  },
  port: Number(process.env.PORT || 3000),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:3000',
  currency: (process.env.CURRENCY || 'gbp').toLowerCase(),
  vipThresholdPence: Number(process.env.VIP_THRESHOLD_PENCE || 5000),
  vipDiscountPercent: Number(process.env.VIP_DISCOUNT_PERCENT || 10),
  stores: STORES,
  defaultProducts: DEFAULT_PRODUCTS,
};

function assertRuntimeConfig() {
  required('DISCORD_TOKEN');
  required('DISCORD_CLIENT_ID');
}

module.exports = { config, assertRuntimeConfig, STORES, DEFAULT_PRODUCTS };
