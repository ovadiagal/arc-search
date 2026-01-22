let overlayOpen = false;
let overlay = null;
let allTabs = [];
let allResults = [];
let selectedIndex = 0;
let searchTimeout = null;

function createOverlay() {
  if (overlay) return;

  overlay = document.createElement('div');
  overlay.id = 'arc-search-overlay';
  overlay.innerHTML = `
    <div class="arc-search-backdrop"></div>
    <div class="arc-search-panel">
      <div class="arc-search-container">
        <input
          type="text"
          id="arc-search-input"
          placeholder="Search tabs, bookmarks, and history..."
          autocomplete="off"
        >
      </div>
      <div class="arc-search-results" id="arc-search-results">
        <div class="arc-search-empty">
          <div class="arc-search-empty-icon">🔍</div>
          <div class="arc-search-empty-text">Start typing to search...</div>
        </div>
      </div>
      <div class="arc-search-hints">
        <div class="arc-search-hint">
          <span class="arc-search-hint-key">↑↓</span>
          <span>Navigate</span>
        </div>
        <div class="arc-search-hint">
          <span class="arc-search-hint-key">Enter</span>
          <span>Select</span>
        </div>
        <div class="arc-search-hint">
          <span class="arc-search-hint-key">⌘Enter</span>
          <span>New Tab</span>
        </div>
        <div class="arc-search-hint">
          <span class="arc-search-hint-key">⇧Enter</span>
          <span>Google</span>
        </div>
        <div class="arc-search-hint">
          <span class="arc-search-hint-key">Esc</span>
          <span>Close</span>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  setupOverlayListeners();
}

async function showOverlay() {
  if (overlayOpen) return;

  createOverlay();
  overlayOpen = true;
  overlay.style.setProperty('display', 'flex', 'important');

  const input = document.getElementById('arc-search-input');
  input.focus();

  allTabs = await chrome.runtime.sendMessage({ action: 'getTabs' });

  displayResults(allTabs.map(tab => ({
    type: 'tab',
    title: tab.title,
    url: tab.url,
    favIconUrl: tab.favIconUrl,
    id: tab.id,
    windowId: tab.windowId
  })));

  input.focus();
}

function hideOverlay() {
  if (!overlayOpen) return;

  overlayOpen = false;
  overlay.style.setProperty('display', 'none', 'important');

  document.getElementById('arc-search-input').value = '';
  allResults = [];
  selectedIndex = 0;
}

async function performSearch(query) {
  if (!query.trim()) {
    displayResults(allTabs.map(tab => ({
      type: 'tab',
      title: tab.title,
      url: tab.url,
      favIconUrl: tab.favIconUrl,
      id: tab.id,
      windowId: tab.windowId
    })));
    return;
  }

  const results = await chrome.runtime.sendMessage({
    action: 'search',
    query: query,
    tabs: allTabs
  });

  displayResults(results, query);
}

function displayResults(results, query = '') {
  allResults = results;
  selectedIndex = 0;

  const resultsContainer = document.getElementById('arc-search-results');

  if (results.length === 0 && query.trim()) {
    allResults = [{
      type: 'google',
      title: `Search Google for "${query}"`,
      url: `https://www.google.com/search?q=${encodeURIComponent(query)}`
    }];
    selectedIndex = 0;

    resultsContainer.innerHTML = `
      <div class="arc-search-group">
        <div class="arc-search-group-title">No Results Found</div>
        ${renderResult(allResults[0], 0)}
      </div>
    `;
    attachResultListeners();
    return;
  }

  if (results.length === 0) {
    resultsContainer.innerHTML = `
      <div class="arc-search-empty">
        <div class="arc-search-empty-icon">🔍</div>
        <div class="arc-search-empty-text">Start typing to search...</div>
      </div>
    `;
    return;
  }

  const grouped = {
    tab: results.filter(r => r.type === 'tab'),
    bookmark: results.filter(r => r.type === 'bookmark'),
    history: results.filter(r => r.type === 'history')
  };

  let html = '';

  if (grouped.tab.length > 0) {
    html += '<div class="arc-search-group"><div class="arc-search-group-title">Open Tabs</div>';
    grouped.tab.forEach((result, index) => {
      html += renderResult(result, index);
    });
    html += '</div>';
  }

  if (grouped.bookmark.length > 0) {
    html += '<div class="arc-search-group"><div class="arc-search-group-title">Bookmarks</div>';
    const startIndex = grouped.tab.length;
    grouped.bookmark.forEach((result, index) => {
      html += renderResult(result, startIndex + index);
    });
    html += '</div>';
  }

  if (grouped.history.length > 0) {
    html += '<div class="arc-search-group"><div class="arc-search-group-title">History</div>';
    const startIndex = grouped.tab.length + grouped.bookmark.length;
    grouped.history.forEach((result, index) => {
      html += renderResult(result, startIndex + index);
    });
    html += '</div>';
  }

  resultsContainer.innerHTML = html;
  attachResultListeners();
}

function renderResult(result, index) {
  const isSelected = index === selectedIndex;
  const favicon = result.favIconUrl
    ? `<img src="${result.favIconUrl}" class="arc-search-favicon">`
    : `<div class="arc-search-favicon-placeholder">${result.title?.[0]?.toUpperCase() || '?'}</div>`;

  return `
    <div class="arc-search-result ${isSelected ? 'arc-search-selected' : ''}" data-index="${index}">
      ${favicon}
      <div class="arc-search-result-info">
        <div class="arc-search-result-title">${escapeHtml(result.title || result.url)}</div>
        <div class="arc-search-result-url">${escapeHtml(result.url || '')}</div>
      </div>
      <div class="arc-search-badge arc-search-badge-${result.type}">${result.type.toUpperCase()}</div>
    </div>
  `;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function attachResultListeners() {
  document.querySelectorAll('.arc-search-result').forEach((el, index) => {
    el.addEventListener('click', () => selectResult(index));
  });
}

async function selectResult(index, forceNewTab = false) {
  if (index < 0 || index >= allResults.length) return;

  await chrome.runtime.sendMessage({
    action: 'selectResult',
    result: allResults[index],
    forceNewTab: forceNewTab
  });

  hideOverlay();
}

function moveSelection(delta) {
  selectedIndex = Math.max(0, Math.min(allResults.length - 1, selectedIndex + delta));

  document.querySelectorAll('.arc-search-result').forEach((el, index) => {
    if (index === selectedIndex) {
      el.classList.add('arc-search-selected');
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else {
      el.classList.remove('arc-search-selected');
    }
  });
}

function setupOverlayListeners() {
  const input = document.getElementById('arc-search-input');
  const backdrop = overlay.querySelector('.arc-search-backdrop');

  input.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => performSearch(e.target.value), 100);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveSelection(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveSelection(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();

      if (e.shiftKey) {
        const query = input.value.trim();
        if (query) {
          chrome.runtime.sendMessage({
            action: 'selectResult',
            result: {
              type: 'google',
              url: `https://www.google.com/search?q=${encodeURIComponent(query)}`
            },
            forceNewTab: false
          });
          hideOverlay();
        }
        return;
      }

      selectResult(selectedIndex, e.metaKey || e.ctrlKey);
    } else if (e.key === 'Escape') {
      hideOverlay();
    }
  });

  backdrop.addEventListener('click', hideOverlay);
}

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 't') {
    e.preventDefault();
    e.stopPropagation();
    overlayOpen ? hideOverlay() : showOverlay();
  }
}, true);
