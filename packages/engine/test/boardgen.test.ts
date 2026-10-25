import { describe, expect, it } from 'vitest';
import { magicPack, pirateFixture } from '@ludo/themepack';
import { BOARD_TARGET, fairness, generateBoard, type Board, type PlayerCount } from '../src';

// Exclude coordinates, scenery and special tiles: this measures actual routes.
const topology = (b: Board) => JSON.stringify(b.tiles.map((t) => [t.col, t.next]));

describe('procedural board graphs', () => {
  for (const players of [2, 3, 4] as PlayerCount[]) {
    const generate = (seed: number) => generateBoard({ players, seed, zones: magicPack.zones, tiles: magicPack.tiles });

    it(`reproduces the entire ${players}-player board from its seed`, () => {
      for (const seed of [0, 1, -1, 42, 2147483647]) {
        expect(generate(seed)).toEqual(generate(seed));
      }
    });

    it(`generates different ${players}-player routes and junctions`, () => {
      const boards = Array.from({ length: 30 }, (_, seed) => generate(seed));
      expect(new Set(boards.map(topology)).size).toBeGreaterThanOrEqual(27);
      const sections = new Map<string, Set<string>>();
      for (const b of boards) {
        for (const z of b.zoneCols) {
          const tiles = b.tiles.filter((t) => t.zone === z.zone);
          const key = `${z.zone}:${z.to - z.from}`;
          const pattern = JSON.stringify(tiles.map((t) => [t.col - z.from, t.next
            .filter((n) => b.tiles[n].zone === z.zone).map((n) => n - tiles[0].id)]));
          if (!sections.has(key)) sections.set(key, new Set());
          sections.get(key)!.add(pattern);
        }
      }
      // Equal-length sections also change connections, beyond changing size.
      expect([...sections.values()].some((patterns) => patterns.size > 1)).toBe(true);
    });

    it(`mixes one, two and three asymmetric paths for ${players} players`, () => {
      for (let seed = 0; seed < 30; seed++) {
        const b = generate(seed);
        const rows = Array.from({ length: b.cols }, (_, col) => b.tiles.filter((t) => t.col === col && t.zone >= 0))
          .filter((row) => row.length);
        expect(new Set(rows.map((row) => row.length))).toEqual(new Set([1, 2, 3]));
        expect(rows.some((row) => row.length === 2 && row.some((t) => t.next.length > 1) && row.some((t) => t.next.length === 1))).toBe(true);
        expect(rows.filter((row) => row.some((t, i) => Math.abs(t.y + row[row.length - 1 - i].y) > 0.1)).length)
          .toBeGreaterThan(rows.length / 2);
        // The common entry makes every later branch equally available to all seats.
        const entry = rows[0];
        expect(entry).toHaveLength(1);
        expect(entry[0].prev).toHaveLength(players);
        expect(new Set(b.starts.map((s) => b.distToFinish[s])).size).toBe(1);
      }
    });
  }

  for (const pack of [magicPack, pirateFixture]) {
    for (const players of [2, 3, 4] as PlayerCount[]) {
      it(`keeps ${pack.id} ${players}-player graphs connected, fair and readable across 100 seeds`, () => {
        for (let seed = 0; seed < 100; seed++) {
          const b = generateBoard({ players, seed, zones: pack.zones, tiles: pack.tiles });
          expect(fairness(b, pack.tiles).ok, `seed ${seed}`).toBe(true);
          expect(Math.abs(b.tiles.length - BOARD_TARGET[players]) / BOARD_TARGET[players]).toBeLessThan(0.12);
          const reachable = new Set(b.starts);
          const queue = [...b.starts];
          for (let i = 0; i < queue.length; i++) {
            for (const next of b.tiles[queue[i]].next) {
              if (!reachable.has(next)) { reachable.add(next); queue.push(next); }
            }
          }
          expect(reachable.size).toBe(b.tiles.length);
          for (const t of b.tiles) {
            expect(Number.isFinite(t.x) && Number.isFinite(t.y)).toBe(true);
            expect(b.distToFinish[t.id]).toBe(b.tiles[b.finish].col - t.col);
            expect(t.next.length === 0).toBe(t.id === b.finish);
            expect(new Set(t.next).size).toBe(t.next.length);
            for (const next of t.next) {
              expect(b.tiles[next].col).toBe(t.col + 1);
              expect(b.tiles[next].prev).toContain(t.id);
            }
          }
          for (let col = 0; col < b.cols; col++) {
            const ys = b.tiles.filter((t) => t.col === col).map((t) => t.y).sort((a, c) => a - c);
            for (let i = 0; i < ys.length; i++) {
              if (i) expect(ys[i] - ys[i - 1]).toBeGreaterThan(0.65);
            }
          }
        }
      });
    }
  }
});
