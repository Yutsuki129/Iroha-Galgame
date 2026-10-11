// ==================== 1. 基礎設定 ====================
const CHARACTER_AVATAR_URL = "avatar.png"; 
const STORAGE_KEY = "iroha_galgame_save";
const BACKEND_URL = "https://iroha-galgame.onrender.com/api/chat";

let messagesHistory = []; 
let currentAffinity = 40;
let currentLust = 0;
let triggeredEvents = [];

// ==================== 2. 存檔 / 讀檔 機制 ====================

// 儲存遊戲狀態至 localStorage
function saveGameState() {
  const langSelect = document.getElementById("language-select");
  const selectedLang = langSelect ? langSelect.value : "繁體中文";

  const gameState = {
    affinity: currentAffinity,
    lust: currentLust,
    messages: messagesHistory,
    triggeredEvents: triggeredEvents,
    selectedLang: selectedLang
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(gameState));
}

// 讀取並還原遊戲狀態
function loadGameState() {
  const savedData = localStorage.getItem(STORAGE_KEY);
  if (!savedData) return false;

  try {
    const gameState = JSON.parse(savedData);
    currentAffinity = gameState.affinity ?? 40;
    currentLust = gameState.lust ?? 0;
    messagesHistory = gameState.messages ?? [];
    triggeredEvents = gameState.triggeredEvents ?? [];

    const selectedLang = gameState.selectedLang ?? "繁體中文";
    const langSelect = document.getElementById("language-select");
    if (langSelect) langSelect.value = selectedLang;

    // 還原 UI 數值
    renderAffinityDisplay();
    renderLustDisplay();

    // 還原聊天紀錄至畫面
    const chatBox = document.getElementById("chat-box");
    if (chatBox) {
      chatBox.innerHTML = "";
      messagesHistory.forEach(msg => {
        if (msg.role === "user") {
          // 清理存檔中的系統提示前綴，避免畫面顯示冗長標籤
          const displayText = msg.content.replace(/^\[系統提示：.*?\]\s*/, "");
          appendMessage("user", displayText);
        } else if (msg.role === "assistant") {
          appendMessage("ai", msg.content, msg.thought || null);
        }
      });
    }

    return true;
  } catch (err) {
    console.error("讀取存檔失敗:", err);
    return false;
  }
}

// 清除存檔（重啟新遊戲）
function resetGame() {
  if (confirm("確定要重置所有進度與對話紀錄嗎？")) {
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  }
}

// ==================== 3. UI 數值更新函式 ====================

function renderAffinityDisplay() {
  const display = document.getElementById("affinity-display") || document.getElementById("affinity-value");
  if (display) display.innerText = currentAffinity;

  const lustContainer = document.getElementById("lust-container");
  if (lustContainer) {
    lustContainer.style.display = currentAffinity >= 150 ? "inline" : "none";
  }
}

function renderLustDisplay() {
  const lustDisplay = document.getElementById("lust-display") || document.getElementById("lust-value");
  if (lustDisplay) lustDisplay.innerText = currentLust;
}

function updateAffinityUI(delta) {
  currentAffinity = Math.max(0, Math.min(200, currentAffinity + delta));
  renderAffinityDisplay();

  const deltaDisplay = document.getElementById("affinity-delta");
  if (deltaDisplay && delta !== 0) {
    deltaDisplay.innerText = delta > 0 ? `(+${delta})` : `(${delta})`;
    deltaDisplay.className = delta > 0 ? "delta-positive" : "delta-negative";
    deltaDisplay.style.animation = 'none';
    deltaDisplay.offsetHeight; // 觸發重繪
    deltaDisplay.style.animation = null;
  }
}

function updateLustUI(delta) {
  if (currentAffinity < 150) return;

  currentLust = Math.max(0, Math.min(100, currentLust + delta));
  renderLustDisplay();

  const lustDeltaDisplay = document.getElementById("lust-delta");
  if (lustDeltaDisplay && delta !== 0) {
    lustDeltaDisplay.innerText = delta > 0 ? `(+${delta})` : `(${delta})`;
    lustDeltaDisplay.className = delta > 0 ? "lust-positive" : "lust-negative";
    lustDeltaDisplay.style.animation = 'none';
    lustDeltaDisplay.offsetHeight; // 觸發重繪
    lustDeltaDisplay.style.animation = null;
  }
}

// ==================== 4. 發送對話處理函式 ====================

async function handleSend() {
  const userInput = document.getElementById("user-input");
  if (!userInput) return;
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
    if (!response.ok) throw new Error(data.detail || "伺服器回應錯誤");

    // 更新數值
    updateAffinityUI(data.delta);
    if (data.lust_delta !== undefined) {
      updateLustUI(data.lust_delta);
    }
    
    // 渲染 AI 發言與儲存
    messagesHistory.push({ 
      role: "assistant", 
      content: data.talk,
      thought: data.thought 
    });
    appendMessage("ai", data.talk, data.thought);

    // 狀態持久化
    saveGameState();

    // 觸發事件選項
    if (data.event) {
      triggeredEvents.push(data.event.id);
      saveGameState();
      showChoices(data.event.choices);
    }

  } catch (err) {
    appendMessage("ai", `[系統訊息] 連線失敗: ${err.message}`);
  } finally {
    if (sendBtn) sendBtn.disabled = false;
  }
}

// ==================== 5. 選項顯示與處理 ====================

function showChoices(choices) {
  const inputRow = document.querySelector('.input-row');
  if (inputRow) inputRow.style.display = 'none';
  
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
      messagesHistory.push({ 
        role: "user", 
        content: `[系統提示：玩家在事件中選擇了「${choice.text}」。請演出專屬反應，並在反應後自然讓劇情往前推進]` 
      });
      
      choiceContainer.remove();
      if (inputRow) inputRow.style.display = 'flex';
      
      updateAffinityUI(choice.affinity_change);
      if (choice.lust_change !== undefined) {
        updateLustUI(choice.lust_change);
      }
      saveGameState();
      callBackend(true, choice);
    };
    choiceContainer.appendChild(btn);
  });

  box.appendChild(choiceContainer);
  box.scrollTop = box.scrollHeight;
}

// ==================== 6. 對話渲染 ====================

function appendMessage(role, text, thought = null) {
  const box = document.getElementById("chat-box");
  if (!box) return;

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

// ==================== 7. 初始化進入點 ====================

window.addEventListener("DOMContentLoaded", () => {
  const hasLoaded = loadGameState();
  if (!hasLoaded) {
    renderAffinityDisplay();
    renderLustDisplay();
    appendMessage(
      "ai", 
      "學長，找我有什麼事嗎？先說好，要是麻煩事的話我可不幹喔。", 
      "（這傢伙又晃晃悠悠過來了……）"
    );
  }
});