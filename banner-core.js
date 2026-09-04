'use strict';

// Одно обновление баннера со всеми проверками лимитов.
// Используется и постоянным режимом (banner.js), и разовым запуском по расписанию (once.js).

const crypto = require('node:crypto');
const { renderBanner } = require('./render-banner');
const { load, save } = require('./cooldown');
const { collectStats, usesPresence } = require('./stats');

const FLOOR_MS = 5 * 60 * 1000;

function limits(config) {
  return {
    cooldownMs: Math.max((config.banner.uploadCooldownMinutes || 10) * 60 * 1000, FLOOR_MS),
    maxPerHour: Math.min(Math.max(config.banner.maxUploadsPerHour || 6, 1), 12),
  };
}

function budgetLeft(box, maxPerHour) {
  const hourAgo = Date.now() - 60 * 60 * 1000;
  box.uploads = (box.uploads || []).filter((time) => time > hourAgo);
  return maxPerHour - box.uploads.length;
}

// Возвращает описание того, что произошло, вместо того чтобы печатать самому:
// вызывающий решает, как это показать и надо ли оповещать.
async function updateBanner(client, guildId, config, options = {}) {
  const { ignoreCooldown = false, dryRun = false } = options;
  const { cooldownMs, maxPerHour } = limits(config);

  const store = load();
  if (!store.banner) store.banner = {};
  const box = store.banner;

  const needPresence = usesPresence(config.banner.badges.map((badge) => badge.counter));
  const { guild, stats } = await collectStats(client, guildId, {
    needPresence,
    voice: config.voice,
  });

  if (!guild.features.includes('BANNER')) {
    return { status: 'no-banner', stats, detail: `уровень бустов ${guild.premiumTier}` };
  }

  // В отпечаток входят не только цифры, но и оформление: иначе правка стиля
  // в config.json осталась бы незамеченной — цифры прежние, значит «заливать нечего».
  const look = crypto
    .createHash('sha1')
    .update(JSON.stringify({ badges: config.banner.badges, style: config.banner.style }))
    .digest('hex')
    .slice(0, 8);

  const counts = config.banner.badges.map((badge) => stats[badge.counter]).join('|');
  const signature = `${look}:${counts}`;

  if (signature === box.signature) {
    return { status: 'unchanged', stats, signature };
  }

  if (!ignoreCooldown) {
    const wait = (box.lastUpload || 0) + cooldownMs + (box.penalty || 0) - Date.now();
    if (wait > 0) {
      return { status: 'cooldown', stats, signature, waitMs: wait };
    }
  }

  const left = budgetLeft(box, maxPerHour);
  if (left <= 0) {
    const oldest = Math.min(...box.uploads);
    return {
      status: 'budget',
      stats,
      signature,
      waitMs: oldest + 60 * 60 * 1000 - Date.now(),
    };
  }

  const before = guild.banner;
  const image = await renderBanner(stats, config);

  // Холостой прогон: всё посчитано и нарисовано, но на сервер ничего не уходит
  if (dryRun) {
    return { status: 'dry', stats, signature, bytes: image.length, budgetLeft: left };
  }

  const updated = await guild.setBanner(image, 'Обновление счётчиков на баннере');

  box.signature = signature;
  box.lastUpload = Date.now();
  box.penalty = 0;
  box.uploads.push(box.lastUpload);
  save(store);

  return {
    status: 'updated',
    stats,
    signature,
    hashChanged: Boolean(updated.banner && updated.banner !== before),
    budgetLeft: budgetLeft(box, maxPerHour),
    bytes: image.length,
  };
}

// Discord сам говорит, сколько ждать — записываем это на диск,
// чтобы перезапуск не сбросил паузу.
function recordRateLimit(timeToResetMs) {
  const store = load();
  if (!store.banner) store.banner = {};
  store.banner.penalty = Math.max(store.banner.penalty || 0, timeToResetMs);
  store.banner.lastUpload = Date.now();
  save(store);
}

function recordRetryAfter(config, err) {
  const store = load();
  if (!store.banner) store.banner = {};
  const box = store.banner;
  const { cooldownMs } = limits(config);

  box.penalty = err.retryAfter
    ? err.retryAfter * 1000
    : Math.min(box.penalty ? box.penalty * 2 : cooldownMs, 60 * 60 * 1000);
  box.lastUpload = Date.now();
  save(store);

  return box.penalty;
}

module.exports = { updateBanner, recordRateLimit, recordRetryAfter, limits };
