'use strict';

// Оповещения о проблемах: Discord-вебхук и/или Telegram.
// Настраивается переменными окружения, любой канал можно не задавать.
//
//   ALERT_DISCORD_WEBHOOK  — ссылка вебхука канала
//   TELEGRAM_BOT_TOKEN     — токен бота от @BotFather
//   TELEGRAM_CHAT_ID       — твой chat_id

const COLORS = {
  error: 0xe24b4a,   // красный
  warn: 0xef9f27,    // жёлтый
  info: 0x63c1f0,    // синий
  success: 0x63c96f, // зелёный
};

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

  const marks = { error: '🔴', warn: '🟡', success: '🟢', info: '🔵' };
  const mark = marks[level] || marks.info;
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


// Живая карточка состояния в Discord: одно сообщение, которое бот переписывает
// после каждой проверки. Если время на нём застыло — значит бот молчит.
async function updateStatus(fields, state) {
  const url = process.env.ALERT_DISCORD_WEBHOOK;
  if (!url) return null;

  const embed = {
    title: fields.ok ? 'Баннер обновляется' : 'Баннер не обновляется',
    color: fields.ok ? 0x63c96f : COLORS.error,
    fields: [
      { name: 'Последняя проверка', value: fields.checkedAt, inline: true },
      { name: 'Последняя заливка', value: fields.uploadedAt, inline: true },
      { name: '​', value: '​', inline: true },
      { name: 'В войсе', value: String(fields.voice), inline: true },
      { name: 'Участников', value: String(fields.members), inline: true },
      { name: 'Заливок в этом часу', value: fields.budget, inline: true },
    ],
    footer: { text: fields.note || 'Проверка каждые 10 минут' },
    timestamp: new Date().toISOString(),
  };

  const id = state?.statusMessageId;

  // Пробуем переписать старое сообщение, чтобы канал не засорялся
  if (id) {
    const res = await fetch(`${url}/messages/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });
    if (res.ok) return id;
    // Сообщение удалили — заведём новое
  }

  const res = await fetch(`${url}?wait=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] }),
  });

  if (!res.ok) throw new Error(`Discord ответил ${res.status}`);
  const created = await res.json();
  return created.id;
}

// Пинг сторожевого сервиса: он сам поднимет тревогу, если пинг не пришёл вовремя.
// Единственное, что ловит полное молчание бота.
async function ping(ok = true) {
  const url = process.env.HEALTHCHECK_URL;
  if (!url) return false;

  try {
    await fetch(ok ? url : `${url}/fail`, { method: 'POST' });
    return true;
  } catch (err) {
    console.warn(`Сторожевой пинг не ушёл: ${err.message}`);
    return false;
  }
}

module.exports = { notify, updateStatus, ping };
