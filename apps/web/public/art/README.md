# Enchanted scenery atlas

Archived artwork: the game no longer loads these illustrations.

[enchanted-props-v1.png](enchanted-props-v1.png) was generated with the built-in imagegen tool for this project.
The PNG preserves transparent alpha. Six 512 × 512 cells form a 3-column, 2-row atlas:
teal tree, coral mushrooms, mossy rocks, crystal cluster, ruined arch, moonlit tree.

[crystal-sanctuary-v1.png](crystal-sanctuary-v1.png) is the matching transparent finish landmark, also generated
with the built-in imagegen tool. The game uses the native castle instead.

Final generation prompt:

```text
Use case: stylized-concept.
Asset type: a single production game sprite atlas for an enchanted forest board game.
Create ONE transparent PNG sprite sheet in an exact 3-column by 2-row regular grid, six equally sized rectangular cells. Landscape canvas, aspect ratio 3:2. Each cell contains one complete isolated prop, centered horizontally, bottom of the prop at 88% of its cell height, with at least 10% transparent padding on every side. NO grid lines, NO text, NO labels, NO background or ground tile. Nothing crosses a cell boundary.
Art direction: richly painted 2D fantasy adventure environment art, three-quarter overhead view, organic rounded silhouettes, broad confident brush shapes, dark blue outlines and teal ambient shadows, soft luminous highlights. Inspired by lush hand-painted game forests and mossy crystalline caverns. Readable at small game sizes; avoid spindly geometry, triangle trees, neon wireframes, photorealism, hard vector look. Subtle grounded contact shadow only.
Top row left: a single squat ancient teal woodland tree with a gracefully twisting dark trunk, several broad rounded turquoise/emerald foliage masses, hanging tiny cyan seed lights and a few ferns around its exposed roots.
Top row middle: a compact cluster of charming coral and peach shelf mushrooms on a small dark mossy stump, oversized softly curved caps with pale golden edges, a few luminous seed pods.
Top row right: a low cluster of chunky rounded blue slate boulders, moss-covered top planes, leafy mint ferns and three tiny ivory mushrooms growing in the crevices.
Bottom row left: a compact cluster of faceted aqua and lavender crystals growing from rounded blue-grey rock, subtle light glowing inside the crystals, tiny moss tufts.
Bottom row middle: a low ancient broken stone arch/ruin made of rounded slate blocks, weathered carvings, leafy vines and a very small warm amber lantern.
Bottom row right: one small magical moonlit tree with a curved dark indigo trunk and broad soft pink-violet mushroom-like foliage, tiny hanging pale gold lights.
All six props should have consistent painterly rendering, world scale and soft directional lighting, their full silhouettes isolated on genuinely transparent alpha. This atlas will be sliced by the exact six equal grid cells.
```

Final sanctuary prompt:

```text
Use case: stylized-concept.
Asset type: one isolated transparent game environment sprite, a finish landmark for a fantasy board game.
Subject: a small ancient crystal castle sanctuary, a balanced centered silhouette with a graceful central stone arch and five uneven slender crystal spires rising behind it, rounded weathered blue-slate foundations, moss and a few tiny ferns around the base. The open doorway emits a restrained warm amber light. The spires are translucent aqua, pale lavender and moonstone, softly luminous at their tips. One modest gold crown motif carved over the doorway; no floating icon.
Style: richly hand-painted 2D fantasy adventure environment art, three-quarter overhead view, broad confident painterly shapes, organic rounded rock silhouettes, dark navy outlines, teal ambient shadows and soft moonlit highlights. Match enchanted hand-painted forests and turquoise crystalline caverns. Not photorealistic, not neon vector, not a flat pink princess castle. Readable at small sprite sizes.
Composition: single whole castle, near-square canvas with the entire building centered, full silhouette and roots visible, at least 12 percent transparent padding all around; all building elements sit on the same continuous low stone base, no surrounding landscape. The art fills about 75 percent of the canvas. Genuinely transparent alpha background. No text, no labels, no border, no decorative frame, no large glow cloud.
```
