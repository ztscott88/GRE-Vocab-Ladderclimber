document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  // =========================
  // CONFIG
  // =========================
  const TOTAL_QUESTIONS = 10;
  const LETTERS = "abcdefghij".split("");

  // Difficulty -> number of answer options
  const MODE_TO_OPTIONS = {
    easy: 3,
    medium: 5,
    hard: 6,
    extreme: 10
  };

  // Dictionary API endpoint (works on GitHub Pages)
  const DICT_ENDPOINT = "https://api.dictionaryapi.dev/api/v2/entries/en/";

  // Definition fetch timeout (ms)
  const DEF_TIMEOUT_MS = 3500;

  // Concurrency for preloading definitions
  const PRELOAD_CONCURRENCY = 3;

  // Delay between questions (ms)
  const NEXT_QUESTION_DELAY = 120;

  // =========================
  // DATA SOURCE
  // =========================
  // words.js should define window.VOCAB_WORDS as an array of strings
  const WORDS = Array.isArray(window.VOCAB_WORDS) ? window.VOCAB_WORDS : [];

  // =========================
  // DOM ELEMENTS
  // =========================
  const els = {
    overlay: document.getElementById("difficultyOverlay"),

    mEasy: document.getElementById("mEasy"),
    mMedium: document.getElementById("mMedium"),
    mHard: document.getElementById("mHard"),
    mExtreme: document.getElementById("mExtreme"),

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
  };

  // Optional: If any are missing, stop gracefully
  const required = ["overlay","mEasy","mMedium","mHard","mExtreme","gameCard","resultCard","qNum","scoreInline","definition","choices","climber","scoreOut","pctOut","recap","restartBtn"];
  for (const k of required) {
    if (!els[k]) {
      console.error("Missing element:", k);
      return;
    }
  }

  // =========================
  // STATE
  // =========================
  let mode = null;
  let qIndex = 0;
  let correct = 0;
  let locked = false;

  // round questions: [{ word, options[], answerIndex, def }]
  let round = [];

  // history: [{ def, correctWord, pickedWord, ok }]
  let history = [];

  // Definition cache persists between rounds (faster)
  const DEF_CACHE = new Map();

  // For keyboard input (A–J)
  let keyHandlerAttached = false;

  // =========================
  // HELPERS
  // =========================
  function uniqueStrings(list) {
    const out = [];
    const seen = new Set();
    for (const item of list) {
      const s = String(item || "").trim();
      if (!s) continue;
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
    return out;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function sanitizeDefinition(def, word) {
    if (!def) return "Definition unavailable.";
    let s = String(def).trim().replace(/\s+/g, " ");
    // Replace the word if it appears in the definition
    try {
      const rx = new RegExp(`\\b${escapeRegex(word)}\\b`, "ig");
      s = s.replace(rx, "_____");
    } catch {
      // ignore regex errors
    }
    return s;
  }

  function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function show(el) { el.classList.remove("hidden"); }
  function hide(el) { el.classList.add("hidden"); }

  function setOverlayVisible(on) {
    els.overlay.style.display = on ? "flex" : "none";
  }

  // =========================
  // HUD / UI
  // =========================
  function updateHUD() {
    const asked = Math.min(qIndex + 1, TOTAL_QUESTIONS);
    els.qNum.textContent = `${asked}/${TOTAL_QUESTIONS}`;
    els.scoreInline.textContent = `${correct}/${asked}`;
    els.climber.style.bottom = `${Math.min(correct, 10) * 10}%`;
  }

  function clearChoiceFocus() {
    // prevent “last selected stays highlighted”
    try { document.activeElement && document.activeElement.blur(); } catch {}
  }

  // =========================
  // DEFINITIONS
  // =========================
  async function fetchDefinition(word) {
    const key = word.toLowerCase();
    if (DEF_CACHE.has(key)) return DEF_CACHE.get(key);

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), DEF_TIMEOUT_MS);

    try {
      const r = await fetch(DICT_ENDPOINT + encodeURIComponent(word), { signal: controller.signal });
      if (!r.ok) throw new Error("No definition");
      const d = await r.json();
      const raw = d?.[0]?.meanings?.[0]?.definitions?.[0]?.definition;
      const finalDef = sanitizeDefinition(raw, word);
      DEF_CACHE.set(key, finalDef);
      return finalDef;
    } catch {
      const fallback = "Definition unavailable.";
      DEF_CACHE.set(key, fallback);
      return fallback;
    } finally {
      clearTimeout(t);
    }
  }

  async function preloadDefinitionsForRound() {
    // Show progress in the definition area
    els.choices.innerHTML = "";
    els.definition.textContent = "Loading definitions… 0%";

    let done = 0;
    const total = round.length;
    let idx = 0;

    async function worker() {
      while (idx < total) {
        const my = idx++;
        const q = round[my];
        q.def = await fetchDefinition(q.word);
        done++;
        const pct = Math.round((done / total) * 100);
        els.definition.textContent = `Loading definitions… ${pct}%`;
      }
    }

    const workers = [];
    for (let i = 0; i < PRELOAD_CONCURRENCY; i++) workers.push(worker());
    await Promise.all(workers);
  }

  // =========================
  // ROUND BUILD
  // =========================
  function buildRound() {
    const pool = shuffle(uniqueStrings(WORDS));
    if (pool.length < 50) {
      console.warn("Word list is small. Make sure words.js loaded and contains many words.");
    }

    const picked = pool.slice(0, TOTAL_QUESTIONS);
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
        def: ""
      };
    });
  }

  // =========================
  // RENDER QUESTION
  // =========================
  function renderQuestion() {
    locked = false;
    clearChoiceFocus();

    els.choices.innerHTML = "";
    updateHUD();

    const q = round[qIndex];
    els.definition.textContent = q.def || "Definition unavailable.";

    q.options.forEach((opt, i) => {
      const btn = document.createElement("button");
      btn.className = "choice";
      btn.type = "button";
      btn.innerHTML = `<b>${LETTERS[i] || "?"}.</b> ${opt}`;
      btn.addEventListener("click", () => choose(i), { passive: true });
      els.choices.appendChild(btn);
    });
  }

  // =========================
  // ANSWER SELECT
  // =========================
  function choose(i) {
    if (locked) return;
    locked = true;

    // disable any interaction immediately
    const buttons = els.choices.querySelectorAll("button");
    buttons.forEach(b => b.disabled = true);

    const q = round[qIndex];
    const ok = i === q.answerIndex;
    if (ok) correct++;

    history.push({
      def: q.def || "Definition unavailable.",
      correctWord: q.word,
      pickedWord: q.options[i],
      ok
    });

    // move on
    qIndex++;

    if (qIndex >= TOTAL_QUESTIONS) {
      showResults();
      return;
    }

    setTimeout(renderQuestion, NEXT_QUESTION_DELAY);
  }

  // =========================
  // RESULTS
  // =========================
  function showResults() {
    hide(els.gameCard);
    show(els.resultCard);

    els.scoreOut.textContent = String(correct);
    els.pctOut.textContent = String(Math.round((correct / TOTAL_QUESTIONS) * 100));

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

  // =========================
  // KEYBOARD (A–J)
  // =========================
  function attachKeyHandler() {
    if (keyHandlerAttached) return;
    keyHandlerAttached = true;

    window.addEventListener("keydown", (e) => {
      // only active during the game view
      if (els.gameCard.classList.contains("hidden")) return;
      if (locked) return;

      const k = (e.key || "").toLowerCase();
      const idx = LETTERS.indexOf(k);
      if (idx === -1) return;

      // only if that option exists
      const q = round[qIndex];
      if (!q) return;
      if (idx >= q.options.length) return;

      choose(idx);
    });
  }

  // =========================
  // START FLOW
  // =========================
  async function startGame(selectedMode) {
    mode = selectedMode;
    qIndex = 0;
    correct = 0;
    history = [];
    locked = false;

    setOverlayVisible(false);
    hide(els.resultCard);
    show(els.gameCard);

    buildRound();

    // Preload ALL definitions first so recap always has them
    await preloadDefinitionsForRound();

    attachKeyHandler();
    renderQuestion();
  }

  // =========================
  // BUTTON WIRING
  // =========================
  els.mEasy.onclick = () => startGame("easy");
  els.mMedium.onclick = () => startGame("medium");
  els.mHard.onclick = () => startGame("hard");
  els.mExtreme.onclick = () => startGame("extreme");

  els.restartBtn.onclick = () => {
    setOverlayVisible(true);
    hide(els.gameCard);
    hide(els.resultCard);
  };

  // =========================
  // INITIAL STATE
  // =========================
  setOverlayVisible(true);
  hide(els.gameCard);
  hide(els.resultCard);

});