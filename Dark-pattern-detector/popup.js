// popup.js - grouped view + test results

function hostname(u) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function renderTestResults(container, timer) {
  const tests = Array.isArray(timer.testResults) ? timer.testResults : [];
  const started = timer.testsStarted ? "Started" : "Not started";
  const completed = timer.testsCompleted ? "Completed" : "Running...";

  const wrap = document.createElement("div");
  wrap.style.marginTop = "6px";
  wrap.style.fontSize = "0.9em";
  wrap.style.borderTop = "1px solid #eee";
  wrap.style.paddingTop = "6px";

  const status = document.createElement("div");
  status.innerHTML = `<b>Tests:</b> <span>${started} / ${completed}</span>`;
  wrap.appendChild(status);

  if (tests.length === 0) {
    const none = document.createElement("div");
    none.style.color = "#777";
    none.textContent = "No results yet.";
    wrap.appendChild(none);
  } else {
    tests.forEach(t => {
      const statusText = t.skipped || t.passed === null ? "Skipped" : (t.passed ? "Passed" : "Failed");
      const color = t.skipped || t.passed === null ? "#555" : (t.passed ? "green" : "red");
      const ev = typeof t.evidence === "object" ? JSON.stringify(t.evidence) : (t.evidence || "");
      const row = document.createElement("div");
      row.innerHTML = `<b style="color:${color}">${t.test}</b>: ${statusText}<br><span style="color:#777">${ev}</span>`;

      row.style.marginTop = "4px";
      wrap.appendChild(row);
    });
  }

  container.appendChild(wrap);
}

function renderClassification(container, timer) {
  const score = timer.score;
  const status = timer.classification || "unknown";

  const wrap = document.createElement("div");
  wrap.style.marginTop = "6px";

  // score
  let color, label, barColor;

  switch (status) {
    case 'real':
      color = 'green';
      label = 'Real timer';
      barColor = '#28a745';
      break;
    case 'fake':
      color = 'red';
      label = 'Deceptive  timer';
      barColor = '#dc3545';
      break;
    case 'suspicious':
      color = 'orange';
      label = 'Suspicious timer';
      barColor = '#fd7e14';
      break;
    default:
      color = '#555';
      label = timer.testsCompleted
        ? 'Unclear'
        : (timer.testsStarted ? 'Running tests...' : 'Tests not started');
      barColor = '#aaa';
      break;
  }

  // result line
  wrap.innerHTML = `
    <strong>Result:</strong>
    <span style="color:${color}; font-weight:600;"> ${label}</span>
    ${score !== null && score !== undefined
      ? `<span style="color:#555; font-size:0.85em;"> (${score}/100)</span>`
      : ''}
  `;

  // progress bar
  if (score !== null && score !== undefined) {
    const bar = document.createElement("div");
    bar.style.cssText = `
      margin-top: 4px;
      height: 6px;
      width: 100%;
      background: #e9ecef;
      border-radius: 3px;
      overflow: hidden;
    `;
    const fill = document.createElement("div");
    fill.style.cssText = `
      height: 100%;
      width: ${score}%;
      background: ${barColor};
      border-radius: 3px;
      transition: width 0.3s ease;
    `;
    bar.appendChild(fill);
    wrap.appendChild(bar);
  }

  // reason
  if (timer.classificationReason) {
    const reason = document.createElement("div");
    reason.style.cssText = "font-size:0.85em; color:#777; margin-top:3px;";
    reason.textContent = timer.classificationReason;
    wrap.appendChild(reason);
  }

  container.appendChild(wrap);
}

function renderCurrentSite(list, host) {
  const container = document.getElementById("currentSiteTimers");
  container.innerHTML = "";

  const countEl = document.getElementById("timerCount");
  if (countEl) countEl.textContent = list.length > 0 ? `(${list.length})` : "";

  if (list.length === 0) {
    container.innerHTML = `<p style="color:#777;margin:4px 0 8px;">No timers detected on ${host} yet.</p>`;
    return;
  }

  list.forEach(timer => {
    const div = document.createElement("div");
    div.className = "timer";
    div.style.marginBottom = "12px";
    div.innerHTML = `
      <strong>Text:</strong> ${timer.text}<br>
      ${timer.type === "quantity"
        ? `<span style="background:#fd7e14; color:white; font-size:0.75em; 
            padding:1px 5px; border-radius:3px; margin-left:4px;">quantity</span>`
        : `<span style="background:#6c757d; color:white; font-size:0.75em; 
            padding:1px 5px; border-radius:3px; margin-left:4px;">timer</span>`
      }
      <strong>Found at:</strong> ${timer.foundAtDate}<br>
      ${timer.expiresAtDate ? `<strong>Expires at:</strong> ${timer.expiresAtDate}<br>` : ""}
      <small>${timer.url}</small><br>
      <button data-action="highlight" data-id="${timer.elementId}" data-path="${timer.domPath}">Highlight on Page</button>
    `;
    container.appendChild(div);

    renderClassification(div, timer);

    renderTestResults(div, timer);
  });
}


function renderOtherSites(grouped, activeHost) {
  const wrap = document.getElementById("otherSites");
  wrap.innerHTML = "";

  const otherHosts = Object.keys(grouped).filter(h => h !== activeHost).sort();
  if (otherHosts.length === 0) {
    wrap.innerHTML = `<p style="color:#777;margin:4px 0 8px;">No timers from other sites.</p>`;
    return;
  }

  otherHosts.forEach(h => {
    const arr = grouped[h];

    const details = document.createElement("details");
    details.style.marginBottom = "10px";

    const summary = document.createElement("summary");
    summary.textContent = `${h} (${arr.length})`;
    summary.style.cursor = "pointer";
    summary.style.fontWeight = "600";
    details.appendChild(summary);

    const box = document.createElement("div");
    box.style.margin = "6px 0 0";

    arr.forEach(timer => {
      const div = document.createElement("div");
      div.className = "timer";
      div.style.marginBottom = "12px";
      div.innerHTML = `
        <strong>Text:</strong> ${timer.text}<br>
        ${timer.type === "quantity"
          ? `<span style="background:#fd7e14; color:white; font-size:0.75em; 
              padding:1px 5px; border-radius:3px; margin-left:4px;">kiekis</span>`
          : `<span style="background:#6c757d; color:white; font-size:0.75em; 
              padding:1px 5px; border-radius:3px; margin-left:4px;">laikmatis</span>`
        }
        <strong>Found at:</strong> ${timer.foundAtDate}<br>
        ${timer.expiresAtDate ? `<strong>Expires at:</strong> ${timer.expiresAtDate}<br>` : ""}
        <small>${timer.url}</small><br>
        <div style="display:flex; gap:6px; margin-top:4px;">
          <button data-action="open" data-url="${timer.url}">Open Page</button>
          <button data-action="highlight-cross" title="Open page then try to highlight" data-id="${timer.elementId}" data-path="${timer.domPath}" data-url="${timer.url}">
            Highlight (then switch)
          </button>
        </div>
      `;
      box.appendChild(div);
      renderClassification(div, timer);
      renderTestResults(div, timer);

    });

    details.appendChild(box);
    wrap.appendChild(details);
  });
}

function renderAll(activeTabUrl) {
  const activeHost = hostname(activeTabUrl || "");
  document.getElementById("activeHost")?.replaceChildren(document.createTextNode(activeHost || "unknown"));

  chrome.storage.local.get("detectedTimers", res => {
    const timers = res.detectedTimers || [];

    const grouped = {};
    timers.forEach(t => {
      const h = hostname(t.url);
      if (!grouped[h]) grouped[h] = [];
      grouped[h].push(t);
    });

    const current = grouped[activeHost] || [];
    renderCurrentSite(current, activeHost);
    renderOtherSites(grouped, activeHost);
  });
}

// Button / events

document.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  const action = btn.getAttribute("data-action");

  if (action === "highlight") {
    const id = btn.getAttribute("data-id");
    const path = btn.getAttribute("data-path");
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: highlightElement,
        args: [id, path]
      });
    });
  }

  if (action === "open") {
    const url = btn.getAttribute("data-url");
    if (url) chrome.tabs.create({ url });
  }

  if (action === "highlight-cross") {
    const id = btn.getAttribute("data-id");
    const path = btn.getAttribute("data-path");
    const url = btn.getAttribute("data-url");
    if (!url) return;
    chrome.tabs.create({ url, active: true }, tab => {
      setTimeout(() => {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: highlightElement,
          args: [id, path]
        });
      }, 1500);
    });
  }
});

function highlightElement(id, domPath) {
  let el = document.querySelector(`[data-fake-urgency-id="${id}"]`);
  if (!el && domPath) {
    try { el = document.querySelector(domPath); } catch {}
  }
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.style.transition = "background 0.5s";
    el.style.background = "yellow";
    setTimeout(() => (el.style.background = ""), 2000);
  } else {
    alert("Could not find the element on this page anymore.");
  }
}

document.getElementById("clear").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "clearDetectedTimers" }, () => {
    renderWithActive();
  });
});

function renderWithActive() {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const url = tabs?.[0]?.url || "";
    renderAll(url);
  });
}

document.addEventListener("DOMContentLoaded", renderWithActive);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.detectedTimers) {
    renderWithActive();
  }
});
