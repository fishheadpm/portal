'use strict';

const MENU_URL = `config/menu.json?v=${Date.now()}`;
const HISTORY_STORAGE_PREFIX = 'studyCommon.history.v1';
const PROGRESS_STORAGE_PREFIX = 'studyCommon.progress.v1';

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

function historyStorageKey() {
  return `${HISTORY_STORAGE_PREFIX}.${state.data.app.id}`;
}

function progressStorageKey() {
  return `${PROGRESS_STORAGE_PREFIX}.${state.data.app.id}`;
}

function loadStorageObject(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || {};
  } catch {
    return {};
  }
}

function saveStorageObject(key, value) {
  if (Object.keys(value).length === 0) {
    localStorage.removeItem(key);
  } else {
    localStorage.setItem(key, JSON.stringify(value));
  }
}

function loadHistory() {
  return loadStorageObject(historyStorageKey());
}

function loadAllProgress() {
  return loadStorageObject(progressStorageKey());
}

function loadRoundProgress(roundId) {
  return loadAllProgress()[roundId] || null;
}

function clearRoundProgress(roundId) {
  const progress = loadAllProgress();
  delete progress[roundId];
  saveStorageObject(progressStorageKey(), progress);
}

function saveCurrentProgress() {
  if (!state.currentRound || state.questions.length === 0) return;

  const progress = loadAllProgress();
  progress[state.currentRound.id] = {
    questionIds: state.questions.map(question => question.id),
    currentIndex: state.currentIndex,
    known: state.known,
    unknown: state.unknown,
    unknownQuestionIds: state.unknownQuestions.map(question => question.id),
    updatedAt: new Date().toISOString()
  };
  saveStorageObject(progressStorageKey(), progress);
}

function hasContinuableProgress(round) {
  const progress = loadRoundProgress(round.id);
  return Boolean(
    progress &&
    Array.isArray(progress.questionIds) &&
    progress.questionIds.length > 0 &&
    Number.isInteger(progress.currentIndex) &&
    progress.currentIndex >= 0 &&
    progress.currentIndex < progress.questionIds.length
  );
}

function getRoundHistorySummary(roundId) {
  const roundHistory = loadHistory()[roundId] || {};
  return Object.values(roundHistory).reduce((summary, record) => {
    summary.known += Number(record.knownCount) || 0;
    summary.unknown += Number(record.unknownCount) || 0;
    return summary;
  }, { known: 0, unknown: 0 });
}

function renderRounds() {
  showOnly(el.roundScreen);
  el.roundList.innerHTML = '';

  if (state.data.rounds.length === 0) {
    el.roundList.innerHTML = '<p class="empty">学習範囲が登録されていません。</p>';
    return;
  }

  for (const round of state.data.rounds) {
    const card = document.createElement('section');
    card.className = 'round-card';

    const heading = document.createElement('h3');
    heading.className = 'round-card-title';
    heading.textContent = round.name;

    const summary = getRoundHistorySummary(round.id);
    const status = document.createElement('p');
    status.className = 'round-card-status';
    status.textContent = `問題数：${round.questions.length}　わかっていた：${summary.known}　わからなかった：${summary.unknown}`;

    const actions = document.createElement('div');
    actions.className = 'round-actions';

    const startButton = document.createElement('button');
    startButton.type = 'button';
    startButton.className = 'primary-button';
    startButton.textContent = '初めからやる';
    startButton.addEventListener('click', () => startRoundFromBeginning(round));

    const continueButton = document.createElement('button');
    continueButton.type = 'button';
    continueButton.className = 'secondary-button';
    continueButton.textContent = '続きからやる';
    continueButton.disabled = !hasContinuableProgress(round);
    continueButton.addEventListener('click', () => continueRound(round));

    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.className = 'reset-history-button';
    resetButton.textContent = '履歴の削除';
    resetButton.addEventListener('click', () => resetRoundData(round));

    actions.append(startButton, continueButton, resetButton);
    card.append(heading, status, actions);
    el.roundList.appendChild(card);
  }
}

function prepareQuestionOrder(round, source = round.questions) {
  return round.shuffle === true ? shuffle(source) : [...source];
}

function startRoundFromBeginning(round, questionOverride = null) {
  clearRoundProgress(round.id);
  state.currentRound = round;
  state.questions = prepareQuestionOrder(round, questionOverride || round.questions);
  state.currentIndex = 0;
  state.known = 0;
  state.unknown = 0;
  state.unknownQuestions = [];

  if (state.questions.length === 0) {
    showError('この範囲には問題がありません。');
    return;
  }

  saveCurrentProgress();
  showOnly(el.studyScreen);
  renderQuestion();
}

function continueRound(round) {
  const progress = loadRoundProgress(round.id);
  if (!progress) {
    renderRounds();
    return;
  }

  const questionMap = new Map(round.questions.map(question => [question.id, question]));
  const restoredQuestions = progress.questionIds
    .map(id => questionMap.get(id))
    .filter(Boolean);

  if (
    restoredQuestions.length !== progress.questionIds.length ||
    progress.currentIndex >= restoredQuestions.length
  ) {
    clearRoundProgress(round.id);
    window.alert('問題データが変更されたため、保存されていた途中経過を利用できません。初めから開始してください。');
    renderRounds();
    return;
  }

  state.currentRound = round;
  state.questions = restoredQuestions;
  state.currentIndex = progress.currentIndex;
  state.known = Number(progress.known) || 0;
  state.unknown = Number(progress.unknown) || 0;
  state.unknownQuestions = (progress.unknownQuestionIds || [])
    .map(id => questionMap.get(id))
    .filter(Boolean);

  showOnly(el.studyScreen);
  renderQuestion();
}

function resetRoundData(round) {
  const confirmed = window.confirm(
    `「${round.name}」の正解・間違い履歴と途中経過をすべて削除します。\nこの操作は元に戻せません。`
  );
  if (!confirmed) return;

  const history = loadHistory();
  delete history[round.id];
  saveStorageObject(historyStorageKey(), history);
  clearRoundProgress(round.id);

  renderRounds();
  window.alert(`「${round.name}」の履歴を削除しました。`);
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

  saveStorageObject(historyStorageKey(), history);
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
    clearRoundProgress(state.currentRound.id);
    renderResult();
  } else {
    saveCurrentProgress();
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
  startRoundFromBeginning(state.currentRound, [...state.unknownQuestions]);
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
