(() => {
  const WORDS = window.VOCAB_WORDS || window.WORDS || [];
  const LETTERS = "abcdefghij".split("");

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
    nextBtn: document.getElementById("nextBtn"),
    restartBtn: document.getElementById("restartBtn"),
  };

  const MODE_MAP = {
    easy: 3,
    medium: 5,
    hard: 6,
    extreme: 10,
  };

  let mode = null;
  let qIndex = 0;       // 0..9
  let correct = 0;      // number correct
  let locked = false;   // prevents double taps / freeze
  let round = [];       // [{ word, def, options[], answerIndex }]
  let recap = [];       // [{ def, picked, correct, ok }]

  function show(el) { el && el.classList.remove("hidden"); }
  function hide(el) { el && el.classList.add("hidden"); }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function getWordObj(w) {
    // supports words.js formats:
    // { word, def } OR { Word, Definition } etc.
    if (!w) return null;
    if (typeof w === "string") return { word: w, def: "" };
    const word = w.word || w.Word || w.term || w.Term;
    const def  = w.def  || w.Definition || w.definition || w.meaning;
    return (word && def) ? { word: String(word), def: String(def) } : null;
  }

  function updateHUD() {
    // Progress label: "2/10"
    if (els.qNum) els.qNum.textContent = `${Math.min(qIndex + 1, 10)}/10`;

    // Correct label: "correct/questions asked"
    const asked = Math.min(qIndex + 1, 10);
    if (els.scoreInline) els.scoreInline.textContent = `${correct}/${asked}`;

    // Ladder position: based on correct (0-10)
    if (els.climber) {
      const pct = Math.max(0, Math.min(10, correct)) * 10;
      els.climber.style.bottom = `${pct}%`;
    }
  }

  function buildRound() {
    // pick 10 random unique items from WORDS
    const pool = WORDS.map(getWordObj).filter(Boolean);
    shuffle(pool);
    const picked = pool.slice(0, 10);

    round = picked.map(obj => {
      const nChoices = MODE_MAP[mode] || 5;
      const opts = [obj.word];

      // distractors
      const distractPool = pool.map(x => x.word).filter(x => x !== obj.word);
      shuffle(distractPool);
      while (opts.length < nChoices && distractPool.length) {
        const d = distractPool.pop();
        if (!opts.includes(d)) opts.push(d);
      }
      shuffle(opts);

      return {
        word: obj.word,
        def: obj.def,
        options: opts,
        answerIndex: opts.indexOf(obj.word),
      };
    });
  }

  function renderQuestion() {
    locked = false;
    const q = round[qIndex];

    updateHUD();

    if (els.definition) els.definition.textContent = q.def || "Definition missing";
    if (!els.choices) return;

    els.choices.innerHTML = "";
    q.options.forEach((opt, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "choice";
      b.innerHTML = `<b>${LETTERS[i] || "?"}.</b> ${opt}`;
      b.onclick = () => pick(i);
      els.choices.appendChild(b);
    });
  }

  function disableChoices() {
    if (!els.choices) return;
    els.choices.querySelectorAll("button").forEach(b => b.disabled = true);
  }

  function pick(i) {
    if (locked) return;          // prevents double taps
    locked = true;
    disableChoices();

    const q = round[qIndex];
    const pickedWord = q.options[i];
    const correctWord = q.options[q.answerIndex];
    const ok = (i === q.answerIndex);

    if (ok) correct++;

    recap.push({
      def: q.def,
      picked: pickedWord,
      correct: correctWord,
      ok
    });

    updateHUD();

    // Transition to next question or results — ALWAYS
    setTimeout(() => {
      qIndex++;

      if (qIndex >= 10) {
        showResults();
      } else {
        renderQuestion();
      }
    }, 180);
  }

  function showResults() {
    hide(els.gameCard);
    show(els.resultCard);

    const pct = Math.round((correct / 10) * 100);
    if (els.scoreOut) els.scoreOut.textContent = String(correct);
    if (els.pctOut) els.pctOut.textContent = String(pct);

    if (els.recap) {
      els.recap.innerHTML = recap.map((r, idx) => `
        <div class="recapItem">
          <div class="muted"><b>Q${idx + 1} Definition:</b> ${escapeHtml(r.def)}</div>
          <div><b>Correct:</b> ${escapeHtml(r.correct)} &nbsp; | &nbsp; <b>You:</b> ${escapeHtml(r.picked)} ${r.ok ? "✔" : "✖"}</div>
        </div>
      `).join("");
    }
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function start(m) {
    mode = m;
    qIndex = 0;
    correct = 0;
    recap = [];
    locked = false;

    hide(els.overlay);
    hide(els.resultCard);
    show(els.gameCard);

    buildRound();
    renderQuestion();
  }

  // Wire buttons (difficulty)
  els.mEasy && (els.mEasy.onclick = () => start("easy"));
  els.mMedium && (els.mMedium.onclick = () => start("medium"));
  els.mHard && (els.mHard.onclick = () => start("hard"));
  els.mExtreme && (els.mExtreme.onclick = () => start("extreme"));

  // Results buttons
  els.nextBtn && (els.nextBtn.onclick = () => start(mode || "medium"));
  els.restartBtn && (els.restartBtn.onclick = () => {
    show(els.overlay);
    hide(els.resultCard);
    hide(els.gameCard);
  });

  // Keyboard shortcuts on modal
  window.addEventListener("keydown", (e) => {
    if (!els.overlay || els.overlay.classList.contains("hidden")) return;
    if (e.key === "1") start("easy");
    if (e.key === "2") start("medium");
    if (e.key === "3") start("hard");
    if (e.key === "4") start("extreme");
  });

  // Initial state
  show(els.overlay);
  hide(els.gameCard);
  hide(els.resultCard);
})();