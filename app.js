(() => {
  // ===== WORD SOURCE =====
  const WORDS = window.VOCAB_WORDS || window.WORDS || [];
  const LETTERS = "abcdefghij".split("");

  // ===== ELEMENTS =====
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

  // ===== CONFIG =====
  const MODE = {
    easy: 3,
    medium: 5,
    hard: 6,
    extreme: 10
  };

  // ===== STATE =====
  let mode = "medium";
  let qIndex = 0;
  let correct = 0;
  let locked = false;
  let round = [];
  let history = [];

  // ===== HELPERS =====
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  // ===== HUD =====
  function updateHUD() {
    const asked = qIndex + 1;
    els.qNum.textContent = `${asked}/10`;
    els.scoreInline.textContent = `${correct}/${asked}`;
    els.climber.style.bottom = `${correct * 10}%`;
  }

  // ===== ROUND BUILD =====
  function buildRound() {
    const pool = shuffle([...new Set(WORDS.map(w => String(w).trim()).filter(Boolean))]);
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
        def: `Definition: ${word} (loading…)`
      };
    });
  }

  // ===== DICTIONARY FETCH =====
  async function loadDefinition(q) {
    try {
      const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(q.word)}`);
      const d = await r.json();
      const def = d?.[0]?.meanings?.[0]?.definitions?.[0]?.definition;
      if (def) {
        q.def = "Definition: " + def.replace(new RegExp(`\\b${q.word}\\b`, "ig"), "_____");
        if (round[qIndex] === q) {
          els.definition.textContent = q.def;
        }
      }
    } catch {
      q.def = "Definition unavailable.";
      if (round[qIndex] === q) {
        els.definition.textContent = q.def;
      }
    }
  }

  // ===== RENDER QUESTION =====
  function render() {
    locked = false;

    // clear focus & previous state
    document.activeElement && document.activeElement.blur();
    els.choices.innerHTML = "";

    updateHUD();

    const q = round[qIndex];
    els.definition.textContent = q.def;

    q.options.forEach((opt, i) => {
      const btn = document.createElement("button");
      btn.className = "choice";
      btn.innerHTML = `<b>${LETTERS[i]}.</b> ${escapeHtml(opt)}`;
      btn.onclick = () => pick(i);
      els.choices.appendChild(btn);
    });

    loadDefinition(q);
  }

  // ===== PICK ANSWER =====
  function pick(i) {
    if (locked) return;
    locked = true;

    const q = round[qIndex];
    const picked = q.options[i];
    const correctWord = q.options[q.answerIndex];
    const ok = i === q.answerIndex;

    if (ok) correct++;

    history.push({
      def: q.def,
      correct: correctWord,
      picked,
      ok
    });

    updateHUD();

    setTimeout(() => {
      qIndex++;
      if (qIndex >= 10) showResults();
      else render();
    }, 160);
  }

  // ===== RESULTS =====
  function showResults() {
    els.gameCard.classList.add("hidden");
    els.resultCard.classList.remove("hidden");

    els.scoreOut.textContent = correct;
    els.pctOut.textContent = Math.round((correct / 10) * 100);

    els.recap.innerHTML = history.map((h, i) => `
      <div class="recapItem">
        <div class="muted"><b>Q${i + 1} Definition:</b> ${escapeHtml(h.def)}</div>
        <div>
          <b>Correct:</b> ${escapeHtml(h.correct)}
          &nbsp; | &nbsp;
          <b>You:</b> ${escapeHtml(h.picked)}
          <span class="${h.ok ? "ok" : "bad"}">
            ${h.ok ? "✔" : "✖"}
          </span>
        </div>
      </div>
    `).join("");
  }

  // ===== START GAME =====
  function start(selected) {
    mode = selected;
    qIndex = 0;
    correct = 0;
    history = [];
    locked = false;

    els.overlay.style.display = "none";
    els.overlay.classList.add("hidden");

    els.resultCard.classList.add("hidden");
    els.gameCard.classList.remove("hidden");

    buildRound();
    render();
  }

  // ===== BUTTON WIRING =====
  els.mEasy.onclick = () => start("easy");
  els.mMedium.onclick = () => start("medium");
  els.mHard.onclick = () => start("hard");
  els.mExtreme.onclick = () => start("extreme");

  els.nextBtn.onclick = () => start(mode);

  els.restartBtn.onclick = () => {
    els.overlay.style.display = "flex";
    els.overlay.classList.remove("hidden");
    els.resultCard.classList.add("hidden");
    els.gameCard.classList.add("hidden");
  };

  // ===== INIT =====
  els.overlay.style.display = "flex";
  els.gameCard.classList.add("hidden");
  els.resultCard.classList.add("hidden");
})();