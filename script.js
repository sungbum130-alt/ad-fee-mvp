const CONFIG = {
  baseFee: 8,
  difficultyAdjust: {
    Low: 0,
    Medium: 2,
    High: 4,
  },
  rangeOffset: 2,
  minFloor: 6,
};

const STORAGE_KEY = "ad-quote-check";
const GOOGLE_FORM_URL = "https://forms.gle/Y7vmUDTLxkEoSb4A8";

const COPY = {
  verdictLabels: {
    efficient: "업무 범위 대비 효율적",
    typical: "평균적인 수준",
    high: "평균 대비 높은 편",
  },
  verdictDescriptions: {
    efficient:
      "현재 선택한 업무 범위 기준으로 보면, 일반적인 사례보다 비용이 낮은 편으로 보입니다. 포함 업무와 범위를 기준으로 합리적으로 구성된 것으로 해석할 수 있습니다.",
    typical:
      "현재 선택한 업무 범위 기준으로 보면, 일반적인 사례와 비슷한 수준으로 보입니다. 현재 조건을 기준으로 무난한 범위입니다.",
    high:
      "현재 선택한 업무 범위 기준으로 보면, 일반적인 사례와 비교했을 때 비용이 다소 높은 편으로 보입니다. 포함 업무와 조건을 한 번 더 확인해보는 것이 좋습니다.",
  },
  range: (min, max) => `예상 적정 수수료 범위: ${min}% ~ ${max}%`,
  formula: (difficultyAdjust, sum, expected) =>
    `계산 기준: 기본 8% + 난이도 ${difficultyAdjust}% + 업무 ${sum}% = ${expected}%`,
  selectedEmpty: "선택한 항목 없음",
  microFeedback: {
    selectSentiment: "도움 여부를 선택해주세요.",
    saved: "선택이 저장되었습니다.",
  },
  formPrompt: {
    opened: "새 탭에서 설문을 작성한 뒤 돌아와 주세요.",
  },
};

const form = document.getElementById("quote-form");
const difficultyEl = document.getElementById("difficulty");
const budgetEl = document.getElementById("budget");
const feeEl = document.getElementById("fee");
const checklistEls = Array.from(
  document.querySelectorAll('input[name="checklist"]')
);
const labelEl = document.getElementById("label");
const rangeEl = document.getElementById("range");
const explanationEl = document.getElementById("explanation");
const selectedItemsEl = document.getElementById("selected-items");
const mfHelpfulBtn = document.getElementById("mfHelpful");
const mfNotSureBtn = document.getElementById("mfNotSure");
const mfSaveBtn = document.getElementById("mfSave");
const mfStatusEl = document.getElementById("mfStatus");
const mfActionEls = Array.from(
  document.querySelectorAll('input[name="mfAction"]')
);
const formPromptEl = document.getElementById("formPrompt");
const openFormBtn = document.getElementById("openFormBtn");
const dismissFormBtn = document.getElementById("dismissFormBtn");
const formPromptStatusEl = document.getElementById("formPromptStatus");
const toggleFormInlineBtn = document.getElementById("toggleFormInline");
const formInlineWrapEl = document.getElementById("formInlineWrap");
const openFormInlineBtn = document.getElementById("openFormInlineBtn");

window.__LAST_RESULT__ = null;

function getChecklistSummary() {
  const selected = checklistEls.filter((item) => item.checked);
  const sum = selected.reduce((acc, item) => {
    const weight = Number(item.dataset.weight);
    return acc + (Number.isFinite(weight) ? weight : 0);
  }, 0);
  const items = selected.map((item) => item.value);
  return { sum, items };
}

function track(eventName, params) {
  if (typeof window.gtag === "function") {
    window.gtag("event", eventName, params);
  }
}

function getFeeBucket(feePercent) {
  if (!Number.isFinite(feePercent)) {
    return "unknown";
  }
  if (feePercent < 5) {
    return "0-5";
  }
  if (feePercent < 10) {
    return "5-10";
  }
  if (feePercent < 15) {
    return "10-15";
  }
  if (feePercent < 20) {
    return "15-20";
  }
  return "20+";
}

function classifyQuote(fee, min, max) {
  if (!Number.isFinite(fee)) {
    return COPY.verdictLabels.typical;
  }
  if (fee < min) {
    return COPY.verdictLabels.efficient;
  }
  if (fee <= max) {
    return COPY.verdictLabels.typical;
  }
  return COPY.verdictLabels.high;
}

function renderSelectedItems(items) {
  selectedItemsEl.innerHTML = "";
  if (!items.length) {
    const emptyItem = document.createElement("li");
    emptyItem.textContent = COPY.selectedEmpty;
    selectedItemsEl.appendChild(emptyItem);
    return;
  }
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    selectedItemsEl.appendChild(li);
  });
}

function setSentiment(sentiment) {
  mfHelpfulBtn.classList.toggle("is-active", sentiment === "helpful");
  mfNotSureBtn.classList.toggle("is-active", sentiment === "not_sure");
}

function getCurrentResultSnapshot() {
  return window.__LAST_RESULT__;
}

function showFormPrompt() {
  if (!formPromptEl) {
    return;
  }
  formPromptEl.classList.remove("hidden");
  formPromptEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function hideFormPrompt() {
  if (!formPromptEl) {
    return;
  }
  formPromptEl.classList.add("hidden");
}

function saveMicroFeedback() {
  const sentiment = mfHelpfulBtn.classList.contains("is-active")
    ? "helpful"
    : mfNotSureBtn.classList.contains("is-active")
    ? "not_sure"
    : null;

  if (!sentiment) {
    mfStatusEl.textContent = COPY.microFeedback.selectSentiment;
    mfStatusEl.dataset.state = "error";
    return;
  }

  const selectedAction = mfActionEls.find((item) => item.checked);
  const actionIntent = selectedAction ? selectedAction.value : null;
  const snapshot = getCurrentResultSnapshot();

  const payload = {
    sentiment,
    actionIntent,
    snapshot,
    meta: {
      tsISO: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
    },
  };

  const raw = localStorage.getItem("mvp_micro_feedback");
  let next = [];
  if (raw) {
    try {
      const existing = JSON.parse(raw);
      if (Array.isArray(existing)) {
        next = existing;
      }
    } catch (error) {
      console.warn("Failed to read micro feedback data.", error);
    }
  }
  next.unshift(payload);
  const limited = next.slice(0, 200);
  localStorage.setItem("mvp_micro_feedback", JSON.stringify(limited));

  mfStatusEl.textContent = COPY.microFeedback.saved;
  mfStatusEl.dataset.state = "success";

  showFormPrompt();

  const feeBucket = getFeeBucket(snapshot?.feePercent);
  track("mf_save", {
    sentiment,
    action_intent: actionIntent,
    verdict: snapshot?.verdictLabel,
    fee_bucket: feeBucket,
  });
}

function updateResult() {
  const difficulty = difficultyEl.value;
  const fee = Number(feeEl.value);
  const { sum, items } = getChecklistSummary();
  const difficultyAdjust = CONFIG.difficultyAdjust[difficulty] ?? 2;
  const expected = CONFIG.baseFee + difficultyAdjust + sum;
  const min = Math.max(CONFIG.minFloor, expected - CONFIG.rangeOffset);
  const max = expected + CONFIG.rangeOffset;
  const label = classifyQuote(fee, min, max);
  const budget = Number(budgetEl.value);
  const monthlyFee = Number.isFinite(budget) && Number.isFinite(fee)
    ? (budget * fee) / 100
    : 0;

  labelEl.textContent = label;
  labelEl.style.background =
    label === COPY.verdictLabels.efficient
      ? "#2c7a4b"
      : label === COPY.verdictLabels.typical
      ? "#c3532f"
      : "#8a371f";

  rangeEl.textContent = COPY.range(min, max);
  const verdictDescription =
    label === COPY.verdictLabels.efficient
      ? COPY.verdictDescriptions.efficient
      : label === COPY.verdictLabels.typical
      ? COPY.verdictDescriptions.typical
      : COPY.verdictDescriptions.high;
  explanationEl.textContent = `${label}: ${verdictDescription} ${COPY.formula(
    difficultyAdjust,
    sum,
    expected
  )}`;
  renderSelectedItems(items);

  window.__LAST_RESULT__ = {
    verdictLabel: label,
    feePercent: Number.isFinite(fee) ? fee : 0,
    totalScore: expected,
    monthlyBudget: Number.isFinite(budget) ? budget : 0,
    monthlyFee,
    selectedItemsCount: items.length,
  };

  const payload = {
    difficulty,
    budget,
    fee,
    checklist: items,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function loadStored() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return;
  }
  try {
    const data = JSON.parse(raw);
    if (data?.difficulty) {
      difficultyEl.value = data.difficulty;
    }
    if (Number.isFinite(data?.budget)) {
      budgetEl.value = data.budget;
    }
    if (Number.isFinite(data?.fee)) {
      feeEl.value = data.fee;
    }
    if (Array.isArray(data?.checklist)) {
      const selected = new Set(data.checklist);
      checklistEls.forEach((item) => {
        item.checked = selected.has(item.value);
      });
    }
  } catch (error) {
    console.warn("Failed to load stored data.", error);
  }
}

form.addEventListener("input", updateResult);
form.addEventListener("change", updateResult);

loadStored();
updateResult();

if (mfHelpfulBtn && mfNotSureBtn && mfSaveBtn) {
  mfHelpfulBtn.addEventListener("click", () => {
    setSentiment("helpful");
    const snapshot = getCurrentResultSnapshot();
    track("mf_sentiment_select", {
      sentiment: "helpful",
      verdict: snapshot?.verdictLabel,
      fee_bucket: getFeeBucket(snapshot?.feePercent),
    });
  });

  mfNotSureBtn.addEventListener("click", () => {
    setSentiment("not_sure");
    const snapshot = getCurrentResultSnapshot();
    track("mf_sentiment_select", {
      sentiment: "not_sure",
      verdict: snapshot?.verdictLabel,
      fee_bucket: getFeeBucket(snapshot?.feePercent),
    });
  });

  mfActionEls.forEach((radio) => {
    radio.addEventListener("change", () => {
      const snapshot = getCurrentResultSnapshot();
      track("mf_action_select", {
        action_intent: radio.value,
        verdict: snapshot?.verdictLabel,
        fee_bucket: getFeeBucket(snapshot?.feePercent),
      });
    });
  });

  mfSaveBtn.addEventListener("click", saveMicroFeedback);
}

if (openFormBtn) {
  openFormBtn.addEventListener("click", () => {
    track("open_google_form", { source: "after_save_prompt" });
    window.open(GOOGLE_FORM_URL, "_blank", "noopener,noreferrer");
    if (formPromptStatusEl) {
      formPromptStatusEl.textContent = COPY.formPrompt.opened;
    }
  });
}

if (dismissFormBtn) {
  dismissFormBtn.addEventListener("click", () => {
    track("dismiss_google_form", { source: "after_save_prompt" });
    hideFormPrompt();
  });
}

if (toggleFormInlineBtn && formInlineWrapEl) {
  toggleFormInlineBtn.addEventListener("click", () => {
    const willShow = formInlineWrapEl.classList.contains("hidden");
    formInlineWrapEl.classList.toggle("hidden", !willShow);
    toggleFormInlineBtn.setAttribute("aria-expanded", String(willShow));
    track("toggle_form_inline", { is_open: willShow });
  });
}

if (openFormInlineBtn) {
  openFormInlineBtn.addEventListener("click", () => {
    track("open_google_form", { source: "inline_toggle" });
    window.open(GOOGLE_FORM_URL, "_blank", "noopener,noreferrer");
  });
}
document.addEventListener("DOMContentLoaded", () => {
  const helpfulBtn = document.getElementById("mfHelpful");
  const notSureBtn = document.getElementById("mfNotSure");

  const sendEvent = (name, params = {}) => {
    if (typeof window.gtag === "function") {
      window.gtag("event", name, { debug_mode: true, ...params });
    }
    console.log("[GA event]", name, params);
  };

  if (helpfulBtn) {
    helpfulBtn.addEventListener("click", () => {
      sendEvent("mf_helpful_click", { sentiment: "helpful" });
    });
  }

  if (notSureBtn) {
    notSureBtn.addEventListener("click", () => {
      sendEvent("mf_not_sure_click", { sentiment: "not_sure" });
    });
  }
});
