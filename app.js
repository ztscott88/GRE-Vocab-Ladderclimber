let mode = null;
let score = 0;
let qIndex = 0;
let questions = [];

const els = {
  overlay: document.getElementById("difficultyOverlay"),
  qNum: document.getElementById("qNum"),
  definition: document.getElementById("definition"),
  choices: document.getElementById("choices"),
  climber: document.getElementById("climber"),
  scoreInline: document.getElementById("scoreInline"),
};

const MODES = {
  easy: 3,
  medium: 5,
  hard: 6,
  extreme: 10
};

document.getElementById("mEasy").onclick = () => start("easy");
document.getElementById("mMedium").onclick = () => start("medium");
document.getElementById("mHard").onclick = () => start("hard");
document.getElementById("mExtreme").onclick = () => start("extreme");

function start(selected){
  mode = selected;
  score = 0;
  qIndex = 0;
  els.overlay.style.display = "none";
  els.scoreInline.textContent = "Correct: 0/10";
  buildQuestions();
  render();
}

function buildQuestions(){
  questions = [];
  const shuffled = WORDS.slice().sort(() => Math.random() - 0.5).slice(0,10);

  shuffled.forEach(w => {
    const options = WORDS.slice().sort(() => Math.random() - 0.5)
      .slice(0, MODES[mode] - 1);
    options.push(w.word);
    options.sort(() => Math.random() - 0.5);

    questions.push({
      word: w.word,
      def: w.def,
      options,
      answer: options.indexOf(w.word)
    });
  });
}

function render(){
  const q = questions[qIndex];
  els.qNum.textContent = `Question ${qIndex + 1}`;
  els.definition.textContent = q.def;
  els.choices.innerHTML = "";

  q.options.forEach((opt, i) => {
    const b = document.createElement("button");
    b.className = "choice";
    b.textContent = opt;
    b.onclick = () => answer(i);
    els.choices.appendChild(b);
  });
}

function answer(i){
  if (i === questions[qIndex].answer){
    score++;
    els.scoreInline.textContent = `Correct: ${score}/10`;
    els.climber.style.bottom = `${score * 10}%`;
  }
  qIndex++;
  if (qIndex < 10) render();
  else alert(`Finished! Score: ${score}/10`);
}