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
    definition: document.getElementById("definition"),
    choices: document.getElementById("choices"),
    climber: document.getElementById("climber"),

    scoreOut: document.getElementById("scoreOut"),
    pctOut: document.getElementById("pctOut"),
    recap: document.getElementById("recap"),

    restartBtn: document.getElementById("restartBtn"),
    nextBtn: document.getElementById("nextBtn"),

    mEasy: document.getElementById("mEasy"),
    mMedium: document.getElementById("mMedium"),
    mHard: document.getElementById("mHard"),
    mExtreme: document.getElementById("mExtreme"),
  };

  let mode = "medium";
  let qIndex = 0;
  let correct = 0;
  let locked = false;

  let round = [];
  let history = [];
  let isBuilding = false;

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

  function setButtonsLoading(on){
    if (els.nextBtn) els.nextBtn.disabled = on;
    if (els.restartBtn) els.restartBtn.disabled = on;
    if (els.mEasy) els.mEasy.disabled = on;
    if (els.mMedium) els.mMedium.disabled = on;
    if (els.mHard) els.mHard.disabled = on;
    if (els.mExtreme) els.mExtreme.disabled = on;
  }

  async function start(selectedMode){
    // prevent multiple overlapping builds (this breaks Next 10)
    if (isBuilding) return;
    isBuilding = true;

    mode = selectedMode || mode || "medium";
    qIndex = 0;
    correct = 0;
    history = [];
    locked = false;

    // UI state
    els.overlay.style.display = "none";
    els.resultCard.classList.add("hidden");
    els.gameCard.classList.remove("hidden");

    els.definition.textContent = "Loading definitions…";
    els.choices.innerHTML = "";
    setButtonsLoading(true);

    // Build round
    const pool = shuffle([...new Set(WORDS)]);
    const picked = pool.slice(0, TOTAL);

    // prefetch defs for the 10 words
    const defs = await Promise.all(picked.map(w => fetchDef(w)));

    round = picked.map((word, idx) => {
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

    isBuilding = false;
    setButtonsLoading(false);

    render();
  }

  function updateHUD(){
    els.qNum.textContent = `${qIndex+1}/${TOTAL}`;
    els.scoreInline.textContent = `${correct}/${qIndex+1}`;
    els.climber.style.bottom = `${correct*10}%`;
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

    if(qIndex >= TOTAL){
      showResults();
      return;
    }

    setTimeout(render, 120);
  }

  function showResults(){
    els.gameCard.classList.add("hidden");
    els.resultCard.classList.remove("hidden");

    els.scoreOut.textContent = correct;
    els.pctOut.textContent = Math.round(correct / TOTAL * 100);

    els.recap.innerHTML = history.map((h,i)=>`
      <div style="margin-bottom:10px;">
        <div class="muted"><b>Q${i+1} Definition:</b><br>${h.def}</div>
        <div>
          <b>Correct:</b> ${h.correct} |
          <b>You:</b> ${h.picked}
          <span class="${h.ok ? "ok" : "bad"}">${h.ok ? "✔" : "✖"}</span>
        </div>
      </div>
    `).join("");
  }

  // Difficulty buttons
  els.mEasy.onclick = () => start("easy");
  els.mMedium.onclick = () => start("medium");
  els.mHard.onclick = () => start("hard");
  els.mExtreme.onclick = () => start("extreme");

  // ✅ Next 10 fixed (always uses last mode, prevents overlap)
  els.nextBtn.onclick = () => start(mode);

  // Change difficulty
  els.restartBtn.onclick = () => {
    if (isBuilding) return;
    els.overlay.style.display = "flex";
    els.gameCard.classList.add("hidden");
    els.resultCard.classList.add("hidden");
  };

  // Initial
  els.overlay.style.display = "flex";
});