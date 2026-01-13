(() => {
  // words.js in your project is a string array:
  // window.VOCAB_WORDS = ["abate","aberrant",...]
  const WORD_LIST = window.VOCAB_WORDS || window.WORDS || [];
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
    defStatus: document.getElementById("defStatus"),
    choices: document.getElementById("choices"),

    climber: document.getElementById("climber"),

    scoreOut: document.getElementById("scoreOut"),
    pctOut: document.getElementById("pctOut"),
    recap: document.getElementById("recap"),
    nextBtn: document.getElementById("nextBtn"),
    restartBtn: document.getElementById("restartBtn"),
  };

  const MODE_MAP = { easy: 3, medium: 5, hard: 6, extreme: 10 };

  let mode = "medium";
  let qIndex = 0;
  let correct = 0;
  let locked = false;

  // Each question: { word, options[], answerIndex, def }
  let round = [];
  let recap = [];

  // definition cache so repeated words are instant
  const defCache = new Map();

  function show(el){ el && el.classList.remove("hidden"); }
  function hide(el){ el && el.classList.add("hidden"); }

  function shuffle(arr){
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function escapeHtml(s){
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function updateHUD(){
    const asked = Math.min(qIndex + 1, 10);
    if (els.qNum) els.qNum.textContent = `${asked}/10`;
    if (els.scoreInline) els.scoreInline.textContent = `${correct}/${asked}`;
    if (els.climber) els.climber.style.bottom = `${Math.min(10, correct) * 10}%`;
  }

  function buildRound(){
    if (!Array.isArray(WORD_LIST) || WORD_LIST.length < 20) {
      throw new Error("Word list is missing or too small. words.js didn't load.");
    }

    const words = shuffle([...new Set(WORD_LIST.map(w => String(w).trim()).filter(Boolean))]);
    const picked = words.slice(0, 10);
    const pool = words;

    round = picked.map(word => {
      const nChoices = MODE_MAP[mode] || 5;
      const options = [word];

      const distractors = pool.filter(w => w !== word);
      shuffle(distractors);

      while (options.length < nChoices && distractors.length){
        const d = distractors.pop();
        if (!options.includes(d)) options.push(d);
      }

      shuffle(options);

      return {
        word,
        options,
        answerIndex: options.indexOf(word),
        def: null
      };
    });
  }

  async function fetchDefinition(word){
    if (defCache.has(word)) return defCache.get(word);

    // Fast timeout so it never “hangs”
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1800);

    try{
      // Free dictionary API (works on GitHub Pages)
      const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error("No def");
      const data = await res.json();

      const def =
        data?.[0]?.meanings?.[0]?.definitions?.[0]?.definition ||
        data?.[0]?.meanings?.[0]?.definitions?.[0]?.shortDefinition ||
        null;

      if (!def) throw new Error("No def");

      // clean: remove the word if it appears
      const cleaned = String(def).replace(new RegExp(`\\b${word}\\b`, "ig"), "_____").trim();

      defCache.set(word, cleaned);
      return cleaned;
    } catch {
      // fallback: still playable
      const fallback = "Definition unavailable (keep playing).";
      defCache.set(word, fallback);
      return fallback;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function loadDefinitionForCurrent(){
    const q = round[qIndex];
    if (!q) return;

    if (els.definition) els.definition.textContent = "Definition: loading…";
    if (els.defStatus) els.defStatus.textContent = "Fetching definition…";

    const def = await fetchDefinition(q.word);
    q.def = def;

    // Only update if we are still on same question
    if (round[qIndex] === q) {
      if (els.definition) els.definition.textContent = `Definition: ${def}`;
      if (els.defStatus) els.defStatus.textContent = "";
    }
  }

  function renderQuestion(){
    locked = false;
    updateHUD();

    const q = round[qIndex];
    if (!q) return;

    // Show answers immediately (so it never looks empty)
    els.choices.innerHTML = "";
    q.options.forEach((opt, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "choice";
      b.innerHTML = `<b>${LETTERS[i] || "?"}.</b> ${escapeHtml(opt)}`;
      b.onclick = () => pick(i);
      els.choices.appendChild(b);
    });

    // Load definition asynchronously
    loadDefinitionForCurrent();
  }

  function disableChoices(){
    els.choices.querySelectorAll("button").forEach(b => b.disabled = true);
  }

  function pick(i){
    if (locked) return;
    locked = true;
    disableChoices();

    const q = round[qIndex];
    const pickedWord = q.options[i];
    const correctWord = q.options[q.answerIndex];
    const ok = (i === q.answerIndex);

    if (ok) correct++;

    recap.push({
      def: q.def || "(loading / unavailable)",
      picked: pickedWord,
      correct: correctWord,
      ok
    });

    updateHUD();

    setTimeout(() => {
      qIndex++;
      if (qIndex >= 10) showResults();
      else renderQuestion();
    }, 140);
  }

  function showResults(){
    hide(els.gameCard);
    show(els.resultCard);

    const pct = Math.round((correct / 10) * 100);
    els.scoreOut.textContent = String(correct);
    els.pctOut.textContent = String(pct);

    els.recap.innerHTML = recap.map((r, idx) => `
      <div class="recapItem">
        <div class="muted"><b>Q${idx + 1} Definition:</b> ${escapeHtml(r.def)}</div>
        <div><b>Correct:</b> ${escapeHtml(r.correct)} &nbsp; | &nbsp; <b>You:</b> ${escapeHtml(r.picked)} ${r.ok ? "✔" : "✖"}</div>
      </div>
    `).join("");
  }

  function start(selectedMode){
    mode = selectedMode;
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

  // Difficulty buttons
  els.mEasy.onclick = () => start("easy");
  els.mMedium.onclick = () => start("medium");
  els.mHard.onclick = () => start("hard");
  els.mExtreme.onclick = () => start("extreme");

  // Results buttons
  els.nextBtn.onclick = () => start(mode);
  els.restartBtn.onclick = () => {
    show(els.overlay);
    hide(els.resultCard);
    hide(els.gameCard);
  };

  // Initial state
  show(els.overlay);
  hide(els.gameCard);
  hide(els.resultCard);
})();