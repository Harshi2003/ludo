import type { ThemePack } from "@ludo/engine";

export interface RuleCard {
  key: "dice" | "move" | "capture" | "squad" | "twist" | "powers";
  title: string;
  icon: string;
  text: string;
}

/** Pieces each player fields in this world. */
export const squadSize = (pack: ThemePack) => Math.max(...pack.characters.map((c) => 1 + (c.squad?.length ?? 0)));

/** How this particular world plays, in plain words, straight from its rules. */
export function ruleCards(pack: ThemePack): RuleCard[] {
  const r = pack.rules;
  const cap = r.capture ?? { mode: "checkpoint" as const };
  const steal = cap.steal ? ` and take ${cap.steal} of their crown charge` : "";
  const slopes = pack.zones.filter((z) => z.slope);
  const size = squadSize(pack);
  const need = Math.min(r.winAt ?? 1, size);
  const cards: RuleCard[] = [];

  cards.push(r.dice === "pick2"
    ? { key: "dice", icon: "⚄⚂", title: "Two dice, your pick", text: "Roll two dice and move by whichever one you like. Throw doubles and you roll again." }
    : { key: "dice", icon: "⚄", title: "One die", text: r.extraRollOnSix ? "Roll one die and move that far. A 6 rolls again." : "Roll one die and move that far. No bonus throws: extra rolls come only from powers and tiles." });

  cards.push(r.movement === "forward"
    ? {
        key: "move", icon: "→", title: "One way streets",
        text: `Every move goes forward. No doubling back.${slopes.length ? ` Hills change your stride: ${slopes.map((z) => `${z.name} ${z.slope === "up" ? "−1" : "+1"}`).join(", ")}.` : ""}`,
      }
    : {
        key: "move", icon: "⇄", title: "Forward or back",
        text: `Each roll you may move forward or backward to hunt rivals, until ${r.stormName} (round ${r.stormRound[4]} in 4 player games) locks everyone forward.`,
      });

  cards.push(cap.mode === "tow"
    ? { key: "capture", icon: "⛓", title: "Tow away", text: `Land on a rival to tow them back ${cap.back ?? 6} tiles${steal}. Safe spots can't be towed from.` }
    : cap.mode === "stun"
      ? { key: "capture", icon: "🍯", title: "Sticky traps", text: `Land on a rival to trap them where they stand: they lose their next turn${steal}.` }
      : cap.mode === "start"
        ? { key: "capture", icon: "☠", title: "One tile, one survivor", text: `Land on a rival and they die: all the way back to the start${steal}. Only sanctuaries and shields save them.` }
        : { key: "capture", icon: "⚔", title: "Hunt", text: "Land on a rival to send them back to their last checkpoint. Sanctuaries are safe." });

  if (size > 1) {
    cards.push({
      key: "squad", icon: "⛓", title: `${size} per house`,
      text: `Every player commands ${size} legends in one colour. Two of yours on one tile form a bond: nobody can land on it${r.bondMarch ? ", it marches as one" : ""}, and casting from it fires every member's power at once. Bring ${need} home to win.`,
    });
  }

  if (r.tides) {
    cards.push({
      key: "twist", icon: "≋", title: r.tides.name,
      text: `Every ${r.tides.every} rounds a new element reigns (${r.tides.elements.join(" → ")}). While it does, its house moves +${r.tides.bonus} on every forward move.`,
    });
  } else if (pack.events?.length && r.eventEvery) {
    cards.push({
      key: "twist", icon: "☁", title: "City events",
      text: `Every ${r.eventEvery} rounds the world strikes, with a round's warning: ${pack.events.map((e) => e.name).join(", ")}.`,
    });
  }

  cards.push({
    key: "powers", icon: "✦", title: "Powers",
    text: size > 1
      ? "Each legend has its own power; cast one before rolling. Your house's crown power charges every turn, faster when you take someone out and fastest when you're the one who falls."
      : "Cast your power before rolling. Your crown power charges every turn, faster when you take someone out and fastest when you're the one who falls.",
  });
  return cards;
}

/** Two or three word summary of what makes a world's rules different, for world cards. */
export function ruleTags(pack: ThemePack): string[] {
  const r = pack.rules;
  const tags: string[] = [];
  const size = squadSize(pack);
  if (size > 1) tags.push(`${size} per house`);
  tags.push(r.dice === "pick2" ? "Pick a die" : "One die");
  tags.push(r.movement === "forward" ? "One way" : "Both ways");
  tags.push(r.capture?.mode === "tow" ? "Tow" : r.capture?.mode === "stun" ? "Sticky" : r.capture?.mode === "start" ? "Sudden death" : "Checkpoint");
  if (r.tides) tags.push("Tides");
  else if (pack.events?.length) tags.push("Events");
  return tags;
}
