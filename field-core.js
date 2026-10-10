(() => {
  "use strict";
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const safeStorage = {
    get(key, fallback = null) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, String(value)); } catch {} }
  };
  let audioContext;
  function tone(frequency = 440, duration = .08, type = "sine", volume = .025) {
    if ($("#soundToggle")?.getAttribute("aria-pressed") !== "true") return;
    const AudioContextClass = window.AudioContext || window["webkitAudioContext"];
    audioContext ||= new AudioContextClass();
    const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
    oscillator.type = type; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(); oscillator.stop(audioContext.currentTime + duration);
  }
  let toastTimer;
  function toast(message) {
    const node = $("#toast"); if (!node) return;
    node.textContent = message; node.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove("show"), 1800);
  }
  window.Yibo = {
    reduceMotion:reducedMotion,
    tone,
    toast,
    readStorage: safeStorage.get,
    writeStorage: safeStorage.set,
    travelManifest: null,
  };

  const loaderValue = $("#loaderValue"), loaderBar = $("#loaderBar");
  let loaderProgress = 4, atlasReady = false, worldReady = false;
  function setLoader(value) {
    loaderProgress = Math.max(loaderProgress, Math.min(100, Math.round(value)));
    loaderValue.textContent = String(loaderProgress).padStart(2, "0");
    loaderBar.style.width = `${loaderProgress}%`;
  }
  function finishLoader() {
    if (!atlasReady || !worldReady) return;
    setLoader(100);
    requestAnimationFrame(() => {
      $("#loader").classList.add("done");
      document.body.classList.remove("is-loading");
    });
  }
  document.addEventListener("field:progress", event => setLoader(event.detail || 0));
  document.addEventListener("field:ready", () => { worldReady = true; finishLoader(); });

  const travelMeta = {
    svalbard: [78.22,15.65,"EUROPE / HIGH ARCTIC","从世界最北面的城市开始。"],
    norway: [69.65,18.96,"EUROPE / NORWAY","雪山、峡湾与城市灯火同时出现。"],
    iceland: [64.96,-19.02,"EUROPE / ICELAND","冰川把时间冻成蓝色纹理。"],
    finland: [60.17,24.94,"EUROPE / FINLAND","冬日让城市安静，也让灯光更暖。"],
    spain: [41.38,2.17,"EUROPE / SPAIN","海岸与阳光，是我最喜欢的频道。"],
    uk: [51.51,-0.13,"EUROPE / UNITED KINGDOM","在伦敦继续学习，也继续改变方向。"],
    italy: [41.90,12.50,"EUROPE / ITALY","历史和日常在同一条街上发生。"],
    switzerland: [46.59,7.91,"EUROPE / SWITZERLAND","山谷提醒人重新理解尺度。"],
    netherlands: [52.37,4.90,"EUROPE / NETHERLANDS","运河与单车构成城市的节奏。"],
    germany: [52.52,13.41,"EUROPE / GERMANY","克制的表面，也有复杂的层次。"],
    austria: [48.21,16.37,"EUROPE / AUSTRIA","古典仍然参与今天的生活。"],
    portugal: [38.72,-9.14,"EUROPE / PORTUGAL","黄色电车爬过靠海的山坡。"],
    greece: [36.39,25.46,"EUROPE / GREECE","把蓝与白留给爱琴海。"],
    czechia: [50.08,14.44,"EUROPE / CZECHIA","老城的故事感不需要布置。"],
    denmark: [55.68,12.57,"EUROPE / DENMARK","港口把北欧日常涂成彩色。"],
    sweden: [59.33,18.07,"EUROPE / SWEDEN","在群岛之间，傍晚会持续很久。"],
    thailand: [13.76,100.50,"ASIA / THAILAND","热带城市用另一种速度打开感官。"],
    japan: [35.68,139.69,"ASIA / JAPAN","每个路口都有新的观察角度。"],
    korea: [37.57,126.98,"ASIA / SOUTH KOREA","旧宫墙外，是不断更新的首尔。"],
    australia: [-33.87,151.21,"OCEANIA / AUSTRALIA","海港与清晰日光构成第一印象。"],
    newzealand: [-45.03,168.66,"OCEANIA / NEW ZEALAND","路途本身就是最值得看的部分。"],
    usa: [40.71,-74.01,"NORTH AMERICA / USA","城市把野心画成天际线。"],
  };
  let atlasItems = [], activeAtlas = 0;
  async function loadAtlas() {
    try {
      const response = await fetch("./assets/travel/manifest.json");
      if (!response.ok) throw new Error(`Travel manifest ${response.status}`);
      const manifest = await response.json();
      atlasItems = Object.entries(manifest).map(([key, value], index) => ({
        ...value, key, index, meta: travelMeta[key],
      }));
      window.Yibo.travelManifest = atlasItems;
      renderAtlas();
      setLoader(30);
      atlasReady = true;
      document.dispatchEvent(new CustomEvent("field:atlas-ready", { detail: atlasItems }));
      finishLoader();
    } catch (error) {
      console.error(error);
      $("#atlasRail").innerHTML = "<p class='atlas-error'>旅行影像档案暂时未能载入。</p>";
      atlasReady = true;
      document.dispatchEvent(new CustomEvent("field:atlas-ready", { detail: [] }));
      finishLoader();
    }
  }
  function renderAtlas() {
    const rail = $("#atlasRail"); rail.replaceChildren();
    atlasItems.forEach((item, index) => {
      const button = document.createElement("button");
      button.type = "button"; button.className = "atlas-card"; button.dataset.index = index;
      const image = document.createElement("img");
      image.src = item.file; image.alt = `${item.country}旅行地点摄影：${item.title}`;
      image.loading = index < 3 ? "eager" : "lazy"; image.decoding = "async";
      const footer = document.createElement("footer");
      const title = document.createElement("span"), credit = document.createElement("span");
      title.textContent = item.title;
      credit.textContent = `${item.author} · ${item.license}`;
      footer.append(title, credit); button.append(image, footer);
      button.addEventListener("click", () => openImage(index));
      rail.append(button);
    });
    $("#atlasScrubber").max = String(Math.max(0, atlasItems.length - 1));
    $(".atlas-count b").textContent = `/ ${atlasItems.length}`;
    updateAtlasActive(0);
    requestAnimationFrame(updateAtlas);
  }
  function coordinateText(lat, lon) {
    return `${Math.abs(lat).toFixed(2)}° ${lat < 0 ? "S" : "N"} / ${Math.abs(lon).toFixed(2)}° ${lon < 0 ? "W" : "E"}`;
  }
  function updateAtlasActive(index) {
    if (!atlasItems.length) return;
    const next = Math.max(0, Math.min(atlasItems.length - 1, index));
    if (next === activeAtlas && $(".atlas-card.active")) return;
    activeAtlas = next;
    $$(".atlas-card").forEach((card, i) => card.classList.toggle("active", i === next));
    const item = atlasItems[next], [lat, lon, region, line] = item.meta;
    $("#atlasNumber").textContent = String(next + 1).padStart(2, "0");
    $("#atlasCurrent").textContent = String(next + 1).padStart(2, "0");
    $("#atlasCoordinate").textContent = coordinateText(lat, lon);
    $("#atlasRegion").textContent = region;
    $("#atlasName").textContent = item.label;
    $("#atlasLine").textContent = line;
    $("#atlasScrubber").value = String(next);
    $("#atlasScrubber").setAttribute("aria-valuetext", `${next + 1} / ${atlasItems.length}：${item.label}`);
    $("#atlasPrev").disabled = next === 0;
    $("#atlasNext").disabled = next === atlasItems.length - 1;
    document.dispatchEvent(new CustomEvent("field:atlas", { detail: { ...item, lat, lon } }));
  }
  let pendingAtlasIndex = null;
  let atlasSelectionTimer;
  function atlasTargetLeft(rail, card) {
    const centered = card.offsetLeft - (rail.clientWidth - card.offsetWidth) / 2;
    return Math.max(0, Math.min(rail.scrollWidth - rail.clientWidth, centered));
  }
  function finishAtlasSelection() {
    const rail = $("#atlasRail"), card = $$(".atlas-card")[pendingAtlasIndex];
    if (pendingAtlasIndex !== null && card) {
      rail.scrollTo({ left: atlasTargetLeft(rail, card), behavior: "instant" });
    }
    pendingAtlasIndex = null;
    rail.style.removeProperty("scroll-snap-type");
  }
  function goToAtlas(index) {
    if (!atlasItems.length) return;
    const next = Math.max(0, Math.min(atlasItems.length - 1, Number(index) || 0));
    updateAtlasActive(next);
    const rail = $("#atlasRail"), card = $$(".atlas-card")[next];
    if (!card) return;
    pendingAtlasIndex = next;
    // Keep native snap from restoring an older position during rapid selection.
    rail.style.scrollSnapType = "none";
    const targetLeft = atlasTargetLeft(rail, card);
    rail.scrollTo({ left: targetLeft, behavior: "instant" });
    clearTimeout(atlasSelectionTimer);
    atlasSelectionTimer = setTimeout(finishAtlasSelection, 150);
  }
  function updateAtlas() {
    if (!atlasItems.length) return;
    goToAtlas(activeAtlas);
  }
  $("#atlasRail").addEventListener("scroll", () => {
    if (!atlasItems.length) return;
    const rail = $("#atlasRail");
    const cards = $$(".atlas-card");
    const center = rail.scrollLeft + rail.clientWidth / 2;
    let closest = 0, distance = Infinity;
    cards.forEach((card, index) => {
      const value = Math.abs(card.offsetLeft + card.offsetWidth / 2 - center);
      if (value < distance) { distance = value; closest = index; }
    });
    // Scroll feedback must not rewrite a selection while it is being applied.
    if (pendingAtlasIndex !== null) {
      clearTimeout(atlasSelectionTimer);
      atlasSelectionTimer = setTimeout(finishAtlasSelection, 150);
      return;
    }
    pendingAtlasIndex = null;
    updateAtlasActive(closest);
  }, { passive: true });
  ["pointerdown", "wheel", "keydown"].forEach(type => {
    $("#atlasRail").addEventListener(type, () => {
      clearTimeout(atlasSelectionTimer);
      pendingAtlasIndex = null;
      $("#atlasRail").style.removeProperty("scroll-snap-type");
    }, { passive: true });
  });
  $("#atlasScrubber").addEventListener("input", event => goToAtlas(event.target.value));
  $("#atlasScrubber").addEventListener("change", () => tone(470, .06, "triangle", .018));
  $("#atlasPrev").addEventListener("click", () => goToAtlas(activeAtlas - 1));
  $("#atlasNext").addEventListener("click", () => goToAtlas(activeAtlas + 1));

  function openImage(index) {
    if (!atlasItems.length) return;
    goToAtlas((index + atlasItems.length) % atlasItems.length);
    const item = atlasItems[activeAtlas];
    $("#dialogImage").src = item.file; $("#dialogImage").alt = `${item.country}：${item.title}`;
    $("#dialogPlace").textContent = `${String(activeAtlas + 1).padStart(2, "0")} / ${item.label}`;
    $("#dialogCredit").textContent = `${item.title} · ${item.author} · ${item.license}`;
    $("#dialogCount").textContent = `${String(activeAtlas + 1).padStart(2, "0")} / ${atlasItems.length}`;
    if (!$("#imageDialog").open) $("#imageDialog").showModal();
  }
  $("#imagePrev").addEventListener("click", () => openImage(activeAtlas - 1));
  $("#imageNext").addEventListener("click", () => openImage(activeAtlas + 1));


  const toneMap = { hero:"dark", experience:"light", background:"light", practice:"light", atlas:"dark", court:"light", dog:"light", closing:"dark" };
  const sceneLabels = { hero:["00","ABOUT YIBO"], experience:["01","EXPERIENCE"], background:["02","BACKGROUND"], practice:["03","PERSONAL PRACTICE"], atlas:["04","LIFE BEYOND WORK"], court:["04","BADMINTON"], dog:["04","HAPPINESS"], closing:["05","LET’S CONNECT"] };
  const sceneNav = { hero:"#home", experience:"#work", background:"#profile", practice:"#profile", atlas:"#atlas", court:"#atlas", dog:"#atlas", closing:"#contact" };
  function updateScene() {
    const sections = $$("main [data-scene]");
    const current = sections.find(section => {
      const rect = section.getBoundingClientRect();
      return rect.top <= innerHeight * .5 && rect.bottom > innerHeight * .5;
    }) || sections[0];
    const scene = current.dataset.scene;
    document.body.dataset.tone = toneMap[scene] || "dark";
    document.body.dataset.scene = scene;
    const label = sceneLabels[scene] || ["00","LIVING FIELD"];
    $("#sceneIndex>span").textContent = label[0]; $("#sceneIndex>em").textContent = label[1];
    const pageProgress = scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight);
    $("#sceneIndex i b").style.transform = `scaleX(${pageProgress})`;
    $(".site-header nav")?.querySelectorAll("a").forEach(link => {
      const active = link.getAttribute("href") === sceneNav[scene];
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
    $("#menuDialog").querySelectorAll("a").forEach(link => {
      const active = link.getAttribute("href") === `#${current.id}`;
      if (active) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
    document.dispatchEvent(new CustomEvent("field:scene", { detail: { scene } }));
  }
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      updateScene(); ticking = false;
    });
  }
  addEventListener("scroll", onScroll, { passive:true });
  addEventListener("resize", () => requestAnimationFrame(() => { updateScene(); updateAtlas(); }));
  const sceneObserver = new IntersectionObserver(() => updateScene(), {
    root:null,
    rootMargin:"-45% 0px -45% 0px",
    threshold:[0,.01],
  });
  $$("main [data-scene]").forEach(section => sceneObserver.observe(section));

  $("#soundToggle").addEventListener("click", () => {
    const active = $("#soundToggle").getAttribute("aria-pressed") !== "true";
    $("#soundToggle").setAttribute("aria-pressed", String(active));
    $("#soundToggle b").textContent = active ? "ON" : "OFF";
    if (active) { tone(520, .08, "sine", .025); toast("声音已开启"); }
  });
  $("#menuButton").addEventListener("click", () => {
    $("#menuDialog").showModal(); $("#menuButton").setAttribute("aria-expanded", "true"); tone(280, .06);
  });
  $$("[data-close]").forEach(button => button.addEventListener("click", () => {
    const dialog = document.getElementById(button.dataset.close); dialog?.close();
    if (dialog?.id === "menuDialog") $("#menuButton").setAttribute("aria-expanded", "false");
  }));
  $("#menuDialog").addEventListener("close", () => $("#menuButton").setAttribute("aria-expanded", "false"));
  $("#menuDialog").querySelectorAll("a").forEach(link => link.addEventListener("click", () => $("#menuDialog").close()));
  document.addEventListener("keydown", event => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (!$("#imageDialog").open) return;
    event.preventDefault(); openImage(activeAtlas + (event.key === "ArrowRight" ? 1 : -1));
  });

  let affection = Math.max(0, Math.min(100, Number(safeStorage.get("field-dog-affection", "0")) || 0));
  function renderAffection(message) {
    $("#petMeter").style.width = `${affection}%`; $("#petValue").textContent = `${affection}%`;
    $("#petReply").textContent = message; safeStorage.set("field-dog-affection", affection);
  }
  $("#petDog").addEventListener("click", () => {
    affection = Math.min(100, affection + 13); renderAffection(affection >= 100 ? "它决定暂时认可你。" : "尾巴摇了起来。"); tone(640, .09, "sine", .02);
  });
  $("#feedDog").addEventListener("click", () => {
    affection = Math.min(100, affection + 21); renderAffection(affection >= 100 ? "零食外交取得成功。" : "它已经开始期待下一颗。"); tone(760, .08, "triangle", .02);
  });
  renderAffection(affection ? "上次见面留下的快乐值还在。" : "它正在观察你。");
  $("#copyContact").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText("18852356108"); toast("手机 / 微信号已复制：18852356108"); }
    catch { toast("手机 / 微信：18852356108"); }
  });

  $("#focusGame").addEventListener("click", () => $("#arcade").scrollIntoView({ behavior:reducedMotion ? "auto" : "smooth", block:"start" }));
  loadAtlas();
  updateScene();
})();
