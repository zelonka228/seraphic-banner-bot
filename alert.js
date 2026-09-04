'use strict';

// Отправка произвольного текста в настроенные каналы оповещения.
// Используется расписанием, когда сам запуск бота упал:
//   node alert.js "Заголовок" "Текст"

// dotenv нужен только при локальном запуске; в GitHub переменные приходят из прогона,
// и без установленных пакетов файл всё равно должен работать
try {
  require('dotenv').config();
} catch {
  // пакетов нет — читаем переменные окружения как есть
}

const { notify } = require('./notify');

const title = process.argv[2] || 'Сбой баннер-бота';
const text = process.argv[3] || 'Запуск завершился с ошибкой. Подробности в логах.';

notify(title, text, 'error')
  .then((sent) => {
    console.log(sent.length ? `Оповещение отправлено: ${sent.join(', ')}` : 'Каналы оповещения не настроены');
    process.exit(0);
  })
  .catch((err) => {
    console.error(`Не удалось отправить оповещение: ${err.message}`);
    process.exit(0);
  });
