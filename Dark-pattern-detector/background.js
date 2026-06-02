// ---------------------------------------
// background.js - split queues: fast saves + separate tests
// ---------------------------------------

function isSameTimer(a, b) {
  // element ID is generated in content.js before sending; use it as the only key (with url)
  return !!(a.elementId && b.elementId && a.elementId === b.elementId && a.url === b.url);
}

function mergeTimer(arr, incoming) {
  const idx = arr.findIndex(t => isSameTimer(t, incoming));
  if (idx === -1) {
    arr.push(incoming);
  } else {
    const prev = arr[idx];
    if ((incoming.foundAt || 0) >= (prev.foundAt || 0)) {
      arr[idx] = { 
        ...prev, 
        ...incoming,
        // save test results even if incoming is newer
        testsStarted: prev.testsStarted || incoming.testsStarted,
        testsCompleted: prev.testsCompleted || incoming.testsCompleted,
        testResults: prev.testResults || incoming.testResults,
        classification: prev.classification || incoming.classification,
        score: prev.score ?? incoming.score
      };
    } else {
      arr[idx] = { ...incoming, ...prev };
    }
  }
  return arr;
}

function withDetectedTimers(mutator) {
  return new Promise(resolve => {
    chrome.storage.local.get("detectedTimers", res => {
      const list = Array.isArray(res.detectedTimers) ? res.detectedTimers : [];
      Promise.resolve(mutator(list)).then(updated => {
        if (updated) {
          chrome.storage.local.set({ detectedTimers: updated }, () => resolve(updated));
        } else {
          resolve(null);
        }
      });
    });
  });
}


// ---------- 
// queues
// ----------

let writeQueue = Promise.resolve();
function enqueueWrite(fn) {
  writeQueue = writeQueue.then(() => fn()).catch(e => console.warn("[BG] writeQueue error:", e));
  return writeQueue;
}

const MAX_PARALLEL_TESTS = 2;
let runningTests = 0;
const testJobs = [];
function enqueueTest(fn) {
  return new Promise(resolve => {
    testJobs.push({ fn, resolve });
    pumpTests();
  });
}
function pumpTests() {
  if (runningTests >= MAX_PARALLEL_TESTS) return;
  const job = testJobs.shift();
  if (!job) return;
  runningTests++;
  job.fn()
    .then(r => job.resolve(r))
    .catch(e => job.resolve({ error: String(e) }))
    .finally(() => {
      runningTests--;
      pumpTests();
    });
}

// ---------- 
// utils
// ---------- 

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function getTestResult(testResults, name) {
  if (!Array.isArray(testResults)) return null;
  return testResults.find(t => t.test === name) || null;
}

function classifyFromTests(testResults) {
  const t = (name) => (Array.isArray(testResults) 
    ? testResults.find(r => r.test === name) 
    : null) || {};

  // test weights (sum = 100)
  const weights = {
    persistence:   25,
    expiration:    20,
    cross_session: 20,
    backend_link:  25,
    reappearance:  10
  };

  let totalWeight = 0;
  let realScore = 0;

  for (const [testName, weight] of Object.entries(weights)) {
    const result = t(testName);

    if (result.skipped || result.passed === null || result.passed === undefined) {
      // skipped test - not included in calculations
      continue;
    }

    totalWeight += weight;
    if (result.passed === true) {
      realScore += weight;
    }
  }

  // if no test ran
  if (totalWeight === 0) {
    return {
      score: null,
      classification: 'unknown',
      classificationReason: 'Tests not yet completed or all skipped'
    };
  }

  // normalized to 0-100 score
  const score = Math.round((realScore / totalWeight) * 100);

  let classification;
  let classificationReason;

  if (score >= 70) {
    classification = 'real';
    classificationReason = 'Timer passed most tests – likely real';
  } else if (score >= 40) {
    classification = 'suspicious';
    classificationReason = 'Test results ambiguous – suspicious timer';
  } else {
    classification = 'fake';
    classificationReason = 'Timer fails most tests – likely fake';
  }

  return { score, classification, classificationReason };
}

function parseTimerTextToSeconds(s) {
  if (!s) return null;
  const cleaned = s.replace(/\s+/g, " ").trim();

  // format: HH:MM:SS or MM:SS
  if (/^\d{1,2}(:\d{2}){1,2}$/.test(cleaned.replace(/\s/g, ""))) {
    const parts = cleaned.replace(/\s/g, "").split(":").map(n => parseInt(n, 10));
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
  }

  // format: 2h 15m 30s arba 2h15m30s
  const hms = cleaned.match(/(\d+)\s*h\w*\s*(\d+)?\s*m\w*\s*(\d+)?\s*s?\w*/i);
  if (hms) {
    const h = parseInt(hms[1] || 0, 10);
    const m = parseInt(hms[2] || 0, 10);
    const sec = parseInt(hms[3] || 0, 10);
    return h * 3600 + m * 60 + sec;
  }

  // format: 2 val. 15 min. 30 sek. (lt)
  const ltFull = cleaned.match(
    /(\d+)\s*val\.?\s*(\d+)?\s*min\.?\s*(\d+)?\s*sek\.?/i
  );
  if (ltFull) {
    const h = parseInt(ltFull[1] || 0, 10);
    const m = parseInt(ltFull[2] || 0, 10);
    const sec = parseInt(ltFull[3] || 0, 10);
    return h * 3600 + m * 60 + sec;
  }

  // format: 15 min. or 15 min 30 sek. (lt)
  const ltMin = cleaned.match(/(\d+)\s*min\.?\s*(\d+)?\s*sek\.?/i);
  if (ltMin) {
    const m = parseInt(ltMin[1] || 0, 10);
    const sec = parseInt(ltMin[2] || 0, 10);
    return m * 60 + sec;
  }

  // format: 2 hours 15 minutes 30 seconds (en full)
  const enFull = cleaned.match(
    /(\d+)\s*hours?\s*(\d+)?\s*minutes?\s*(\d+)?\s*seconds?/i
  );
  if (enFull) {
    const h = parseInt(enFull[1] || 0, 10);
    const m = parseInt(enFull[2] || 0, 10);
    const sec = parseInt(enFull[3] || 0, 10);
    return h * 3600 + m * 60 + sec;
  }

  // format: 15 minutes or 15 minutes 30 seconds
  const enMin = cleaned.match(/(\d+)\s*minutes?\s*(\d+)?\s*seconds?/i);
  if (enMin) {
    const m = parseInt(enMin[1] || 0, 10);
    const sec = parseInt(enMin[2] || 0, 10);
    return m * 60 + sec;
  }

  // format: 2 days 3 hours (long offers)
  const days = cleaned.match(/(\d+)\s*(days?|dienos?|dienų)/i);
  const hours = cleaned.match(/(\d+)\s*(hours?|val\.?|valandų?)/i);
  const mins = cleaned.match(/(\d+)\s*(minutes?|min\.?)/i);
  if (days || hours || mins) {
    const d = days ? parseInt(days[1], 10) : 0;
    const h = hours ? parseInt(hours[1], 10) : 0;
    const m = mins ? parseInt(mins[1], 10) : 0;
    return d * 86400 + h * 3600 + m * 60;
  }

  // fallback: num only
  const only = cleaned.replace(/\D/g, "");
  if (!only) return null;
  return parseInt(only, 10);
}

function waitForTabLoad(tabId) {
  return new Promise(resolve => {
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function execInTempTab(url, codeFn, args = []) {
  const testUrl = url + (url.includes("?") ? "&" : "?") + "fake_urgency_test=1";
  const tab = await chrome.tabs.create({ url: testUrl, active: false });

  try {
    await waitForTabLoad(tab.id);
    const res = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: codeFn,
      args
    });
    return res?.[0]?.result;
  } finally {
    try { await chrome.tabs.remove(tab.id); } catch {}
  }
}

async function execInIncognito(url, codeFn, args = []) {
  const testUrl = url + (url.includes("?") ? "&" : "?") + "fake_urgency_test=1";
  let win;

  try {
    win = await chrome.windows.create({ url, incognito: true, focused: false });
  } catch (e) {
    throw new Error("incognito_not_available: " + e.message);
  }

  // Patikrinti ar langas ir skirtukai sukurti sėkmingai
  if (!win || !win.tabs || win.tabs.length === 0) {
    if (win) {
      try { await chrome.windows.remove(win.id); } catch {}
    }
    throw new Error("incognito_window_or_tabs_null");
  }

  const tab = win.tabs[0];
  try {
    await waitForTabLoad(tab.id);
    const res = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: codeFn,
      args
    });
    return res?.[0]?.result;
  } finally {
    try { await chrome.windows.remove(win.id); } catch {}
  }
}

// ---------- 
// tests
// ---------- 

async function runQuantityTests(timer) {
  const results = [];

  const quantityWeights = {
    persistence:   35,
    cross_session: 30,
    backend_link:  35
  };

  // 1) Persistence
  results.push(await (async () => {
    const out = { test: "persistence", passed: false };
    try {
      const r = await execInTempTab(
        timer.url,
        (path) => new Promise(resolve => {
          setTimeout(() => {
            try {
              const el = path ? document.querySelector(path) : null;
              const txt = el ? el.innerText.trim() : "";
              resolve({ found: !!el, txt });
            } catch (e) { resolve({ found: false, error: e.message }); }
          }, 2000);
        }),
        [timer.domPath]
      );
      if (!r) {
        out.passed = null; out.skipped = true;
        out.evidence = { reason: "no_result" };
      } else if (!r.found) {
        out.passed = null; out.skipped = true;
        out.evidence = { reason: "element_not_found_after_reload" };
      } else {
        // Kiekio indikatoriui – tikrinti ar skaičius tas pats
        out.passed = r.txt === timer.text;
        out.evidence = { before: timer.text, after: r.txt };
      }
    } catch (e) {
      out.passed = false; out.evidence = { error: e.message };
    }
    return out;
  })());

  // 2) Cross-session
  results.push(await (async () => {
    const out = { test: "cross_session", passed: false };
    try {
      const r = await execInIncognito(
        timer.url,
        (path) => {
          try {
            const el = path ? document.querySelector(path) : null;
            const txt = el ? el.innerText.trim() : "";
            return { found: !!el, txt };
          } catch (e) { return { found: false, error: e.message }; }
        },
        [timer.domPath]
      ).catch(e => ({ error: e.message, incognito: false }));
      if (!r || r.error) {
        out.passed = null; out.skipped = true;
        out.evidence = r || { reason: "incognito_not_available" };
      } else if (!r.found) {
        out.passed = null; out.skipped = true;
        out.evidence = { reason: "element_not_found_in_incognito" };
      } else {
        // Kiekio indikatoriui – tikrinti ar skaičius tas pats
        out.passed = r.txt === timer.text;
        out.evidence = { sample: timer.text, incognito: r.txt };
      }
    } catch (e) {
      out.passed = false; out.evidence = { error: e.message };
    }
    return out;
  })());

  // 3) Backend link
  results.push(await (async () => {
    const out = { test: "backend_link", passed: false };
    try {
      const timeRelatedKeywords = [
        "stock", "inventory", "quantity", "available", "remaining",
        "likutis", "kiekis", "sandėlis", "preke", "vnt"
      ];

      const r = await execInTempTab(
        timer.url,
        (keywords) => new Promise(resolve => {
          setTimeout(() => {
            try {
              const entries = performance.getEntriesByType("resource")
                .map(e => ({ name: e.name, initiatorType: e.initiatorType }));
              const xhrFetch = entries.filter(e =>
                ["xmlhttprequest", "fetch"].includes(
                  (e.initiatorType || "").toLowerCase()
                )
              );
              const relevant = xhrFetch.filter(e =>
                keywords.some(k => e.name.toLowerCase().includes(k))
              );
              resolve({
                total: entries.length,
                xhrFetch: xhrFetch.length,
                relevant: relevant.slice(0, 5)
              });
            } catch (e) { resolve({ error: e.message }); }
          }, 3000);
        }),
        [timeRelatedKeywords]
      );

      if (!r || r.error) {
        out.passed = null; out.skipped = true;
        out.evidence = { reason: r?.error || "no_result" };
      } else if (r.relevant && r.relevant.length > 0) {
        out.passed = true;
        out.evidence = { total: r.total, xhrFetch: r.xhrFetch, relevant: r.relevant };
      } else if (r.xhrFetch === 0) {
        out.passed = false;
        out.evidence = { total: r.total, xhrFetch: 0, reason: "no_network_requests" };
      } else {
        out.passed = null; out.skipped = true;
        out.evidence = { total: r.total, xhrFetch: r.xhrFetch,
          reason: "requests_found_but_none_stock_related" };
      }
    } catch (e) {
      out.passed = false; out.evidence = { error: e.message };
    }
    return out;
  })());

  const classificationInfo = classifyQuantityFromTests(results, quantityWeights);

  await enqueueWrite(() =>
    withDetectedTimers(list => {
      const idx = list.findIndex(t => isSameTimer(t, timer));
      if (idx === -1) return;
      const entry = list[idx];
      const prev = Array.isArray(entry.testResults) ? entry.testResults : [];
      const merged = mergeTestResults(prev, results);
      list[idx] = {
        ...entry,
        testsStarted: true,
        testsCompleted: true,
        testResults: merged,
        classification: classificationInfo.classification,
        classificationReason: classificationInfo.classificationReason,
        score: classificationInfo.score
      };
      return list;
    })
  );
}

function classifyQuantityFromTests(testResults, weights) {
  const t = (name) => (Array.isArray(testResults)
    ? testResults.find(r => r.test === name)
    : null) || {};

  let totalWeight = 0;
  let realScore = 0;

  for (const [testName, weight] of Object.entries(weights)) {
    const result = t(testName);
    if (result.skipped || result.passed === null || result.passed === undefined) continue;
    totalWeight += weight;
    if (result.passed === true) realScore += weight;
  }

  if (totalWeight === 0) {
    return {
      score: null,
      classification: 'unknown',
      classificationReason: 'Unable to run tests'
    };
  }

  const score = Math.round((realScore / totalWeight) * 100);

  let classification, classificationReason;
  if (score >= 70) {
    classification = 'real';
    classificationReason = 'Quantity indicator passed most tests – likely real';
  } else if (score >= 40) {
    classification = 'suspicious';
    classificationReason = 'Ambiguous test results – suspicious indicator';
  } else {
    classification = 'fake';
    classificationReason = 'Quantity indicator failed most test – likely fake';
  }

  return { score, classification, classificationReason };
}

async function runTestsForTimer(timer) {
  const results = [];

  // 1) Persistence
  results.push(await (async () => {
    const out = { test: "persistence", passed: false };
    try {
      const r = await execInTempTab(
        timer.url,
        (path) => new Promise(resolve => {
          // wait for full page load
          setTimeout(() => {
            try {
              const el = path ? document.querySelector(path) : null;
              const txt = el ? el.innerText.trim() : "";
              return resolve({ found: !!el, txt });
            } catch (e) { resolve({ found: false, error: e.message }); }
          }, 2000);
        }),
        [timer.domPath]
      );
      if (!r) {
        out.passed = null;
        out.skipped = true;
        out.evidence = { reason: "no_result" };
      } else if (!r.found) {
        out.passed = null;
        out.skipped = true;
        out.evidence = { reason: "element_not_found_after_reload" };
      } else {
        const a = parseTimerTextToSeconds(timer.text || "");
        const b = parseTimerTextToSeconds(r.txt || "");
        // if value increased – timer renewed (fake)
        out.passed = !(a != null && b != null && b > a);
        out.evidence = { before: a, after: b };
      }
    } catch (e) {
      out.passed = false; out.evidence = { error: e.message };
    }
    return out;
  })());

  // 2) Expiration (<=5 min)
  results.push(await (async () => {
    const out = { test: "expiration", passed: false };
    try {
      const now = Date.now();
      const expiry = timer.expiresAt || 0;
      const delta = expiry - now;
      const MAX_WAIT = 5 * 60 * 1000;
      if (!expiry || delta <= 0 || delta > MAX_WAIT) {
        out.passed = null; // neither pass nor fail
        out.skipped = true;
        out.evidence = { reason: "skipped_long_or_unknown", expiresAt: timer.expiresAt };
        return out;
      }

      await sleep(delta + 2000);
      const r = await execInTempTab(
        timer.url,
        (path) => {
          const el = path ? document.querySelector(path) : null;
          const body = document.body.innerText.toLowerCase();
          const expiredKeywords = [
            // English
            "expired", "ended", "offer ended", "sold out",
            "no longer available", "deal ended", "sale ended",
            // Lithuanian
            "pasibaigė", "baigėsi", "pasiūlymas baigėsi",
            "nebeprieinama", "išpirkta", "akcija baigėsi"
          ];
          const pageChanged = expiredKeywords.some(k => body.includes(k));
          return { exists: !!el, text: el ? el.innerText.trim() : null, pageChanged };
        },
        [timer.domPath]
      );
      if (!r) { out.passed = false; out.evidence = { error: "no_result" }; }
      else if (!r.exists || r.pageChanged) { out.passed = true; out.evidence = r; }
      else {
        const a = parseTimerTextToSeconds(timer.text || "");
        const b = parseTimerTextToSeconds(r.text || "");
        out.passed = !(a != null && b != null && b > a);
        out.evidence = { before: a, after: b };
      }
    } catch (e) { out.passed = false; out.evidence = { error: e.message }; }
    return out;
  })());

  // 3) Cross-session
  results.push(await (async () => {
    const out = { test: "cross_session", passed: false };
    try {
      const r = await execInIncognito(
        timer.url,
        (path) => {
          try {
            const el = path ? document.querySelector(path) : null;
            const txt = el ? el.innerText.trim() : "";
            return { found: !!el, txt };
          } catch (e) { return { found: false, error: e.message }; }
        },
        [timer.domPath]
      ).catch(e => ({ error: e.message, incognito: false }));
      if (!r || r.error) { out.passed = null; out.skipped = true; out.evidence = r || { reason: "incognito_not_available" }; }
      else if (!r.found) {
        // element not found – cant evaluate
        out.passed = null;
        out.skipped = true;
        out.evidence = { reason: "element_not_found_in_incognito" };
      }
      else {
        const a = parseTimerTextToSeconds(timer.text || "");
        const b = parseTimerTextToSeconds(r.txt || "");
        out.passed = !(a != null && b != null && b > a);
        out.evidence = { sample: a, incognito: b };
      }
    } catch (e) { out.passed = false; out.evidence = { error: e.message }; }
    return out;
  })());

  // 4) Backend link
  results.push(await (async () => {
    const out = { test: "backend_link", passed: false };
    try {
      const timeRelatedKeywords = [
        // English
        "timer", "countdown", "offer", "deal", "expire",
        "promo", "sale", "stock", "inventory", "time",
        "price", "discount", "coupon",
        // Lithuanian
        "laikmatis", "pasiulymas", "akcija", "nuolaida",
        "likutis", "kaina", "sandoris"
      ];

      const r = await execInTempTab(
        timer.url,
        (keywords) => new Promise(resolve => {
          setTimeout(() => {
            try {
              const entries = performance.getEntriesByType("resource")
                .map(e => ({
                  name: e.name,
                  initiatorType: e.initiatorType
                }));

              const xhrFetch = entries.filter(e =>
                ["xmlhttprequest", "fetch"].includes(
                  (e.initiatorType || "").toLowerCase()
                )
              );

              const relevant = xhrFetch.filter(e =>
                keywords.some(k =>
                  e.name.toLowerCase().includes(k)
                )
              );

              resolve({
                total: entries.length,
                xhrFetch: xhrFetch.length,
                relevant: relevant.slice(0, 5)
              });
            } catch (e) {
              resolve({ error: e.message });
            }
          }, 3000); // wait for page load
        }),
        [timeRelatedKeywords]
      );

      if (!r || r.error) {
        out.passed = null;
        out.skipped = true;
        out.evidence = { reason: r?.error || "no_result" };
      } else if (r.relevant && r.relevant.length > 0) {
        // found timer related requests (real)
        out.passed = true;
        out.evidence = {
          total: r.total,
          xhrFetch: r.xhrFetch,
          relevant: r.relevant
        };
      } else if (r.xhrFetch === 0) {
        // no XHR/fetch requests (fake?)
        out.passed = false;
        out.evidence = {
          total: r.total,
          xhrFetch: 0,
          reason: "no_network_requests"
        };
      } else {
        // XHR requests exist, none related to timer
        out.passed = null;
        out.skipped = true;
        out.evidence = {
          total: r.total,
          xhrFetch: r.xhrFetch,
          reason: "requests_found_but_none_timer_related"
        };
      }
    } catch (e) {
      out.passed = false;
      out.evidence = { error: e.message };
    }
    return out;
  })());

  // 5) Reappearance (<=20s)
  results.push(await (async () => {
    const out = { test: "reappearance", passed: true };
    try {
      const now = Date.now();
      const expiry = timer.expiresAt || 0;
      const waitMs = expiry && expiry > now ? Math.min(expiry - now + 5000, 20000) : 20000;
      await sleep(waitMs);
      const r = await execInTempTab(
        timer.url,
        (path) => {
          const el = path ? document.querySelector(path) : null;
          const txt = el ? el.innerText.trim() : "";
          return { exists: !!el, txt };
        },
        [timer.domPath]
      );
      if (r?.exists) {
        const a = parseTimerTextToSeconds(timer.text || "");
        const b = parseTimerTextToSeconds(r.txt || "");
        if (a != null && b != null && b > a) {
          out.passed = false; out.evidence = { before: a, now: b, reason: "reappeared_or_reset" };
        } else {
          out.passed = true; out.evidence = { exists: true, txt: r.txt };
        }
      } 
      else if (!r?.exists) {
        // element not found – cant eval
        out.passed = null;
        out.skipped = true;
        out.evidence = { reason: "element_not_found_after_wait" };
      }
    } catch (e) { out.passed = false; out.evidence = { error: e.message }; }
    return out;
  })());

  // print results + mark completed + classification
  const classificationInfo = classifyFromTests(results);

  await enqueueWrite(() =>
    withDetectedTimers(list => {
      const idx = list.findIndex(t => isSameTimer(t, timer));
      if (idx === -1) return;

      const entry = list[idx];
      const prev = Array.isArray(entry.testResults) ? entry.testResults : [];
      const merged = mergeTestResults(prev, results);

      list[idx] = {
        ...entry,
        testsStarted: true,
        testsCompleted: true,
        testResults: merged,
        classification: classificationInfo.classification,
        classificationReason: classificationInfo.classificationReason,
        score: classificationInfo.score
      };

      return list;
    })
  );

}

function mergeTestResults(oldArr, newArr) {
  const map = new Map(oldArr.map(r => [r.test, r]));
  newArr.forEach(r => map.set(r.test, r));
  return Array.from(map.values());
}

// ---------- 
// message handling
// ---------- 

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "timerDetected") {
    const incoming = { ...msg.data, url: msg.data?.url || sender?.tab?.url || "" };

    // 1) SAVE IMMEDIATELY so popup shows it
    enqueueWrite(() =>
      withDetectedTimers(list => mergeTimer(list, incoming))
    ).then(() => sendResponse?.({ ok: true }));

    // 2) if not already started/completed, mark started NOW and queue tests
    enqueueWrite(() =>
      withDetectedTimers(list => {
        const idx = list.findIndex(t => isSameTimer(t, incoming));
        if (idx === -1) return;
        const entry = list[idx];
        // if tests already started - do nothing (avoids duplicate candidate marking)
        if (entry.testsCompleted || entry.testsStarted) return;
        // mark immediately
        list[idx] = { ...entry, testsStarted: true, testsCompleted: false };
        return list;
      })
    ).then(updated => {
      if (!updated) return;
      const timer = updated.find(t => isSameTimer(t, incoming));
      if (!timer || !timer.testsStarted || timer.testsCompleted) return;
      // seperate quantity and timer tests
      if (timer.type === "quantity") {
        enqueueTest(() => runQuantityTests(timer));
      } else {
        enqueueTest(() => runTestsForTimer(timer));
      }
    });

    return true; // async
  }

  if (msg?.type === "clearDetectedTimers") {
    enqueueWrite(() => withDetectedTimers(() => []))
      .then(() => sendResponse?.({ ok: true }));
    return true;
  }
});
