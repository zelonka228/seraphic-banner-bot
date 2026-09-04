'use strict';

// Прогон без подключения к Discord: проверяет рендер, конфиг и логику пауз.
// Запуск: npm test

const fs = require('node:fs');
const path = require('node:path');
const { renderBanner, WIDTH, HEIGHT } = require('./render-banner');
const { load, save } = require('./cooldown');
const { usesPresence, countVoice } = require('./stats');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  [+] ${name}`);
  } else {
    failed += 1;
    console.log(`  [-] ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// Повторяет расчёт размеров из render-banner, чтобы поймать выход за края холста
function badgeBox(style, text) {
  const fontSize = style.fontSize;
  const iconSize = fontSize * 0.95;
  const padX = fontSize * 0.56;
  const gap = fontSize * 0.36;
  // ширина цифр меряется по факту в рендере; здесь берём запас сверху
  const textWidth = text.length * fontSize * 0.62;
  return {
    width: Math.round(padX * 2 + iconSize + gap + textWidth),
    height: Math.round(fontSize * 1.6),
  };
}

function overflow(cfg, stats) {
  const style = cfg.banner.style;
  const horizontal = (style.direction || 'column') === 'row';
  let x = style.x;
  let y = style.y;
  let worstRight = 0;
  let worstBottom = 0;

  for (const badge of cfg.banner.badges) {
    const box = badgeBox(style, String(stats[badge.counter] ?? 0));
    worstRight = Math.max(worstRight, x + box.width);
    worstBottom = Math.max(worstBottom, y + box.height);
    if (horizontal) x += box.width + style.gap;
    else y += box.height + style.gap;
  }

  return { right: worstRight, bottom: worstBottom };
}

async function run() {
  console.log('\n--- Конфигурация ---');

  check('pollSeconds задан', typeof config.pollSeconds === 'number');
  check('renameCooldownMinutes не ниже 5', config.renameCooldownMinutes >= 5,
    `сейчас ${config.renameCooldownMinutes}`);
  check('uploadCooldownMinutes не ниже 5', config.banner.uploadCooldownMinutes >= 5,
    `сейчас ${config.banner.uploadCooldownMinutes}`);
  check('плашки заданы', Array.isArray(config.banner.badges) && config.banner.badges.length > 0);

  const known = ['members', 'online', 'voice', 'boosts'];
  const badCounter = config.banner.badges.find((b) => !known.includes(b.counter));
  check('счётчики плашек известны', !badCounter, badCounter && badCounter.counter);

  const knownIcons = ['mic', 'users', 'boost'];
  const badIcon = config.banner.badges.find((b) => !knownIcons.includes(b.icon));
  check('иконки плашек известны', !badIcon, badIcon && badIcon.icon);

  check('подложка на месте', fs.existsSync(path.join(__dirname, config.banner.sourceImage)),
    config.banner.sourceImage);

  console.log('\n--- Рендер ---');

  const cases = [
    { name: 'нули', stats: { members: 0, online: 0, voice: 0, boosts: 0 } },
    { name: 'живые цифры', stats: { members: 1408, online: 202, voice: 1, boosts: 24 } },
    { name: 'крупный сервер', stats: { members: 999999, online: 87654, voice: 512, boosts: 300 } },
  ];

  for (const item of cases) {
    try {
      const buffer = await renderBanner(item.stats, config);
      const isPng = buffer.length > 8 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
      check(`${item.name}: получен PNG`, isPng && buffer.length > 1000, `${buffer.length} байт`);
    } catch (err) {
      check(`${item.name}: получен PNG`, false, err.message);
    }
  }

  for (const direction of ['column', 'row']) {
    const cfg = clone(config);
    cfg.banner.style.direction = direction;
    try {
      const buffer = await renderBanner(cases[1].stats, cfg);
      check(`раскладка ${direction} рисуется`, buffer.length > 1000);
    } catch (err) {
      check(`раскладка ${direction} рисуется`, false, err.message);
    }
  }

  try {
    const cfg = clone(config);
    cfg.banner.sourceImage = 'assets/нет-такого-файла.png';
    const buffer = await renderBanner(cases[1].stats, cfg);
    check('без подложки не падает (рисует заглушку)', buffer.length > 1000);
  } catch (err) {
    check('без подложки не падает (рисует заглушку)', false, err.message);
  }

  try {
    const cfg = clone(config);
    cfg.banner.badges = [];
    const buffer = await renderBanner(cases[1].stats, cfg);
    check('пустой список плашек не падает', buffer.length > 1000);
  } catch (err) {
    check('пустой список плашек не падает', false, err.message);
  }

  console.log('\n--- Размещение на холсте ---');

  for (const item of cases) {
    const box = overflow(config, item.stats);
    check(`${item.name}: плашки не вылезают вправо`, box.right <= WIDTH,
      `край ${box.right} при ширине ${WIDTH}`);
    check(`${item.name}: плашки не вылезают вниз`, box.bottom <= HEIGHT,
      `край ${box.bottom} при высоте ${HEIGHT}`);
  }

  console.log('\n--- Память пауз ---');

  const store = load();
  if (!store.channels) store.channels = {};
  const before = clone(store);

  store.channels.__test__ = { lastWrite: Date.now() - 60 * 1000, penalty: 0 };
  save(store);

  const reloaded = load();
  check('состояние переживает перезапуск', !!(reloaded.channels && reloaded.channels.__test__));

  const cooldown = config.renameCooldownMinutes * 60 * 1000;
  const wait = reloaded.channels.__test__.lastWrite + cooldown - Date.now();
  check('пауза после недавней записи соблюдается', wait > 0, `осталось ${Math.round(wait / 1000)} с`);

  save(before);
  check('тестовая запись убрана', !load().channels.__test__);

  console.log('\n--- Оптимизация запросов ---');

  const counters = config.banner.badges.map((b) => b.counter);
  check('лишний запрос онлайна не делается', usesPresence(counters) === counters.includes('online'),
    `плашки: ${counters.join(', ')}`);


  console.log('\n--- Подсчёт войса ---');

  const fakeGuild = (states, afkChannelId) => ({
    afkChannelId,
    voiceStates: { cache: { filter: (fn) => ({ size: states.filter(fn).length }) } },
  });

  const states = [
    { channelId: 'general', member: { user: { bot: false } } },
    { channelId: 'general', member: { user: { bot: true } } },
    { channelId: 'afk', member: { user: { bot: false } } },
    { channelId: null, member: { user: { bot: false } } },
  ];
  const guild = fakeGuild(states, 'afk');

  check('боты не считаются', countVoice(guild, { excludeBots: true, excludeAfk: false }) === 2,
    `получилось ${countVoice(guild, { excludeBots: true, excludeAfk: false })}`);
  check('AFK не считается', countVoice(guild, { excludeBots: false, excludeAfk: true }) === 2,
    `получилось ${countVoice(guild, { excludeBots: false, excludeAfk: true })}`);
  check('оба фильтра вместе', countVoice(guild, { excludeBots: true, excludeAfk: true }) === 1,
    `получилось ${countVoice(guild, { excludeBots: true, excludeAfk: true })}`);
  check('без фильтров считаются все', countVoice(guild, { excludeBots: false, excludeAfk: false }) === 3);
  check('вышедшие из войса не считаются', countVoice(guild, {}) === 1);

  console.log('\n--- Часовой бюджет заливок ---');

  const cap = config.banner.maxUploadsPerHour;
  const now = Date.now();
  const budget = (uploads) => cap - uploads.filter((t) => t > now - 3600000).length;

  check('пустая история — бюджет полный', budget([]) === cap);
  check('старые заливки не считаются', budget([now - 3700000, now - 5000000]) === cap);
  check('свежие заливки списываются', budget([now - 60000, now - 120000]) === cap - 2);
  check('исчерпанный бюджет блокирует',
    budget(Array.from({ length: cap }, (_, i) => now - i * 60000)) <= 0);

  const perHourByCooldown = 60 / config.banner.uploadCooldownMinutes;
  check('кулдаун не даст превысить часовой потолок', perHourByCooldown <= cap,
    `кулдаун допускает ${perHourByCooldown}/час при потолке ${cap}`);

  console.log('');
  console.log(`  Пройдено: ${passed}, провалено: ${failed}`);
  console.log('');

  process.exit(failed ? 1 : 0);
}

run().catch((err) => {
  console.error(`Тесты упали: ${err.stack}`);
  process.exit(1);
});
