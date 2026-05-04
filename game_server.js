const express = require("express");
const argon2 = require("argon2");
const fs = require("fs");
const path = require("path");
const session = require("express-session");
const http = require("http");
const { WebSocketServer } = require("ws");

const app = express();
app.use(express.static("public"));
app.use(express.json());

const gameSession = session({
    secret: "gold-miner-dual-pk",
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { maxAge: 600000 }
});
app.use(gameSession);

function containWordCharsOnly(text) {
    return /^\w+$/.test(text);
}

// Initialize data files
if (!fs.existsSync("data")) fs.mkdirSync("data");
if (!fs.existsSync("data/users.json")) fs.writeFileSync("data/users.json", "{}");
if (!fs.existsSync("data/stats.json")) fs.writeFileSync("data/stats.json", "{}");

// ── Sound file generation ───────────────────────────────────────────────
function generateSounds() {
    const dir = path.join(__dirname, "public", "sounds");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    function writeWav(filepath, samples, sr) {
        const n = samples.length;
        const buf = Buffer.alloc(44 + n * 2);
        buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4);
        buf.write("WAVE", 8); buf.write("fmt ", 12);
        buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
        buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24);
        buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32);
        buf.writeUInt16LE(16, 34); buf.write("data", 36);
        buf.writeUInt32LE(n * 2, 40);
        for (let i = 0; i < n; i++)
            buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.floor(samples[i] * 32767))), 44 + i * 2);
        fs.writeFileSync(filepath, buf);
    }

    if (!fs.existsSync(path.join(dir, "catch.wav"))) {
        const sr = 22050, dur = 0.35, samples = new Array(Math.floor(sr * dur));
        for (let i = 0; i < samples.length; i++) {
            const t = i / sr;
            samples[i] = (Math.sin(2 * Math.PI * 880 * t) * 0.3
                         + Math.sin(2 * Math.PI * 1320 * t) * 0.2) * Math.exp(-t * 10);
        }
        writeWav(path.join(dir, "catch.wav"), samples, sr);
    }
    if (!fs.existsSync(path.join(dir, "bomb.wav"))) {
        const sr = 22050, dur = 0.5, samples = new Array(Math.floor(sr * dur));
        for (let i = 0; i < samples.length; i++) {
            const t = i / sr;
            samples[i] = (Math.sin(2 * Math.PI * (150 - t * 100) * t) * 0.5
                         + (Math.random() - 0.5) * 0.3) * Math.exp(-t * 5);
        }
        writeWav(path.join(dir, "bomb.wav"), samples, sr);
    }
    if (!fs.existsSync(path.join(dir, "bgm.wav"))) {
        const sr = 22050, dur = 16, samples = new Array(Math.floor(sr * dur));
        const melody = [262,294,330,349,392,440,494,523,494,440,392,349,330,294,262,262];
        const nl = sr;
        for (let i = 0; i < samples.length; i++) {
            const t = i / sr, ni = Math.floor(i / nl) % melody.length;
            const nt = (i % nl) / nl;
            const env = Math.min(1, nt * 20) * Math.max(0, 1 - nt * 1.2) * 0.15;
            samples[i] = Math.sin(2 * Math.PI * melody[ni] * t) * env
                        + Math.sin(4 * Math.PI * melody[ni] * t) * env * 0.3;
        }
        writeWav(path.join(dir, "bgm.wav"), samples, sr);
    }
}
generateSounds();

// ── Auth endpoints ──────────────────────────────────────────────────────
app.post("/register", async (req, res) => {
    const { username, avatar, name, password } = req.body;
    const users = JSON.parse(fs.readFileSync("data/users.json"));
    if (!username || !avatar || !name || !password)
        return res.json({ error: "All fields are required." });
    if (!containWordCharsOnly(username))
        return res.json({ error: "Username can only contain underscores, letters or numbers." });
    if (username in users)
        return res.json({ error: "Username already exists." });
    users[username] = { avatar, name, password: await argon2.hash(password) };
    fs.writeFileSync("data/users.json", JSON.stringify(users, null, "  "));
    res.json({ success: true });
});

app.post("/signin", async (req, res) => {
    const { username, password } = req.body;
    const users = JSON.parse(fs.readFileSync("data/users.json"));
    if (!(username in users))
        return res.json({ error: "Incorrect username/password." });
    if (!(await argon2.verify(users[username].password, password)))
        return res.json({ error: "Incorrect username/password." });
    req.session.user = { username, avatar: users[username].avatar, name: users[username].name };
    res.json({ user: req.session.user });
});

app.get("/validate", (req, res) => {
    if (!req.session.user) return res.json({ error: "User has not signed in." });
    res.json({ user: req.session.user });
});

app.get("/signout", (req, res) => {
    if (req.session.user) delete req.session.user;
    res.json({ success: true });
});

app.get("/stats", (req, res) => {
    res.json(JSON.parse(fs.readFileSync("data/stats.json")));
});

// ── HTTP + WebSocket server ─────────────────────────────────────────────
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
    const dummyRes = { getHeader(){}, setHeader(){}, writeHead(){}, end(){}, on(){} };
    gameSession(req, dummyRes, () => {
        if (!req.session || !req.session.user) {
            socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
            socket.destroy();
            return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
            ws.user = req.session.user;
            wss.emit("connection", ws, req);
        });
    });
});

// ── Game constants ──────────────────────────────────────────────────────
const DURATION = 180, TICK = 20, W = 800, H = 600;
const ORIGIN_Y = 80, SWING_SPD = 0.03, EXT_SPD = 5, RET_SPD = 3, MAX_LEN = 480;

const ITEM_DEFS = {
    smallGold: { value: 50,   weight: 1, radius: 15 },
    bigGold:   { value: 200,  weight: 3, radius: 25 },
    diamond:   { value: 500,  weight: 1, radius: 12 },
    rock:      { value: 10,   weight: 5, radius: 20 },
    bomb:      { value: -100, weight: 1, radius: 14 }
};

function createItems(startId) {
    const items = []; let id = startId || 0;
    const cfg = [
        ["smallGold",6],["bigGold",3],["diamond",2],["rock",4],["bomb",3]
    ];
    for (const [type, count] of cfg) {
        const d = ITEM_DEFS[type];
        for (let i = 0; i < count; i++) {
            let x, y, ok, tries = 0;
            do {
                x = 50 + Math.random() * (W - 100);
                y = 160 + Math.random() * (H - 220);
                ok = items.every(it => Math.hypot(x - it.x, y - it.y) > 45);
            } while (!ok && ++tries < 30);
            items.push({ id: id++, type, x, y, ...d, caught: false, caughtBy: -1, scored: false });
        }
    }
    return { items, nextId: id };
}

// ── Room management ─────────────────────────────────────────────────────
const rooms = new Map();
let waitingPlayer = null;
const conns = new Map();

function send(ws, d) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(d)); }

function broadcastPlayers() {
    const list = [];
    for (const [u, ws] of conns)
        if (ws.readyState === 1) list.push({ username: u, name: ws.user.name, avatar: ws.user.avatar });
    const wp = waitingPlayer?.user?.username || null;
    for (const [, ws] of conns) send(ws, { type: "online-players", players: list, waitingPlayer: wp });
}

function hookTip(p) {
    return { x: p.hookOriginX + Math.sin(p.hookAngle) * p.hookLength,
             y: p.hookOriginY + Math.cos(p.hookAngle) * p.hookLength };
}

function makeRoom(ws1, ws2) {
    const id = "r" + Date.now();
    const { items, nextId } = createItems(0);
    return {
        id, items, nextItemId: nextId,
        players: [ws1, ws2].map((ws, i) => ({
            ws, username: ws.user.username, name: ws.user.name, avatar: ws.user.avatar,
            score: 0, goldCount: 0, diamondCount: 0, rockCount: 0, bombCount: 0,
            hookOriginX: i === 0 ? 200 : 600, hookOriginY: ORIGIN_Y,
            hookAngle: 0, hookLength: 30, hookState: "swinging", hookDir: i === 0 ? 1 : -1,
            caughtItem: null, cheatMode: false
        })),
        timeLeft: DURATION, startTime: Date.now(), status: "playing", interval: null
    };
}

function cState(room) {
    return {
        players: room.players.map(p => ({
            username: p.username, name: p.name, avatar: p.avatar, score: p.score,
            goldCount: p.goldCount, diamondCount: p.diamondCount,
            rockCount: p.rockCount, bombCount: p.bombCount,
            hookOriginX: p.hookOriginX, hookOriginY: p.hookOriginY,
            hookAngle: p.hookAngle, hookLength: p.hookLength,
            hookState: p.hookState, caughtItem: p.caughtItem, cheatMode: p.cheatMode
        })),
        items: room.items.map(it => ({
            id: it.id, type: it.type, x: it.x, y: it.y,
            radius: it.radius, value: it.value,
            caught: it.caught, caughtBy: it.caughtBy, scored: it.scored
        })),
        timeLeft: room.timeLeft, status: room.status
    };
}

function tick(room) {
    if (room.status !== "playing") return;
    room.timeLeft = Math.max(0, DURATION - (Date.now() - room.startTime) / 1000);
    if (room.timeLeft <= 0) { endGame(room); return; }

    for (let i = 0; i < 2; i++) {
        const p = room.players[i], spd = p.cheatMode ? 3 : 1;

        if (p.hookState === "swinging") {
            p.hookAngle += p.hookDir * SWING_SPD;
            if (p.hookAngle > 1.3) { p.hookAngle = 1.3; p.hookDir = -1; }
            else if (p.hookAngle < -1.3) { p.hookAngle = -1.3; p.hookDir = 1; }
            p.hookLength = 30;

        } else if (p.hookState === "extending") {
            p.hookLength += EXT_SPD * spd;
            if (p.hookLength >= MAX_LEN) { p.hookState = "retracting"; }
            else {
                const tip = hookTip(p);
                if (tip.x < 0 || tip.x > W || tip.y > H) { p.hookState = "retracting"; }
                else {
                    for (const it of room.items) {
                        if (it.scored || it.caughtBy === i) continue;
                        let ix, iy;
                        if (it.caught && it.caughtBy >= 0) {
                            const ct = hookTip(room.players[it.caughtBy]);
                            ix = ct.x; iy = ct.y;
                        } else if (!it.caught) { ix = it.x; iy = it.y; }
                        else continue;
                        if (Math.hypot(tip.x - ix, tip.y - iy) < it.radius + 10) {
                            if (it.caught && it.caughtBy >= 0 && it.caughtBy !== i)
                                room.players[it.caughtBy].caughtItem = null;
                            it.caught = true; it.caughtBy = i;
                            p.caughtItem = it.id; p.hookState = "retracting";
                            break;
                        }
                    }
                }
            }

        } else if (p.hookState === "retracting") {
            let rs = RET_SPD * spd;
            if (p.caughtItem !== null) {
                const ci = room.items.find(it => it.id === p.caughtItem);
                if (ci) rs /= ci.weight;
            }
            p.hookLength -= rs;
            if (p.hookLength <= 30) {
                p.hookLength = 30; p.hookState = "swinging";
                if (p.caughtItem !== null) {
                    const ci = room.items.find(it => it.id === p.caughtItem);
                    if (ci) {
                        ci.scored = true;
                        let val = ci.value;
                        if (p.cheatMode && val < 0) val = 0;
                        else if (p.cheatMode) val *= 5;
                        p.score += val;
                        if (ci.type === "smallGold" || ci.type === "bigGold") p.goldCount++;
                        else if (ci.type === "diamond") p.diamondCount++;
                        else if (ci.type === "rock") p.rockCount++;
                        else if (ci.type === "bomb") p.bombCount++;
                        send(p.ws, { type: "play-sound", sound: ci.type === "bomb" ? "bomb" : "catch" });
                    }
                    p.caughtItem = null;
                }
            }
        }

        if (p.cheatMode) p.score += 2;
    }

    // Respawn items when running low
    if (room.items.filter(it => !it.scored).length < 5) {
        const { items: ni, nextId } = createItems(room.nextItemId);
        room.nextItemId = nextId; room.items.push(...ni);
    }

    const st = cState(room);
    for (let i = 0; i < 2; i++) send(room.players[i].ws, { type: "game-state", state: st, playerIndex: i });
}

function endGame(room) {
    room.status = "over";
    if (room.interval) { clearInterval(room.interval); room.interval = null; }
    const s0 = room.players[0].score, s1 = room.players[1].score;
    const result = s0 > s1 ? { winner: 0 } : s1 > s0 ? { winner: 1 } : { winner: -1 };

    const stats = JSON.parse(fs.readFileSync("data/stats.json"));
    for (let i = 0; i < 2; i++) {
        const p = room.players[i];
        if (!stats[p.username]) stats[p.username] = {
            name: p.name, avatar: p.avatar,
            gamesPlayed: 0, wins: 0, losses: 0, draws: 0,
            totalScore: 0, totalGold: 0, totalDiamonds: 0
        };
        const s = stats[p.username];
        s.name = p.name; s.avatar = p.avatar; s.gamesPlayed++;
        s.totalScore += Math.max(0, p.score);
        s.totalGold += p.goldCount; s.totalDiamonds += p.diamondCount;
        if (result.winner === -1) s.draws++;
        else if (result.winner === i) s.wins++;
        else s.losses++;
    }
    fs.writeFileSync("data/stats.json", JSON.stringify(stats, null, "  "));

    const data = { type: "game-over", result, state: cState(room), stats };
    send(room.players[0].ws, data); send(room.players[1].ws, data);
    rooms.delete(room.id);
}

function handleDisconnect(ws) {
    if (waitingPlayer === ws) waitingPlayer = null;
    conns.delete(ws.user?.username);
    for (const [rid, room] of rooms) {
        const idx = room.players.findIndex(p => p.ws === ws);
        if (idx >= 0) {
            room.status = "over";
            if (room.interval) clearInterval(room.interval);
            send(room.players[1 - idx].ws, { type: "opponent-disconnected" });
            rooms.delete(rid);
            return;
        }
    }
}

// ── WebSocket handler ───────────────────────────────────────────────────
wss.on("connection", (ws) => {
    conns.set(ws.user.username, ws);
    broadcastPlayers();

    ws.on("message", (raw) => {
        try {
            const msg = JSON.parse(raw.toString());
            if (msg.type === "join-room") {
                if (waitingPlayer && waitingPlayer !== ws && waitingPlayer.readyState === 1) {
                    const room = makeRoom(waitingPlayer, ws);
                    rooms.set(room.id, room);
                    const ws1 = waitingPlayer; waitingPlayer = null;
                    send(ws1, { type: "game-start", roomId: room.id, playerIndex: 0,
                        opponent: { name: ws.user.name, avatar: ws.user.avatar } });
                    send(ws, { type: "game-start", roomId: room.id, playerIndex: 1,
                        opponent: { name: ws1.user.name, avatar: ws1.user.avatar } });
                    room.interval = setInterval(() => tick(room), 1000 / TICK);
                    broadcastPlayers();
                } else {
                    waitingPlayer = ws;
                    send(ws, { type: "waiting" });
                    broadcastPlayers();
                }
            } else if (msg.type === "leave-room") {
                if (waitingPlayer === ws) {
                    waitingPlayer = null;
                    send(ws, { type: "left-room" });
                    broadcastPlayers();
                }
            } else if (msg.type === "hook-launch") {
                for (const [, room] of rooms) {
                    const p = room.players.find(p => p.ws === ws);
                    if (p && room.status === "playing" && p.hookState === "swinging")
                        p.hookState = "extending";
                }
            } else if (msg.type === "cheat-toggle") {
                for (const [, room] of rooms) {
                    const p = room.players.find(p => p.ws === ws);
                    if (p && room.status === "playing") p.cheatMode = !p.cheatMode;
                }
            }
        } catch (e) { console.error("WS error:", e); }
    });

    ws.on("close", () => { handleDisconnect(ws); broadcastPlayers(); });
});

server.listen(8000, () => console.log("Gold Miner Dual PK server running at http://localhost:8000"));
