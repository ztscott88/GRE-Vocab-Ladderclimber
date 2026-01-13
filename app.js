
(function(){
  const WORDS = (window.VOCAB_WORDS || []).slice();
  const LETTERS = "abcdefghij".split("");

  const els = {
    overlay: document.getElementById("difficultyOverlay"),
    mEasy: document.getElementById("mEasy"),
    mMedium: document.getElementById("mMedium"),
    mHard: document.getElementById("mHard"),
    mExtreme: document.getElementById("mExtreme"),

    quizCard: document.getElementById("quizCard"),
    resultCard: document.getElementById("resultCard"),
    qNum: document.getElementById("qNum"),
    definition: document.getElementById("definition"),
    choices: document.getElementById("choices"),
    status: document.getElementById("status"),

    ladder: document.getElementById("ladder"),
    climber: document.getElementById("climber"),
    correctCount: document.getElementById("correctCount"),
    roundNum: document.getElementById("roundNum"),

    loadingPill: document.getElementById("loadingPill"),
    loadingText: document.getElementById("loadingText"),
    scoreInline: document.getElementById("scoreInline"),

    pct: document.getElementById("pct"),
    correct: document.getElementById("correct"),
    recap: document.getElementById("recap"),
    nextBtn: document.getElementById("nextBtn"),
    restartBtn: document.getElementById("restartBtn"),
  };

  let round = 0;
  let mode = null;
  let used = new Set();

  let questions = []; // {word, def, options, answerIndex}
  let qIndex = 0;
  let score = 0;
  let results = [];   // {def, picked, correct, isCorrect}

  let roundLoad = { done: 0, total: 10, times: [] };

  const MODE_MAP = {
    easy:    { nChoices: 3, difficulty: 1 },
    medium:  { nChoices: 5, difficulty: 3 },
    hard:    { nChoices: 6, difficulty: 4 },
    extreme: { nChoices: 10, difficulty: 5 },
  };

  function setVisible(el, on){ if (!el) return; el.classList.toggle("hidden", !on); }

  function setLoading(on, text){
    if (!els.loadingPill) return;
    if (on) {
      els.loadingPill.classList.remove("hidden");
      if (els.loadingText) els.loadingText.textContent = text || "Loading…";
    } else {
      els.loadingPill.classList.add("hidden");
    }
  }

  function fmtEta(sec){
    if (!isFinite(sec) || sec <= 0) return "";
    if (sec < 60) return "~" + Math.ceil(sec) + "s left";
    return "~" + Math.ceil(sec/60) + "m left";
  }

  function setLoadingProgress(done, total, avgSec){
    const pct = total ? Math.round((done/total)*100) : 0;
    const remaining = Math.max(0, total - done);
    const eta = fmtEta(remaining * (avgSec || 0));
    setLoading(true, "Loading definitions: " + pct + "% (" + done + "/" + total + ")" + (eta ? " • " + eta : ""));
  }

  function shuffle(arr){
    for (let i = arr.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  function sampleWord(exclude){
    if (exclude.size >= WORDS.length) return null;
    for (let tries = 0; tries < 5000; tries++){
      const w = WORDS[Math.floor(Math.random() * WORDS.length)];
      if (!exclude.has(w)) return w;
    }
    return null;
  }

  // Cache
  const defCache = new Map();
  try{
    const raw = localStorage.getItem("greVocabDefCacheV16");
    if (raw){
      const obj = JSON.parse(raw);
      for (const k in obj) defCache.set(k, obj[k]);
    }
  } catch(_){}

  function persistCache(){
    try{
      const obj = {};
      let c = 0;
      defCache.forEach((v,k) => {
        obj[k] = v;
        c++;
        if (c > 1500) return;
      });
      localStorage.setItem("greVocabDefCacheV16", JSON.stringify(obj));
    } catch(_){}
  }

  function normalizeToken(s){
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function containsAnswer(definition, word){
    if (!definition || !word) return false;
    const defNorm = " " + normalizeToken(definition) + " ";
    const w = normalizeToken(word);
    if (!w) return false;

    const variants = [
      w, w+"s", w+"es", w+"ed", w+"ing", w+"ly",
      w.endsWith("y") ? (w.slice(0,-1)+"ies") : "",
      w.endsWith("e") ? (w.slice(0,-1)+"ing") : ""
    ].filter(Boolean);

    for (let i=0;i<variants.length;i++){
      const v = variants[i];
      if (defNorm.indexOf(" " + v + " ") !== -1) return true;
    }
    return false;
  }

  async function fetchJson(url, ms){
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try{
      const resp = await fetch(url, { signal: ctrl.signal });
      if (!resp.ok) return null;
      return await resp.json();
    } catch(_){
      return null;
    } finally {
      clearTimeout(t);
    }
  }

  async function fetchDefinition(word){
    if (defCache.has(word)){
      const cached = defCache.get(word);
      if (cached && containsAnswer(cached, word)) {
        defCache.set(word, null);
        persistCache();
        return null;
      }
      return cached;
    }

    const target = "https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(word);
    const data = await fetchJson(target, 2600) ||
                 await fetchJson("https://api.allorigins.win/raw?url=" + encodeURIComponent(target), 4200);

    let def = null;
    try{
      def = data && data[0] && data[0].meanings && data[0].meanings[0] &&
            data[0].meanings[0].definitions && data[0].meanings[0].definitions[0] &&
            data[0].meanings[0].definitions[0].definition;
    } catch(_){ def = null; }

    let clean = (def && String(def).trim()) ? String(def).trim() : null;

    if (clean){
      clean = clean.replace(/\s*\[[^\]]*\]\s*/g, " ").trim();
      clean = clean.split("Example:")[0].trim();
      clean = clean.split("e.g.")[0].trim();
      clean = clean.split(";")[0].trim();
      clean = clean.split(".")[0].trim();

      const parts = clean.split(/\s+/).filter(Boolean);
      if (parts.length > 14) clean = parts.slice(0, 14).join(" ") + "…";
    }

    if (clean && containsAnswer(clean, word)){
      defCache.set(word, null);
      persistCache();
      return null;
    }

    defCache.set(word, clean);
    persistCache();
    return clean;
  }

  // Options
  function similarityScore(a,b){
    a=a.toLowerCase(); b=b.toLowerCase();
    let s=0;
    if (a[0]===b[0]) s+=6;
    if (a[a.length-1]===b[b.length-1]) s+=4;
    s += Math.max(0, 6 - Math.abs(a.length-b.length));
    const big = (x)=>{ const set={}; for(let i=0;i<x.length-1;i++){ set[x.slice(i,i+2)]=1; } return set; };
    const A=big(a), B=big(b);
    let inter=0; for (const k in A){ if (B[k]) inter++; }
    s += inter;
    return s;
  }

  function pickDistractors(correct, n, difficulty, exclude){
    const d = Math.max(1, Math.min(5, difficulty||3));
    const pool = [];
    const seen = new Set(exclude);

    let attempts=0;
    while (pool.length < 900 && attempts < 6000){
      const w = WORDS[Math.floor(Math.random()*WORDS.length)];
      attempts++;
      if (seen.has(w)) continue;
      seen.add(w);
      pool.push(w);
    }

    if (d >= 4){
      pool.sort((x,y)=> similarityScore(correct,y)-similarityScore(correct,x));
    } else if (d === 3){
      pool.sort((x,y)=> similarityScore(correct,y)-similarityScore(correct,x));
      const slice = pool.slice(0, Math.max(120, Math.floor(pool.length*0.35)));
      shuffle(slice);
      pool.length = 0;
      for (let i=0;i<slice.length;i++) pool.push(slice[i]);
    } else if (d === 2){
      const filt = pool.filter(w => (w[0]===correct[0]) || Math.abs(w.length-correct.length)<=1);
      shuffle(filt);
      pool.length = 0;
      for (let i=0;i<filt.length;i++) pool.push(filt[i]);
    } else {
      shuffle(pool);
    }

    const out=[];
    for (let i=0;i<pool.length && out.length<n;i++){
      const w = pool[i];
      if (exclude.has(w)) continue;
      exclude.add(w);
      out.push(w);
    }
    while (out.length<n){
      const w = sampleWord(exclude);
      if (!w) break;
      exclude.add(w);
      out.push(w);
    }
    return out;
  }

  function buildOptions(correct, nChoices, difficulty){
    const options=[correct];
    const ex=new Set(options);
    if (nChoices>1){
      const ds=pickDistractors(correct, nChoices-1, difficulty, ex);
      for (let i=0;i<ds.length;i++) options.push(ds[i]);
    }
    shuffle(options);
    return { options, answerIndex: options.indexOf(correct) };
  }

  // Ladder (no highlight)
  function buildLadder(){
    if (!els.ladder) return;
    const climber = els.climber;
    const ground = els.ladder.querySelector(".ground");

    els.ladder.innerHTML = "";
    if (climber) els.ladder.appendChild(climber);
    if (ground) els.ladder.appendChild(ground);

    const H = els.ladder.clientHeight || 380;
    const topPad = 18;
    const bottomPad = 34;
    const usable = H - topPad - bottomPad;

    for (let i=1;i<=10;i++){
      const rung=document.createElement("div");
      rung.className="rung";
      rung.setAttribute("data-rung", String(i));
      const t = topPad + (usable*(10-i)/9);
      rung.style.top = t + "px";
      rung.innerHTML = '<span class="n">'+i+'</span><span class="bar"></span>';
      els.ladder.appendChild(rung);
    }
    updateLadder(0);
    if (els.scoreInline) els.scoreInline.textContent = "Correct: 0/10";
  }

  function updateLadder(correct){
    const c = Math.max(0, Math.min(10, correct));
    if (els.correctCount) els.correctCount.textContent = String(c);
    if (els.scoreInline) els.scoreInline.textContent = "Correct: " + c + "/10";
if (!els.climber || !els.ladder) return;

    let y;
    if (c === 0){
      y = (els.ladder.clientHeight || 380) - 18;
    } else {
      const target = els.ladder.querySelector('.rung[data-rung="'+c+'"]');
      y = target ? (target.offsetTop + 8) : 260;
    }
    els.climber.style.top = y + "px";
  }

  function disableChoices(on){
    if (!els.choices) return;
    const btns = els.choices.querySelectorAll("button");
    for (let i=0;i<btns.length;i++) btns[i].disabled = on;
  }

  function resetRoundUI(){
    score = 0;
    results = [];
    qIndex = 0;
    if (els.status) els.status.textContent = "";
    if (els.definition) els.definition.innerHTML = "<b>Definition:</b> Loading…";
    if (els.choices) els.choices.innerHTML = "";
    updateLadder(0);
    if (els.scoreInline) els.scoreInline.textContent = "Correct: 0/10";
  }

  function renderQuestion(){
    const q = questions[qIndex];
    if (els.qNum) els.qNum.textContent = "Question " + (qIndex + 1);

    if (!q.def){
      setLoading(true, "Loading definition… (" + Math.round((roundLoad.done/10)*100) + "%)");
      if (els.definition) els.definition.innerHTML = "<b>Definition:</b> Loading…";
      if (els.choices) els.choices.innerHTML = "";
      disableChoices(true);
      setTimeout(renderQuestion, 180);
      return;
    }

    if (els.definition) els.definition.innerHTML = "<b>Definition:</b> " + q.def;
    if (!els.choices) return;

    els.choices.innerHTML = "";
    for (let i=0;i<q.options.length;i++){
      const w = q.options[i];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice";
      btn.innerHTML = "<b>" + (LETTERS[i] || "?") + ".</b> " + w;
      btn.addEventListener("click", () => pickAnswer(i));
      els.choices.appendChild(btn);
    }
  }

  function esc(s){
    return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
  }

  function finishRound(){
    setVisible(els.quizCard, false);
    setVisible(els.resultCard, true);

    const pct = Math.round((score/10)*100);
    if (els.pct) els.pct.textContent = pct + "%";
    if (els.correct) els.correct.textContent = String(score);

    if (!els.recap) return;

    const rows = results.slice(0,10);
    els.recap.innerHTML = rows.map((r, idx) => `
      <div class="miss">
        <div class="muted"><b>Q${idx+1} Definition:</b> ${esc(r.def)}</div>
        <div>
          <b>Correct:</b> ${esc(r.correct)} &nbsp; | &nbsp;
          <b>Your answer:</b> ${esc(r.picked)}
          &nbsp; ${r.isCorrect ? '<span class="pill" style="padding:4px 8px; font-size:12px;">✅</span>' : '<span class="pill" style="padding:4px 8px; font-size:12px;">❌</span>'}
        </div>
      </div>
    `).join("");
  }

  function pickAnswer(i){
    const q = questions[qIndex];
    disableChoices(true);

    const chosen = q.options[i];
    const correct = q.options[q.answerIndex];

    const isCorrect = (i === q.answerIndex);
    results.push({ def: q.def, picked: chosen, correct: correct, isCorrect });

    if (isCorrect){
      score += 1;
      updateLadder(score);
      if (els.status) els.status.textContent = "✅ Correct";
    } else {
      if (els.status) els.status.textContent = "❌ Wrong (Correct: " + correct + ")";
    }

    setTimeout(() => {
      qIndex += 1;
      if (els.status) els.status.textContent = "";
      if (qIndex >= 10) finishRound();
      else { disableChoices(false); renderQuestion(); }
    }, 220);
  }

  async function loadOne(i, exclude, nChoices, difficulty){
    const q = questions[i];
    const t0 = performance.now();
    const d = await fetchDefinition(q.word);
    const dt = Math.max(0.05, (performance.now()-t0)/1000);

    roundLoad.times.push(dt);
    const avg = roundLoad.times.reduce((a,b)=>a+b,0) / roundLoad.times.length;

    if (d){
      q.def = d;
      used.add(q.word);
      roundLoad.done += 1;
      setLoadingProgress(roundLoad.done, 10, avg);
      return true;
    }

    const newExclude = new Set([...exclude, ...questions.map(x=>x.word)]);
    for (let tries=0; tries<60; tries++){
      const cand = sampleWord(newExclude);
      if (!cand) break;
      newExclude.add(cand);
      const nd = await fetchDefinition(cand);
      if (nd){
        q.word = cand;
        q.def = nd;
        const built = buildOptions(cand, nChoices, difficulty);
        q.options = built.options;
        q.answerIndex = built.answerIndex;

        used.add(cand);
        roundLoad.done += 1;
        setLoadingProgress(roundLoad.done, 10, avg);
        return true;
      }
    }
    return false;
  }

  async function buildRound(){
    const cfg = MODE_MAP[mode] || MODE_MAP.medium;
    const nChoices = cfg.nChoices;
    const difficulty = cfg.difficulty;

    questions = [];
    if (used.size > WORDS.length - 25) used = new Set();

    const picked = [];
    const exclude = new Set(used);
    while (picked.length < 10){
      const w = sampleWord(exclude);
      if (!w) break;
      exclude.add(w);
      picked.push(w);
    }
    if (picked.length < 10) return false;

    questions = picked.map(w => {
      const built = buildOptions(w, nChoices, difficulty);
      return { word: w, def: null, options: built.options, answerIndex: built.answerIndex };
    });

    roundLoad = { done: 0, total: 10, times: [] };
    setLoadingProgress(0, 10, 0);

    const ok0 = await loadOne(0, exclude, nChoices, difficulty);
    if (!ok0) { setLoading(false); return false; }

    // background load remaining (non-blocking)
    (async () => {
      for (let i=1;i<10;i++){
        const ok = await loadOne(i, exclude, nChoices, difficulty);
        if (!ok) break;
      }
      setLoading(false);
    })();

    return true;
  }

  async function startRound(){
    round += 1;
    if (els.roundNum) els.roundNum.textContent = String(round);

    resetRoundUI();
    buildLadder();

    setVisible(els.resultCard, false);
    setVisible(els.quizCard, true);

    const ok = await buildRound();
    if (!ok){
      setVisible(els.quizCard, false);
      setVisible(els.resultCard, true);
      if (els.pct) els.pct.textContent = "0%";
      if (els.correct) els.correct.textContent = "0";
      if (els.recap) els.recap.innerHTML = '<div class="pill">Definitions didn’t load fast enough. Try again or switch networks.</div>';
      return;
    }

    disableChoices(false);
    renderQuestion();
  }

  function showModal(){ if (els.overlay) els.overlay.style.display = "flex"; }
  function hideModal(){ if (els.overlay) els.overlay.style.display = "none"; }

  function chooseDifficulty(m){
    mode = m;
    hideModal();
    startRound();
  }

  // Wire
  function wire(){
    if (els.mEasy) els.mEasy.addEventListener("click", () => chooseDifficulty("easy"));
    if (els.mMedium) els.mMedium.addEventListener("click", () => chooseDifficulty("medium"));
    if (els.mHard) els.mHard.addEventListener("click", () => chooseDifficulty("hard"));
    if (els.mExtreme) els.mExtreme.addEventListener("click", () => chooseDifficulty("extreme"));

    if (els.nextBtn) els.nextBtn.addEventListener("click", () => startRound());
    if (els.restartBtn) els.restartBtn.addEventListener("click", () => {
      round = 0;
      used = new Set();
      questions = [];
      setVisible(els.resultCard, false);
      setVisible(els.quizCard, false);
      showModal();
    });

    window.addEventListener("keydown", (e) => {
      if (!els.overlay || els.overlay.style.display !== "flex") return;
      if (e.key === "1") chooseDifficulty("easy");
      if (e.key === "2") chooseDifficulty("medium");
      if (e.key === "3") chooseDifficulty("hard");
      if (e.key === "4") chooseDifficulty("extreme");
    });

    setVisible(els.quizCard, false);
    setVisible(els.resultCard, false);
    showModal();
  }

  // Run immediately (scripts are at end of body)
  wire();
})();
