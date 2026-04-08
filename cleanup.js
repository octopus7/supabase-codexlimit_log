(() => {
  const statusText = document.getElementById("statusText");
  const messageEl = document.getElementById("message");

  const authCard = document.getElementById("authCard");
  const appCard = document.getElementById("appCard");

  const signinForm = document.getElementById("signinForm");
  const refreshBtn = document.getElementById("refreshBtn");
  const deleteBtn = document.getElementById("deleteBtn");
  const signoutBtn = document.getElementById("signoutBtn");

  const signinEmailEl = document.getElementById("signinEmail");
  const signinPasswordEl = document.getElementById("signinPassword");

  const userEmailEl = document.getElementById("userEmail");
  const candidateTableBody = document.querySelector("#candidateTable tbody");
  const totalCountEl = document.getElementById("totalCount");
  const deleteCountEl = document.getElementById("deleteCount");
  const keepCountEl = document.getElementById("keepCount");

  let supabaseClient = null;
  let currentUser = null;
  let previewCandidateIds = [];
  let previewSignature = "";
  let isRefreshing = false;
  let isDeleting = false;

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
    previewCandidateIds = [];
    previewSignature = "";
    renderPreview([], []);
  }

  function setActionState() {
    refreshBtn.disabled = isRefreshing || isDeleting;
    deleteBtn.disabled = isRefreshing || isDeleting || previewCandidateIds.length === 0;
  }

  function renderPreview(rows, candidates) {
    totalCountEl.textContent = String(rows.length);
    deleteCountEl.textContent = String(candidates.length);
    keepCountEl.textContent = String(Math.max(rows.length - candidates.length, 0));

    if (!candidates.length) {
      candidateTableBody.innerHTML = `
        <tr>
          <td colspan="5">No redundant middle snapshots found.</td>
        </tr>`;
      return;
    }

    candidateTableBody.innerHTML = candidates
      .slice()
      .reverse()
      .map((candidate) => {
        const pct5 = candidate.limit_5h > 0
          ? Number(((candidate.used_5h / candidate.limit_5h) * 100).toFixed(2))
          : 0;
        const pct7 = candidate.limit_7d > 0
          ? Number(((candidate.used_7d / candidate.limit_7d) * 100).toFixed(2))
          : 0;

        return `
          <tr>
            <td>${escapeHtml(fmt(candidate.logged_at))}</td>
            <td>${candidate.used_5h} / ${candidate.limit_5h} (${pct5}%)</td>
            <td>${candidate.used_7d} / ${candidate.limit_7d} (${pct7}%)</td>
            <td>${escapeHtml(fmt(candidate.previous_logged_at))}</td>
            <td>${escapeHtml(fmt(candidate.next_logged_at))}</td>
          </tr>`;
      })
      .join("");
  }

  function snapshotsMatch(left, right) {
    return left.used_5h === right.used_5h
      && left.limit_5h === right.limit_5h
      && left.used_7d === right.used_7d
      && left.limit_7d === right.limit_7d;
  }

  async function fetchAllSnapshots(userId) {
    const pageSize = 1000;
    const rows = [];

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabaseClient
        .from("usage_logs")
        .select("id, logged_at, used_5h, limit_5h, used_7d, limit_7d")
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

  function buildCleanupCandidates(rows) {
    const candidates = [];

    for (let index = 1; index < rows.length - 1; index += 1) {
      const previousRow = rows[index - 1];
      const currentRow = rows[index];
      const nextRow = rows[index + 1];

      if (snapshotsMatch(previousRow, currentRow) && snapshotsMatch(currentRow, nextRow)) {
        candidates.push({
          id: currentRow.id,
          logged_at: currentRow.logged_at,
          used_5h: currentRow.used_5h,
          limit_5h: currentRow.limit_5h,
          used_7d: currentRow.used_7d,
          limit_7d: currentRow.limit_7d,
          previous_logged_at: previousRow.logged_at,
          next_logged_at: nextRow.logged_at
        });
      }
    }

    return candidates;
  }

  function updatePreviewState(rows, candidates) {
    previewCandidateIds = candidates.map((candidate) => candidate.id);
    previewSignature = previewCandidateIds.join(",");
    renderPreview(rows, candidates);
    setActionState();
  }

  async function refreshPreview(options = {}) {
    const allowWhileDeleting = options.allowWhileDeleting === true;
    const silent = options.silent === true;

    if (!currentUser || isRefreshing || (isDeleting && !allowWhileDeleting)) {
      return;
    }

    isRefreshing = true;
    statusText.textContent = "Refreshing preview";
    refreshBtn.textContent = "Refreshing...";
    setActionState();

    try {
      const rows = await fetchAllSnapshots(currentUser.id);
      const candidates = buildCleanupCandidates(rows);

      updatePreviewState(rows, candidates);
      statusText.textContent = "Preview ready";

      if (!silent) {
        if (!rows.length) {
          showMessage("No snapshots found for this account.");
        } else if (!candidates.length) {
          showMessage("No redundant middle snapshots found.");
        } else {
          showMessage(`Preview ready. ${candidates.length} snapshot(s) would be deleted.`);
        }
      }
    } catch (error) {
      showMessage(error.message || String(error), "error");
      statusText.textContent = "Preview failed";
    } finally {
      isRefreshing = false;
      refreshBtn.textContent = "Refresh Preview";
      setActionState();
    }
  }

  async function deleteSnapshotsByIds(ids) {
    const chunkSize = 200;

    for (let start = 0; start < ids.length; start += chunkSize) {
      const chunk = ids.slice(start, start + chunkSize);
      const { error } = await supabaseClient
        .from("usage_logs")
        .delete()
        .in("id", chunk);

      if (error) {
        throw error;
      }
    }
  }

  async function handleDelete() {
    if (!currentUser || !previewCandidateIds.length || isRefreshing || isDeleting) {
      return;
    }

    isDeleting = true;
    statusText.textContent = "Verifying preview";
    deleteBtn.textContent = "Verifying...";
    setActionState();

    try {
      const rows = await fetchAllSnapshots(currentUser.id);
      const candidates = buildCleanupCandidates(rows);
      const latestSignature = candidates.map((candidate) => candidate.id).join(",");

      if (latestSignature !== previewSignature) {
        updatePreviewState(rows, candidates);
        statusText.textContent = "Preview changed";
        showMessage("Data changed since the preview was loaded. Review the updated list and confirm again.", "error");
        return;
      }

      statusText.textContent = "Deleting snapshots";
      deleteBtn.textContent = "Deleting...";
      const deletedCount = previewCandidateIds.length;
      await deleteSnapshotsByIds(previewCandidateIds);
      await refreshPreview({ allowWhileDeleting: true, silent: true });
      showMessage(`Deleted ${deletedCount} redundant middle snapshot(s).`, "success");
    } catch (error) {
      showMessage(error.message || String(error), "error");
      statusText.textContent = "Delete failed";
    } finally {
      isDeleting = false;
      deleteBtn.textContent = "Confirm Delete";
      setActionState();
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
      await refreshPreview();
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
      setTimeout(() => {
        if (newSession?.user) {
          setSignedInView(newSession.user);
          refreshPreview().catch((error) => {
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
        await refreshPreview();
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

    const config = window.APP_CONFIG || {};
    if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY || config.SUPABASE_URL.includes("YOUR_")) {
      statusText.textContent = "Configuration required";
      showMessage("Set SUPABASE_URL and SUPABASE_ANON_KEY in config.js", "error");
      return;
    }

    supabaseClient = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);

    signinForm.addEventListener("submit", handleSignIn);
    refreshBtn.addEventListener("click", refreshPreview);
    deleteBtn.addEventListener("click", handleDelete);
    signoutBtn.addEventListener("click", handleSignOut);
    setActionState();

    statusText.textContent = "Ready";
    await initSession();
  }

  main().catch((error) => {
    statusText.textContent = "Initialization failed";
    showMessage(error.message || String(error), "error");
  });
})();
