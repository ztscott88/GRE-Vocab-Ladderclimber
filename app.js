// app.js — fixes review list to ALWAYS use most recent attempt
// Key behavior:
// - Round increments ONLY on Next 10
// - Retry = same exact 10 defs (order can change; distractors can change)
// - attemptInRound increments on Retry
// - Review wrong+flagged builds from the LATEST attempt, not cached from attempt 1

document.addEventListener("DOMContentLoaded", () => {
  const TOTAL = 10;
  const LETTERS = "abcdefghij".split("");
  const WORDS = Array.isArray(window.VOCAB_WORDS) ? window.VOCAB_WORDS : [];

  const MODE = { easy: 3, medium: 5, hard: 6, extreme: 10 };

  const els = {
    overlay: document.getElementById("difficultyOverlay"),
    timeChoice: document.getElementById("timeChoice"),
    timerBtns: Array.from(document.querySelectorAll(".timerBtn[data-time]")),

    mEasy: document.getElementById("mEasy"),
    mMedium: document.getElementById("mMedium"),
    mHard: document.getElementById("mHard"),
    mExtreme: document.getElementById("mExtreme"),

    gameCard: document.getElementById("gameCard"),
    resultCard: document.getElementById("resultCard"),

    roundPill: document.getElementById("roundPill"),
    qNum: document.getElementById("qNum"),
    scoreInline: document.getElementById("scoreInline"),
    timer: document.getElementById("timer"),

    definition: document.getElementById("definition"),
    choices: document.getElementById("choices"),

    flagBtn: document.getElementById("flagBtn"),
    skipBtn: document.getElementById("skipBtn"), // optional
    skier: document.getElementById("skier"),
    raceTrack: document.getElementById("raceTrack"),

    scoreOut: document.getElementById("scoreOut"),
    pctOut: document.getElementById("pctOut"),
    totalOut: document.getElementById("totalOut"),
    recap: document.getElementById("recap"),
    medalOut: document.getElementById("medalOut"),
    resultRoundTitle: document.getElementById("resultRoundTitle"),
    roundsHistory: document.getElementById("roundsHistory"),

    retryBtn: document.getElementById("retryBtn"),
    nextBtn: document.getElementById("nextBtn"),
    restartBtn: document.getElementById("restartBtn"),

    reviewWrongBtn: document.getElementById("reviewWrongBtn"),   // optional if you have it
    reviewLast50Btn: document.getElementById("reviewLast50Btn"), // optional if you have it
  };

  if (!els.overlay || !els.gameCard || !els.resultCard || !els.definition || !els.choices) {
    console.error("Missing required DOM elements. Check index.html IDs.");
    return;
  }

  // ---------- State ----------
  let mode = "medium";

  let roundNumber = 1;
  let attemptInRound = 1; // increments on Retry; resets on Next 10

  // timer
  let timeLimit = 0; // 0 = OFF
  let timeLeft = 0;
  let timerId = null;

  // gameplay
  let qIndex = 0;
  let correct = 0;
  let locked = false;
  let isBuilding = false;

  let round = [];          // current questions array [{word, def, opts, ans}]
  let history = [];        // current attempt history
  let flaggedSet = new Set();

  // “same definitions” backing store for current round
  let baseRoundWords = null; // 10 correct words for this round (fixed across retries)
  let baseRoundDefs = null;  // 10 defs for those words (fixed across retries)

  // store attempt histories per round
  // roundsAttempts[roundNumber] = [{ attempt: 1, history: [...] }, { attempt: 2, history: [...] }]
  const roundsAttempts = {};

  // store last 50 items (definition + correct) for your “review last 50” idea
  const last50 = []; // push { def, correct }

  // ---------- Helpers ----------
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function uniqWords(arr) {
    const out = [];
    const seen = new Set();
    for (const x of arr) {
      const w = String(x || "").trim();
      if (!w) continue;
      const k = w.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(w);
    }
    return out;
  }

  function sanitize(def, word) {
    if (!def) return "Definition unavailable.";
    const w = String(word || "").trim();
    return String(def).replace(new RegExp(`\\b${w}\\b`, "ig"), "_____");
  }

  async function fetchDef(word) {
    try {
      const r = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
      );
      const d = await r.json();
      const raw = d?.[0]?.meanings?.[0]?.definitions?.[0]?.definition;
      return sanitize(raw, word);
    } catch {
      return "Definition unavailable.";
    }
  }

  function stopTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function startTimer() {
    stopTimer();
    if (timeLimit <= 0) {
      timeLeft = 0;
      if (els.timer) els.timer.textContent = "OFF";
      return;
    }
    timeLeft = timeLimit;
    if (els.timer) els.timer.textContent = `${timeLeft}s`;

    timerId = setInterval(() => {
      timeLeft--;
      if (els.timer) els.timer.textContent = `${Math.max(0, timeLeft)}s`;
      if (timeLeft <= 0) {
        stopTimer();
        endGameDueToTime();
      }
    }, 1000);
  }

  function setTimerChoice(val) {
    const v = String(val);
    timeLimit = v === "off" ? 0 : Math.max(0, parseInt(v, 10) || 0);

    if (els.timeChoice) els.timeChoice.value = v === "0" ? "off" : v;

    if (els.timerBtns.length) {
      els.timerBtns.forEach((b) => b.classList.remove("timerSelected"));
      const key = timeLimit <= 0 ? "off" : String(timeLimit);
      const match = els.timerBtns.find((b) => String(b.dataset.time) === key);
      if (match) match.classList.add("timerSelected");
    }
  }

  function updateRaceProgress(answeredCount) {
    if (!els.skier || !els.raceTrack) return;

    const min = 10;
    const max = els.raceTrack.clientWidth - 10;
    const pct = Math.max(0, Math.min(1, answeredCount / TOTAL));
    const x = min + (max - min) * pct;
    els.skier.style.left = `${x}px`;

    const cps = els.raceTrack.querySelectorAll(".checkpoint");
    cps.forEach((cp, idx) => {
      const cpNumber = idx + 1;
      if (answeredCount >= cpNumber) cp.classList.add("hit");
      else cp.classList.remove("hit");
    });
  }

  function updateHUD() {
    const asked = Math.min(qIndex + 1, TOTAL);
    const answered = history.length;

    if (els.roundPill) els.roundPill.textContent = `Round ${roundNumber} · Try ${attemptInRound}`;
    if (els.qNum) els.qNum.textContent = `Question ${asked}/${TOTAL}`;
    if (els.scoreInline) els.scoreInline.textContent = `Correct ${correct}/${answered || 0}`;
    if (els.timer) els.timer.textContent = timeLimit > 0 ? `${timeLeft}s` : "OFF";
    updateRaceProgress(qIndex);
  }

  function buildOptionsForWord(correctWord, pool, count) {
    const opts = [correctWord];
    const distractors = shuffle(pool.filter((w) => w !== correctWord));
    while (opts.length < count && distractors.length) opts.push(distractors.pop());
    return shuffle(opts);
  }

  async function buildBaseRoundNew() {
    const pool = uniqWords(WORDS);
    shuffle(pool);
    const words10 = pool.slice(0, TOTAL);
    const defs10 = await Promise.all(words10.map((w) => fetchDef(w)));

    baseRoundWords = [...words10];
    baseRoundDefs = [...defs10];
  }

  // Build the playable round from base words/defs
  function buildPlayableRoundFromBase() {
    const pool = uniqWords(WORDS);
    const order = shuffle([...Array(TOTAL).keys()]);
    round = order.map((idx) => {
      const word = baseRoundWords[idx];
      const def = baseRoundDefs[idx] || "Definition unavailable.";
      const opts = buildOptionsForWord(word, pool, MODE[mode]);
      return { word, def, opts, ans: opts.indexOf(word) };
    });
  }

  // Build a REVIEW round from a list of base items (word+def fixed)
  function buildReviewRoundFromItems(items) {
    const pool = uniqWords(WORDS);
    const chosen = items.slice(0, TOTAL);
    const order = shuffle([...Array(chosen.length).keys()]);

    round = order.map((idx) => {
      const item = chosen[idx];
      const opts = buildOptionsForWord(item.word, pool, MODE[mode]);
      return { word: item.word, def: item.def, opts, ans: opts.indexOf(item.word) };
    });

    // If fewer than 10, we’ll just have fewer questions
    // (but you can also fill to 10—see function below)
  }

  function fillToTenFromBase(items) {
    const filled = [...items];
    if (!baseRoundWords || !baseRoundDefs) return filled;

    // add any from base round not already present until 10
    const key = new Set(filled.map((x) => x.word.toLowerCase()));
    for (let i = 0; i < baseRoundWords.length && filled.length < TOTAL; i++) {
      const w = baseRoundWords[i];
      if (!key.has(w.toLowerCase())) {
        filled.push({ word: w, def: baseRoundDefs[i] });
        key.add(w.toLowerCase());
      }
    }
    return filled.slice(0, TOTAL);
  }

  function recordAttemptHistory() {
    if (!roundsAttempts[roundNumber]) roundsAttempts[roundNumber] = [];
    // replace if this attempt already exists
    const idx = roundsAttempts[roundNumber].findIndex((x) => x.attempt === attemptInRound);
    const payload = { attempt: attemptInRound, history: [...history] };
    if (idx >= 0) roundsAttempts[roundNumber][idx] = payload;
    else roundsAttempts[roundNumber].push(payload);
  }

  function getLatestAttemptHistory(roundNum) {
    const arr = roundsAttempts[roundNum] || [];
    if (!arr.length) return null;
    // latest by highest attempt
    return arr.reduce((a, b) => (b.attempt > a.attempt ? b : a));
  }

  function medalForPct(pct) {
    if (pct >= 90) return "🥇 Gold medal";
    if (pct >= 70) return "🥈 Silver medal";
    if (pct >= 50) return "🥉 Bronze medal";
    return "🏁 Finish";
  }

  // ---------- Gameplay ----------
  function render() {
    locked = false;
    els.choices.innerHTML = "";
    document.activeElement && document.activeElement.blur();

    updateHUD();

    const q = round[qIndex];
    els.definition.textContent = `Definition: ${q.def}`;

    q.opts.forEach((opt, i) => {
      const b = document.createElement("button");
      b.className = "choice";
      b.type = "button";
      b.innerHTML = `<b>${LETTERS[i]}.</b> ${opt}`;
      b.onclick = () => choose(i);
      els.choices.appendChild(b);
    });
  }

  function pushHistory(q, pickedWord, ok, meta = {}) {
    history.push({
      def: q.def,
      correct: q.word,
      picked: pickedWord,
      ok,
      flagged: !!meta.flagged,
      skipped: !!meta.skipped,
    });

    // last50 memory for marketing/competence building
    last50.push({ def: q.def, correct: q.word });
    if (last50.length > 50) last50.shift();
  }

  function choose(i) {
    if (locked) return;
    locked = true;

    const q = round[qIndex];
    const picked = q.opts[i];
    const ok = i === q.ans;
    if (ok) correct++;

    pushHistory(q, picked, ok, { flagged: flaggedSet.has(qIndex) });

    els.choices.innerHTML = "";

    qIndex++;
    updateRaceProgress(qIndex);

    if (qIndex >= round.length) { // review rounds may be < 10
      stopTimer();
      showResults(false);
      return;
    }

    setTimeout(render, 110);
  }

  // Flag = auto-skip (requested)
  function flagAndSkip() {
    if (locked) return;
    locked = true;

    const q = round[qIndex];
    flaggedSet.add(qIndex);

    pushHistory(q, "(flagged / skipped)", false, { flagged: true, skipped: true });

    els.choices.innerHTML = "";
    qIndex++;
    updateRaceProgress(qIndex);

    if (qIndex >= round.length) {
      stopTimer();
      showResults(false);
      return;
    }

    setTimeout(render, 90);
  }

  function skipOnly() {
    if (locked) return;
    locked = true;

    const q = round[qIndex];
    pushHistory(q, "(skipped)", false, { skipped: true });

    els.choices.innerHTML = "";
    qIndex++;
    updateRaceProgress(qIndex);

    if (qIndex >= round.length) {
      stopTimer();
      showResults(false);
      return;
    }

    setTimeout(render, 90);
  }

  function endGameDueToTime() {
    locked = true;
    els.choices.innerHTML = "";
    showResults(true);
  }

  function showResults(endedByTime) {
    stopTimer();

    // store attempt history so review always uses latest
    recordAttemptHistory();

    els.gameCard.classList.add("hidden");
    els.resultCard.classList.remove("hidden");

    const answered = history.length;
    const pct = round.length ? Math.round((correct / round.length) * 100) : 0;

    if (els.totalOut) els.totalOut.textContent = String(round.length || TOTAL);
    if (els.scoreOut) els.scoreOut.textContent = String(correct);
    if (els.pctOut) els.pctOut.textContent = String(pct);

    if (els.resultRoundTitle) {
      els.resultRoundTitle.textContent = endedByTime
        ? `Round ${roundNumber} · Try ${attemptInRound} (Time’s up)`
        : `Round ${roundNumber} · Try ${attemptInRound} complete`;
    }

    if (els.medalOut) els.medalOut.textContent = medalForPct(pct);

    if (els.roundsHistory) {
      const latest = getLatestAttemptHistory(roundNumber);
      els.roundsHistory.textContent = latest
        ? `Latest: Round ${roundNumber} Try ${latest.attempt}`
        : "";
    }

    const header = endedByTime
      ? `<div style="margin:10px 0; font-weight:900;">Time’s up! Here’s your recap:</div>`
      : `<div style="margin:10px 0; font-weight:900;">Round recap:</div>`;

    const items = history.map((h, idx) => {
      const qLabel = `Q${idx + 1}.`;
      const youClass = h.ok ? "ok" : "bad";
      const mark = h.ok ? "✔" : "✖";

      return `
        <div style="margin: 0 0 12px;">
          <div class="muted"><b>${qLabel} Definition:</b><br>${h.def}</div>
          <div style="margin-top:4px;">
            <b>Correct:</b> <span class="ok">${h.correct}</span>
            &nbsp;|&nbsp;
            <b>You:</b> <span class="${youClass}">${h.picked}</span>
            <span class="${youClass}" style="margin-left:8px;">${mark}</span>
            ${h.flagged ? `<span class="muted" style="margin-left:10px;">(flagged)</span>` : ``}
          </div>
        </div>
      `;
    });

    els.recap.innerHTML =
      header +
      items.join("") +
      (endedByTime && answered < round.length
        ? `<div class="muted" style="margin-top:10px;">You answered ${answered} of ${round.length} questions.</div>`
        : ``);

    // If you have review buttons in HTML, show them
    if (els.reviewWrongBtn) els.reviewWrongBtn.classList.remove("hidden");
    if (els.reviewLast50Btn) els.reviewLast50Btn.classList.remove("hidden");
  }

  async function startGame({ selectedMode, newBaseRound = false, isRetry = false } = {}) {
    if (isBuilding) return;
    isBuilding = true;

    if (selectedMode) mode = selectedMode;

    flaggedSet = new Set();
    qIndex = 0;
    correct = 0;
    history = [];
    locked = false;

    els.overlay.style.display = "none";
    els.resultCard.classList.add("hidden");
    els.gameCard.classList.remove("hidden");

    els.definition.textContent = "Definition: Loading…";
    els.choices.innerHTML = "";
    updateRaceProgress(0);

    try {
      if (newBaseRound || !baseRoundWords || !baseRoundDefs) {
        await buildBaseRoundNew();
      }
      // Retry uses same base words/defs, but can reshuffle order and distractors
      buildPlayableRoundFromBase();
    } finally {
      isBuilding = false;
    }

    startTimer();
    render();
  }

  // Review wrong+flagged from latest attempt
  function startReviewWrongFlaggedLatest() {
    const latest = getLatestAttemptHistory(roundNumber);
    if (!latest) return;

    const wrongOrFlagged = latest.history.filter((h) => !h.ok || h.flagged || h.skipped);
    // Convert to unique items based on correct word
    const seen = new Set();
    const items = [];
    for (const h of wrongOrFlagged) {
      const k = h.correct.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      items.push({ word: h.correct, def: h.def });
    }

    // Fill to 10 from base round so it still feels like a “round”
    const filled = fillToTenFromBase(items);

    // Start a review run (does not affect roundNumber/attempt)
    flaggedSet = new Set();
    qIndex = 0;
    correct = 0;
    history = [];
    locked = false;

    els.resultCard.classList.add("hidden");
    els.gameCard.classList.remove("hidden");

    stopTimer(); // optional: keep timer OFF for review
    if (els.timer) els.timer.textContent = "OFF";

    buildReviewRoundFromItems(filled);
    render();
  }

  // Review last 50 defs (simple)
  function startReviewLast50() {
    if (!last50.length) return;

    const items = [];
    const seen = new Set();

    // take most recent 50, but cap to 10 questions at a time
    for (let i = last50.length - 1; i >= 0 && items.length < TOTAL; i--) {
      const it = last50[i];
      const k = it.correct.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      items.push({ word: it.correct, def: it.def });
    }

    flaggedSet = new Set();
    qIndex = 0;
    correct = 0;
    history = [];
    locked = false;

    els.resultCard.classList.add("hidden");
    els.gameCard.classList.remove("hidden");

    stopTimer();
    if (els.timer) els.timer.textContent = "OFF";

    buildReviewRoundFromItems(items);
    render();
  }

  // ---------- Wiring ----------
  function wireTimerUI() {
    els.timerBtns.forEach((btn) => {
      btn.addEventListener("click", () => setTimerChoice(btn.dataset.time));
    });

    if (els.timeChoice) {
      els.timeChoice.addEventListener("change", (e) => setTimerChoice(e.target.value));
    }

    // default OFF
    setTimerChoice("off");
  }

  function wireDifficultyButtons() {
    els.mEasy && (els.mEasy.onclick = () => {
      attemptInRound = 1;
      startGame({ selectedMode: "easy", newBaseRound: true });
    });
    els.mMedium && (els.mMedium.onclick = () => {
      attemptInRound = 1;
      startGame({ selectedMode: "medium", newBaseRound: true });
    });
    els.mHard && (els.mHard.onclick = () => {
      attemptInRound = 1;
      startGame({ selectedMode: "hard", newBaseRound: true });
    });
    els.mExtreme && (els.mExtreme.onclick = () => {
      attemptInRound = 1;
      startGame({ selectedMode: "extreme", newBaseRound: true });
    });
  }

  if (els.flagBtn) els.flagBtn.onclick = flagAndSkip;

  // optional skip support
  if (els.skipBtn) els.skipBtn.onclick = skipOnly;

  if (els.retryBtn) {
    els.retryBtn.onclick = () => {
      // Retry keeps same base words/defs, increments attempt only
      attemptInRound += 1;
      startGame({ selectedMode: mode, newBaseRound: false, isRetry: true });
    };
  }

  if (els.nextBtn) {
    els.nextBtn.onclick = () => {
      // Next 10 => new base round, increment round, reset attempt
      roundNumber += 1;
      attemptInRound = 1;
      startGame({ selectedMode: mode, newBaseRound: true });
    };
  }

  if (els.restartBtn) {
    els.restartBtn.onclick = () => {
      if (isBuilding) return;
      stopTimer();
      els.overlay.style.display = "flex";
      els.gameCard.classList.add("hidden");
      els.resultCard.classList.add("hidden");
    };
  }

  // Review buttons (if present)
  if (els.reviewWrongBtn) els.reviewWrongBtn.onclick = startReviewWrongFlaggedLatest;
  if (els.reviewLast50Btn) els.reviewLast50Btn.onclick = startReviewLast50;

  // ---------- Init ----------
  wireTimerUI();
  wireDifficultyButtons();

  els.overlay.style.display = "flex";
  els.gameCard.classList.add("hidden");
  els.resultCard.classList.add("hidden");
});