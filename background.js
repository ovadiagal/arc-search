chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getTabs") {
    chrome.tabs.query({}, (tabs) => {
      sendResponse(tabs);
    });
    return true; // Will respond asynchronously
  }

  if (request.action === "search") {
    performSearch(request.query, request.tabs).then(sendResponse);
    return true; // Will respond asynchronously
  }

  if (request.action === "selectResult") {
    selectResult(request.result, request.forceNewTab).then(() => {
      sendResponse({ success: true });
    });
    return true; // Will respond asynchronously
  }
});

async function performSearch(query, tabs) {
  const lowerQuery = query.toLowerCase();
  const results = [];

  // Search open tabs (prioritized)
  const tabResults = tabs
    .filter(
      (tab) =>
        tab.title?.toLowerCase().includes(lowerQuery) ||
        tab.url?.toLowerCase().includes(lowerQuery),
    )
    .map((tab) => ({
      type: "tab",
      title: tab.title,
      url: tab.url,
      favIconUrl: tab.favIconUrl,
      id: tab.id,
      windowId: tab.windowId,
    }));

  results.push(...tabResults);

  // Search bookmarks and history if query is >= 2 chars
  if (query.length >= 2) {
    const openTabUrls = new Set(tabs.map((tab) => tab.url));

    try {
      const bookmarks = await chrome.bookmarks.search(query);
      const bookmarkResults = bookmarks
        .filter((bookmark) => bookmark.url && !openTabUrls.has(bookmark.url))
        .map((bookmark) => ({
          type: "bookmark",
          title: bookmark.title || bookmark.url,
          url: bookmark.url,
        }));
      results.push(...bookmarkResults);
    } catch (e) {
      console.error("Error searching bookmarks:", e);
    }

    try {
      const historyItems = await chrome.history.search({
        text: query,
        maxResults: 20,
      });

      const historyResults = historyItems
        .filter(
          (item) =>
            item.url &&
            !openTabUrls.has(item.url) &&
            !item.url.startsWith("https://www.google.com/search"), // exclude Google searches
        )
        .map((item) => ({
          type: "history",
          title: item.title || item.url,
          url: item.url,
        }));

      results.push(...historyResults);
    } catch (e) {
      console.error("Error searching history:", e);
    }
  }

  return results;
}

async function selectResult(result, forceNewTab) {
  if (result.type === "tab" && !forceNewTab) {
    // Switch to existing tab
    await chrome.tabs.update(result.id, { active: true });
    await chrome.windows.update(result.windowId, { focused: true });
  } else if (result.type === "tab" && forceNewTab) {
    // Open the tab's URL in a new tab (duplicate it)
    await chrome.tabs.create({ url: result.url });
  } else {
    // Open bookmark, history, or Google search in new tab
    await chrome.tabs.create({ url: result.url });
  }
}
