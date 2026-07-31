const crypto = require('crypto');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');
const { db } = require('../database/db');
const { config } = require('../config');
const { ensureUser } = require('./users');
const { calculatePrice, getProduct } = require('./pricing');
const { recordSale } = require('./sales');
const { formatMoney } = require('../utils/money');
const {
  dmLicenceKey,
  logSale,
  notifyOwnerDeliveryFallback,
} = require('./delivery');
const { infoEmbed } = require('../utils/embeds');

function generateReference() {
  return `ORD-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function getOrderById(id) {
  return db.prepare(`
    SELECT o.*, p.name AS product_name
    FROM revolut_orders o
    JOIN products p ON p.id = o.product_id
    WHERE o.id = ?
  `).get(id) || null;
}

function getOrderByReference(reference) {
  return db.prepare(`
    SELECT o.*, p.name AS product_name
    FROM revolut_orders o
    JOIN products p ON p.id = o.product_id
    WHERE o.reference = ?
  `).get(String(reference).toUpperCase()) || null;
}

function listOrders(status = null, limit = 20) {
  if (status) {
    return db.prepare(`
      SELECT o.*, p.name AS product_name
      FROM revolut_orders o
      JOIN products p ON p.id = o.product_id
      WHERE o.status = ?
      ORDER BY o.created_at DESC
      LIMIT ?
    `).all(status, limit);
  }

  return db.prepare(`
    SELECT o.*, p.name AS product_name
    FROM revolut_orders o
    JOIN products p ON p.id = o.product_id
    ORDER BY o.created_at DESC
    LIMIT ?
  `).all(limit);
}

function createRevolutOrder({ discordId, productId, username = null }) {
  if (!config.revolut.paymentLink) {
    throw new Error('Revolut is not configured. Set REVOLUT_PAYMENT_LINK in .env.');
  }

  ensureUser(discordId, username);
  const priced = calculatePrice(productId, discordId);
  if (!priced) {
    throw new Error('Product not found.');
  }

  const openOrder = db.prepare(`
    SELECT * FROM revolut_orders
    WHERE discord_id = ?
      AND product_id = ?
      AND status IN ('awaiting_payment', 'awaiting_confirmation')
    ORDER BY created_at DESC
    LIMIT 1
  `).get(discordId, productId);

  if (openOrder) {
    return {
      order: getOrderById(openOrder.id),
      priced,
      reused: true,
    };
  }

  const reference = generateReference();
  const result = db.prepare(`
    INSERT INTO revolut_orders (
      reference, discord_id, username, product_id, amount_pence, discount_pence,
      status, payment_link
    ) VALUES (?, ?, ?, ?, ?, ?, 'awaiting_payment', ?)
  `).run(
    reference,
    discordId,
    username,
    productId,
    priced.finalPence,
    priced.discountPence,
    config.revolut.paymentLink,
  );

  return {
    order: getOrderById(result.lastInsertRowid),
    priced,
    reused: false,
  };
}

function buildCustomerPaymentComponents(order) {
  const rows = [];
  const linkRow = new ActionRowBuilder();

  if (order.payment_link) {
    linkRow.addComponents(
      new ButtonBuilder()
        .setLabel('Pay with Revolut')
        .setStyle(ButtonStyle.Link)
        .setURL(order.payment_link),
    );
  }

  linkRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`revolut_paid_${order.id}`)
      .setLabel("I've paid")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`revolut_cancel_${order.id}`)
      .setLabel('Cancel order')
      .setStyle(ButtonStyle.Secondary),
  );

  rows.push(linkRow);
  return rows;
}

function buildCustomerPaymentEmbed(order, priced = null) {
  const amount = formatMoney(order.amount_pence);
  const instructions = config.revolut.instructions
    || 'Pay the exact amount via Revolut, then click **I\'ve paid**. Staff will verify and DM your licence key.';

  return infoEmbed(
    'Revolut checkout',
    [
      `**Order:** \`${order.reference}\``,
      `**Product:** ${order.product_name}`,
      `**Amount:** ${amount}`,
      priced?.reasons?.length ? `**Discounts:** ${priced.reasons.join(', ')}` : null,
      config.revolut.revtag ? `**Revolut:** ${config.revolut.revtag}` : null,
      '',
      instructions,
      '',
      'Include your order reference in the Revolut note if possible:',
      `\`${order.reference}\``,
      '',
      '_Payment is checked manually. Keys are sent after staff confirmation._',
    ].filter(Boolean).join('\n'),
  );
}

function markPaidByCustomer(orderId, discordId) {
  const order = getOrderById(orderId);
  if (!order) return { ok: false, error: 'Order not found.' };
  if (order.discord_id !== discordId) {
    return { ok: false, error: 'This order does not belong to you.' };
  }
  if (order.status === 'completed') {
    return { ok: false, error: 'This order is already completed.' };
  }
  if (order.status === 'cancelled' || order.status === 'rejected') {
    return { ok: false, error: 'This order was cancelled.' };
  }
  if (order.status === 'awaiting_confirmation') {
    return { ok: true, order, alreadyMarked: true };
  }

  db.prepare(`
    UPDATE revolut_orders
    SET status = 'awaiting_confirmation', paid_at = datetime('now')
    WHERE id = ?
  `).run(orderId);

  return { ok: true, order: getOrderById(orderId), alreadyMarked: false };
}

function cancelOrder(orderId, discordId, byStaff = false) {
  const order = getOrderById(orderId);
  if (!order) return { ok: false, error: 'Order not found.' };
  if (!byStaff && order.discord_id !== discordId) {
    return { ok: false, error: 'This order does not belong to you.' };
  }
  if (['completed', 'cancelled', 'rejected'].includes(order.status)) {
    return { ok: false, error: `Order is already ${order.status}.` };
  }

  db.prepare(`
    UPDATE revolut_orders
    SET status = 'cancelled', cancelled_at = datetime('now')
    WHERE id = ?
  `).run(orderId);

  return { ok: true, order: getOrderById(orderId) };
}

async function notifyStaffPendingPayment(client, order) {
  const channelId = config.channels.payments || config.channels.sales || config.channels.log;
  if (!channelId) {
    console.warn('No PAYMENTS_CHANNEL_ID / SALES_CHANNEL_ID set — cannot notify staff about Revolut payment.');
    return null;
  }

  const channel = await client.channels.fetch(channelId);
  if (!channel?.isTextBased()) return null;

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('Revolut payment claimed')
    .setDescription('A customer marked an order as paid. Verify in Revolut, then confirm or reject.')
    .addFields(
      { name: 'Order', value: `\`${order.reference}\``, inline: true },
      { name: 'Customer', value: `<@${order.discord_id}>`, inline: true },
      { name: 'Amount', value: formatMoney(order.amount_pence), inline: true },
      { name: 'Product', value: order.product_name, inline: true },
      { name: 'Status', value: order.status, inline: true },
      { name: 'Username', value: order.username || 'unknown', inline: true },
    )
    .setFooter({ text: `Order ID: ${order.id}` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`revolut_confirm_${order.id}`)
      .setLabel('Confirm & deliver key')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`revolut_reject_${order.id}`)
      .setLabel('Reject')
      .setStyle(ButtonStyle.Danger),
  );

  const message = await channel.send({ embeds: [embed], components: [row] });

  db.prepare(`
    UPDATE revolut_orders
    SET staff_message_id = ?, staff_channel_id = ?
    WHERE id = ?
  `).run(message.id, channel.id, order.id);

  return message;
}

async function confirmOrder(client, orderId, staffId) {
  const order = getOrderById(orderId);
  if (!order) return { ok: false, error: 'Order not found.' };
  if (order.status === 'completed') {
    return { ok: false, error: 'Order already completed.', order };
  }
  if (['cancelled', 'rejected'].includes(order.status)) {
    return { ok: false, error: `Order is ${order.status}.`, order };
  }

  const product = getProduct(order.product_id);
  if (!product) return { ok: false, error: 'Product no longer exists.' };

  const saleResult = recordSale({
    discordId: order.discord_id,
    productId: order.product_id,
    amountPence: order.amount_pence,
    discountPence: order.discount_pence,
    paymentMethod: 'revolut',
    username: order.username,
  });

  db.prepare(`
    UPDATE revolut_orders
    SET status = 'completed',
        confirmed_by = ?,
        confirmed_at = datetime('now'),
        sale_id = ?
    WHERE id = ?
  `).run(staffId, saleResult.sale.id, order.id);

  const delivered = await dmLicenceKey(client, order.discord_id, {
    key: saleResult.key,
    product: saleResult.product,
    sale: saleResult.sale,
    newlyVip: Boolean(saleResult.user?.newlyVip),
  });

  await logSale(client, saleResult);

  if (!delivered) {
    await notifyOwnerDeliveryFallback(client, order.discord_id, saleResult.key.key);
  }

  return {
    ok: true,
    order: getOrderById(orderId),
    saleResult,
    delivered,
  };
}

function rejectOrder(orderId, staffId, reason = null) {
  const order = getOrderById(orderId);
  if (!order) return { ok: false, error: 'Order not found.' };
  if (order.status === 'completed') {
    return { ok: false, error: 'Order already completed.' };
  }

  db.prepare(`
    UPDATE revolut_orders
    SET status = 'rejected',
        confirmed_by = ?,
        confirmed_at = datetime('now'),
        note = ?,
        cancelled_at = datetime('now')
    WHERE id = ?
  `).run(staffId, reason, orderId);

  return { ok: true, order: getOrderById(orderId) };
}

module.exports = {
  createRevolutOrder,
  getOrderById,
  getOrderByReference,
  listOrders,
  buildCustomerPaymentComponents,
  buildCustomerPaymentEmbed,
  markPaidByCustomer,
  cancelOrder,
  notifyStaffPendingPayment,
  confirmOrder,
  rejectOrder,
};
