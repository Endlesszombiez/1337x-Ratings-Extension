(function () {
  "use strict";

  const DEFAULT_SETTINGS = {
    apiKey: "",
    cacheDays: 60,
    ratingDisplay: "both"
  };

  const CACHE_STORAGE_KEY = "omdbRatingsCache";
  const SETTINGS_STORAGE_KEYS = Object.keys(DEFAULT_SETTINGS);

  async function getSettings() {
    const stored = await browser.storage.local.get(SETTINGS_STORAGE_KEYS);
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      cacheDays: normalizeCacheDays(stored.cacheDays)
    };
  }

  function normalizeCacheDays(value) {
    const numericValue = Number.parseInt(value, 10);

    if (Number.isFinite(numericValue) && numericValue >= 1) {
      return numericValue;
    }

    return DEFAULT_SETTINGS.cacheDays;
  }

  window.RatingsExtensionDefaults = {
    CACHE_STORAGE_KEY,
    DEFAULT_SETTINGS,
    getSettings,
    normalizeCacheDays
  };
})();
