function render(){
  locked = false;

  // reset focus + selection so nothing carries over
  document.activeElement && document.activeElement.blur();
  els.choices.innerHTML = "";

  updateHUD();

  const q = round[qIndex];
  els.definition.textContent = q.def;

  q.options.forEach((opt, i) => {
    const b = document.createElement("button");
    b.className = "choice";
    b.innerHTML = `<b>${LETTERS[i]}.</b> ${opt}`;
    b.onclick = () => pick(i);
    els.choices.appendChild(b);
  });
}