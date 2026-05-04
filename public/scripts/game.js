const Game = (function() {
    let canvas, ctx;
    let gameState = null;
    let myIndex = -1;
    let animId = null;
    let particleList = [];

    function init(canvasEl) {
        canvas = canvasEl;
        ctx = canvas.getContext("2d");
    }

    function updateState(state, playerIndex) {
        gameState = state;
        myIndex = playerIndex;
    }

    function start() {
        if (!animId) renderLoop();
    }

    function stop() {
        if (animId) { cancelAnimationFrame(animId); animId = null; }
        gameState = null;
    }

    function renderLoop() {
        render();
        animId = requestAnimationFrame(renderLoop);
    }

    function tip(p) {
        return {
            x: p.hookOriginX + Math.sin(p.hookAngle) * p.hookLength,
            y: p.hookOriginY + Math.cos(p.hookAngle) * p.hookLength
        };
    }

    // ── Particles ──────────────────────────────────────────
    function spawnParticles(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            particleList.push({
                x, y,
                vx: (Math.random() - 0.5) * 4,
                vy: (Math.random() - 0.5) * 4,
                life: 30 + Math.random() * 20,
                color
            });
        }
    }

    function updateParticles() {
        for (let i = particleList.length - 1; i >= 0; i--) {
            const p = particleList[i];
            p.x += p.vx; p.y += p.vy; p.life--;
            if (p.life <= 0) particleList.splice(i, 1);
        }
    }

    function drawParticles() {
        for (const p of particleList) {
            const a = p.life / 50;
            ctx.globalAlpha = Math.min(1, a);
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // ── Main render ────────────────────────────────────────
    function render() {
        if (!gameState) return;
        ctx.clearRect(0, 0, 800, 600);
        drawBackground();
        drawItems();
        drawHooks();
        updateParticles();
        drawParticles();
        drawUI();
    }

    function drawBackground() {
        // Sky
        const sg = ctx.createLinearGradient(0, 0, 0, 95);
        sg.addColorStop(0, "#5B9BD5"); sg.addColorStop(1, "#87CEEB");
        ctx.fillStyle = sg;
        ctx.fillRect(0, 0, 800, 95);

        // Clouds
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        drawCloud(80, 30); drawCloud(350, 18); drawCloud(620, 40);

        // Grass
        ctx.fillStyle = "#2D8B2D";
        ctx.fillRect(0, 88, 800, 14);

        // Underground
        const eg = ctx.createLinearGradient(0, 102, 0, 600);
        eg.addColorStop(0, "#A0522D"); eg.addColorStop(0.4, "#8B4513");
        eg.addColorStop(0.8, "#6B3410"); eg.addColorStop(1, "#3E1F05");
        ctx.fillStyle = eg;
        ctx.fillRect(0, 102, 800, 498);

        // Earth texture
        ctx.fillStyle = "rgba(0,0,0,0.07)";
        for (let i = 0; i < 60; i++) {
            const x = (i * 137 + 23) % 800, y = 115 + (i * 89 + 47) % 460;
            ctx.beginPath(); ctx.arc(x, y, 2 + (i % 3), 0, Math.PI * 2); ctx.fill();
        }

        // Depth lines
        ctx.strokeStyle = "rgba(0,0,0,0.06)";
        ctx.lineWidth = 1;
        for (let y = 200; y < 600; y += 80) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(800, y); ctx.stroke();
        }
    }

    function drawCloud(x, y) {
        ctx.beginPath();
        ctx.arc(x, y, 18, 0, Math.PI * 2);
        ctx.arc(x + 20, y - 6, 14, 0, Math.PI * 2);
        ctx.arc(x + 35, y, 18, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawItems() {
        for (const it of gameState.items) {
            if (it.scored) continue;
            let x, y;
            if (it.caught && it.caughtBy >= 0) {
                const t = tip(gameState.players[it.caughtBy]);
                x = t.x; y = t.y;
            } else if (!it.caught) {
                x = it.x; y = it.y;
            } else continue;
            drawItem(x, y, it);
        }
    }

    function drawItem(x, y, item) {
        ctx.save();
        switch (item.type) {
            case "smallGold":
                ctx.fillStyle = "#FFD700"; ctx.strokeStyle = "#B8860B"; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(x, y, item.radius, 0, Math.PI * 2);
                ctx.fill(); ctx.stroke();
                ctx.fillStyle = "rgba(255,255,255,0.5)";
                ctx.beginPath(); ctx.arc(x - 4, y - 4, 4, 0, Math.PI * 2); ctx.fill();
                break;
            case "bigGold":
                ctx.fillStyle = "#DAA520"; ctx.strokeStyle = "#8B6914"; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.arc(x, y, item.radius, 0, Math.PI * 2);
                ctx.fill(); ctx.stroke();
                ctx.fillStyle = "rgba(255,255,255,0.35)";
                ctx.beginPath(); ctx.arc(x - 7, y - 7, 7, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = "#6B4C0A"; ctx.font = "bold 18px Arial";
                ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.fillText("$", x, y + 1);
                break;
            case "diamond":
                ctx.fillStyle = "#00E5FF"; ctx.strokeStyle = "#008BA0"; ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x, y - item.radius);
                ctx.lineTo(x + item.radius, y);
                ctx.lineTo(x, y + item.radius);
                ctx.lineTo(x - item.radius, y);
                ctx.closePath(); ctx.fill(); ctx.stroke();
                ctx.fillStyle = "rgba(255,255,255,0.6)";
                ctx.beginPath(); ctx.arc(x - 2, y - 3, 3, 0, Math.PI * 2); ctx.fill();
                break;
            case "rock":
                ctx.fillStyle = "#787878"; ctx.strokeStyle = "#555"; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(x, y, item.radius, 0, Math.PI * 2);
                ctx.fill(); ctx.stroke();
                ctx.strokeStyle = "#505050"; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(x - 6, y - 3); ctx.lineTo(x + 4, y + 6); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(x + 3, y - 5); ctx.lineTo(x - 2, y + 3); ctx.stroke();
                break;
            case "bomb":
                ctx.fillStyle = "#222"; ctx.strokeStyle = "#000"; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(x, y, item.radius, 0, Math.PI * 2);
                ctx.fill(); ctx.stroke();
                // Fuse
                ctx.strokeStyle = "#8B4513"; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(x, y - item.radius);
                ctx.quadraticCurveTo(x + 6, y - item.radius - 10, x + 4, y - item.radius - 14);
                ctx.stroke();
                // Spark
                const sparkR = 2 + Math.random() * 2;
                ctx.fillStyle = "#FF6600";
                ctx.beginPath(); ctx.arc(x + 4, y - item.radius - 14, sparkR, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = "#FFCC00";
                ctx.beginPath(); ctx.arc(x + 4, y - item.radius - 14, sparkR * 0.5, 0, Math.PI * 2); ctx.fill();
                // Skull
                ctx.fillStyle = "#CCC"; ctx.font = "bold 11px Arial";
                ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.fillText("☠", x, y + 1);
                break;
        }
        ctx.restore();
    }

    function drawHooks() {
        for (let i = 0; i < 2; i++) {
            const p = gameState.players[i];
            const t = tip(p);

            // Rope
            ctx.strokeStyle = p.cheatMode ? "#FF3333" : "#A08060";
            ctx.lineWidth = p.cheatMode ? 3 : 2;
            ctx.setLineDash(p.cheatMode ? [6, 3] : []);
            ctx.beginPath(); ctx.moveTo(p.hookOriginX, p.hookOriginY); ctx.lineTo(t.x, t.y);
            ctx.stroke(); ctx.setLineDash([]);

            // Claw
            ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(p.hookAngle);
            ctx.fillStyle = "#C0C0C0"; ctx.strokeStyle = "#808080"; ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-9, 0); ctx.lineTo(-6, 10); ctx.lineTo(0, 4);
            ctx.lineTo(6, 10); ctx.lineTo(9, 0);
            ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.restore();

            // Player base (mining cart icon)
            const isMe = (i === myIndex);
            ctx.fillStyle = isMe ? "#FFD700" : "#AAA";
            ctx.strokeStyle = "#333"; ctx.lineWidth = 2;
            // Cart body
            ctx.beginPath();
            ctx.moveTo(p.hookOriginX - 18, p.hookOriginY - 6);
            ctx.lineTo(p.hookOriginX + 18, p.hookOriginY - 6);
            ctx.lineTo(p.hookOriginX + 14, p.hookOriginY + 6);
            ctx.lineTo(p.hookOriginX - 14, p.hookOriginY + 6);
            ctx.closePath(); ctx.fill(); ctx.stroke();
            // Wheels
            ctx.fillStyle = "#555";
            ctx.beginPath(); ctx.arc(p.hookOriginX - 10, p.hookOriginY + 10, 4, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(p.hookOriginX + 10, p.hookOriginY + 10, 4, 0, Math.PI * 2); ctx.fill();

            // Player name
            ctx.fillStyle = isMe ? "#FFD700" : "#DDD";
            ctx.font = "bold 13px Arial"; ctx.textAlign = "center";
            ctx.fillText(isMe ? "⛏ You" : "⛏ " + p.name, p.hookOriginX, p.hookOriginY - 16);

            // Cheat indicator
            if (p.cheatMode) {
                ctx.fillStyle = "#FF3333"; ctx.font = "bold 11px Arial";
                ctx.fillText("[CHEAT]", p.hookOriginX, p.hookOriginY - 28);
            }
        }
    }

    function drawUI() {
        const p0 = gameState.players[0], p1 = gameState.players[1];

        // Top bar
        ctx.fillStyle = "rgba(0,0,0,0.75)";
        ctx.fillRect(0, 0, 800, 48);

        // Divider
        ctx.strokeStyle = "#d4a534"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(400, 4); ctx.lineTo(400, 44); ctx.stroke();

        // P1 (left)
        ctx.textAlign = "left";
        ctx.fillStyle = myIndex === 0 ? "#FFD700" : "#FFF";
        ctx.font = "bold 14px Arial";
        ctx.fillText(p0.name, 12, 18);
        ctx.fillStyle = "#FFD700"; ctx.font = "bold 22px Arial";
        ctx.fillText("$" + p0.score, 12, 42);
        // P1 mini stats
        ctx.fillStyle = "#CCC"; ctx.font = "11px Arial";
        ctx.fillText("🥇" + p0.goldCount + " 💎" + p0.diamondCount, 150, 18);

        // P2 (right)
        ctx.textAlign = "right";
        ctx.fillStyle = myIndex === 1 ? "#FFD700" : "#FFF";
        ctx.font = "bold 14px Arial";
        ctx.fillText(p1.name, 788, 18);
        ctx.fillStyle = "#FFD700"; ctx.font = "bold 22px Arial";
        ctx.fillText("$" + p1.score, 788, 42);
        ctx.fillStyle = "#CCC"; ctx.font = "11px Arial";
        ctx.fillText("🥇" + p1.goldCount + " 💎" + p1.diamondCount, 650, 18);

        // Timer (center)
        const m = Math.floor(gameState.timeLeft / 60);
        const s = Math.floor(gameState.timeLeft % 60);
        const ts = m + ":" + (s < 10 ? "0" : "") + s;
        ctx.textAlign = "center";
        ctx.fillStyle = gameState.timeLeft < 30 ? "#FF4444" : "#FFF";
        ctx.font = "bold 26px Arial";
        ctx.fillText(ts, 400, 36);

        // Timer label
        ctx.fillStyle = "#999"; ctx.font = "10px Arial";
        ctx.fillText("TIME", 400, 14);
    }

    return { init, updateState, start, stop, spawnParticles };
})();
