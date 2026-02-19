(() => {
  const statusText = document.getElementById("statusText");
  const messageEl = document.getElementById("message");

  const authCard = document.getElementById("authCard");
  const appCard = document.getElementById("appCard");

  const signinForm = document.getElementById("signinForm");
  const signoutBtn = document.getElementById("signoutBtn");

  const signinEmailEl = document.getElementById("signinEmail");
  const signinPasswordEl = document.getElementById("signinPassword");

  const userEmailEl = document.getElementById("userEmail");
  const snapshotTableBody = document.querySelector("#snapshotTable tbody");

  const percentCanvas = document.getElementById("percentChart");

  let supabaseClient = null;
  let currentUser = null;
  let percentChart = null;

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

  function setSignedInView(user) {
    currentUser = user;
    statusText.textContent = "Signed in";
    authCard.classList.add("hidden");
    appCard.classList.remove("hidden");
    userEmailEl.textContent = `User: ${user.email}`;
  }

  function setSignedOutView() {
    currentUser = null;
    statusText.textContent = "Sign-in required";
    authCard.classList.remove("hidden");
    appCard.classList.add("hidden");
    clearCharts();
    snapshotTableBody.innerHTML = "";
  }

  function clearCharts() {
    if (percentChart) {
      percentChart.destroy();
      percentChart = null;
    }
  }

  function renderTable(rows) {
    if (!rows.length) {
      snapshotTableBody.innerHTML = `
        <tr>
          <td colspan="3">No snapshots yet.</td>
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

  function renderCharts(rows) {
    clearCharts();

    if (!rows.length) {
      return;
    }

    const labels = rows.map((row) => fmt(row.logged_at));

    const pct5 = rows.map((row) => toPercent(row.used_5h, row.limit_5h));
    const pct7 = rows.map((row) => toPercent(row.used_7d, row.limit_7d));
    const maxPercent = Math.max(1, ...pct5, ...pct7);

    percentChart = new Chart(percentCanvas.getContext("2d"), {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "5h %",
            data: pct5,
            borderColor: "#0b7a75",
            backgroundColor: "rgba(11, 122, 117, 0.1)",
            tension: 0.2
          },
          {
            label: "7d %",
            data: pct7,
            borderColor: "#1f6feb",
            backgroundColor: "rgba(31, 111, 235, 0.1)",
            tension: 0.2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            max: maxPercent
          }
        }
      }
    });
  }

  async function loadSnapshots() {
    const {
      data: { user },
      error: userError
    } = await supabaseClient.auth.getUser();

    if (userError) {
      showMessage(userError.message, "error");
      return;
    }

    if (!user) {
      setSignedOutView();
      return;
    }

    if (!currentUser || currentUser.id !== user.id) {
      setSignedInView(user);
    }

    const { data, error } = await supabaseClient
      .from("usage_logs")
      .select("id, logged_at, used_5h, limit_5h, used_7d, limit_7d")
      .eq("user_id", user.id)
      .order("logged_at", { ascending: true })
      .limit(500);

    if (error) {
      showMessage(error.message, "error");
      return;
    }

    renderTable(data || []);
    renderCharts(data || []);

    if (!data || data.length === 0) {
      showMessage("No snapshots found for this account.");
    }
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
      await loadSnapshots();
    }

    showMessage("Signed in.", "success");
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
          loadSnapshots().catch((error) => {
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
        await loadSnapshots();
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
    signoutBtn.addEventListener("click", handleSignOut);

    statusText.textContent = "Ready";
    await initSession();
  }

  main().catch((error) => {
    statusText.textContent = "Initialization failed";
    showMessage(error.message || String(error), "error");
  });
})();
