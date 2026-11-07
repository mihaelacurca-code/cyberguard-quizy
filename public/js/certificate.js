// Draws a participation certificate on a canvas and wraps it in a one-page PDF
// (A4 landscape). Everything happens in the participant's browser.
import { t, lang } from './i18n.js';
import { brandAccent } from './common.js';

const W = 2339; // A4 landscape at 200 dpi
const H = 1654;

const loadImage = (src) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = src;
});

function fitText(ctx, text, maxWidth, size, weight = 700, family = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif') {
  let s = size;
  do {
    ctx.font = `${weight} ${s}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    s -= 4;
  } while (s > 24);
  return s;
}

export async function drawCertificate(cert) {
  const accent = brandAccent(cert.color) || { main: '#f5b400', strong: '#ffd23f', glow: 'rgba(255,190,40,0.8)' };
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // background: deep navy with a soft gold glow
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#050920');
  bg.addColorStop(1, '#141f52');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.15, H * 0.15, 0, W * 0.15, H * 0.15, W * 0.6);
  glow.addColorStop(0, 'rgba(255,190,40,0.16)');
  glow.addColorStop(1, 'rgba(255,190,40,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // frame
  ctx.strokeStyle = accent.main;
  ctx.lineWidth = 6;
  ctx.shadowColor = accent.glow;
  ctx.shadowBlur = 24;
  ctx.strokeRect(70, 70, W - 140, H - 140);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = accent.main;
  ctx.lineWidth = 2;
  ctx.strokeRect(100, 100, W - 200, H - 200);
  ctx.globalAlpha = 1;

  const [mark, qr] = await Promise.all([loadImage(cert.logo || '/img/cyberguard-mark.svg'), loadImage(`/qr/cert/${cert.id}.svg`)]);
  if (mark) {
    // The client's logo (or the CYBERGUARD shield) fits a wide 1300 x 250 box above the title,
    // so a wide logo with text (crest + institution name) stays readable.
    const scale = Math.min(1300 / mark.width, 250 / mark.height);
    const w = mark.width * scale;
    const hgt = mark.height * scale;
    ctx.drawImage(mark, W / 2 - w / 2, 140 + (250 - hgt) / 2, w, hgt);
  }

  ctx.textAlign = 'center';
  if (!cert.hideProduct) {
    ctx.fillStyle = '#f4f1e8';
    ctx.font = '700 44px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
    ctx.fillText('CYBERGUARD Quizy', W / 2, 455);
  }

  ctx.fillStyle = accent.strong;
  ctx.font = '800 96px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  ctx.fillText(t('CERTIFICAT DE PARTICIPARE'), W / 2, 590);

  ctx.fillStyle = '#a4abc8';
  const intro = cert.intro || t('Prezentul certificat se acordă');
  fitText(ctx, intro, W - 500, 44, 400);
  ctx.fillText(intro, W / 2, 700);

  ctx.fillStyle = '#ffffff';
  fitText(ctx, cert.name, W - 500, 120, 800);
  ctx.fillText(cert.name, W / 2, 840);
  ctx.strokeStyle = accent.main;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 600, 880);
  ctx.lineTo(W / 2 + 600, 880);
  ctx.stroke();

  ctx.fillStyle = '#a4abc8';
  ctx.font = '400 44px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  ctx.fillText(t('pentru participarea la'), W / 2, 970);
  ctx.fillStyle = '#f4f1e8';
  fitText(ctx, cert.event, W - 500, 64, 700);
  ctx.fillText(cert.event, W / 2, 1060);

  const date = new Date(cert.issuedAt).toLocaleDateString(lang === 'ro' ? 'ro-RO' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const details = [date];
  if (cert.score !== null && cert.score !== undefined) details.push(t('Scor la testul final: {score}%', { score: cert.score }));
  ctx.fillStyle = '#a4abc8';
  ctx.font = '400 40px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  ctx.fillText(details.join('   ·   '), W / 2, 1160);

  // issuer (left) and verification (right)
  ctx.textAlign = 'left';
  if (cert.issuer) {
    ctx.fillStyle = '#f4f1e8';
    ctx.font = '700 44px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
    ctx.fillText(cert.issuer, 220, 1400);
    ctx.fillStyle = '#a4abc8';
    ctx.font = '400 32px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
    ctx.fillText(t('Emis de'), 220, 1350);
  }
  const verifyUrl = `${location.host}/v/${cert.id}`;
  ctx.textAlign = 'right';
  ctx.fillStyle = '#a4abc8';
  ctx.font = '400 30px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  ctx.fillText(t('Verificare: {url}', { url: verifyUrl }), W - 430, 1400);
  ctx.fillText(t('Cod certificat: {id}', { id: cert.id }), W - 430, 1350);
  if (qr) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(W - 400, 1240, 200, 200);
    ctx.drawImage(qr, W - 392, 1248, 184, 184);
  }
  return canvas;
}

// Minimal PDF: one page, one JPEG image filling it.
function jpegPdf(jpeg, pageW = 842, pageH = 595) {
  const enc = new TextEncoder();
  const parts = [];
  const offsets = [];
  let length = 0;
  const push = (chunk) => {
    const bytes = typeof chunk === 'string' ? enc.encode(chunk) : chunk;
    parts.push(bytes);
    length += bytes.length;
  };
  const obj = (n, body) => { offsets[n] = length; push(`${n} 0 obj\n${body}\nendobj\n`); };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  offsets[4] = length;
  push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
  push(jpeg);
  push('\nendstream\nendobj\n');
  const content = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q`;
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const xref = length;
  let table = 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i++) table += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  push(`${table}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(length);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export async function downloadCertificate(cert) {
  const canvas = await drawCertificate(cert);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
  const jpeg = new Uint8Array(await blob.arrayBuffer());
  const pdf = new Blob([jpegPdf(jpeg)], { type: 'application/pdf' });
  const url = URL.createObjectURL(pdf);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${t('certificat')}-${cert.name.replace(/[^\p{L}\p{N}]+/gu, '-')}.pdf`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
