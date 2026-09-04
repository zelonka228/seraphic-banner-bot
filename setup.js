'use strict';

require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const {
  Client,
  GatewayIntentBits,
  Events,
  ChannelType,
  PermissionFlagsBits,
} = require('discord.js');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !GUILD_ID) {
  console.error('Заполни DISCORD_TOKEN и GUILD_ID в файле .env (шаблон — .env.example)');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async () => {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);

    const pending = Object.entries(config.counters).filter(
      ([, counter]) => counter.enabled && !counter.channelId,
    );

    if (pending.length === 0) {
      console.log('Все включённые счётчики уже привязаны к каналам. Запускай: npm start');
      await client.destroy();
      return;
    }

    const category = await guild.channels.create({
      name: config.categoryName,
      type: ChannelType.GuildCategory,
      position: 0,
    });

    console.log(`Категория создана: ${category.name}`);

    for (const [key, counter] of pending) {
      const channel = await guild.channels.create({
        name: counter.template.replace(/\{count\}/g, '0'),
        type: ChannelType.GuildVoice,
        parent: category.id,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.Connect],
            allow: [PermissionFlagsBits.ViewChannel],
          },
        ],
      });

      counter.channelId = channel.id;
      console.log(`  ${key} -> ${channel.name} (${channel.id})`);
    }

    fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    console.log('\nID каналов записаны в config.json. Теперь запускай: npm start');
  } catch (err) {
    console.error(`Не удалось создать каналы: ${err.message}`);
    console.error('Проверь, что у бота есть право "Управлять каналами".');
  } finally {
    await client.destroy();
  }
});

client.login(TOKEN);
