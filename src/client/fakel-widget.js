/** Виджет консультанта: текст, голос, вложения. */

const state = {
  open: false,
  speaking: false,
  listening: false,
  busy: false,
  messages: [],
  bootstrap: null,
  recognition: null,
  pendingFiles: [],
};

const MAX_FILES = 5;
const MAX_BYTES = 4_000_000;

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function root() {
  return document.querySelector("#fakel-root");
}

async function api(path, options = {}) {
  const headers = { ...(options.body ? { "Content-Type": "application/json" } : {}) };
  const token = localStorage.getItem("florens-token");
  if (token) headers["X-Florens-Token"] = token;
  const response = await fetch(path, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Консультант не ответил");
  return data;
}

function speak(text) {
  if (!window.speechSynthesis || !text) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "ru-RU";
  utter.rate = 1.02;
  const voices = window.speechSynthesis.getVoices();
  const ru = voices.find((v) => /ru/i.test(v.lang));
  if (ru) utter.voice = ru;
  state.speaking = true;
  utter.onend = () => {
    state.speaking = false;
    paint();
  };
  window.speechSynthesis.speak(utter);
  paint();
}

function stopSpeak() {
  window.speechSynthesis?.cancel();
  state.speaking = false;
  paint();
}

function startListen() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    pushLocal("fakel", "Этот браузер не даёт распознавание речи. Напиши текстом или прикрепи файл — я всё равно с тобой.");
    paint();
    return;
  }
  if (state.listening && state.recognition) {
    state.recognition.stop();
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = "ru-RU";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  state.recognition = recognition;
  state.listening = true;
  paint();
  recognition.onresult = async (event) => {
    const text = event.results?.[0]?.[0]?.transcript || "";
    state.listening = false;
    paint();
    if (text) await sendMessage(text);
  };
  recognition.onerror = () => {
    state.listening = false;
    paint();
  };
  recognition.onend = () => {
    state.listening = false;
    paint();
  };
  recognition.start();
}

function pushLocal(role, text, files) {
  state.messages.push({ role, text, files: files || null, at: new Date().toISOString() });
  if (state.messages.length > 40) state.messages = state.messages.slice(-40);
}

function fileToPayload(file) {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_BYTES) {
      reject(new Error(`«${file.name}» больше ${Math.round(MAX_BYTES / 1_000_000)} МБ`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        name: file.name,
        mime: file.type || "application/octet-stream",
        data: String(reader.result || ""),
      });
    };
    reader.onerror = () => reject(new Error(`Не удалось прочитать «${file.name}»`));
    reader.readAsDataURL(file);
  });
}

async function addFiles(fileList) {
  const incoming = [...(fileList || [])];
  if (!incoming.length) return;
  const room = MAX_FILES - state.pendingFiles.length;
  if (room <= 0) {
    pushLocal("fakel", `За один раз до ${MAX_FILES} файлов. Отправь текущие или сними лишние.`);
    paint();
    return;
  }
  try {
    const packed = await Promise.all(incoming.slice(0, room).map(fileToPayload));
    state.pendingFiles = [...state.pendingFiles, ...packed].slice(0, MAX_FILES);
  } catch (error) {
    pushLocal("fakel", error.message || "Файл не принят.");
  }
  paint();
}

function removePending(index) {
  state.pendingFiles = state.pendingFiles.filter((_, i) => i !== index);
  paint();
}

async function sendMessage(text) {
  const cleaned = String(text || "").trim();
  const files = [...state.pendingFiles];
  if ((!cleaned && !files.length) || state.busy) return;
  const label = [
    cleaned,
    files.length ? `📎 ${files.map((f) => f.name).join(", ")}` : "",
  ].filter(Boolean).join("\n");
  pushLocal("user", label, files.map((f) => ({ name: f.name, mime: f.mime })));
  state.pendingFiles = [];
  state.busy = true;
  paint();
  try {
    const data = await api("/api/fakel/chat", {
      method: "POST",
      body: { message: cleaned, files },
    });
    pushLocal("fakel", data.answer, data.files || null);
    state.busy = false;
    paint();
    const voiceOn = localStorage.getItem("fakel-voice") !== "off";
    if (voiceOn && data.speak !== false) speak(data.answer);
  } catch (error) {
    pushLocal("fakel", error.message || "Нет связи с консультантом.");
    state.busy = false;
    paint();
  }
}

function paint() {
  const el = root();
  if (!el) return;
  const boot = state.bootstrap;
  el.innerHTML = `
    <button type="button" class="fakel-fab" data-fakel="toggle" aria-label="Открыть консультанта">
      <img src="/fakel.svg" alt="" width="44" height="44">
      <span>Чат</span>
    </button>
    <section class="fakel-panel ${state.open ? "on" : ""}" aria-live="polite">
      <header class="fakel-head">
        <div class="fakel-head-brand">
          <img src="/fakel.svg" alt="" width="36" height="36">
          <div>
            <strong>${esc(boot?.name || "Консультант")}</strong>
            <span>${esc(boot?.title || "AI-помощник на любые темы")}</span>
          </div>
        </div>
        <div class="fakel-head-actions">
          <button type="button" class="fakel-icon" data-fakel="voice-toggle" title="Голосовой ответ">${localStorage.getItem("fakel-voice") === "off" ? "Голос выкл" : "Голос вкл"}</button>
          <button type="button" class="fakel-icon" data-fakel="close" title="Закрыть">×</button>
        </div>
      </header>
      <div class="fakel-body" data-fakel-scroll>
        ${(state.messages.length ? state.messages : [{ role: "fakel", text: boot?.greeting || "Здравствуйте. Задайте вопрос." }]).map((msg) => `
          <article class="fakel-msg ${msg.role === "user" ? "me" : "bot"}">
            <p>${esc(msg.text)}</p>
            ${msg.files?.length ? `<div class="fakel-attach-list">${msg.files.map((f) => `<span class="fakel-chip">${esc(f.name)}</span>`).join("")}</div>` : ""}
          </article>
        `).join("")}
        ${state.busy ? `<article class="fakel-msg bot"><p class="muted">Думаю…</p></article>` : ""}
      </div>
      <div class="fakel-quick">
        <button type="button" data-fakel="ask" data-text="Что сделать сегодня по бизнесу?">Сегодня</button>
        <button type="button" data-fakel="ask" data-text="Кто мне подходит в партнёры на платформе?">Партнёры</button>
        <button type="button" data-fakel="ask" data-text="Как получить новых клиентов через других бизнесов?">Клиенты</button>
        <button type="button" data-fakel="ask" data-text="Объясни простыми словами, как пользоваться платформой">Платформа</button>
      </div>
      ${state.pendingFiles.length ? `<div class="fakel-pending">${state.pendingFiles.map((file, i) => `
        <span class="fakel-chip">${esc(file.name)} <button type="button" data-fakel="drop" data-i="${i}" title="Убрать">×</button></span>
      `).join("")}</div>` : ""}
      <form class="fakel-form" data-fakel="form">
        <button type="button" class="fakel-plus" data-fakel="plus" title="Прикрепить любой файл">+</button>
        <input id="fakel-file" type="file" multiple hidden>
        <button type="button" class="fakel-mic ${state.listening ? "on" : ""}" data-fakel="mic" title="Говорить">${state.listening ? "…" : "Мик"}</button>
        <input name="message" type="text" placeholder="Текст или файл через +" autocomplete="off" maxlength="2000" ${state.busy ? "disabled" : ""}>
        <button type="submit" class="fakel-send" ${state.busy ? "disabled" : ""}>→</button>
      </form>
      <p class="fakel-foot">${esc(boot?.voiceHint || "")}${state.speaking ? " · говорит…" : ""}</p>
    </section>
  `;
  const scroll = el.querySelector("[data-fakel-scroll]");
  if (scroll) scroll.scrollTop = scroll.scrollHeight;
  const fileInput = el.querySelector("#fakel-file");
  if (fileInput) {
    fileInput.onchange = async () => {
      await addFiles(fileInput.files);
      fileInput.value = "";
    };
  }
}

function bind() {
  const el = root();
  if (!el || el.dataset.bound) return;
  el.dataset.bound = "1";
  el.addEventListener("click", (event) => {
    const node = event.target.closest("[data-fakel]");
    if (!node) return;
    const act = node.dataset.fakel;
    if (act === "toggle") {
      state.open = !state.open;
      if (state.open && !state.messages.length && state.bootstrap?.greeting) {
        pushLocal("fakel", state.bootstrap.greeting);
      }
      paint();
    }
    if (act === "close") {
      state.open = false;
      stopSpeak();
      paint();
    }
    if (act === "voice-toggle") {
      const off = localStorage.getItem("fakel-voice") === "off";
      localStorage.setItem("fakel-voice", off ? "on" : "off");
      if (!off) stopSpeak();
      paint();
    }
    if (act === "mic") startListen();
    if (act === "plus") el.querySelector("#fakel-file")?.click();
    if (act === "drop") removePending(Number(node.dataset.i));
    if (act === "ask") sendMessage(node.dataset.text || "");
  });
  el.addEventListener("submit", async (event) => {
    const form = event.target.closest("form[data-fakel='form']");
    if (!form) return;
    event.preventDefault();
    const input = form.querySelector("input[name='message']");
    const value = input?.value || "";
    if (input) input.value = "";
    await sendMessage(value);
  });
  el.addEventListener("dragover", (event) => {
    if (!state.open) return;
    event.preventDefault();
  });
  el.addEventListener("drop", async (event) => {
    if (!state.open) return;
    event.preventDefault();
    await addFiles(event.dataTransfer?.files);
  });
}

export async function mountFakelWidget() {
  if (!document.querySelector("#fakel-root")) {
    const node = document.createElement("div");
    node.id = "fakel-root";
    document.body.appendChild(node);
  }
  bind();
  try {
    state.bootstrap = await api("/api/fakel");
  } catch {
    state.bootstrap = {
      name: "Консультант",
      title: "AI-помощник на любые темы",
      greeting: "Здравствуйте. Связь с сервером сейчас слабая — обновите страницу.",
      voiceHint: "Спрашивайте о чём угодно.",
    };
  }
  paint();
  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => {};
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => mountFakelWidget());
} else {
  mountFakelWidget();
}
