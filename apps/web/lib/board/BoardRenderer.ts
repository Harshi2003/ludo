import {
  character, tileDef, type Board, type GameEvent, type GameState, type MoveOption, type ThemePack, type Tile,
} from "@ludo/engine";
import { Application, Assets, Container, Graphics, Rectangle, Sprite, Text, type FederatedPointerEvent, type Texture } from "pixi.js";
import { ELEMENT_GLYPH, tileColor, tileGlyph, zoneColor } from "../visuals";
import { addGlow, buildIsland, decorFor } from "./decor";
import { drawGlyph } from "./glyphs";
import { boardExtents, COL_W, TILE_R, tilePos, wave } from "./layout";
import { clamp, ease, glowTexture, hex, lerp, mix, orbTexture, skyTexture, sparkTexture, Tweener } from "./util";

export interface Insets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface CameraView {
  x0: number;
  x1: number;
  worldWidth: number;
}

interface TileView {
  tile: Tile;
  root: Container;
  halo?: Sprite;
  glyph?: Container;
  spin: boolean;
  phase: number;
}

interface TokenView {
  seat: number;
  root: Container;
  body: Container;
  aura: Sprite;
  ring: Graphics;
  shield: Graphics;
  status: Container;
  tile: number;
  color: string;
}

interface Particle {
  s: Sprite;
  vx: number;
  vy: number;
  life: number;
  max: number;
  gravity: number;
  fade: number;
}

const TOKEN_R = 19;

export class BoardRenderer {
  readonly app = new Application();
  private tw!: Tweener;
  private pack: ThemePack;
  private board: Board;
  private font: string;

  // Layers
  private sky = new Sprite();
  private painted = new Sprite();
  private stars = new Container();
  private nebula = new Container();
  private world = new Container();
  private islandsBack = new Container();
  private islandsFront = new Container();
  private edges = new Graphics();
  private pathPreview = new Graphics();
  private tilesLayer = new Container();
  private marks = new Container();
  private highlights = new Container();
  private tokensLayer = new Container();
  private fx = new Container();
  private ambient = new Container();

  private tiles: TileView[] = [];
  private tokens: TokenView[] = [];
  private particles: Particle[] = [];
  private glows: Sprite[] = [];
  private starData: { s: Sprite; x: number; y: number; p: number; tw: number }[] = [];
  private crown?: Container;
  private castle = { x: 0, y: 0 };

  // Camera
  private cam = { x: 0, y: 0, zoom: 1 };
  private target = { x: 0, y: 0, zoom: 1 };
  private follow: TokenView | null = null;
  private userControlUntil = 0;
  private insets: Insets = { left: 0, right: 0, top: 0, bottom: 0 };
  private extents!: ReturnType<typeof boardExtents>;
  private shake = 0;
  private pointers = new Map<number, { x: number; y: number }>();
  private dragStart: { x: number; y: number; camX: number; camY: number; dist?: number; zoom?: number } | null = null;
  private moved = 0;
  private time = 0;
  private activeSeat = -1;
  private destroyed = false;

  onCamera?: (v: CameraView) => void;
  onPick?: (index: number) => void;

  private constructor(pack: ThemePack, board: Board, font: string) {
    this.pack = pack;
    this.board = board;
    this.font = font;
  }

  static async create(el: HTMLElement, pack: ThemePack, state: GameState, font: string) {
    const r = new BoardRenderer(pack, state.board, font);
    await r.app.init({
      resizeTo: el,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      background: pack.art.palette.bg,
      preference: "webgl",
    });
    el.appendChild(r.app.canvas);
    r.app.canvas.style.touchAction = "none";
    r.tw = new Tweener(r.app.ticker);
    r.build(state);
    r.bindInput();
    r.app.ticker.add((t) => r.tick(t.deltaMS));
    r.resetCamera(state.players[state.turn].tile, true);
    return r;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.app.destroy(true, { children: true });
  }

  /** AI-painted backdrop: fades in behind the starfield, cover-fitted with gentle parallax. */
  private async loadBackground(url: string) {
    try {
      const tex = await Assets.load<Texture>({ src: url, parser: "texture" });
      if (this.destroyed) return;
      this.painted.texture = tex;
      this.painted.anchor.set(0.5);
      this.painted.alpha = 0;
      void this.tw.to(1200, (k) => (this.painted.alpha = k * 0.55));
    } catch {
      // Keep the procedural sky if the image can't load.
    }
  }

  // ─── Scene construction ────────────────────────────────────────────────

  private build(state: GameState) {
    const { pack, board } = this;
    const stage = this.app.stage;
    this.extents = boardExtents(board);

    const top = mix(pack.art.palette.bg, pack.art.palette.primary, 0.22);
    this.sky.texture = skyTexture(`#${top.toString(16).padStart(6, "0")}`, pack.art.palette.bg, "#05030f");
    stage.addChild(this.sky, this.painted, this.nebula, this.stars, this.world);
    if (pack.art.backgroundUrl) void this.loadBackground(pack.art.backgroundUrl);

    const nebulaColors = [pack.art.palette.primary, pack.art.palette.accent, ...Object.values(pack.art.zoneColors)];
    for (let i = 0; i < 7; i++) {
      const s = new Sprite(glowTexture());
      s.anchor.set(0.5);
      s.tint = nebulaColors[i % nebulaColors.length];
      s.alpha = 0.12 + Math.random() * 0.1;
      s.scale.set(6 + Math.random() * 8, 4 + Math.random() * 5);
      s.blendMode = "add";
      this.nebula.addChild(s);
      this.starData.push({ s, x: Math.random(), y: Math.random(), p: 0.015, tw: 0 });
    }
    for (let i = 0; i < 220; i++) {
      const s = new Sprite(sparkTexture());
      s.anchor.set(0.5);
      const big = Math.random() < 0.08;
      s.scale.set(big ? 0.35 + Math.random() * 0.25 : 0.1 + Math.random() * 0.14);
      s.tint = Math.random() < 0.3 ? 0xd8c7ff : 0xffffff;
      this.stars.addChild(s);
      this.starData.push({ s, x: Math.random(), y: Math.random(), p: 0.03 + Math.random() * 0.05, tw: Math.random() * 6 });
    }

    this.world.addChild(
      this.islandsBack, this.edges, this.pathPreview, this.islandsFront, this.tilesLayer, this.marks,
      this.highlights, this.tokensLayer, this.ambient, this.fx,
    );

    this.buildIslands();
    this.buildEdges();
    this.buildCastle();
    for (const t of board.tiles) if (!t.finish) this.tiles.push(this.buildTile(t, state));
    this.buildZoneLabels();
    state.players.forEach((p) => this.tokens.push(this.buildToken(p.seat, state)));
    this.layoutTokens(false);
    this.updateStatus(state);
  }

  private buildIslands() {
    const { pack, board, extents } = this;
    const bg = pack.art.palette.bg;
    const spans = [{ zone: -1, from: 0, to: board.zoneCols[0].from - 1 }, ...board.zoneCols];
    spans.forEach((z, i) => {
      const zoneDef = pack.zones[z.zone];
      const isLast = i === spans.length - 1;
      const island = buildIsland({
        x0: (z.from - 0.42) * COL_W,
        x1: (z.to + (isLast ? 2.2 : 0.42)) * COL_W,
        top: extents.rawMinY - 64,
        bottom: extents.rawMaxY + 64,
        color: z.zone < 0 ? pack.art.palette.primary : zoneColor(pack, z.zone),
        bg,
        kind: z.zone < 0 ? "shrine" : decorFor(zoneDef?.id, zoneDef?.type, zoneDef?.decor),
        seed: board.seed * 31 + i * 977,
      });
      this.islandsBack.addChild(island.back);
      this.islandsFront.addChild(island.front);
      this.glows.push(...island.glows);
    });
  }

  private buildZoneLabels() {
    const { pack, board, extents } = this;
    for (const z of board.zoneCols) {
      const def = pack.zones[z.zone];
      if (!def) continue;
      const mid = ((z.from + z.to) / 2) * COL_W;
      const label = new Text({
        text: def.name.toUpperCase(),
        style: {
          fontFamily: this.font, fontSize: 24, fontWeight: "700", letterSpacing: 7, fill: mix(zoneColor(pack, z.zone), "#ffffff", 0.55),
          stroke: { color: this.pack.art.palette.bg, width: 6 },
        },
      });
      label.anchor.set(0.5);
      label.alpha = 0.85;
      label.position.set(mid, extents.rawMinY - 195 + wave(z.from + (z.to - z.from) / 2));
      this.world.addChildAt(label, this.world.getChildIndex(this.islandsFront));
    }
  }

  private buildEdges() {
    const g = this.edges;
    const { board, pack } = this;
    for (const pass of [0, 1]) {
      for (const t of board.tiles) {
        const a = tilePos(t);
        for (const n of t.next) {
          const u = board.tiles[n];
          const b = tilePos(u);
          const dx = (b.x - a.x) * 0.5;
          const color = t.zone >= 0 ? zoneColor(pack, t.zone) : pack.art.palette.primary;
          g.moveTo(a.x, a.y).bezierCurveTo(a.x + dx, a.y, b.x - dx, b.y, b.x, b.y);
          if (pass === 0) g.stroke({ width: 16, color, alpha: 0.1, cap: "round" });
          else g.stroke({ width: 3, color: mix(color, "#ffffff", 0.4), alpha: 0.45, cap: "round" });
        }
      }
    }
    // Portal pairs: faint arcing ley-lines so players can plan jumps.
    for (const t of board.tiles) {
      if (t.pair === undefined || t.id > t.pair) continue;
      const a = tilePos(t);
      const b = tilePos(board.tiles[t.pair]);
      const lift = Math.min(260, Math.abs(b.x - a.x) * 0.25);
      g.moveTo(a.x, a.y).bezierCurveTo(a.x, a.y - lift, b.x, b.y - lift, b.x, b.y);
      g.stroke({ width: 2, color: 0xb794ff, alpha: 0.25 });
    }
  }

  private buildTile(t: Tile, state: GameState): TileView {
    const { pack } = this;
    const def = pack.tiles.find((d) => d.id === t.type);
    const p = tilePos(t);
    const root = new Container();
    root.position.set(p.x, p.y);
    const zc = t.zone >= 0 ? zoneColor(pack, t.zone) : pack.art.palette.primary;
    const special = !!def && def.base !== "normal";
    const color = special ? tileColor(def!) : zc;
    const startSeat = t.start !== undefined ? state.players[t.start] : undefined;
    const seatColor = startSeat ? character(pack, startSeat.character).color : undefined;
    const view: TileView = { tile: t, root, spin: def?.base === "portal", phase: Math.random() * 6 };

    if (special) {
      const halo = new Sprite(glowTexture());
      halo.anchor.set(0.5);
      halo.tint = color;
      halo.alpha = 0.55;
      halo.scale.set(1.25);
      halo.blendMode = "add";
      root.addChild(halo);
      view.halo = halo;
    }

    const g = new Graphics();
    // Drop shadow, rim, face, bevel highlight.
    g.ellipse(0, TILE_R * 0.62, TILE_R * 0.95, TILE_R * 0.38).fill({ color: 0x000000, alpha: 0.35 });
    const rim = seatColor ? mix(seatColor, "#000000", 0.45) : special ? mix(color, "#0b0820", 0.55) : mix(zc, "#0b0820", 0.72);
    const face = seatColor ? mix(seatColor, "#120c2c", 0.62) : special ? mix(color, "#120c2c", 0.72) : mix(zc, "#1c1640", 0.84);
    g.regularPoly(0, 3, TILE_R, 6, 0).fill(mix(rim, "#000000", 0.4));
    g.regularPoly(0, 0, TILE_R, 6, 0).fill(rim);
    g.regularPoly(0, 0, TILE_R * 0.84, 6, 0).fill(face);
    g.regularPoly(0, -2, TILE_R * 0.7, 6, 0).fill({ color: 0xffffff, alpha: 0.05 });
    g.regularPoly(0, 0, TILE_R * 0.84, 6, 0).stroke({ width: 1.5, color: special ? color : mix(zc, "#ffffff", 0.2), alpha: special ? 0.85 : 0.25 });
    if (t.shared) {
      // Battle-zone tiles carry a crimson inner rune ring.
      g.circle(0, 0, TILE_R * 0.58).stroke({ width: 1.5, color: 0xfb4f6d, alpha: 0.35 });
    }
    if (t.checkpoint && t.start === undefined) {
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 - Math.PI / 2;
        g.star(Math.cos(a) * TILE_R, Math.sin(a) * TILE_R, 4, 4.5, 1.6).fill(0x7dd3fc);
      }
    }
    root.addChild(g);

    if (special) {
      const glyph = new Container();
      const gg = new Graphics();
      gg.circle(0, 0, TILE_R * 0.56).fill({ color: mix(color, "#000000", 0.55), alpha: 0.9 });
      gg.circle(0, 0, TILE_R * 0.56).stroke({ width: 1.5, color, alpha: 0.6 });
      drawGlyph(gg, tileGlyph(def!), TILE_R * 0.36, mix(color, "#ffffff", 0.25), mix(color, "#000000", 0.55));
      glyph.addChild(gg);
      root.addChild(glyph);
      view.glyph = glyph;
    } else if (t.start === 0 || (t.start !== undefined && t.checkpoint)) {
      const gg = new Graphics();
      gg.circle(0, 0, TILE_R * 0.42).stroke({ width: 2, color: seatColor ?? zc, alpha: 0.9 });
      gg.star(0, 0, 4, TILE_R * 0.3, TILE_R * 0.1).fill(seatColor ?? zc);
      root.addChild(gg);
    }

    this.tilesLayer.addChild(root);
    return view;
  }

  private buildCastle() {
    const f = this.board.tiles[this.board.finish];
    const p = tilePos(f);
    const x = p.x + COL_W * 0.9;
    const y = p.y;
    this.castle = { x, y };
    const root = new Container();
    root.position.set(x, y);
    const lastZone = this.board.zoneCols[this.board.zoneCols.length - 1]?.zone ?? 0;
    const col = zoneColor(this.pack, lastZone);
    addGlow(root, 0, -60, col, 6, 0.4);
    addGlow(root, 0, -40, "#ffffff", 2.5, 0.25);
    const g = new Graphics();
    g.ellipse(0, 40, 150, 34).fill({ color: mix(col, "#0b0820", 0.65) });
    g.ellipse(0, 36, 150, 30).stroke({ width: 3, color: col, alpha: 0.5 });
    const spires = [
      { dx: -110, h: 120, w: 22 }, { dx: -70, h: 190, w: 28 }, { dx: -30, h: 150, w: 22 },
      { dx: 0, h: 260, w: 36 }, { dx: 34, h: 170, w: 24 }, { dx: 74, h: 210, w: 28 }, { dx: 112, h: 130, w: 22 },
    ];
    for (const s of spires) {
      const b = 36;
      const light = mix(col, "#ffffff", 0.35);
      const darkc = mix(col, "#3b0764", 0.45);
      g.poly([s.dx - s.w, b, s.dx - s.w, b - s.h * 0.78, s.dx, b - s.h, s.dx, b]).fill(light);
      g.poly([s.dx, b, s.dx, b - s.h, s.dx + s.w, b - s.h * 0.78, s.dx + s.w, b]).fill(darkc);
      g.moveTo(s.dx, b - s.h).lineTo(s.dx, b).stroke({ width: 1.5, color: 0xffffff, alpha: 0.5 });
      // Windows
      for (let k = 1; k < s.h / 50; k++) g.roundRect(s.dx - s.w * 0.55, b - k * 44, 7, 12, 3).fill({ color: 0xfff7d6, alpha: 0.85 });
    }
    // Gate arch where tokens arrive.
    g.roundRect(-26, -30, 52, 66, 26).fill(mix(col, "#0b0820", 0.75));
    g.roundRect(-26, -30, 52, 66, 26).stroke({ width: 3, color: 0xfff7d6, alpha: 0.8 });
    root.addChild(g);

    const crown = new Container();
    const cg = new Graphics();
    drawGlyph(cg, "crown", 26, 0xfcd34d, 0x0b0820);
    addGlow(crown, 0, 0, "#fcd34d", 1.6, 0.6);
    crown.addChild(cg);
    crown.position.set(0, -260);
    root.addChild(crown);
    this.crown = crown;

    const label = new Text({
      text: this.pack.world.finish.toUpperCase(),
      style: { fontFamily: this.font, fontSize: 20, fontWeight: "900", letterSpacing: 5, fill: 0xfff1fb },
    });
    label.anchor.set(0.5);
    label.position.set(0, 96);
    root.addChild(label);
    this.tilesLayer.addChild(root);
  }

  private buildToken(seat: number, state: GameState): TokenView {
    const p = state.players[seat];
    const c = character(this.pack, p.character);
    const root = new Container();
    const body = new Container();
    const aura = new Sprite(glowTexture());
    aura.anchor.set(0.5);
    aura.tint = c.color;
    aura.alpha = 0.75;
    aura.scale.set(0.9);
    aura.blendMode = "add";

    const ring = new Graphics();
    ring.ellipse(0, TOKEN_R * 0.9, TOKEN_R * 1.35, TOKEN_R * 0.5).stroke({ width: 3, color: c.color, alpha: 0.9 });
    ring.visible = false;

    const shadow = new Graphics();
    shadow.ellipse(0, TOKEN_R * 0.95, TOKEN_R * 0.9, TOKEN_R * 0.32).fill({ color: 0x000000, alpha: 0.45 });

    const orb = new Sprite(orbTexture());
    orb.anchor.set(0.5);
    orb.width = orb.height = TOKEN_R * 2;
    orb.tint = c.color;

    const g = new Graphics();
    g.circle(0, 0, TOKEN_R).stroke({ width: 2.5, color: 0xffffff, alpha: 0.85 });
    drawGlyph(g, c.glyph ?? ELEMENT_GLYPH[c.element] ?? "gem", TOKEN_R * 0.5, 0xffffff, hex(c.color));
    const spec = new Sprite(glowTexture());
    spec.anchor.set(0.5);
    spec.scale.set(0.16);
    spec.position.set(-TOKEN_R * 0.38, -TOKEN_R * 0.42);
    spec.alpha = 0.9;

    const shield = new Graphics();
    shield.circle(0, 0, TOKEN_R + 7).fill({ color: 0x7dd3fc, alpha: 0.12 });
    shield.circle(0, 0, TOKEN_R + 7).stroke({ width: 2, color: 0xbae6fd, alpha: 0.8 });
    shield.visible = false;

    const status = new Container();
    body.addChild(orb, g, spec, shield, status);
    root.addChild(ring, aura, shadow, body);
    this.tokensLayer.addChild(root);
    return { seat, root, body, aura, ring, shield, status, tile: p.tile, color: c.color };
  }

  // ─── Camera ────────────────────────────────────────────────────────────

  setInsets(i: Insets) {
    this.insets = i;
    if (performance.now() > this.userControlUntil) this.target.zoom = this.cam.zoom = this.defaultZoom();
  }

  private defaultZoom() {
    const { width, height } = this.app.screen;
    const h = height - this.insets.top - this.insets.bottom;
    const span = this.extents.rawMaxY - this.extents.rawMinY + 420;
    const w = width - this.insets.left - this.insets.right;
    return clamp(Math.min(h / span, w / (11 * COL_W)), 0.38, 1.1);
  }

  resetCamera(tile: number, instant = false) {
    const p = tilePos(this.board.tiles[tile]);
    this.target = { x: p.x + COL_W * 2.5, y: (this.extents.rawMinY + this.extents.rawMaxY) / 2 - 30, zoom: this.defaultZoom() };
    this.userControlUntil = 0;
    if (instant) this.cam = { ...this.target };
  }

  overview() {
    const { width } = this.app.screen;
    const w = width - this.insets.left - this.insets.right;
    this.target = {
      x: this.extents.width / 2 - COL_W,
      y: (this.extents.rawMinY + this.extents.rawMaxY) / 2 - 60,
      zoom: clamp(w / (this.extents.width + 300), 0.12, 1),
    };
    this.follow = null;
    this.userControlUntil = performance.now() + 60_000;
  }

  focusSeat(seat: number) {
    const tk = this.tokens[seat];
    this.follow = tk;
    this.userControlUntil = 0;
    if (this.target.zoom < this.defaultZoom() * 0.8) this.target.zoom = this.defaultZoom();
  }

  panTo(worldX: number) {
    this.target.x = worldX;
    this.follow = null;
    this.userControlUntil = performance.now() + 6000;
  }

  private applyCamera() {
    const { width, height } = this.app.screen;
    const cx = this.insets.left + (width - this.insets.left - this.insets.right) / 2;
    const cy = this.insets.top + (height - this.insets.top - this.insets.bottom) / 2;
    const sx = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    const sy = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    this.world.scale.set(this.cam.zoom);
    this.world.position.set(cx - this.cam.x * this.cam.zoom + sx, cy - this.cam.y * this.cam.zoom + sy);
  }

  private bindInput() {
    const stage = this.app.stage;
    stage.eventMode = "static";
    stage.hitArea = new Rectangle(-1e5, -1e5, 2e5, 2e5);
    stage.on("pointerdown", (e: FederatedPointerEvent) => {
      this.pointers.set(e.pointerId, { x: e.global.x, y: e.global.y });
      this.moved = 0;
      this.startGesture();
    });
    stage.on("globalpointermove", (e: FederatedPointerEvent) => {
      if (!this.pointers.has(e.pointerId) || !this.dragStart) return;
      const prev = this.pointers.get(e.pointerId)!;
      this.moved += Math.hypot(e.global.x - prev.x, e.global.y - prev.y);
      this.pointers.set(e.pointerId, { x: e.global.x, y: e.global.y });
      const pts = [...this.pointers.values()];
      const d = this.dragStart;
      if (pts.length >= 2 && d.dist) {
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        this.target.zoom = clamp((d.zoom ?? 1) * (dist / d.dist), 0.12, 2.2);
        this.cam.zoom = this.target.zoom;
      } else if (pts.length === 1) {
        const p = pts[0];
        this.target.x = d.camX - (p.x - d.x) / this.cam.zoom;
        this.target.y = d.camY - (p.y - d.y) / this.cam.zoom;
        this.cam.x = this.target.x;
        this.cam.y = this.target.y;
      }
      if (this.moved > 6) {
        this.follow = null;
        this.userControlUntil = performance.now() + 5000;
      }
    });
    const up = (e: FederatedPointerEvent) => {
      this.pointers.delete(e.pointerId);
      this.startGesture();
    };
    stage.on("pointerup", up);
    stage.on("pointerupoutside", up);
    this.app.canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const rect = this.app.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const before = this.world.toLocal({ x: sx, y: sy });
        const z = clamp(this.cam.zoom * Math.exp(-e.deltaY * 0.0015), 0.12, 2.2);
        this.cam.zoom = this.target.zoom = z;
        this.applyCamera();
        const after = this.world.toLocal({ x: sx, y: sy });
        this.cam.x += before.x - after.x;
        this.cam.y += before.y - after.y;
        this.target.x = this.cam.x;
        this.target.y = this.cam.y;
        this.follow = null;
        this.userControlUntil = performance.now() + 5000;
      },
      { passive: false },
    );
  }

  private startGesture() {
    const pts = [...this.pointers.values()];
    if (!pts.length) {
      this.dragStart = null;
      return;
    }
    this.dragStart = {
      x: pts[0].x, y: pts[0].y, camX: this.cam.x, camY: this.cam.y,
      dist: pts.length >= 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : undefined,
      zoom: this.cam.zoom,
    };
  }

  // ─── Frame loop ──────────────────────────────────────────────────────

  private tick(dt: number) {
    this.time += dt / 1000;
    const { width, height } = this.app.screen;
    this.sky.width = width;
    this.sky.height = height;
    if (this.painted.texture && this.painted.texture.width > 1) {
      const t = this.painted.texture;
      const scale = Math.max((width * 1.15) / t.width, (height * 1.1) / t.height);
      this.painted.scale.set(scale);
      const drift = ((this.cam.x / Math.max(1, this.extents.width)) - 0.5) * width * 0.12;
      this.painted.position.set(width / 2 - drift, height / 2);
    }

    // Camera follows the active token unless the player is steering.
    if (this.follow && performance.now() > this.userControlUntil) {
      const r = this.follow.root;
      const half = (width - this.insets.left - this.insets.right) / 2 / this.cam.zoom;
      const lead = Math.min(COL_W * 2.5, half * 0.45);
      this.target.x = r.x + lead;
    }
    const minX = -COL_W;
    const maxX = this.extents.width;
    this.target.x = clamp(this.target.x, minX, maxX);
    this.target.y = clamp(this.target.y, this.extents.rawMinY - 400, this.extents.rawMaxY + 400);
    const k = 1 - Math.pow(0.002, dt / 1000);
    this.cam.x = lerp(this.cam.x, this.target.x, k);
    this.cam.y = lerp(this.cam.y, this.target.y, k);
    this.cam.zoom = lerp(this.cam.zoom, this.target.zoom, k);
    this.shake *= Math.pow(0.0005, dt / 1000);
    if (this.shake < 0.3) this.shake = 0;
    this.applyCamera();

    // Parallax sky.
    for (const s of this.starData) {
      const px = (((s.x * width - this.cam.x * s.p * this.cam.zoom) % width) + width) % width;
      s.s.position.set(px, s.y * height);
      if (s.tw) s.s.alpha = 0.45 + 0.55 * Math.abs(Math.sin(this.time * 0.8 + s.tw));
    }

    for (const t of this.tiles) {
      if (t.halo) t.halo.alpha = 0.4 + 0.2 * Math.sin(this.time * 2 + t.phase);
      if (t.spin && t.glyph) t.glyph.rotation = this.time * 1.2;
    }
    for (const [i, g] of this.glows.entries()) g.alpha = clamp(g.alpha + Math.sin(this.time * 1.5 + i) * 0.002, 0.15, 0.7);
    if (this.crown) this.crown.y = -262 + Math.sin(this.time * 1.6) * 8;

    for (const tk of this.tokens) {
      tk.body.y = Math.sin(this.time * 3 + tk.seat) * 2.5 - TOKEN_R * 0.45;
      tk.aura.alpha = 0.55 + 0.25 * Math.sin(this.time * 2.5 + tk.seat);
      if (tk.ring.visible) {
        const s = 1 + 0.12 * Math.sin(this.time * 5);
        tk.ring.scale.set(s);
        tk.ring.alpha = 0.6 + 0.4 * Math.sin(this.time * 5);
      }
    }
    for (const h of this.highlights.children) {
      const s = 1 + 0.06 * Math.sin(this.time * 6);
      h.scale.set(s);
    }

    this.updateParticles(dt);
    this.spawnAmbient(dt);
  }

  // ─── Particles ─────────────────────────────────────────────────────────

  private emit(x: number, y: number, color: string | number, n: number, speed = 220, life = 0.8, size = 0.35, gravity = 0, layer = this.fx) {
    for (let i = 0; i < n; i++) {
      const s = new Sprite(Math.random() < 0.7 ? sparkTexture() : glowTexture());
      s.anchor.set(0.5);
      s.tint = color;
      s.blendMode = "add";
      s.position.set(x, y);
      const sc = size * (0.4 + Math.random() * 0.8) * (s.texture === glowTexture() ? 0.25 : 1);
      s.scale.set(sc);
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      layer.addChild(s);
      const max = life * (0.6 + Math.random() * 0.6);
      this.particles.push({ s, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: max, max, gravity, fade: 1 });
    }
  }

  private updateParticles(dt: number) {
    const s = dt / 1000;
    this.particles = this.particles.filter((p) => {
      p.life -= s;
      if (p.life <= 0) {
        p.s.destroy();
        return false;
      }
      p.vy += p.gravity * s;
      p.vx *= 1 - 1.8 * s;
      p.vy *= 1 - 1.8 * s;
      p.s.x += p.vx * s;
      p.s.y += p.vy * s;
      p.s.alpha = Math.min(1, (p.life / p.max) * 1.6) * p.fade;
      return true;
    });
  }

  private ambientClock = 0;
  private spawnAmbient(dt: number) {
    this.ambientClock += dt;
    if (this.ambientClock < 90 || this.ambient.children.length > 140) return;
    this.ambientClock = 0;
    const { width } = this.app.screen;
    const half = width / 2 / this.cam.zoom;
    const x = this.cam.x + (Math.random() * 2 - 1) * half;
    const col = Math.round(x / COL_W);
    const zc = this.board.zoneCols.find((z) => col >= z.from && col <= z.to);
    const zone = zc ? this.pack.zones[zc.zone] : undefined;
    const kind = decorFor(zone?.id, zone?.type, zone?.decor);
    const color = zc ? zoneColor(this.pack, zc.zone) : this.pack.art.palette.accent;
    const y = this.extents.rawMinY - 80 + Math.random() * (this.extents.rawMaxY - this.extents.rawMinY + 220) + wave(col);
    const s = new Sprite(sparkTexture());
    s.anchor.set(0.5);
    s.blendMode = "add";
    s.tint = kind === "peaks" ? "#fdba74" : kind === "forest" ? "#bbf7d0" : color;
    s.scale.set(0.15 + Math.random() * 0.25);
    s.position.set(x, y);
    this.ambient.addChild(s);
    const rise = kind === "peaks" ? -40 : kind === "falls" ? 25 : -12;
    const life = 3 + Math.random() * 3;
    this.particles.push({ s, vx: (Math.random() - 0.5) * 30, vy: rise, life, max: life, gravity: 0, fade: 0.8 });
  }

  // ─── Tokens & state sync ────────────────────────────────────────────────

  /** Spread tokens that share a tile so all stay visible. */
  private offsets(seat: number): { x: number; y: number } {
    const tile = this.tokens[seat].tile;
    const here = this.tokens.filter((t) => t.tile === tile).map((t) => t.seat);
    const i = here.indexOf(seat);
    const n = here.length;
    if (n <= 1) return { x: 0, y: 0 };
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { x: Math.cos(a) * 13, y: Math.sin(a) * 9 };
  }

  private tokenTarget(seat: number) {
    const tk = this.tokens[seat];
    const t = this.board.tiles[tk.tile];
    if (t.finish) return { x: this.castle.x, y: this.castle.y };
    const p = tilePos(t);
    const o = this.offsets(seat);
    return { x: p.x + o.x, y: p.y + o.y };
  }

  private layoutTokens(animate: boolean, except?: number) {
    for (const tk of this.tokens) {
      if (tk.seat === except) continue;
      const p = this.tokenTarget(tk.seat);
      if (!animate) tk.root.position.set(p.x, p.y);
      else {
        const sx = tk.root.x;
        const sy = tk.root.y;
        if (Math.hypot(sx - p.x, sy - p.y) < 1) continue;
        void this.tw.to(260, (k) => tk.root.position.set(lerp(sx, p.x, k), lerp(sy, p.y, k)));
      }
    }
    // Draw order: lower tokens in front.
    this.tokensLayer.children.sort((a, b) => a.y - b.y);
  }

  setActive(seat: number) {
    this.activeSeat = seat;
    for (const tk of this.tokens) tk.ring.visible = tk.seat === seat;
  }

  /** Reconcile visuals with engine state (statuses, traps, blocks, stray positions). */
  async sync(state: GameState, animate = true) {
    const moves: Promise<void>[] = [];
    for (const p of state.players) {
      const tk = this.tokens[p.seat];
      if (tk.tile !== p.tile) {
        tk.tile = p.tile;
        if (animate) moves.push(this.flyToken(tk, p.tile, 450));
      }
    }
    await Promise.all(moves);
    this.layoutTokens(animate);
    this.updateStatus(state);
  }

  private updateStatus(state: GameState) {
    for (const p of state.players) {
      const tk = this.tokens[p.seat];
      tk.shield.visible = !!p.shield;
      tk.status.removeChildren().forEach((c) => c.destroy());
      let x = TOKEN_R * 0.9;
      const badge = (glyph: "snowflake" | "eye", color: number) => {
        const g = new Graphics();
        g.circle(0, 0, 9).fill(0x0b0820);
        g.circle(0, 0, 9).stroke({ width: 1.5, color });
        drawGlyph(g, glyph, 5.5, color, 0x0b0820);
        g.position.set(x, -TOKEN_R * 0.9);
        tk.status.addChild(g);
        x -= 20;
      };
      if (p.skip > 0) badge("snowflake", 0x93c5fd);
      if (p.dice && p.dice.mode !== "plus1") badge("eye", 0xf472b6);
    }

    this.marks.removeChildren().forEach((c) => c.destroy());
    for (const trap of state.traps) {
      const pos = tilePos(this.board.tiles[trap.tile]);
      const col = character(this.pack, state.players[trap.owner].character).color;
      const g = new Graphics();
      g.circle(0, 0, TILE_R * 0.75).stroke({ width: 2, color: col, alpha: 0.9 });
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        g.star(Math.cos(a) * TILE_R * 0.75, Math.sin(a) * TILE_R * 0.75, 3, 5, 2, a).fill(col);
      }
      g.position.set(pos.x, pos.y);
      this.marks.addChild(g);
    }
    for (const b of state.blocks) {
      for (const id of b.tiles) {
        const pos = tilePos(this.board.tiles[id]);
        const g = new Graphics();
        g.roundRect(-TILE_R * 0.8, -TILE_R * 1.1, TILE_R * 1.6, TILE_R * 1.1, 6).fill(0x57534e);
        for (let row = 0; row < 3; row++) {
          const y = -TILE_R * 1.1 + row * TILE_R * 0.37;
          g.moveTo(-TILE_R * 0.8, y).lineTo(TILE_R * 0.8, y).stroke({ width: 1.5, color: 0x292524 });
          for (let c = 0; c < 3; c++) {
            const bx = -TILE_R * 0.8 + ((c + (row % 2) * 0.5) * TILE_R * 1.6) / 3;
            g.moveTo(bx, y).lineTo(bx, y + TILE_R * 0.37).stroke({ width: 1.5, color: 0x292524 });
          }
        }
        g.roundRect(-TILE_R * 0.8, -TILE_R * 1.1, TILE_R * 1.6, TILE_R * 1.1, 6).stroke({ width: 2, color: 0x84cc16, alpha: 0.7 });
        g.position.set(pos.x, pos.y + 6);
        this.marks.addChild(g);
      }
    }
  }

  // ─── Move picking ──────────────────────────────────────────────────────

  setMoves(moves: MoveOption[] | null, seat: number) {
    this.highlights.removeChildren().forEach((c) => c.destroy());
    this.pathPreview.clear();
    if (!moves) return;
    const color = this.tokens[seat]?.color ?? "#ffffff";
    moves.forEach((m, index) => {
      const t = this.board.tiles[m.to];
      const p = t.finish ? this.castle : tilePos(t);
      const c = new Container();
      c.position.set(p.x, p.y);
      const g = new Graphics();
      const ringColor = m.captures.length ? "#fb4f6d" : color;
      g.circle(0, 0, TILE_R + 9).fill({ color: ringColor, alpha: 0.16 });
      g.circle(0, 0, TILE_R + 9).stroke({ width: 3.5, color: ringColor, alpha: 0.95 });
      g.circle(0, 0, TILE_R + 15).stroke({ width: 1.5, color: ringColor, alpha: 0.45 });
      if (m.captures.length) {
        g.circle(0, -TILE_R - 16, 13).fill(0x3f0d18);
        g.circle(0, -TILE_R - 16, 13).stroke({ width: 2, color: 0xfb4f6d });
        const sk = new Graphics();
        drawGlyph(sk, "skull", 7.5, 0xfecdd3, 0x3f0d18);
        sk.position.set(0, -TILE_R - 16);
        c.addChild(sk);
      }
      if (m.dir === "back") {
        g.circle(TILE_R + 4, TILE_R * 0.5, 11).fill(0x1e1b4b);
        g.circle(TILE_R + 4, TILE_R * 0.5, 11).stroke({ width: 1.5, color: 0xc4b5fd });
        g.moveTo(TILE_R + 9, TILE_R * 0.5).lineTo(TILE_R - 1, TILE_R * 0.5).stroke({ width: 2.5, color: 0xc4b5fd, cap: "round" });
        g.moveTo(TILE_R + 3, TILE_R * 0.5 - 5).lineTo(TILE_R - 2, TILE_R * 0.5).lineTo(TILE_R + 3, TILE_R * 0.5 + 5).stroke({ width: 2.5, color: 0xc4b5fd, cap: "round", join: "round" });
      }
      c.addChildAt(g, 0);
      c.eventMode = "static";
      c.cursor = "pointer";
      c.hitArea = { contains: (x: number, y: number) => x * x + y * y < (TILE_R + 18) ** 2 };
      c.on("pointerover", () => this.previewPath(m, color));
      c.on("pointerout", () => this.pathPreview.clear());
      c.on("pointertap", () => {
        if (this.moved > 10) return;
        this.onPick?.(index);
      });
      this.highlights.addChild(c);
    });
  }

  private previewPath(m: MoveOption, color: string) {
    const g = this.pathPreview;
    g.clear();
    const start = this.tokens[this.activeSeat]?.tile;
    if (start === undefined) return;
    const pts = [start, ...m.path].map((id) => {
      const t = this.board.tiles[id];
      return t.finish ? this.castle : tilePos(t);
    });
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const dx = (b.x - a.x) * 0.5;
      g.bezierCurveTo(a.x + dx, a.y, b.x - dx, b.y, b.x, b.y);
    }
    g.stroke({ width: 10, color, alpha: 0.35, cap: "round", join: "round" });
    for (const p of pts.slice(1)) g.circle(p.x, p.y, 6).fill({ color: 0xffffff, alpha: 0.9 });
  }

  // ─── Event playback ─────────────────────────────────────────────────────

  async playEvent(e: GameEvent, state: GameState): Promise<void> {
    const tk = this.tokens[e.seat];
    switch (e.kind) {
      case "turn":
        this.setActive(e.seat);
        this.focusSeat(e.seat);
        return this.tw.wait(150);

      case "move": {
        if (!tk || !e.path?.length) return;
        this.follow = tk;
        const first = this.board.tiles[e.path[0]];
        const from = this.board.tiles[tk.tile];
        const adjacent = from.next.includes(first.id) || from.prev.includes(first.id);
        if (e.path.length === 1 && !adjacent) return this.teleport(tk, first.id);
        for (const id of e.path) await this.hop(tk, id);
        this.layoutTokens(true);
        return;
      }

      case "capture": {
        const victim = this.tokens[e.targets?.[0] ?? -1];
        const at = victim ? victim.root.position.clone() : tk.root.position.clone();
        this.emit(at.x, at.y, tk.color, 46, 380, 0.9, 0.5);
        this.emit(at.x, at.y, "#ffffff", 20, 260, 0.6, 0.35);
        this.shockwave(at.x, at.y, tk.color, 140);
        this.shake = 18;
        if (victim && e.to !== undefined) {
          victim.tile = e.to;
          await this.tw.wait(180);
          await this.flyToken(victim, e.to, 700);
          this.layoutTokens(true);
        }
        return;
      }

      case "blocked_capture": {
        const victim = this.tokens[e.targets?.[0] ?? -1];
        if (victim) {
          this.shockwave(victim.root.x, victim.root.y, "#7dd3fc", 70);
          this.emit(victim.root.x, victim.root.y, "#bae6fd", 24, 200, 0.6, 0.35);
        }
        return this.tw.wait(350);
      }

      case "tile": {
        const view = this.tiles.find((t) => t.tile.id === e.tile);
        const def = e.tile !== undefined ? tileDef(this.pack, state, e.tile) : undefined;
        if (view && def) {
          const color = tileColor(def);
          this.shockwave(view.root.x, view.root.y, color, 80);
          this.emit(view.root.x, view.root.y, color, 26, 180, 0.8, 0.4);
          void this.tw.to(380, (k) => view.root.scale.set(1 + Math.sin(k * Math.PI) * 0.22));
          this.floatText(def.name, view.root.x, view.root.y - TILE_R - 20, color);
        }
        return this.tw.wait(520);
      }

      case "trap":
        if (e.tile !== undefined) {
          const p = tilePos(this.board.tiles[e.tile]);
          this.emit(p.x, p.y, tk?.color ?? "#fff", 30, 260, 0.7, 0.45);
          this.shockwave(p.x, p.y, tk?.color ?? "#fff", 90);
        }
        return this.tw.wait(400);

      case "ability":
      case "ultimate": {
        if (!tk) return;
        const big = e.kind === "ultimate";
        this.follow = tk;
        for (let i = 0; i < (big ? 3 : 1); i++) {
          this.shockwave(tk.root.x, tk.root.y, tk.color, big ? 360 : 180);
          await this.tw.wait(110);
        }
        this.emit(tk.root.x, tk.root.y, tk.color, big ? 70 : 30, big ? 480 : 260, 1, 0.5);
        if (big) this.shake = 14;
        return this.tw.wait(big ? 300 : 200);
      }

      case "effect":
        for (const s of e.targets ?? []) {
          const t = this.tokens[s];
          if (!t) continue;
          this.emit(t.root.x, t.root.y, tk?.color ?? "#fff", 18, 200, 0.6, 0.4);
          void this.tw.to(300, (k) => t.body.scale.set(1 + Math.sin(k * Math.PI) * 0.3));
        }
        return this.tw.wait(e.targets?.length ? 260 : 120);

      case "skip":
        if (tk) {
          this.floatText("Stunned", tk.root.x, tk.root.y - 40, "#93c5fd");
          this.emit(tk.root.x, tk.root.y, "#bfdbfe", 20, 120, 0.8, 0.35);
        }
        return this.tw.wait(500);

      case "checkpoint":
        if (tk) this.shockwave(tk.root.x, tk.root.y, "#7dd3fc", 60);
        return;

      case "storm":
        this.shake = 10;
        return this.tw.wait(300);

      case "win":
        if (tk) {
          this.follow = tk;
          for (let i = 0; i < 6; i++) {
            const x = this.castle.x + (Math.random() - 0.5) * 300;
            const y = this.castle.y - 120 - Math.random() * 200;
            this.emit(x, y, i % 2 ? tk.color : "#fcd34d", 50, 300, 1.4, 0.45, 120);
            this.shockwave(x, y, i % 2 ? tk.color : "#fcd34d", 120);
            await this.tw.wait(260);
          }
        }
        return;

      default:
        return;
    }
  }

  private async hop(tk: TokenView, tileId: number) {
    const tile = this.board.tiles[tileId];
    const p = tile.finish ? this.castle : tilePos(tile);
    const sx = tk.root.x;
    const sy = tk.root.y;
    tk.tile = tileId;
    await this.tw.to(
      190,
      (k) => {
        tk.root.position.set(lerp(sx, p.x, k), lerp(sy, p.y, k) - Math.sin(k * Math.PI) * 26);
        const squash = 1 + Math.sin(k * Math.PI) * 0.08;
        tk.body.scale.set(2 - squash, squash);
      },
      ease.linear,
    );
    tk.body.scale.set(1);
    this.emit(p.x, p.y + 10, tk.color, 6, 70, 0.45, 0.25);
  }

  private async teleport(tk: TokenView, tileId: number) {
    this.emit(tk.root.x, tk.root.y, tk.color, 30, 220, 0.7, 0.4);
    this.shockwave(tk.root.x, tk.root.y, "#b794ff", 90);
    await this.tw.to(220, (k) => tk.root.scale.set(1 - k));
    tk.tile = tileId;
    const p = this.tokenTarget(tk.seat);
    tk.root.position.set(p.x, p.y);
    this.shockwave(p.x, p.y, "#b794ff", 90);
    this.emit(p.x, p.y, tk.color, 30, 220, 0.7, 0.4);
    await this.tw.to(320, (k) => tk.root.scale.set(k), ease.outBack);
    this.layoutTokens(true);
  }

  private async flyToken(tk: TokenView, tileId: number, ms: number) {
    tk.tile = tileId;
    const sx = tk.root.x;
    const sy = tk.root.y;
    const p = this.tokenTarget(tk.seat);
    const lift = Math.min(260, 60 + Math.abs(p.x - sx) * 0.3);
    let last = 0;
    await this.tw.to(
      ms,
      (k) => {
        tk.root.position.set(lerp(sx, p.x, k), lerp(sy, p.y, k) - Math.sin(k * Math.PI) * lift);
        tk.root.rotation = Math.sin(k * Math.PI) * 0.6;
        if (k - last > 0.05) {
          last = k;
          this.emit(tk.root.x, tk.root.y, tk.color, 2, 30, 0.5, 0.3);
        }
      },
      ease.inOutCubic,
    );
    tk.root.rotation = 0;
  }

  private shockwave(x: number, y: number, color: string | number, radius: number) {
    const g = new Graphics();
    g.circle(0, 0, 1).stroke({ width: 0.08, color });
    g.position.set(x, y);
    this.fx.addChild(g);
    void this.tw.to(520, (k) => {
      g.scale.set(lerp(TILE_R * 0.5, radius, k));
      g.alpha = 1 - k;
    }).then(() => g.destroy());
  }

  private floatText(text: string, x: number, y: number, color: string) {
    const t = new Text({
      text,
      style: {
        fontFamily: this.font, fontSize: 20, fontWeight: "700", fill: color, letterSpacing: 1,
        stroke: { color: "#0b0820", width: 5 },
      },
    });
    t.anchor.set(0.5);
    t.position.set(x, y);
    this.fx.addChild(t);
    void this.tw.to(1300, (k) => {
      t.y = y - k * 40;
      t.alpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    }).then(() => t.destroy());
  }

  setSpeed(s: number) {
    this.tw.speed = s;
  }

  /** Visible world range, for the minimap. */
  cameraView(): CameraView {
    const { width } = this.app.screen;
    const half = width / 2 / this.cam.zoom;
    return { x0: this.cam.x - half, x1: this.cam.x + half, worldWidth: this.extents.width };
  }

  /** Board image for the minimap: tile dots in world coordinates. */
  tilePositions() {
    return this.board.tiles.map((t) => ({ ...tilePos(t), special: t.type !== this.board.tiles[0].type && !t.start, finish: !!t.finish }));
  }
}
