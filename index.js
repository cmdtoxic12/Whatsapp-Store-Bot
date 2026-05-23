const fs = require("fs");
const express = require("express");
const app = express();
app.use(express.json());

require("dotenv").config();

const BOT_BANNER = `╔════════════════╗
   🤖 C-LICON BOT
╚════════════════╝

`;

async function sendBanner(sock, to, caption) {
  const logoPath = "./assets/logo.jpg";

  if (fs.existsSync(logoPath)) {
    await sock.sendMessage(to, {
      image: fs.readFileSync(logoPath),
      caption,
    });
  } else {
    await sock.sendMessage(to, {
      text: caption,
    });
  }
}

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");

const axios = require("axios");
const P = require("pino");

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");

  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: P({ level: "silent" }),
    auth: state,
    printQRInTerminal: false,
  });

  // PAIRING CODE LOGIN
  const phoneNumber = "233535679394"; // no + sign

  setTimeout(async () => {
    if (!sock.authState.creds.registered) {
      const code = await sock.requestPairingCode(phoneNumber);
      console.log("PAIRING CODE:", code);
    }
  }, 3000);

  // CONNECTION EVENTS
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut;

      console.log("Disconnected");

      if (shouldReconnect) {
        startBot();
      }
    }

    if (connection === "open") {
      console.log("Bot Connected ✅");
    }
  });

  // SAVE SESSION
  sock.ev.on("creds.update", saveCreds);

  // MESSAGE LISTENER
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];

    if (!msg.message) return;

    const from = msg.key.remoteJid;

    const text =
      msg.message.conversation || msg.message.extendedTextMessage?.text || "";

    const command = text.toLowerCase().trim();
    // MENU
    if (command === "menu") {
      await sendBanner(
        sock,
        from,

        BOT_BANNER +
          "📋 *COMMANDS*\n\n" +
          "menu\n" +
          "orders\n" +
          "balance\n" +
          "stats\n" +
          "help\n" +
          "track ORDER_REFERENCE\n" +
          "ping",
      );

      return;
    }

    if (command.startsWith("track ")) {
      const reference = command.split(" ")[1];

      if (!reference) {
        await sock.sendMessage(from, {
          text: "Send like this:\ntrack API-LX5GZ4-A1B2C3D4",
        });
        return;
      }

      const order = await getOrder(reference);

      await sendBanner(
        sock,
        from,
        BOT_BANNER +
          `📦 *ORDER TRACKING*\n\n` +
          `🆔 ${order.reference || "N/A"}\n` +
          `📱 ${order.phoneNumber || "N/A"}\n` +
          `🌐 ${order.network || "N/A"}\n` +
          `📦 ${order.capacity || "N/A"}GB\n` +
          `💰 GHS ${order.price || "0"}\n` +
          `📌 Status: *${order.status || "N/A"}*`,
      );

      return;
    }

    // HELP
    if (command === "help") {
      await sendBanner(
        sock,
        from,

        BOT_BANNER +
          "🤖 *STORE BOT HELP*\n\n" +
          "menu → Show commands\n" +
          "orders → Latest orders\n" +
          "balance → Wallet balance\n" +
          "stats → Store statistics\n" +
          "ping → Test bot",
      );

      return;
    }

    // STATS
    if (command === "stats") {
      const orders = await getOrders();

      const totalOrders = orders.length;

      const completedOrders = orders.filter(
        (o) => o.status === "completed",
      ).length;

      const pendingOrders = orders.filter((o) => o.status === "pending").length;

      const failedOrders = orders.filter((o) => o.status === "failed").length;

      let totalRevenue = 0;

      orders.forEach((o) => {
        totalRevenue += Number(o.price || 0);
      });

      await sendBanner(
        sock,
        from,

        BOT_BANNER +
          "📊 *STORE STATS*\n\n" +
          `📦 Total Orders: ${totalOrders}\n` +
          `✅ Completed: ${completedOrders}\n` +
          `⏳ Pending: ${pendingOrders}\n` +
          `❌ Failed: ${failedOrders}\n` +
          `💰 Revenue: GHS ${totalRevenue.toFixed(2)}`,
      );

      return;
    }
    console.log("Message:", text);

    // PING
    if (command === "ping") {
      await sendBanner(sock, from, BOT_BANNER + "pong 🏓");
      return;
    }

    // BALANCE
    if (command === "balance") {
      const balance = await getBalance();

      await sendBanner(
        sock,
        from,

        BOT_BANNER +
          `💳 *Wallet Balance*\n\n` +
          `Deposit: ${balance.currency} ${balance.deposit}\n` +
          `Earnings: ${balance.currency} ${balance.earnings}\n` +
          `Pending: ${balance.currency} ${balance.pending}`,
      );

      return;
    }
    // ORDERS
    if (command === "orders") {
      const orders = await getOrders();

      if (!orders || orders.length === 0) {
        await sendBanner(sock, from, BOT_BANNER + reply);

        return;
      }

      let reply = "📦 *Latest Orders*\n\n";

      orders.slice(0, 10).forEach((order, i) => {
        reply +=
          `*${i + 1}.* ${order.reference || order.id || "No Ref"}\n` +
          `📱 ${order.phoneNumber || "N/A"}\n` +
          `🌐 ${order.network || "N/A"}\n` +
          `📦 ${order.capacity || "N/A"}GB\n` +
          `💰 GHS ${order.price || "0"}\n` +
          `📌 ${order.status || "Pending"}\n\n`;
      });

      await sendBanner(sock, from, BOT_BANNER + reply);
    }
  });

  app.post("/webhook", async (req, res) => {
    console.log("Webhook received:", req.body);

    const event = req.body;

    const type = event.type || event.event || "unknown";

    const data = event.data || event.order || event.withdrawal || {};

    const owner = "233535679394@s.whatsapp.net";

    // =========================
    // ORDER CREATED
    // =========================
    if (type === "order.created") {
      const message =
        `🛒 *NEW ORDER*\n\n` +
        `👤 ${data.customer_name || "Unknown"}\n` +
        `📱 ${data.phone || "N/A"}\n` +
        `💰 GHS ${data.amount || data.total || "0"}\n` +
        `📌 ${data.status || "Pending"}\n` +
        `🆔 ${data.id || "N/A"}`;

      await sock.sendMessage(owner, {
        text: message,
      });
    }

    // =========================
    // ORDER COMPLETED
    // =========================
    if (type === "order.completed") {
      const message =
        `✅ *ORDER COMPLETED*\n\n` +
        `👤 ${data.customer_name || "Unknown"}\n` +
        `💰 GHS ${data.amount || data.total || "0"}\n` +
        `📦 Successfully Delivered`;

      await sock.sendMessage(owner, {
        text: message,
      });
    }

    // =========================
    // ORDER FAILED
    // =========================
    if (type === "order.failed") {
      const message =
        `❌ *ORDER FAILED*\n\n` +
        `👤 ${data.customer_name || "Unknown"}\n` +
        `💰 GHS ${data.amount || data.total || "0"}\n` +
        `⚠ Delivery Failed`;

      await sock.sendMessage(owner, {
        text: message,
      });
    }

    // =========================
    // ORDER REFUNDED
    // =========================
    if (type === "order.refunded") {
      const message =
        `💸 *ORDER REFUNDED*\n\n` +
        `👤 ${data.customer_name || "Unknown"}\n` +
        `💰 Refunded: GHS ${data.amount || data.total || "0"}`;

      await sock.sendMessage(owner, {
        text: message,
      });
    }

    // =========================
    // WITHDRAWAL COMPLETED
    // =========================
    if (type === "withdrawal.completed") {
      const message =
        `🏦 *WITHDRAWAL COMPLETED*\n\n` +
        `💰 Amount: GHS ${data.amount || "0"}\n` +
        `📌 Status: Completed`;

      await sock.sendMessage(owner, {
        text: message,
      });
    }

    // =========================
    // WITHDRAWAL REFUNDED
    // =========================
    if (type === "withdrawal.refunded") {
      const message =
        `↩ *WITHDRAWAL REFUNDED*\n\n` +
        `💰 Amount: GHS ${data.amount || "0"}\n` +
        `⚠ Withdrawal Reversed`;

      await sock.sendMessage(owner, {
        text: message,
      });
    }

    res.sendStatus(200);
  });
}

// GET ORDERS
async function getOrders() {
  const res = await axios.get(`${process.env.STORE_API_BASE}/orders`, {
    headers: {
      Authorization: `Bearer ${process.env.STORE_API_KEY}`,
    },
  });

  return res.data.orders || res.data.data || res.data;
}

// GET BALANCE
async function getBalance() {
  const res = await axios.get(`${process.env.STORE_API_BASE}/wallet/balance`, {
    headers: {
      Authorization: `Bearer ${process.env.STORE_API_KEY}`,
    },
  });

  const data = res.data.data;

  return {
    deposit: data.deposit.balance,
    earnings: data.earnings.availableBalance,
    pending: data.earnings.pendingBalance,
    currency: data.deposit.currency || "GHS",
  };
}

// GET SINGLE ORDER
async function getOrder(reference) {
  const res = await axios.get(
    `${process.env.STORE_API_BASE}/orders/${reference}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.STORE_API_KEY}`,
      },
    },
  );

  return res.data.data || res.data;
}

startBot();

app.listen(3000, () => {
  console.log("Webhook server running on port 3000");
});
