const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { config } = require('../config');

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'bot.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      discord_id TEXT PRIMARY KEY,
      username TEXT,
      total_spent_pence INTEGER NOT NULL DEFAULT 0,
      is_vip INTEGER NOT NULL DEFAULT 0,
      vip_since TEXT,
      invite_code TEXT UNIQUE,
      invited_by TEXT,
      invite_rewards INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      store_id TEXT,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      price_pence INTEGER NOT NULL,
      unlocks_all INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS licence_keys (
      key TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      store_id TEXT,
      unlocks_all INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'unused',
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      redeemed_by TEXT,
      redeemed_at TEXT,
      revoked_at TEXT,
      sale_id INTEGER,
      note TEXT,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (redeemed_by) REFERENCES users(discord_id)
    );

    CREATE TABLE IF NOT EXISTS ownership (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id TEXT NOT NULL,
      store_id TEXT,
      unlocks_all INTEGER NOT NULL DEFAULT 0,
      source_key TEXT,
      granted_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(discord_id, store_id),
      FOREIGN KEY (discord_id) REFERENCES users(discord_id)
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      amount_pence INTEGER NOT NULL,
      discount_pence INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      stripe_session_id TEXT UNIQUE,
      licence_key TEXT,
      status TEXT NOT NULL DEFAULT 'completed',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (discord_id) REFERENCES users(discord_id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS flash_sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT,
      discount_percent INTEGER NOT NULL,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      label TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS staff_permissions (
      discord_id TEXT PRIMARY KEY,
      perms TEXT NOT NULL,
      granted_by TEXT,
      granted_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id TEXT NOT NULL,
      rating INTEGER NOT NULL,
      comment TEXT,
      prompted_sale_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (discord_id) REFERENCES users(discord_id)
    );

    CREATE TABLE IF NOT EXISTS review_prompts (
      sale_id INTEGER PRIMARY KEY,
      discord_id TEXT NOT NULL,
      prompted_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS staff_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id TEXT NOT NULL,
      age TEXT,
      experience TEXT,
      availability TEXT,
      why TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      message_id TEXT,
      channel_id TEXT,
      decided_by TEXT,
      decided_at TEXT,
      decision_note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS staff_application_votes (
      application_id INTEGER NOT NULL,
      voter_id TEXT NOT NULL,
      vote TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (application_id, voter_id),
      FOREIGN KEY (application_id) REFERENCES staff_applications(id)
    );

    CREATE TABLE IF NOT EXISTS account_stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_label TEXT NOT NULL,
      credentials TEXT NOT NULL,
      reserved_for TEXT,
      delivered_to TEXT,
      delivered_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT NOT NULL DEFAULT 'available'
    );

    CREATE TABLE IF NOT EXISTS invite_tracking (
      inviter_id TEXT NOT NULL,
      invitee_id TEXT NOT NULL UNIQUE,
      rewarded INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS generation_stats (
      discord_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      last_generated_at TEXT,
      PRIMARY KEY (discord_id, store_id)
    );

    CREATE TABLE IF NOT EXISTS custom_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id TEXT NOT NULL,
      amount_pence INTEGER NOT NULL,
      description TEXT,
      stripe_session_id TEXT UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS pending_checkouts (
      stripe_session_id TEXT PRIMARY KEY,
      discord_id TEXT NOT NULL,
      product_id TEXT,
      custom_payment_id INTEGER,
      amount_pence INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS revolut_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT NOT NULL UNIQUE,
      discord_id TEXT NOT NULL,
      username TEXT,
      product_id TEXT NOT NULL,
      amount_pence INTEGER NOT NULL,
      discount_pence INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'awaiting_payment',
      payment_link TEXT,
      staff_message_id TEXT,
      staff_channel_id TEXT,
      confirmed_by TEXT,
      sale_id INTEGER,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      paid_at TEXT,
      confirmed_at TEXT,
      cancelled_at TEXT,
      FOREIGN KEY (discord_id) REFERENCES users(discord_id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `);

  ensureColumn('staff_applications', 'message_id', 'TEXT');
  ensureColumn('staff_applications', 'channel_id', 'TEXT');
  ensureColumn('staff_applications', 'decided_by', 'TEXT');
  ensureColumn('staff_applications', 'decided_at', 'TEXT');
  ensureColumn('staff_applications', 'decision_note', 'TEXT');

  seedProducts();
}

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (columns.some((col) => col.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function seedProducts() {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO products (id, store_id, name, description, price_pence, unlocks_all, sort_order)
    VALUES (@id, @storeId, @name, @description, @pricePence, @unlocksAll, @sortOrder)
  `);

  const tx = db.transaction(() => {
    config.defaultProducts.forEach((product, index) => {
      insert.run({
        id: product.id,
        storeId: product.storeId,
        name: product.name,
        description: product.description,
        pricePence: product.pricePence,
        unlocksAll: product.unlocksAll ? 1 : 0,
        sortOrder: index,
      });
    });
  });

  tx();
}

migrate();

module.exports = { db };
