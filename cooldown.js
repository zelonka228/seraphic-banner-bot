'use strict';

// Память о том, когда бот в последний раз что-то записывал.
// Хранится на диске: после перезапуска бот помнит свой бюджет запросов
// и не отправляет вторую запись сразу вслед за предыдущей.

const fs = require('node:fs');
const path = require('node:path');

const FILE = path.join(__dirname, '.state.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return { channels: {}, banner: {} };
  }
}

function save(state) {
  try {
    fs.writeFileSync(FILE, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  } catch (err) {
    console.warn(`Не удалось сохранить .state.json: ${err.message}`);
  }
}

module.exports = { load, save };
