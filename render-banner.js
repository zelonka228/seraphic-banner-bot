'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

// Рекомендованный Discord размер баннера сервера
const WIDTH = 960;
const HEIGHT = 540;

// Свой шрифт кладётся в assets/font.ttf — иначе берём системный.
// На Linux-хостинге системных шрифтов обычно нет, файл обязателен.
function resolveFont() {
  const custom = path.join(__dirname, 'assets', 'font.ttf');

  if (fs.existsSync(custom)) {
    GlobalFonts.registerFromPath(custom, 'BannerFont');
    return 'BannerFont';
  }

  const installed = GlobalFonts.families.map((f) => f.family);
  return ['Segoe UI', 'Arial', 'DejaVu Sans'].find((f) => installed.includes(f)) || 'sans-serif';
}

const FONT = resolveFont();

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawMic(ctx, cx, cy, size, color) {
  const w = size * 0.4;
  ctx.fillStyle = color;
  roundedRect(ctx, cx - w / 2, cy - size * 0.48, w, size * 0.6, w / 2);
  ctx.fill();

  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, size * 0.1);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy + size * 0.02, size * 0.33, 0, Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy + size * 0.35);
  ctx.lineTo(cx, cy + size * 0.5);
  ctx.stroke();
}

function drawUsers(ctx, cx, cy, size, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx + size * 0.24, cy - size * 0.14, size * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + size * 0.24, cy + size * 0.4, size * 0.28, Math.PI, 0);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx - size * 0.13, cy - size * 0.18, size * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx - size * 0.13, cy + size * 0.42, size * 0.33, Math.PI, 0);
  ctx.fill();
}

function drawBoost(ctx, cx, cy, size, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - size * 0.46);
  ctx.lineTo(cx + size * 0.42, cy);
  ctx.lineTo(cx, cy + size * 0.46);
  ctx.lineTo(cx - size * 0.42, cy);
  ctx.closePath();
  ctx.fill();
}

const ICONS = { mic: drawMic, users: drawUsers, boost: drawBoost };

function drawBadge(ctx, x, y, icon, text, style) {
  ctx.font = `500 ${style.fontSize}px "${FONT}"`;

  const iconSize = style.fontSize * 0.95;
  const padX = style.fontSize * 0.56;
  const gap = style.fontSize * 0.36;
  const height = Math.round(style.fontSize * 1.6);
  const width = Math.round(padX * 2 + iconSize + gap + ctx.measureText(text).width);

  // Подложка: мягкая тень отрывает плашку от пёстрой картинки
  ctx.save();
  if (style.shadow > 0) {
    ctx.shadowColor = style.shadowColor || 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = style.fontSize * 0.5;
    ctx.shadowOffsetY = style.fontSize * 0.1;
  }
  ctx.globalAlpha = style.opacity;
  ctx.fillStyle = style.background;
  roundedRect(ctx, x, y, width, height, style.radius);
  ctx.fill();
  ctx.restore();

  if (style.borderWidth > 0) {
    ctx.save();
    ctx.strokeStyle = style.border || style.text;
    ctx.lineWidth = style.borderWidth;
    roundedRect(
      ctx,
      x + style.borderWidth / 2,
      y + style.borderWidth / 2,
      width - style.borderWidth,
      height - style.borderWidth,
      style.radius,
    );
    ctx.stroke();
    ctx.restore();
  }

  const draw = ICONS[icon] || ICONS.users;
  draw(ctx, x + padX + iconSize / 2, y + height / 2, iconSize, style.text);

  ctx.fillStyle = style.text;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + padX + iconSize + gap, y + height / 2 + 1);

  return { width, height };
}

async function drawBackground(ctx, sourceImage) {
  const file = path.join(__dirname, sourceImage || '');

  if (sourceImage && fs.existsSync(file)) {
    const image = await loadImage(file);
    // cover: заполняем весь баннер без искажения пропорций
    const scale = Math.max(WIDTH / image.width, HEIGHT / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    ctx.drawImage(image, (WIDTH - w) / 2, (HEIGHT - h) / 2, w, h);
    return true;
  }

  // Заглушка в розово-белой палитре — чтобы preview был похож на боевой баннер
  ctx.fillStyle = '#fdeef7';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  let seed = 20260902;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  const bokeh = ['#f9c2e2', '#f7a8d8', '#ffd9ef', '#ffffff', '#f28fcb'];

  for (let i = 0; i < 90; i += 1) {
    ctx.save();
    ctx.globalAlpha = 0.16 + random() * 0.4;
    ctx.fillStyle = bokeh[Math.floor(random() * bokeh.length)];
    ctx.beginPath();
    ctx.arc(random() * WIDTH, random() * HEIGHT, 16 + random() * 96, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.restore();

  return false;
}

async function renderBanner(stats, config) {
  const cfg = config.banner;
  const style = cfg.style;

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  const hasImage = await drawBackground(ctx, cfg.sourceImage);

  // Затемнение под плашками, чтобы цифры читались на любой картинке
  if (hasImage && style.scrim > 0) {
    ctx.save();
    ctx.globalAlpha = style.scrim;
    ctx.fillStyle = style.scrimColor || '#000000';
    ctx.fillRect(0, 0, WIDTH * 0.42, HEIGHT);
    ctx.restore();
  }

  // direction: 'column' — плашки друг под другом, 'row' — в одну линию
  const horizontal = (style.direction || 'column') === 'row';

  let x = style.x;
  let y = style.y;

  for (const badge of cfg.badges) {
    const value = stats[badge.counter] ?? 0;
    const formatted =
      badge.locale && badge.locale !== 'none' ? value.toLocaleString(badge.locale) : String(value);
    const text = `${badge.prefix || ''}${formatted}`;

    const size = drawBadge(ctx, x, y, badge.icon, text, style);

    if (horizontal) x += size.width + style.gap;
    else y += size.height + style.gap;
  }

  return canvas.encode('png');
}

module.exports = { renderBanner, WIDTH, HEIGHT };
