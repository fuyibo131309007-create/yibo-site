(() => {
  "use strict";
  const $ = selector => document.querySelector(selector);
  const canvas = $("#courtCanvas"), ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { tone, toast, readStorage, writeStorage, reduceMotion } = window.Yibo;
  const arcade = $("#arcade"), cover = $("#gameCover"), startButton = $("#startMatch");
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const player = { x: 500, y: 485, tx: 500, ty: 485, swing: 0 };
  const bot = { x: 500, y: 110, swing: 0 };
  let W = 1000, H = 540, state = "ready", previousState = "rally";
  let score = [0, 0], rally = 0, longest = 0;
  let best = Math.max(0, Number(readStorage("yibo-rally-best", "0")) || 0);
  let ball = null, ballPosition = { x: 500, y: 450, z: 0 };
  let shotBuffer = null, keys = new Set(), flightNumber = 0;
  let particles = [], trail = [], popupTime = 0, pointTimer = 0;
  let visible = false, raf = 0, lastTime = 0, pointerDragging = false, pointerMoved = false, pointerStart = null;
  let hitFlash = 0, aimCounter = 0, server = "bot";

  function projection(x, y, z = 0) {
    const scale = .69 + y / 600 * .30;
    return { x: W / 2 + (x - 500) * W * .90 / 1000 * scale, y: H * .11 + y / 600 * H * .74 - z / 600 * H * .66 };
  }
  function inverse(px, py) {
    const y = clamp((py - H * .11) / (H * .74) * 600, 328, 563);
    return { x: clamp(500 + (px - W / 2) / (W * .90 / 1000 * (.69 + y / 600 * .3)), 45, 955), y };
  }
  function resize() {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    W = r.width; H = r.height;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(performance.now());
  }
  function line(points, color, lineWidth = 1, dashed = false) {
    ctx.beginPath();
    points.forEach(([x, y, z = 0], i) => {
      const p = projection(x, y, z); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
    });
    ctx.strokeStyle = color; ctx.lineWidth = lineWidth;
    if (dashed) ctx.setLineDash([4, 4]);
    ctx.stroke(); ctx.setLineDash([]);
  }
  function polygon(points, fill) {
    ctx.beginPath();
    points.forEach(([x, y], i) => { const p = projection(x, y); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  }
  function status(text) { $("#gameStatus").textContent = text; }
  function stats() {
    $("#playerScore").textContent = score[0]; $("#opponentScore").textContent = score[1];
    $("#gameStats").textContent = `本局最长回合 ${longest} · 本机最佳 ${best}`;
    canvas.dataset.state = state;
    canvas.dataset.rally = String(rally);
  }
  function popup(text) {
    $("#gamePopup").textContent = text; $("#gamePopup").classList.add("show"); popupTime = 1.0;
  }
  function burst(x, y, color, count = 12) {
    if (reduceMotion) return;
    for (let i = 0; i < count; i++) particles.push({ x, y, vx: (Math.random() - .5) * 150, vy: (Math.random() - .7) * 160, life: .7, color });
  }
  function updateBest() {
    longest = Math.max(longest, rally);
    if (longest > best) { best = longest; writeStorage("yibo-rally-best", best); }
    stats();
  }
  function send(from, to, type, hitter, startZ = 28) {
    const config = {
      lob: { duration: 2.05, arc: 205 },
      drive: { duration: 1.55, arc: 112 },
      smash: { duration: 1.10, arc: 65 }
    }[type];
    const hard = $("#difficulty").value === "challenge";
    ball = { from: { ...from }, to: { ...to }, time: 0, duration: config.duration * (hitter === "bot" && hard ? .83 : 1), arc: config.arc, hitter, startZ, type };
    flightNumber++; trail = []; shotBuffer = null;
    if (hitter === "you") player.swing = .28; else bot.swing = .28;
    const p = projection(from.x, from.y, startZ); burst(p.x, p.y, hitter === "you" ? "#dbff8a" : "#abbdfa", 9);
    tone(type === "smash" ? 180 : 420, .07, "triangle", .06);
    hitFlash = .08;
  }
  function serve() {
    state = "rally"; rally = 0;
    bot.x = 500; bot.y = 115;
    shotBuffer = null; trail = []; player.tx = player.x; player.ty = player.y;
    status(server === "bot" ? "对方发球 · 移动到光圈附近接球" : "你的发球 · 准备下一拍");
    if (server === "bot") send({ x: bot.x, y: bot.y }, { x: player.x, y: player.y }, "lob", "bot", 35);
    else send({ x: player.x, y: player.y }, { x: 500, y: 100 }, "lob", "you", 35);
    stats();
  }
  function startMatch() {
    if (state === "paused") { resume(); return; }
    score = [0, 0]; rally = 0; longest = 0;
    player.x = 500; player.y = 480; player.tx = 500; player.ty = 480;
    bot.x = 500; bot.y = 110; server = "bot";
    particles = []; trail = []; keys.clear(); cover.hidden = true;
    $("#pauseMatch").disabled = false; $("#pauseMatch").textContent = "Ⅱ 暂停";
    $("#restartMatch").disabled = false;
    serve(); canvas.focus({ preventScroll: true }); startFrame();
  }
  function pause() {
    if (state !== "rally" && state !== "point") return;
    previousState = state; state = "paused"; keys.clear(); pointerDragging = false;
    $$(".held").forEach(e => e.classList.remove("held"));
    cover.hidden = false;
    cover.querySelector("h3").innerHTML = "中场休息。";
    cover.querySelector("p").textContent = "比分与回合都保留，准备好了再继续。";
    startButton.textContent = "继续比赛 ↗";
    $("#pauseMatch").textContent = "▶ 继续"; status("比赛已暂停"); stats();
  }
  function resume() {
    if (state !== "paused") return;
    state = previousState; cover.hidden = true;
    $("#pauseMatch").textContent = "Ⅱ 暂停";
    status("比赛继续 · 看准落点"); canvas.focus({ preventScroll: true }); stats(); startFrame();
  }
  function $$(s) { return [...document.querySelectorAll(s)]; }
  function point(winner) {
    if (state !== "rally") return;
    score[winner]++; server = winner === 0 ? "you" : "bot";
    state = "point"; ball = null; shotBuffer = null; pointTimer = 1.35;
    if (winner === 0) { status("你得分 · 好球！"); popup("NICE SHOT!"); tone(780, .23); }
    else { status("对方得分 · 提前移动到落点附近"); popup("NEXT ONE."); tone(180, .18, "sine", .025); }
    stats();
    if (score[winner] >= 7) {
      state = "finished"; cover.hidden = false;
      cover.querySelector("h3").innerHTML = winner === 0 ? "这局，<br>你赢了。" : "下次，<br>球场再见。";
      cover.querySelector("p").textContent = `${score[0]} : ${score[1]} · 本局最长 ${longest} 拍 · ${winner === 0 ? "真正的球场也欢迎来切磋。" : "试试提前跑位，再用挑高球争取时间。"}`;
      startButton.textContent = "再来一局 ↗"; $("#pauseMatch").disabled = true;
      const p = projection(500, 300, 150); burst(p.x, p.y, "#d6fa7e", 40); stats();
    }
  }
  function requestShot(type) {
    if (state !== "rally") return;
    // A short input buffer makes keyboard, pointer and touch equally forgiving.
    shotBuffer = { type, ttl: .42 }; player.swing = .24;
    tryPlayerHit();
  }
  function tryPlayerHit() {
    if (!shotBuffer || !ball || ball.hitter !== "bot") return;
    const p = ballPosition, dist = Math.hypot(p.x - player.x, (p.y - player.y) * .95);
    const reach = $("#difficulty").value === "challenge" ? 132 : 175;
    if (p.y > 307 && p.z < 165 && dist < reach && ball.time / ball.duration > .5) {
      const type = shotBuffer.type;
      // Hit toward the opposite half; moving changes both reach and shot direction.
      const targetX = clamp(1000 - player.x + (aimCounter++ % 2 ? 80 : -80), 80, 920);
      const targetY = type === "lob" ? 70 : type === "smash" ? 185 : 125;
      const from = { x: p.x, y: p.y };
      rally++; updateBest();
      document.dispatchEvent(new CustomEvent("yibo:return", { detail: { rally, type } }));
      status(type === "smash" ? "扣杀！压住对方的反应时间" : type === "lob" ? "挑高球 · 趁现在回到中路" : `连续 ${rally} 拍 · 好球，保持节奏`);
      send(from, { x: targetX, y: targetY }, type, "you", Math.max(30, p.z));
    }
  }
  function update(dt) {
    hitFlash = Math.max(0, hitFlash - dt);
    player.swing = Math.max(0, player.swing - dt); bot.swing = Math.max(0, bot.swing - dt);
    if (popupTime > 0) { popupTime -= dt; if (popupTime <= 0) $("#gamePopup").classList.remove("show"); }
    particles = particles.filter(p => { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt; return p.life > 0; });
    if (state !== "rally" && state !== "point") return;
    let dx = (keys.has("right") ? 1 : 0) - (keys.has("left") ? 1 : 0);
    let dy = (keys.has("down") ? 1 : 0) - (keys.has("up") ? 1 : 0);
    if (dx || dy) {
      const n = Math.hypot(dx, dy); player.tx = clamp(player.x + dx / n * 480 * dt, 45, 955); player.ty = clamp(player.y + dy / n * 390 * dt, 328, 563);
      player.x = player.tx; player.y = player.ty;
    } else {
      const speed = 740 * dt, x = player.tx - player.x, y = player.ty - player.y, dist = Math.hypot(x, y);
      if (dist > 1) { player.x += x * Math.min(1, speed / dist); player.y += y * Math.min(1, speed / dist); }
    }
    if (state === "point") { pointTimer -= dt; if (pointTimer <= 0) serve(); return; }
    if (!ball) return;
    ball.time += dt;
    const t = clamp(ball.time / ball.duration, 0, 1);
    ballPosition = { x: lerp(ball.from.x, ball.to.x, t), y: lerp(ball.from.y, ball.to.y, t), z: Math.max(0, 4 * ball.arc * t * (1 - t) + ball.startZ * (1 - t)) };
    if (shotBuffer) { shotBuffer.ttl -= dt; if (shotBuffer.ttl <= 0) shotBuffer = null; else tryPlayerHit(); }
    if (!ball) return;
    const hard = $("#difficulty").value === "challenge";
    const target = ball.hitter === "you" ? ball.to : { x: 500, y: 115 };
    const botSpeed = hard ? 520 : 330;
    const bx = target.x - bot.x, by = target.y - bot.y, bd = Math.hypot(bx, by);
    if (bd > 2) { bot.x += bx * Math.min(1, botSpeed * dt / bd); bot.y += by * Math.min(1, botSpeed * dt / bd); }
    if (ball.hitter === "you" && t > .76 && ballPosition.y < 290 && ballPosition.z < 150 && Math.hypot(ballPosition.x - bot.x, ballPosition.y - bot.y) < (hard ? 145 : 120)) {
      rally++; updateBest();
      const pattern = flightNumber % 5;
      const tx = hard ? [150, 850, 500, 280, 760][pattern] : clamp(player.x + [-160, 150, 0, 200, -120][pattern], 100, 900);
      const ty = hard ? [490, 360, 540, 400, 500][pattern] : [485, 440, 515, 420, 480][pattern];
      const style = hard && pattern === 3 ? "smash" : pattern % 2 ? "drive" : "lob";
      send({ x: ballPosition.x, y: ballPosition.y }, { x: tx, y: ty }, style, "bot", Math.max(30, ballPosition.z));
      status(`连续 ${rally} 拍 · 对手回球，准备接住`);
      return;
    }
    if (ball.time >= ball.duration) { point(ball.hitter === "you" ? 0 : 1); return; }
    const screen = projection(ballPosition.x, ballPosition.y, ballPosition.z);
    trail.push({ ...screen }); if (trail.length > 13) trail.shift();
  }
  function drawPerson(person, isPlayer) {
    const base = projection(person.x, person.y), head = projection(person.x, person.y, 53);
    const scale = Math.max(.6, Math.min(W / 950, 1.2)) * (isPlayer ? 1.12 : .91);
    ctx.fillStyle = "#0a140e7a"; ctx.beginPath(); ctx.ellipse(base.x, base.y + 3, 17 * scale, 6 * scale, 0, 0, Math.PI * 2); ctx.fill();
    const bodyY = head.y + 12 * scale;
    ctx.strokeStyle = "#d4dac8"; ctx.lineWidth = 4 * scale; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(base.x - 6 * scale, base.y); ctx.lineTo(base.x, bodyY + 12 * scale); ctx.lineTo(base.x + 8 * scale, base.y); ctx.stroke();
    ctx.fillStyle = isPlayer ? "#d8fb83" : "#b2bceb";
    ctx.beginPath(); ctx.roundRect(base.x - 9 * scale, bodyY - 3 * scale, 18 * scale, 21 * scale, 5 * scale); ctx.fill();
    ctx.fillStyle = "#efddba"; ctx.beginPath(); ctx.arc(base.x, head.y + 3 * scale, 6.5 * scale, 0, Math.PI * 2); ctx.fill();
    const angle = person.swing > 0 ? -1.1 + person.swing / .28 * 2.2 : -.5;
    ctx.save(); ctx.translate(base.x + 8 * scale, bodyY + 5 * scale); ctx.rotate(isPlayer ? angle : Math.PI - angle);
    ctx.strokeStyle = "#e9eecf"; ctx.lineWidth = 2 * scale; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(16 * scale, -8 * scale); ctx.stroke();
    ctx.strokeStyle = isPlayer ? "#d8fb83" : "#b2bceb"; ctx.beginPath(); ctx.ellipse(24 * scale, -12 * scale, 10 * scale, 7 * scale, -.4, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "#dceac055"; ctx.lineWidth = .5; ctx.beginPath(); ctx.moveTo(15 * scale, -10 * scale); ctx.lineTo(33 * scale, -14 * scale); ctx.stroke(); ctx.restore();
    ctx.fillStyle = isPlayer ? "#ddff93" : "#a6b2db"; ctx.textAlign = "center"; ctx.font = `${Math.max(7, 9 * scale)}px Menlo, monospace`;
    ctx.fillText(isPlayer ? "YOU" : "YIBO BOT", base.x, base.y + 19 * scale);
  }
  function draw(time) {
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#14251c"); bg.addColorStop(1, "#253623");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#8ba65322";
    for (let i = 0; i < 38; i++) ctx.fillRect(((i * 137) % 991) / 1000 * W, ((i * 67) % 583) / 600 * H, 1, 1);
    polygon([[0, 0], [1000, 0], [1000, 600], [0, 600]], "#3f6741");
    for (let y = 0; y < 600; y += 100) polygon([[0, y], [1000, y], [1000, y + 50], [0, y + 50]], "#3a603b");
    line([[0, 600], [1000, 600]], "#1c301c", 7);
    const white = "#d8edb3a3";
    line([[0, 0], [1000, 0], [1000, 600], [0, 600], [0, 0]], white, 1.5);
    line([[85, 0], [85, 600]], white); line([[915, 0], [915, 600]], white);
    line([[0, 245], [1000, 245]], white); line([[0, 355], [1000, 355]], white);
    line([[0, 55], [1000, 55]], white); line([[0, 545], [1000, 545]], white);
    line([[500, 0], [500, 245]], white); line([[500, 355], [500, 600]], white);
    if (ball && ball.hitter === "bot") {
      const target = projection(ball.to.x, ball.to.y);
      const pulse = reduceMotion ? 0 : Math.sin(time / 150) * 3;
      ctx.strokeStyle = "#d7ff83b0"; ctx.lineWidth = 1.4; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.ellipse(target.x, target.y, 21 + pulse, 9 + pulse * .4, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#ddffa448"; ctx.beginPath(); ctx.ellipse(target.x, target.y, 5, 2, 0, 0, Math.PI * 2); ctx.fill();
    }
    // Footprint marks the player's movement target.
    if (state === "rally" && Math.hypot(player.tx - player.x, player.ty - player.y) > 50) {
      const aim = projection(player.tx, player.ty);
      ctx.strokeStyle = "#c4e59255"; ctx.beginPath(); ctx.arc(aim.x, aim.y, 7, 0, Math.PI * 2); ctx.stroke();
    }
    drawPerson(bot, false);
    line([[0, 300, 0], [0, 300, 48]], "#e6f3d3", 3);
    line([[1000, 300, 0], [1000, 300, 48]], "#e6f3d3", 3);
    line([[0, 300, 48], [1000, 300, 48]], "#e2eccd", 2);
    for (let x = 0; x <= 1000; x += 30) line([[x, 300, 5], [x, 300, 47]], "#c8dcaf43", .5);
    for (let z = 5; z < 47; z += 10) line([[0, 300, z], [1000, 300, z]], "#c8dcaf43", .5);
    drawPerson(player, true);
    if (ball) {
      const p = projection(ballPosition.x, ballPosition.y, ballPosition.z), shadow = projection(ballPosition.x, ballPosition.y);
      ctx.fillStyle = "#0a180f66"; ctx.beginPath(); ctx.ellipse(shadow.x, shadow.y, 6, 2.5, 0, 0, Math.PI * 2); ctx.fill();
      if (!reduceMotion) trail.forEach((v, i) => {
        ctx.fillStyle = `rgba(232,255,173,${i / trail.length * .25})`;
        ctx.beginPath(); ctx.arc(v.x, v.y, 1 + i / trail.length * 2, 0, Math.PI * 2); ctx.fill();
      });
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ball.hitter === "bot" ? .7 : -2.4);
      ctx.fillStyle = "#fcffe9"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-5, -11); ctx.lineTo(5, -11); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#f2d09c"; ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    particles.forEach(p => { ctx.globalAlpha = p.life / .7; ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 3, 3); }); ctx.globalAlpha = 1;
    if (hitFlash > 0 && !reduceMotion) { ctx.strokeStyle = `rgba(219,255,140,${hitFlash * 2})`; ctx.lineWidth = 4; ctx.strokeRect(2, 2, W - 4, H - 4); }
    // Readable, inert state for browser verification and assistive summaries.
    canvas.dataset.playerX = Math.round(player.x);
    canvas.dataset.playerY = Math.round(player.y);
    canvas.dataset.state = state;
  }
  function frame(time) {
    raf = 0; const dt = Math.min(.034, (time - lastTime) / 1000 || .016); lastTime = time;
    if (state !== "paused") update(dt);
    draw(time);
    if (visible && !document.hidden) raf = requestAnimationFrame(frame);
  }
  function startFrame() { if (!raf && visible && !document.hidden) { lastTime = performance.now(); raf = requestAnimationFrame(frame); } }
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (!visible) { pause(); cancelAnimationFrame(raf); raf = 0; } else startFrame();
  }, { threshold: .05 }).observe(canvas);
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); else startFrame(); });
  document.addEventListener("yibo:pause", pause);
  startButton.addEventListener("click", startMatch);
  $("#restartMatch").addEventListener("click", () => { state = "ready"; startMatch(); });
  $("#pauseMatch").addEventListener("click", () => state === "paused" ? resume() : pause());
  $("#focusGame").addEventListener("click", () => arcade.scrollIntoView({ behavior: reduceMotion ? "instant" : "smooth", block: "start" }));
  $("#difficulty").addEventListener("change", () => toast(`已切换为${$("#difficulty").value === "challenge" ? "挑战赛" : "友谊赛"}`));
  const keyMap = { KeyW: "up", ArrowUp: "up", KeyS: "down", ArrowDown: "down", KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right" };
  function keyboardInGame(e) { return arcade.contains(document.activeElement) && !["SELECT", "INPUT", "TEXTAREA"].includes(e.target.tagName); }
  document.addEventListener("keydown", e => {
    if (!keyboardInGame(e) || $("dialog[open]")) return;
    if (e.code === "KeyP" || e.code === "Escape") { if (state === "rally" || state === "point" || state === "paused") { e.preventDefault(); state === "paused" ? resume() : pause(); } return; }
    if (state !== "rally" && state !== "point") return;
    if (keyMap[e.code]) { e.preventDefault(); keys.add(keyMap[e.code]); }
    if (["Space", "KeyJ", "KeyK"].includes(e.code) && e.target.tagName !== "BUTTON") {
      e.preventDefault(); if (!e.repeat) requestShot(e.code === "KeyJ" ? "lob" : e.code === "KeyK" ? "smash" : "drive");
    }
  });
  document.addEventListener("keyup", e => { if (keyMap[e.code]) keys.delete(keyMap[e.code]); });
  window.addEventListener("blur", () => { keys.clear(); pause(); });
  $$("[data-move]").forEach(b => {
    b.addEventListener("pointerdown", e => { if (state !== "rally" && state !== "point") return; e.preventDefault(); b.setPointerCapture(e.pointerId); keys.add(b.dataset.move); b.classList.add("held"); });
    const release = () => { keys.delete(b.dataset.move); b.classList.remove("held"); };
    b.addEventListener("pointerup", release); b.addEventListener("pointercancel", release); b.addEventListener("lostpointercapture", release);
  });
  $$("[data-shot]").forEach(b => b.addEventListener("click", () => requestShot(b.dataset.shot)));
  function pointerTarget(e) {
    const r = canvas.getBoundingClientRect(), p = inverse(e.clientX - r.x, e.clientY - r.y);
    player.tx = p.x; player.ty = p.y;
  }
  canvas.addEventListener("pointerdown", e => {
    if (state !== "rally") return;
    canvas.focus({ preventScroll: true }); canvas.setPointerCapture(e.pointerId);
    pointerDragging = true; pointerMoved = false; pointerStart = { x: e.clientX, y: e.clientY };
    pointerTarget(e);
  });
  canvas.addEventListener("pointermove", e => {
    if (state !== "rally" && state !== "point") return;
    if (pointerDragging && pointerStart && Math.hypot(e.clientX - pointerStart.x, e.clientY - pointerStart.y) > 9) pointerMoved = true;
    if (pointerDragging || e.pointerType === "mouse") pointerTarget(e);
  });
  canvas.addEventListener("pointerup", () => { if (pointerDragging && !pointerMoved) requestShot("drive"); pointerDragging = false; });
  canvas.addEventListener("pointercancel", () => { pointerDragging = false; });
  $("#gameFullscreen").addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (arcade.requestFullscreen) await arcade.requestFullscreen();
      else { arcade.scrollIntoView({ block: "start" }); toast("此浏览器不支持全屏，可直接在页面中游玩。"); }
    } catch { toast("暂时无法全屏，可直接在页面中游玩。"); }
  });
  document.addEventListener("fullscreenchange", () => { $("#gameFullscreen").textContent = document.fullscreenElement ? "⛶ 退出全屏" : "⛶ 全屏"; resize(); });
  stats(); resize();
})();
