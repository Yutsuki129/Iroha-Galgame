// ==================== 1. 基礎設定 ====================
const CHARACTER_AVATAR_URL = "avatar.png"; 

let messagesHistory = []; 
let currentAffinity = 40;
let currentLust = 0; // 新增：性慾值狀態
let triggeredEvents = [];

const BACKEND_URL = "http://localhost:8000/api/chat";

// ==================== 2. 發送對話處理函式 ====================
async function handleSend() {
  const userInput = document.getElementById("user-input");
  const text = userInput.value.trim();
  if (!text) return;

  appendMessage("user", text);
  messagesHistory.push({ 
    role: "user", 
    content: `[系統提示：當前好感度 ${currentAffinity}，性慾值 ${currentLust}] ${text}` 
  });
  userInput.value = "";
  
  await callBackend(false, null);
}

async function callBackend(isChoice, choiceData) {
  const sendBtn = document.getElementById("send-btn");
  const langSelect = document.getElementById("language-select");
  const selectedLang = langSelect ? langSelect.value : "繁體中文";
  
  if (sendBtn) sendBtn.disabled = true;

  const processedMessages = messagesHistory.map((msg, index) => {
    if (index === messagesHistory.length - 1 && msg.role === "user") {
      let reminder = selectedLang === "日本語" ? " (※必ず日本語で返信)" : 
                     selectedLang === "English" ? " (※Reply strictly in English)" : "";
      return { role: "user", content: msg.content + reminder };
    }
    return msg;
  });

  try {
    const response = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        history: processedMessages,
        affinity: currentAffinity,
        lust: currentLust,
        selected_lang: selectedLang,
        triggered_events: triggeredEvents,
        choice_reaction_prompt: isChoice ? choiceData.reaction_prompt : null
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.detail);

   // 1. 更新好感度與性慾值 UI
    updateAffinityUI(data.delta);
    if (data.lust_delta !== undefined) {
      updateLustUI(data.lust_delta);
    }
    
    // 2. 渲染 AI 發言（這句話已經包含了自然的事件話題延伸！）
    messagesHistory.push({ role: "assistant", content: data.talk });
    appendMessage("ai", data.talk, data.thought);

    // 3. 【核心改動】：如果觸發了事件，直接在對話框下方展示選項！
    if (data.event) {
      triggeredEvents.push(data.event.id);
      // 直接顯示選項按鈕，不再硬塞 npc_opening 泡泡
      showChoices(data.event.choices);
    }

  } catch (err) {
    appendMessage("ai", `[系統訊息] 連線失敗: ${err.message}`);
  } finally {
    if (sendBtn) sendBtn.disabled = false;
  }
}

// ==================== UI 數值更新函式 ====================
// ==================== UI 數值更新函式 ====================
function updateAffinityUI(delta) {
  // 加上 0 ~ 200 限制
  currentAffinity = Math.max(0, Math.min(200, currentAffinity + delta));
  
  const display = document.getElementById("affinity-display");
  const deltaDisplay = document.getElementById("affinity-delta");
  
  if (display) display.innerText = currentAffinity;
  
  if (deltaDisplay && delta !== 0) {
    deltaDisplay.innerText = delta > 0 ? `(+${delta})` : `(${delta})`;
    deltaDisplay.className = delta > 0 ? "delta-positive" : "delta-negative";
    deltaDisplay.style.animation = 'none';
    deltaDisplay.offsetHeight;
    deltaDisplay.style.animation = null;
  }

  // 門檻改為 150
  const lustContainer = document.getElementById("lust-container");
  if (lustContainer) {
    lustContainer.style.display = currentAffinity >= 150 ? "inline" : "none";
  }
}

function updateLustUI(delta) {
  // 門檻改為 150
  if (currentAffinity < 150) return;

  currentLust = Math.max(0, Math.min(100, currentLust + delta));
  const lustDisplay = document.getElementById("lust-display");
  const lustDeltaDisplay = document.getElementById("lust-delta");

  if (lustDisplay) lustDisplay.innerText = currentLust;

  if (lustDeltaDisplay && delta !== 0) {
    lustDeltaDisplay.innerText = delta > 0 ? `(+${delta})` : `(${delta})`;
    lustDeltaDisplay.className = delta > 0 ? "lust-positive" : "lust-negative";
    lustDeltaDisplay.style.animation = 'none';
    lustDeltaDisplay.offsetHeight;
    lustDeltaDisplay.style.animation = null;
  }
}

function initUI() {
  const affDisplay = document.getElementById("affinity-display");
  const lustDisplay = document.getElementById("lust-display");
  const lustContainer = document.getElementById("lust-container");

  if (affDisplay) affDisplay.innerText = currentAffinity;
  if (lustDisplay) lustDisplay.innerText = currentLust;

  // 門檻改為 150
  if (lustContainer) {
    lustContainer.style.display = currentAffinity >= 150 ? "inline" : "none";
  }
}
// ==================== 選項顯示與處理 ====================
function showChoices(choices) {
  document.querySelector('.input-row').style.display = 'none';
  
  const box = document.getElementById("chat-box");
  const choiceContainer = document.createElement("div");
  choiceContainer.id = "choice-container";
  choiceContainer.style.display = "flex";

  choices.forEach(choice => {
    const btn = document.createElement("button");
    btn.className = "choice-btn";
    btn.innerText = choice.text;
    
    btn.onclick = () => {
      appendMessage("user", choice.text);
      // 加上【事件結算推進指示】，防止下一輪對話 AI 複讀
      messagesHistory.push({ 
        role: "user", 
        content: `[系統提示：玩家在事件中選擇了「${choice.text}」。請演出專屬反應，並在反應後自然讓劇情往前推進]` 
      });
      
      choiceContainer.remove();
      document.querySelector('.input-row').style.display = 'flex';
      
      updateAffinityUI(choice.affinity_change);
      if (choice.lust_change !== undefined) {
        updateLustUI(choice.lust_change);
      }
      callBackend(true, choice);
    };
    choiceContainer.appendChild(btn);
  });

  box.appendChild(choiceContainer);
  box.scrollTop = box.scrollHeight;
}

// ==================== 對話渲染 ====================
function appendMessage(role, text, thought = null) {
  const box = document.getElementById("chat-box");
  const row = document.createElement("div");
  row.className = `msg-row ${role}`;

  if (role === "ai") {
    const avatarImg = document.createElement("img");
    avatarImg.src = CHARACTER_AVATAR_URL;
    avatarImg.alt = "角色頭像";
    avatarImg.className = "avatar";
    row.appendChild(avatarImg);
  }

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  if (thought) {
    const thoughtDiv = document.createElement("div");
    thoughtDiv.className = "thought";
    thoughtDiv.innerText = `OS: ${thought}`;
    bubble.appendChild(thoughtDiv);
  }

  const textDiv = document.createElement("div");
  textDiv.innerText = text;
  bubble.appendChild(textDiv);

  row.appendChild(bubble);
  box.appendChild(row);
  box.scrollTop = box.scrollHeight;
}

updateAffinityUI(0);

// ==================== 頁面載入強制初始化 ====================
function initUI() {
  const affDisplay = document.getElementById("affinity-display");
  const lustDisplay = document.getElementById("lust-display");
  const lustContainer = document.getElementById("lust-container");

  // 1. 強制將 JS 變數的值填進 HTML
  if (affDisplay) affDisplay.innerText = currentAffinity;
  if (lustDisplay) lustDisplay.innerText = currentLust;

  // 2. 判斷是否解鎖性慾值
  if (lustContainer) {
    lustContainer.style.display = currentAffinity >= 100 ? "inline" : "none";
  }
}

// 頁面載入完成時執行
window.addEventListener("DOMContentLoaded", initUI);