(function () {
  "use strict";

  const { CACHE_STORAGE_KEY } = window.RatingsExtensionDefaults;
  const inFlightRequests = new Map();
  const DEBUG_PREFIX = "[1337x OMDb Ratings]";

  function buildCacheKey(query) {
    return [
      normalizeKeyPart(query.title),
      query.year || "",
      query.type || ""
    ].join("|");
  }

  function normalizeKeyPart(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  async function getRatings(query, settings) {
    if (!settings.apiKey) {
      debug("Skipping OMDb lookup because no API key is saved.");
      return {
        state: "missing-key"
      };
    }

    const cacheKey = buildCacheKey(query);

    if (inFlightRequests.has(cacheKey)) {
      debug("Reusing in-flight OMDb request.", query);
      return inFlightRequests.get(cacheKey);
    }

    const request = getRatingsFromCacheOrApi(cacheKey, query, settings)
      .finally(() => inFlightRequests.delete(cacheKey));

    inFlightRequests.set(cacheKey, request);
    return request;
  }

  async function getRatingsFromCacheOrApi(cacheKey, query, settings) {
    const cache = await readCache();
    const cachedValue = cache[cacheKey];

    if (cachedValue && cachedValue.expiresAt > Date.now()) {
      debug("Using cached OMDb result.", query, cachedValue.payload);
      return cachedValue.payload;
    }

    const payload = await fetchRatings(query, settings.apiKey);
    cache[cacheKey] = {
      expiresAt: Date.now() + settings.cacheDays * 24 * 60 * 60 * 1000,
      query,
      payload
    };

    await browser.storage.local.set({
      [CACHE_STORAGE_KEY]: pruneCache(cache)
    });

    return payload;
  }

  async function readCache() {
    const stored = await browser.storage.local.get(CACHE_STORAGE_KEY);
    return stored[CACHE_STORAGE_KEY] || {};
  }

  function pruneCache(cache) {
    const now = Date.now();
    return Object.fromEntries(
      Object.entries(cache).filter(([, value]) => value && value.expiresAt > now)
    );
  }

  async function fetchRatings(query, apiKey) {
    const url = new URL("https://www.omdbapi.com/");
    url.searchParams.set("apikey", apiKey);
    url.searchParams.set("t", query.title);

    if (query.year) {
      url.searchParams.set("y", query.year);
    }

    if (query.type) {
      url.searchParams.set("type", query.type);
    }

    try {
      debug("Requesting OMDb rating.", {
        title: query.title,
        year: query.year,
        type: query.type,
        url: scrubApiKey(url.toString())
      });

      const response = await fetch(url.toString());
      const data = await response.json();

      if (!response.ok || data.Response === "False") {
        debug("OMDb lookup did not return a match.", {
          query,
          status: response.status,
          error: data.Error
        });

        return {
          state: "not-found",
          error: data.Error || "Not found"
        };
      }

      debug("OMDb lookup found a match.", {
        query,
        title: data.Title,
        year: data.Year,
        imdb: data.imdbRating,
        ratings: data.Ratings
      });

      return {
        state: "found",
        title: data.Title || query.title,
        year: data.Year || query.year || "",
        imdb: valueOrEmpty(data.imdbRating),
        rottenTomatoes: getSourceRating(data.Ratings, "Rotten Tomatoes")
      };
    } catch (error) {
      debug("OMDb lookup failed.", {
        query,
        error: error.message || String(error)
      });

      return {
        state: "error",
        error: error.message || "OMDb request failed"
      };
    }
  }

  function getSourceRating(ratings, source) {
    const match = Array.isArray(ratings)
      ? ratings.find((rating) => rating.Source === source)
      : null;

    return valueOrEmpty(match && match.Value);
  }

  function valueOrEmpty(value) {
    return value && value !== "N/A" ? value : "";
  }

  function scrubApiKey(url) {
    return url.replace(/([?&]apikey=)[^&]+/i, "$1<hidden>");
  }

  function debug(message, ...details) {
    console.info(DEBUG_PREFIX, message, ...details);
  }

  window.RatingsExtensionOmdb = {
    getRatings
  };
})();
