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
const SAVE_KEY = "ad-quote-check-saved";
const FORM_START_KEY = "ad-quote-form-started";
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
  saved: "저장 완료! 이 브라우저에만 저장됩니다.",
};

const state = {
  sentiment: null,
  lastResult: null,
};

const startBtn = document.getElementById("startBtn");
const previewBtn = document.getElementById("previewBtn");
const sentimentButtons = Array.from(
  document.querySelectorAll("[data-sentiment]")
);
const sentimentNextBtn = document.getElementById("sentimentNext");
const form = document.getElementById("quote-form");
const difficultyEl = document.getElementById("difficulty");
const budgetEl = document.getElementById("budget");
const feeEl = document.getElementById("fee");
const checklistEls = Array.from(
  document.querySelectorAll('input[name="checklist"]')
);
const calculateBtn = document.getElementById("calculateBtn");
const labelEl = document.getElementById("label");
const rangeEl = document.getElementById("range");
const explanationEl = document.getElementById("explanation");
const selectedItemsEl = document.getElementById("selected-items");
const summaryRangeEl = document.getElementById("summaryRange");
const summaryRiskEl = document.getElementById("summaryRisk");
const summaryActionEl = document.getElementById("summaryAction");
const actionButtons = Array.from(
  document.querySelectorAll("[data-action]")
);
const helpfulYesBtn = document.getElementById("helpfulYes");
const helpfulNoBtn = document.getElementById("helpfulNo");
const saveBtn = document.getElementById("saveBtn");
const saveStatusEl = document.getElementById("saveStatus");
const feedbackBtn = document.getElementById("feedbackBtn");

function track(eventName, params = {}) {
  if (typeof window.gtag === "function") {
    window.gtag("event", eventName, params);
    return;
  }
  console.log("[track]", eventName, params);
}

function trackFormStart(source) {
  if (sessionStorage.getItem(FORM_START_KEY)) {
    return;
  }
  sessionStorage.setItem(FORM_START_KEY, "1");
  // EVENT: form_start
  track("form_start", { source });
}

function getChecklistSummary() {
  const selected = checklistEls.filter((item) => item.checked);
  const sum = selected.reduce((acc, item) => {
    const weight = Number(item.dataset.weight);
    return acc + (Number.isFinite(weight) ? weight : 0);
  }, 0);
  const items = selected.map((item) => item.value);
  return { sum, items };
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

function buildRiskLine(fee, min, max) {
  if (!Number.isFinite(fee)) {
    return "위험 신호: 입력값이 부족합니다.";
  }
  if (fee > max) {
    return "위험 신호: 입력 수수료가 예상 범위보다 높습니다.";
  }
  if (fee < min) {
    return "위험 신호: 입력 수수료가 예상 범위보다 낮습니다.";
  }
  return "위험 신호: 특별한 이상 징후는 없어요.";
}

function buildActionLine(label) {
  if (label === COPY.verdictLabels.high) {
    return "추천 액션: 포함 업무 기준으로 재질문 후 재협상을 준비하세요.";
  }
  if (label === COPY.verdictLabels.efficient) {
    return "추천 액션: 업무 누락이 없는지 확인하고 비교 견적을 받아보세요.";
  }
  return "추천 액션: 핵심 KPI와 리포팅 범위를 한 번 더 명확히 하세요.";
}

function computeResult() {
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

  return {
    difficulty,
    fee,
    budget,
    min,
    max,
    label,
    expected,
    difficultyAdjust,
    sum,
    items,
    monthlyFee,
  };
}

function renderResult(result) {
  if (!result) {
    return;
  }

  labelEl.textContent = result.label;
  labelEl.style.background =
    result.label === COPY.verdictLabels.efficient
      ? "#2c7a4b"
      : result.label === COPY.verdictLabels.typical
      ? "#c3532f"
      : "#8a371f";

  rangeEl.textContent = COPY.range(result.min, result.max);
  const verdictDescription =
    result.label === COPY.verdictLabels.efficient
      ? COPY.verdictDescriptions.efficient
      : result.label === COPY.verdictLabels.typical
      ? COPY.verdictDescriptions.typical
      : COPY.verdictDescriptions.high;
  explanationEl.textContent = `${result.label}: ${verdictDescription} ${COPY.formula(
    result.difficultyAdjust,
    result.sum,
    result.expected
  )}`;

  summaryRangeEl.textContent = `적정 수수료 범위: ${result.min}% ~ ${result.max}%`;
  summaryRiskEl.textContent = buildRiskLine(result.fee, result.min, result.max);
  summaryActionEl.textContent = buildActionLine(result.label);

  renderSelectedItems(result.items);
  state.lastResult = result;

  const payload = {
    difficulty: result.difficulty,
    budget: result.budget,
    fee: result.fee,
    checklist: result.items,
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

function scrollToSection(id) {
  const target = document.getElementById(id);
  if (!target) {
    return;
  }
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setSentiment(option, button) {
  state.sentiment = option;
  sentimentButtons.forEach((btn) => {
    btn.classList.toggle("is-active", btn === button);
  });
  sentimentNextBtn.disabled = false;
}

function clearHelpfulState() {
  helpfulYesBtn?.classList.remove("is-active");
  helpfulNoBtn?.classList.remove("is-active");
}

startBtn?.addEventListener("click", () => {
  trackFormStart("hero_start");
  scrollToSection("sentiment");
});

previewBtn?.addEventListener("click", () => {
  scrollToSection("example");
});

sentimentButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const option = button.dataset.sentiment || "unknown";
    setSentiment(option, button);
    // EVENT: mf_sentiment_select
    track("mf_sentiment_select", { option });
  });
});

sentimentNextBtn?.addEventListener("click", () => {
  scrollToSection("form");
});

form?.addEventListener("focusin", () => {
  trackFormStart("form_focus");
});

form?.addEventListener("input", () => {
  trackFormStart("form_input");
});

calculateBtn?.addEventListener("click", () => {
  const result = computeResult();
  renderResult(result);
  clearHelpfulState();
  scrollToSection("result");
});

actionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.action || "unknown";
    // EVENT: mf_action_select
    track("mf_action_select", { action });
  });
});

helpfulYesBtn?.addEventListener("click", () => {
  helpfulYesBtn.classList.add("is-active");
  helpfulNoBtn?.classList.remove("is-active");
  // EVENT: mf_helpful_click
  track("mf_helpful_click", { value: "yes" });
});

helpfulNoBtn?.addEventListener("click", () => {
  helpfulNoBtn.classList.add("is-active");
  helpfulYesBtn?.classList.remove("is-active");
  // EVENT: mf_helpful_click
  track("mf_helpful_click", { value: "no" });
});

saveBtn?.addEventListener("click", () => {
  const result = state.lastResult ?? computeResult();
  renderResult(result);

  const payload = {
    sentiment: state.sentiment,
    result,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(payload));

  if (saveStatusEl) {
    saveStatusEl.textContent = COPY.saved;
  }
  // EVENT: mf_save
  track("mf_save", {
    sentiment: state.sentiment,
    verdict: result.label,
  });
});

feedbackBtn?.addEventListener("click", () => {
  window.open(GOOGLE_FORM_URL, "_blank", "noopener,noreferrer");
});

loadStored();