document.addEventListener("DOMContentLoaded",()=>{

const TOTAL=10;
const LETTERS="abcdefghij".split("");
const WORDS=window.VOCAB_WORDS||[];

const MODE={easy:3,medium:5,hard:6,extreme:10};

const el=id=>document.getElementById(id);

const els={
  overlay:el("difficultyOverlay"),
  game:el("gameCard"),
  results:el("resultCard"),
  qNum:el("qNum"),
  scoreInline:el("scoreInline"),
  timer:el("timer"),
  def:el("definition"),
  choices:el("choices"),
  skier:el("skier"),
  track:el("raceTrack"),
  recap:el("recap"),
  scoreOut:el("scoreOut"),
  pctOut:el("pctOut"),
  totalOut:el("totalOut"),
  retry:el("retryBtn"),
  next:el("nextBtn"),
  missedBtn:el("missedBtn"),
  restart:el("restartBtn"),
  timeChoice:el("timeChoice")
};

let mode="medium";
let q=0,correct=0,locked=false;
let round=[],history=[];
let timer=null,timeLeft=0,timerOn=false;
let rounds=0,missed=new Set();

function shuffle(a){
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function updateHUD(){
  els.qNum.textContent=`Question ${q+1}/${round.length}`;
  els.scoreInline.textContent=`Correct ${correct}/${q+1}`;
}

function updateRace(){
  const pct=q/round.length;
  els.skier.style.left=`${10+(els.track.clientWidth-20)*pct}px`;
  [...els.track.querySelectorAll(".checkpoint")].forEach((c,i)=>{
    c.classList.toggle("hit",pct>=(i+1)/10);
  });
}

function stopTimer(){
  if(timer){clearInterval(timer);timer=null}
}

function startTimer(){
  stopTimer();
  if(!timerOn){els.timer.textContent="OFF";return}
  els.timer.textContent=`${timeLeft}s`;
  timer=setInterval(()=>{
    timeLeft--;
    els.timer.textContent=`${timeLeft}s`;
    if(timeLeft<=0){stopTimer();end()}
  },1000);
}

async function def(word){
  try{
    const r=await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
    const d=await r.json();
    return d[0].meanings[0].definitions[0].definition.replace(new RegExp(word,"ig"),"_____");
  }catch{return "Definition unavailable."}
}

async function build(words){
  round=[];
  for(const w of words){
    const opts=[w];
    const pool=shuffle([...WORDS.filter(x=>x!==w)]);
    while(opts.length<MODE[mode])opts.push(pool.pop());
    shuffle(opts);
    round.push({word:w,opts,ans:opts.indexOf(w),def:await def(w)});
  }
}

function render(){
  locked=false;
  els.choices.innerHTML="";
  updateHUD();
  updateRace();
  els.def.textContent=round[q].def;
  round[q].opts.forEach((o,i)=>{
    const b=document.createElement("button");
    b.className="choice";
    b.innerHTML=`<b>${LETTERS[i]}.</b> ${o}`;
    b.onclick=()=>pick(i);
    els.choices.appendChild(b);
  });
}

function pick(i){
  if(locked)return;
  locked=true;
  const r=round[q];
  const ok=i===r.ans;
  if(ok)correct++; else missed.add(r.word);
  history.push({def:r.def,correct:r.word,picked:r.opts[i],ok});
  q++;
  if(q>=round.length){end();return}
  setTimeout(render,120);
}

function end(){
  stopTimer();
  els.game.classList.add("hidden");
  els.results.classList.remove("hidden");
  els.scoreOut.textContent=correct;
  els.totalOut.textContent=round.length;
  els.pctOut.textContent=Math.round(correct/round.length*100);
  els.recap.innerHTML=history.map((h,i)=>`
    <div>
      <div class="muted"><b>Q${i+1}.</b> ${h.def}</div>
      <div>
        <b>Correct:</b> <span class="ok">${h.correct}</span> |
        <b>You:</b> <span class="${h.ok?"ok":"bad"}">${h.picked}</span>
      </div>
    </div>
  `).join("");
  rounds++;
  if(rounds>=5&&missed.size>0)els.missedBtn.classList.remove("hidden");
}

function start(words){
  q=0;correct=0;history=[];locked=false;
  els.overlay.style.display="none";
  els.results.classList.add("hidden");
  els.game.classList.remove("hidden");
  build(words).then(()=>{
    updateRace();
    startTimer();
    render();
  });
}

document.querySelectorAll("[data-time]").forEach(b=>{
  b.onclick=()=>{
    document.querySelectorAll("[data-time]").forEach(x=>x.classList.remove("timerSelected"));
    b.classList.add("timerSelected");
    const v=b.dataset.time;
    els.timeChoice.value=v;
    if(v==="off"){timerOn=false}
    else{timerOn=true;timeLeft=parseInt(v)}
  };
});

["easy","medium","hard","extreme"].forEach(m=>{
  el(m).onclick=()=>{
    mode=m;
    start(shuffle([...WORDS]).slice(0,10));
  };
});

els.next.onclick=()=>start(shuffle([...WORDS]).slice(0,10));
els.retry.onclick=()=>start(round.map(r=>r.word));
els.missedBtn.onclick=()=>start([...missed].slice(0,50));
els.restart.onclick=()=>{
  els.overlay.style.display="flex";
  els.game.classList.add("hidden");
  els.results.classList.add("hidden");
};

els.overlay.style.display="flex";
});