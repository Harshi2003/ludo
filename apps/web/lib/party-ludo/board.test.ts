import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createPartyBoard } from './board';
import { DEFAULT_PARTY_CONFIG } from './config';
import type { PlayerCount } from '@ludo/engine';

describe('Party-only organic board and presentation isolation', () => {
  it('varies topology and geometry by seed while reproducing an identical seeded board', () => {
    const a = createPartyBoard(3, 42, DEFAULT_PARTY_CONFIG), b = createPartyBoard(3, 43, DEFAULT_PARTY_CONFIG);
    expect(a).toEqual(createPartyBoard(3, 42, DEFAULT_PARTY_CONFIG));
    expect(a.tiles.map(t => [t.next, t.prev])).not.toEqual(b.tiles.map(t => [t.next, t.prev]));
    expect(a.tiles.map(t => [t.x, t.y, t.type])).not.toEqual(b.tiles.map(t => [t.x, t.y, t.type]));
    expect(a.tiles.some(t => Math.abs(t.x - t.col) > 0.1)).toBe(true);
  });
  it('keeps all paths reachable, edges reciprocal and acyclic, equal start distances, and tiles separated', () => {
    for (const players of [2, 3, 4] as PlayerCount[]) for (let seed = 1; seed <= 100; seed++) {
      const board = createPartyBoard(players, seed, DEFAULT_PARTY_CONFIG);
      expect(board.tiles.some(t => t.next.length === 3)).toBe(true);
      expect(board.tiles.some(t => t.next.length === 2)).toBe(true);
      expect(Math.max(...board.tiles.map(t => t.next.length))).toBeLessThanOrEqual(3);
      expect(new Set(board.starts.map(id => board.distToFinish[id])).size).toBe(1);
      expect(board.zoneCols.every(z => Number.isFinite(z.from) && Number.isFinite(z.to))).toBe(true);
      expect(board.cols).toBeGreaterThan(Math.max(...board.tiles.map(t => t.x)));
      const reachable = new Set<number>(); const queue = [...board.starts];
      for (let i = 0; i < queue.length; i++) {
        const id = queue[i]; if (reachable.has(id)) continue; reachable.add(id); queue.push(...board.tiles[id].next);
      }
      expect(reachable.size).toBe(board.tiles.length);
      for (const t of board.tiles) {
        expect(Number.isFinite(board.distToFinish[t.id])).toBe(true);
        if (!t.finish) expect(t.next.length).toBeGreaterThan(0);
        for (const id of t.next) { expect(board.tiles[id].prev).toContain(t.id); expect(board.tiles[id].col).toBeGreaterThan(t.col); }
        for (const id of t.prev) expect(board.tiles[id].next).toContain(t.id);
        for (const other of board.tiles) {
          if (other.id <= t.id || Math.abs(other.col - t.col) > 1) continue;
          const dx = (other.x - t.x) * 100;
          const dy = (other.y - t.y) * 92 + Math.sin(other.col * 0.31) * 36 - Math.sin(t.col * 0.31) * 36;
          expect(Math.hypot(dx, dy)).toBeGreaterThan(60);
        }
      }
    }
  });
  it('provides distinct route structures and tile allocations across consecutive games', () => {
    for (const players of [2, 3, 4] as PlayerCount[]) {
      const routes = new Set<string>(), layouts = new Set<string>();
      for (let seed = 1; seed <= 30; seed++) {
        const board = createPartyBoard(players, seed, DEFAULT_PARTY_CONFIG);
        routes.add(JSON.stringify(board.tiles.map(t => [t.col, t.next])));
        layouts.add(JSON.stringify(board.tiles.map(t => t.type)));
        expect(board.tiles.filter(t => t.finish)).toHaveLength(1);
      }
      expect(routes.size).toBe(30); expect(layouts.size).toBe(30);
    }
  });
  it('keeps the shared motion implementation unchanged apart from the Party hop sound in the isolated Party renderer', () => {
    // Normalize line endings so the comparison holds on Windows checkouts (core.autocrlf) too.
    const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    const shared = read('../board/BoardRenderer.ts');
    const party = read('./PartyBoardRenderer.ts');
    const motion = (source: string) => source.slice(source.indexOf('  async playEvent('), source.indexOf('  private shockwave('));
    // World events (e.g. Fog City's) never happen in Party, so its renderer has no case for them.
    const withoutWorldEvents = (source: string) => source.replace(/      case "world_event": \{[\s\S]*?\n      \}\n\n/, '');
    expect(motion(party).replace('    sfx.hop(tileId % 5);\n', '')).toBe(withoutWorldEvents(motion(shared)));
    expect(party).toContain('drawPartyTileArt'); expect(party).not.toContain('buildIsland({');
  });
});
