(function () {
  "use strict";

  const PAGE_SIZE = 10;
  const status = document.querySelector("#status");
  const content = document.querySelector("#ranking-content");
  const body = document.querySelector("#ranking-body");
  const pageRange = document.querySelector("#page-range");
  const previousButton = document.querySelector("#previous-page");
  const nextButton = document.querySelector("#next-page");

  let rankings = [];
  let currentPage = 0;

  function setStatus(message, { error = false } = {}) {
    status.textContent = message;
    status.hidden = false;
    status.classList.toggle("is-error", error);
  }

  function formatScore(score) {
    return Number.isFinite(score) ? score.toLocaleString("ja-JP") : "-";
  }

  function formatTime(time) {
    return Number.isFinite(time) ? `${time.toLocaleString("ja-JP", { maximumFractionDigits: 2 })}分` : "-";
  }

  function appendCell(row, value, className = "") {
    const cell = document.createElement("td");
    cell.textContent = value;
    if (className) cell.className = className;
    row.appendChild(cell);
  }

  function renderPage() {
    const start = currentPage * PAGE_SIZE;
    const pageItems = rankings.slice(start, start + PAGE_SIZE);
    const end = start + pageItems.length;

    body.replaceChildren();
    for (const entry of pageItems) {
      const row = document.createElement("tr");
      appendCell(row, `${entry.rank}位`);
      appendCell(row, entry.name);
      appendCell(row, formatScore(entry.score), "number");
      appendCell(row, formatTime(entry.time), "number");
      body.appendChild(row);
    }

    pageRange.textContent = `${start + 1}〜${end}位`;
    pageRange.hidden = false;
    previousButton.disabled = currentPage === 0;
    nextButton.disabled = end >= rankings.length;
  }

  function isRankingEntry(entry) {
    return (
      entry &&
      Number.isFinite(entry.rank) &&
      typeof entry.name === "string" &&
      Number.isFinite(entry.score) &&
      Number.isFinite(entry.time)
    );
  }

  previousButton.addEventListener("click", () => {
    if (currentPage === 0) return;
    currentPage -= 1;
    renderPage();
  });

  nextButton.addEventListener("click", () => {
    if ((currentPage + 1) * PAGE_SIZE >= rankings.length) return;
    currentPage += 1;
    renderPage();
  });

  async function loadRanking() {
    try {
      const api = new window.RankingApi({ gasUrl: window.RANKING_GAS_URL });
      await api.initialize();
      const data = await api.getRanking(100);

      if (!Array.isArray(data)) {
        throw new Error("Invalid ranking response");
      }

      rankings = data.filter(isRankingEntry).slice(0, 100);
      if (rankings.length === 0) {
        setStatus("ランキングデータはありません");
        return;
      }

      status.hidden = true;
      content.hidden = false;
      renderPage();
    } catch (error) {
      console.error("Failed to load ranking:", error);
      content.hidden = true;
      setStatus("ランキング取得失敗", { error: true });
    }
  }

  loadRanking();
})();
