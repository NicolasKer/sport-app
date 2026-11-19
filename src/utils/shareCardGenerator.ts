import { WorkoutSummaryData } from '../components/WorkoutSummaryModal';

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawTextEllipsis(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number
) {
  let t = text;
  if (ctx.measureText(t).width <= maxWidth) {
    ctx.fillText(t, x, y);
    return;
  }
  while (t.length > 3 && ctx.measureText(`${t}…`).width > maxWidth) {
    t = t.slice(0, -1);
  }
  ctx.fillText(`${t}…`, x, y);
}

export async function renderWorkoutShareCard(
  summary: WorkoutSummaryData,
  profileName?: string
): Promise<Blob> {
  const width = 1080;
  const height = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponible');

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#090d16');
  bg.addColorStop(0.55, '#0f172a');
  bg.addColorStop(1, '#09141d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Decorative glows
  const glowTop = ctx.createRadialGradient(860, 180, 20, 860, 180, 520);
  glowTop.addColorStop(0, 'rgba(16, 185, 129, 0.25)');
  glowTop.addColorStop(1, 'rgba(16, 185, 129, 0)');
  ctx.fillStyle = glowTop;
  ctx.fillRect(0, 0, width, height);

  const glowBot = ctx.createRadialGradient(180, 1120, 20, 180, 1120, 480);
  glowBot.addColorStop(0, 'rgba(6, 182, 212, 0.2)');
  glowBot.addColorStop(1, 'rgba(6, 182, 212, 0)');
  ctx.fillStyle = glowBot;
  ctx.fillRect(0, 0, width, height);

  // Frame border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 3;
  roundRect(ctx, 48, 48, width - 96, height - 96, 44);
  ctx.stroke();

  // Header brand
  ctx.fillStyle = '#10b981';
  roundRect(ctx, 96, 102, 16, 44, 8);
  ctx.fill();

  ctx.fillStyle = '#f8fafc';
  ctx.font = '800 36px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('IRONPULSE', 128, 136);

  if (profileName) {
    ctx.fillStyle = '#38bdf8';
    ctx.font = '700 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(profileName.toUpperCase(), width - 96, 134);
    ctx.textAlign = 'left';
  }

  // Date & Session title
  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 30px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(`SÉANCE VALIDÉE · ${summary.date}`, 96, 224);

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 72px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  drawTextEllipsis(ctx, summary.sessionName, 96, 312, width - 192);

  // Hero Tonnage Card
  const heroGrad = ctx.createLinearGradient(96, 368, width - 96, 610);
  heroGrad.addColorStop(0, 'rgba(16, 185, 129, 0.22)');
  heroGrad.addColorStop(1, 'rgba(6, 182, 212, 0.16)');
  ctx.fillStyle = heroGrad;
  roundRect(ctx, 96, 368, width - 192, 240, 32);
  ctx.fill();
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.45)';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.fillStyle = '#6ee7b7';
  ctx.font = '700 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('TONNAGE TOTAL SOULEVÉ', 136, 424);

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 92px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(`${Math.round(summary.totalTonnage).toLocaleString('fr-FR')} kg`, 136, 530);

  if (summary.previousSessionTonnage && summary.previousSessionTonnage > 0) {
    const diff = Math.round(summary.totalTonnage - summary.previousSessionTonnage);
    const pct = Math.round((diff / summary.previousSessionTonnage) * 100);
    ctx.fillStyle = diff >= 0 ? '#34d399' : '#94a3b8';
    ctx.font = '700 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(
      `${diff >= 0 ? `+${diff}` : diff} kg (${pct >= 0 ? `+${pct}` : pct}%) vs dernière séance`,
      136,
      582
    );
  }

  // Two secondary stat boxes (Sets & Duration)
  const colW = (width - 192 - 28) / 2;
  ctx.fillStyle = 'rgba(24, 34, 53, 0.9)';
  roundRect(ctx, 96, 640, colW, 175, 28);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.stroke();

  ctx.fillStyle = '#94a3b8';
  ctx.font = '700 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('SÉRIES VALIDÉES', 132, 696);
  ctx.fillStyle = '#f8fafc';
  ctx.font = '900 62px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(`${summary.totalSets}`, 132, 774);

  const rightX = 96 + colW + 28;
  ctx.fillStyle = 'rgba(24, 34, 53, 0.9)';
  roundRect(ctx, rightX, 640, colW, 175, 28);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.stroke();

  ctx.fillStyle = '#94a3b8';
  ctx.font = '700 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('DURÉE EFFORT', rightX + 36, 696);
  ctx.fillStyle = '#f8fafc';
  ctx.font = '900 62px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(`${Math.max(1, summary.durationMinutes)} min`, rightX + 36, 774);

  // Records & Paliers section
  let cursorY = 855;
  if (summary.newRecords.length > 0) {
    ctx.fillStyle = 'rgba(245, 158, 11, 0.14)';
    roundRect(ctx, 96, cursorY, width - 192, 165, 26);
    ctx.fill();
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
    ctx.stroke();

    ctx.fillStyle = '#fbbf24';
    ctx.font = '800 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(`RECORDS PERSONNELS (${summary.newRecords.length})`, 132, cursorY + 52);

    ctx.fillStyle = '#fef3c7';
    ctx.font = '700 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const prText = summary.newRecords
      .slice(0, 2)
      .map((p) => `${p.exercise.split('(')[0].trim()} (${p.weightKg}kg × ${p.reps})`)
      .join('  ·  ');
    drawTextEllipsis(ctx, prText, 132, cursorY + 108, width - 264);
    cursorY += 192;
  }

  if (summary.validatedPaliers.length > 0) {
    ctx.fillStyle = 'rgba(16, 185, 129, 0.14)';
    roundRect(ctx, 96, cursorY, width - 192, 155, 26);
    ctx.fill();
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.35)';
    ctx.stroke();

    ctx.fillStyle = '#34d399';
    ctx.font = '800 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('PALIERS VALIDÉS (+2,5 KG PROCHAINE FOIS)', 132, cursorY + 50);

    ctx.fillStyle = '#ecfdf5';
    ctx.font = '700 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const palText = summary.validatedPaliers
      .map((ex) => ex.split('(')[0].trim())
      .join('  ·  ');
    drawTextEllipsis(ctx, palText, 132, cursorY + 104, width - 264);
  }

  // Footer watermark
  ctx.fillStyle = '#64748b';
  ctx.font = '600 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('nicolasker.github.io/sport-app', 96, height - 92);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Impossible de générer l’image'));
    }, 'image/png');
  });
}

export async function shareOrDownloadRecapCard(
  summary: WorkoutSummaryData,
  profileName?: string
): Promise<{ method: 'share' | 'download' | 'cancelled' }> {
  const blob = await renderWorkoutShareCard(summary, profileName);
  const filename = `ironpulse-${summary.date}.png`;
  const file = new File([blob], filename, { type: 'image/png' });

  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        title: `Séance ${summary.sessionName} — IronPulse`,
        text: `${Math.round(summary.totalTonnage)} kg soulevés sur ${summary.sessionName} (${summary.date})`,
        files: [file],
      });
      return { method: 'share' };
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return { method: 'cancelled' };
      }
      // Fallback to direct download below
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  return { method: 'download' };
}
