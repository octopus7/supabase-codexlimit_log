(() => {
  const statusText = document.getElementById("statusText");
  const messageEl = document.getElementById("message");

  const authCard = document.getElementById("authCard");
  const appCard = document.getElementById("appCard");

  const signinForm = document.getElementById("signinForm");
  const snapshotForm = document.getElementById("snapshotForm");
  const signoutBtn = document.getElementById("signoutBtn");

  const signinEmailEl = document.getElementById("signinEmail");
  const signinPasswordEl = document.getElementById("signinPassword");

  const userEmailEl = document.getElementById("userEmail");
  const loggedAtEl = document.getElementById("loggedAt");
  const used5hEl = document.getElementById("used5h");
  const limit5hEl = document.getElementById("limit5h");
  const used7dEl = document.getElementById("used7d");
  const limit7dEl = document.getElementById("limit7d");

  let supabaseClient = null;
  let currentUser = null;

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

  function setDefaultLoggedAt() {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    loggedAtEl.value = now.toISOString().slice(0, 16);
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
    }

    showMessage("Signed in.", "success");
  }

  async function handleSnapshotSubmit(event) {
    event.preventDefault();

    if (!currentUser) {
      showMessage("Please sign in first.", "error");
      return;
    }

    const used5h = Number(used5hEl.value);
    const limit5h = Number(limit5hEl.value);
    const used7d = Number(used7dEl.value);
    const limit7d = Number(limit7dEl.value);

    if (limit5h <= 0 || limit7d <= 0) {
      showMessage("Limit values must be greater than zero.", "error");
      return;
    }

    if (used5h < 0 || used7d < 0) {
      showMessage("Used values must be zero or greater.", "error");
      return;
    }

    const payload = {
      user_id: currentUser.id,
      logged_at: new Date(loggedAtEl.value).toISOString(),
      used_5h: used5h,
      limit_5h: limit5h,
      used_7d: used7d,
      limit_7d: limit7d
    };

    const { error } = await supabaseClient.from("usage_logs").insert(payload);

    if (error) {
      showMessage(error.message, "error");
      return;
    }

    showMessage("Snapshot saved.", "success");
    used5hEl.value = "";
    used7dEl.value = "";
    setDefaultLoggedAt();
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
        return;
      }

      setSignedOutView();
    } catch (error) {
      statusText.textContent = "Session check failed";
      showMessage(error.message || String(error), "error");
    }
  }

  async function main() {
    setDefaultLoggedAt();

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
    snapshotForm.addEventListener("submit", handleSnapshotSubmit);
    signoutBtn.addEventListener("click", handleSignOut);

    statusText.textContent = "Ready";
    await initSession();
  }

  main().catch((error) => {
    statusText.textContent = "Initialization failed";
    showMessage(error.message || String(error), "error");
  });
})();
