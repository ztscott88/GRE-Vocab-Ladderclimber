// app.js — single lifeline (flag autoskips), review wrong+flagged only, last50 locked until 50

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
    skipBtn: document.getElementById("skipBtn"), // will be hidden/disabled

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
    reviewWrongBtn: document.getElementById("reviewWrongBtn"),
    reviewLast50Btn: document.getElementById("reviewLast50Btn"),
    restartBtn: document.getElementById("restartBtn"),
  };

  if (!els.overlay || !els.gameCard || !els.resultCard || !els.definition || !els.choices) {
    console.error("Missing required DOM elements. Check index.html IDs.");
    return;
  }

  // -------- helpers --------
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

  function medalForPct(pct) {
    if (pct >= 90) return "🥇 Gold medal";
    if (pct >= 70) return "🥈 Silver medal";
    if (pct >= 50) return "🥉 Bronze medal";
    return "🏁 Finish";
  }

  function show(el) { el && el.classList.remove("hidden"); }
  function hide(el) { el && el.classList.add("hidden"); }

  // -------- state --------
  let mode = "medium";
  let roundNumber = 1;
  let attemptNumber = 1;

  // timer
  let timeLimit = 0; // 0=OFF
  let timeLeft = 0;
  let timerId = null;

  // base round fixed across retries
  let baseWords = null;
  let baseDefs = null;

  // gameplay
  let qIndex = 0;
  let correct = 0;
  let locked = false;
  let isBuilding = false;

  let round = [];      // active questions
  let history = [];    // active history
  let flaggedSet = new Set();

  // track last attempt for round (only need latest attempt!)
  // latestAttempt = { history, baseWords, baseDefs, attemptNumber, roundNumber }
  let latestAttempt = null;

  // last 50 (all asked definitions, not just wrong)
  const last50 = []; // {word, def}

  // REVIEW MODE flag
  let inReviewMode = false;

  // -------- timer --------
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
      els.timer.textContent = "OFF";
      return;
    }
    timeLeft = timeLimit;
    els.timer.textContent = `${timeLeft}s`;
    timerId = setInterval(() => {
      timeLeft--;
      els.timer.textContent = `${Math.max(0, timeLeft)}s`;
      if (timeLeft <= 0) {
        stopTimer();
        endGameDueToTime();
      }
    }, 1000);
  }

  function setTimerChoice(val) {
    const v = String(val);
    timeLimit = v === "off" ? 0 : Math.max(0, parseInt(v, 10) || 0);

    // sync dropdown
    els.timeChoice.value = timeLimit <= 0 ? "off" : String(timeLimit);

    // sync buttons
    els.timerBtns.forEach((b) => b.classList.remove("timerSelected"));
    const key = timeLimit <= 0 ? "off" : String(timeLimit);
    const match = els.timerBtns.find((b) => String(b.dataset.time) === key);
    if (match) match.classList.add("timerSelected");
  }

  // -------- race --------
  function updateRaceProgress(answeredCount, totalCount) {
    if (!els.skier || !els.raceTrack) return;

    const min = 10;
    const max = els.raceTrack.clientWidth - 10;
    const pct = Math.max(0, Math.min(1, answeredCount / Math.max(1, totalCount)));
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
    const total = round.length || TOTAL;
    const asked = Math.min(qIndex + 1, total);
    const answered = history.length;

    // In review mode we show "Review x/y"
    if (inReviewMode) {
      els.roundPill.textContent = `Review mode`;
      els.qNum.textContent = `Question ${asked}/${total}`;
    } else {
      els.roundPill.textContent = `Round ${roundNumber} · Try ${attemptNumber}`;
      els.qNum.textContent = `Question ${asked}/${total}`;
    }

    els.scoreInline.textContent = `Correct ${correct}/${answered || 0}`;
    els.timer.textContent = (!inReviewMode && timeLimit > 0) ? `${timeLeft}s` : "OFF";

    updateRaceProgress(qIndex, total);
  }

  // -------- build rounds --------
  function buildOptionsForWord(correctWord, pool, count) {
    const opts = [correctWord];
    const distractors = shuffle(pool.filter((w) => w !== correctWord));
    while (opts.length < count && distractors.length) opts.push(distractors.pop());
    return shuffle(opts);
  }

  async function buildBaseRoundNew() {
    const pool = uniqWords(WORDS);
    shuffle(pool);
    baseWords = pool.slice(0, TOTAL);
    baseDefs = await Promise.all(baseWords.map((w) => fetchDef(w)));
  }

  function buildPlayableRoundFromBase() {
    const pool = uniqWords(WORDS);
    const order = shuffle([...Array(TOTAL).keys()]);
    round = order.map((idx) => {
      const word = baseWords[idx];
      const def = baseDefs[idx] || "Definition unavailable.";
      const opts = buildOptionsForWord(word, pool, MODE[mode]);
      return { word, def, opts, ans: opts.indexOf(word) };
    });
  }

  function buildReviewRoundFromItems(items) {
    const pool = uniqWords(WORDS);
    const chosen = items.slice(0, items.length); // DO NOT force 10
    const order = shuffle([...Array(chosen.length).keys()]);
    round = order.map((i) => {
      const item = chosen[i];
      const opts = buildOptionsForWord(item.word, pool, MODE[mode]);
      return { word: item.word, def: item.def, opts, ans: opts.indexOf(item.word) };
    });
  }

  // -------- rendering --------
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
    });

    // last50 should track ALL asked items (not only wrong)
    last50.push({ word: q.word, def: q.def });
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

    if (qIndex >= round.length) {
      stopTimer();
      showResults(false);
      return;
    }
    setTimeout(render, 110);
  }

  // SINGLE LIFELINE: flag auto-skips (no separate Skip logic)
  function flagAndSkip() {
    if (locked) return;
    locked = true;

    const q = round[qIndex];
    flaggedSet.add(qIndex);

    pushHistory(q, "(flagged)", false, { flagged: true });

    els.choices.innerHTML = "";
    qIndex++;

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

  function saveLatestAttempt() {
    // Save only for NORMAL rounds, not review mode
    if (inReviewMode) return;

    latestAttempt = {
      roundNumber,
      attemptNumber,
      history: [...history],
      baseWords: baseWords ? [...baseWords] : null,
      baseDefs: baseDefs ? [...baseDefs] : null,
    };
  }

  function showResults(endedByTime) {
    stopTimer();

    // Save attempt so review uses latest attempt
    saveLatestAttempt();

    hide(els.gameCard);
    show(els.resultCard);

    const total = round.length || TOTAL;
    const pct = total ? Math.round((correct / total) * 100) : 0;

    els.totalOut.textContent = String(total);
    els.scoreOut.textContent = String(correct);
    els.pctOut.textContent = String(pct);

    els.resultRoundTitle.textContent = inReviewMode
      ? `Review complete`
      : (endedByTime
        ? `Round ${roundNumber} · Try ${attemptNumber} (Time’s up)`
        : `Round ${roundNumber} · Try ${attemptNumber} complete`);

    els.medalOut.textContent = inReviewMode ? "" : medalForPct(pct);

    els.roundsHistory.textContent = (!inReviewMode && latestAttempt)
      ? `Latest attempt: Round ${latestAttempt.roundNumber} Try ${latestAttempt.attemptNumber}`
      : "";

    // Review button visibility rules
    // - Review wrong+flagged always available after a normal attempt
    if (!inReviewMode) els.reviewWrongBtn.classList.remove("hidden");

    // - Review last50 only when we truly have 50 items
    if (!inReviewMode && last50.length >= 50) els.reviewLast50Btn.classList.remove("hidden");
    else els.reviewLast50Btn.classList.add("hidden");

    // Recap
    const header = endedByTime
      ? `<div style="margin:10px 0; font-weight:900;">Time’s up! Here’s your recap:</div>`
      : `<div style="margin:10px 0; font-weight:900;">Recap:</div>`;

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

    els.recap.innerHTML = header + items.join("");

    // In review mode, hide retry/next (review should not create loops)
    if (inReviewMode) {
      els.retryBtn.classList.add("hidden");
      els.nextBtn.classList.add("hidden");
    } else {
      els.retryBtn.classList.remove("hidden");
      els.nextBtn.classList.remove("hidden");
    }
  }

  // -------- start modes --------
  async function startNormalGame({ selectedMode, newBaseRound } = {}) {
    if (isBuilding) return;
    isBuilding = true;
    inReviewMode = false;

    if (selectedMode) mode = selectedMode;

    flaggedSet = new Set();
    qIndex = 0;
    correct = 0;
    history = [];
    locked = false;

    hide(els.resultCard);
    show(els.gameCard);

    els.definition.textContent = "Definition: Loading…";
    els.choices.innerHTML = "";
    updateRaceProgress(0, TOTAL);

    try {
      if (newBaseRound || !baseWords || !baseDefs) {
        await buildBaseRoundNew();
      }
      buildPlayableRoundFromBase();
    } finally {
      isBuilding = false;
    }

    startTimer();
    render();
  }

  function startReviewWrongFlaggedLatest() {
    if (!latestAttempt || !latestAttempt.history || !latestAttempt.history.length) return;

    // Build review list ONLY from wrong or flagged in latest attempt
    const bad = latestAttempt.history.filter((h) => !h.ok || h.flagged);

    // If none missed, do nothing (or you can show a message later)
    if (!bad.length) {
      els.recap.innerHTML = `<div style="font-weight:900;margin:6px 0;">Nothing to review — you got them all.</div>` + els.recap.innerHTML;
      return;
    }

    // Unique by correct word
    const seen = new Set();
    const items = [];
    for (const h of bad) {
      const k = h.correct.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      items.push({ word: h.correct, def: h.def });
    }

    // Review should be ONLY this fraction (no fill to 10)
    inReviewMode = true;

    // Review run: no timer
    stopTimer();
    els.timer.textContent = "OFF";

    flaggedSet = new Set();
    qIndex = 0;
    correct = 0;
    history = [];
    locked = false;

    hide(els.resultCard);
    show(els.gameCard);

    buildReviewRoundFromItems(items);
    updateRaceProgress(0, round.length);
    render();
  }

  function startReviewLast50() {
    if (last50.length < 50) return;

    // Review last 50 in sets of 10 (most recent 10 first)
    // For now: show the most recent 10 unique words from the last50 list
    const items = [];
    const seen = new Set();
    for (let i = last50.length - 1; i >= 0 && items.length < 10; i--) {
      const it = last50[i];
      const k = it.word.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      items.push({ word: it.word, def: it.def });
    }

    inReviewMode = true;
    stopTimer();
    els.timer.textContent = "OFF";

    flaggedSet = new Set();
    qIndex = 0;
    correct = 0;
    history = [];
    locked = false;

    hide(els.resultCard);
    show(els.gameCard);

    buildReviewRoundFromItems(items);
    updateRaceProgress(0, round.length);
    render();
  }

  // -------- wiring --------
  function wireTimerUI() {
    els.timerBtns.forEach((btn) => {
      btn.addEventListener("click", () => setTimerChoice(btn.dataset.time));
    });
    els.timeChoice.addEventListener("change", (e) => setTimerChoice(e.target.value));
    setTimerChoice("off");
  }

  function wireDifficultyButtons() {
    els.mEasy.onclick = () => { attemptNumber = 1; startNormalGame({ selectedMode: "easy", newBaseRound: true }); els.overlay.style.display = "none"; };
    els.mMedium.onclick = () => { attemptNumber = 1; startNormalGame({ selectedMode: "medium", newBaseRound: true }); els.overlay.style.display = "none"; };
    els.mHard.onclick = () => { attemptNumber = 1; startNormalGame({ selectedMode: "hard", newBaseRound: true }); els.overlay.style.display = "none"; };
    els.mExtreme.onclick = () => { attemptNumber = 1; startNormalGame({ selectedMode: "extreme", newBaseRound: true }); els.overlay.style.display = "none"; };
  }

  // SINGLE OPTION: hide skip button
  if (els.skipBtn) els.skipBtn.classList.add("hidden");

  els.flagBtn.onclick = flagAndSkip;

  els.retryBtn.onclick = () => {
    // Retry = same base words/defs, attempt++
    attemptNumber += 1;
    startNormalGame({ selectedMode: mode, newBaseRound: false });
  };

  els.nextBtn.onclick = () => {
    // Next 10 = new words/defs, round++, attempt reset
    roundNumber += 1;
    attemptNumber = 1;
    startNormalGame({ selectedMode: mode, newBaseRound: true });
  };

  els.reviewWrongBtn.onclick = startReviewWrongFlaggedLatest;
  els.reviewLast50Btn.onclick = startReviewLast50;

  els.restartBtn.onclick = () => {
    if (isBuilding) return;
    stopTimer();
    els.overlay.style.display = "flex";
    hide(els.gameCard);
    hide(els.resultCard);
  };

  // -------- init --------
  wireTimerUI();
  wireDifficultyButtons();

  els.overlay.style.display = "flex";
  hide(els.gameCard);
  hide(els.resultCard);

  // hide review buttons until earned
  els.reviewWrongBtn.classList.add("hidden");
  els.reviewLast50Btn.classList.add("hidden");

  if (!WORDS.length) console.warn("VOCAB_WORDS is empty. Check words.js is loading before app.js.");
});
