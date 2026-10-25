import { enumeratePaths, forcedPath, randInt, type GameState, type MoveOption, type PlayerCount, type Board } from '@ludo/engine';
import { TASK_OPTIONS } from './interactions';
import { partyPack } from './data';
import { createPartyBoard } from './board';
import { CATEGORIES, QUESTION_BY_ID, LABELS, type Category, type SpiceLevel } from './prompts';
import { availableQuestions, validateSpiceLevel } from './spice';
import { DEFAULT_PARTY_CONFIG, validateConfig, type PartyConfig, type PenaltyKind, type TileKind } from './config';
export type Card = { category: Category; questionId: string; taskOption: 0 | 1 | null; votes: number[]; responses: ('have' | 'never')[] };
export type DrinkChoice = 'sip' | 'water' | 'none' | 'group-ready';
export type PartyMotion = { seat: number; from: number; to: number; path: number[]; reason: string };
export type CardResult = { title: string; detail: string; skipped: boolean; effects: string[]; penalty: PenaltyKind | null;
  privateVote?: { seat: number; revealed: boolean; done: boolean; selected?: boolean; checked?: boolean };
  trapChoice: 'pending' | 'back' | 'skip-turn' | null;
  drink: { everyone: boolean; choice: DrinkChoice | null } | null };
export interface PartyState {
  seed: number; rng: number; board: Board; config: PartyConfig; maxSpiceLevel: SpiceLevel;
  players: { name: string; character: string; tile: number; skipTurns: number; shield: boolean }[];
  turn: number; round: number; phase: 'roll' | 'move' | 'card' | 'result' | 'over';
  roll: number | null; moves: MoveOption[]; card: Card | null; result: CardResult | null;
  usedQuestionIds: string[]; motions: PartyMotion[]; secondaryActivations: number;
  turns: number; completed: number; skipped: number; winners: number[]; message: string;
}
export type PartyAction = { type: 'roll' } | { type: 'move'; index: number } | { type: 'vote'; player: number }
  | { type: 'answer'; text: string } | { type: 'spoken' } | { type: 'dare'; success: boolean }
  | { type: 'respond'; response: 'have' | 'never' } | { type: 'choose'; option: 0 | 1 }
  | { type: 'trap-choice'; choice: 'back' | 'skip-turn' } | { type: 'acknowledge-drink' } | { type: 'reveal-vote' } | { type: 'hide-vote' } | { type: 'task-choice'; option: 0 | 1 } | { type: 'skip' } | { type: 'drink-choice'; choice: DrinkChoice } | { type: 'next' };

export function weightedChoice<T extends string>(s: { rng: number }, weights: Record<T, number>): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  // 10000 buckets support configurable fractional weights without changing the shared RNG.
  let draw = randInt(s, 10000) / 10000 * total;
  for (const [kind, weight] of entries) if ((draw -= weight) < 0) return kind;
  return entries.filter(([, w]) => w > 0).at(-1)![0];
}
export function createPartyGame(players: number, seed: number, config = DEFAULT_PARTY_CONFIG, maxSpiceLevel: SpiceLevel = 3): PartyState {
  if (![2, 3, 4].includes(players)) throw new Error('Choose 2 to 4 players.');
  validateConfig(config);
  validateSpiceLevel(maxSpiceLevel);
  const board = createPartyBoard(players as PlayerCount, seed, config);
  return { seed, rng: seed >>> 0, board, config: structuredClone(config), maxSpiceLevel,
    players: partyPack.characters.slice(0, players).map((c, i) => ({ name: `Player ${i + 1}`, character: c.id, tile: board.starts[i], skipTurns: 0, shield: false })),
    turn: 0, round: 1, phase: 'roll', roll: null, moves: [], card: null, result: null,
    usedQuestionIds: [], motions: [], secondaryActivations: 0, turns: 0, completed: 0, skipped: 0, winners: [],
    message: 'Roll the dice and choose your next stop.' };
}
export function drawCard(s: PartyState, category: Category): Card | null {
  let pool = availableQuestions(s.maxSpiceLevel, category).filter(q => !s.usedQuestionIds.includes(q.id));
  if (!pool.length) pool = availableQuestions(s.maxSpiceLevel).filter(q => !s.usedQuestionIds.includes(q.id));
  if (!pool.length) return null;
  const question = pool[randInt(s, pool.length)]; s.usedQuestionIds.push(question.id);
  return { category: question.category, questionId: question.id, taskOption: null, votes: [], responses: [] };
}
function showResult(s: PartyState, title: string, detail: string, skipped = false) {
  s.result = { title, detail, skipped, effects: [], penalty: null, drink: null, trapChoice: null };
  s.phase = 'result'; s.message = detail;
}
function protect(s: PartyState, seat: number): boolean {
  if (!s.players[seat].shield) return false;
  s.players[seat].shield = false;
  s.result!.effects.push('Lucky shield used: this board penalty is cancelled.');
  return true;
}
function offerDrink(s: PartyState, everyone: boolean) {
  s.result!.drink = { everyone, choice: null };
  s.result!.effects.push(everyone ? 'Everyone: take 1 sip of your own drink.'
    : 'Take 1 sip of your own drink.');
}
function secondaryLanding(s: PartyState, seat: number) {
  if (s.secondaryActivations >= 1) return;
  s.secondaryActivations++;
  const kind = s.board.tiles[s.players[seat].tile].type as TileKind;
  if (kind === 'drink' || kind === 'everyone') offerDrink(s, kind === 'everyone');
  else if (kind === 'trap') {
    if (!protect(s, seat)) { s.players[seat].skipTurns = 1; s.result!.effects.push('Secondary Trap: lose your next turn. No further movement.'); }
  } else if (kind === 'lucky') {
    s.players[seat].shield = true; s.result!.effects.push('Secondary Lucky: a shield cancels your next challenge penalty or Trap. No further movement.');
  } else if (kind === 'safe') s.result!.effects.push('Secondary Safe: nothing happens.');
  else s.result!.effects.push(`Secondary ${LABELS[kind]}: no new question opens during a movement chain.`);
}
function forceMove(s: PartyState, seat: number, steps: number, reason: string) {
  const player = s.players[seat], from = player.tile;
  const path = forcedPath(s.board, from, steps, new Set());
  player.tile = path.at(-1) ?? from;
  if (path.length) {
    s.motions.push({ seat, from, to: player.tile, path, reason });
    s.result!.effects.push(`${reason}: moved ${steps < 0 ? 'backward' : 'forward'} ${path.length} ${path.length === 1 ? 'space' : 'spaces'}.`);
    secondaryLanding(s, seat);
  } else s.result!.effects.push(`${reason}: no path is available, so your position stays the same.`);
}
function applyPenalty(s: PartyState) {
  if (protect(s, s.turn)) return;
  const kind = weightedChoice(s, s.config.penaltyWeights); s.result!.penalty = kind;
  if (kind === 'back') forceMove(s, s.turn, -(s.config.backwardMin + randInt(s, s.config.backwardMax - s.config.backwardMin + 1)), 'Random penalty');
  else if (kind === 'sip') offerDrink(s, false);
  else if (kind === 'skip-turn') {
    s.players[s.turn].skipTurns = 1; s.result!.effects.push('Random penalty: lose your next scheduled turn. No drink required.');
  } else {
    const other = (s.turn + 1 + randInt(s, s.players.length - 1)) % s.players.length;
    const me = s.players[s.turn], them = s.players[other], from = me.tile, target = them.tile;
    me.tile = target; them.tile = from;
    s.result!.effects.push(`Random penalty: swapped positions with ${them.name}. Only your new landing can activate a secondary tile.`);
    if (from !== target) {
      s.motions.push({ seat: s.turn, from, to: target, path: [target], reason: 'Swap' }, { seat: other, from: target, to: from, path: [from], reason: 'Swap' });
      secondaryLanding(s, s.turn);
    }
  }
}
function primaryLanding(s: PartyState) {
  const kind = s.board.tiles[s.players[s.turn].tile].type as TileKind;
  if ((CATEGORIES as readonly string[]).includes(kind)) {
    s.card = drawCard(s, kind as Category);
    if (s.card) { s.phase = 'card'; s.message = s.card.category === kind ? 'Your party card is ready.' : 'This category is used up. Here is a fresh question.'; return; }
    showResult(s, 'Safe', 'All questions within your selected spice level have been played. No question will repeat.'); return;
  }
  const definition = partyPack.tiles.find(t => t.id === kind)!;
  showResult(s, definition.name, kind === 'lucky' ? `Move forward ${s.config.luckyForwardSteps} steps. One secondary landing may activate.`
    : kind === 'trap' ? `Move backward ${s.config.trapBackwardSteps} steps or lose your next turn.` : definition.description);
  if (kind === 'drink' || kind === 'everyone') offerDrink(s, kind === 'everyone');
  else if (kind === 'lucky') forceMove(s, s.turn, s.config.luckyForwardSteps, 'Lucky reward');
  else if (kind === 'trap' && !protect(s, s.turn)) {
    s.result!.trapChoice = 'pending';
  }
}
function endTurn(s: PartyState) {
  s.turns++;
  const arrived = s.board.tiles[s.players[s.turn].tile].finish;
  if (arrived || s.turns >= s.players.length * s.config.rounds) {
    s.phase = 'over';
    const closest = Math.min(...s.players.map(p => s.board.distToFinish[p.tile]));
    s.winners = s.players.flatMap((p, i) => s.board.distToFinish[p.tile] === closest ? [i] : []);
    s.card = null; s.result = null; s.moves = [];
    s.message = arrived ? 'The Party Finale has been reached!' : 'The final round is complete. That is a wrap!'; return;
  }
  s.turn = (s.turn + 1) % s.players.length;
  s.round = Math.floor(s.turns / s.players.length) + 1;
  s.phase = 'roll'; s.roll = null; s.moves = []; s.card = null; s.result = null;
  s.message = 'Next guest! Roll the dice and choose your next stop.';
  if (s.players[s.turn].skipTurns > 0) {
    s.players[s.turn].skipTurns--;
    showResult(s, 'Turn skipped', `${s.players[s.turn].name} loses this scheduled turn. No roll, movement, question, or drink is required.`);
  }
}
function resolve(s: PartyState, detail: string, skipped = false) {
  showResult(s, LABELS[s.card!.category], detail, skipped);
  if (skipped) { s.skipped++; applyPenalty(s); } else s.completed++;
}
export function partyStep(state: PartyState, action: PartyAction): PartyState {
  if (state.phase === 'over') throw new Error('This party has finished. Start a new game.');
  const { board, config, ...rest } = state;
  const s: PartyState = { ...structuredClone(rest), board, config, motions: [], secondaryActivations: 0 };
  if (action.type === 'roll' && s.phase === 'roll') {
    s.roll = 1 + randInt(s, 6);
    s.moves = (['fwd', 'back'] as const).flatMap(dir => enumeratePaths(board, s.players[s.turn].tile, s.roll!, dir, new Set())
      .map(path => ({ dir, path, to: path[path.length - 1], captures: [] })));
    if (s.moves.length) { s.phase = 'move'; s.message = 'Choose a highlighted stop or a destination below.'; }
    else showResult(s, 'Safe', 'No open path. Take a breather.');
  } else if (action.type === 'move' && s.phase === 'move') {
    const move = s.moves[action.index];
    if (!Number.isInteger(action.index) || !move) throw new Error('Choose an available destination.');
    const from = s.players[s.turn].tile; s.players[s.turn].tile = move.to; s.moves = [];
    s.motions.push({ seat: s.turn, from, to: move.to, path: move.path, reason: 'Regular move' });
    primaryLanding(s);
  } else if (action.type === 'next' && s.phase === 'result') {
    if (s.result!.privateVote && !s.result!.privateVote.done) throw new Error('Each player must privately check and hide their result first.');
    if (s.result!.trapChoice === 'pending') throw new Error('Choose to move backward or lose your next turn.');
    if (s.result!.drink && !s.result!.drink.choice) throw new Error('Choose any drink option, no-drink participation, or confirm that everyone is ready.');
    endTurn(s);
  } else if (action.type === 'acknowledge-drink' && s.phase === 'result' && s.result?.drink) {
    s.result.drink.choice = s.result.drink.everyone ? 'group-ready' : 'none';
    endTurn(s);
  } else if (action.type === 'reveal-vote' && s.phase === 'result' && s.result?.privateVote && !s.result.privateVote.done && !s.result.privateVote.revealed) {
    s.result.privateVote.revealed = true;
  } else if (action.type === 'hide-vote' && s.phase === 'result' && s.result?.privateVote?.revealed && !s.result.privateVote.done) {
    s.result.privateVote.revealed = false;
    s.result.privateVote.seat++;
    s.result.privateVote.done = s.result.privateVote.seat >= s.players.length;
  } else if (action.type === 'trap-choice' && s.phase === 'result' && s.result?.trapChoice === 'pending') {
    if (action.choice !== 'back' && action.choice !== 'skip-turn') throw new Error('Choose an available Trap option.');
    s.result.trapChoice = action.choice;
    s.result.detail = action.choice === 'back' ? `You chose to move backward ${s.config.trapBackwardSteps} spaces.` : 'You chose to lose your next scheduled turn.';
    if (action.choice === 'back') forceMove(s, s.turn, -s.config.trapBackwardSteps, 'Trap');
    else { s.players[s.turn].skipTurns = 1; s.result.effects.push('Trap: you chose to lose your next scheduled turn.'); }
  } else if (action.type === 'drink-choice' && s.phase === 'result' && s.result?.drink) {
    const allowed: DrinkChoice[] = s.result.drink.everyone ? ['group-ready'] : ['sip', 'water', 'none'];
    if (!allowed.includes(action.choice)) throw new Error('Choose an available participation option.');
    s.result.drink.choice = action.choice;
  } else if (s.phase === 'card' && s.card) {
    const card = s.card;
    if (action.type === 'skip') resolve(s, 'Question skipped. A random penalty was drawn.', true);
    else if (card.category === 'truth' && action.type === 'answer') {
      const text = action.text.trim();
      if (!text || text.length > 500) throw new Error('Enter an answer of 1–500 characters, answer out loud, or skip.');
      resolve(s, `${s.players[s.turn].name} answered: ${text}`);
    } else if (card.category === 'truth' && action.type === 'spoken') resolve(s, `${s.players[s.turn].name} answered out loud. No private answer is stored.`);
    else if (card.category === 'dare' && action.type === 'task-choice' && TASK_OPTIONS[card.questionId]) {
      if (action.option !== 0 && action.option !== 1) throw new Error('Choose an available task.');
      card.taskOption = action.option;
    } else if (card.category === 'dare' && action.type === 'dare') {
      const options = TASK_OPTIONS[card.questionId];
      if (action.success && options && card.taskOption === null) throw new Error('Choose which task you will perform first.');
      resolve(s, action.success ? `Challenge completed!${options ? ` Task: ${options[card.taskOption!]}.` : ''}` : 'Challenge not completed. A random penalty was drawn.', !action.success);
    }
    else if (card.category === 'likely' && action.type === 'vote') {
      if (!Number.isInteger(action.player) || !s.players[action.player] || card.votes.length >= s.players.length) throw new Error('Choose an available player.');
      card.votes.push(action.player);
      if (card.votes.length === s.players.length) {
        resolve(s, 'Voting complete. Each player checks only their own result in private.');
        s.result!.privateVote = { seat: 0, revealed: false, done: false };
      }
    } else if (card.category === 'never' && action.type === 'respond') {
      if (!['have', 'never'].includes(action.response) || card.responses.length >= s.players.length) throw new Error('Choose an available response.');
      card.responses.push(action.response);
      if (card.responses.length === s.players.length) {
        const have = card.responses.filter(r => r === 'have').length;
        resolve(s, `${have} said “I have”; ${s.players.length - have} said “Never.” All experiences count equally.`);
      }
    } else if (card.category === 'rather' && action.type === 'choose') {
      if (action.option !== 0 && action.option !== 1) throw new Error('Choose one of the two options.');
      resolve(s, `${s.players[s.turn].name} chose: ${QUESTION_BY_ID[card.questionId].options![action.option]}. No wrong answer.`);
    } else throw new Error('Choose an action for this question category.');
  } else throw new Error('That action is not available right now.');
  return s;
}
export function voteLeaders(s: PartyState): number[] {
  if (!s.card?.votes.length) return [];
  const counts = s.players.map((_, i) => s.card!.votes.filter(v => v === i).length);
  return counts.flatMap((n, i) => n === Math.max(...counts) ? [i] : []);
}
export function partyRendererState(s: PartyState): GameState {
  return { packId: partyPack.id, board: s.board, players: s.players.map((p, seat) => ({ ...p, seat, bot: false,
    checkpoint: s.board.starts[seat], ult: 0, cooldown: 0, shield: p.shield ? { charges: 1, turns: 999 } : null, skip: p.skipTurns, dice: null, captures: 0, timesCaptured: 0 })),
    turn: s.turn, round: s.round, phase: s.phase === 'move' ? 'move' : s.phase === 'over' ? 'over' : 'roll',
    roll: s.roll, rawRoll: s.roll, moves: s.moves, usedAbility: false, extraRolls: 0, traps: [], blocks: [],
    portalCd: {}, rng: s.rng, events: [], winner: null, storm: false, bonusRoll: false };
}
