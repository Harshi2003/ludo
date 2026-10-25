import { TASK_OPTIONS } from './interactions';
import { describe, expect, it } from 'vitest';
import { magicPack, pirateFixture } from '@ludo/themepack';
import { createGame, step } from '@ludo/engine';
import { CATEGORIES, QUESTIONS, QUESTION_BY_ID, type Category } from './prompts';
import { partyPack } from './data';
import { DEFAULT_PARTY_CONFIG, validateConfig, type PartyConfig, type PenaltyKind, type TileKind } from './config';
import { createPartyGame, drawCard, partyStep, partyRendererState, voteLeaders, weightedChoice, type PartyState } from './rules';
function config(penalty: PenaltyKind): PartyConfig {
  return { ...structuredClone(DEFAULT_PARTY_CONFIG), penaltyWeights: { back: 0, sip: 0, 'skip-turn': 0, swap: 0, [penalty]: 100 } };
}
function atCard(category: Category, count = 2, c = DEFAULT_PARTY_CONFIG) {
  const s = createPartyGame(count, 17, c); s.phase = 'card'; s.card = drawCard(s, category); return s;
}
function lane(kind: TileKind = 'dare', c = config('back')) {
  const s = atCard('dare', 2, c);
  s.board = { ...s.board, finish: 8, starts: [0, 1], distToFinish: Array.from({ length: 9 }, (_, i) => 8 - i),
    tiles: Array.from({ length: 9 }, (_, id) => ({ id, col: id, x: id, y: 0, zone: 0, lane: 0,
      next: id === 8 ? [] : [id + 1], prev: id === 0 ? [] : [id - 1], type: id === 5 ? kind : 'safe', checkpoint: false, shared: true,
      ...(id === 8 ? { finish: true } : {}) })) };
  s.players[0].tile = 5; s.players[1].tile = 6; return s;
}
function land(s: PartyState) {
  s.phase = 'move'; s.card = null; s.moves = [{ piece: 0, dir: 'fwd', path: [4, 5], to: 5, captures: [] }]; s.players[0].tile = 3;
  return partyStep(s, { type: 'move', index: 0 });
}
function answerCard(s: PartyState, fail = false): PartyState {
  switch (s.card!.category) {
    case 'truth': return partyStep(s, { type: 'answer', text: 'I can wiggle my ears.' });
    case 'dare': if (TASK_OPTIONS[s.card!.questionId]) s = partyStep(s, { type: 'task-choice', option: 0 }); return partyStep(s, { type: 'dare', success: !fail });
    case 'rather': return partyStep(s, { type: 'choose', option: fail ? 1 : 0 });
    case 'likely': while (s.phase === 'card') s = partyStep(s, { type: 'vote', player: s.card!.votes.length % s.players.length }); return s;
    case 'never': while (s.phase === 'card') s = partyStep(s, { type: 'respond', response: s.card!.responses.length % 2 ? 'never' : 'have' }); return s;
  }
}
function acknowledge(s: PartyState) {
  while (s.result?.privateVote && !s.result.privateVote.done) {
    if (!s.result.privateVote.revealed) s = partyStep(s, { type: 'reveal-vote' });
    s = partyStep(s, { type: 'hide-vote' });
  }
  if (s.result?.trapChoice === 'pending') s = partyStep(s, { type: 'trap-choice', choice: 'back' });
  if (s.result?.drink && !s.result.drink.choice) s = partyStep(s, { type: 'drink-choice', choice: s.result.drink.everyone ? 'group-ready' : 'none' });
  return partyStep(s, { type: 'next' });
}
function play(seed: number, count: number) {
  let s = createPartyGame(count, seed), actions = 0;
  const seen = new Set<string>();
  while (s.phase !== 'over') {
    if (++actions > 250) throw new Error('Party did not finish');
    if (s.phase === 'roll') s = partyStep(s, { type: 'roll' });
    else if (s.phase === 'move') s = partyStep(s, { type: 'move', index: 0 });
    else if (s.phase === 'result') s = acknowledge(s);
    else {
      expect(QUESTION_BY_ID[s.card!.questionId].text.length).toBeGreaterThan(10);
      expect(seen.has(s.card!.questionId)).toBe(false); seen.add(s.card!.questionId);
      s = seed % 3 === 0 ? partyStep(s, { type: 'skip' }) : answerCard(s, seed % 2 === 0);
    }
    expect(s.secondaryActivations).toBeLessThanOrEqual(1);
    expect(s.motions.length).toBeLessThanOrEqual(3);
  }
  return s;
}
describe('Party Ludo board and penalty integration', () => {
  it('keeps the same 50 English questions, spice metadata, provenance, and two-option data', () => {
    const all = Object.values(QUESTIONS).flat(); expect(all).toHaveLength(50);
    expect(new Set(all.map(q => q.id)).size).toBe(50);
    expect(JSON.stringify([partyPack, QUESTIONS])).not.toMatch(/[\uac00-\ud7af]/);
    for (const category of CATEGORIES) {
      expect(QUESTIONS[category]).toHaveLength(10);
      for (const q of QUESTIONS[category]) {
        expect(q.category).toBe(category); expect(q.text.length).toBeGreaterThan(10);
        expect([1, 2, 3]).toContain(q.spiceLevel); expect(typeof q.spiceReview.needsReview).toBe('boolean');
        expect(q.spiceReview.reason.length).toBeGreaterThan(20); expect(q.source.locator).toBeTruthy();
        if (category === 'rather') expect(q.options).toHaveLength(2);
      }
    }
  });
  it('validates configuration, preserves player bounds, and exposes all ten tile types', () => {
    validateConfig(DEFAULT_PARTY_CONFIG);
    expect(Object.values(DEFAULT_PARTY_CONFIG.tileWeights).reduce((a, b) => a + b, 0)).toBe(100);
    expect(Object.values(DEFAULT_PARTY_CONFIG.penaltyWeights)).toEqual([45, 25, 20, 10]);
    expect(partyPack.tiles).toHaveLength(10);
    for (const count of [1, 5, 2.5]) expect(() => createPartyGame(count, 42)).toThrow();
    expect(() => createPartyGame(2, 42, { ...config('back'), backwardMin: 4, backwardMax: 3 })).toThrow();
    expect(() => createPartyGame(2, 42, { ...config('back'), trapSkipChance: 2 })).toThrow();
    expect(() => createPartyGame(2, 42, { ...config('back'), penaltyWeights: { back: 0, sip: 0, 'skip-turn': 0, swap: 0 } })).toThrow();
  });
  it('shuffles weighted individual tiles asymmetrically and leaves entrances and finish Safe', () => {
    const seen = new Set<string>();
    let mixedColumns = 0;
    for (const n of [2, 3, 4]) for (let seed = 1; seed <= 20; seed++) {
      const s = createPartyGame(n, seed);
      expect(s.players).toHaveLength(n);
      expect(s.board.tiles[s.board.finish].type).toBe('safe');
      const columns = new Map<number, Set<string>>();
      for (const t of s.board.tiles) {
        seen.add(t.type); expect(Object.keys(DEFAULT_PARTY_CONFIG.tileWeights)).toContain(t.type);
        if (t.start !== undefined) expect(t.type).toBe('safe');
        if (t.start === undefined && !t.finish) { if (!columns.has(t.col)) columns.set(t.col, new Set()); columns.get(t.col)!.add(t.type); }
      }
      mixedColumns += [...columns.values()].filter(types => types.size > 1).length;
      const eligible = s.board.tiles.filter(t => t.start === undefined && !t.finish);
      for (const [kind, weight] of Object.entries(DEFAULT_PARTY_CONFIG.tileWeights)) {
        const count = eligible.filter(t => t.type === kind).length;
        expect(Math.abs(count - weight / 100 * eligible.length)).toBeLessThan(1.001);
      }
    }
    expect(seen.size).toBe(10); expect(mixedColumns).toBeGreaterThan(0);
  });
  it('uses the requested penalty probabilities with a configurable seeded draw', () => {
    const rng = { rng: 42 }, counts = { back: 0, sip: 0, 'skip-turn': 0, swap: 0 };
    for (let i = 0; i < 40000; i++) counts[weightedChoice(rng, DEFAULT_PARTY_CONFIG.penaltyWeights)]++;
    for (const [kind, expected] of Object.entries(DEFAULT_PARTY_CONFIG.penaltyWeights)) expect(Math.abs(counts[kind as PenaltyKind] / 40000 - expected / 100)).toBeLessThan(0.015);
    for (const kind of Object.keys(counts) as PenaltyKind[]) expect(weightedChoice(rng, config(kind).penaltyWeights)).toBe(kind);
  });
  it('requires and records each explicit alternative task before successful completion', () => {
    for (const [id, options] of Object.entries(TASK_OPTIONS)) {
      expect(QUESTION_BY_ID[id].category).toBe('dare');
      for (const option of [0, 1] as const) {
        const s = atCard('dare'); s.card!.questionId = id; s.card!.taskOption = null;
        expect(() => partyStep(s, { type: 'dare', success: true })).toThrow('Choose which task');
        const chosen = partyStep(s, { type: 'task-choice', option });
        expect(chosen.phase).toBe('card'); expect(chosen.motions).toEqual([]);
        const done = partyStep(chosen, { type: 'dare', success: true });
        expect(done.result!.detail).toContain(options[option]);
        expect(done.result!.penalty).toBeNull(); expect(acknowledge(done).turn).toBe(1);
        expect(() => partyStep(chosen, { type: 'task-choice', option: 2 as 0 })).toThrow();
        expect(partyStep(s, { type: 'skip' }).phase).toBe('result');
      }
    }
  });
  it('never repeats questions and stops drawing after all 50 are consumed', () => {
    const s = createPartyGame(2, 42), ids = new Set<string>();
    for (let i = 0; i < 50; i++) { const card = drawCard(s, 'truth')!; expect(ids.has(card.questionId)).toBe(false); ids.add(card.questionId); }
    expect(drawCard(s, 'rather')).toBeNull();
  });
  it('uses legal regular forward/backward paths without mutating reducer input', () => {
    const s = createPartyGame(2, 42); s.players[0].tile = s.board.tiles.find(t => t.zone >= 1)!.id;
    const before = structuredClone(s), rolled = partyStep(s, { type: 'roll' });
    expect(s).toEqual(before); expect(rolled.roll).toBeGreaterThanOrEqual(1); expect(rolled.roll).toBeLessThanOrEqual(6);
    expect(rolled.moves.some(m => m.dir === 'back')).toBe(true);
    expect(() => partyStep(rolled, { type: 'move', index: -1 })).toThrow();
    for (const index of [0, rolled.moves.findIndex(m => m.dir === 'back')]) {
      const moved = partyStep(rolled, { type: 'move', index }); expect(moved.motions[0].path).toEqual(rolled.moves[index].path);
      expect(moved.motions[0].reason).toBe('Regular move');
    }
  });
  it('reproduces Dare -> fail -> backward three spaces -> Drink -> no-drink choice -> next turn', () => {
    const c = { ...config('back'), backwardMin: 3, backwardMax: 3 };
    const start = lane('dare', c); start.board.tiles[2].type = 'drink';
    const landed = land(start); expect(landed.phase).toBe('card'); expect(landed.motions[0].path).toEqual([4, 5]);
    const failed = partyStep(landed, { type: 'dare', success: false });
    expect(failed.result!.penalty).toBe('back'); expect(failed.motions[0].path).toEqual([4, 3, 2]);
    expect(failed.players[0].tile).toBe(2); expect(failed.secondaryActivations).toBe(1); expect(failed.result!.drink!.everyone).toBe(false);
    expect(failed.usedQuestionIds).toEqual(landed.usedQuestionIds);
    expect(() => partyStep(failed, { type: 'next' })).toThrow();
    const choice = partyStep(failed, { type: 'drink-choice', choice: 'none' });
    expect(choice.motions).toEqual([]); expect(choice.players[0].tile).toBe(2);
    const next = partyStep(choice, { type: 'next' }); expect(next.turn).toBe(1); expect(next.phase).toBe('roll');
  });
  it('draws exactly one failure penalty in every category, and does not redraw it on acknowledgement', () => {
    for (const category of CATEGORIES) {
      const s = atCard(category, 2, config('sip')); const result = partyStep(s, { type: 'skip' });
      expect(result.result!.penalty).toBe('sip'); expect(result.phase).toBe('result'); expect(result.skipped).toBe(1);
      const selected = partyStep(result, { type: 'drink-choice', choice: 'water' }); expect(selected.rng).toBe(result.rng);
      expect(selected.motions.length).toBe(0); expect(acknowledge(selected).turn).toBe(1);
    }
  });
  it('varies backward penalties across one, two, and three spaces and clamps at path boundaries', () => {
    const lengths = new Set<number>();
    for (let seed = 1; seed <= 100; seed++) {
      const s = lane('dare', config('back')); s.rng = seed;
      const failed = partyStep(s, { type: 'skip' });
      const length = failed.motions[0].path.length;
      expect(length).toBeGreaterThanOrEqual(1); expect(length).toBeLessThanOrEqual(3); lengths.add(length);
    }
    expect([...lengths].sort()).toEqual([1, 2, 3]);
    const edge = lane('dare', { ...config('back'), backwardMin: 3, backwardMax: 3 }); edge.players[0].tile = 1;
    const failed = partyStep(edge, { type: 'skip' }); expect(failed.players[0].tile).toBe(0); expect(failed.motions[0].path).toEqual([0]);
  });
  it('preserves every category interaction and result-before-next-turn with no penalty for an answer', () => {
    for (const category of CATEGORIES) {
      const s = atCard(category), result = answerCard(s);
      expect(result.phase).toBe('result'); expect(result.turn).toBe(0); expect(result.completed).toBe(1); expect(result.result!.penalty).toBeNull();
      expect(result.players.map(p => p.tile)).toEqual(s.players.map(p => p.tile)); expect(acknowledge(result).turn).toBe(1);
    }
    const typed = partyStep(atCard('truth'), { type: 'answer', text: 'PRIVATE TEST ANSWER' });
    expect(JSON.stringify(acknowledge(typed))).not.toContain('PRIVATE TEST ANSWER');
    expect(() => partyStep(atCard('truth'), { type: 'answer', text: ' ' })).toThrow();
    const vote = partyStep(partyStep(atCard('likely'), { type: 'vote', player: 0 }), { type: 'vote', player: 1 }); expect(voteLeaders(vote)).toEqual([0, 1]);
    expect(() => partyStep(atCard('likely'), { type: 'vote', player: -1 })).toThrow();
  });
  it('privately checks every player, hides between handoffs, and never announces selected names', () => {
    for (const count of [2, 3, 4]) {
      let s = atCard('likely', count);
      for (let voter = 0; voter < count; voter++) s = partyStep(s, { type: 'vote', player: 1 });
      expect(voteLeaders(s)).toEqual([1]);
      expect(s.result!.detail).not.toContain('Player 2');
      expect(s.message).not.toContain('Player 2');
      for (let seat = 0; seat < count; seat++) {
        expect(s.result!.privateVote).toEqual({ seat, revealed: false, done: false });
        expect(() => partyStep(s, { type: 'next' })).toThrow('privately check');
        expect(() => partyStep(s, { type: 'hide-vote' })).toThrow();
        s = partyStep(s, { type: 'reveal-vote' });
        expect(s.result!.privateVote!.revealed).toBe(true);
        expect(() => partyStep(s, { type: 'next' })).toThrow();
        s = partyStep(s, { type: 'hide-vote' });
        expect(s.result!.privateVote!.revealed).toBe(false);
      }
      expect(s.result!.privateVote!.done).toBe(true);
      expect(() => partyStep(s, { type: 'reveal-vote' })).toThrow();
      const next = partyStep(s, { type: 'next' });
      expect(next.turn).toBe(1); expect(next.card).toBeNull(); expect(next.result).toBeNull();
    }
  });
  it('lets direct and secondary drinking outcomes use water or no drink without any added penalty', () => {
    for (const choice of ['sip', 'water', 'none'] as const) {
      const s = land(lane('drink')); expect(s.result!.drink!.everyone).toBe(false);
      const chosen = partyStep(s, { type: 'drink-choice', choice }); expect(chosen.players).toEqual(s.players); expect(acknowledge(chosen).turn).toBe(1);
    }
    const group = land(lane('everyone')); expect(group.result!.drink!.everyone).toBe(true);
    expect(() => partyStep(group, { type: 'drink-choice', choice: 'sip' })).toThrow();
    expect(acknowledge(group).phase).toBe('roll');
    const s = lane('dare', { ...config('back'), backwardMin: 3, backwardMax: 3 }); s.board.tiles[2].type = 'everyone';
    expect(partyStep(s, { type: 'skip' }).result!.drink!.everyone).toBe(true);
  });
  it('acknowledges drink instructions in one action without choosing or requiring a beverage', () => {
    for (const kind of ['drink', 'everyone'] as const) {
      const direct = land(lane(kind));
      const next = partyStep(direct, { type: 'acknowledge-drink' });
      expect(next.turn).toBe(1); expect(next.motions).toEqual([]);
      expect(next.players).toEqual(direct.players);
      const start = lane('dare', { ...config('back'), backwardMin: 3, backwardMax: 3 });
      start.board.tiles[2].type = kind;
      const secondary = partyStep(start, { type: 'skip' });
      expect(secondary.players[0].tile).toBe(2);
      const continued = partyStep(secondary, { type: 'acknowledge-drink' });
      expect(continued.turn).toBe(1); expect(continued.players).toEqual(secondary.players);
      expect(continued.motions).toEqual([]);
    }
    expect(() => partyStep(createPartyGame(2, 1), { type: 'acknowledge-drink' })).toThrow();
  });
  it('bounds all secondary effects: questions never open and Trap/Lucky cannot force another move', () => {
    for (const kind of ['truth', 'dare', 'likely', 'never', 'rather', 'trap', 'lucky', 'safe'] as const) {
      const s = lane('dare', { ...config('back'), backwardMin: 3, backwardMax: 3 }); s.board.tiles[2].type = kind;
      const used = s.usedQuestionIds.slice(), next = partyStep(s, { type: 'skip' });
      expect(next.players[0].tile).toBe(2); expect(next.motions).toHaveLength(1); expect(next.secondaryActivations).toBe(1);
      expect(next.phase).toBe('result'); expect(next.usedQuestionIds).toEqual(used);
      if (kind === 'trap') expect(next.players[0].skipTurns).toBe(1);
      if (kind === 'lucky') expect(next.players[0].shield).toBe(true);
    }
    const blocked = lane(); blocked.players[0].tile = 0;
    expect(partyStep(blocked, { type: 'skip' }).secondaryActivations).toBe(0);
  });
  it('applies Lucky and Trap effects with at most one secondary landing and consumes Lucky shields', () => {
    const lucky = lane('lucky'); lucky.board.tiles[7].type = 'drink';
    const reward = land(lucky); expect(reward.players[0].tile).toBe(7); expect(reward.motions).toHaveLength(2); expect(reward.result!.drink).not.toBeNull();
    const trap = lane('trap', { ...config('back'), trapSkipChance: 0 }); trap.board.tiles[3].type = 'trap';
    const pending = land(trap);
    expect(pending.players[0].tile).toBe(5); expect(pending.result?.trapChoice).toBe('pending');
    expect(() => partyStep(pending, { type: 'next' })).toThrow('Choose to move backward');
    const skip = partyStep(pending, { type: 'trap-choice', choice: 'skip-turn' });
    expect(skip.players[0].tile).toBe(5); expect(skip.players[0].skipTurns).toBe(1); expect(skip.motions).toHaveLength(0);
    expect(skip.result!.detail).toContain('You chose');
    expect(() => partyStep(skip, { type: 'trap-choice', choice: 'back' })).toThrow();
    const caught = partyStep(pending, { type: 'trap-choice', choice: 'back' }); expect(caught.players[0].tile).toBe(3); expect(caught.motions).toHaveLength(1); expect(caught.players[0].skipTurns).toBe(1);
    const protectedPlayer = lane('trap'); protectedPlayer.players[0].shield = true;
    const protectedResult = land(protectedPlayer); expect(protectedResult.players[0].tile).toBe(5); expect(protectedResult.players[0].shield).toBe(false); expect(protectedResult.motions).toHaveLength(1);
    const shieldedFailure = atCard('dare'); shieldedFailure.players[0].shield = true;
    expect(partyStep(shieldedFailure, { type: 'skip' }).result!.penalty).toBeNull();
  });
  it('swaps with another player, animates both tokens, and activates only the actor landing once', () => {
    const s = lane('dare', config('swap')); s.board.tiles[6].type = 'everyone'; s.board.tiles[5].type = 'drink';
    const next = partyStep(s, { type: 'skip' });
    expect(next.players.map(p => p.tile)).toEqual([6, 5]); expect(next.motions.map(m => m.seat)).toEqual([0, 1]);
    expect(next.secondaryActivations).toBe(1); expect(next.result!.drink!.everyone).toBe(true);
  });
  it('loses exactly the next scheduled turn, counts it once, and prevents rolling during that turn', () => {
    const s = lane('dare', config('skip-turn'));
    const queued = partyStep(s, { type: 'skip' }); expect(queued.players[0].skipTurns).toBe(1);
    const player2 = acknowledge(queued); expect(player2.turn).toBe(1);
    player2.phase = 'result'; player2.result = { title: 'Safe', detail: 'Safe', effects: [], penalty: null, skipped: false, drink: null, trapChoice: null };
    const lost = acknowledge(player2); expect(lost.turn).toBe(0); expect(lost.round).toBe(2); expect(lost.phase).toBe('result');
    expect(lost.result!.title).toBe('Turn skipped'); expect(lost.players[0].skipTurns).toBe(0);
    expect(() => partyStep(lost, { type: 'roll' })).toThrow();
    const after = acknowledge(lost); expect(after.turn).toBe(1); expect(after.turns).toBe(3); expect(after.phase).toBe('roll');
  });
  it('waits for final result and drink choice before victory, and allows tied winners', () => {
    const s = atCard('truth', 2, config('sip')); s.turns = 11; s.round = 6; s.turn = 1;
    const result = partyStep(s, { type: 'skip' }); expect(result.phase).toBe('result'); expect(() => partyStep(result, { type: 'next' })).toThrow();
    const end = acknowledge(result); expect(end.phase).toBe('over'); expect(end.winners).toEqual([0, 1]);
    expect(() => partyStep(end, { type: 'roll' })).toThrow();
    const safe = land(lane('safe')); safe.players[0].tile = safe.board.finish;
    expect(acknowledge(safe).winners).toEqual([0]);
  });
  it('completes seeded 2/3/4-player games without unbounded chains or repeated questions', () => {
    for (const count of [2, 3, 4]) for (let seed = 1; seed <= 100; seed++) {
      const s = play(seed, count); expect(s.turns).toBeLessThanOrEqual(count * s.config.rounds); expect(s.winners.length).toBeGreaterThan(0);
    }
    expect(play(42, 4)).toEqual(play(42, 4));
  });
  it('keeps Magic/Pirate and the shared engine independent', () => {
    const before = JSON.stringify([magicPack, pirateFixture]); play(42, 4);
    for (const pack of [magicPack, pirateFixture]) {
      const game = createGame(pack, { seed: 42, players: pack.characters.slice(0, 2).map(c => ({ character: c.id })) });
      step(pack, game, { type: 'roll' }); expect(game.moves.length).toBeGreaterThan(0); step(pack, game, { type: 'move', index: 0 }); expect(game.packId).toBe(pack.id);
    }
    expect(JSON.stringify([magicPack, pirateFixture])).toBe(before);
    expect(partyRendererState(createPartyGame(2, 42)).packId).toBe('party-ludo');
  });
});
