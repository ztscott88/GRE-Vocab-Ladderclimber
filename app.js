document.addEventListener("DOMContentLoaded", () => {
  const TOTAL_DEFAULT = 10;
  const LETTERS = "abcdefghij".split("");

  const WORDS_RAW = Array.isArray(window.VOCAB_WORDS) ? window.VOCAB_WORDS : [];
  const GRE_DEFS_RAW = window.GRE_DEFS || {};

  // Difficulty = number of choices shown
  const MODE = { easy: 3, medium: 5, hard: 6, extreme: 10 };
  let mode = "medium";

  // DOM
  const $ = (id) => document.getElementById(id);
  const els = {
    overlay: $("difficultyOverlay"),
    game: $("gameCard"),
    results: $("resultCard"),

    roundPill: $("roundPill"),
    qNum: $("qNum"),
    scoreInline: $("scoreInline"),
    timer: $("timer"), // optional; we’ll leave it alone if present

    definition: $("definition"),
    choices: $("choices"),

    flagBtn: $("flagBtn"),

    retryBtn: $("retryBtn"),
    nextBtn: $("nextBtn"),
    reviewWrongBtn: $("reviewWrongBtn"),
    reviewLast50Btn: $("reviewLast50Btn"),
    restartBtn: $("restartBtn"),

    mEasy: $("mEasy"),
    mMedium: $("mMedium"),
    mHard: $("mHard"),
    mExtreme: $("mExtreme"),

    scoreOut: $("scoreOut"),
    totalOut: $("totalOut"),
    pctOut: $("pctOut"),
    recap: $("recap"),
    medalOut: $("medalOut"),
    resultRoundTitle: $("resultRoundTitle"),
  };

  // Normalize word lists to lowercase
  const WORDS = WORDS_RAW.map(w => String(w).trim().toLowerCase()).filter(Boolean);

  // Normalize defs keys to lowercase
  const GRE_DEFS = {};
  for (const k of Object.keys(GRE_DEFS_RAW)) {
    const key = String(k).trim().toLowerCase();
    const val = GRE_DEFS_RAW[k] || {};
    const def = typeof val === "string" ? val : (val.def || "");
    const pos = typeof val === "object" ? (val.pos || "") : "";
    if (key && def) GRE_DEFS[key] = { def: String(def), pos: String(pos || "") };
  }

  // Only allow words that have defs
  const WORDS_WITH_DEFS = WORDS.filter(w => !!GRE_DEFS[w]);

  if (!WORDS_WITH_DEFS.length) {
    console.error("No words with definitions found. Make sure defs.js sets window.GRE_DEFS with lowercase keys and {def,pos} values.");
  }

  // -------------------- STATE --------------------
  let roundNum = 1;
  let tryNum = 1;

  let qIndex = 0;
  let correct = 0;
  let locked = false;

  // current round questions
  let roundWords = [];      // answers (words)
  let round = [];           // built questions
  let history = [];         // {type:'answer'|'flag', ok, word, picked, def, pos}

  // last 50 definitions seen (for review mode)
  let last50 = [];          // {word, def, pos}

  // -------------------- UTILS --------------------
  function fyShuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function medalFor(pct) {
    if (pct >= 90) return "🥇 Gold";
    if (pct >= 75) return "🥈 Silver";
    if (pct >= 60) return "🥉 Bronze";
    return "🏁 Finish";
  }

  function maskDef(def, word) {
    const safe = String(word).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return String(def).replace(new RegExp(`\\b${safe}\\b`, "ig"), "_____");
  }

  function pickNValidWords(n, excludeSet = new Set()) {
    const pool = WORDS_WITH_DEFS.filter(w => !excludeSet.has(w));
    const shuffled = fyShuffle(pool);
    return shuffled.slice(0, n);
  }

  // Build a question for a word (guaranteed def exists)
  function buildQuestion(word) {
    const entry = GRE_DEFS[word];
    const defRaw = entry.def;
    const pos = entry.pos || "";

    // push into last50
    last50.push({ word, def: defRaw, pos });
    if (last50.length > 50) last50.shift();

    // options: correct + distractors
    const choiceCount = MODE[mode] || 5;
    const opts = [word];

    // distractor pool should also only include valid words
    const distractorPool = fyShuffle(WORDS_WITH_DEFS.filter(w => w !== word));
    while (opts.length < choiceCount && distractorPool.length) {
      opts.push(distractorPool.pop());
    }
    fyShuffle(opts);

    return {
      word,
      defRaw,
      pos,
      defQ: maskDef(defRaw, word),
      opts,
      ans: opts.indexOf(word),
    };
  }

  function buildRound(words) {
    // Build questions and shuffle question order (definitions same)
    const questions = words.map(w => buildQuestion(w));
    return fyShuffle(questions);
  }

  function answeredCount() {
    return history.filter(h => h.type === "answer").length;
  }

  function percentScore() {
    const answered = answeredCount();
    if (answered === 0) return 0;
    return Math.round((correct / answered) * 100);
  }

  // -------------------- UI --------------------
  function updateHUD() {
    const totalThis = round.length || 0;
    const asked = Math.min(qIndex + 1, totalThis);

    if (els.roundPill) els.roundPill.textContent = `Round ${roundNum} · Try ${tryNum}`;
    if (els.qNum) els.qNum.textContent = `Question ${asked}/${totalThis}`;

    const answered = answeredCount();
    if (els.scoreInline) els.scoreInline.textContent = `Correct ${correct}/${answered}`;
  }

  function clearChoiceHighlights() {
    // Prevent “previous highlight stays” bug: rebuild buttons fresh each render anyway.
    // This is here as an extra guard if you add CSS active states.
    const btns = els.choices ? els.choices.querySelectorAll("button.choice") : [];
    btns.forEach(b => b.classList.remove("selected"));
  }

  function render() {
    locked = false;
    if (!els.choices || !els.definition) return;

    els.choices.innerHTML = "";
    clearChoiceHighlights();
    updateHUD();

    const q = round[qIndex];
    if (!q) {
      // Defensive: if something went wrong, end gracefully
      showResults();
      return;
    }

    els.definition.textContent = `Definition: ${q.defQ}`;

    q.opts.forEach((opt, i) => {
      const b = document.createElement("button");
      b.className = "choice";
      b.type = "button";
      b.innerHTML = `<b>${LETTERS[i]}.</b> ${opt}`;
      b.addEventListener("click", () => answer(i));
      els.choices.appendChild(b);
    });
  }

  // -------------------- GAME FLOW --------------------
  function answer(i) {
    if (locked) return;
    locked = true;

    const q = round[qIndex];
    const ok = i === q.ans;
    if (ok) correct++;

    history.push({
      type: "answer",
      ok,
      word: q.word,
      picked: q.opts[i],
      def: q.defRaw,
      pos: q.pos,
    });

    next();
  }

  // Single button: flag + skip
  function flagSkip() {
    if (locked) return;
    locked = true;

    const q = round[qIndex];
    history.push({
      type: "flag",
      ok: false,
      word: q.word,
      picked: "(skipped)",
      def: q.defRaw,
      pos: q.pos,
    });

    next();
  }

  function next() {
    if (!els.choices) return;
    els.choices.innerHTML = "";

    qIndex++;
    if (qIndex >= round.length) {
      showResults();
      return;
    }
    setTimeout(render, 90);
  }

  function recapHTML() {
    return history.map((h, idx) => {
      const qn = `Q${idx + 1}.`;
      const pos = h.pos ? ` <span class="muted">(${h.pos})</span>` : "";
      const correctWord = `<span class="ok">${h.word}</span>`;
      const pickedWord = h.ok ? `<span class="ok">${h.picked}</span>` : `<span class="bad">${h.picked}</span>`;
      const mark = h.ok ? `<span class="ok">✔</span>` : `<span class="bad">✖</span>`;

      return `
        <div class="recapItem" style="margin-bottom:12px;">
          <div class="muted" style="font-weight:950;">
            <b>${qn}</b> Definition:${pos}<br>${h.def}
          </div>
          <div style="margin-top:6px;font-weight:950;">
            <b>Correct:</b> ${correctWord}
            &nbsp;|&nbsp;
            <b>You:</b> ${pickedWord}
            &nbsp;${mark}
          </div>
        </div>
      `;
    }).join("");
  }

  function showResults() {
    if (!els.game || !els.results) return;

    els.game.classList.add("hidden");
    els.results.classList.remove("hidden");

    const answered = answeredCount();
    const pct = percentScore();

    if (els.scoreOut) els.scoreOut.textContent = String(correct);
    if (els.totalOut) els.totalOut.textContent = String(answered);
    if (els.pctOut) els.pctOut.textContent = String(pct);

    if (els.medalOut) els.medalOut.textContent = medalFor(pct);
    if (els.resultRoundTitle) els.resultRoundTitle.textContent = `Round ${roundNum} · Try ${tryNum} — Results`;

    if (els.recap) els.recap.innerHTML = recapHTML();

    // Enable/disable review buttons based on THIS try’s results
    const missedWords = getMissedOrFlaggedWords();
    if (els.reviewWrongBtn) {
      els.reviewWrongBtn.disabled = missedWords.length === 0;
      els.reviewWrongBtn.textContent = missedWords.length
        ? `Review wrong + flagged (${missedWords.length})`
        : `Review wrong + flagged (none)`;
    }

    if (els.reviewLast50Btn) {
      const n = Math.min(50, last50.length);
      els.reviewLast50Btn.disabled = n < 10; // don’t show too early
      els.reviewLast50Btn.textContent = `Review last ${n}`;
    }
  }

  function getMissedOrFlaggedWords() {
    const missed = history
      .filter(h => (h.type === "answer" && !h.ok) || h.type === "flag")
      .map(h => h.word);
    // unique
    return [...new Set(missed)];
  }

  // -------------------- START MODES --------------------
  function startNewRound(selectedMode) {
    mode = selectedMode || mode;
    tryNum = 1;

    // Always 10 valid questions
    roundWords = pickNValidWords(TOTAL_DEFAULT);
    startFromWords(roundWords, true);
  }

  function startFromWords(words, isNewTry) {
    if (!words || !words.length) {
      console.error("No words to start round.");
      return;
    }

    if (isNewTry) {
      qIndex = 0;
      correct = 0;
      history = [];
    } else {
      // still new attempt, reset counters
      qIndex = 0;
      correct = 0;
      history = [];
    }

    // Build round from these words
    round = buildRound(words);

    // show game
    if (els.overlay) els.overlay.style.display = "none";
    if (els.results) els.results.classList.add("hidden");
    if (els.game) els.game.classList.remove("hidden");

    render();
  }

  function retrySameDefinitions() {
    if (!roundWords.length) return;
    tryNum++;
    // same answers, new option order/distractors is okay because we rebuild
    startFromWords(roundWords, false);
  }

  function nextTen() {
    roundNum++;
    tryNum = 1;
    roundWords = pickNValidWords(TOTAL_DEFAULT);
    startFromWords(roundWords, true);
  }

  function reviewWrongFlagged() {
    const missed = getMissedOrFlaggedWords();
    if (!missed.length) return;

    tryNum++;

    // IMPORTANT: In review mode, ONLY review missed/flagged.
    // Round length becomes N (not forced to 10). That’s what you wanted.
    roundWords = missed;
    startFromWords(roundWords, false);
  }

  function reviewLast50() {
    if (!els.results || !els.recap) return;

    els.game.classList.add("hidden");
    els.results.classList.remove("hidden");

    const list = [...last50].slice(-50).reverse();
    const n = list.length;

    if (els.resultRoundTitle) els.resultRoundTitle.textContent = `Review last ${n} definitions`;
    if (els.scoreOut) els.scoreOut.textContent = "—";
    if (els.totalOut) els.totalOut.textContent = "—";
    if (els.pctOut) els.pctOut.textContent = "—";
    if (els.medalOut) els.medalOut.textContent = "📚 Review";

    els.recap.innerHTML = list.map((x, i) => {
      const pos = x.pos ? ` <span class="muted">(${x.pos})</span>` : "";
      return `
        <div class="recapItem" style="margin-bottom:12px;">
          <div style="font-weight:950;">${i + 1}. <span class="ok">${x.word}</span>${pos}</div>
          <div class="muted" style="margin-top:4px;">${x.def}</div>
        </div>
      `;
    }).join("");
  }

  // -------------------- WIRE BUTTONS --------------------
  if (els.flagBtn) els.flagBtn.addEventListener("click", flagSkip);

  if (els.retryBtn) els.retryBtn.addEventListener("click", retrySameDefinitions);
  if (els.nextBtn) els.nextBtn.addEventListener("click", nextTen);
  if (els.reviewWrongBtn) els.reviewWrongBtn.addEventListener("click", reviewWrongFlagged);
  if (els.reviewLast50Btn) els.reviewLast50Btn.addEventListener("click", reviewLast50);

  if (els.restartBtn) {
    els.restartBtn.addEventListener("click", () => {
      if (els.overlay) els.overlay.style.display = "flex";
      if (els.game) els.game.classList.add("hidden");
      if (els.results) els.results.classList.add("hidden");
    });
  }

  if (els.mEasy) els.mEasy.addEventListener("click", () => startNewRound("easy"));
  if (els.mMedium) els.mMedium.addEventListener("click", () => startNewRound("medium"));
  if (els.mHard) els.mHard.addEventListener("click", () => startNewRound("hard"));
  if (els.mExtreme) els.mExtreme.addEventListener("click", () => startNewRound("extreme"));

  // -------------------- INIT --------------------
  if (els.overlay) els.overlay.style.display = "flex";
  if (els.game) els.game.classList.add("hidden");
  if (els.results) els.results.classList.add("hidden");

  // Optional: show OFF if timer exists
  if (els.timer) els.timer.textContent = "OFF";
});

