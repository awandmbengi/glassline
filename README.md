# glassline

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/awandmbengi/glassline/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/awandmbengi/glassline/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

GLASSLINE is an open-world crime game set in Veyra, a rain-soaked inland city tiered around a giant dam. You are Nara Venn, a getaway courier and ex-network technician holding evidence that could bring down the energy conglomerate that runs the city. Steal cars, lose the police, run seven missions — from a van heist and a blackout relight to a flood-channel escape and a final choice: leak it, blackmail them, or burn it.

The game is static files under `game/`: a Three.js city with traffic, pedestrians, a wanted system with patrol cars and a police helicopter, a HUD with a live minimap, synthesized WebAudio sound effects and procedural radio stations, a start screen, localStorage saves, and deterministic screenshot scenes (`?shot=1..4`). No build step, no network requests at play time.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. WASD drives and walks, E enters and exits cars, Space is the handbrake, Q changes the radio station, M mutes, Esc pauses.

---

<sub>Entered on [make.fun](https://make.fun/?ref=dh5kzrzk&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
