'use strict';

// Разовый запуск для работы по расписанию (GitHub Actions и любой другой cron).
// Обновляет баннер если нужно, пишет отчёт и завершается.
// Код возврата 1 означает сбой — по нему расписание пришлёт оповещение.

require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { updateBanner, recordRateLimit, recordRetryAfter, limits } = require('./banner-core');
const { notify } = require('./notify');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

// Аварийный предохранитель: раннер не должен висеть вечно, если Discord не отвечает
const HARD_TIMEOUT_MS = 90 * 1000;

function stamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

async function fail(title, text) {
  console.error(`${stamp()}  ${title}: ${text}`);
  await notify(title, text, 'error');
  process.exit(1);
}

if (!TOKEN || !GUILD_ID) {
  fail('Бот не настроен', 'Не заданы DISCORD_TOKEN или GUILD_ID.');
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const guard = setTimeout(async () => {
  await fail('Обновление зависло', `Discord не ответил за ${HARD_TIMEOUT_MS / 1000} с. Запуск прерван.`);
}, HARD_TIMEOUT_MS);

guard.unref?.();

client.rest.on('rateLimited', (info) => {
  if (info.method === 'PATCH' && String(info.route || '').includes('/guilds/')) {
    recordRateLimit(info.timeToReset);
    console.warn(`${stamp()}  Discord придержал заливку на ${Math.round(info.timeToReset / 1000)} с`);
  }
});

client.once(Events.ClientReady, async (readyClient) => {
  try {
    console.log(`${stamp()}  вошёл как ${readyClient.user.tag}`);

    const dryRun = process.env.DRY_RUN === '1' || process.argv.includes('--dry');
    const result = await updateBanner(client, GUILD_ID, config, { dryRun });
    const { maxPerHour } = limits(config);

    switch (result.status) {
      case 'updated':
        console.log(
          `${stamp()}  баннер обновлён: ${result.signature}` +
            `  (${Math.round(result.bytes / 1024)} КБ, осталось в часу ${result.budgetLeft}/${maxPerHour})`,
        );
        if (!result.hashChanged) {
          await notify(
            'Баннер не сменился',
            'Discord принял запрос, но хеш баннера остался прежним. Стоит проверить сервер вручную.',
            'warn',
          );
        }
        break;

      case 'dry':
        console.log(
          `${stamp()}  холостой прогон: залил бы ${result.signature}` +
            ` (${Math.round(result.bytes / 1024)} КБ). На сервер ничего не отправлено.`,
        );
        break;

      case 'unchanged':
        console.log(`${stamp()}  цифры не изменились (${result.signature}) — заливка не нужна`);
        break;

      case 'cooldown':
        console.log(`${stamp()}  рано: до следующей заливки ${Math.round(result.waitMs / 1000)} с`);
        break;

      case 'budget':
        console.warn(`${stamp()}  часовой лимит исчерпан, окно через ${Math.round(result.waitMs / 60000)} мин.`);
        break;

      case 'no-banner':
        await fail(
          'Баннер недоступен',
          `У сервера нет уровня бустов для баннера (${result.detail}). Бот ничего не сделал.`,
        );
        break;

      default:
        console.log(`${stamp()}  статус: ${result.status}`);
    }

    clearTimeout(guard);
    await client.destroy();
    process.exit(0);
  } catch (err) {
    clearTimeout(guard);

    if (err.status === 429) {
      const penalty = recordRetryAfter(config, err);
      console.warn(`${stamp()}  лимит Discord, пауза ${Math.round(penalty / 60000)} мин.`);
      await client.destroy();
      process.exit(0);
    }

    if (err.status === 403) {
      await fail('Нет прав', 'Боту не хватает права «Управлять сервером» — баннер залить нельзя.');
    }

    await fail('Ошибка обновления баннера', `${err.name}: ${err.message}`);
  }
});

client.on(Events.Error, (err) => console.error(`${stamp()}  ошибка клиента: ${err.message}`));

client.login(TOKEN).catch(async (err) => {
  await fail('Не удалось войти в Discord', `${err.message}. Скорее всего токен отозван или неверен.`);
});
