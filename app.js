document.addEventListener("DOMContentLoaded", () => {
  const DEFAULT_TOTAL = 10;
  const LAST50_UNLOCK_ROUNDS = 5; // 5 normal rounds = 50 questions
  const LAST50_SIZE = 50;

  const LETTERS = "abcdefghij".split("");
  const MODE = { easy: 3, medium: 5, hard: 6, extreme: 10 };

  const els = {
    overlay: document.getElementById("difficultyOverlay"),
    gameCard: document.getElementById("gameCard"),
    resultCard: document.getElementById("resultCard"),

    roundPill: document.getElementById("roundPill"),
    qNum: document.getElementById("qNum"),
    scoreInline: document.getElementById("scoreInline"),
    timer: document.getElementById("timer"),

    definition: document.getElementById("definition"),
    choices: document.getElementById("choices"),

    flagBtn: document.getElementById("flagBtn"),
    skipBtn: document.getElementById("skipBtn"),

    skier: document.getElementById("skier"),
    raceTrack: document.getElementById("raceTrack"),

    resultRoundTitle: document.getElementById("resultRoundTitle"),
    medalOut: document.getElementById("medalOut"),
    scoreOut: document.getElementById("scoreOut"),
    totalOut: document.getElementById("totalOut"),
    pctOut: document.getElementById("pctOut"),
    recap: document.getElementById("recap"),

    retryBtn: document.getElementById("retryBtn"),
    nextBtn: document.getElementById("nextBtn"),
    reviewWrongBtn: document.getElementById("reviewWrongBtn"),
    reviewLast50Btn: document.getElementById("reviewLast50Btn"),
    restartBtn: document.getElementById("restartBtn"),
    roundsHistory: document.getElementById("roundsHistory"),

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

  // ---------- Vocab detection ----------
  function detectRawVocab() {
    const direct = [
      window.VOCAB_WORDS, window.WORDS, window.VOCAB, window.GRE_WORDS, window.GREG_WORDS
    ].filter(Boolean);

    for (const c of direct) {
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
      out.push({ word, def: sanitizeDefinition(d, word) });
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

  function ensureVocabLoadedOrShowError() {
    if (VOCAB.length >= 10) return true;
    els.overlay.style.display = "none";
    els.gameCard.classList.remove("hidden");
    els.definition.textContent =
      "Error: word list not loaded. Make sure words.js is in the same folder and sets a vocab array.";
    els.choices.innerHTML = "";
    return false;
  }

  // ---------- Definition cache (pins definitions for Retry) ----------
  const defCache = new Map(); // wordLower -> defExact

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

  // ---------- State ----------
  let mode = "medium";
  let total = DEFAULT_TOTAL;

  let roundNumber = 1;
  const roundsLog = []; // {round, score, total, pct, medal}

  let qIndex = 0;
  let correct = 0;
  let locked = false;

  let round = [];   // [{word, def, opts, ans}]
  let history = []; // [{def, correct, picked, ok, flagged}]

  let lastBase = null; // [{word, defExact}]
  let lastMode = "medium";
  let lastTotal = DEFAULT_TOTAL;

  const missedSet = new Set();
  const flaggedSet = new Set();

  const last50Queue = []; // [{word, defExact}]
  let normalRoundsCompleted = 0;

  let currentFlagged = false;

  // ---------- Timer ----------
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

  // ---------- UI helpers ----------
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
    els.roundPill.textContent = `Round ${roundNumber}`;
    els.qNum.textContent = `Question ${asked}/${total}`;
    els.scoreInline.textContent = `Correct ${correct}/${asked}`;
    els.timer.textContent = timerEnabled ? `${timeLeft}s` : "OFF";
    updateRaceProgress(qIndex);
  }

  function medalForPct(pct) {
    if (pct >= 80) return { icon: "🥇", name: "Gold" };
    if (pct >= 60) return { icon: "🥈", name: "Silver" };
    if (pct >= 40) return { icon: "🥉", name: "Bronze" };
    return { icon: "🏁", name: "Finish" };
  }

  function renderRoundsLog() {
    if (!els.roundsHistory) return;
    if (!roundsLog.length) { els.roundsHistory.textContent = ""; return; }
    const recent = roundsLog.slice(-6).map(r =>
      `Round ${r.round}: ${r.medal.icon} ${r.medal.name} (${r.score}/${r.total})`
    );
    els.roundsHistory.textContent = "Recent rounds: " + recent.join(" • ");
  }

  // ---------- Round building ----------
  function randomBase(count) {
    const pool = shuffle([...VOCAB]);
    return pool.slice(0, count).map(v => ({ word: v.word, defExact: v.def || "" }));
  }

  function distractors(correctWord, n) {
    const pool = shuffle(VOCAB.map(v => v.word).filter(w => w.toLowerCase() !== correctWord.toLowerCase()));
    return pool.slice(0, Math.max(0, n));
  }

  async function buildRoundFromBase(base) {
    const questions = [];
    for (const item of base) {
      const word = item.word;

      let defExact = item.defExact || defCache.get(word.toLowerCase()) || "";
      if (!defExact) defExact = await fetchDefinition(word);
      defExact = sanitizeDefinition(defExact, word) || defExact;
      defCache.set(word.toLowerCase(), defExact);

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

  // ---------- Last 50 tracking ----------
  function pushToLast50(word, defExact) {
    last50Queue.push({ word, defExact });
    while (last50Queue.length > LAST50_SIZE) last50Queue.shift();
  }

  // ---------- Rendering ----------
  function setFlagUI(on) {
    currentFlagged = !!on;
    if (currentFlagged) els.flagBtn.classList.add("on");
    else els.flagBtn.classList.remove("on");
  }

  function renderQuestion() {
    locked = false;
    els.choices.innerHTML = "";
    setFlagUI(false);

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

  function recordFlag(word) { flaggedSet.add(word.toLowerCase()); }
  function recordMiss(word) { missedSet.add(word.toLowerCase()); }

  function chooseAnswer(i) {
    if (locked) return;
    locked = true;

    const q = round[qIndex];
    const ok = i === q.ans;

    if (currentFlagged) recordFlag(q.word);
    if (ok) correct++; else recordMiss(q.word);

    history.push({
      def: q.def,
      correct: q.word,
      picked: q.opts[i],
      ok,
      flagged: currentFlagged
    });

    if (total === DEFAULT_TOTAL) pushToLast50(q.word, q.def);

    qIndex++;

    els.choices.querySelectorAll("button").forEach(b => b.blur());
    els.choices.innerHTML = "";

    if (qIndex >= total) {
      endGame(false);
      return;
    }
    setTimeout(renderQuestion, 120);
  }

  function skipQuestion() {
    if (locked) return;
    locked = true;

    const q = round[qIndex];
    recordFlag(q.word);
    recordMiss(q.word);

    history.push({
      def: q.def,
      correct: q.word,
      picked: "SKIPPED",
      ok: false,
      flagged: true
    });

    if (total === DEFAULT_TOTAL) pushToLast50(q.word, q.def);

    qIndex++;

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
    history = [];
    locked = false;
    updateRaceProgress(0);

    els.overlay.style.display = "none";
    els.resultCard.classList.add("hidden");
    els.gameCard.classList.remove("hidden");

    els.definition.textContent = "Loading definitions…";
    els.choices.innerHTML = "";

    els.reviewWrongBtn.classList.add("hidden");
    els.reviewLast50Btn.classList.add("hidden");

    let base = baseOverride
      ? baseOverride.map(x => ({ word: x.word, defExact: x.defExact }))
      : randomBase(total);

    if (shuffleOrder) base = shuffle(base);

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

    const pct = Math.round((correct / total) * 100);
    const medal = medalForPct(pct);

    els.resultRoundTitle.textContent = `Round ${roundNumber} Results`;
    els.medalOut.textContent = `${medal.icon} ${medal.name} Medal`;

    els.scoreOut.textContent = String(correct);
    els.totalOut.textContent = String(total);
    els.pctOut.textContent = String(pct);

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
            ${h.flagged ? `<span class="muted" style="margin-left:8px;">(flagged)</span>` : ""}
            <span class="${h.ok ? "ok" : "bad"}" style="margin-left:6px;">${h.ok ? "✔" : "✖"}</span>
          </div>
        </div>
      `).join("");

    roundsLog.push({ round: roundNumber, score: correct, total, pct, medal });
    renderRoundsLog();

    if (total === DEFAULT_TOTAL) normalRoundsCompleted++;

    const wrongPlusFlaggedCount = new Set([...missedSet, ...flaggedSet]).size;
    if (wrongPlusFlaggedCount > 0) els.reviewWrongBtn.classList.remove("hidden");

    const last50Unlocked = normalRoundsCompleted >= LAST50_UNLOCK_ROUNDS && last50Queue.length >= LAST50_SIZE;
    if (last50Unlocked) els.reviewLast50Btn.classList.remove("hidden");

    roundNumber++;
  }

  // ---------- Review builders ----------
  function buildReviewWrongFlagged() {
    const set = new Set([...missedSet, ...flaggedSet]);
    const list = Array.from(set);
    const base = list.map(wLower => {
      const match = VOCAB.find(v => v.word.toLowerCase() === wLower);
      const word = match ? match.word : wLower;
      const defExact = defCache.get(wLower) || match?.def || "";
      return { word, defExact };
    });
    return shuffle(base);
  }

  function buildReviewLast50() {
    return last50Queue.map(x => ({ word: x.word, defExact: x.defExact }));
  }

  // ---------- Wiring ----------
  // Timer buttons
  document.querySelectorAll("[data-time]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-time]").forEach(b => b.classList.remove("timerSelected"));
      btn.classList.add("timerSelected");
      els.timeChoice.value = btn.dataset.time;
    });
  });

  // In-question buttons
  els.flagBtn.addEventListener("click", () => setFlagUI(!currentFlagged));
  els.skipBtn.addEventListener("click", () => skipQuestion());

  // Difficulty
  els.mEasy.addEventListener("click", () => startGame("easy"));
  els.mMedium.addEventListener("click", () => startGame("medium"));
  els.mHard.addEventListener("click", () => startGame("hard"));
  els.mExtreme.addEventListener("click", () => startGame("extreme"));

  // Retry: SAME DEFINITIONS, different order + different distractors ok
  els.retryBtn.addEventListener("click", () => {
    if (!lastBase) return;
    const baseForRetry = lastBase.map(x => ({
      word: x.word,
      defExact: defCache.get(x.word.toLowerCase()) || x.defExact || ""
    }));
    startGame(lastMode, baseForRetry, lastTotal, true);
  });

  // Next 10
  els.nextBtn.addEventListener("click", () => startGame(mode, null, DEFAULT_TOTAL, false));

  // Review Wrong + Flagged
  els.reviewWrongBtn.addEventListener("click", () => {
    const base = buildReviewWrongFlagged();
    if (!base.length) return;
    startGame(mode, base, base.length, false);
  });

  // Review Last 50
  els.reviewLast50Btn.addEventListener("click", () => {
    const base = buildReviewLast50();
    if (base.length < LAST50_SIZE) return;
    startGame(mode, base, base.length, false);
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