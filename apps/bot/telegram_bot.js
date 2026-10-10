const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// Replace with the Telegram token from BotFather
const token = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN_HERE';
const bot = new TelegramBot(token, { polling: true });

// The URL of our Agent-generated ONDC Seller Microservice
const BPP_URL = process.env.BPP_URL || 'http://localhost:3000';

console.log("🟢 ONDC Telegram Buyer App is Live! Waiting for messages...");

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text.trim();

  // If the user says something like "Search Milk"
  if (text.toLowerCase().startsWith('search ')) {
    const query = text.substring(7);
    bot.sendMessage(chatId, `🔍 Searching ONDC Network for "${query}"...`);

    try {
      // 1. Act as the ONDC Gateway: Send a /search request to our AI-generated microservice
      // Note: In a real production setup, we would generate a cryptographic Ed25519 signature here.
      // For the demo, our simulator sends a mock signature that the Agent's server will accept.
      const response = await axios.post(`${BPP_URL}/search`, {
        context: {
          domain: "nic2004:52110",
          action: "search"
        },
        message: {
          intent: {
            item: { descriptor: { name: query } }
          }
        }
      }, {
        headers: {
          'Authorization': 'Signature keyId="mock-gateway",algorithm="ed25519",headers="(created) (expires) digest",signature="mock_valid_signature"'
        }
      });

      const catalog = response.data.message.catalog;
      const items = catalog['bpp/providers'][0].items;

      // 2. Format the JSON response into a nice UI (Chat Message)
      let reply = `🛒 **${catalog['bpp/descriptor'].name}** found ${items.length} items:\n\n`;
      
      items.forEach(item => {
        if (item.descriptor.name.toLowerCase().includes(query.toLowerCase())) {
          reply += `📦 ${item.descriptor.name}\n`;
          reply += `💰 ₹${item.price.value}\n`;
          reply += `✅ In Stock: ${item.quantity.available.count}\n`;
          reply += `🥬 Type: ${item.tags.veg ? 'Veg' : 'Non-Veg'}\n\n`;
        }
      });

      reply += `*(Powered by ONDC-AutoBridge Agent)*`;
      bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });

    } catch (error) {
      console.error(error);
      bot.sendMessage(chatId, "❌ ONDC Gateway Error: Could not reach the Seller Microservice. Is the Agent finished coding it?");
    }
  } else {
    bot.sendMessage(chatId, "👋 Welcome to the ONDC Buyer App! Type `Search <item>` (e.g. 'Search Milk') to browse the local catalog.", { parse_mode: 'Markdown' });
  }
});
