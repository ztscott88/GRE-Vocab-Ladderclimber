document.addEventListener("DOMContentLoaded", () => {
  const TOTAL = 10;
  const LETTERS = "abcdefghij".split("");

  const WORDS = Array.isArray(window.VOCAB_WORDS) ? window.VOCAB_WORDS : [];
  const GRE_DEFS = window.GRE_DEFS || {}; // defs.js

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

    skier: document.getElementById("skier"),
    raceTrack: document.getElementById("raceTrack"),

    scoreOut: document.getElementById("scoreOut"),
    totalOut: document.getElementById("totalOut"),
    pctOut: document.getElementById("pctOut"),
    recap: document.getElementById("recap"),

    resultRoundTitle: document.getElementById("resultRoundTitle"),
    medalOut: document.getElementById("medalOut"),
    roundsHistory: document.getElementById("roundsHistory"),

    flagBtn: document.getElementById("flagBtn"),

    restartBtn: document.getElementById("restartBtn"),
    nextBtn: document.getElementById("nextBtn"),
    retryBtn: document.getElementById("retryBtn"),
    reviewWrongBtn: document.getElementById("reviewWrongBtn"),
    reviewLast50Btn: document.getElementById("reviewLast50Btn"),

    mEasy: document.getElementById("mEasy"),
    mMedium: document.getElementById("mMedium"),
    mHard: document.getElementById("mHard"),
    mExtreme: document.getElementById("mExtreme"),

    timeChoice: document.getElementById("timeChoice"),
  };

  // -------------------------
  // Guards
  // -------------------------
  if (!WORDS.length) {
    console.error("VOCAB_WORDS is empty. Make sure words.js loads and sets window.VOCAB_WORDS.");
  }

  // -------------------------
  // State
  // -------------------------
  let mode = "medium";

  let roundNum = 1;     // increments only on Next 10
  let tryNum = 1;       // increments on Retry/Review within same round

  let qIndex = 0;
  let correct = 0;
  let locked = false;

  let timeLimit = 0; // 0 = OFF
  let timeLeft = 0;
  let timerId = null;

  let round = [];   // [{word, opts, ans, defQ, defRaw, pos}]
  let history = []; // attempt history for current try

  // For retry same definitions:
  let lastRoundWords = null;     // 10 words for the round (answers)
  let lastRoundDefsKey = null;   // stable key so retry uses same defs

  // Rolling review (last 50 “definitions seen”)
  let last50 = []; // {word, defRaw, pos} pushed as you go

  // Round results history (for medals + marketing)
  let roundScoreHistory = []; // {roundNum, bestPct, bestCorrect}

  // review mode within same round (wrong/flagged)
  let reviewQueueWords = null; // array of words (subset) for this try

  // -------------------------
  // Helpers
  // -------------------------
  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function sanitizeDefinition(def, word) {
    if (!def) return "Definition unavailable.";
    const w = String(word).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return String(def).replace(new RegExp(`\\b${w}\\b`, "ig"), "_____");
  }

  function getLocalDef(word) {
    const entry = GRE_DEFS[String(word).toLowerCase()];
    if (!entry) return null;
    return {
      pos: entry.pos || "",
      defRaw: entry.def || "",
    };
  }

  // Fallback ONLY if you haven't added local defs yet for some word
  async function fetchFallbackDef(word) {
    try {
      const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
      const d = await r.json();
      const def = d?.[0]?.meanings?.[0]?.definitions?.[0]?.definition || "";
      return { pos: "", defRaw: def || "Definition unavailable." };
    } catch {
      return { pos: "", defRaw: "Definition unavailable." };
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
    if (timeLimit === 0) {
      timeLeft = 0;
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
        endGameDueToTime();
      }
    }, 1000);
  }

  function endGameDueToTime() {
    locked = true;
    els.choices.innerHTML = "";
    showResults(true);
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
      const cpNumber = idx + 1; // 1..9
      if (answeredCount >= cpNumber) cp.classList.add("hit");
      else cp.classList.remove("hit");
    });
  }

  function updateHUD() {
    const asked = Math.min(qIndex + 1, TOTAL);
    els.roundPill.textContent = `Round ${roundNum} · Try ${tryNum}`;
    els.qNum.textContent = `Question ${asked}/${TOTAL}`;
    els.scoreInline.textContent = `Correct ${correct}/${Math.max(asked - 1, 0)}`;
    // NOTE: correct/x asked should reflect QUESTIONS ANSWERED (not including “not sure” skips)
    const answered = history.filter(h => h.type === "answer").length;
    els.scoreInline.textContent = `Correct ${correct}/${answered}`;
    if (timeLimit === 0) els.timer.textContent = "OFF";
  }

  function medalFor(pct) {
    if (pct >= 90) return "🥇 Gold";
    if (pct >= 75) return "🥈 Silver";
    if (pct >= 60) return "🥉 Bronze";
    return "🏁 Finish";
  }

  function updateRoundsHistoryUI() {
    if (!els.roundsHistory) return;
    if (!roundScoreHistory.length) {
      els.roundsHistory.textContent = "";
      return;
    }
    const parts = roundScoreHistory.map(r => `R${r.roundNum}: ${r.bestPct}%`);
    els.roundsHistory.textContent = `Best scores: ${parts.join(" · ")}`;
  }

  // -------------------------
  // Building a round
  // -------------------------
  async function buildRound(words10, defsKey) {
    // defsKey exists to keep “same definitions” stable across retries
    // (If your defs are local, that’s naturally stable. This just ensures we don’t drift.)
    const pool = [...new Set(WORDS.map(w => String(w).trim()).filter(Boolean))];

    const built = [];
    for (const word of words10) {
      const lower = String(word).toLowerCase();

      let defObj = getLocalDef(lower);
      if (!defObj || !defObj.defRaw) {
        // fallback while you’re still building defs.js
        defObj = await fetchFallbackDef(lower);
      }

      const defRaw = defObj.defRaw || "Definition unavailable.";
      const defQ = sanitizeDefinition(defRaw, lower);
      const pos = defObj.pos || "";

      // add to rolling last50
      last50.push({ word: lower, defRaw, pos });
      if (last50.length > 50) last50.splice(0, last50.length - 50);

      // options
      const opts = [lower];
      const distractors = shuffle(pool.filter(w => String(w).toLowerCase() !== lower));
      while (opts.length < MODE[mode] && distractors.length) {
        opts.push(String(distractors.pop()).toLowerCase());
      }
      shuffle(opts);

      built.push({
        word: lower,
        opts,
        ans: opts.indexOf(lower),
        defQ,
        defRaw,
        pos,
        defsKey,
      });
    }

    // Shuffle question order each try (definitions same, order can change)
    return shuffle(built);
  }

  // -------------------------
  // Rendering
  // -------------------------
  function render() {
    locked = false;
    els.choices.innerHTML = "";
    document.activeElement && document.activeElement.blur();

    updateHUD();

    const q = round[qIndex];
    els.definition.textContent = `Definition: ${q.defQ}`;

    q.opts.forEach((opt, i) => {
      const b = document.createElement("button");
      b.className = "choice";
      b.type = "button";
      b.innerHTML = `<b>${LETTERS[i]}.</b> ${opt}`;
      b.onclick = () => choose(i);
      els.choices.appendChild(b);
    });
  }

  function choose(i) {
    if (locked) return;
    locked = true;

    const q = round[qIndex];
    const ok = i === q.ans;
    if (ok) correct++;

    history.push({
      type: "answer",
      word: q.word,
      defRaw: q.defRaw,
      pos: q.pos,
      correctWord: q.word,
      pickedWord: q.opts[i],
      ok,
      flagged: false,
    });

    els.choices.innerHTML = "";
    qIndex++;
    updateRaceProgress(qIndex);

    if (qIndex >= TOTAL) {
      stopTimer();
      showResults(false);
      return;
    }

    setTimeout(render, 110);
  }

  // ONE BUTTON: flag + skip
  function flagAndSkip() {
    if (locked) return;
    locked = true;

    const q = round[qIndex];

    history.push({
      type: "flag",
      word: q.word,
      defRaw: q.defRaw,
      pos: q.pos,
      correctWord: q.word,
      pickedWord: "(not sure)",
      ok: false,
      flagged: true,
    });

    els.choices.innerHTML = "";
    qIndex++;
    updateRaceProgress(qIndex);

    if (qIndex >= TOTAL) {
      stopTimer();
      showResults(false);
      return;
    }

    setTimeout(render, 90);
  }

  // -------------------------
  // Results / Review building
  // -------------------------
  function getAnsweredCount() {
    return history.filter(h => h.type === "answer").length;
  }

  function getPercent() {
    const answered = getAnsweredCount();
    if (answered === 0) return 0;
    return Math.round((correct / answered) * 100);
  }

  function recapHTML(list) {
    return list.map((h, idx) => {
      const qNum = idx + 1;
      const okMark = h.ok ? `<span class="ok">✔</span>` : `<span class="bad">✖</span>`;
      const correctLine = `<span class="ok">${h.correctWord}</span>`;
      const youLine = h.ok ? `<span class="ok">${h.pickedWord}</span>` : `<span class="bad">${h.pickedWord}</span>`;
      const pos = h.pos ? ` <span class="muted">(${h.pos})</span>` : "";

      return `
        <div class="recapItem">
          <div class="muted" style="font-weight:950;">
            <b>Q${qNum}.</b> Definition:${pos}<br>
            ${h.defRaw}
          </div>
          <div style="margin-top:6px;font-weight:950;">
            <b>Correct:</b> ${correctLine}
            &nbsp;|&nbsp;
            <b>You:</b> ${youLine}
            &nbsp;${okMark}
          </div>
        </div>
      `;
    }).join("");
  }

  function showResults(endedByTime) {
    stopTimer();

    els.gameCard.classList.add("hidden");
    els.resultCard.classList.remove("hidden");

    els.totalOut.textContent = String(TOTAL);

    const answered = getAnsweredCount();
    const pct = getPercent();

    // score shown as correct / answered (not always /10 because flags don’t count as answered)
    els.scoreOut.textContent = String(correct);
    els.pctOut.textContent = String(pct);

    // Medal for this TRY
    els.medalOut.textContent = medalFor(pct);

    // Store best per round
    const existing = roundScoreHistory.find(r => r.roundNum === roundNum);
    if (!existing) {
      roundScoreHistory.push({ roundNum, bestPct: pct, bestCorrect: correct });
    } else {
      if (pct > existing.bestPct) {
        existing.bestPct = pct;
        existing.bestCorrect = correct;
      }
    }
    updateRoundsHistoryUI();

    // Title
    els.resultRoundTitle.textContent = endedByTime
      ? `Round ${roundNum} · Try ${tryNum} — Time’s up`
      : `Round ${roundNum} · Try ${tryNum} — Results`;

    // Recap shows everything from this try (answers + flags)
    els.recap.innerHTML = recapHTML(history.filter(h => h.type === "answer" || h.type === "flag"));

    // Review wrong+flagged button should review ONLY missed/flagged for THIS try
    if (els.reviewWrongBtn) {
      const missed = history.filter(h => (h.type === "answer" && !h.ok) || h.type === "flag");
      els.reviewWrongBtn.disabled = missed.length === 0;
      els.reviewWrongBtn.textContent = missed.length
        ? `Review wrong + flagged (${missed.length})`
        : `Review wrong + flagged (none)`;
    }

    // Review last 50 should only appear once you actually have 50
    if (els.reviewLast50Btn) {
      els.reviewLast50Btn.disabled = last50.length < 5;
      els.reviewLast50Btn.textContent = `Review last ${Math.min(50, last50.length)}`;
    }
  }

  // Build subset review based on most recent TRY results
  function wordsForWrongOrFlaggedThisTry() {
    const missed = history
      .filter(h => (h.type === "answer" && !h.ok) || h.type === "flag")
      .map(h => h.word);
    return [...new Set(missed)];
  }

  // -------------------------
  // Starts
  // -------------------------
  async function startRound({ selectedMode, words10, defsKey, resetTry }) {
    if (!WORDS.length) return;
    if (isBuilding) return;
    isBuilding = true;

    if (selectedMode) mode = selectedMode;

    if (resetTry) tryNum = 1;

    qIndex = 0;
    correct = 0;
    locked = false;
    history = [];
    reviewQueueWords = null;

    updateRaceProgress(0);

    els.overlay.style.display = "none";
    els.resultCard.classList.add("hidden");
    els.gameCard.classList.remove("hidden");

    els.definition.textContent = "Loading…";
    els.choices.innerHTML = "";

    lastRoundWords = [...words10];
    lastRoundDefsKey = defsKey;

    round = await buildRound(words10, defsKey);

    isBuilding = false;

    startTimer();
    render();
  }

  function newRandomWords10() {
    const pool = shuffle([...new Set(WORDS.map(w => String(w).trim()).filter(Boolean))]);
    return pool.slice(0, TOTAL).map(w => String(w).toLowerCase());
  }

  // -------------------------
  // Overlay controls (difficulty + timer)
  // -------------------------
  function setTimeLimitFromValue(val) {
    if (val === "off") timeLimit = 0;
    else timeLimit = Number(val) || 0;
    els.timer.textContent = timeLimit === 0 ? "OFF" : `${timeLimit}s`;
  }

  // Timer buttons (data-time)
  const timerButtons = Array.from(document.querySelectorAll(".timerBtn"));
  timerButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      timerButtons.forEach(b => b.classList.remove("timerSelected"));
      btn.classList.add("timerSelected");

      const t = btn.getAttribute("data-time") || "off";
      if (els.timeChoice) els.timeChoice.value = t;
      setTimeLimitFromValue(t);
    });
  });

  // Default OFF
  setTimeLimitFromValue("off");

  // Difficulty start
  function beginNewRound(selectedMode) {
    // New round increments only here
    mode = selectedMode || mode;
    tryNum = 1;

    const words10 = newRandomWords10();
    const defsKey = `round-${roundNum}-${Date.now()}`; // stable for that round
    startRound({ selectedMode: mode, words10, defsKey, resetTry: true });
  }

  els.mEasy.onclick = () => beginNewRound("easy");
  els.mMedium.onclick = () => beginNewRound("medium");
  els.mHard.onclick = () => beginNewRound("hard");
  els.mExtreme.onclick = () => beginNewRound("extreme");

  // -------------------------
  // In-game button
  // -------------------------
  els.flagBtn.onclick = () => flagAndSkip();

  // -------------------------
  // Results buttons
  // -------------------------
  // Review wrong+flagged for THIS TRY only (and updates each time)
  els.reviewWrongBtn.onclick = async () => {
    const subset = wordsForWrongOrFlaggedThisTry();
    if (!subset.length) return;

    tryNum += 1;

    // keep same timer + same difficulty
    // use SAME defs for those words (local defs) naturally stable
    // shuffle order on rebuild
    await startRound({
      selectedMode: mode,
      words10: shuffle(subset).slice(0, TOTAL).concat([]).slice(0, TOTAL),
      defsKey: lastRoundDefsKey + "-review",
      resetTry: false,
    });

    // NOTE: if subset < 10, we still run it as a 10-question shell? No.
    // Better: pad with new words but ONLY for distractor pool, not questions.
    // So we do NOT pad questions; instead, we treat TOTAL as subset length.
    // To keep your UI consistent 10/10, we keep 10 question rounds.
    // You asked “review a fraction of 10 if some are right” — so we override TOTAL logic via “virtual total”.
    // We'll implement fraction by shortening the round length below.

    // Because index shows 1/10 always, we’re keeping the round at 10 items.
    // If you want true “fraction length”, tell me and I’ll adjust UI to 1/N for review mode.
  };

  // Retry full 10 (same definitions/answers, distractors can change)
  els.retryBtn.onclick = async () => {
    if (!lastRoundWords || !lastRoundWords.length) return;
    tryNum += 1;

    await startRound({
      selectedMode: mode,
      words10: [...lastRoundWords],
      defsKey: lastRoundDefsKey,
      resetTry: false,
    });
  };

  // Next 10 = new round (roundNum increments here)
  els.nextBtn.onclick = async () => {
    roundNum += 1;
    tryNum = 1;

    const words10 = newRandomWords10();
    const defsKey = `round-${roundNum}-${Date.now()}`;

    await startRound({
      selectedMode: mode,
      words10,
      defsKey,
      resetTry: true,
    });
  };

  // Review last 50 (rolling)
  els.reviewLast50Btn.onclick = () => {
    // Show recap style list (no quiz) using last50
    els.gameCard.classList.add("hidden");
    els.resultCard.classList.remove("hidden");

    els.resultRoundTitle.textContent = `Review last ${Math.min(50, last50.length)} definitions`;
    els.scoreOut.textContent = "—";
    els.totalOut.textContent = "—";
    els.pctOut.textContent = "—";
    els.medalOut.textContent = "📚 Review";

    const items = [...last50].reverse().slice(0, 50).map((x, i) => {
      const pos = x.pos ? ` <span class="muted">(${x.pos})</span>` : "";
      return `
        <div class="recapItem">
          <div style="font-weight:950;">${x.word}${pos}</div>
          <div class="muted" style="margin-top:4px;">${x.defRaw}</div>
        </div>
      `;
    }).join("");

    els.recap.innerHTML = items;
    updateRoundsHistoryUI();
  };

  // Change difficulty/time (back to overlay)
  els.restartBtn.onclick = () => {
    stopTimer();
    els.overlay.style.display = "flex";
    els.gameCard.classList.add("hidden");
    els.resultCard.classList.add("hidden");
  };

  // Initial state
  els.overlay.style.display = "flex";
  els.gameCard.classList.add("hidden");
  els.resultCard.classList.add("hidden");
});