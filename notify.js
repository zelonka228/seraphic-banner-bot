'use strict';

// Оповещения о проблемах: Discord-вебхук и/или Telegram.
// Настраивается переменными окружения, любой канал можно не задавать.
//
//   ALERT_DISCORD_WEBHOOK  — ссылка вебхука канала
//   TELEGRAM_BOT_TOKEN     — токен бота от @BotFather
//   TELEGRAM_CHAT_ID       — твой chat_id

const COLORS = { error: 0xe24b4a, warn: 0xef9f27, info: 0x63c1f0 };

async function toDiscord(title, text, level) {
  const url = process.env.ALERT_DISCORD_WEBHOOK;
  if (!url) return null;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embeds: [
        {
          title,
          description: text.slice(0, 3900),
          color: COLORS[level] ?? COLORS.info,
          timestamp: new Date().toISOString(),
          footer: { text: 'Баннер-бот Seraphic Aurora' },
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`Discord ответил ${res.status}`);
  return 'discord';
}

async function toTelegram(title, text, level) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return null;

  const mark = level === 'error' ? '🔴' : level === 'warn' ? '🟡' : '🔵';
  const body = `${mark} <b>${escapeHtml(title)}</b>\n\n${escapeHtml(text)}`.slice(0, 4000);

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text: body, parse_mode: 'HTML' }),
  });

  if (!res.ok) throw new Error(`Telegram ответил ${res.status}`);
  return 'telegram';
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Падение самого оповещения никогда не должно ронять бота
async function notify(title, text, level = 'error') {
  const sent = [];

  for (const send of [toDiscord, toTelegram]) {
    try {
      const where = await send(title, text, level);
      if (where) sent.push(where);
    } catch (err) {
      console.warn(`Оповещение не ушло (${send.name}): ${err.message}`);
    }
  }

  if (sent.length === 0) {
    console.warn('Каналы оповещения не настроены — сообщение осталось только в логе.');
  }

  return sent;
}

module.exports = { notify };
