'use strict';

require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { load, save } = require('./cooldown');
const { collectStats, usesPresence } = require('./stats');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !GUILD_ID) {
  console.error('Заполни DISCORD_TOKEN и GUILD_ID в файле .env (шаблон — .env.example)');
  process.exit(1);
}

// Опрос статистики бесплатный — данные и так лежат в кэше клиента.
const POLL_MS = Math.max((config.pollSeconds || 30) * 1000, 15 * 1000);

// А вот переименование канала Discord ограничивает: 2 запроса за 10 минут на канал.
// Значит 5 минут — самый частый безопасный интервал записи, ниже опускать нельзя.
const FLOOR_MS = 5 * 60 * 1000;
const COOLDOWN_MS = Math.max((config.renameCooldownMinutes || 5) * 60 * 1000, FLOOR_MS);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

// Бюджет запросов переживает перезапуск — иначе рестарт обнулил бы счётчик
// и бот мог бы записать второй раз сразу после предыдущей записи.
const store = load();
if (!store.channels) store.channels = {};

function formatNumber(value) {
  return new Intl.NumberFormat('ru-RU').format(value).replace(/ /g, ' ');
}

const NEED_PRESENCE = usesPresence(
  Object.entries(config.counters)
    .filter(([, counter]) => counter.enabled && counter.channelId)
    .map(([key]) => key),
);

function slot(channelId) {
  if (!store.channels[channelId]) store.channels[channelId] = { lastWrite: 0, penalty: 0 };
  return store.channels[channelId];
}

async function syncCounter(key, counter, stats) {
  const channel = await client.channels.fetch(counter.channelId).catch(() => null);

  if (!channel) {
    console.warn(`[${key}] канал ${counter.channelId} не найден — проверь config.json`);
    return;
  }

  const name = counter.template.replace(/\{count\}/g, formatNumber(stats[key]));

  // Цифра не изменилась — писать нечего, лимит не тратим
  if (channel.name === name) return;

  const box = slot(counter.channelId);
  const wait = box.lastWrite + COOLDOWN_MS + box.penalty - Date.now();

  if (wait > 0) {
    // Значение уже другое, но окно записи ещё не открылось — обновим на следующем опросе
    return;
  }

  try {
    await channel.setName(name);
    box.lastWrite = Date.now();
    box.penalty = 0;
    save(store);
    console.log(`[${key}] ${name}`);
  } catch (err) {
    if (err.status === 429) {
      box.penalty = Math.min(box.penalty ? box.penalty * 2 : COOLDOWN_MS, 30 * 60 * 1000);
      box.lastWrite = Date.now();
      save(store);
      console.warn(`[${key}] лимит Discord, пауза ${Math.round(box.penalty / 60000)} мин.`);
    } else {
      console.error(`[${key}] не удалось переименовать: ${err.message}`);
    }
  }
}

async function tick() {
  try {
    const { stats } = await collectStats(client, GUILD_ID, {
      needPresence: NEED_PRESENCE,
      voice: config.voice,
    });

    for (const [key, counter] of Object.entries(config.counters)) {
      if (!counter.enabled || !counter.channelId) continue;
      await syncCounter(key, counter, stats);
    }
  } catch (err) {
    console.error(`Ошибка обновления: ${err.message}`);
  }
}

function inviteUrl(id) {
  // 48 = «Управлять каналами» (16) + «Управлять сервером» (32)
  return `https://discord.com/oauth2/authorize?client_id=${id}&scope=bot&permissions=48`;
}

async function checkGuild(readyClient) {
  const guild = readyClient.guilds.cache.get(GUILD_ID);

  if (!guild) {
    console.error('');
    console.error('Бот не добавлен на сервер (или GUILD_ID указан неверно).');
    console.error('Открой эту ссылку и выбери свой сервер:');
    console.error(`  ${inviteUrl(readyClient.user.id)}`);
    console.error('');
    return null;
  }

  const me = await guild.members.fetchMe();
  const missing = [];
  if (!me.permissions.has('ManageGuild')) missing.push('Управлять сервером');
  if (!me.permissions.has('ManageChannels')) missing.push('Управлять каналами');

  if (missing.length) {
    console.warn(`Не хватает прав: ${missing.join(', ')}`);
    console.warn('Выдай их роли бота в Настройки сервера → Роли, либо пригласи заново:');
    console.warn(`  ${inviteUrl(readyClient.user.id)}`);
  }

  console.log(`Сервер: ${guild.name} (${guild.memberCount} участников)`);
  return guild;
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Бот запущен как ${readyClient.user.tag}`);
  const guild = await checkGuild(readyClient);
  if (!guild) return;
  console.log(`Опрос каждые ${POLL_MS / 1000} с, запись не чаще раза в ${COOLDOWN_MS / 60000} мин. на канал`);
  await tick();
  setInterval(tick, POLL_MS);
});

client.rest.on('rateLimited', (info) => {
  console.warn(`Лимит Discord на ${info.route}: ждём ${Math.round(info.timeToReset / 1000)} с`);
});

client.on(Events.Error, (err) => console.error(`Ошибка клиента: ${err.message}`));

client.login(TOKEN);
