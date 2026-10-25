"use client";
import { useImperativeHandle, useRef, useState, type Ref } from "react";
import { ANIMATION_TIMING } from "@ludo/net";

export interface DiceHandle {
  roll(value: number): Promise<void>;
}

const PIPS: Record<number, number[]> = {
  1: [5], 2: [3, 7], 3: [3, 5, 7], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9],
};
// Face placement on the cube, and the cube rotation that brings each face forward.
const FACES = [
  { v: 1, t: "rotateY(0deg)", rx: 0, ry: 0 },
  { v: 6, t: "rotateY(180deg)", rx: 0, ry: 180 },
  { v: 2, t: "rotateY(90deg)", rx: 0, ry: -90 },
  { v: 5, t: "rotateY(-90deg)", rx: 0, ry: 90 },
  { v: 3, t: "rotateX(90deg)", rx: -90, ry: 0 },
  { v: 4, t: "rotateX(-90deg)", rx: 90, ry: 0 },
];

export function Dice({ ref, size = 64 }: { ref?: Ref<DiceHandle>; size?: number }) {
  const [rot, setRot] = useState({ x: -18, y: 24 });
  const rotRef = useRef(rot);
  const [rolling, setRolling] = useState(false);

  useImperativeHandle(ref, () => ({
    roll(value) {
      const f = FACES.find((f) => f.v === value)!;
      const cur = rotRef.current;
      const shortest = (angle: number) => ((angle + 180) % 360 + 360) % 360 - 180;
      // One gentle turn instead of several rapid spins on both axes.
      const next = {
        x: cur.x + 360 + shortest(f.rx - cur.x),
        y: cur.y + shortest(f.ry - cur.y),
      };
      rotRef.current = next;
      setRolling(true);
      setRot(next);
      return new Promise((r) => setTimeout(() => { setRolling(false); r(); }, ANIMATION_TIMING.rollMs));
    },
  }));

  const h = size / 2;
  return (
    <div className="dice-scene" style={{ width: size, height: size }}>
      <div className="dice-cube" style={{ width: size, height: size, transitionDuration: `${ANIMATION_TIMING.rollMs}ms`, transform: `rotateX(${rot.x}deg) rotateY(${rot.y}deg)` }}>
        {FACES.map((f) => (
          <div key={f.v} className="dice-face" style={{ transform: `${f.t} translateZ(${h}px)` }}>
            {Array.from({ length: 9 }, (_, i) => (
              <div key={i}>{PIPS[f.v].includes(i + 1) && <div className="pip" />}</div>
            ))}
          </div>
        ))}
      </div>
      <div
        className="mx-auto rounded-[50%] bg-black/50 blur-[6px] transition-all duration-700"
        style={{ width: size * (rolling ? 0.6 : 0.85), height: size * 0.16, marginTop: size * 0.18 }}
      />
    </div>
  );
}
