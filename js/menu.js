'use strict';

const MENU_URL = `config/menu.json?v=${Date.now()}`;

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getQuery(name) {
  return new URLSearchParams(location.search).get(name);
}

async function loadMenu() {
  const response = await fetch(MENU_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error('config/menu.jsonを読み込めませんでした。');
  return response.json();
}

function createLink(label, href, isExternal = false) {
  const link = document.createElement('a');
  link.className = `menu-button${isExternal ? ' external' : ''}`;
  link.textContent = label;
  link.href = href;
  if (isExternal) {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }
  return link;
}

function showError(targetId, message) {
  const target = document.getElementById(targetId);
  if (target) target.innerHTML = `<p class="error">${escapeHtml(message)}</p>`;
}

function renderTop(menu) {
  document.title = menu.siteTitle || '学習アプリメニュー';
  document.getElementById('pageTitle').textContent = menu.siteTitle || '学習アプリメニュー';
  const list = document.getElementById('subjectList');
  list.innerHTML = '';

  for (const subject of menu.subjects || []) {
    list.appendChild(createLink(subject.name, `subject.html?subject=${encodeURIComponent(subject.id)}`));
  }
}

function resolveItemUrl(item) {
  if (item.type === 'common') {
    return `app.html?course=${encodeURIComponent(item.id)}`;
  }
  return item.url || '#';
}

function renderSubject(menu) {
  const subjectId = getQuery('subject');
  const subject = (menu.subjects || []).find(item => item.id === subjectId);
  if (!subject) {
    showError('appList', '指定された教科が見つかりませんでした。');
    return;
  }

  document.title = `${subject.name} | ${menu.siteTitle}`;
  document.getElementById('pageTitle').textContent = subject.name;
  const list = document.getElementById('appList');
  list.innerHTML = '';

  if (!subject.items?.length) {
    list.innerHTML = '<p class="empty">現在、登録されている教材はありません。</p>';
    return;
  }

  for (const item of subject.items) {
    const isExternal = item.type !== 'common';
    list.appendChild(createLink(item.title, resolveItemUrl(item), isExternal));
  }
}

loadMenu()
  .then(menu => {
    const page = document.body.dataset.page;
    if (page === 'top') renderTop(menu);
    if (page === 'subject') renderSubject(menu);
  })
  .catch(error => {
    const target = document.body.dataset.page === 'top' ? 'subjectList' : 'appList';
    showError(target, error.message);
  });
