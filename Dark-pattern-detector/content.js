// ----------------------------
// content.js - baseline (no tests), stable marking/saving
// ----------------------------

// -------------
// global vars
// -------------
const markedElements = new WeakSet();
let isMarkingElement = false; // global flag for MutationObserver lock

// skip pattern detection for temporary testing tabs
if (window.location.search.includes("fake_urgency_test=1")) {
  console.log("[Content] Test tab – skipping detection");
  throw new Error("test_tab");
}

// ----------------------------
// Urgency timer marking
// ----------------------------
function markFake(el, reason, totalSeconds) {
  if (!el) return;
  if (markedElements.has(el)) return;      // in-page dedupe
  if (el.hasAttribute("data-fake-urgency-id")) return; // attribute dedupe
  markedElements.add(el);

  isMarkingElement = true;
  // visual mark
  el.style.border = "2px dashed red";
  el.style.backgroundColor = "rgba(255, 0, 0, 0.1)";
  el.title = "Possible fake urgency timer";

  // attributes for CSS + popup logic
  el.setAttribute("data-fake-urgency", "possible"); // <-- universal flag for CSS
  if (reason === "keywords") {
    el.setAttribute("data-fake-urgency-keyword", "possible");
  } else if (reason === "timer") {
    el.setAttribute("data-fake-urgency-timer", "possible");
  }

  // stable ID per element
  const uid = "fake-urgency-" + Math.random().toString(36).slice(2, 11);
  el.setAttribute("data-fake-urgency-id", uid);

  const path = getDomPath(el);

  const foundAt = Date.now();
  const foundAtDate = new Date(foundAt).toLocaleString();

  let expiresAt = null;
  let expiresAtDate = null;
  if (totalSeconds) {
    expiresAt = foundAt + totalSeconds * 1000;
    expiresAtDate = new Date(expiresAt).toLocaleString();
  }

  isMarkingElement = false;
  // save once
  chrome.runtime.sendMessage({
    type: "timerDetected",
    data: {
      text: el.innerText.trim(),
      type: "timer",
      foundAt,
      foundAtDate,
      expiresAt,
      expiresAtDate,
      elementId: uid,
      domPath: path,
      url: window.location.href
    }
  });

  console.log("[Content] MARKED:", uid, el.textContent.trim());
}

// ----------------------------
// DOM path helper
// ----------------------------
function getDomPath(el) {
  if (!el) return null;
  const stack = [];
  let node = el;

  while (node?.parentNode) {
    let sibCount = 0, sibIndex = 0;
    const siblings = node.parentNode.children;
    for (let i = 0; i < siblings.length; i++) {
      const sib = siblings[i];
      if (sib.nodeName === node.nodeName) {
        if (sib === node) sibIndex = sibCount;
        sibCount++;
      }
    }

    const name = node.nodeName.toLowerCase();
    stack.unshift(sibCount > 1 ? `${name}:nth-of-type(${sibIndex + 1})` : name);
    node = node.parentNode;
    if (!node || node.nodeName === "HTML") break;
  }
  return stack.join(" > ");
}

// ----------------------------
// Utilities
// ----------------------------
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ----------------------------
// Watch for numeric changes in the DOM
// ----------------------------
function watchSplitTimers(doc = document) {
  const isNumericTimerText = txt => /^[0-9:]+$/.test((txt || "").replace(/\s+/g, ''));

  const observer = new MutationObserver(mutations => {
    if (isMarkingElement) return;
    mutations.forEach(mutation => {
      if (mutation.type === "characterData") {
        const parent = mutation.target.parentElement;
        if (!parent) return;
        const tag = parent.tagName;
        if (tag === "SCRIPT" || tag === "STYLE") return;

        const txt = (mutation.target.nodeValue || "").trim();
        if (!txt) return;
        if (/\$|€|£/.test(txt)) return;
        if (isNumericTimerText(txt)) checkIfTimer(parent);

      } else if (mutation.type === "childList") {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 3) {
            const parent = node.parentElement;
            if (!parent) return;
            const tag = parent.tagName;
            if (tag === "SCRIPT" || tag === "STYLE") return;
            const val = (node.nodeValue || "").trim();
            if (!val) return;
            if (/\$|€|£/.test(val)) return;
            if (isNumericTimerText(val)) checkIfTimer(parent);

          } else if (node.nodeType === 1) {
            const tag = node.tagName;
            if (tag === "SCRIPT" || tag === "STYLE") return;

            const numericDescendants = Array.from(node.querySelectorAll("*")).some(el => {
              const t = (el.textContent || "").trim();
              if (!t) return false;
              if (/\$|€|£/.test(t)) return false;
              return isNumericTimerText(t);
            });
            if (numericDescendants) checkIfTimer(node);

            // handle iframes
            if (tag === "IFRAME") attachObserverToIframe(node);
          }
        });
      }
    });
  });

  observer.observe(doc.body, { characterData: true, subtree: true, childList: true });

  Array.from(doc.querySelectorAll("iframe")).forEach(iframe => attachObserverToIframe(iframe));

  function attachObserverToIframe(iframe) {
    try {
      if (iframe.contentDocument?.body) {
        watchSplitTimers(iframe.contentDocument);
        console.log("[Content] Attached observer to iframe:", iframe);
      } else {
        iframe.addEventListener("load", () => {
          try {
            if (!iframe.contentDocument?.body) return;
            watchSplitTimers(iframe.contentDocument);
            console.log("[Content] Attached observer to iframe after load:", iframe);
          } catch (e) {
            console.warn("[Content] Cannot access iframe after load:", e);
          }
        });
      }
    } catch (e) {
      console.warn("[Content] Cannot access iframe (cross-origin):", e);
    }
  }
}

// store candidates we are watching
const candidateTimers = new WeakMap();

// ----------------------------
// Check if element is a timer
// ----------------------------
function checkIfTimer(el) {
  if (!el) return;

  let container = el.parentElement;
  if (!container) return;

  if (!el.offsetParent || window.getComputedStyle(el).display === "none") return;

  // collect numeric values from direct visible children
  let numbers = Array.from(container.children || [])
    .filter(child => {
      const style = window.getComputedStyle(child);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
      return /^\d{1,2}$/.test(child.textContent.trim());
    })
    .map(c => parseInt(c.textContent.trim(), 10))
    .filter(n => !isNaN(n));

  if (numbers.length === 0 || numbers.length > 4) return;

  let timerContainer = container;

  // handle segmented timers by climbing to a parent that has 2–4 numeric children
  if (numbers.length === 1) {
    let parent = container.parentElement;
    while (parent && parent !== document.body) {
      const parentNumbers = Array.from(parent.children || [])
        .filter(c => {
          const style = window.getComputedStyle(c);
          if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
          return /^\d{1,2}$/.test(c.textContent.trim());
        })
        .map(c => parseInt(c.textContent.trim(), 10))
        .filter(n => !isNaN(n));

      if (parentNumbers.length >= 2 && parentNumbers.length <= 4) {
        timerContainer = parent;
        numbers = parentNumbers;
        break;
      }
      parent = parent.parentElement;
    }
  }

  if (!timerContainer) return;
  if (timerContainer.hasAttribute("data-fake-urgency-id")) return; // already marked
  if (timerContainer.querySelector("img") || timerContainer.querySelector("a")) return;

  // verify it ticks down before marking
  if (!candidateTimers.has(timerContainer)) {
    candidateTimers.set(timerContainer, { lastNumbers: numbers, verified: false });
    setTimeout(() => {
      const state = candidateTimers.get(timerContainer);
      if (!state || state.verified) return;

      const currentNumbers = Array.from(timerContainer.querySelectorAll(":scope > *"))
        .map(c => parseInt((c.textContent || "").trim(), 10))
        .filter(n => !isNaN(n));

      const decreased = state.lastNumbers.some((n, i) => currentNumbers[i] < n);
      if (!decreased) {
        candidateTimers.delete(timerContainer);
        return;
      }

      state.verified = true;

      const unitsOrder = ['days', 'hours', 'minutes', 'seconds'];
      let totalSeconds = 0;
      for (let i = 0; i < currentNumbers.length; i++) {
        const unitIndex = unitsOrder.length - 1 - i;
        if (unitIndex < 0) break;
        const unit = unitsOrder[unitIndex];
        const value = currentNumbers[currentNumbers.length - 1 - i];
        switch (unit) {
          case 'days': totalSeconds += value * 86400; break;
          case 'hours': totalSeconds += value * 3600; break;
          case 'minutes': totalSeconds += value * 60; break;
          case 'seconds': totalSeconds += value; break;
        }
      }

      markFake(timerContainer, "timer", totalSeconds);
    }, 3000);
  }
}

// ----------------------------
// Limited quantity message detection
// ----------------------------

var QUANTITY_PATTERNS = [
  // quantity mesages

  // Lithuanian
  /liko\s+tik\s*:\s*\d+/i,
  /liko\s+tik\s+\d+/i,
  /liko\s+\d+/i,
  /tik\s+\d+\s+(vnt|vieta|vietos|bilietas|bilietų)/i,
  /\d+\s+(vnt|vieta|vietos)\s+liko/i,
  // English
  /only\s+\d+\s+left/i,
  /\d+\s+left\s+in\s+stock/i,
  /only\s+\d+\s+remaining/i,
  /\d+\s+item[s]?\s+left/i,
  /hurry[,!]?\s+only\s+\d+/i,
  /just\s+\d+\s+left/i,
  /limited\s+stock[:\s]+\d+/i,

  // social pressure messages
  /\d+\s+(žmoni[ųė]|people|person[s]?)\s+(žiūri|perka|peržiūri|viewing|watching|buying)/i,
  /\d+\s+(žmoni[ųė]|people)\s+(šiuo metu|currently|right now)/i,
  /\d+\s+(sold|parduota)\s+(in\s+last|per\s+paskutinę)/i,
];

const markedQuantityElements = new WeakSet();

function checkQuantityIndicator(el) {
  if (!el || markedQuantityElements.has(el)) return;
  if (el.hasAttribute("data-fake-urgency-id")) return;

  //check if extension context hasnt expired
  if (!chrome.runtime?.id) return;

  const text = (el.innerText || el.textContent || "").trim();
  if (!text || text.length > 200) return;

  // check if text matches pattern
  const matched = QUANTITY_PATTERNS.some(pattern => pattern.test(text));
  if (!matched) return;

  // ignore naviagtion, script etc
  const tag = el.tagName?.toLowerCase();
  if (["nav", "header", "footer", "script", "style"].includes(tag)) return;

  // ignore massive containers (assuming they are not indicators)
  if (el.children.length > 10) return;

  const matchingChild = Array.from(el.children).find(child => {
    const childText = (child.innerText || child.textContent || "").trim();
    return QUANTITY_PATTERNS.some(p => p.test(childText));
  });
  if (matchingChild) return;

  markedQuantityElements.add(el);

  isMarkingElement = true;
  // visual marking
  el.style.border = "2px dashed orange";
  el.style.backgroundColor = "rgba(255, 165, 0, 0.1)";
  el.title = "Galimas riboto kiekio indikatorius";
  el.setAttribute("data-fake-urgency", "possible");
  el.setAttribute("data-fake-urgency-quantity", "possible");

  const uid = "fake-urgency-qty-" + Math.random().toString(36).slice(2, 11);
  el.setAttribute("data-fake-urgency-id", uid);

  const path = getDomPath(el);
  const foundAt = Date.now();

  isMarkingElement = false;

  chrome.runtime.sendMessage({
    type: "timerDetected",
    data: {
      text: text,
      type: "quantity",  // indicator type
      foundAt,
      foundAtDate: new Date(foundAt).toLocaleString(),
      expiresAt: null,
      expiresAtDate: null,
      elementId: uid,
      domPath: path,
      url: window.location.href
    }
  });

  console.log("[Content] QUANTITY marked:", uid, text);
}

function scanQuantityIndicators(root = document) {
  // read all text elements
  const candidates = root.querySelectorAll(
    "p, span, div, strong, b, small, li, h1, h2, h3, h4, h5, h6"
  );

  candidates.forEach(el => {
    // check only leaf elements
    const directText = Array.from(el.childNodes)
      .filter(n => n.nodeType === 3)
      .map(n => n.textContent.trim())
      .join(" ")
      .trim();

    if (directText.length > 5) {
      checkQuantityIndicator(el);
    }
  });
}

function watchQuantityIndicators(doc = document) {
  // first scan
  scanQuantityIndicators(doc);

  // watch for DOM changes
  const observer = new MutationObserver(mutations => {
    if (isMarkingElement) return
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === 1) {
          checkQuantityIndicator(node);
          node.querySelectorAll("p, span, div, strong, b, small, li")
            .forEach(el => checkQuantityIndicator(el));
        } else if (node.nodeType === 3) {
          const parent = node.parentElement;
          if (parent) checkQuantityIndicator(parent);
        }
      });

      // watch for text changes
      if (mutation.type === "characterData") {
        const parent = mutation.target.parentElement;
        if (parent) checkQuantityIndicator(parent);
      }
    });
  });

  observer.observe(doc.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

// ----------------------------
// Start observing
// ----------------------------
watchSplitTimers();
watchQuantityIndicators();
