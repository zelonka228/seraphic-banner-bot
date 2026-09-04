'use strict';

require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { updateBanner, recordRateLimit, recordRetryAfter, limits } = require('./banner-core');
const { notify } = require('./notify');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !GUILD_ID) {
  console.error('Заполни DISCORD_TOKEN и GUILD_ID в файле .env (шаблон — .env.example)');
  process.exit(1);
}

const POLL_MS = Math.max((config.pollSeconds || 30) * 1000, 15 * 1000);

// Лимит на изменение самого сервера Discord не публикует. 5 минут — нижняя
// граница, на которой заливка ведёт себя стабильно; 10 минут спокойнее.
const { cooldownMs: COOLDOWN_MS, maxPerHour: MAX_PER_HOUR } = limits(config);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

let fails = 0;


function stamp() {
  return new Date().toLocaleTimeString('ru-RU');
}

function minutes(ms) {
  return Math.max(1, Math.round(ms / 60000));
}


async function tick() {
  try {
    const result = await updateBanner(client, GUILD_ID, config);

    if (result.status === 'updated') {
      console.log(
        `${stamp()}  баннер обновлён: ${result.signature}` +
          `${result.hashChanged ? '' : ' (внимание: хеш баннера не изменился)'}` +
          `  осталось в этом часу: ${result.budgetLeft}`,
      );
    } else if (result.status === 'no-banner') {
      console.error(`${stamp()}  у сервера нет баннера (${result.detail}) — обновление пропущено`);
    } else if (result.status === 'budget') {
      console.warn(`${stamp()}  часовой лимит исчерпан, окно через ${minutes(result.waitMs)} мин.`);
    }
  } catch (err) {
    if (err.status === 429) {
      const penalty = recordRetryAfter(config, err);
      console.warn(`${stamp()}  лимит Discord, пауза ${minutes(penalty)} мин.`);
      return;
    }

    console.error(`${stamp()}  не удалось обновить баннер: ${err.message}`);
    fails += 1;

    // Разовый сбой сети не повод будить владельца, три подряд — уже повод
    if (fails === 3) {
      await notify('Баннер-бот не может обновить баннер', `${err.name}: ${err.message}`, 'error');
    }
    return;
  }

  fails = 0;
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

  if (!me.permissions.has('ManageGuild')) {
    console.error('Нет права «Управлять сервером» — баннер залить не выйдет.');
    console.error(`Выдай его роли бота или пригласи заново: ${inviteUrl(readyClient.user.id)}`);
    return null;
  }

  console.log(`Сервер: ${guild.name} (${guild.memberCount} участников)`);
  return guild;
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Бот запущен как ${readyClient.user.tag}`);

  const guild = await checkGuild(readyClient);
  if (!guild) return;

  console.log(
    `Опрос каждые ${POLL_MS / 1000} с, заливка не чаще раза в ${COOLDOWN_MS / 60000} мин., ` +
      `не более ${MAX_PER_HOUR} в час`,
  );

  await tick();
  setInterval(tick, POLL_MS);
});

// Discord сам сообщает, когда мы упёрлись в лимит — переносим паузу ровно
// на то время, которое он назвал, вместо угадывания.
client.rest.on('rateLimited', (info) => {
  const guildEdit = info.method === 'PATCH' && String(info.route || '').includes('/guilds/');

  if (guildEdit) {
    recordRateLimit(info.timeToReset);
    console.warn(`${stamp()}  Discord придержал заливку на ${Math.round(info.timeToReset / 1000)} с — пауза продлена`);
  } else {
    console.warn(`${stamp()}  лимит на ${info.route}: ждём ${Math.round(info.timeToReset / 1000)} с`);
  }
});

client.on(Events.Error, (err) => console.error(`Ошибка клиента: ${err.message}`));

client.login(TOKEN);
