(() => {
  const statusText = document.getElementById("statusText");
  const messageEl = document.getElementById("message");

  const authCard = document.getElementById("authCard");
  const appCard = document.getElementById("appCard");

  const signinForm = document.getElementById("signinForm");
  const exportCsvBtn = document.getElementById("exportCsvBtn");
  const compactBtn = document.getElementById("compactBtn");
  const prevWindowBtn = document.getElementById("prevWindowBtn");
  const nextWindowBtn = document.getElementById("nextWindowBtn");
  const signoutBtn = document.getElementById("signoutBtn");

  const signinEmailEl = document.getElementById("signinEmail");
  const signinPasswordEl = document.getElementById("signinPassword");

  const userEmailEl = document.getElementById("userEmail");
  const windowLabelEl = document.getElementById("windowLabel");
  const windowCountEl = document.getElementById("windowCount");
  const snapshotTableBody = document.querySelector("#snapshotTable tbody");

  const percentCanvas = document.getElementById("percentChart");

  const FOUR_WEEKS_MS = 28 * 24 * 60 * 60 * 1000;

  let supabaseClient = null;
  let currentUser = null;
  let percentChart = null;
  let latestWindowEndMs = null;
  let currentWindowIndex = 0;
  let hasOlderWindows = false;
  let isWindowLoading = false;
  let isExporting = false;

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

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function toPercent(used, limit) {
    if (!limit || limit <= 0) {
      return 0;
    }
    return Number(((used / limit) * 100).toFixed(2));
  }

  function fmt(value) {
    return new Date(value).toLocaleString();
  }

  function formatWindowRange(startMs, endMs) {
    return `${fmt(startMs)} - ${fmt(endMs)}`;
  }

  function setSignedInView(user) {
    currentUser = user;
    statusText.textContent = "Signed in";
    authCard.classList.add("hidden");
    appCard.classList.remove("hidden");
    userEmailEl.textContent = `User: ${user.email}`;
    updateActionButtons();
  }

  function clearCharts() {
    if (percentChart) {
      percentChart.destroy();
      percentChart = null;
    }
  }

  function updateActionButtons() {
    exportCsvBtn.disabled = !currentUser || isExporting;
    compactBtn.disabled = !currentUser || isExporting;
  }

  function updateWindowButtons() {
    prevWindowBtn.disabled = !currentUser || isWindowLoading || !hasOlderWindows;
    nextWindowBtn.disabled = !currentUser || isWindowLoading || currentWindowIndex === 0;
  }

  function renderTable(rows, emptyMessage = "No snapshots yet.") {
    windowCountEl.textContent = String(rows.length);

    if (!rows.length) {
      snapshotTableBody.innerHTML = `
        <tr>
          <td colspan="3">${escapeHtml(emptyMessage)}</td>
        </tr>`;
      return;
    }

    snapshotTableBody.innerHTML = rows
      .slice()
      .reverse()
      .map((row) => {
        const pct5 = toPercent(row.used_5h, row.limit_5h);
        const pct7 = toPercent(row.used_7d, row.limit_7d);
        return `
          <tr>
            <td>${escapeHtml(fmt(row.logged_at))}</td>
            <td>${pct5}%</td>
            <td>${pct7}%</td>
          </tr>`;
      })
      .join("");
  }

  function createLineDataset(label, points, borderColor, backgroundColor) {
    return {
      label,
      data: points,
      borderColor,
      backgroundColor,
      pointBackgroundColor: borderColor,
      tension: 0.2,
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

  function setSignedOutView() {
    currentUser = null;
    latestWindowEndMs = null;
    currentWindowIndex = 0;
    hasOlderWindows = false;
    statusText.textContent = "Sign-in required";
    authCard.classList.remove("hidden");
    appCard.classList.add("hidden");
    windowLabelEl.textContent = "-";
    clearCharts();
    renderTable([], "No snapshots yet.");
    updateActionButtons();
    updateWindowButtons();
  }

  function renderCharts(rows) {
    clearCharts();

    if (!rows.length) {
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
    const maxPercent = Math.max(
      1,
      ...points5.map((point) => point.y),
      ...points7.map((point) => point.y)
    );

    percentChart = new Chart(percentCanvas.getContext("2d"), {
      type: "line",
      data: {
        datasets: [
          createLineDataset("5h %", points5, "#0b7a75", "rgba(11, 122, 117, 0.1)"),
          createLineDataset("7d %", points7, "#1f6feb", "rgba(31, 111, 235, 0.1)")
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
  }

  function getWindowBounds() {
    const endMs = latestWindowEndMs - currentWindowIndex * FOUR_WEEKS_MS;
    const startMs = endMs - FOUR_WEEKS_MS;

    return {
      startMs,
      endMs,
      startIso: new Date(startMs).toISOString(),
      endIso: new Date(endMs).toISOString()
    };
  }

  async function fetchLatestSnapshotTime(userId) {
    const { data, error } = await supabaseClient
      .from("usage_logs")
      .select("logged_at")
      .eq("user_id", userId)
      .order("logged_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data?.logged_at || null;
  }

  async function checkHasOlderSnapshots(userId, startIso) {
    const { data, error } = await supabaseClient
      .from("usage_logs")
      .select("id")
      .eq("user_id", userId)
      .lte("logged_at", startIso)
      .order("logged_at", { ascending: false })
      .limit(1);

    if (error) {
      throw error;
    }

    return Boolean(data && data.length > 0);
  }

  async function fetchAllSnapshotsForUser(userId) {
    const pageSize = 1000;
    const rows = [];

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabaseClient
        .from("usage_logs")
        .select("id, user_id, logged_at, used_5h, limit_5h, used_7d, limit_7d, created_at")
        .eq("user_id", userId)
        .order("logged_at", { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) {
        throw error;
      }

      rows.push(...(data || []));

      if (!data || data.length < pageSize) {
        return rows;
      }
    }
  }

  function toCsvCell(value) {
    const text = value == null ? "" : String(value);
    return `"${text.replaceAll('"', '""')}"`;
  }

  function buildCsvContent(rows) {
    const headers = [
      "id",
      "user_id",
      "logged_at",
      "used_5h",
      "limit_5h",
      "used_7d",
      "limit_7d",
      "created_at"
    ];
    const lines = [headers.join(",")];

    rows.forEach((row) => {
      lines.push([
        row.id,
        row.user_id,
        row.logged_at,
        row.used_5h,
        row.limit_5h,
        row.used_7d,
        row.limit_7d,
        row.created_at
      ].map(toCsvCell).join(","));
    });

    return lines.join("\r\n");
  }

  function formatFileTimestamp(date = new Date()) {
    const pad = (value) => String(value).padStart(2, "0");
    return [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate())
    ].join("-") + "_" + [
      pad(date.getHours()),
      pad(date.getMinutes()),
      pad(date.getSeconds())
    ].join("-");
  }

  function downloadCsvFile(filename, content) {
    const blob = new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  async function handleExportCsv() {
    if (!currentUser || isExporting) {
      return;
    }

    isExporting = true;
    exportCsvBtn.textContent = "Exporting...";
    updateActionButtons();

    try {
      const rows = await fetchAllSnapshotsForUser(currentUser.id);
      const csvContent = buildCsvContent(rows);
      const filename = `usage_logs_backup_${formatFileTimestamp()}.csv`;

      downloadCsvFile(filename, csvContent);
      showMessage(`Exported ${rows.length} snapshot(s) to ${filename}.`, "success");
    } catch (error) {
      showMessage(error.message || String(error), "error");
    } finally {
      isExporting = false;
      exportCsvBtn.textContent = "Export CSV Backup";
      updateActionButtons();
    }
  }

  async function handleCompactSnapshots() {
    if (!currentUser) {
      return;
    }

    const cleanupWindow = window.open("./cleanup.html", "_blank", "noopener");
    if (!cleanupWindow) {
      showMessage("Allow pop-ups to open the cleanup preview page.", "error");
    }
  }

  async function loadSnapshots(options = {}) {
    const resetWindow = options.resetWindow === true;
    const refreshLatestAnchor = options.refreshLatestAnchor === true;

    if (isWindowLoading) {
      return;
    }

    isWindowLoading = true;
    updateWindowButtons();

    try {
      const {
        data: { user },
        error: userError
      } = await supabaseClient.auth.getUser();

      if (userError) {
        throw userError;
      }

      if (!user) {
        setSignedOutView();
        return;
      }

      if (!currentUser || currentUser.id !== user.id) {
        setSignedInView(user);
      }

      if (resetWindow) {
        currentWindowIndex = 0;
      }

      if (latestWindowEndMs === null || resetWindow || refreshLatestAnchor) {
        const latestLoggedAt = await fetchLatestSnapshotTime(user.id);

        if (!latestLoggedAt) {
          latestWindowEndMs = null;
          currentWindowIndex = 0;
          hasOlderWindows = false;
          windowLabelEl.textContent = "-";
          renderTable([], "No snapshots found for this account.");
          renderCharts([]);
          showMessage("No snapshots found for this account.");
          return;
        }

        latestWindowEndMs = new Date(latestLoggedAt).getTime();
      }

      const { startMs, endMs, startIso, endIso } = getWindowBounds();
      const { data, error } = await supabaseClient
        .from("usage_logs")
        .select("id, logged_at, used_5h, limit_5h, used_7d, limit_7d")
        .eq("user_id", user.id)
        .gt("logged_at", startIso)
        .lte("logged_at", endIso)
        .order("logged_at", { ascending: true });

      if (error) {
        throw error;
      }

      hasOlderWindows = await checkHasOlderSnapshots(user.id, startIso);
      windowLabelEl.textContent = formatWindowRange(startMs, endMs);
      renderTable(data || [], "No snapshots found in this 4-week window.");
      renderCharts(data || []);

      if (!data || data.length === 0) {
        showMessage("No snapshots found in this 4-week window.");
      } else if (currentWindowIndex === 0) {
        showMessage("Showing the latest 4-week window.");
      } else {
        showMessage(`Showing ${currentWindowIndex * 4} to ${(currentWindowIndex + 1) * 4} weeks before the latest snapshot.`);
      }
    } catch (error) {
      showMessage(error.message || String(error), "error");
    } finally {
      isWindowLoading = false;
      updateWindowButtons();
    }
  }

  async function handlePreviousWindow() {
    if (!currentUser || isWindowLoading || !hasOlderWindows) {
      return;
    }

    currentWindowIndex += 1;
    await loadSnapshots();
  }

  async function handleNextWindow() {
    if (!currentUser || isWindowLoading || currentWindowIndex === 0) {
      return;
    }

    currentWindowIndex -= 1;
    await loadSnapshots({ refreshLatestAnchor: currentWindowIndex === 0 });
  }

  async function handleSignIn(event) {
    event.preventDefault();

    const email = signinEmailEl.value.trim();
    const password = signinPasswordEl.value;

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
      showMessage(error.message, "error");
      return;
    }

    if (data?.user) {
      setSignedInView(data.user);
      await loadSnapshots({ resetWindow: true, refreshLatestAnchor: true });
    }
  }

  async function handleSignOut() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
      showMessage(error.message, "error");
      return;
    }
    showMessage("Signed out.", "success");
  }

  async function initSession() {
    supabaseClient.auth.onAuthStateChange((_event, newSession) => {
      // Supabase auth callbacks must stay sync; defer async work to avoid lock deadlocks.
      setTimeout(() => {
        if (newSession?.user) {
          setSignedInView(newSession.user);
          loadSnapshots({ resetWindow: true, refreshLatestAnchor: true }).catch((error) => {
            showMessage(error.message || String(error), "error");
          });
        } else {
          setSignedOutView();
        }
      }, 0);
    });
    try {
      const {
        data: { session },
        error
      } = await supabaseClient.auth.getSession();

      if (error) {
        showMessage(error.message, "error");
        statusText.textContent = "Failed to read session";
        return;
      }

      if (session?.user) {
        setSignedInView(session.user);
        await loadSnapshots({ resetWindow: true, refreshLatestAnchor: true });
        return;
      }

      setSignedOutView();
    } catch (error) {
      statusText.textContent = "Session check failed";
      showMessage(error.message || String(error), "error");
    }
  }

  async function main() {
    if (!window.supabase || !window.supabase.createClient) {
      statusText.textContent = "Supabase client script missing";
      showMessage("Could not load Supabase JS library.", "error");
      return;
    }

    if (!window.Chart) {
      statusText.textContent = "Chart library missing";
      showMessage("Could not load Chart.js library.", "error");
      return;
    }

    const config = window.APP_CONFIG || {};
    if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY || config.SUPABASE_URL.includes("YOUR_")) {
      statusText.textContent = "Configuration required";
      showMessage("Set SUPABASE_URL and SUPABASE_ANON_KEY in config.js", "error");
      return;
    }

    supabaseClient = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);

    signinForm.addEventListener("submit", handleSignIn);
    exportCsvBtn.addEventListener("click", handleExportCsv);
    compactBtn.addEventListener("click", handleCompactSnapshots);
    prevWindowBtn.addEventListener("click", handlePreviousWindow);
    nextWindowBtn.addEventListener("click", handleNextWindow);
    signoutBtn.addEventListener("click", handleSignOut);
    updateActionButtons();
    updateWindowButtons();

    statusText.textContent = "Ready";
    await initSession();
  }

  main().catch((error) => {
    statusText.textContent = "Initialization failed";
    showMessage(error.message || String(error), "error");
  });
})();
