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

  const MODE = { easy: 3, medium: 5, hard: 6, extreme: 10 };

  let mode = "medium";
  let qIndex = 0;
  let correct = 0;
  let locked = false;
  let round = [];
  let history = [];

  function shuffle(a){
    for(let i=a.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [a[i],a[j]]=[a[j],a[i]];
    }
    return a;
  }

  function updateHUD(){
    const asked = qIndex + 1;
    els.qNum.textContent = `${asked}/10`;
    els.scoreInline.textContent = `${correct}/${asked}`;
    els.climber.style.bottom = `${correct * 10}%`;
  }

  function buildRound(){
    const pool = shuffle([...new Set(WORDS.map(w => String(w).trim()))]);
    const picked = pool.slice(0,10);

    round = picked.map(word => {
      const options = [word];
      const distractors = shuffle(pool.filter(w => w !== word));

      while(options.length < MODE[mode] && distractors.length){
        options.push(distractors.pop());
      }

      shuffle(options);

      return {
        word,
        options,
        answer: options.indexOf(word),
        def: `Definition: ${word} (definition loading…)`
      };
    });
  }

  function render(){
    locked = false;
    updateHUD();

    const q = round[qIndex];
    els.definition.textContent = q.def;
    els.choices.innerHTML = "";

    q.options.forEach((opt,i)=>{
      const b = document.createElement("button");
      b.className = "choice";
      b.innerHTML = `<b>${LETTERS[i]}.</b> ${opt}`;
      b.onclick = () => pick(i);
      els.choices.appendChild(b);
    });

    loadDefinition(q);
  }

  async function loadDefinition(q){
    try{
      const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${q.word}`);
      const d = await r.json();
      const def = d?.[0]?.meanings?.[0]?.definitions?.[0]?.definition;
      if(def){
        q.def = `Definition: ${def.replace(new RegExp(q.word,"ig"),"_____")}`;
        if(round[qIndex] === q){
          els.definition.textContent = q.def;
        }
      }
    }catch{}
  }

  function pick(i){
    if(locked) return;
    locked = true;

    const q = round[qIndex];
    const ok = i === q.answer;
    if(ok) correct++;

    history.push({
      def: q.def,
      correct: q.word,
      picked: q.options[i],
      ok
    });

    updateHUD();

    setTimeout(()=>{
      qIndex++;
      if(qIndex >= 10) showResults();
      else render();
    },150);
  }

  function showResults(){
    els.gameCard.classList.add("hidden");
    els.resultCard.classList.remove("hidden");

    els.scoreOut.textContent = correct;
    els.pctOut.textContent = Math.round((correct/10)*100);

    els.recap.innerHTML = history.map((h,i)=>`
      <div class="recapItem">
        <div><b>Q${i+1}:</b> ${h.def}</div>
        <div><b>Correct:</b> ${h.correct} | <b>You:</b> ${h.picked} ${h.ok?"✔":"✖"}</div>
      </div>
    `).join("");
  }

  function start(selected){
    mode = selected;
    qIndex = 0;
    correct = 0;
    history = [];

    // FORCE REMOVE MODAL
    els.overlay.style.display = "none";
    els.overlay.classList.add("hidden");

    els.resultCard.classList.add("hidden");
    els.gameCard.classList.remove("hidden");

    buildRound();
    render();
  }

  // Difficulty buttons
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

  // Initial state
  els.overlay.style.display = "flex";
  els.gameCard.classList.add("hidden");
  els.resultCard.classList.add("hidden");
})();