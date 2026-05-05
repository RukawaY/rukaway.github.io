"use strict";

// API base — empty string means "same origin" (LAN deployment). When the
// frontend is hosted off-server (e.g. https://ziyuan-xia.com/eval/) the page
// must set window.__VLM_API_BASE__ = "https://<tunnel-host>" before loading
// this script. Trailing slash is stripped so the joins below stay clean.
const API_BASE = (
  (typeof window !== "undefined" && window.__VLM_API_BASE__) || ""
).replace(/\/+$/, "");
function apiUrl(path) { return API_BASE + path; }

const STORAGE_KEY = "vlm-eval-session-id";
const DIMENSIONS = ["realism"];
const DIM_LABELS = {
  realism: "真实性",
};
const DIM_HINTS = {
  realism: "与真实照片的相似程度",
};

const views = {
  consent: document.getElementById("view-consent"),
  eval:    document.getElementById("view-eval"),
  done:    document.getElementById("view-done"),
};

function show(view) {
  for (const k of Object.keys(views)) views[k].hidden = (k !== view);
  window.scrollTo({ top: 0, behavior: "instant" });
}

function showError(el, msg) {
  el.textContent = msg;
  el.hidden = false;
}

// ---------------------------------------------------------------------------
// Shared session state (mutable; refreshed from server)
// ---------------------------------------------------------------------------

const state = {
  sessionId: null,
  totalItems: 60,
  numBatches: 10,
  batchSize: 6,
  completedBatches: 0,
  currentBatchIdx: 0,
  // Items in display order (item_idx 0..5).
  // Each: { token, item_idx }
  items: [],
  // rankings[dim] = array of length BATCH_SIZE; each entry is a token or null.
  rankings: { realism: [] },
  // The currently armed slot (next click on an image fills it). Null if no
  // slot is armed. { dim: 'quality', rankIdx: 0 } means rank 1 of quality.
  armed: null,
  // Recently filled card (for a brief visual pop).
  recentToken: null,
  // Whether a network submit is in flight.
  submitting: false,
};

// ---------------------------------------------------------------------------
// Consent flow
// ---------------------------------------------------------------------------

const consentForm = document.getElementById("consent-form");
const consentError = document.getElementById("consent-error");
const consentSubmit = document.getElementById("consent-submit");

consentForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  consentError.hidden = true;
  const name = document.getElementById("name-input").value.trim();
  const consent = document.getElementById("consent-input").checked;
  if (!name) return showError(consentError, "请填写您的真实姓名。");
  if (!consent) return showError(consentError, "请勾选知情同意声明。");
  consentSubmit.disabled = true;
  consentSubmit.textContent = "正在开始…";
  try {
    const r = await fetch(apiUrl("/api/session"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, consent: true }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "创建会话失败");
    localStorage.setItem(STORAGE_KEY, data.session_id);
    state.sessionId = data.session_id;
    await loadCurrentBatch();
  } catch (err) {
    console.error("create session failed:", err);
    showError(
      consentError,
      "创建评估会话失败：" + (err && err.message ? err.message : err),
    );
    consentSubmit.disabled = false;
    consentSubmit.textContent = "开始评估";
  }
});

// ---------------------------------------------------------------------------
// Batch ranking flow
// ---------------------------------------------------------------------------

const imageGrid    = document.getElementById("image-grid");
const rankCols     = document.getElementById("rank-cols");
const evalError    = document.getElementById("eval-error");
const nextBatchBtn = document.getElementById("next-batch-btn");
const batchTitle   = document.getElementById("batch-title");
const batchStatus  = document.getElementById("batch-status");
const progressFill = document.getElementById("progress-fill");
const evalTip      = document.getElementById("eval-tip");
const cardTpl      = document.getElementById("card-template");
const colTpl       = document.getElementById("rank-col-template");

function applyState(s) {
  state.totalItems       = s.total_items;
  state.numBatches       = s.num_batches;
  state.batchSize        = s.batch_size;
  state.completedBatches = s.completed_batches;
  state.currentBatchIdx  = s.current_batch_idx ?? 0;
  state.items            = (s.current_batch_items || []).slice()
                              .sort((a, b) => a.item_idx - b.item_idx);
  state.nextItems        = (s.next_batch_items || []).slice();

  // Initialise ranking arrays from server (resume support).
  for (const d of DIMENSIONS) {
    const arr = new Array(state.batchSize).fill(null);
    const order = (s.current_batch_rankings && s.current_batch_rankings[d]) || [];
    order.forEach((tok, i) => { if (i < arr.length) arr[i] = tok; });
    state.rankings[d] = arr;
  }
  state.armed = null;
  state.recentToken = null;
}

// Kick off background fetches for the *next* batch's images so they're warm
// in the browser cache by the time the user clicks "next batch". We just
// instantiate Image objects -- the browser fetches and decodes, and the
// resulting bytes sit in the HTTP cache (Cache-Control: private, max-age).
const _preloadedTokens = new Set();
function preloadNextBatch() {
  if (!Array.isArray(state.nextItems)) return;
  for (const it of state.nextItems) {
    if (_preloadedTokens.has(it.token)) continue;
    _preloadedTokens.add(it.token);
    const img = new Image();
    img.decoding = "async";
    img.src = apiUrl(`/api/img/${it.token}`);
  }
}

function isRowComplete(dim) {
  return state.rankings[dim].every((t) => t !== null);
}
function isAllComplete() {
  return DIMENSIONS.every(isRowComplete);
}

// First empty rank index for a dim (or -1 if all filled).
function firstEmptyRank(dim) {
  return state.rankings[dim].findIndex((t) => t === null);
}

// Pick the slot to auto-arm next: first incomplete dim's first empty slot.
function autoArm() {
  for (const d of DIMENSIONS) {
    const i = firstEmptyRank(d);
    if (i >= 0) { state.armed = { dim: d, rankIdx: i }; return; }
  }
  state.armed = null;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function renderBatch() {
  evalError.hidden = true;
  imageGrid.innerHTML = "";
  rankCols.innerHTML = "";

  // Image cards
  for (const it of state.items) {
    const node = cardTpl.content.firstElementChild.cloneNode(true);
    node.dataset.token = it.token;
    node.dataset.pos = String(it.item_idx + 1);
    node.querySelector("img").src = apiUrl(`/api/img/${it.token}`);
    node.querySelector(".img-pos-circle").textContent = String(it.item_idx + 1);
    node.addEventListener("click", () => onImageClick(it.token, node));
    imageGrid.appendChild(node);
  }

  // Rank columns (one per dimension, vertically stacked slots)
  for (const dim of DIMENSIONS) {
    const col = colTpl.content.firstElementChild.cloneNode(true);
    col.dataset.dim = dim;
    col.querySelector(".rank-col-label").textContent = DIM_LABELS[dim];
    const slots = col.querySelector(".rank-slots");
    for (let i = 0; i < state.batchSize; i++) {
      const slot = document.createElement("button");
      slot.type = "button";
      slot.className = "rank-slot";
      slot.dataset.dim = dim;
      slot.dataset.rank = String(i + 1);
      slot.innerHTML =
        `<span class="slot-rank">第 ${i + 1} 名</span>` +
        `<span class="slot-fill">—</span>`;
      slot.addEventListener("click", () => onSlotClick(dim, i));
      slots.appendChild(slot);
    }
    col.querySelector(".rank-clear").addEventListener("click", () => clearRow(dim));
    rankCols.appendChild(col);
  }

  if (!state.armed) autoArm();
  refreshAllUI();
  // Warm the cache for the upcoming batch.
  preloadNextBatch();
}

function refreshAllUI() {
  // Header
  batchTitle.textContent = `第 ${state.currentBatchIdx + 1} / ${state.numBatches} 批`;
  batchStatus.textContent = `已完成 ${state.completedBatches} / ${state.numBatches} 批`;
  const pct = Math.round((state.completedBatches / state.numBatches) * 100);
  progressFill.style.width = pct + "%";

  // Tip text reflecting the armed slot
  if (state.armed) {
    evalTip.innerHTML =
      `请点击下方任意一张图片，将其指定为 <strong>` +
      `${DIM_LABELS[state.armed.dim]} 第 ${state.armed.rankIdx + 1} 名</strong>。` +
      ` 也可点击其它名次的方块来调整。`;
  } else if (isAllComplete()) {
    evalTip.innerHTML =
      `本批已排序完成，确认无误后点击右下方<strong>"提交并进入下一批"</strong>。`;
  } else {
    evalTip.textContent = "请选择一个名次方块，再点击图片完成排序。";
  }

  // Image cards & badges
  for (const card of imageGrid.querySelectorAll(".img-card")) {
    const tok = card.dataset.token;
    card.classList.toggle("recent", tok === state.recentToken);
    for (const dim of DIMENSIONS) {
      const r = state.rankings[dim].indexOf(tok);
      const badge = card.querySelector(`.rank-badge[data-dim="${dim}"]`);
      if (r >= 0) {
        badge.classList.add("set");
        badge.textContent = `${DIM_LABELS[dim][0]}${r + 1}`;
      } else {
        badge.classList.remove("set");
        badge.textContent = "";
      }
    }
  }
  imageGrid.classList.toggle("armed", state.armed !== null);

  // Rank columns
  for (const col of rankCols.querySelectorAll(".rank-col")) {
    const dim = col.dataset.dim;
    col.classList.toggle("complete", isRowComplete(dim));
    col.classList.toggle("active", state.armed?.dim === dim);
    for (const slot of col.querySelectorAll(".rank-slot")) {
      const i = Number(slot.dataset.rank) - 1;
      const tok = state.rankings[dim][i];
      const filled = tok !== null;
      slot.classList.toggle("filled", filled);
      slot.classList.toggle(
        "armed",
        state.armed && state.armed.dim === dim && state.armed.rankIdx === i,
      );
      const fillEl = slot.querySelector(".slot-fill");
      fillEl.textContent = filled ? String(tokenPos(tok)) : "—";
    }
  }

  // Footer button
  nextBatchBtn.disabled = !isAllComplete() || state.submitting;
  nextBatchBtn.textContent = state.submitting
    ? "正在提交…"
    : "提交并进入下一批";
}

function tokenPos(token) {
  const it = state.items.find((x) => x.token === token);
  return it ? it.item_idx + 1 : "?";
}

// ---------------------------------------------------------------------------
// Interaction
// ---------------------------------------------------------------------------

function onSlotClick(dim, rankIdx) {
  // Clicking a filled slot empties it; arm it for refill.
  if (state.rankings[dim][rankIdx] !== null) {
    state.rankings[dim][rankIdx] = null;
  }
  state.armed = { dim, rankIdx };
  state.recentToken = null;
  refreshAllUI();
}

function onImageClick(token) {
  if (!state.armed) {
    // No slot armed -> auto-arm the first incomplete dim then assign.
    autoArm();
    if (!state.armed) return;
  }
  const { dim, rankIdx } = state.armed;
  // If this image already has a rank in this dim, vacate that slot first.
  const existing = state.rankings[dim].indexOf(token);
  if (existing >= 0) {
    state.rankings[dim][existing] = null;
  }
  state.rankings[dim][rankIdx] = token;
  state.recentToken = token;
  // Auto-advance to next empty slot in any dim (current dim first).
  autoArm();
  refreshAllUI();
}

function clearRow(dim) {
  state.rankings[dim] = new Array(state.batchSize).fill(null);
  state.armed = { dim, rankIdx: 0 };
  state.recentToken = null;
  refreshAllUI();
}

// ---------------------------------------------------------------------------
// Submit current batch -> advance
// ---------------------------------------------------------------------------

nextBatchBtn.addEventListener("click", async () => {
  if (!isAllComplete() || state.submitting) return;
  state.submitting = true;
  evalError.hidden = true;
  refreshAllUI();
  try {
    const r = await fetch(apiUrl("/api/batch_rankings"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: state.sessionId,
        batch_idx:  state.currentBatchIdx,
        rankings:   state.rankings,
      }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "提交失败");
    state.submitting = false;
    if (data.completed) {
      show("done");
      return;
    }
    applyState(data);
    renderBatch();
  } catch (err) {
    console.error("submit batch failed:", err);
    state.submitting = false;
    showError(
      evalError,
      "提交本批排序失败：" + (err && err.message ? err.message : err),
    );
    refreshAllUI();
  }
});

async function loadCurrentBatch() {
  show("eval");
  try {
    const r = await fetch(apiUrl(`/api/session/${state.sessionId}`));
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "查询会话失败");
    if (data.completed) { show("done"); return; }
    applyState(data);
    renderBatch();
  } catch (err) {
    console.error("load batch failed:", err);
    showError(
      consentError,
      "加载评估失败：" + (err && err.message ? err.message : err),
    );
    show("consent");
  }
}

// ---------------------------------------------------------------------------
// Restart from done
// ---------------------------------------------------------------------------

document.getElementById("restart-btn").addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
});

// ---------------------------------------------------------------------------
// Boot: resume session if one exists
// ---------------------------------------------------------------------------

(async function boot() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) { show("consent"); return; }
  state.sessionId = saved;
  try {
    const r = await fetch(apiUrl(`/api/session/${saved}`));
    if (r.status === 404) {
      localStorage.removeItem(STORAGE_KEY);
      show("consent");
      return;
    }
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "查询会话失败");
    if (data.completed) { show("done"); return; }
    applyState(data);
    show("eval");
    renderBatch();
  } catch (err) {
    console.warn("resume failed", err);
    show("consent");
  }
})();
