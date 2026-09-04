'use strict';

// Сбор статистики сервера, общий для всех режимов бота.
//
// Тонкость: guilds.fetch({ withCounts: true }) в discord.js не заполняет
// approximatePresenceCount — поле остаётся null, и онлайн выглядел бы нулём.
// Поэтому счётчик онлайна берём прямым REST-запросом.

function countVoice(guild, options = {}) {
  const { excludeBots = true, excludeAfk = true } = options;

  return guild.voiceStates.cache.filter((state) => {
    if (!state.channelId) return false;

    // Ушедший в AFK формально в войсе, но активным его считать неправильно
    if (excludeAfk && guild.afkChannelId && state.channelId === guild.afkChannelId) return false;

    // Музыкальный бот сидит в канале сутками и навсегда завысил бы счётчик
    if (excludeBots && state.member?.user?.bot) return false;

    return true;
  }).size;
}

async function collectStats(client, guildId, options = {}) {
  const { needPresence = true, voice = {} } = options;

  const guild = await client.guilds.fetch(guildId);

  let online = 0;

  if (needPresence) {
    try {
      const raw = await client.rest.get(`/guilds/${guildId}`, {
        query: new URLSearchParams({ with_counts: 'true' }),
      });
      online = raw.approximate_presence_count ?? 0;
    } catch (err) {
      console.warn(`Не удалось получить онлайн: ${err.message}`);
    }
  }

  return {
    guild,
    stats: {
      members: guild.memberCount ?? 0,
      online,
      voice: countVoice(guild, voice),
      boosts: guild.premiumSubscriptionCount ?? 0,
    },
  };
}

// Онлайн стоит дополнительного запроса — дёргаем его, только если он реально нужен
function usesPresence(list) {
  return list.some((item) => item === 'online');
}

module.exports = { collectStats, usesPresence, countVoice };
