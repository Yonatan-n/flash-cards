// ─────────────────────────────────────────────
//  STRINGS — change this object to localise the UI
// ─────────────────────────────────────────────
const S = {
  appTitle: 'German Flashcards',
  practiceNew: 'Practice New Words',
  practiceOld: 'Practice Old Words',
  noOldWords: 'No mastered words yet — practice some new words first!',
  cardOf: (i, n) => `${i} / ${n}`,
  tapToReveal: 'Tap to reveal',
  reveal: 'Reveal',
  prev: '← Prev',
  next: 'Next →',
  startTest: 'Start Test',
  translateToHebrew: 'Type the Hebrew translation…',
  translateToGerman: 'Type the German translation…',
  submit: 'Submit',
  correct: '✓ Correct!',
  wrong: '✗ Wrong',
  correctAnswer: 'Correct answer:',
  testResult: (c, t) => `${c} / ${t} correct`,
  backToHome: 'Back to Home',
  exportData: 'Export Data',
  importData: 'Import Data',
  importDone: 'Data imported!',
  importError: 'Import failed — invalid file.',
  summary: 'Summary',
  masteredBadge: '🎉 All correct!',
  german: 'German',
  hebrew: 'Hebrew',
};

// ─────────────────────────────────────────────
//  STORAGE
// ─────────────────────────────────────────────
const STORE_KEY = 'de_he_flashcards_v1';

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { }
  return { mastered: [], history: [] };
}

function saveStore(st) {
  localStorage.setItem(STORE_KEY, JSON.stringify(st));
}

// ─────────────────────────────────────────────
//  WORD DATA
// ─────────────────────────────────────────────
let ALL_WORDS = [];

async function loadWords() {
  const resp = await fetch('words_clean.csv');
  const text = await resp.text();
  const lines = text.trim().split('\n').slice(1);
  ALL_WORDS = lines.map(line => {
    const m = line.match(/^"([^"]*?)","([^"]*?)"$/) ||
      line.match(/^([^,]+),(.+)$/);
    if (!m) return null;
    return { german: m[1].trim(), hebrew: m[2].trim() };
  }).filter(Boolean);
}

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalise(s) {
  return s.replace(/[֑-ׇ]/g, '').trim().toLowerCase();
}

function isCorrect(input, expected) {
  const a = normalise(input);
  const b = normalise(expected);
  if (a === b) return true;
  return b.split(/[,،]/).map(s => s.trim()).some(opt => a === opt);
}

// Assign directions: roughly half 'de' (German shown, type Hebrew),
// half 'he' (Hebrew shown, type German), shuffled.
function assignDirections(words) {
  const n = words.length;
  const half = Math.round(n / 2);
  const dirs = shuffle([
    ...Array(half).fill('de'),
    ...Array(n - half).fill('he'),
  ]);
  return words.map((w, i) => ({ ...w, dir: dirs[i] }));
}

// ─────────────────────────────────────────────
//  RENDER
// ─────────────────────────────────────────────
const app = document.getElementById('app');

function render(html) {
  app.innerHTML = html;
  app.classList.remove('slide-in');
  void app.offsetWidth;
  app.classList.add('slide-in');
}

// ─────────────────────────────────────────────
//  HOME
// ─────────────────────────────────────────────
function showHome() {
  const st = loadStore();
  const masteredSet = new Set(st.mastered);
  const totalNew = ALL_WORDS.length - masteredSet.size;
  const totalOld = masteredSet.size;

  render(`
    <div class="flex flex-col flex-1 px-6 pt-12 pb-8 gap-6">
      <div class="text-center mb-2">
        <h1 class="text-3xl font-bold tracking-tight">${S.appTitle}</h1>
        <p class="text-indigo-300 mt-1 text-sm">${totalOld} mastered · ${totalNew} remaining</p>
      </div>

      <div class="flex flex-col gap-4 mt-4">
        <button id="btn-new" class="w-full py-5 rounded-2xl font-bold text-xl bg-indigo-500 active:bg-indigo-600 active:scale-95 transition-all shadow-lg">
          ${S.practiceNew}
        </button>
        <button id="btn-old" class="w-full py-5 rounded-2xl font-bold text-xl bg-violet-700 active:bg-violet-800 active:scale-95 transition-all shadow-lg ${totalOld === 0 ? 'opacity-40' : ''}">
          ${S.practiceOld}
        </button>
      </div>

      <div class="flex-1"></div>

      <div class="flex gap-3">
        <button id="btn-export" class="flex-1 py-3 rounded-xl text-sm font-medium bg-indigo-900 active:bg-indigo-800 active:scale-95 transition-all">
          ${S.exportData}
        </button>
        <label class="flex-1 py-3 rounded-xl text-sm font-medium bg-indigo-900 active:bg-indigo-800 active:scale-95 transition-all text-center cursor-pointer">
          ${S.importData}
          <input type="file" accept=".json" class="hidden" id="import-file" />
        </label>
      </div>
      <div id="import-msg" class="text-center text-sm text-indigo-300 h-4"></div>
    </div>
  `);

  document.getElementById('btn-new').onclick = () => startLearn('new');
  document.getElementById('btn-old').onclick = () => { if (totalOld > 0) startLearn('old'); };
  document.getElementById('btn-export').onclick = exportData;
  document.getElementById('import-file').onchange = importData;
}

// ─────────────────────────────────────────────
//  LEARN
// ─────────────────────────────────────────────
let learnWords = [];
let learnMode = 'new';
let cardIndex = 0;
let revealed = [];

function startLearn(mode) {
  learnMode = mode;
  const st = loadStore();
  const masteredSet = new Set(st.mastered);

  let pool = ALL_WORDS.map((w, i) => ({ ...w, idx: i }));
  pool = mode === 'new'
    ? pool.filter(w => !masteredSet.has(w.idx))
    : pool.filter(w => masteredSet.has(w.idx));

  if (pool.length === 0) { showHome(); return; }

  learnWords = assignDirections(shuffle(pool).slice(0, 10));
  cardIndex = 0;
  revealed = new Array(learnWords.length).fill(false);
  showLearnCard();
}

function showLearnCard() {
  const word = learnWords[cardIndex];
  const isRevealed = revealed[cardIndex];
  const allRevealed = revealed.every(Boolean);
  const isHe = word.dir === 'he';

  const qLang = isHe ? S.hebrew : S.german;
  const qText = isHe ? word.hebrew : word.german;
  const aLang = isHe ? S.german : S.hebrew;
  const aText = isHe ? word.german : word.hebrew;
  const aClass = isHe ? 'text-3xl font-bold' : 'he text-2xl font-semibold text-emerald-300';

  render(`
    <div class="flex flex-col flex-1 px-5 pt-10 pb-8 gap-5">
      <div class="flex items-center justify-between text-indigo-300 text-sm">
        <button id="btn-back-home" class="text-indigo-400 text-sm">← Home</button>
        <span>${S.cardOf(cardIndex + 1, learnWords.length)}</span>
      </div>

      <div class="flex justify-center gap-1.5">
        ${learnWords.map((_, i) => `
          <div class="h-2 w-2 rounded-full transition-colors ${i === cardIndex ? 'bg-white' :
      revealed[i] ? 'bg-indigo-400' : 'bg-indigo-800'
    }"></div>
        `).join('')}
      </div>

      <div id="card" class="flex-1 flex flex-col items-center justify-center rounded-3xl bg-indigo-900 shadow-xl px-8 py-10 gap-6 min-h-[280px] ${!isRevealed ? 'cursor-pointer active:scale-[0.98] transition-transform' : ''}">
        <div class="text-center">
          <p class="text-xs uppercase tracking-widest text-indigo-400 mb-2">${qLang}</p>
          <p class="${isHe ? 'he text-2xl font-semibold text-emerald-300' : 'text-3xl font-bold leading-tight'}">${qText}</p>
        </div>
        ${isRevealed ? `
          <div class="w-16 h-px bg-indigo-700"></div>
          <div class="text-center">
            <p class="text-xs uppercase tracking-widest text-indigo-400 mb-2">${aLang}</p>
            <p class="${aClass}">${aText}</p>
          </div>
        ` : `
          <div id="card-hint" class="mt-4 text-indigo-500 text-sm">${S.tapToReveal}</div>
        `}
      </div>

      <div class="flex gap-3">
        <button onclick="prevCard()" class="flex-1 py-3 rounded-xl font-medium bg-indigo-900 active:bg-indigo-800 active:scale-95 transition-all ${cardIndex === 0 ? 'opacity-30' : ''}" ${cardIndex === 0 ? 'disabled' : ''}>
          ${S.prev}
        </button>
        <button id="btn-action"
          class="flex-1 py-3 rounded-xl font-semibold bg-indigo-500 active:bg-indigo-600 active:scale-95 transition-all ${isRevealed && cardIndex === learnWords.length - 1 ? 'opacity-30' : ''}">
          ${isRevealed ? S.next : S.reveal}
        </button>
      </div>

      <div id="start-test-area">
        ${allRevealed
      ? `<button onclick="startTest()" class="w-full py-4 rounded-2xl font-bold text-lg bg-emerald-600 active:bg-emerald-700 active:scale-95 transition-all shadow-lg">${S.startTest}</button>`
      : `<div class="h-14"></div>`}
      </div>
    </div>
  `);

  document.getElementById('btn-back-home').onclick = showHome;

  const actionBtn = document.getElementById('btn-action');
  if (isRevealed) {
    if (cardIndex < learnWords.length - 1) {
      actionBtn.onclick = nextCard;
    } else {
      actionBtn.disabled = true;
    }
  } else {
    actionBtn.onclick = revealCurrent;
    document.getElementById('card').onclick = revealCurrent;
  }
}

function revealCurrent() {
  revealed[cardIndex] = true;
  const word = learnWords[cardIndex];
  const isHe = word.dir === 'he';
  const aLang = isHe ? S.german : S.hebrew;
  const aText = isHe ? word.german : word.hebrew;
  const aClass = isHe ? 'text-3xl font-bold' : 'he text-2xl font-semibold text-emerald-300';

  // Update card in-place — no full re-render, so no flash
  const card = document.getElementById('card');
  card.removeAttribute('onclick');
  card.classList.remove('cursor-pointer', 'active:scale-[0.98]', 'transition-transform');

  const hint = document.getElementById('card-hint');
  if (hint) hint.remove();

  const answerEl = document.createElement('div');
  answerEl.className = 'flex flex-col items-center gap-6';
  answerEl.style.opacity = '0';
  answerEl.style.transition = 'opacity 0.5s ease';
  answerEl.innerHTML = `
    <div class="w-16 h-px bg-indigo-700"></div>
    <div class="text-center">
      <p class="text-xs uppercase tracking-widest text-indigo-400 mb-2">${aLang}</p>
      <p class="${aClass}">${aText}</p>
    </div>
  `;
  card.appendChild(answerEl);

  // Trigger fade-in on next paint
  requestAnimationFrame(() => requestAnimationFrame(() => {
    answerEl.style.opacity = '1';
  }));

  // Swap Reveal → Next
  const actionBtn = document.getElementById('btn-action');
  actionBtn.textContent = S.next;
  if (cardIndex < learnWords.length - 1) {
    actionBtn.onclick = nextCard;
  } else {
    actionBtn.disabled = true;
    actionBtn.classList.add('opacity-30');
  }

  // Show Start Test if all cards revealed
  if (revealed.every(Boolean)) {
    const area = document.getElementById('start-test-area');
    area.innerHTML = `<button onclick="startTest()" class="w-full py-4 rounded-2xl font-bold text-lg bg-emerald-600 active:bg-emerald-700 active:scale-95 transition-all shadow-lg">${S.startTest}</button>`;
  }
}

function nextCard() {
  if (cardIndex < learnWords.length - 1) { cardIndex++; showLearnCard(); }
}

function prevCard() {
  if (cardIndex > 0) { cardIndex--; showLearnCard(); }
}

// ─────────────────────────────────────────────
//  TEST
// ─────────────────────────────────────────────
let testWords = [];
let testIndex = 0;
let testResults = [];

function startTest() {
  testWords = shuffle([...learnWords]); // keeps dir from learn phase
  testIndex = 0;
  testResults = [];
  showTestCard();
}

function showTestCard() {
  const word = testWords[testIndex];
  const isHe = word.dir === 'he';
  const qLang = isHe ? S.hebrew : S.german;
  const qText = isHe ? word.hebrew : word.german;
  const placeholder = isHe ? S.translateToGerman : S.translateToHebrew;

  render(`
    <div class="flex flex-col flex-1 px-5 pt-10 pb-8 gap-5">
      <div class="flex items-center justify-between text-indigo-300 text-sm">
        <button id="btn-back-home" class="text-indigo-400 text-sm">← Home</button>
        <span>${S.cardOf(testIndex + 1, testWords.length)}</span>
      </div>

      <div class="flex justify-center gap-1.5">
        ${testWords.map((_, i) => `
          <div class="h-2 w-2 rounded-full transition-colors ${i < testIndex ? (testResults[i]?.correct ? 'bg-emerald-400' : 'bg-red-400') :
      i === testIndex ? 'bg-white' : 'bg-indigo-800'
    }"></div>
        `).join('')}
      </div>

      <div class="flex-1 flex flex-col items-center justify-center rounded-3xl bg-indigo-900 shadow-xl px-8 py-10 gap-4 min-h-[260px]">
        <p class="text-xs uppercase tracking-widest text-indigo-400">Translate to ${isHe ? S.german : S.hebrew}</p>
        <p class="${isHe ? 'he text-2xl font-semibold text-emerald-300' : 'text-3xl font-bold text-center leading-tight'}">${qText}</p>
      </div>

      <div class="flex flex-col gap-3">
        <input id="test-input" type="text" dir="${isHe ? 'ltr' : 'rtl'}"
          placeholder="${placeholder}"
          class="w-full py-4 px-5 rounded-2xl bg-indigo-900 border-2 border-indigo-700 focus:border-indigo-400 outline-none text-lg ${isHe ? 'text-left' : 'text-right'} placeholder-indigo-600 transition-colors"
          autocomplete="off" autocorrect="off" spellcheck="false" />
        <button id="submit-btn" onclick="submitAnswer()"
          class="w-full py-4 rounded-2xl font-bold text-lg bg-indigo-500 active:bg-indigo-600 active:scale-95 transition-all">
          ${S.submit}
        </button>
      </div>
    </div>
  `);

  document.getElementById('btn-back-home').onclick = showHome;
  const input = document.getElementById('test-input');
  input.focus();
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submitAnswer(); });
}

function submitAnswer() {
  const submitBtn = document.getElementById('submit-btn');
  if (submitBtn.disabled) return;
  submitBtn.disabled = true;

  const input = document.getElementById('test-input');
  const userInput = input.value.trim();
  if (!userInput) { submitBtn.disabled = false; return; }

  const word = testWords[testIndex];
  const expected = word.dir === 'he' ? word.german : word.hebrew;
  const correct = isCorrect(userInput, expected);
  testResults[testIndex] = { german: word.german, hebrew: word.hebrew, input: userInput, correct, dir: word.dir };

  input.disabled = true;
  input.classList.add(correct ? 'border-emerald-400' : 'border-red-400');

  if (correct) {
    submitBtn.textContent = S.correct;
    submitBtn.className = 'w-full py-4 rounded-2xl font-bold text-lg bg-emerald-600 transition-all';
  } else {
    submitBtn.textContent = S.wrong;
    submitBtn.className = 'w-full py-4 rounded-2xl font-bold text-lg bg-red-600 transition-all';
    const hint = document.createElement('div');
    hint.className = 'text-center text-sm mt-1 flex flex-col items-center gap-0.5';
    hint.innerHTML = `
      <span class="text-indigo-300">${S.correctAnswer}</span>
      <span class="${word.dir === 'de' ? 'he' : ''} text-emerald-300">${expected}</span>
    `;
    submitBtn.after(hint);
  }

  const isLast = testIndex === testWords.length - 1;
  const nextBtn = document.createElement('button');
  nextBtn.textContent = isLast ? S.summary : S.next;
  nextBtn.className = 'w-full py-4 rounded-2xl font-bold text-lg bg-indigo-500 active:bg-indigo-600 active:scale-95 transition-all';
  nextBtn.onclick = () => {
    testIndex++;
    if (testIndex < testWords.length) {
      app.style.transition = 'opacity 0.2s ease';
      app.style.opacity = '0';
      setTimeout(() => {
        app.style.transition = '';
        app.style.opacity = '';
        showTestCard();
      }, 200);
    } else {
      showSummary();
    }
  };
  submitBtn.after(nextBtn);
}

// ─────────────────────────────────────────────
//  SUMMARY
// ─────────────────────────────────────────────
function showSummary() {
  const correct = testResults.filter(r => r.correct).length;
  const total = testResults.length;

  const st = loadStore();
  const masteredSet = new Set(st.mastered);
  for (const r of testResults) {
    const idx = ALL_WORDS.findIndex(w => w.german === r.german && w.hebrew === r.hebrew);
    if (idx === -1) continue;
    if (r.correct) masteredSet.add(idx);
    else masteredSet.delete(idx);
  }
  st.mastered = [...masteredSet];
  st.history.push({ date: new Date().toISOString(), mode: learnMode, correct, total });
  saveStore(st);

  render(`
    <div class="flex flex-col flex-1 px-5 pt-10 pb-8 gap-5 overflow-y-auto">
      <div class="text-center">
        <h2 class="text-2xl font-bold">${S.summary}</h2>
        <p class="text-indigo-300 mt-1">${S.testResult(correct, total)}</p>
        ${correct === total ? `<p class="mt-2 text-lg">${S.masteredBadge}</p>` : ''}
      </div>

      <div class="flex flex-col gap-3 flex-1">
        ${testResults.map(r => `
          <div class="rounded-2xl px-5 py-4 ${r.correct ? 'bg-emerald-900/60 border border-emerald-700' : 'bg-red-900/60 border border-red-700'}">
            <p class="font-semibold text-base">${r.german}</p>
            <p class="he text-sm mt-1 ${r.correct ? 'text-emerald-300' : 'text-white font-medium'}">${r.hebrew}</p>
            ${!r.correct ? `<p class="text-red-300 text-xs mt-0.5">${r.dir === 'de' ? 'You typed: ' : 'כתבת: '}${r.input}</p>` : ''}
          </div>
        `).join('')}
      </div>

      <button onclick="showHome()" class="w-full py-4 rounded-2xl font-bold text-lg bg-indigo-500 active:bg-indigo-600 active:scale-95 transition-all mt-2">
        ${S.backToHome}
      </button>
    </div>
  `);
}

// ─────────────────────────────────────────────
//  IMPORT / EXPORT
// ─────────────────────────────────────────────
function exportData() {
  const st = loadStore();
  const blob = new Blob([JSON.stringify(st, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'flashcards_data.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data.mastered || !Array.isArray(data.mastered)) throw new Error();
      saveStore(data);
      document.getElementById('import-msg').textContent = S.importDone;
      setTimeout(() => showHome(), 800);
    } catch {
      document.getElementById('import-msg').textContent = S.importError;
      document.getElementById('import-msg').classList.add('text-red-400');
    }
  };
  reader.readAsText(file);
}

// ─────────────────────────────────────────────
//  BOOT
// ─────────────────────────────────────────────
loadWords().then(showHome).catch(err => {
  app.innerHTML = `<div class="flex-1 flex items-center justify-center p-8 text-center text-red-300">
    Failed to load word list.<br/><small>${err.message}</small>
  </div>`;
});
