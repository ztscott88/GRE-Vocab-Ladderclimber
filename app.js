document.addEventListener("DOMContentLoaded", () => {

  const WORDS = window.VOCAB_WORDS || [];
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

  const MODE = { easy:3, medium:5, hard:6, extreme:10 };

  let mode, qIndex, correct, round, history, locked;

  function shuffle(a){
    for(let i=a.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [a[i],a[j]]=[a[j],a[i]];
    }
    return a;
  }

  function start(m){
    mode=m;
    qIndex=0;
    correct=0;
    history=[];
    locked=false;

    els.overlay.style.display="none";
    els.resultCard.classList.add("hidden");
    els.gameCard.classList.remove("hidden");

    buildRound();
    render();
  }

  function buildRound(){
    const pool=shuffle([...new Set(WORDS)]);
    round=pool.slice(0,10).map(w=>{
      const opts=[w];
      const d=shuffle(pool.filter(x=>x!==w));
      while(opts.length<MODE[mode]) opts.push(d.pop());
      shuffle(opts);
      return {word:w,opts,ans:opts.indexOf(w)};
    });
  }

  function updateHUD(){
    els.qNum.textContent=`${qIndex+1}/10`;
    els.scoreInline.textContent=`${correct}/${qIndex+1}`;
    els.climber.style.bottom=`${correct*10}%`;
  }

  function render(){
    locked=false;
    els.choices.innerHTML="";
    document.activeElement && document.activeElement.blur();

    updateHUD();

    const q=round[qIndex];
    els.definition.textContent="Loading definition…";

    q.opts.forEach((opt,i)=>{
      const b=document.createElement("button");
      b.className="choice";
      b.type="button";
      b.innerHTML=`<b>${LETTERS[i]}.</b> ${opt}`;
      b.onclick=()=>select(i);
      els.choices.appendChild(b);
    });

    loadDef(q);
  }

  async function loadDef(q){
    try{
      const r=await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${q.word}`);
      const d=await r.json();
      const def=d?.[0]?.meanings?.[0]?.definitions?.[0]?.definition;
      els.definition.textContent=def
        ? def.replace(new RegExp(`\\b${q.word}\\b`,"ig"),"_____")
        : "Definition unavailable.";
    }catch{
      els.definition.textContent="Definition unavailable.";
    }
  }

  function select(i){
    if(locked) return;
    locked=true;

    const q=round[qIndex];
    const ok=i===q.ans;
    if(ok) correct++;

    history.push({word:q.word,picked:q.opts[i],ok});

    // HARD STOP interactions immediately
    els.choices.innerHTML="";

    qIndex++;

    // 🔥 CRITICAL FIX: force results immediately on Q10
    if(qIndex>=10){
      showResults();
      return;
    }

    setTimeout(render,120);
  }

  function showResults(){
    els.gameCard.classList.add("hidden");
    els.resultCard.classList.remove("hidden");

    els.scoreOut.textContent=correct;
    els.pctOut.textContent=Math.round(correct/10*100);

    els.recap.innerHTML=history.map((h,i)=>`
      <div>
        Q${i+1}: <b>${h.word}</b> → ${h.picked}
        <span class="${h.ok?"ok":"bad"}">${h.ok?"✔":"✖"}</span>
      </div>
    `).join("");
  }

  els.mEasy.onclick=()=>start("easy");
  els.mMedium.onclick=()=>start("medium");
  els.mHard.onclick=()=>start("hard");
  els.mExtreme.onclick=()=>start("extreme");

  els.restartBtn.onclick=()=>{
    els.overlay.style.display="flex";
    els.gameCard.classList.add("hidden");
    els.resultCard.classList.add("hidden");
  };

});