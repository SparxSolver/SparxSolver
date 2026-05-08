require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');

const bot = new Client({
  intents: [GatewayIntentBits.Guilds]
});

bot.once('clientReady', () => {
  console.log(`${bot.user.tag}`);
});

bot.login(process.env.TOKEN);