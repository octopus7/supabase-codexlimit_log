(() => {
  const monthSelect = document.getElementById("monthSelect");
  const percentCanvas = document.getElementById("percentChart");
  const messageEl = document.getElementById("message");

  const MONTH_INDEX_PATH = "./json/monthly-index.json";

  let percentChart = null;
  let monthEntries = [];

  function showMessage(text, type = "info") {
    messageEl.textContent = text || "";
    messageEl.className = "message";

    if (type === "error") {
      messageEl.classList.add("error");
    }

    if (type === "success") {
      messageEl.classList.add("success");
    }
  }

  function clearCharts() {
    if (percentChart) {
      percentChart.destroy();
      percentChart = null;
    }
  }

  function toPercent(used, limit) {
    if (!limit || limit <= 0) {
      return 0;
    }

    return Number(((used / limit) * 100).toFixed(2));
  }

  function createLineDataset(label, points, borderColor, backgroundColor, fill = false) {
    return {
      label,
      data: points,
      borderColor,
      backgroundColor,
      pointBackgroundColor: borderColor,
      borderWidth: 1,
      pointRadius: 1.5,
      pointHoverRadius: 3,
      fill,
      tension: 0,
      segment: {
        borderColor: (context) => {
          const previousY = context.p0.parsed.y;
          const currentY = context.p1.parsed.y;

          if (currentY < previousY) {
            return "rgba(0, 0, 0, 0)";
          }

          return borderColor;
        }
      }
    };
  }

  function getChartMaxPercent(points5, points7) {
    const peakPercent = Math.max(
      0,
      ...points5.map((point) => point.y),
      ...points7.map((point) => point.y)
    );

    return Math.max(5, Math.ceil((peakPercent + 1) / 5) * 5);
  }

  function renderCharts(rows) {
    clearCharts();

    if (!rows.length) {
      showMessage("No snapshots found for this month.");
      return;
    }

    const points5 = rows.map((row) => ({
      x: row.logged_at,
      y: toPercent(row.used_5h, row.limit_5h)
    }));
    const points7 = rows.map((row) => ({
      x: row.logged_at,
      y: toPercent(row.used_7d, row.limit_7d)
    }));
    const maxPercent = getChartMaxPercent(points5, points7);

    percentChart = new Chart(percentCanvas.getContext("2d"), {
      type: "line",
      data: {
        datasets: [
          createLineDataset("5h %", points5, "#0b7a75", "rgba(11, 122, 117, 0.1)"),
          createLineDataset("7d %", points7, "#1f6feb", "rgba(31, 111, 235, 0.1)", "origin")
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: "time",
            time: {
              tooltipFormat: "yyyy-MM-dd HH:mm"
            },
            ticks: {
              maxRotation: 0
            }
          },
          y: {
            beginAtZero: true,
            max: maxPercent
          }
        }
      }
    });

    showMessage("");
  }

  async function fetchJson(path) {
    const response = await fetch(path, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Failed to load ${path} (${response.status})`);
    }

    const text = await response.text();
    return JSON.parse(text.replace(/^\uFEFF/, ""));
  }

  function normalizeMonthEntries(payload) {
    const entries = Array.isArray(payload) ? payload : payload?.months;

    if (!Array.isArray(entries)) {
      throw new Error("monthly-index.json must contain a months array.");
    }

    return entries
      .filter((entry) => entry?.value && entry?.file)
      .slice()
      .sort((left, right) => right.value.localeCompare(left.value));
  }

  function normalizeRows(payload) {
    const rows = Array.isArray(payload) ? payload : payload?.rows;

    if (!Array.isArray(rows)) {
      throw new Error("Monthly JSON must contain a rows array.");
    }

    return rows.slice().sort((left, right) => String(left.logged_at).localeCompare(String(right.logged_at)));
  }

  function renderMonthOptions(entries) {
    monthSelect.innerHTML = "";

    entries.forEach((entry) => {
      const option = document.createElement("option");
      option.value = entry.value;
      option.textContent = entry.label || entry.value;
      monthSelect.appendChild(option);
    });

    monthSelect.disabled = entries.length === 0;
  }

  async function loadSelectedMonth() {
    const selectedEntry = monthEntries.find((entry) => entry.value === monthSelect.value);

    if (!selectedEntry) {
      clearCharts();
      showMessage("No month is available.");
      return;
    }

    monthSelect.disabled = true;
    showMessage("Loading...");

    try {
      const payload = await fetchJson(`./json/${selectedEntry.file}`);
      const rows = normalizeRows(payload);
      renderCharts(rows);
    } finally {
      monthSelect.disabled = false;
    }
  }

  async function init() {
    if (!window.Chart) {
      showMessage("Could not load Chart.js library.", "error");
      return;
    }

    showMessage("Loading...");

    try {
      monthEntries = normalizeMonthEntries(await fetchJson(MONTH_INDEX_PATH));

      if (!monthEntries.length) {
        monthSelect.innerHTML = "<option>No months</option>";
        monthSelect.disabled = true;
        clearCharts();
        showMessage("No month data is available.");
        return;
      }

      renderMonthOptions(monthEntries);
      monthSelect.addEventListener("change", () => {
        loadSelectedMonth().catch((error) => {
          clearCharts();
          showMessage(error.message || String(error), "error");
        });
      });
      await loadSelectedMonth();
    } catch (error) {
      clearCharts();
      monthSelect.innerHTML = "<option>Unavailable</option>";
      monthSelect.disabled = true;
      showMessage(error.message || String(error), "error");
    }
  }

  init().catch((error) => {
    clearCharts();
    showMessage(error.message || String(error), "error");
  });
})();
