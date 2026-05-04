# Gold Miner Dual PK

Gold Miner Dual PK is a fast-paced real-time multiplayer mining game where two players compete head-to-head to earn the highest score before time runs out.
You swing your hook, grab valuables underground, avoid bombs, and outplay your opponent in a live match powered by WebSocket synchronization.

## How to Play

- Sign in and enter the lobby.
- Click **Find Match** to join a real-time 1v1 game.
- Press `Space` to launch your hook and grab items.
- Press `C` to toggle Cheat Mode on/off.
- Score as many points as possible before the timer ends.
- At game over, check match stats and the global ranking table.

## Game Features

- Real-time multiplayer gameplay with live state updates.
- Server-authoritative game logic for fair collision and scoring.
- Competitive 1v1 matchmaking with online player lobby.
- Multiple item types: gold, diamonds, rocks, and bombs (with different values/weights).
- Dynamic hook mechanics: swing, extend, catch, retract.
- End-of-game results, detailed player stats, and leaderboard ranking.
- Built-in sound effects and background music for arcade-style feedback.
- Cheat Mode (toggleable): faster hook speed and boosted scoring effects.

## Run Locally

Make sure you have Node.js installed.

```bash
npm install
node game_server.js
```

Then open:

```bash
http://localhost:8000
```
