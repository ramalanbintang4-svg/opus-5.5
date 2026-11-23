# BlockCraft (opus-5.5)

A Minecraft-style voxel sandbox for the browser, written from scratch with three.js. Every texture is drawn in code at 16×16 px. The repo contains no Mojang assets.

## Start

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173), click **Singleplayer** and then click the game to capture the mouse.

Other scripts: `npm test` runs the engine unit tests, `npm run build` makes a static build in `dist/`, and `npm run check` runs the tests and then the build.

## Features

- Endless terrain generated from a seed, in 16×16×96 chunks. It has grass hills, stone mountains with ores, sand beaches, water lakes, oak trees, tall grass and flowers, and bedrock at the bottom.
- A plank village house with a door and glass windows near spawn.
- First-person movement with gravity, jumping, sprinting, sneaking and swimming. Collisions are checked against an AABB.
- Break blocks by holding left click (with crack stages and particles). Place blocks with right click. Middle click picks the block you are looking at.
- A survival HUD with hearts, hunger and an XP bar, plus a 9-slot hotbar with stack counts and a held block or hand that bobs as you walk.
- Fall damage, death and respawn.
- Iron sword, pickaxe, shovel and axe in the hotbar. The right tool mines its blocks about 4× faster, stone is slow without a pickaxe, and the sword hits hardest. Bread restores hunger (right click).
- An armor bar above the hearts. Armor blocks part of all damage.
- Creative mode (press `G`) with flying (double-tap Space or `F`) and a block and tool inventory (`E`).
- Creepers that chase you and explode, and passive pigs. TNT that you light with a click and that blows a crater.
- Ambient-occlusion lighting with sky light, fog, drifting blocky clouds and a day/night cycle.
- The world is saved to localStorage, with an in-memory fallback when storage is blocked.
- Touch controls on phones and tablets.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look |
| Space | Jump (double-tap to fly in creative) |
| Shift / Ctrl | Sneak (descend when flying) / sprint |
| Left click (hold) | Break block |
| Right click | Place block / eat bread |
| Middle click | Pick block |
| 1–9 / wheel | Select hotbar slot |
| E | Inventory |
| G | Toggle survival / creative |
| F | Toggle flying (creative) |
| F3 | Debug info |
| Esc | Pause menu |

## URL options

`?seed=1234` starts a fresh world from that seed. `?play` skips the title screen. `?creative` starts in creative mode. `?rd=4` sets the render distance in chunks. `?selftest` runs an in-browser break/place smoke test.
