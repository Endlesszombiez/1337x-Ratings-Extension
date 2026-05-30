(function () {
  "use strict";

  const DEFAULT_SETTINGS = {
    apiKey: "",
    cacheDays: 60,
    ratingDisplay: "both"
  };

  const CACHE_STORAGE_KEY = "omdbRatingsCache";
  const SETTINGS_SYNC_STORAGE_AREA = "sync";
  const SETTINGS_LOCAL_STORAGE_AREA = "local";
  const SETTINGS_STORAGE_KEYS = Object.keys(DEFAULT_SETTINGS);
  const VALID_RATING_DISPLAY_VALUES = ["both", "imdb", "rottenTomatoes"];

  async function getSettings() {
    const [localSettings, syncSettings] = await Promise.all([
      readSettingsFromArea(SETTINGS_LOCAL_STORAGE_AREA),
      readSettingsFromArea(SETTINGS_SYNC_STORAGE_AREA)
    ]);

    return normalizeSettings({
      ...DEFAULT_SETTINGS,
      ...localSettings,
      ...syncSettings
    });
  }

  async function saveSettings(settings) {
    const normalizedSettings = normalizeSettings(settings);

    await Promise.all([
      writeSettingsToArea(SETTINGS_LOCAL_STORAGE_AREA, normalizedSettings),
      writeSettingsToArea(SETTINGS_SYNC_STORAGE_AREA, normalizedSettings)
    ]);

    return normalizedSettings;
  }

  async function readSettingsFromArea(areaName) {
    try {
      return await browser.storage[areaName].get(SETTINGS_STORAGE_KEYS);
    } catch (error) {
      console.warn("[1337x OMDb Ratings] Unable to read settings from storage.", areaName, error);
      return {};
    }
  }

  async function writeSettingsToArea(areaName, settings) {
    try {
      await browser.storage[areaName].set(settings);
    } catch (error) {
      console.warn("[1337x OMDb Ratings] Unable to write settings to storage.", areaName, error);
    }
  }

  function normalizeSettings(settings) {
    return {
      apiKey: normalizeApiKey(settings.apiKey),
      cacheDays: normalizeCacheDays(settings.cacheDays),
      ratingDisplay: normalizeRatingDisplay(settings.ratingDisplay)
    };
  }

  function normalizeApiKey(value) {
    return String(value || "").trim();
  }

  function normalizeCacheDays(value) {
    const numericValue = Number.parseInt(value, 10);

    if (Number.isFinite(numericValue) && numericValue >= 1) {
      return numericValue;
    }

    return DEFAULT_SETTINGS.cacheDays;
  }

  function normalizeRatingDisplay(value) {
    return VALID_RATING_DISPLAY_VALUES.includes(value) ? value : DEFAULT_SETTINGS.ratingDisplay;
  }

  window.RatingsExtensionDefaults = {
    CACHE_STORAGE_KEY,
    DEFAULT_SETTINGS,
    getSettings,
    saveSettings,
    normalizeCacheDays
  };
})();
