# OpenBuff Desktop（PoC）

將 [OpenBuff](https://github.com/AnzoBenjamin/openbuff)（local-first 的 agentic coding CLI）包裝為 Windows 桌面應用程式的 PoC。

- **Electron + React 19 + @openbuff/sdk**：SDK 直接嵌入 Electron main process，程式碼不經任何雲端。
- **BYOK**：使用你自己的 API Key（OpenAI / Anthropic / OpenRouter / 自訂端點），金鑰以 Windows DPAPI 加密儲存。
- **Bundled agents**：內建 46 個 OpenBuff 官方 agent（由 `openbuff-src/cli/scripts/prebuild-agents.ts` 產生）。

## 專案結構

```
src/
├── main/                 # Electron main process
│   ├── index.ts          # 視窗 + IPC
│   ├── openbuff.ts       # OpenbuffClient 管理（事件串流 → renderer）
│   ├── settings.ts       # Provider 設定、API key 加密儲存
│   └── agents/           # bundled-agents.ts（46 個官方 agent 定義）
├── preload/index.ts      # contextBridge 最小 API
└── renderer/src/         # React UI（聊天 + Agent 活動/差異/索引面板 + 設定）
demo-project/             # 測試用最小專案（含 openbuff.json 範例）
openbuff-src/             # OpenBuff 原始碼 clone（用於本地建置 SDK）
scripts/smoke-sdk.ts      # 無 GUI 的 SDK 端對端驗證
```

## 執行

```bash
npm install        # 依賴（@openbuff/sdk 以本地路徑安裝）
npm run dev        # 啟動 Electron（dev 模式）
npm run build      # 產出 out/
npm run typecheck  # TypeScript 檢查
```

## 第一次使用

1. `npm run dev` 啟動後，點「選擇專案資料夾」選 `demo-project/`。
2. 點「設定」，選擇 Provider（如 OpenAI）、填入 API Key 與模型，儲存。
3. 輸入指令，例如：`幫 divide 函數加上除零錯誤處理`。
4. 右側「Agent 活動」面板即時顯示每一步（子 agent、工具呼叫、結果）。
5. 在 Composer 輸入 `/init`，或前往 Settings → Custom Agents → Create Agent，使用視覺化精靈建立自訂 agent。

## 無 GUI 驗證（需要 API key）

```bash
OPENAI_API_KEY=sk-xxx bun run scripts/smoke-sdk.ts
```

## 本機 SDK 來源說明

`@openbuff/sdk` 尚未發佈到 npm registry（fork 尚未 publish），故從原始碼建置：

```bash
git clone --depth 1 https://github.com/AnzoBenjamin/openbuff.git openbuff-src
cd openbuff-src && bun install
cd sdk && bun run build        # 產出 dist/（含 WASM 與 ripgrep binaries）
npm install ./openbuff-src/sdk # 在專案根以本地路徑安裝
```

若日後 fork 發佈了 `@openbuff/sdk` 到 npm，可改回 `npm install @openbuff/sdk`。

## 功能

- 🌗 **深/淺主題切換**（topbar 右上角，記憶於 localStorage）
- ⚙️ **Provider 設定可「取得模型」**：OpenAI 相容端點自動拉取 `/models`（Ollama 用 `/api/tags`），可篩選點選
- 🌐 **原生 web_search**：OpenBuff agent-runtime 內建 `web_search` 工具（DuckDuckGo，免費免 key）；已 patch 進 `base2`，主 agent 可直接要求搜尋網頁
- 🔀 **Per-agent 模型路由**：Settings → Agent Routing，將特定 agent 指向不同 model / reasoning effort（寫入 openbuff.json 的 `agents` / `agentReasoningEfforts`）
- ↻ **中斷恢復**：Stop 或 API 失敗後進度保留，聊天區出現 Resume banner 可一鍵續跑；每 ~30s 的 mid-turn checkpoint 原子寫入磁碟供崩潰復原
- 🧩 **自訂 agents（`.agents/`）**：從專案或 home 的 `.agents/` 載入 `.ts/.tsx/.js/.mjs/.cjs` agent 定義（`.ts` 以 TypeScript 轉譯），合併進 bundled agents 並可被 base2 spawn；Settings → Custom Agents 顯示載入狀態與驗證錯誤
- 🪄 **視覺化 `/init` Agent 建立精靈**：從模板建立專案或 home scope 的自訂 agent，編輯 system prompt、工作指令與工具能力，確認 TypeScript 定義後直接寫入 `.agents/<id>.ts`
- 🔎 **Codebase Index 視覺化**：`query_index` 的查詢模式、索引狀態、涵蓋率、排名分數、命中欄位、symbols/headings、snippets 與關聯檔案會在右側 Codebase Index 面板呈現；可展開結果並點擊開啟檔案

## 已知限制（PoC）

- codebase index 的背景自動更新/手動重建控制尚未提供；目前會隨 SDK `query_index` 查詢結果更新視覺化面板。
- API key 以 DPAPI 加密，但 provider 設定（baseURL/model）為明文 JSON。
- 建立 agent 後，Settings → Custom Agents 可按 Reload 重新掃描 `.agents/`；現有 agent 的進階程式碼編輯仍需直接修改 agent 檔案。
