'use strict';

// Проверочный прогон: подключается к Discord, показывает что видит бот
// и что он нарисует, но НИЧЕГО не меняет на сервере.

require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { renderBanner } = require('./render-banner');
const { collectStats } = require('./stats');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !GUILD_ID) {
  console.error('Заполни DISCORD_TOKEN и GUILD_ID в файле .env');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const ok = (text) => console.log(`  [+] ${text}`);
const no = (text) => console.log(`  [-] ${text}`);

client.once(Events.ClientReady, async (readyClient) => {
  let blocking = 0;

  try {
    console.log('');
    ok(`подключился как ${readyClient.user.tag}`);

    const guild = await client.guilds
      .fetch({ guild: GUILD_ID, withCounts: true })
      .catch(() => null);

    if (!guild) {
      no('сервер не найден: бот не добавлен или GUILD_ID неверный');
      console.log(
        `      https://discord.com/oauth2/authorize?client_id=${readyClient.user.id}&scope=bot&permissions=48`,
      );
      await client.destroy();
      process.exit(1);
    }

    ok(`сервер: ${guild.name}`);

    const me = await guild.members.fetchMe();

    if (me.permissions.has('ManageGuild')) {
      ok('право «Управлять сервером» есть — баннер заливать можно');
    } else {
      no('нет права «Управлять сервером» — баннер залить не выйдет');
      blocking += 1;
    }

    if (me.permissions.has('ManageChannels')) {
      ok('право «Управлять каналами» есть — счётчики-каналы доступны');
    } else {
      no('нет права «Управлять каналами» — только для счётчиков-каналов');
    }

    if (guild.features.includes('BANNER')) {
      ok(`баннер доступен (уровень бустов ${guild.premiumTier}, бустов ${guild.premiumSubscriptionCount})`);
    } else {
      no(`баннера нет: нужен 2-й уровень бустов, сейчас уровень ${guild.premiumTier} (${guild.premiumSubscriptionCount} бустов)`);
      blocking += 1;
    }

    const { stats } = await collectStats(client, GUILD_ID, { voice: config.voice });

    console.log('');
    console.log('  Что бот видит прямо сейчас:');
    console.log(`    участников  ${stats.members}`);
    console.log(`    онлайн      ${stats.online}`);
    console.log(`    в войсе     ${stats.voice}`);
    console.log(`    бустов      ${stats.boosts}`);

    console.log('');
    console.log('  Что попадёт на плашки:');
    for (const badge of config.banner.badges) {
      console.log(`    ${badge.icon.padEnd(6)} ${stats[badge.counter]}`);
    }

    const image = await renderBanner(stats, config);
    fs.writeFileSync(path.join(__dirname, 'preview-live.png'), image);

    console.log('');
    ok('картинка отрисована с живыми цифрами: preview-live.png');
    console.log('');

    if (blocking) {
      console.log(`  Заливать пока нельзя: причин ${blocking}. Смотри строки со знаком [-].`);
    } else {
      console.log('  Всё готово. Запускай:  npm run banner');
    }

    console.log('');
  } catch (err) {
    console.error(`Ошибка проверки: ${err.message}`);
  } finally {
    await client.destroy();
  }
});

client.on(Events.Error, (err) => console.error(`Ошибка клиента: ${err.message}`));

client.login(TOKEN).catch((err) => {
  console.error(`Не удалось войти: ${err.message}`);
  console.error('Скорее всего неверный DISCORD_TOKEN в .env — сгенерируй заново (Bot → Reset Token).');
  process.exit(1);
});
