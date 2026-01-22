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
    return "적정";
  }
  if (fee < min) {
    return "가성비 좋음";
  }
  if (fee <= max) {
    return "적정";
  }
  return "과도";
}

function renderSelectedItems(items) {
  selectedItemsEl.innerHTML = "";
  if (!items.length) {
    const emptyItem = document.createElement("li");
    emptyItem.textContent = "선택 없음";
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

function saveMicroFeedback() {
  const sentiment = mfHelpfulBtn.classList.contains("is-active")
    ? "helpful"
    : mfNotSureBtn.classList.contains("is-active")
    ? "not_sure"
    : null;

  if (!sentiment) {
    mfStatusEl.textContent = "Please select helpful or not sure.";
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

  mfStatusEl.textContent = "Saved!";
  mfStatusEl.dataset.state = "success";

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
    label === "가성비 좋음"
      ? "#2c7a4b"
      : label === "적정"
      ? "#c3532f"
      : "#8a371f";

  rangeEl.textContent = `예상 적정 수수료 범위: ${min}% ~ ${max}%`;
  explanationEl.textContent = `기본 8% + 난이도 ${difficultyAdjust}% + 업무 ${sum}% = ${expected}%`;
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
