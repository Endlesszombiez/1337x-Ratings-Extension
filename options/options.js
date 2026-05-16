(function () {
  "use strict";

  const form = document.querySelector("#settings-form");
  const apiKeyInput = document.querySelector("#api-key");
  const cacheDaysInput = document.querySelector("#cache-days");
  const ratingDisplayInput = document.querySelector("#rating-display");
  const clearCacheButton = document.querySelector("#clear-cache");
  const statusElement = document.querySelector("#status");
  const cacheSearchInput = document.querySelector("#cache-search");
  const cacheListElement = document.querySelector("#cache-list");
  const cacheCountElement = document.querySelector("#cache-count");
  const cacheRecordCountElement = document.querySelector("#cache-record-count");
  const cacheStorageSizeElement = document.querySelector("#cache-storage-size");
  const { CACHE_STORAGE_KEY, getSettings, normalizeCacheDays } = window.RatingsExtensionDefaults;
  let cacheItems = [];
  let cacheStorageBytes = 0;

  init();

  async function init() {
    const settings = await getSettings();
    apiKeyInput.value = settings.apiKey;
    cacheDaysInput.value = settings.cacheDays;
    ratingDisplayInput.value = settings.ratingDisplay;
    await loadCacheItems();
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    await browser.storage.local.set({
      apiKey: apiKeyInput.value.trim(),
      cacheDays: normalizeCacheDays(cacheDaysInput.value),
      ratingDisplay: ratingDisplayInput.value
    });

    showStatus("Settings saved.");
  });

  clearCacheButton.addEventListener("click", async () => {
    await browser.storage.local.remove(CACHE_STORAGE_KEY);
    await loadCacheItems();
    showStatus("Cache cleared.");
  });

  cacheSearchInput.addEventListener("input", () => {
    renderCacheItems();
  });

  browser.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName === "local" && changes[CACHE_STORAGE_KEY]) {
      await loadCacheItems();
    }
  });

  async function loadCacheItems() {
    const stored = await browser.storage.local.get(CACHE_STORAGE_KEY);
    const cache = stored[CACHE_STORAGE_KEY] || {};
    const now = Date.now();
    cacheStorageBytes = getStorageSizeBytes(cache);

    cacheItems = Object.entries(cache)
      .filter(([, item]) => item && item.expiresAt > now)
      .map(([cacheKey, item]) => ({
        cacheKey,
        query: item.query || queryFromCacheKey(cacheKey),
        payload: item.payload || {},
        expiresAt: item.expiresAt
      }))
      .sort((first, second) => getTitle(first).localeCompare(getTitle(second)));

    cacheRecordCountElement.textContent = formatNumber(cacheItems.length);
    cacheStorageSizeElement.textContent = formatBytes(cacheStorageBytes);
    renderCacheItems();
  }

  function renderCacheItems() {
    const searchTerm = cacheSearchInput.value.trim().toLowerCase();
    const filteredItems = cacheItems.filter((item) => cacheItemMatches(item, searchTerm));

    cacheCountElement.textContent = String(filteredItems.length);
    cacheListElement.textContent = "";

    if (!filteredItems.length) {
      const empty = document.createElement("p");
      empty.className = "empty-cache";
      empty.textContent = cacheItems.length ? "No cached items match your search." : "No cached items yet.";
      cacheListElement.append(empty);
      return;
    }

    filteredItems.forEach((item) => {
      cacheListElement.append(createCacheItemElement(item));
    });
  }

  function createCacheItemElement(item) {
    const payload = item.payload;
    const row = document.createElement("article");
    row.className = "cache-item";

    const title = document.createElement("div");
    title.className = "cache-title";
    title.textContent = getTitle(item);

    const meta = document.createElement("div");
    meta.className = "cache-meta";
    meta.textContent = [
      payload.year || item.query.year || "",
      item.query.type || "",
      `expires ${formatDate(item.expiresAt)}`
    ].filter(Boolean).join(" · ");

    const ratings = document.createElement("div");
    ratings.className = "cache-ratings";
    ratings.append(
      createRatingPill("IMDb", payload.imdb || "-"),
      createRatingPill("RT", payload.rottenTomatoes || "-")
    );

    row.append(title, meta, ratings);
    return row;
  }

  function createRatingPill(label, value) {
    const pill = document.createElement("span");
    pill.className = label === "IMDb" ? "cache-rating imdb" : "cache-rating rt";
    pill.textContent = `${label} ${value}`;
    return pill;
  }

  function cacheItemMatches(item, searchTerm) {
    if (!searchTerm) {
      return true;
    }

    return [
      item.cacheKey,
      getTitle(item),
      item.query.year,
      item.query.type,
      item.payload.imdb,
      item.payload.rottenTomatoes,
      item.payload.state
    ].filter(Boolean).join(" ").toLowerCase().includes(searchTerm);
  }

  function getTitle(item) {
    return item.payload.title || item.query.title || item.cacheKey.split("|")[0] || "Unknown title";
  }

  function queryFromCacheKey(cacheKey) {
    const [title, year, type] = cacheKey.split("|");
    return {
      title,
      year,
      type
    };
  }

  function formatDate(timestamp) {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    }).format(new Date(timestamp));
  }

  function getStorageSizeBytes(value) {
    return new Blob([JSON.stringify({
      [CACHE_STORAGE_KEY]: value
    })]).size;
  }

  function formatBytes(bytes) {
    if (!bytes) {
      return "0 B";
    }

    const units = ["B", "KB", "MB", "GB"];
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, exponent);
    const precision = value >= 10 || exponent === 0 ? 0 : 1;

    return `${value.toFixed(precision)} ${units[exponent]}`;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat().format(value);
  }

  function showStatus(message) {
    statusElement.textContent = message;
    window.setTimeout(() => {
      statusElement.textContent = "";
    }, 2500);
  }
})();
