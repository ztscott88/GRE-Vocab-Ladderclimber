document.addEventListener("DOMContentLoaded", () => {
  const DEFAULT_TOTAL = 10;
  const MISSED_UNLOCK_ROUNDS = 5;
  const MISSED_REVIEW_TOTAL = 50;

  const LETTERS = "abcdefghij".split("");
  const MODE = { easy: 3, medium: 5, hard: 6, extreme: 10 };

  const els = {
    overlay: document.getElementById("difficultyOverlay"),
    gameCard: document.getElementById("gameCard"),
    resultCard: document.getElementById("resultCard"),

    qNum: document.getElementById("qNum"),
    scoreInline: document.getElementById("scoreInline"),
    timer: document.getElementById("timer"),

    definition: document.getElementById("definition"),
    choices: document.getElementById("choices"),

    skier: document.getElementById("skier"),
    raceTrack: document.getElementById("raceTrack"),

    scoreOut: document.getElementById("scoreOut"),
    totalOut: document.getElementById("totalOut"),
    pctOut: document.getElementById("pctOut"),
    recap: document.getElementById("recap"),

    retryBtn: document.getElementById("retryBtn"),
    nextBtn: document.getElementById("nextBtn"),
    missedBtn: document.getElementById("missedBtn"),
    restartBtn: document.getElementById("restartBtn"),

    mEasy: document.getElementById("mEasy"),
    mMedium: document.getElementById("mMedium"),
    mHard: document.getElementById("mHard"),
    mExtreme: document.getElementById("mExtreme"),

    timeChoice: document.getElementById("timeChoice"),
  };

  // ---------- Utils ----------
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function sanitizeDefinition(def, word) {
    const s = (def == null ? "" : String(def)).trim();
    if (!s) return "";
    const replaced = s.replace(new RegExp(`\\b${word}\\b`, "ig"), "_____");
    return /^definition\s*:/i.test(replaced) ? replaced : `Definition: ${replaced}`;
  }

  // ---------- Find vocab list (robust) ----------
  // Tries common names, then scans window for largest array that looks like vocab.
  function detectRawVocab() {
    const candidates = [
      window.VOCAB_WORDS, window.WORDS, window.VOCAB, window.GRE_WORDS, window.GREG_WORDS
    ].filter(Boolean);

    for (const c of candidates) {
      if (Array.isArray(c) && c.length) return c;
    }

    let best = null;
    let bestLen = 0;

    for (const k of Object.keys(window)) {
      try {
        const v = window[k];
        if (!Array.isArray(v) || v.length < 50) continue;

        const sample = v[0];
        const ok =
          typeof sample === "string" ||
          (Array.isArray(sample) && sample.length >= 1) ||
          (sample && typeof sample === "object");

        if (ok && v.length > bestLen) {
          best = v;
          bestLen = v.length;
        }
      } catch {}
    }

    return best || [];
  }

  function normalizeVocab(raw) {
    const out = [];
    const seen = new Set();

    const push = (w, d) => {
      const word = String(w || "").trim();
      if (!word) return;
      const key = word.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);

      out.push({
        word,
        def: sanitizeDefinition(d, word) // may be ""
      });
    };

    for (const item of raw) {
      if (typeof item === "string") {
        push(item, "");
      } else if (Array.isArray(item)) {
        push(item[0], item[1] ?? "");
      } else if (item && typeof item === "object") {
        const w = item.word ?? item.term ?? item.vocab ?? item.w ?? item.WORD;
        const d = item.definition ?? item.def ?? item.meaning ?? item.d ?? item.DEFINITION;
        push(w, d);
      }
    }

    return out;
  }

  const RAW = detectRawVocab();
  const VOCAB = normalizeVocab(RAW);

  // If definitions not present in words.js, use dictionary API (cached)
  const defCache = new Map(); // wordLower -> "Definition: ..."
  async function fetchDefinition(word) {
    const key = word.toLowerCase();
    if (defCache.has(key)) return defCache.get(key);

    try {
      const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
      const d = await r.json();
      const def = d?.[0]?.meanings?.[0]?.definitions?.[0]?.definition || "Definition unavailable.";
      const safe = `Definition: ${String(def).replace(new RegExp(`\\b${word}\\b`, "ig"), "_____")}`;
      defCache.set(key, safe);
      return safe;
    } catch {
      const fallback = "Definition unavailable.";
      defCache.set(key, fallback);
      return fallback;
    }
  }

  function ensureVocabLoadedOrShowError() {
    if (VOCAB.length >= 10) return true;
    els.overlay.style.display = "none";
    els.gameCard.classList.remove("hidden");
    els.definition.textContent =
      "Error: word list not loaded. Make sure words.js is in the same folder and sets a vocab array.";
    els.choices.innerHTML = "";
    return false;
  }

  // ---------- State ----------
  let mode = "medium";
  let total = DEFAULT_TOTAL;

  let qIndex = 0;
  let correct = 0;
  let locked = false;

  // round: [{word, def, opts, ans}]
  let round = [];
  let history = [];

  // Retry: EXACT word->definition must stay identical
  let lastBase = null; // [{word, defExact}]
  let lastMode = "medium";
  let lastTotal = DEFAULT_TOTAL;

  // Missed system (across normal rounds)
  let roundsPlayed = 0;
  const missedSet = new Set(); // lower words

  // Timer
  let timerEnabled = false;
  let timeLimit = 60;
  let timeLeft = 0;
  let timerId = null;

  function readTimeChoice() {
    const raw = String(els.timeChoice?.value || "off").toLowerCase();
    if (raw === "off" || raw === "false" || raw === "0") return { enabled: false, seconds: 60 };
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) return { enabled: false, seconds: 60 };
    return { enabled: true, seconds: n };
  }

  function applyTimeChoice() {
    const t = readTimeChoice();
    timerEnabled = t.enabled;
    timeLimit = t.seconds;
    els.timer.textContent = timerEnabled ? `${timeLimit}s` : "OFF";
  }

  function stopTimer() {
    if (timerId) { clearInterval(timerId); timerId = null; }
  }

  function startTimer() {
    stopTimer();
    if (!timerEnabled) {
      els.timer.textContent = "OFF";
      return;
    }
    timeLeft = timeLimit;
    els.timer.textContent = `${timeLeft}s`;
    timerId = setInterval(() => {
      timeLeft--;
      els.timer.textContent = `${timeLeft}s`;
      if (timeLeft <= 0) {
        stopTimer();
        endGame(true);
      }
    }, 1000);
  }

  function updateRaceProgress(answered) {
    const pct = Math.max(0, Math.min(1, answered / total));
    const min = 10;
    const max = els.raceTrack.clientWidth - 10;
    els.skier.style.left = `${min + (max - min) * pct}px`;

    const cps = els.raceTrack.querySelectorAll(".checkpoint");
    cps.forEach((cp, idx) => {
      const threshold = (idx + 1) / 10;
      cp.classList.toggle("hit", pct >= threshold);
    });
  }

  function updateHUD() {
    const asked = Math.min(qIndex + 1, total);
    els.qNum.textContent = `Question ${asked}/${total}`;
    els.scoreInline.textContent = `Correct ${correct}/${asked}`;
    els.timer.textContent = timerEnabled ? `${timeLeft}s` : "OFF";
    updateRaceProgress(qIndex);
  }

  // ---------- Build round with EXACT defs ----------
  function randomBase(count) {
    const pool = shuffle([...VOCAB]);
    return pool.slice(0, count).map(v => ({
      word: v.word,
      defExact: v.def || "" // may be empty -> will be fetched once and then pinned
    }));
  }

  function distractors(correctWord, n) {
    const pool = shuffle(VOCAB.map(v => v.word).filter(w => w.toLowerCase() !== correctWord.toLowerCase()));
    return pool.slice(0, Math.max(0, n));
  }

  async function buildRoundFromBase(base) {
    const questions = [];

    for (const item of base) {
      const word = item.word;

      // PIN definition: if base has defExact use it; else use cache; else fetch and cache once
      let defExact = item.defExact || defCache.get(word.toLowerCase()) || "";

      if (!defExact) {
        defExact = await fetchDefinition(word);
      } else {
        // ensure labeled + sanitized
        defExact = sanitizeDefinition(defExact, word) || defExact;
      }

      defCache.set(word.toLowerCase(), defExact); // pin for retry

      // options can change every time
      const optCount = MODE[mode];
      const opts = [word, ...distractors(word, optCount - 1)];
      shuffle(opts);

      questions.push({
        word,
        def: defExact,
        opts,
        ans: opts.findIndex(o => o.toLowerCase() === word.toLowerCase())
      });
    }

    return questions;
  }

  // ---------- Render ----------
  function renderQuestion() {
    locked = false;
    els.choices.innerHTML = "";

    updateHUD();

    const q = round[qIndex];
    els.definition.textContent = q.def || "Definition unavailable.";

    q.opts.forEach((opt, i) => {
      const btn = document.createElement("button");
      btn.className = "choice";
      btn.type = "button";
      btn.innerHTML = `<b>${LETTERS[i]}.</b> ${opt}`;
      btn.addEventListener("click", () => chooseAnswer(i));
      els.choices.appendChild(btn);
    });
  }

  function chooseAnswer(i) {
    if (locked) return;
    locked = true;

    const q = round[qIndex];
    const ok = i === q.ans;

    if (ok) correct++;
    else missedSet.add(q.word.toLowerCase());

    history.push({
      def: q.def,
      correct: q.word,
      picked: q.opts[i],
      ok
    });

    // move next
    qIndex++;

    // clear focus so “last letter highlight” doesn’t carry
    els.choices.querySelectorAll("button").forEach(b => b.blur());
    els.choices.innerHTML = "";

    if (qIndex >= total) {
      endGame(false);
      return;
    }

    setTimeout(renderQuestion, 120);
  }

  // ---------- Start / End ----------
  async function startGame(selectedMode, baseOverride = null, forcedTotal = null, shuffleOrder = false) {
    if (!ensureVocabLoadedOrShowError()) return;

    mode = selectedMode || mode || "medium";
    total = forcedTotal || DEFAULT_TOTAL;

    applyTimeChoice();
    stopTimer();

    qIndex = 0;
    correct = 0;
    locked = false;
    history = [];
    updateRaceProgress(0);

    els.overlay.style.display = "none";
    els.resultCard.classList.add("hidden");
    els.gameCard.classList.remove("hidden");
    els.missedBtn.classList.add("hidden");

    els.definition.textContent = "Loading definitions…";
    els.choices.innerHTML = "";

    let base = baseOverride ? baseOverride.map(x => ({ word: x.word, defExact: x.defExact })) : randomBase(total);
    if (shuffleOrder) base = shuffle(base);

    // Save for retry (defs pinned)
    lastBase = base.map(x => ({
      word: x.word,
      defExact: defCache.get(x.word.toLowerCase()) || x.defExact || ""
    }));
    lastMode = mode;
    lastTotal = total;

    round = await buildRoundFromBase(lastBase);

    startTimer();
    renderQuestion();
  }

  function endGame(endedByTime) {
    stopTimer();

    els.gameCard.classList.add("hidden");
    els.resultCard.classList.remove("hidden");

    els.scoreOut.textContent = String(correct);
    els.totalOut.textContent = String(total);
    els.pctOut.textContent = String(Math.round((correct / total) * 100));

    const header = endedByTime
      ? `<div style="margin:10px 0;font-weight:800;">Time’s up. Recap:</div>`
      : "";

    els.recap.innerHTML =
      header +
      history.map((h, idx) => `
        <div style="margin-bottom:12px;">
          <div class="muted"><b>Q${idx + 1}.</b> ${h.def || "Definition unavailable."}</div>
          <div>
            <b>Correct:</b> <span class="ok">${h.correct}</span>
            &nbsp;|&nbsp;
            <b>You:</b> <span class="${h.ok ? "ok" : "bad"}">${h.picked}</span>
            <span class="${h.ok ? "ok" : "bad"}" style="margin-left:6px;">${h.ok ? "✔" : "✖"}</span>
          </div>
        </div>
      `).join("");

    if (total === DEFAULT_TOTAL) roundsPlayed++;

    const unlock = roundsPlayed >= MISSED_UNLOCK_ROUNDS && missedSet.size > 0 && total === DEFAULT_TOTAL;
    if (unlock) {
      els.missedBtn.classList.remove("hidden");
      els.missedBtn.textContent = `Practice Missed (${MISSED_REVIEW_TOTAL})`;
    }
  }

  // ---------- Missed 50 ----------
  function missedBase50() {
    const missedWords = Array.from(missedSet);
    const base = missedWords.map(wLower => {
      const match = VOCAB.find(v => v.word.toLowerCase() === wLower);
      const word = match ? match.word : wLower;
      const defExact = defCache.get(wLower) || match?.def || "";
      return { word, defExact };
    });

    if (base.length < MISSED_REVIEW_TOTAL) {
      const need = MISSED_REVIEW_TOTAL - base.length;
      const extra = shuffle([...VOCAB]).filter(v => !missedSet.has(v.word.toLowerCase()));
      base.push(...extra.slice(0, need).map(v => ({ word: v.word, defExact: v.def || "" })));
    }

    return shuffle(base).slice(0, MISSED_REVIEW_TOTAL);
  }

  // ---------- Overlay timer selection ----------
  document.querySelectorAll("[data-time]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-time]").forEach(b => b.classList.remove("timerSelected"));
      btn.classList.add("timerSelected");
      els.timeChoice.value = btn.dataset.time;
    });
  });

  // ---------- Difficulty buttons ----------
  els.mEasy.addEventListener("click", () => startGame("easy"));
  els.mMedium.addEventListener("click", () => startGame("medium"));
  els.mHard.addEventListener("click", () => startGame("hard"));
  els.mExtreme.addEventListener("click", () => startGame("extreme"));

  // Retry: SAME EXACT DEFS, ORDER MAY CHANGE, OPTIONS MAY CHANGE
  els.retryBtn.addEventListener("click", () => {
    if (!lastBase) return;
    const baseForRetry = lastBase.map(x => ({
      word: x.word,
      defExact: defCache.get(x.word.toLowerCase()) || x.defExact || ""
    }));
    startGame(lastMode, baseForRetry, lastTotal, true);
  });

  // Next 10: new base
  els.nextBtn.addEventListener("click", () => startGame(mode, null, DEFAULT_TOTAL, false));

  // Missed 50
  els.missedBtn.addEventListener("click", () => {
    const base = missedBase50();
    startGame(mode, base, MISSED_REVIEW_TOTAL, false);
    roundsPlayed = 0;
    missedSet.clear();
  });

  // Change difficulty
  els.restartBtn.addEventListener("click", () => {
    stopTimer();
    els.overlay.style.display = "flex";
    els.gameCard.classList.add("hidden");
    els.resultCard.classList.add("hidden");
  });

  // Initial
  els.overlay.style.display = "flex";
});