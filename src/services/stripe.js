const Stripe = require('stripe');
const { config } = require('../config');
const { db } = require('../database/db');
const { calculatePrice, getProduct } = require('./pricing');
const { recordSale, getSaleByStripeSession } = require('./sales');
const { ensureUser } = require('./users');

let stripe = null;

function getStripe() {
  if (!config.stripe.secretKey) {
    return null;
  }
  if (!stripe) {
    stripe = new Stripe(config.stripe.secretKey);
  }
  return stripe;
}

async function createCheckoutSession({ discordId, productId, username = null }) {
  const client = getStripe();
  if (!client) {
    throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY.');
  }

  ensureUser(discordId, username);
  const priced = calculatePrice(productId, discordId);
  if (!priced) {
    throw new Error('Product not found.');
  }

  const session = await client.checkout.sessions.create({
    mode: 'payment',
    success_url: config.stripe.successUrl,
    cancel_url: config.stripe.cancelUrl,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: config.currency,
          unit_amount: priced.finalPence,
          product_data: {
            name: priced.product.name,
            description: priced.product.description,
          },
        },
      },
    ],
    metadata: {
      discord_id: discordId,
      product_id: productId,
      discount_pence: String(priced.discountPence),
      type: 'product',
    },
  });

  db.prepare(`
    INSERT INTO pending_checkouts (stripe_session_id, discord_id, product_id, amount_pence)
    VALUES (?, ?, ?, ?)
  `).run(session.id, discordId, productId, priced.finalPence);

  return { session, priced };
}

async function createCustomPaymentSession({
  discordId,
  amountPence,
  description,
  createdBy,
  username = null,
}) {
  const client = getStripe();
  if (!client) {
    throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY.');
  }

  ensureUser(discordId, username);

  const insert = db.prepare(`
    INSERT INTO custom_payments (discord_id, amount_pence, description, created_by, status)
    VALUES (?, ?, ?, ?, 'pending')
  `).run(discordId, amountPence, description, createdBy);

  const customPaymentId = insert.lastInsertRowid;

  const session = await client.checkout.sessions.create({
    mode: 'payment',
    success_url: config.stripe.successUrl,
    cancel_url: config.stripe.cancelUrl,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: config.currency,
          unit_amount: amountPence,
          product_data: {
            name: description || 'Custom payment',
            description: `Custom payment for Discord user ${discordId}`,
          },
        },
      },
    ],
    metadata: {
      discord_id: discordId,
      custom_payment_id: String(customPaymentId),
      type: 'custom',
    },
  });

  db.prepare(`
    UPDATE custom_payments SET stripe_session_id = ? WHERE id = ?
  `).run(session.id, customPaymentId);

  db.prepare(`
    INSERT INTO pending_checkouts (stripe_session_id, discord_id, custom_payment_id, amount_pence)
    VALUES (?, ?, ?, ?)
  `).run(session.id, discordId, customPaymentId, amountPence);

  return { session, customPaymentId };
}

async function fulfillCheckoutSession(session) {
  const existing = getSaleByStripeSession(session.id);
  if (existing) {
    return { alreadyFulfilled: true, sale: existing };
  }

  const meta = session.metadata || {};
  const discordId = meta.discord_id;
  if (!discordId) {
    throw new Error('Checkout session missing discord_id metadata.');
  }

  if (meta.type === 'custom') {
    const customPaymentId = Number(meta.custom_payment_id);
    db.prepare(`
      UPDATE custom_payments
      SET status = 'completed', completed_at = datetime('now')
      WHERE id = ?
    `).run(customPaymentId);

    db.prepare('DELETE FROM pending_checkouts WHERE stripe_session_id = ?').run(session.id);

    return {
      type: 'custom',
      discordId,
      amountPence: session.amount_total || 0,
      customPaymentId,
    };
  }

  const productId = meta.product_id;
  const product = getProduct(productId);
  if (!product) {
    throw new Error(`Unknown product on checkout: ${productId}`);
  }

  const result = recordSale({
    discordId,
    productId,
    amountPence: session.amount_total || 0,
    discountPence: Number(meta.discount_pence || 0),
    paymentMethod: 'stripe',
    stripeSessionId: session.id,
  });

  db.prepare('DELETE FROM pending_checkouts WHERE stripe_session_id = ?').run(session.id);

  return {
    type: 'product',
    ...result,
  };
}

module.exports = {
  getStripe,
  createCheckoutSession,
  createCustomPaymentSession,
  fulfillCheckoutSession,
};
