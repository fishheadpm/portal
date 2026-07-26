'use strict';

const MENU_URL = `config/menu.json?v=${Date.now()}`;
const STORAGE_PREFIX = 'studyCommon.history.v1';

const state = {
  course: null,
  data: null,
  currentRound: null,
  questions: [],
  currentIndex: 0,
  known: 0,
  unknown: 0,
  unknownQuestions: []
};

const el = {};

function cacheElements() {
  [
    'appTitle', 'appDescription', 'roundScreen', 'roundList', 'subjectBackLink',
    'studyScreen', 'roundName', 'progressText', 'questionCard', 'questionText',
    'questionNote', 'answerArea', 'answerText', 'explanationText',
    'revealControls', 'judgementControls', 'showAnswerButton', 'unknownButton',
    'knownButton', 'quitButton', 'resultScreen', 'resultTotal', 'resultKnown',
    'resultUnknown', 'retryUnknownButton', 'returnRoundsButton', 'errorScreen',
    'errorMessage'
  ].forEach(id => { el[id] = document.getElementById(id); });
}

function getQuery(name) {
  return new URLSearchParams(location.search).get(name);
}

async function fetchJson(url) {
  const separator = url.includes('?') ? '&' : '?';
  const response = await fetch(`${url}${separator}v=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${url}を読み込めませんでした。`);
  return response.json();
}

function validateData(data) {
  if (!data || typeof data !== 'object') throw new Error('問題データの形式が正しくありません。');
  if (data.schemaVersion !== 1) throw new Error('対応していない問題データのバージョンです。');
  if (!data.app?.id || !data.app?.title) throw new Error('問題データにapp.idまたはapp.titleがありません。');
  if (!Array.isArray(data.rounds)) throw new Error('問題データにrounds配列がありません。');

  const questionKeys = new Set();
  for (const round of data.rounds) {
    if (!round.id || !round.name || !Array.isArray(round.questions)) {
      throw new Error('roundのid、name、questionsを確認してください。');
    }
    for (const question of round.questions) {
      if (!question.id || question.question == null || question.answer == null) {
        throw new Error(`${round.name}に必須項目の不足した問題があります。`);
      }
      const key = `${round.id}/${question.id}`;
      if (questionKeys.has(key)) throw new Error(`問題IDが重複しています: ${key}`);
      questionKeys.add(key);
    }
  }
}

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function showOnly(screen) {
  [el.roundScreen, el.studyScreen, el.resultScreen, el.errorScreen]
    .forEach(item => item.classList.toggle('hidden', item !== screen));
}

function renderRounds() {
  showOnly(el.roundScreen);
  el.roundList.innerHTML = '';

  if (state.data.rounds.length === 0) {
    el.roundList.innerHTML = '<p class="empty">学習範囲が登録されていません。</p>';
    return;
  }

  for (const round of state.data.rounds) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'menu-button';
    button.textContent = round.name;
    button.addEventListener('click', () => startRound(round));
    el.roundList.appendChild(button);
  }
}

function startRound(round, questionOverride = null) {
  state.currentRound = round;
  const source = questionOverride || round.questions;
  state.questions = round.shuffle === true ? shuffle(source) : [...source];
  state.currentIndex = 0;
  state.known = 0;
  state.unknown = 0;
  state.unknownQuestions = [];

  if (state.questions.length === 0) {
    showError('この範囲には問題がありません。');
    return;
  }

  showOnly(el.studyScreen);
  renderQuestion();
}

function renderQuestion() {
  const question = state.questions[state.currentIndex];
  el.roundName.textContent = state.currentRound.name;
  el.progressText.textContent = `${state.currentIndex + 1} / ${state.questions.length}`;
  el.questionText.textContent = question.question;
  el.answerText.textContent = question.answer;

  el.questionNote.textContent = question.note || '';
  el.questionNote.classList.toggle('hidden', !question.note);

  el.explanationText.textContent = question.explanation || '';
  el.explanationText.classList.toggle('hidden', !question.explanation);

  const vertical = question.vertical ?? state.currentRound.vertical ?? state.data.app.vertical ?? false;
  el.questionCard.classList.toggle('vertical', vertical === true);

  el.answerArea.classList.add('hidden');
  el.revealControls.classList.remove('hidden');
  el.judgementControls.classList.add('hidden');
}

function revealAnswer() {
  el.answerArea.classList.remove('hidden');
  el.revealControls.classList.add('hidden');
  el.judgementControls.classList.remove('hidden');
}

function historyStorageKey() {
  return `${STORAGE_PREFIX}.${state.data.app.id}`;
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(historyStorageKey())) || {};
  } catch {
    return {};
  }
}

function saveJudgement(question, result) {
  const history = loadHistory();
  history[state.currentRound.id] ??= {};
  const record = history[state.currentRound.id][question.id] || {
    knownCount: 0,
    unknownCount: 0,
    lastResult: null,
    lastAnsweredAt: null
  };

  if (result === 'known') record.knownCount += 1;
  if (result === 'unknown') record.unknownCount += 1;
  record.lastResult = result;
  record.lastAnsweredAt = new Date().toISOString();
  history[state.currentRound.id][question.id] = record;

  localStorage.setItem(historyStorageKey(), JSON.stringify(history));
}

function judge(result) {
  const question = state.questions[state.currentIndex];
  saveJudgement(question, result);

  if (result === 'known') state.known += 1;
  if (result === 'unknown') {
    state.unknown += 1;
    state.unknownQuestions.push(question);
  }

  state.currentIndex += 1;
  if (state.currentIndex >= state.questions.length) {
    renderResult();
  } else {
    renderQuestion();
  }
}

function renderResult() {
  showOnly(el.resultScreen);
  el.resultTotal.textContent = String(state.questions.length);
  el.resultKnown.textContent = String(state.known);
  el.resultUnknown.textContent = String(state.unknown);
  el.retryUnknownButton.classList.toggle('hidden', state.unknownQuestions.length === 0);
}

function retryUnknown() {
  if (state.unknownQuestions.length === 0) return;
  startRound(state.currentRound, [...state.unknownQuestions]);
}

function showError(message) {
  showOnly(el.errorScreen);
  el.errorMessage.textContent = message;
}

async function initialize() {
  cacheElements();

  el.showAnswerButton.addEventListener('click', revealAnswer);
  el.knownButton.addEventListener('click', () => judge('known'));
  el.unknownButton.addEventListener('click', () => judge('unknown'));
  el.quitButton.addEventListener('click', renderRounds);
  el.returnRoundsButton.addEventListener('click', renderRounds);
  el.retryUnknownButton.addEventListener('click', retryUnknown);

  try {
    const courseId = getQuery('course');
    if (!courseId) throw new Error('教材が指定されていません。');

    const menu = await fetchJson(MENU_URL);
    const allItems = (menu.subjects || []).flatMap(subject =>
      (subject.items || []).map(item => ({ ...item, subjectId: subject.id }))
    );
    const course = allItems.find(item => item.id === courseId);

    if (!course) throw new Error('指定された教材がmenu.jsonにありません。');
    if (course.type !== 'common') throw new Error('この教材は共通アプリ形式ではありません。');
    if (!course.data) throw new Error('menu.jsonに問題データのパスがありません。');

    state.course = course;
    state.data = await fetchJson(course.data);
    validateData(state.data);

    document.title = `${state.data.app.title} | ${menu.siteTitle}`;
    el.appTitle.textContent = state.data.app.title;
    el.appDescription.textContent = state.data.app.description || '';
    el.subjectBackLink.href = `subject.html?subject=${encodeURIComponent(course.subjectId)}`;

    renderRounds();
  } catch (error) {
    showError(error.message);
  }
}

document.addEventListener('DOMContentLoaded', initialize);
