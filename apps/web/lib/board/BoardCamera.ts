import type { Board } from "@ludo/engine";
import { type Application, type Container, Rectangle, type FederatedPointerEvent } from "pixi.js";
import { boardExtents, COL_W, tilePos } from "./layout";
import { clamp, lerp } from "./util";

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

interface CameraToken {
  root: Container;
  tile: number;
}

const TOKEN_R = 19;

/** Shared route projection, bounds, follow behavior and gestures for every game mode. */
export abstract class BoardCamera {
  abstract readonly app: Application;
  protected abstract world: Container;
  protected abstract board: Board;
  protected abstract extents: ReturnType<typeof boardExtents>;
  protected abstract tokens: CameraToken[];
  protected abstract activeSeat: number;
  protected portrait = false;
  protected cam = { x: 0, y: 0, zoom: 1 };
  protected target = { x: 0, y: 0, zoom: 1 };
  protected follow: CameraToken | null = null;
  protected userControlUntil = 0;
  protected insets: Insets = { left: 0, right: 0, top: 0, bottom: 0 };
  protected pointers = new Map<number, { x: number; y: number }>();
  protected dragStart: { x: number; y: number; camX: number; camY: number; dist?: number; zoom?: number } | null = null;
  protected moved = 0;

  onCamera?: (v: CameraView) => void;

  setPortrait(portrait: boolean) {
    if (this.portrait === portrait) return;
    this.portrait = portrait;
    this.world.rotation = portrait ? Math.PI / 2 : 0;
    this.pointers.clear();
    this.dragStart = null;
    this.resetCamera(this.tokens[this.activeSeat]?.tile ?? this.board.starts[0], true);
  }

  protected viewportSize() {
    const { width, height } = this.app.screen;
    const w = width - this.insets.left - this.insets.right;
    const h = height - this.insets.top - this.insets.bottom;
    return this.portrait ? { along: h, across: w } : { along: w, across: h };
  }

  setInsets(i: Insets) {
    this.insets = i;
    if (performance.now() > this.userControlUntil) {
      this.target.zoom = this.cam.zoom = this.defaultZoom();
      if (this.portrait) this.resetCamera(this.follow?.tile ?? this.tokens[this.activeSeat]?.tile ?? this.board.starts[0], true);
    }
  }

  private cameraLead(zoom: number) {
    const half = this.viewportSize().along / 2;
    // In portrait, anchor the token just below the header and show the route ahead.
    return this.portrait ? (half - TOKEN_R - 24) / zoom : Math.min(COL_W * 2.5, half * 0.45 / zoom);
  }

  protected defaultZoom() {
    const { along, across } = this.viewportSize();
    const span = this.extents.rawMaxY - this.extents.rawMinY + 420;
    return clamp(Math.min(across / span, along / ((this.portrait ? 7 : 11) * COL_W)), 0.38, 1.1);
  }

  private sceneCenter(x: number) {
    const points = this.board.tiles.filter((t) => Math.abs(tilePos(t).x - x) < 450).map(tilePos);
    if (!points.length) return tilePos(this.board.tiles[this.board.finish]).y;
    return (Math.min(...points.map((p) => p.y)) + Math.max(...points.map((p) => p.y))) / 2;
  }

  resetCamera(tile: number, instant = false) {
    const p = tilePos(this.board.tiles[tile]);
    const zoom = this.defaultZoom();
    const x = p.x + (this.portrait ? this.cameraLead(zoom) : COL_W * 2.5);
    this.target = { x, y: this.sceneCenter(x), zoom };
    this.userControlUntil = 0;
    if (instant) this.cam = { ...this.target };
  }

  overview() {
    const { along, across } = this.viewportSize();
    this.target = {
      x: this.extents.width / 2 - COL_W,
      y: (this.extents.rawMinY + this.extents.rawMaxY) / 2 - 60,
      zoom: clamp(Math.min(along / (this.extents.width + 300), across / (this.extents.rawMaxY - this.extents.rawMinY + 420)), 0.03, 1),
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
    // Enforce this on the actual camera too: following, zooming and dragging must
    // never pull the start row down and expose empty space above the board.
    if (this.portrait) this.cam.x = Math.max(this.cam.x, this.cameraLead(this.cam.zoom));
    const { width, height } = this.app.screen;
    const cx = this.insets.left + (width - this.insets.left - this.insets.right) / 2;
    const cy = this.insets.top + (height - this.insets.top - this.insets.bottom) / 2;
    this.world.scale.set(this.cam.zoom);
    const x = this.portrait ? -this.cam.y : this.cam.x;
    const y = this.portrait ? this.cam.x : this.cam.y;
    this.world.position.set(cx - x * this.cam.zoom, cy - y * this.cam.zoom);
  }

  protected bindInput() {
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
        const dx = (p.x - d.x) / this.cam.zoom;
        const dy = (p.y - d.y) / this.cam.zoom;
        this.target.x = d.camX - (this.portrait ? dy : dx);
        this.target.y = d.camY - (this.portrait ? -dx : dy);
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

  protected tickCamera(dt: number) {
    // Camera follows the active token unless the player is steering.
    if (this.follow && performance.now() > this.userControlUntil) {
      const r = this.follow.root;
      if (this.portrait) {
        // Keep still while the token can move comfortably inside the viewport.
        // Only pan when it leaves the band below the header and above the dock.
        const { along } = this.viewportSize();
        const top = TOKEN_R + 24;
        const bottom = Math.max(top, along * 0.6);
        this.target.x = clamp(this.target.x,
          r.x + (along / 2 - bottom) / this.cam.zoom,
          r.x + (along / 2 - top) / this.cam.zoom);
      } else this.target.x = r.x + this.cameraLead(this.cam.zoom);
      this.target.y = this.sceneCenter(this.target.x);
    }
    const minX = this.portrait ? this.cameraLead(this.target.zoom) : -COL_W;
    const maxX = Math.max(minX, this.extents.width);
    this.target.x = clamp(this.target.x, minX, maxX);
    this.target.y = clamp(this.target.y, this.extents.rawMinY - 400, this.extents.rawMaxY + 400);
    const k = 1 - Math.exp(-dt / 500);
    const maxPan = 140 * Math.min(dt, 50) / 1000 / this.cam.zoom;
    this.cam.x += clamp((this.target.x - this.cam.x) * k, -maxPan, maxPan);
    this.cam.y += clamp((this.target.y - this.cam.y) * k, -maxPan, maxPan);
    this.cam.zoom = lerp(this.cam.zoom, this.target.zoom, k);
    this.applyCamera();
  }

  /** Visible world range, for the minimap. */
  cameraView(): CameraView {
    const half = this.viewportSize().along / 2 / this.cam.zoom;
    return { x0: this.cam.x - half, x1: this.cam.x + half, worldWidth: this.extents.width };
  }
}
