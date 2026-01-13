document.addEventListener("DOMContentLoaded", () => {

  const WORDS = window.VOCAB_WORDS || window.WORDS || [];
  const LETTERS = "abcdefghij".split("");

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

  const MODE = { easy: 3, medium: 5, hard: 6, extreme: 10 };

  let mode, qIndex, correct, round, history, locked;

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function start(m) {
    mode = m;
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

  function buildRound() {
    const pool = shuffle([...new Set(WORDS)]);
    round = pool.slice(0, 10).map(word => {
      const opts = [word];
      const d = shuffle(pool.filter(w => w !== word));
      while (opts.length < MODE[mode]) opts.push(d.pop());
      shuffle(opts);
      return { word, opts, ans: opts.indexOf(word), def: "" };
    });
  }

  function updateHUD() {
    const asked = qIndex + 1;
    els.qNum.textContent = `${asked}/10`;
    els.scoreInline.textContent = `${correct}/${asked}`;
    els.climber.style.bottom = `${correct * 10}%`;
  }

  function renderQuestion() {
    locked = false;

    // 🔑 HARD RESET to prevent highlight carryover
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

    loadDefinition(q);
  }

  async function loadDefinition(q) {
    try {
      const r = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(q.word)}`
      );
      const d = await r.json();
      const def = d?.[0]?.meanings?.[0]?.definitions?.[0]?.definition;
      els.definition.textContent = def
        ? def.replace(new RegExp(`\\b${q.word}\\b`, "ig"), "_____")
        : "Definition unavailable.";
    } catch {
      els.definition.textContent = "Definition unavailable.";
    }
  }

  function selectAnswer(i) {
    if (locked) return;
    locked = true;

    const q = round[qIndex];
    const ok = i === q.ans;
    if (ok) correct++;

    history.push({
      word: q.word,
      picked: q.opts[i],
      ok
    });

    // 🚫 Prevent double tap & stuck state
    els.choices.querySelectorAll("button").forEach(b => b.disabled = true);

    setTimeout(() => {
      qIndex++;

      // ✅ GUARANTEED transition after Q10
      if (qIndex >= 10) {
        showResults();
      } else {
        renderQuestion();
      }
    }, 160);
  }

  function showResults() {
    els.gameCard.classList.add("hidden");
    els.resultCard.classList.remove("hidden");

    els.scoreOut.textContent = correct;
    els.pctOut.textContent = Math.round((correct / 10) * 100);

    els.recap.innerHTML = history.map((h, i) => `
      <div>
        Q${i + 1}: <b>${h.word}</b> → ${h.picked}
        <span class="${h.ok ? "ok" : "bad"}">${h.ok ? "✔" : "✖"}</span>
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