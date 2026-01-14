document.addEventListener("DOMContentLoaded", () => {

  const DEFAULT_TOTAL = 10;
  const MISSED_UNLOCK_ROUNDS = 5;   // after 5 plays
  const MISSED_REVIEW_TOTAL = 50;   // 50 words/definitions

  const LETTERS = "abcdefghij".split("");
  const WORDS = Array.isArray(window.VOCAB_WORDS) ? window.VOCAB_WORDS : [];

  const MODE = { easy:3, medium:5, hard:6, extreme:10 };

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

    restartBtn: document.getElementById("restartBtn"),
    nextBtn: document.getElementById("nextBtn"),
    retryBtn: document.getElementById("retryBtn"),
    missedBtn: document.getElementById("missedBtn"),

    mEasy: document.getElementById("mEasy"),
    mMedium: document.getElementById("mMedium"),
    mHard: document.getElementById("mHard"),
    mExtreme: document.getElementById("mExtreme"),

    timeChoice: document.getElementById("timeChoice"),
  };

  // ---------------- State ----------------
  let mode = "medium";
  let total = DEFAULT_TOTAL;

  let qIndex = 0;
  let correct = 0;
  let locked = false;

  let round = [];
  let history = [];
  let isBuilding = false;

  // Retry support
  let lastRoundWords = null;
  let lastRoundMode = "medium";
  let lastRoundTotal = DEFAULT_TOTAL;

  // Timer
  let timerEnabled = false;
  let timeLimit = 60;
  let timeLeft = 60;
  let timerId = null;

  // Missed system
  let roundsPlayedSinceMissedReset = 0;
  const missedSet = new Set();              // unique missed words
  const defCache = new Map();               // word -> definition (sanitized)

  // ---------------- Helpers ----------------
  function shuffle(a){
    for(let i=a.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [a[i],a[j]]=[a[j],a[i]];
    }
    return a;
  }

  function sanitize(def, word){
    if(!def) return "Definition unavailable.";
    return String(def).replace(new RegExp(`\\b${word}\\b`, "ig"), "_____");
  }

  async function fetchDef(word){
    if (defCache.has(word)) return defCache.get(word);

    try{
      const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
      const d = await r.json();
      const cleaned = sanitize(d?.[0]?.meanings?.[0]?.definitions?.[0]?.definition, word);
      defCache.set(word, cleaned);
      return cleaned;
    }catch{
      const fallback = "Definition unavailable.";
      defCache.set(word, fallback);
      return fallback;
    }
  }

  // ---------------- Timer ----------------
  function stopTimer(){
    if (timerId) { clearInterval(timerId); timerId = null; }
  }

  function startTimer(){
    stopTimer();

    if (!timerEnabled) {
      if (els.timer) els.timer.textContent = "OFF";
      return;
    }

    timeLeft = timeLimit;
    if (els.timer) els.timer.textContent = `${timeLeft}s`;

    timerId = setInterval(() => {
      timeLeft--;
      if (els.timer) els.timer.textContent = `${timeLeft}s`;
      if (timeLeft <= 0) {
        stopTimer();
        endGameDueToTime();
      }
    }, 1000);
  }

  function endGameDueToTime(){
    locked = true;
    if (els.choices) els.choices.innerHTML = "";
    showResults(true);
  }

  function readTimeChoice(){
    const raw = els.timeChoice ? String(els.timeChoice.value || "off").toLowerCase() : "off";
    if (raw === "off" || raw === "0" || raw === "false") return { enabled:false, seconds:60 };
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) return { enabled:false, seconds:60 };
    return { enabled:true, seconds:n };
  }

  function applyTimeChoice(){
    const t = readTimeChoice();
    timerEnabled = t.enabled;
    timeLimit = t.seconds;
    if (els.timer) els.timer.textContent = timerEnabled ? `${timeLimit}s` : "OFF";
  }

  // ---------------- Race progress ----------------
  function updateRaceProgress(answeredCount){
    if (!els.skier || !els.raceTrack) return;

    const min = 10;
    const max = els.raceTrack.clientWidth - 10;
    const pct = Math.max(0, Math.min(1, answeredCount / total));
    const x = min + (max - min) * pct;

    els.skier.style.left = `${x}px`;

    // keep 9 checkpoints, fill based on proportion
    const cps = els.raceTrack.querySelectorAll(".checkpoint");
    cps.forEach((cp, idx) => {
      const threshold = (idx + 1) / (cps.length + 1); // 1/10..9/10
      if (pct >= threshold) cp.classList.add("hit");
      else cp.classList.remove("hit");
    });
  }

  function updateHUD(){
    const asked = Math.min(qIndex + 1, total);
    els.qNum.textContent = `Question ${asked}/${total}`;
    els.scoreInline.textContent = `Correct ${correct}/${asked}`;
    if (els.timer) els.timer.textContent = timerEnabled ? `${timeLeft}s` : "OFF";
    updateRaceProgress(qIndex);
  }

  // ---------------- Round build ----------------
  async function buildRoundFromWords(wordsN){
    const pool = [...new Set(WORDS)];
    const defs = await Promise.all(wordsN.map(w => fetchDef(w)));

    round = wordsN.map((word, idx) => {
      const opts = [word];
      const d = shuffle(pool.filter(w => w !== word));
      while(opts.length < MODE[mode] && d.length) opts.push(d.pop());
      shuffle(opts);

      const def = defs[idx] || "Definition unavailable.";
      defCache.set(word, def);

      return { word, opts, ans: opts.indexOf(word), def };
    });
  }

  function pickWords(count){
    const pool = shuffle([...new Set(WORDS)]);
    return pool.slice(0, count);
  }

  function getMissedWordsForReview(){
    const missed = Array.from(missedSet);
    shuffle(missed);

    // If you have fewer than 50 missed, fill remaining with random unseen words
    if (missed.length < MISSED_REVIEW_TOTAL) {
      const need = MISSED_REVIEW_TOTAL - missed.length;
      const extras = pickWords(need * 3).filter(w => !missedSet.has(w));
      missed.push(...extras.slice(0, need));
    }

    return missed.slice(0, MISSED_REVIEW_TOTAL);
  }

  // ---------------- Game flow ----------------
  async function start(selectedMode, forceWords=null, forcedTotal=null){
    if (isBuilding) return;
    isBuilding = true;

    mode = selectedMode || mode || "medium";
    lastRoundMode = mode;

    // lock in timer selection
    applyTimeChoice();

    // set total for this run
    total = forcedTotal || DEFAULT_TOTAL;
    lastRoundTotal = total;

    qIndex = 0;
    correct = 0;
    history = [];
    locked = false;

    updateRaceProgress(0);

    els.overlay.style.display = "none";
    els.resultCard.classList.add("hidden");
    els.gameCard.classList.remove("hidden");

    if (els.missedBtn) els.missedBtn.classList.add("hidden");

    els.definition.textContent = "Loading definitions…";
    els.choices.innerHTML = "";

    let words;
    if (forceWords && forceWords.length === total) {
      words = [...forceWords];
    } else {
      words = pickWords(total);
    }

    lastRoundWords = [...words];

    await buildRoundFromWords(words);

    isBuilding = false;

    startTimer();
    render();
  }

  function render(){
    locked = false;
    els.choices.innerHTML = "";
    document.activeElement && document.activeElement.blur();

    updateHUD();

    const q = round[qIndex];
    els.definition.textContent = q.def;

    q.opts.forEach((opt,i)=>{
      const b = document.createElement("button");
      b.className = "choice";
      b.type = "button";
      b.innerHTML = `<b>${LETTERS[i]}.</b> ${opt}`;
      b.onclick = () => choose(i);
      els.choices.appendChild(b);
    });
  }

  function choose(i){
    if (locked) return;
    locked = true;

    const q = round[qIndex];
    const ok = i === q.ans;

    if (ok) correct++;
    else missedSet.add(q.word); // track missed words across rounds

    history.push({
      def: q.def,
      correct: q.word,
      picked: q.opts[i],
      ok
    });

    els.choices.innerHTML = "";

    qIndex++;
    updateRaceProgress(qIndex);

    if (qIndex >= total){
      stopTimer();

      // Only count "plays" for normal 10-question rounds
      if (total === DEFAULT_TOTAL) roundsPlayedSinceMissedReset++;

      showResults(false);
      return;
    }

    setTimeout(render, 120);
  }

  function showResults(endedByTime){
    stopTimer();

    els.gameCard.classList.add("hidden");
    els.resultCard.classList.remove("hidden");

    els.scoreOut.textContent = correct;
    if (els.totalOut) els.totalOut.textContent = total;
    els.pctOut.textContent = Math.round(correct / total * 100);

    const header = endedByTime
      ? `<div style="margin:10px 0; font-weight:800;">Time’s up! Here’s your recap:</div>`
      : "";

    els.recap.innerHTML =
      header +
      history.map((h,i)=>`
        <div style="margin-bottom:12px;">
          <div class="muted"><b>Q${i+1}. Definition:</b><br>${h.def}</div>
          <div>
            <b>Correct:</b> <span class="ok">${h.correct}</span>
            &nbsp;|&nbsp;
            <b>You:</b> <span class="${h.ok ? "ok" : "bad"}">${h.picked}</span>
            <span class="${h.ok ? "ok" : "bad"}" style="margin-left:6px;">${h.ok ? "✔" : "✖"}</span>
          </div>
        </div>
      `).join("");

    // ---- Missed Review unlock logic ----
    const canUnlock = roundsPlayedSinceMissedReset >= MISSED_UNLOCK_ROUNDS && missedSet.size > 0;

    if (els.missedBtn) {
      if (canUnlock && total === DEFAULT_TOTAL) {
        els.missedBtn.classList.remove("hidden");
        els.missedBtn.textContent = `Practice Missed (${MISSED_REVIEW_TOTAL})`;
      } else {
        els.missedBtn.classList.add("hidden");
      }
    }

    // if this was the missed-review run, reset the system afterwards
    if (total === MISSED_REVIEW_TOTAL) {
      roundsPlayedSinceMissedReset = 0;
      missedSet.clear();
    }
  }

  // ---------------- Buttons ----------------
  els.mEasy.onclick = () => start("easy");
  els.mMedium.onclick = () => start("medium");
  els.mHard.onclick = () => start("hard");
  els.mExtreme.onclick = () => start("extreme");

  // Next 10 (normal)
  els.nextBtn.onclick = () => start(mode, null, DEFAULT_TOTAL);

  // Retry (same exact round)
  els.retryBtn.onclick = () => {
    if (!lastRoundWords) return;
    start(lastRoundMode, lastRoundWords, lastRoundTotal);
  };

  // Practice Missed (50) after 5 rounds
  if (els.missedBtn) {
    els.missedBtn.onclick = () => {
      const words50 = getMissedWordsForReview();
      start(mode, words50, MISSED_REVIEW_TOTAL);
    };
  }

  // Change difficulty
  els.restartBtn.onclick = () => {
    if (isBuilding) return;
    stopTimer();
    els.overlay.style.display = "flex";
    els.gameCard.classList.add("hidden");
    els.resultCard.classList.add("hidden");
  };

  // Initial state
  applyTimeChoice();
  els.overlay.style.display = "flex";
});