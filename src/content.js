(function () {
  "use strict";

  const RATING_COLUMN_CLASS = "omdb-ratings-column";
  const PROCESSED_ROW_ATTRIBUTE = "data-omdb-ratings-processed";
  const QUALITY_FLAG_PATTERN = /\b(4320p|2160p|1440p|1080p|1080i|720p|576p|576i|540p|480p|480i|360p|uhd|4k|8k|hdr|hdr10|dv|dolby\s*vision|web[-.\s]?dl|web[-.\s]?rip|webrip|webdl|blu[-.\s]?ray|bluray|bdrip|brrip|bdremux|remux|hdrip|dvdrip|dvd[-.\s]?rip|hdtv|pdtv|dsr|tvrip|cam|hdcam|hdts|ts|tc|r5|scr|dvdscr)\b/i;
  const MEDIA_QUALITY_PATTERN = /\b(4320p|2160p|1440p|1080p|1080i|720p|576p|576i|540p|480p|480i|360p|uhd|4k|8k|hdr|hdr10|dv|dolby\s*vision|hdrip|webrip|web-rip|webdl|web-dl|bluray|blu-ray|bdrip|brrip|bdremux|remux|dvdrip|dvd-rip|hdtv|pdtv|dsr|tvrip|cam|hdcam|hdts|ts|tc|r5|scr|dvdscr|xvid|x264|x265|hevc|h\.?264|h\.?265|aac|ac3|ddp?5\.?1|10bit|proper|repack|extended|limited|internal)\b/i;
  const TV_PATTERN = /\bS\d{1,2}(?:E\d{1,2})?\b/i;
  const DEBUG_PREFIX = "[1337x OMDb Ratings]";

  let latestSettings = null;
  let injectTimer = null;

  init();

  async function init() {
    latestSettings = await window.RatingsExtensionDefaults.getSettings();
    debug("Content script loaded.", {
      hasApiKey: Boolean(latestSettings.apiKey),
      cacheDays: latestSettings.cacheDays,
      ratingDisplay: latestSettings.ratingDisplay
    });

    scheduleInjectRatings();
    observeTableChanges();
    observePageReentry();

    browser.storage.onChanged.addListener(async (changes, areaName) => {
      if (areaName !== "local" && areaName !== "sync") {
        return;
      }

      if (changes.apiKey || changes.cacheDays || changes.ratingDisplay) {
        latestSettings = await window.RatingsExtensionDefaults.getSettings();
        debug("Settings changed, refreshing injected ratings.", {
          hasApiKey: Boolean(latestSettings.apiKey),
          cacheDays: latestSettings.cacheDays,
          ratingDisplay: latestSettings.ratingDisplay
        });

        resetInjectedRatings();
        scheduleInjectRatings();
      }
    });
  }

  function observeTableChanges() {
    const observer = new MutationObserver(() => scheduleInjectRatings());
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function observePageReentry() {
    window.addEventListener("pageshow", () => scheduleInjectRatings());
    window.addEventListener("focus", () => scheduleInjectRatings());
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        scheduleInjectRatings();
      }
    });
  }

  function scheduleInjectRatings() {
    if (injectTimer !== null) {
      return;
    }

    injectTimer = window.setTimeout(() => {
      injectTimer = null;
      injectRatings();
    }, 50);
  }

  function resetInjectedRatings() {
    document.querySelectorAll(`[${PROCESSED_ROW_ATTRIBUTE}]`).forEach((row) => {
      row.removeAttribute(PROCESSED_ROW_ATTRIBUTE);
    });

    document.querySelectorAll(`.${RATING_COLUMN_CLASS}`).forEach((column) => {
      column.remove();
    });
  }

  function injectRatings() {
    document.querySelectorAll("table").forEach((table) => {
      if (!looksLikeTorrentTable(table)) {
        return;
      }

      debug("Found torrent-like table.", table);
      ensureRatingsHeader(table);
      table.querySelectorAll("tbody tr, tr").forEach((row) => processRow(row));
    });
  }

  function looksLikeTorrentTable(table) {
    const headers = Array.from(table.querySelectorAll("th")).map((header) => normalizeText(header.textContent));
    const hasTorrentHeaders = headers.includes("name") && (headers.includes("se") || headers.includes("seeders"));
    const hasTorrentLinks = Boolean(table.querySelector('a[href^="/torrent/"], a[href*="/torrent/"]'));

    return hasTorrentHeaders || hasTorrentLinks;
  }

  function ensureRatingsHeader(table) {
    const headerRow = table.querySelector("thead tr") || table.querySelector("tr");

    if (!headerRow || headerRow.querySelector(`.${RATING_COLUMN_CLASS}`)) {
      return;
    }

    const headerCell = document.createElement("th");
    headerCell.className = RATING_COLUMN_CLASS;
    headerCell.textContent = "ratings";
    headerRow.append(headerCell);
  }

  async function processRow(row) {
    if (row.matches("thead tr")) {
      return;
    }

    if (row.hasAttribute(PROCESSED_ROW_ATTRIBUTE)) {
      if (row.querySelector(`td.${RATING_COLUMN_CLASS}`)) {
        return;
      }

      row.removeAttribute(PROCESSED_ROW_ATTRIBUTE);
    }

    const titleLink = row.querySelector('a[href^="/torrent/"], a[href*="/torrent/"]');

    if (!titleLink) {
      debug("Skipping row because no torrent link was found.", row);
      return;
    }

    row.setAttribute(PROCESSED_ROW_ATTRIBUTE, "true");

    const cell = document.createElement("td");
    cell.className = RATING_COLUMN_CLASS;
    row.append(cell);

    const rawTitle = titleLink.getAttribute("title") || titleLink.textContent || "";

    if (!hasQualityFlag(rawTitle)) {
      cell.classList.add("omdb-ratings-skipped");
      cell.textContent = "";
      cell.title = "Skipped: no movie or TV quality flag found";
      debug("Skipping row before parsing because no quality flag was found.", {
        rawTitle
      });
      return;
    }

    cell.textContent = latestSettings.apiKey ? "..." : "Set OMDb key";

    const query = parseTorrentTitle(rawTitle);
    debug("Parsed torrent title.", {
      rawTitle,
      query
    });

    if (!query.title) {
      cell.textContent = "-";
      cell.title = "Could not parse a title for OMDb lookup";
      return;
    }

    try {
      const result = await window.RatingsExtensionOmdb.getRatings(query, latestSettings);
      renderRatingCell(cell, result, latestSettings.ratingDisplay);
    } catch (error) {
      cell.textContent = "Error";
      cell.title = error.message || "Ratings lookup failed";
      debug("Ratings lookup threw an unexpected error.", {
        query,
        error: error.message || String(error)
      });
    }
  }

  function renderRatingCell(cell, result, displayMode) {
    cell.textContent = "";

    if (result.state === "missing-key") {
      cell.textContent = "Set OMDb key";
      return;
    }

    if (result.state !== "found") {
      cell.textContent = "-";
      cell.title = result.error || "No OMDb rating found";
      return;
    }

    const fragments = [];

    if ((displayMode === "both" || displayMode === "imdb") && result.imdb) {
      fragments.push(createRatingBadge("IMDb", result.imdb));
    }

    if ((displayMode === "both" || displayMode === "rottenTomatoes") && result.rottenTomatoes) {
      fragments.push(createRatingBadge("RT", result.rottenTomatoes));
    }

    if (!fragments.length) {
      cell.textContent = "-";
      cell.title = `No selected ratings found for ${result.title}`;
      return;
    }

    fragments.forEach((fragment) => cell.append(fragment));
    cell.title = `${result.title} ${result.year}`.trim();
  }

  function createRatingBadge(label, value) {
    const badge = document.createElement("span");
    const sourceClass = label === "IMDb" ? "omdb-rating-badge-imdb" : "omdb-rating-badge-rt";
    badge.className = `omdb-rating-badge ${sourceClass}`;

    const labelElement = document.createElement("span");
    labelElement.className = "omdb-rating-label";
    labelElement.textContent = label;

    const valueElement = document.createElement("span");
    valueElement.className = "omdb-rating-value";
    valueElement.textContent = value;

    badge.append(labelElement, valueElement);
    return badge;
  }

  function parseTorrentTitle(rawTitle) {
    let title = rawTitle
      .replace(/\.[a-z0-9]{2,4}$/i, "")
      .replace(/[\._]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const yearMatch = title.match(/\b(19\d{2}|20\d{2})\b/);
    const type = TV_PATTERN.test(title) ? "series" : "movie";
    const year = yearMatch ? yearMatch[1] : "";

    if (yearMatch) {
      title = title.slice(0, yearMatch.index).trim();
    } else {
      const qualityMatch = title.match(MEDIA_QUALITY_PATTERN);

      if (qualityMatch) {
        title = title.slice(0, qualityMatch.index).trim();
      }
    }

    title = title
      .replace(/\s*\[[^\]]+\]\s*$/g, "")
      .replace(/\s*\([^)]+\)\s*$/g, "")
      .replace(/\s+-\s+[A-Za-z0-9_]+$/g, "")
      .trim();

    return {
      title,
      year,
      type
    };
  }

  function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
  }

  function hasQualityFlag(rawTitle) {
    return QUALITY_FLAG_PATTERN.test(rawTitle);
  }

  function debug(message, ...details) {
    console.info(DEBUG_PREFIX, message, ...details);
  }
})();
