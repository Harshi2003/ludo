import { describe, expect, it } from "vitest";
import { createGame, type Board } from "@ludo/engine";
import { magicPack } from "@ludo/themepack";
import { Container, EventBoundary, FederatedPointerEvent, type Application } from "pixi.js";
import { BoardCamera } from "./BoardCamera";
import { boardExtents, tilePos } from "./layout";
import { createPartyBoard } from "../party-ludo/board";
import { DEFAULT_PARTY_CONFIG } from "../party-ludo/config";

class CameraHarness extends BoardCamera {
  readonly app = {
    screen: { width: 390, height: 844 },
    stage: new Container(),
    canvas: { addEventListener() {} },
  } as unknown as Application;
  protected world = new Container();
  protected extents;
  protected tokens;
  protected activeSeat = 0;

  constructor(protected board: Board) {
    super();
    this.extents = boardExtents(board);
    this.tokens = board.starts.map(tile => {
      const root = new Container();
      const p = tilePos(board.tiles[tile]);
      root.position.set(p.x, p.y);
      return { root, tile };
    });
    this.bindInput();
    this.resetCamera(board.starts[0], true);
  }

  frame(dt = 16) { this.tickCamera(dt); }
  resize(w: number, h: number) { this.app.screen.width = w; this.app.screen.height = h; }
  project(x: number, y: number) { return this.world.toGlobal({ x, y }); }
  snapshot() { return { ...this.cam }; }
  moveToken(x: number) { this.tokens[0].root.x = x; }
  pointer(type: "pointerdown" | "globalpointermove", x: number, y: number) {
    const event = new FederatedPointerEvent(new EventBoundary(this.app.stage));
    event.pointerId = 1;
    event.global.set(x, y);
    this.app.stage.emit(type, event);
  }
}

const boards: [string, Board][] = [
  ["Magic", createGame(magicPack, { seed: 42, players: magicPack.characters.map(c => ({ character: c.id, bot: false })) }).board],
  ["Party", createPartyBoard(4, 42, DEFAULT_PARTY_CONFIG)],
];

describe.each(boards)("%s shared camera", (_mode, board) => {
  it("projects the route downward in portrait and rightward after rotating back", () => {
    const camera = new CameraHarness(board);
    camera.setPortrait(true);
    camera.setInsets({ left: 12, right: 12, top: 150, bottom: 170 });
    camera.frame();
    const origin = camera.project(0, 0), ahead = camera.project(100, 0);
    const start = tilePos(board.tiles[board.starts[0]]);
    expect(camera.project(start.x, start.y).y).toBeCloseTo(193);
    expect(ahead.y).toBeGreaterThan(origin.y);
    expect(ahead.x).toBeCloseTo(origin.x);
    camera.resize(1280, 800);
    camera.setPortrait(false);
    camera.frame();
    const landscape = camera.project(100, 0), landscapeStart = camera.project(0, 0);
    expect(landscape.x).toBeGreaterThan(landscapeStart.x);
    expect(landscape.y).toBeCloseTo(landscapeStart.y);
  });

  it("keeps the start row at or above its portrait anchor while panning", () => {
    const camera = new CameraHarness(board);
    camera.setPortrait(true);
    camera.setInsets({ left: 12, right: 12, top: 150, bottom: 170 });
    camera.panTo(-10000);
    for (let i = 0; i < 200; i++) {
      camera.frame();
      expect(camera.project(0, 0).y).toBeLessThanOrEqual(193.01);
    }
  });

  it("limits follow speed and keeps still while a token remains in the visible band", () => {
    const camera = new CameraHarness(board);
    camera.setPortrait(true);
    camera.setInsets({ left: 12, right: 12, top: 150, bottom: 170 });
    camera.focusSeat(0);
    camera.frame();
    camera.moveToken(10000);
    for (let i = 0; i < 100; i++) {
      const before = camera.snapshot();
      camera.frame();
      expect(Math.abs(camera.snapshot().x - before.x) * before.zoom).toBeLessThanOrEqual(140 * 0.016 + 0.001);
    }
    camera.moveToken(0);
    camera.focusSeat(0);
    camera.setInsets({ left: 12, right: 12, top: 150, bottom: 170 });
    const before = camera.snapshot();
    camera.moveToken(50);
    camera.frame();
    expect(camera.snapshot().x).toBeCloseTo(before.x);
  });

  it("uses vertical drag distance along a portrait route and clears gestures on rotation", () => {
    const camera = new CameraHarness(board);
    camera.setPortrait(true);
    camera.setInsets({ left: 12, right: 12, top: 150, bottom: 170 });
    camera.frame();
    const before = camera.snapshot();
    camera.pointer("pointerdown", 100, 400);
    camera.pointer("globalpointermove", 100, 300);
    expect(camera.snapshot().x).toBeCloseTo(before.x + 100 / before.zoom);
    expect(camera.snapshot().y).toBeCloseTo(before.y);
    camera.setPortrait(false);
    const rotated = camera.snapshot();
    camera.pointer("globalpointermove", 200, 300);
    expect(camera.snapshot()).toEqual(rotated);
  });

  it("reports the visible range along the vertical viewport for the minimap", () => {
    const camera = new CameraHarness(board);
    camera.setPortrait(true);
    camera.setInsets({ left: 12, right: 12, top: 150, bottom: 170 });
    const view = camera.cameraView();
    expect(view.x1 - view.x0).toBeCloseTo((844 - 150 - 170) / camera.snapshot().zoom);
    expect(view.worldWidth).toBe(boardExtents(board).width);
  });
});
