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

  let mode, qIndex, correct, locked;
  let round = [];
  let history = [];

  function shuffle(a){
    for(let i=a.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [a[i],a[j]]=[a[j],a[i]];
    }
    return a;
  }

  function sanitize(def, word){
    if(!def) return "Definition unavailable.";
    return def.replace(new RegExp(`\\b${word}\\b`, "ig"), "_____");
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

  async function start(m){
    mode = m;
    qIndex = 0;
    correct = 0;
    history = [];
    locked = false;

    els.overlay.style.display = "none";
    els.resultCard.classList.add("hidden");
    els.gameCard.classList.remove("hidden");

    const pool = shuffle([...new Set(WORDS)]);
    const picked = pool.slice(0, TOTAL);

    round = await Promise.all(picked.map(async word => {
      const opts = [word];
      const d = shuffle(pool.filter(w => w !== word));
      while(opts.length < MODE[mode]) opts.push(d.pop());
      shuffle(opts);
      return {
        word,
        opts,
        ans: opts.indexOf(word),
        def: await fetchDef(word)
      };
    }));

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

  els.overlay.style.display = "flex";
});