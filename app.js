document.addEventListener("DOMContentLoaded", () => {

  const TOTAL = 10;
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
    pctOut: document.getElementById("pctOut"),
    recap: document.getElementById("recap"),

    restartBtn: document.getElementById("restartBtn"),
    nextBtn: document.getElementById("nextBtn"),
    retryBtn: document.getElementById("retryBtn"),

    mEasy: document.getElementById("mEasy"),
    mMedium: document.getElementById("mMedium"),
    mHard: document.getElementById("mHard"),
    mExtreme: document.getElementById("mExtreme"),

    t60: document.getElementById("t60"),
    t90: document.getElementById("t90"),
    t120: document.getElementById("t120"),
  };

  let mode = "medium";
  let qIndex = 0;
  let correct = 0;
  let locked = false;

  let round = [];
  let history = [];
  let isBuilding = false;

  // Retry support (same round)
  let lastRoundWords = null;
  let lastRoundMode = "medium";

  // Timer
  let timeLimit = 60; // selected in modal
  let timeLeft = 60;
  let timerId = null;

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
    try{
      const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
      const d = await r.json();
      return sanitize(d?.[0]?.meanings?.[0]?.definitions?.[0]?.definition, word);
    }catch{
      return "Definition unavailable.";
    }
  }

  function stopTimer(){
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function startTimer(){
    stopTimer();
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

  function setTimerChoice(seconds){
    timeLimit = seconds;

    // highlight selected timer button
    [els.t60, els.t90, els.t120].forEach(b => b && b.classList.remove("timerSelected"));
    if (seconds === 60 && els.t60) els.t60.classList.add("timerSelected");
    if (seconds === 90 && els.t90) els.t90.classList.add("timerSelected");
    if (seconds === 120 && els.t120) els.t120.classList.add("timerSelected");
  }

  // Race progress (0 start -> 10 finish)
  function updateRaceProgress(answeredCount){
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

  function updateHUD(){
    const asked = Math.min(qIndex + 1, TOTAL);
    els.qNum.textContent = `Question ${asked}/${TOTAL}`;
    els.scoreInline.textContent = `Correct ${correct}/${asked}`;
    if (els.timer) els.timer.textContent = `${timeLeft}s`;

    updateRaceProgress(qIndex);
  }

  async function buildRoundFromWords(words10){
    const pool = [...new Set(WORDS)];
    const defs = await Promise.all(words10.map(w => fetchDef(w)));

    round = words10.map((word, idx) => {
      const opts = [word];
      const d = shuffle(pool.filter(w => w !== word));
      while(opts.length < MODE[mode] && d.length) opts.push(d.pop());
      shuffle(opts);

      return {
        word,
        opts,
        ans: opts.indexOf(word),
        def: defs[idx] || "Definition unavailable."
      };
    });
  }

  async function start(selectedMode, forceWords10=null){
    if (isBuilding) return;
    isBuilding = true;

    mode = selectedMode || mode || "medium";
    lastRoundMode = mode;

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

    let words10;
    if (forceWords10 && forceWords10.length === TOTAL) {
      words10 = [...forceWords10];
    } else {
      const pool = shuffle([...new Set(WORDS)]);
      words10 = pool.slice(0, TOTAL);
    }

    lastRoundWords = [...words10];

    await buildRoundFromWords(words10);

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
    if(locked) return;
    locked = true;

    const q = round[qIndex];
    const ok = i === q.ans;
    if(ok) correct++;

    history.push({
      def: q.def,
      correct: q.word,
      picked: q.opts[i],
      ok
    });

    els.choices.innerHTML = "";

    qIndex++;
    updateRaceProgress(qIndex);

    if(qIndex >= TOTAL){
      stopTimer();
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
    els.pctOut.textContent = Math.round(correct / TOTAL * 100);

    const header = endedByTime
      ? `<div style="margin:10px 0; font-weight:800;">Time’s up! Here’s your recap:</div>`
      : "";

    els.recap.innerHTML =
      header +
      history.map((h,i)=>`
        <div style="margin-bottom:10px;">
          <div class="muted"><b>Q${i+1} Definition:</b><br>${h.def}</div>
          <div>
            <b>Correct:</b> ${h.correct} |
            <b>You:</b> ${h.picked}
            <span class="${h.ok ? "ok" : "bad"}">${h.ok ? "✔" : "✖"}</span>
          </div>
        </div>
      `).join("");

    if (endedByTime && history.length < TOTAL) {
      els.recap.innerHTML += `<div style="opacity:.8; margin-top:10px;">You answered ${history.length} of ${TOTAL} questions.</div>`;
    }
  }

  // --- Timer buttons (in modal) ---
  if (els.t60) els.t60.onclick = () => setTimerChoice(60);
  if (els.t90) els.t90.onclick = () => setTimerChoice(90);
  if (els.t120) els.t120.onclick = () => setTimerChoice(120);

  // default selection
  setTimerChoice(60);

  // Difficulty buttons
  els.mEasy.onclick = () => start("easy");
  els.mMedium.onclick = () => start("medium");
  els.mHard.onclick = () => start("hard");
  els.mExtreme.onclick = () => start("extreme");

  // Next 10 = same difficulty, new words, same selected timer
  els.nextBtn.onclick = () => start(mode);

  // Retry = same difficulty + same exact 10 words
  els.retryBtn.onclick = () => {
    if (!lastRoundWords) return;
    start(lastRoundMode, lastRoundWords);
  };

  // Change difficulty
  els.restartBtn.onclick = () => {
    if (isBuilding) return;
    stopTimer();
    els.overlay.style.display = "flex";
    els.gameCard.classList.add("hidden");
    els.resultCard.classList.add("hidden");
  };

  // Initial
  els.overlay.style.display = "flex";
});