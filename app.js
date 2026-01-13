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

  // --- HARD GUARD: stop if modal buttons not found ---
  if (!els.mEasy || !els.mMedium || !els.mHard || !els.mExtreme) {
    console.error("Difficulty buttons not found in DOM.");
    return;
  }

  const MODE = { easy: 3, medium: 5, hard: 6, extreme: 10 };

  let mode = null;
  let qIndex = 0;
  let correct = 0;
  let locked = false;
  let round = [];
  let history = [];

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function updateHUD() {
    const asked = qIndex + 1;
    els.qNum.textContent = `${asked}/10`;
    els.scoreInline.textContent = `${correct}/${asked}`;
    els.climber.style.bottom = `${correct * 10}%`;
  }

  function buildRound() {
    const pool = shuffle([...new Set(WORDS.map(w => String(w).trim()))]);
    const picked = pool.slice(0, 10);

    round = picked.map(word => {
      const options = [word];
      const distractors = shuffle(pool.filter(w => w !== word));

      while (options.length < MODE[mode] && distractors.length) {
        options.push(distractors.pop());
      }

      shuffle(options);

      return {
        word,
        options,
        answerIndex: options.indexOf(word),
        def: "Definition loading…"
      };
    });
  }

  async function loadDefinition(q) {
    try {
      const r = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(q.word)}`
      );
      const d = await r.json();
      const def = d?.[0]?.meanings?.[0]?.definitions?.[0]?.definition;
      if (def && round[qIndex] === q) {
        q.def = "Definition: " + def.replace(new RegExp(`\\b${q.word}\\b`, "ig"), "_____");
        els.definition.textContent = q.def;
      }
    } catch {
      if (round[qIndex] === q) {
        els.definition.textContent = "Definition unavailable.";
      }
    }
  }

  function render() {
    locked = false;
    document.activeElement && document.activeElement.blur();
    els.choices.innerHTML = "";

    updateHUD();

    const q = round[qIndex];
    els.definition.textContent = q.def;

    q.options.forEach((opt, i) => {
      const b = document.createElement("button");
      b.className = "choice";
      b.innerHTML = `<b>${LETTERS[i]}.</b> ${opt}`;
      b.onclick = () => pick(i);
      els.choices.appendChild(b);
    });

    loadDefinition(q);
  }

  function pick(i) {
    if (locked) return;
    locked = true;

    const q = round[qIndex];
    const ok = i === q.answerIndex;
    if (ok) correct++;

    history.push({
      def: q.def,
      correct: q.word,
      picked: q.options[i],
      ok
    });

    updateHUD();

    setTimeout(() => {
      qIndex++;
      if (qIndex >= 10) showResults();
      else render();
    }, 150);
  }

  function showResults() {
    els.gameCard.classList.add("hidden");
    els.resultCard.classList.remove("hidden");

    els.scoreOut.textContent = correct;
    els.pctOut.textContent = Math.round((correct / 10) * 100);

    els.recap.innerHTML = history.map((h, i) => `
      <div class="recapItem">
        <div class="muted"><b>Q${i + 1}:</b> ${h.def}</div>
        <div>
          <b>Correct:</b> ${h.correct} |
          <b>You:</b> ${h.picked}
          <span class="${h.ok ? "ok" : "bad"}">
            ${h.ok ? "✔" : "✖"}
          </span>
        </div>
      </div>
    `).join("");
  }

  function start(selected) {
    mode = selected;
    qIndex = 0;
    correct = 0;
    history = [];
    locked = false;

    // ONLY hide overlay here
    els.overlay.style.display = "none";

    els.resultCard.classList.add("hidden");
    els.gameCard.classList.remove("hidden");

    buildRound();
    render();
  }

  // === BUTTON WIRING (THIS IS THE FIX) ===
  els.mEasy.onclick = () => start("easy");
  els.mMedium.onclick = () => start("medium");
  els.mHard.onclick = () => start("hard");
  els.mExtreme.onclick = () => start("extreme");

  els.nextBtn.onclick = () => start(mode);

  els.restartBtn.onclick = () => {
    els.overlay.style.display = "flex";
    els.gameCard.classList.add("hidden");
    els.resultCard.classList.add("hidden");
  };

  // === INITIAL STATE ===
  els.overlay.style.display = "flex";
  els.gameCard.classList.add("hidden");
  els.resultCard.classList.add("hidden");
})();