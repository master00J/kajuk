const express = require('express');
const { config } = require('../config');
const { getStripe, fulfillCheckoutSession } = require('../services/stripe');
const {
  dmLicenceKey,
  dmCustomPaymentReceipt,
  logSale,
  notifyOwnerDeliveryFallback,
} = require('../services/delivery');

function startWebhookServer(client) {
  const app = express();
  const stripe = getStripe();

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    if (!stripe || !config.stripe.webhookSecret) {
      res.status(503).send('Stripe webhook is not configured');
      return;
    }

    let event;
    try {
      const signature = req.headers['stripe-signature'];
      event = stripe.webhooks.constructEvent(req.body, signature, config.stripe.webhookSecret);
    } catch (error) {
      console.error('Stripe signature verification failed:', error.message);
      res.status(400).send(`Webhook Error: ${error.message}`);
      return;
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      try {
        const result = await fulfillCheckoutSession(session);

        if (result.alreadyFulfilled) {
          res.json({ received: true, duplicate: true });
          return;
        }

        if (result.type === 'custom') {
          await dmCustomPaymentReceipt(client, result.discordId, result.amountPence);
        } else {
          const delivered = await dmLicenceKey(client, result.sale.discord_id, {
            key: result.key,
            product: result.product,
            sale: result.sale,
            newlyVip: Boolean(result.user?.newlyVip),
          });

          await logSale(client, result);

          if (!delivered) {
            await notifyOwnerDeliveryFallback(client, result.sale.discord_id, result.key.key);
          }
        }
      } catch (error) {
        console.error('Failed to fulfill checkout:', error);
        res.status(500).json({ error: 'Fulfillment failed' });
        return;
      }
    }

    res.json({ received: true });
  });

  // JSON parser for any future non-webhook routes
  app.use(express.json());

  app.listen(config.port, () => {
    console.log(`Webhook server listening on port ${config.port}`);
  });

  return app;
}

module.exports = { startWebhookServer };
