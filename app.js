document.addEventListener("DOMContentLoaded", () => {

  const WORDS = window.VOCAB_WORDS || [];
  const LETTERS = "abcdefghij".split("");
  const TOTAL = 10;

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

    mEasy: document.getElementById("mEasy"),
    mMedium: document.getElementById("mMedium"),
    mHard: document.getElementById("mHard"),
    mExtreme: document.getElementById("mExtreme"),
  };

  const MODE = { easy:3, medium:5, hard:6, extreme:10 };

  let mode, qIndex, correct, round, history, locked;

  function shuffle(arr){
    for(let i = arr.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function start(selected){
    mode = selected;
    qIndex = 0;
    correct = 0;
    history = [];
    locked = false;

    els.overlay.style.display = "none";
    els.resultCard.classList.add("hidden");
    els.gameCard.classList.remove("hidden");

    buildRound();
    renderQuestion();
  }

  function buildRound(){
    const pool = shuffle([...new Set(WORDS)]);
    round = pool.slice(0, TOTAL).map(word => {
      const opts = [word];
      const distractors = shuffle(pool.filter(w => w !== word));
      while (opts.length < MODE[mode]) opts.push(distractors.pop());
      shuffle(opts);
      return { word, opts, ans: opts.indexOf(word), def: "" };
    });
  }

  function updateHUD(){
    els.qNum.textContent = `${qIndex + 1}/${TOTAL}`;
    els.scoreInline.textContent = `${correct}/${qIndex + 1}`;
    els.climber.style.bottom = `${correct * 10}%`;
  }

  function renderQuestion(){
    locked = false;
    els.choices.innerHTML = "";
    document.activeElement && document.activeElement.blur();

    updateHUD();

    const q = round[qIndex];
    els.definition.textContent = "Loading definition…";

    q.opts.forEach((opt, i) => {
      const btn = document.createElement("button");
      btn.className = "choice";
      btn.type = "button";
      btn.innerHTML = `<b>${LETTERS[i]}.</b> ${opt}`;
      btn.onclick = () => selectAnswer(i);
      els.choices.appendChild(btn);
    });

    // IMPORTANT: do not fetch on last question (Safari safety)
    if (qIndex < TOTAL - 1) {
      loadDefinition(q);
    } else {
      els.definition.textContent = "Final question — choose the best answer.";
      q.def = els.definition.textContent;
    }
  }

  async function loadDefinition(q){
    try{
      const r = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(q.word)}`
      );
      const d = await r.json();
      const def = d?.[0]?.meanings?.[0]?.definitions?.[0]?.definition;
      q.def = def
        ? def.replace(new RegExp(`\\b${q.word}\\b`, "ig"), "_____")
        : "Definition unavailable.";
      els.definition.textContent = q.def;
    } catch {
      q.def = "Definition unavailable.";
      els.definition.textContent = q.def;
    }
  }

  function selectAnswer(i){
    if (locked) return;
    locked = true;

    const q = round[qIndex];
    const ok = i === q.ans;
    if (ok) correct++;

    history.push({
      def: q.def || els.definition.textContent,
      correct: q.word,
      picked: q.opts[i],
      ok
    });

    // HARD STOP interactions
    els.choices.innerHTML = "";

    // FINAL QUESTION → results immediately (no async)
    if (qIndex === TOTAL - 1) {
      showResults();
      return;
    }

    qIndex++;
    setTimeout(renderQuestion, 120);
  }

  function showResults(){
    els.gameCard.classList.add("hidden");
    els.resultCard.classList.remove("hidden");

    els.scoreOut.textContent = correct;
    els.pctOut.textContent = Math.round((correct / TOTAL) * 100);

    els.recap.innerHTML = history.map((h, i) => `
      <div class="recapItem">
        <div class="muted">
          <b>Q${i + 1} Definition:</b><br>${h.def}
        </div>
        <div>
          <b>Correct:</b> ${h.correct}
          &nbsp; | &nbsp;
          <b>You:</b> ${h.picked}
          <span class="${h.ok ? "ok" : "bad"}">
            ${h.ok ? "✔" : "✖"}
          </span>
        </div>
      </div>
    `).join("");
  }

  // Difficulty buttons
  els.mEasy.onclick = () => start("easy");
  els.mMedium.onclick = () => start("medium");
  els.mHard.onclick = () => start("hard");
  els.mExtreme.onclick = () => start("extreme");

  els.restartBtn.onclick = () => {
    els.overlay.style.display = "flex";
    els.gameCard.classList.add("hidden");
    els.resultCard.classList.add("hidden");
  };

});