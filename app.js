document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const TOTAL = 10;
  const LETTERS = "abcdefghij".split("");
  const WORDS = Array.isArray(window.VOCAB_WORDS) ? window.VOCAB_WORDS : [];

  const MODE_TO_OPTIONS = { easy: 3, medium: 5, hard: 6, extreme: 10 };
  const DICT_ENDPOINT = "https://api.dictionaryapi.dev/api/v2/entries/en/";
  const DEF_TIMEOUT_MS = 3500;
  const PRELOAD_CONCURRENCY = 3;

  // ---- Elements (some buttons may not exist depending on your index.html)
  const els = {
    overlay: document.getElementById("difficultyOverlay"),
    gameCard: document.getElementById("gameCard"),
    resultCard: document.getElementById("resultCard"),

    qNum: document.getElementById("qNum"),
    scoreInline: document.getElementById("scoreInline"),
    definition: document.getElementById("definition"),
    choices: document.getElementById("choices"),
    climber: document.getElementById("climber"),

    scoreOut: document.getElementById("scoreOut"),
    pctOut: document.getElementById("pctOut"),
    recap: document.getElementById("recap"),

    restartBtn: document.getElementById("restartBtn"),
    nextBtn: document.getElementById("nextBtn"), // optional

    mEasy: document.getElementById("mEasy"),
    mMedium: document.getElementById("mMedium"),
    mHard: document.getElementById("mHard"),
    mExtreme: document.getElementById("mExtreme"),
  };

  // Hard guard for must-have UI
  const must = ["overlay","gameCard","resultCard","qNum","scoreInline","definition","choices","climber","scoreOut","pctOut","recap","restartBtn","mEasy","mMedium","mHard","mExtreme"];
  for (const k of must) {
    if (!els[k]) {
      console.error("Missing element:", k);
      return;
    }
  }

  // ---- State
  let mode = null;
  let qIndex = 0;
  let correct = 0;
  let locked = false;
  let round = [];   // [{word, options, answerIndex, def}]
  let history = []; // [{def, correctWord, pickedWord, ok}]

  // cache across rounds
  const DEF_CACHE = new Map();

  // ---------------- Helpers ----------------
  function hide(el){ el.classList.add("hidden"); }
  function show(el){ el.classList.remove("hidden"); }
  function overlayOn(){ els.overlay.style.display = "flex"; }
  function overlayOff(){ els.overlay.style.display = "none"; }

  function shuffle(arr){
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function uniqueClean(list){
    const out = [];
    const seen = new Set();
    for (const x of list) {
      const s = String(x || "").trim();
      if (!s) continue;
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
    return out;
  }

  function escapeRegex(s){
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function sanitizeDef(def, word){
    if (!def) return "Definition unavailable.";
    let s = String(def).trim().replace(/\s+/g, " ");
    try {
      s = s.replace(new RegExp(`\\b${escapeRegex(word)}\\b`, "ig"), "_____");
    } catch {}
    return s;
  }

  function clearFocus(){
    try { document.activeElement && document.activeElement.blur(); } catch {}
  }

  function updateHUD(){
    const asked = Math.min(qIndex + 1, TOTAL);
    els.qNum.textContent = `${asked}/${TOTAL}`;
    els.scoreInline.textContent = `${correct}/${asked}`;
    els.climber.style.bottom = `${Math.min(correct, 10) * 10}%`;
  }

  // ---------------- Definitions ----------------
  async function fetchDefinition(word){
    const key = word.toLowerCase();
    if (DEF_CACHE.has(key)) return DEF_CACHE.get(key);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEF_TIMEOUT_MS);

    try {
      const r = await fetch(DICT_ENDPOINT + encodeURIComponent(word), { signal: controller.signal });
      if (!r.ok) throw new Error("bad status");
      const data = await r.json();
      const raw = data?.[0]?.meanings?.[0]?.definitions?.[0]?.definition;
      const finalDef = sanitizeDef(raw, word);
      DEF_CACHE.set(key, finalDef);
      return finalDef;
    } catch {
      const fallback = "Definition unavailable.";
      DEF_CACHE.set(key, fallback);
      return fallback;
    } finally {
      clearTimeout(timer);
    }
  }

  async function preloadDefinitions(){
    // show progress in definition area temporarily
    els.choices.innerHTML = "";
    els.definition.textContent = "Loading definitions… 0%";

    let done = 0;
    let idx = 0;
    const total = round.length;

    async function worker(){
      while (idx < total) {
        const my = idx++;
        const q = round[my];
        q.def = await fetchDefinition(q.word);
        done++;
        els.definition.textContent = `Loading definitions… ${Math.round((done / total) * 100)}%`;
      }
    }

    const workers = Array.from({ length: PRELOAD_CONCURRENCY }, () => worker());

    try {
      await Promise.all(workers);
    } catch {
      // even if something weird happens, never leave "loading" defs
      for (const q of round) {
        if (!q.def || q.def.toLowerCase().includes("loading")) q.def = "Definition unavailable.";
      }
    }
  }

  // ---------------- Round Build ----------------
  function buildRound(){
    const pool = shuffle(uniqueClean(WORDS));
    const picked = pool.slice(0, TOTAL);
    const nOptions = MODE_TO_OPTIONS[mode] || 5;

    round = picked.map(word => {
      const options = [word];
      const distractors = shuffle(pool.filter(w => w.toLowerCase() !== word.toLowerCase()));
      while (options.length < nOptions && distractors.length) {
        const d = distractors.pop();
        if (!options.some(x => x.toLowerCase() === d.toLowerCase())) options.push(d);
      }
      shuffle(options);
      return {
        word,
        options,
        answerIndex: options.findIndex(x => x.toLowerCase() === word.toLowerCase()),
        def: "" // filled by preload
      };
    });
  }

  // ---------------- Render Question ----------------
  function renderQuestion(){
    locked = false;
    clearFocus();
    els.choices.innerHTML = "";

    updateHUD();

    const q = round[qIndex];
    els.definition.textContent = q.def || "Definition unavailable.";

    q.options.forEach((opt, i) => {
      const btn = document.createElement("button");
      btn.className = "choice";
      btn.type = "button";
      btn.innerHTML = `<b>${LETTERS[i] || "?"}.</b> ${opt}`;
      btn.onclick = () => choose(i);
      els.choices.appendChild(btn);
    });
  }

  // ---------------- Choose Answer ----------------
  function choose(i){
    if (locked) return;
    locked = true;

    const q = round[qIndex];
    const ok = (i === q.answerIndex);
    if (ok) correct++;

    history.push({
      def: q.def || "Definition unavailable.",
      correctWord: q.word,
      pickedWord: q.options[i],
      ok
    });

    // stop interaction immediately
    els.choices.innerHTML = "";

    qIndex++;

    if (qIndex >= TOTAL) {
      showResults();
      return;
    }

    setTimeout(renderQuestion, 120);
  }

  // ---------------- Results ----------------
  function showResults(){
    hide(els.gameCard);
    show(els.resultCard);

    els.scoreOut.textContent = String(correct);
    els.pctOut.textContent = String(Math.round((correct / TOTAL) * 100));

    els.recap.innerHTML = history.map((h, idx) => `
      <div class="recapItem">
        <div class="muted"><b>Q${idx + 1} Definition:</b><br>${h.def}</div>
        <div>
          <b>Correct:</b> ${h.correctWord}
          &nbsp; | &nbsp;
          <b>You:</b> ${h.pickedWord}
          <span class="${h.ok ? "ok" : "bad"}">${h.ok ? "✔" : "✖"}</span>
        </div>
      </div>
    `).join("");
  }

  // ---------------- Start / Restart ----------------
  async function startGame(selectedMode){
    mode = selectedMode;
    qIndex = 0;
    correct = 0;
    history = [];
    locked = false;

    // if words missing, show a helpful message instead of “loading”
    if (!WORDS || WORDS.length < 20) {
      overlayOff();
      show(els.gameCard);
      hide(els.resultCard);
      els.qNum.textContent = "0/10";
      els.scoreInline.textContent = "0/0";
      els.definition.textContent = "Word list not loaded. Check words.js (VOCAB_WORDS).";
      els.choices.innerHTML = "";
      return;
    }

    overlayOff();
    hide(els.resultCard);
    show(els.gameCard);

    buildRound();
    await preloadDefinitions();

    // guarantee no “loading” leftovers
    for (const q of round) {
      if (!q.def || q.def.toLowerCase().includes("loading")) q.def = "Definition unavailable.";
    }

    renderQuestion();
  }

  function changeDifficulty(){
    overlayOn();
    hide(els.gameCard);
    hide(els.resultCard);
    els.choices.innerHTML = "";
    els.definition.textContent = "";
    clearFocus();
  }

  // ---------------- Wire Buttons ----------------
  els.mEasy.onclick = () => startGame("easy");
  els.mMedium.onclick = () => startGame("medium");
  els.mHard.onclick = () => startGame("hard");
  els.mExtreme.onclick = () => startGame("extreme");

  // Change difficulty button
  els.restartBtn.onclick = changeDifficulty;

  // Optional: Next 10 button if your index has it
  if (els.nextBtn) {
    els.nextBtn.onclick = () => startGame(mode || "medium");
  }

  // ---------------- Initial ----------------
  overlayOn();
  hide(els.gameCard);
  hide(els.resultCard);
});