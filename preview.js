'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { renderBanner } = require('./render-banner');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

// Выдуманные цифры — чтобы посмотреть вёрстку до запуска на сервере
const stats = { members: 55335, online: 4821, voice: 32, boosts: 24 };

renderBanner(stats, config)
  .then((buffer) => {
    const out = path.join(__dirname, 'preview.png');
    fs.writeFileSync(out, buffer);
    console.log(`Готово: ${out}`);
  })
  .catch((err) => {
    console.error(`Ошибка рендера: ${err.message}`);
    process.exit(1);
  });
