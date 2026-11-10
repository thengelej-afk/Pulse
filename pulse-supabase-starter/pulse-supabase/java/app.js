import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// Paste your Supabase Project URL and anon/publishable key here.
// These are public client credentials. NEVER put your service_role key in browser code.
const SUPABASE_URL = "https://myniasxaxnwvaqvkzwzp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_7GPGaO5-o08i2WN0kzd6VA_BCe7yPrR";

const $ = id => document.getElementById(id);
const authScreen = $("authScreen"), app = $("app");
let supabase = null, currentUser = null, activeConversationId = null, messageChannel = null;
let currentAvatarUrl = null;
let activeOtherAvatarUrl = null;
let activeOtherUsername = "";
let signupMode = false;

function notice(message, isError = true) {
  $("authNotice").textContent = message;
  $("authNotice").style.color = isError ? "#ba4b62" : "#26966e";
}
function setAuthMode(signup) {
  signupMode = signup;
  $("authTitle").textContent = signup ? "Create your account" : "Welcome back";
  $("authSubtitle").textContent = signup ? "Join Pulse and start connecting." : "Sign in to continue to your messages.";
  $("usernameLabel").classList.toggle("hidden", !signup);
  $("usernameInput").required = signup;
  $("authSubmit").textContent = signup ? "Create account" : "Sign in";
  $("authSwitchText").textContent = signup ? "Already have an account?" : "New to Pulse?";
  $("authSwitch").textContent = signup ? "Sign in" : "Create an account";
  notice("");
}
$("authSwitch").addEventListener("click", () => setAuthMode(!signupMode));

function initials(name) {
  return (name || "?").trim().split(/\s+/).slice(0,2).map(x => x[0]).join("").toUpperCase();
}
function showApp() {
  authScreen.classList.add("hidden");
  app.classList.remove("hidden");
 $("myUsername").textContent = currentUser.user_metadata?.username || currentUser.email;

loadMyAvatar();
loadConversations();
}
function showAuth() {
  app.classList.add("hidden");
  authScreen.classList.remove("hidden");
}
async function start() {
  if (SUPABASE_URL.startsWith("YOUR_") || SUPABASE_ANON_KEY.startsWith("YOUR_")) {
    notice("First connect Supabase: add your Project URL and anon/publishable key in java/app.js.");
    return;
  }
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { session } } = await supabase.auth.getSession();
  if (session) { currentUser = session.user; showApp(); }
  supabase.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    if (currentUser) showApp(); else showAuth();
  });
}
$("authForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!supabase) { await start(); if (!supabase) return; }
  const email = $("emailInput").value.trim();
  const password = $("passwordInput").value;
  const username = $("usernameInput").value.trim().toLowerCase();
  $("authSubmit").disabled = true; notice(signupMode ? "Creating your account..." : "Signing in...", false);
  try {
    if (signupMode) {
      if (!/^[a-z0-9_]{3,20}$/.test(username)) throw new Error("Username must be 3–20 characters: letters, numbers or underscores.");
      const { error } = await supabase.auth.signUp({ email, password, options: { data: { username } } });
      if (error) throw error;
      notice("Account created! Check your email to confirm it, then sign in.", false);
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      currentUser = data.user; showApp();
    }
  } catch (error) { notice(error.message); }
  finally { $("authSubmit").disabled = false; }
});

async function loadConversations() {
  const { data, error } = await supabase.from("conversation_members")
    .select("conversation_id, conversations(id, created_at)")
    .eq("user_id", currentUser.id);
  if (error) { console.error(error); alert("Couldn't load conversations: " + error.message); return; }
  const rows = [];
  for (const item of (data || [])) {
    const id = item.conversation_id;
    const { data: members } = await supabase.from("conversation_members")
      .select("user_id, profiles(username)").eq("conversation_id", id).neq("user_id", currentUser.id);
    const other = members?.[0]?.profiles?.username || "Conversation";
    const { data: last } = await supabase.from("messages").select("content, created_at")
      .eq("conversation_id", id).order("created_at", { ascending: false }).limit(1);
    rows.push({ id, username: other, preview: last?.[0]?.content || "Start a conversation", created_at: item.conversations?.created_at });
  }
  rows.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  renderConversationList(rows);
  if (activeConversationId && rows.some(r => r.id === activeConversationId)) return;
  if (rows.length) openConversation(rows[0].id, rows[0].username);
  else showEmptyChat();
}
function renderConversationList(rows) {
  const list = $("conversationList"); list.innerHTML = "";
  if (!rows.length) { list.innerHTML = '<p class="empty">No chats yet. Find someone above.</p>'; return; }
  rows.forEach(row => {
    const button = document.createElement("button"); button.className = "conversation" + (row.id === activeConversationId ? " active" : "");
    const avatar = document.createElement("span"); avatar.className = "mini-avatar"; avatar.textContent = initials(row.username);
    const copy = document.createElement("span"); copy.className = "conversation-copy";
    const name = document.createElement("strong"); name.textContent = row.username;
    const preview = document.createElement("small"); preview.className = "preview"; preview.textContent = row.preview;
    copy.append(name, preview); button.append(avatar, copy);
    button.addEventListener("click", () => openConversation(row.id, row.username)); list.append(button);
  });
}
function showEmptyChat() {
  activeConversationId = null; $("chatName").textContent = "Your messages"; $("chatAvatar").textContent = "P";
  $("chatStatus").textContent = "Choose someone to start chatting";
  $("messages").innerHTML = '<div class="welcome"><div class="welcome-icon">✦</div><h2>Your inbox is ready.</h2><p>Find someone by username to start your first conversation.</p></div>';
  $("messageInput").disabled = true; $("sendButton").disabled = true;
}
async function openConversation(id, username) {
  activeConversationId = id; $("chatName").textContent = username; $("chatAvatar").textContent = initials(username);
  $("chatStatus").textContent = "Private conversation"; $("messageInput").disabled = false; $("sendButton").disabled = false;
  document.querySelectorAll(".conversation").forEach(el => el.classList.remove("active"));
  await loadMessages();
  if (messageChannel) await supabase.removeChannel(messageChannel);
  messageChannel = supabase.channel("messages-" + id)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: "conversation_id=eq." + id }, payload => {
      if (payload.new.sender_id !== currentUser.id) appendMessage(payload.new, false);
    }).subscribe();
}
function appendMessage(message, scroll = true) {
  const area = $("messages");

  if (area.querySelector(".welcome")) {
    area.innerHTML = "";
  }

  const isSent = message.sender_id === currentUser.id;

  const row = document.createElement("div");
  row.className = "message " + (isSent ? "sent" : "received");

  const avatarUrl = isSent ? currentAvatarUrl : activeOtherAvatarUrl;
  const username = isSent
    ? (currentUser.user_metadata?.username || currentUser.email)
    : activeOtherUsername;

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";

  if (avatarUrl) {
    const img = document.createElement("img");
    img.src = avatarUrl;
    img.alt = username + "'s profile picture";
    avatar.appendChild(img);
  } else {
    avatar.textContent = initials(username);
  }

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = message.content;

  const time = document.createElement("time");
  time.textContent = new Date(message.created_at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });

  row.append(avatar, bubble, time);
  area.append(row);

  if (scroll) {
    area.scrollTop = area.scrollHeight;
  }
}

async function loadMessages() {
  const { data, error } = await supabase.from("messages").select("*").eq("conversation_id", activeConversationId).order("created_at");
  if (error) { alert("Couldn't load messages: " + error.message); return; }
  const area = $("messages"); area.innerHTML = "";
  if (!data?.length) { area.innerHTML = '<div class="welcome"><div class="welcome-icon">✦</div><h2>Say hello.</h2><p>Your messages will appear here.</p></div>'; return; }
  data.forEach(m => appendMessage(m, false)); area.scrollTop = area.scrollHeight;
}
$("messageForm").addEventListener("submit", async event => {
  event.preventDefault(); const content = $("messageInput").value.trim();
  if (!content || !activeConversationId) return;
  $("sendButton").disabled = true;
  const { data, error } = await supabase.from("messages").insert({ conversation_id: activeConversationId, sender_id: currentUser.id, content }).select().single();
  $("sendButton").disabled = false;
  if (error) { alert("Message wasn't sent: " + error.message); return; }
  appendMessage(data); $("messageInput").value = "";
});
$("userSearchForm").addEventListener("submit", async event => {
  event.preventDefault(); const username = $("userSearchInput").value.trim().toLowerCase();
  if (!username) return;
  const results = $("searchResults"); results.textContent = "Searching...";
  const { data, error } = await supabase.from("profiles").select("id, username").ilike("username", username).neq("id", currentUser.id).limit(1);
  results.innerHTML = "";
  if (error) { results.textContent = error.message; return; }
  if (!data?.length) { results.textContent = "No user found. Check the username."; return; }
  const user = data[0]; const button = document.createElement("button"); button.className = "result-button";
  const avatar = document.createElement("span"); avatar.className = "mini-avatar"; avatar.textContent = initials(user.username);
  const copy = document.createElement("span"); const name = document.createElement("strong"); name.textContent = user.username;
  const hint = document.createElement("small"); hint.textContent = "Start a private chat"; copy.append(name,hint); button.append(avatar,copy);
  button.addEventListener("click", async () => {
    button.disabled = true;
    const { data: conversationId, error: rpcError } = await supabase.rpc("create_direct_conversation", { target_username: user.username });
    if (rpcError) { alert("Couldn't start chat: " + rpcError.message); button.disabled = false; return; }
    $("searchResults").innerHTML = ""; $("userSearchInput").value = "";
    await loadConversations(); await openConversation(conversationId, user.username);
  });
  results.append(button);
});
$("signOut").addEventListener("click", async () => { if (messageChannel) await supabase.removeChannel(messageChannel); await supabase.auth.signOut(); });
start();
// Your existing code above...

async function loadMyAvatar() {
  const { data, error } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", currentUser.id)
    .single();

  if (error) {
    console.error("Could not load profile picture:", error);
    return;
  }

  currentAvatarUrl = data.avatar_url;

  const avatar = $("myAvatar");
  const fallback = $("myAvatarFallback");

  if (currentAvatarUrl) {
    avatar.src = currentAvatarUrl;
    avatar.classList.remove("hidden");
    fallback.classList.add("hidden");
  } else {
    avatar.classList.add("hidden");
    fallback.classList.remove("hidden");
  }
}

  const avatar = $("myAvatar");
  const fallback = $("myAvatarFallback");

  if (data.avatar_url) {
    avatar.src = data.avatar_url;
    avatar.classList.remove("hidden");
    fallback.classList.add("hidden");
  } else {
    avatar.classList.add("hidden");
    fallback.classList.remove("hidden");
  }

