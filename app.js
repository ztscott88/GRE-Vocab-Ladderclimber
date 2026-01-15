document.addEventListener("DOMContentLoaded", () => {
  const TOTAL = 10;
  const LETTERS = "abcdefghij".split("");

  const WORDS = window.VOCAB_WORDS || [];
  const GRE_DEFS = window.GRE_DEFS || {};

  const MODE = { easy: 3, medium: 5, hard: 6, extreme: 10 };

  /* -------------------- ELEMENTS -------------------- */
  const $ = id => document.getElementById(id);

  const els = {
    overlay: $("difficultyOverlay"),
    game: $("gameCard"),
    results: $("resultCard"),

    roundPill: $("roundPill"),
    qNum: $("qNum"),
    score: $("scoreInline"),
    timer: $("timer"),

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
    medal: $("medalOut"),
    title: $("resultRoundTitle")
  };

  /* -------------------- STATE -------------------- */
  let mode = "medium";
  let roundNum = 1;
  let tryNum = 1;

  let qIndex = 0;
  let correct = 0;
  let locked = false;

  let roundWords = [];
  let round = [];
  let history = [];
  let last50 = [];

  /* -------------------- HELPERS -------------------- */
  const shuffle = a => [...a].sort(() => Math.random() - 0.5);

  function maskDef(def, word) {
    const r = new RegExp(`\\b${word}\\b`, "ig");
    return def.replace(r, "_____");
  }

  function buildRound(words) {
    const pool = shuffle(WORDS.map(w => w.toLowerCase()));

    return words.map(word => {
      const entry = GRE_DEFS[word];
      if (!entry) {
        console.error("Missing definition for:", word);
        return null;
      }

      const opts = [word];
      pool.forEach(w => {
        if (opts.length < MODE[mode] && w !== word) opts.push(w);
      });

      shuffle(opts);

      last50.push({ word, def: entry.def, pos: entry.pos });
      if (last50.length > 50) last50.shift();

      return {
        word,
        defRaw: entry.def,
        pos: entry.pos,
        defQ: maskDef(entry.def, word),
        opts,
        ans: opts.indexOf(word)
      };
    }).filter(Boolean);
  }

  /* -------------------- RENDER -------------------- */
  function updateHUD() {
    els.roundPill.textContent = `Round ${roundNum} · Try ${tryNum}`;
    els.qNum.textContent = `Question ${qIndex + 1}/${round.length}`;
    const answered = history.filter(h => h.type === "answer").length;
    els.score.textContent = `Correct ${correct}/${answered}`;
  }

  function render() {
    locked = false;
    els.choices.innerHTML = "";
    updateHUD();

    const q = round[qIndex];
    els.definition.textContent = `Definition: ${q.defQ}`;

    q.opts.forEach((opt, i) => {
      const b = document.createElement("button");
      b.className = "choice";
      b.innerHTML = `<b>${LETTERS[i]}.</b> ${opt}`;
      b.onclick = () => answer(i);
      els.choices.appendChild(b);
    });
  }

  /* -------------------- GAME LOGIC -------------------- */
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
      pos: q.pos
    });

    next();
  }

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
      pos: q.pos
    });

    next();
  }

  function next() {
    qIndex++;
    if (qIndex >= round.length) showResults();
    else setTimeout(render, 100);
  }

  /* -------------------- RESULTS -------------------- */
  function showResults() {
    els.game.classList.add("hidden");
    els.results.classList.remove("hidden");

    const answered = history.filter(h => h.type === "answer").length;
    const pct = answered ? Math.round((correct / answered) * 100) : 0;

    els.scoreOut.textContent = correct;
    els.totalOut.textContent = answered;
    els.pctOut.textContent = pct;
    els.medal.textContent =
      pct >= 90 ? "🥇 Gold" :
      pct >= 75 ? "🥈 Silver" :
      pct >= 60 ? "🥉 Bronze" : "🏁 Finish";

    els.recap.innerHTML = history.map((h, i) => `
      <div class="recapItem">
        <b>Q${i + 1}.</b> ${h.def}
        <span class="muted">(${h.pos})</span><br>
        <b>Correct:</b> <span class="ok">${h.word}</span> |
        <b>You:</b> <span class="${h.ok ? "ok" : "bad"}">${h.picked}</span>
      </div>
    `).join("");

    els.reviewWrongBtn.disabled =
      history.filter(h => !h.ok).length === 0;
  }

  /* -------------------- STARTERS -------------------- */
  function start(words) {
    qIndex = 0;
    correct = 0;
    history = [];

    round = buildRound(words);
    els.overlay.style.display = "none";
    els.results.classList.add("hidden");
    els.game.classList.remove("hidden");

    render();
  }

  function random10() {
    return shuffle(WORDS).slice(0, TOTAL).map(w => w.toLowerCase());
  }

  /* -------------------- BUTTONS -------------------- */
  els.flagBtn.onclick = flagSkip;

  els.retryBtn.onclick = () => {
    tryNum++;
    start(roundWords);
  };

  els.nextBtn.onclick = () => {
    roundNum++;
    tryNum = 1;
    roundWords = random10();
    start(roundWords);
  };

  els.reviewWrongBtn.onclick = () => {
    const missed = history.filter(h => !h.ok).map(h => h.word);
    tryNum++;
    start([...new Set(missed)]);
  };

  els.reviewLast50Btn.onclick = () => {
    els.recap.innerHTML = last50.map(x =>
      `<div><b>${x.word}</b> (${x.pos})<br>${x.def}</div>`
    ).join("");
  };

  els.restartBtn.onclick = () => {
    els.overlay.style.display = "flex";
    els.game.classList.add("hidden");
    els.results.classList.add("hidden");
  };

  els.mEasy.onclick = () => (mode = "easy", roundWords = random10(), start(roundWords));
  els.mMedium.onclick = () => (mode = "medium", roundWords = random10(), start(roundWords));
  els.mHard.onclick = () => (mode = "hard", roundWords = random10(), start(roundWords));
  els.mExtreme.onclick = () => (mode = "extreme", roundWords = random10(), start(roundWords));

  /* -------------------- INIT -------------------- */
  els.overlay.style.display = "flex";
});
