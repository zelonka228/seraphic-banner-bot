'use strict';

// Отправка произвольного текста в настроенные каналы оповещения.
// Используется расписанием, когда сам запуск бота упал:
//   node alert.js "Заголовок" "Текст"

require('dotenv').config();

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
