// Debug renderer: writes boards.html with an SVG of the 2/3/4-player boards.
import { writeFileSync } from 'node:fs';
import { generateBoard, type PlayerCount } from '@ludo/engine';
import { magicPack as pack } from '@ludo/themepack';

const seed = Number(process.argv[2] ?? 1);
const S = 34;
const colors: Record<string, string> = {
  structural: '#3b3566', helpful: '#22c55e', harmful: '#ef4444', neutral: '#eab308',
};

const svgs = ([2, 3, 4] as PlayerCount[]).map((players) => {
  const b = generateBoard({ players, seed, zones: pack.zones, tiles: pack.tiles });
  const ys = b.tiles.map((t) => t.y);
  const minY = Math.min(...ys) - 1;
  const h = (Math.max(...ys) - minY + 1) * S;
  const w = (b.cols + 1) * S;
  const X = (x: number) => (x + 0.5) * S;
  const Y = (y: number) => (y - minY) * S;
  const bands = b.zoneCols.map((z) => {
    const zone = pack.zones[z.zone];
    const c = pack.art.zoneColors[zone?.id] ?? '#444';
    return `<rect x="${X(z.from) - S / 2}" y="0" width="${(z.to - z.from + 1) * S}" height="${h}" fill="${c}" opacity=".08"/>
      <text x="${X(z.from) - S / 2 + 4}" y="14" fill="${c}" font-size="11">${zone?.name ?? 'Finish'} (${zone?.type ?? ''})</text>`;
  });
  const edges = b.tiles.flatMap((t) => t.next.map((n) => {
    const u = b.tiles[n];
    return `<line x1="${X(t.x)}" y1="${Y(t.y)}" x2="${X(u.x)}" y2="${Y(u.y)}" stroke="#6b6b9a" stroke-width="2"/>`;
  }));
  const portals = b.tiles.filter((t) => t.pair !== undefined && t.id < t.pair).map((t) => {
    const u = b.tiles[t.pair!];
    return `<line x1="${X(t.x)}" y1="${Y(t.y)}" x2="${X(u.x)}" y2="${Y(u.y)}" stroke="#a855f7" stroke-dasharray="4 4" opacity=".6"/>`;
  });
  const nodes = b.tiles.map((t) => {
    const def = pack.tiles.find((d) => d.id === t.type)!;
    let fill = def.base === 'normal' ? (t.start !== undefined ? '#1e293b' : '#2a2550') : colors[def.category];
    if (def.base === 'sanctuary') fill = '#fbbf24';
    if (def.base === 'portal') fill = '#a855f7';
    if (t.finish) fill = '#f0abfc';
    const stroke = t.shared ? '#f43f5e' : t.checkpoint ? '#38bdf8' : '#0b0820';
    return `<g><circle cx="${X(t.x)}" cy="${Y(t.y)}" r="${t.finish ? 14 : 11}" fill="${fill}" stroke="${stroke}" stroke-width="${t.shared || t.checkpoint ? 3 : 1}"/>
      <title>#${t.id} ${def.name}${t.shared ? ' (shared)' : ''}${t.checkpoint ? ' (checkpoint)' : ''}</title></g>`;
  });
  return `<h2>${players} players — ${b.tiles.length} tiles, ${b.lanes} lanes, ${b.cols} columns, ${b.tiles.filter((t) => t.shared).length} shared</h2>
    <svg width="${w}" height="${h}" style="background:#0b0820">${bands.join('')}${edges.join('')}${portals.join('')}${nodes.join('')}</svg>`;
});

writeFileSync('boards.html', `<!doctype html><meta charset="utf-8"><title>Board debug</title>
<body style="background:#05040f;color:#ddd;font-family:system-ui;margin:16px">
<p>Legend: <b style="color:#22c55e">helpful</b> · <b style="color:#ef4444">harmful</b> · <b style="color:#eab308">neutral</b> · <b style="color:#fbbf24">sanctuary</b> · <b style="color:#a855f7">portal</b> · red ring = shared collision tile · blue ring = checkpoint</p>
${svgs.join('\n')}</body>`);
console.log('wrote boards.html');
