const GameRoom = (function() {
    let user = null;
    let ws = null;
    let myIndex = -1;
    let lastGameOverData = null;

    // ── Helpers ─────────────────────────────────────────────
    function showOnly(id) {
        $("#home-page, #game-page, #gameover-page").hide();
        $("#start-section, #register-section, #signin-section, #lobby-section").hide();
        $(id).show();
        // Show parent page container
        if (["#start-section","#register-section","#signin-section","#lobby-section"].includes(id))
            $("#home-page").show();
    }

    function playSound(name) {
        const el = document.getElementById(name === "catch" ? "catch-sound" : "bomb-sound");
        if (el) { el.currentTime = 0; el.volume = 0.5; el.play().catch(() => {}); }
    }

    // ── WebSocket ───────────────────────────────────────────
    function connectWS() {
        if (ws && ws.readyState <= 1) return;
        const proto = location.protocol === "https:" ? "wss:" : "ws:";
        ws = new WebSocket(proto + "//" + location.host);

        ws.onopen = () => console.log("WebSocket connected");

        ws.onmessage = (ev) => {
            const msg = JSON.parse(ev.data);
            switch (msg.type) {
                case "online-players":
                    renderPlayerList(msg.players, msg.waitingPlayer);
                    break;
                case "waiting":
                    $("#find-match-button").hide();
                    $("#cancel-match-button").show();
                    $("#match-status").text("⏳ Waiting for another player...");
                    break;
                case "left-room":
                    $("#find-match-button").show();
                    $("#cancel-match-button").hide();
                    $("#match-status").text("");
                    break;
                case "game-start":
                    myIndex = msg.playerIndex;
                    startGame();
                    break;
                case "game-state":
                    Game.updateState(msg.state, msg.playerIndex);
                    break;
                case "play-sound":
                    playSound(msg.sound);
                    break;
                case "game-over":
                    lastGameOverData = msg;
                    endGame(msg);
                    break;
                case "opponent-disconnected":
                    Game.stop();
                    stopBgm();
                    alert("Opponent disconnected!");
                    showOnly("#lobby-section");
                    $("#find-match-button").show();
                    $("#cancel-match-button").hide();
                    $("#match-status").text("");
                    break;
            }
        };

        ws.onclose = () => {
            console.log("WebSocket closed");
            setTimeout(() => { if (user) connectWS(); }, 3000);
        };
    }

    function wsSend(obj) {
        if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
    }

    function renderPlayerList(players, waitingUsername) {
        const $list = $("#player-list").empty();
        for (const p of players) {
            const badge = p.username === waitingUsername
                ? '<span class="waiting-badge">WAITING</span>' : '';
            $list.append(
                `<li><span class="avatar">${Avatar.getCode(p.avatar)}</span> ${$("<span>").text(p.name).html()} ${badge}</li>`
            );
        }
    }

    // ── Game transitions ────────────────────────────────────
    function startGame() {
        showOnly("#game-page");
        Game.init(document.getElementById("game-canvas"));
        Game.start();
        // BGM
        const bgm = document.getElementById("bgm");
        if (bgm) { bgm.volume = 0.25; bgm.currentTime = 0; bgm.play().catch(() => {}); }
    }

    function stopBgm() {
        const bgm = document.getElementById("bgm");
        if (bgm) { bgm.pause(); bgm.currentTime = 0; }
    }

    function endGame(data) {
        Game.stop();
        stopBgm();

        const state = data.state;
        const result = data.result;
        const stats = data.stats;
        const p0 = state.players[0], p1 = state.players[1];

        // Title
        let title;
        if (result.winner === -1) title = "🤝 It's a Draw!";
        else if (result.winner === myIndex) title = "🎉 You Win!";
        else title = "😢 You Lose!";
        $("#gameover-title").text(title);

        // Stats cards
        const html = [0, 1].map(i => {
            const p = state.players[i];
            const isWinner = result.winner === i;
            return `<div class="stat-card ${isWinner ? 'winner' : ''}">
                <h4>${i === myIndex ? '⛏ You' : '⛏ ' + escHtml(p.name)}${isWinner ? ' 👑' : ''}</h4>
                <div class="stat-line"><span>Score</span><span class="stat-val">${p.score}</span></div>
                <div class="stat-line"><span>Gold Collected</span><span class="stat-val">${p.goldCount}</span></div>
                <div class="stat-line"><span>Diamonds</span><span class="stat-val">${p.diamondCount}</span></div>
                <div class="stat-line"><span>Rocks</span><span class="stat-val">${p.rockCount}</span></div>
                <div class="stat-line"><span>Bombs Hit</span><span class="stat-val">${p.bombCount}</span></div>
            </div>`;
        }).join("");
        $("#gameover-stats").html(html);

        // Rankings
        const ranking = Object.entries(stats)
            .map(([u, s]) => ({ username: u, ...s }))
            .sort((a, b) => b.wins - a.wins || b.totalScore - a.totalScore);

        const $tbody = $("#ranking-body").empty();
        ranking.forEach((r, idx) => {
            $tbody.append(`<tr>
                <td>${idx + 1}</td>
                <td>${Avatar.getCode(r.avatar)} ${escHtml(r.name)}</td>
                <td>${r.wins}</td><td>${r.losses}</td><td>${r.draws}</td>
                <td>${r.totalScore}</td>
            </tr>`);
        });

        showOnly("#gameover-page");
    }

    function escHtml(s) {
        return $("<span>").text(s).html();
    }

    // ── Keyboard input ──────────────────────────────────────
    function setupKeyboard() {
        $(document).on("keydown", function(e) {
            if ($("#game-page").is(":visible")) {
                if (e.code === "Space" || e.key === " ") {
                    e.preventDefault();
                    wsSend({ type: "hook-launch" });
                } else if (e.key === "c" || e.key === "C") {
                    wsSend({ type: "cheat-toggle" });
                }
            }
        });
    }

    // ── Init ────────────────────────────────────────────────
    const init = function() {
        Avatar.populate($("#register-avatar"));
        setupKeyboard();

        // Start page buttons
        $("#start-signin-button").on("click", () => {
            showOnly("#signin-section");
            $("#signin-form").get(0).reset();
            $("#signin-message").text("");
        });
        $("#start-register-button").on("click", () => {
            showOnly("#register-section");
            $("#register-form").get(0).reset();
            $("#register-message").text("");
        });
        $(".back-button").on("click", () => showOnly("#start-section"));

        // Register
        $("#register-button").on("click", function(e) {
            e.preventDefault();
            const username = $("#register-username").val().trim();
            const avatar = $("#register-avatar").val();
            const name = $("#register-name").val().trim();
            const password = $("#register-password").val().trim();
            const confirm = $("#register-confirm").val().trim();

            if (password !== confirm) { $("#register-message").text("Passwords do not match."); return; }

            fetch("/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, avatar, name, password })
            })
            .then(r => r.json())
            .then(json => {
                if (json.error) { $("#register-message").text(json.error); return; }
                $("#register-form").get(0).reset();
                $("#register-message").text("✅ Registration successful! You can now sign in.");
            })
            .catch(err => $("#register-message").text(String(err)));
        });

        // Sign in
        $("#signin-button").on("click", function(e) {
            e.preventDefault();
            const username = $("#signin-username").val().trim();
            const password = $("#signin-password").val().trim();

            fetch("/signin", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password })
            })
            .then(r => r.json())
            .then(json => {
                if (json.error) { $("#signin-message").text(json.error); return; }
                user = json.user;
                enterLobby();
            })
            .catch(err => $("#signin-message").text(String(err)));
        });

        // Sign out
        $("#signout-button").on("click", function() {
            fetch("/signout").then(r => r.json()).then(() => {
                user = null;
                if (ws) { ws.close(); ws = null; }
                showOnly("#start-section");
            });
        });

        // Find match
        $("#find-match-button").on("click", () => wsSend({ type: "join-room" }));
        $("#cancel-match-button").on("click", () => wsSend({ type: "leave-room" }));

        // Game over buttons
        $("#play-again-button").on("click", () => {
            showOnly("#lobby-section");
            $("#find-match-button").show();
            $("#cancel-match-button").hide();
            $("#match-status").text("");
            // Immediately find a new match
            wsSend({ type: "join-room" });
        });
        $("#back-home-button").on("click", () => {
            showOnly("#lobby-section");
            $("#find-match-button").show();
            $("#cancel-match-button").hide();
            $("#match-status").text("");
        });
    };

    function enterLobby() {
        $("#user-avatar").html(Avatar.getCode(user.avatar));
        $("#user-name").text(user.name);
        showOnly("#lobby-section");
        connectWS();
        $("#find-match-button").show();
        $("#cancel-match-button").hide();
        $("#match-status").text("");
    }

    // ── Validate ────────────────────────────────────────────
    const validate = function() {
        fetch("/validate")
            .then(r => r.json())
            .then(json => {
                if (json.error) return;
                user = json.user;
                enterLobby();
            })
            .catch(() => {});
    };

    return { init, validate };
})();
