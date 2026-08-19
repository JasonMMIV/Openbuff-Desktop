# OpenBuff Windows App — 可行性評估與開發計畫書

> 評估日期：2026-08-17
> 評估對象：[AnzoBenjamin/openbuff](https://github.com/AnzoBenjamin/openbuff)（`main` 分支，最後更新 2026-08-16）
> 目標：將 OpenBuff 從 CLI 工具轉換為可在 Windows 上安裝、執行的桌面應用程式（Windows App）

---

## 1. 結論摘要

| 項目 | 評估結果 |
|---|---|
| **可行性** | ✅ **高度可行** |
| **建議方案** | Phase 1 採用 **Electron + @openbuff/sdk**（最快出貨）；Phase 2 評估遷移至 **Tauri 2**（輕量化產品化） |
| **預估時程** | PoC 1 週 → MVP 4–6 週 → 正式版 12–16 週（1–2 人團隊） |
| **授權** | Apache-2.0，**可自由商用、改作、再發佈**（需保留版權聲明） |
| **主要風險** | Bun runtime 依賴、Windows 程式碼簽章（SmartScreen）、ripgrep 原生工具附帶 |

**核心依據（三點足以定案）：**

1. **官方建置腳本已原生支援 Windows**：`cli/scripts/build-binary.ts` 內建 `win32-x64 → bun-windows-x64` 目標映射，可直接以 `bun build --compile` 產出 `openbuff.exe`。代表專案在 Windows 上編譯、執行是官方已驗證的路徑，非逆向工程。
2. **SDK 為純 JS、Node ≥ 18 相容**：`@openbuff/sdk`（v0.11.0）所有依賴皆為純 JavaScript 或 WASM（`@vscode/tree-sitter-wasm`、`@jitl/quickjs-wasmfile-release-sync`），無需原生編譯，可直接在 Electron / Node.js 主程序內嵌執行——而「把 Openbuff 建進你的應用程式」正是官方 SDK 的設計目的。
3. **UI 技術棧可無痛重用**：CLI 使用 React 19 + @opentui/react（React-based TUI），團隊若具備 React 技能，即可直接打造桌面 GUI，無需學習第二套 UI 框架。

---

## 2. OpenBuff 專案分析

### 2.1 專案定位

OpenBuff 是 **CodebuffAI/freebuff 的分支（fork）**，一個 **local-first / BYOK（Bring Your Own Key）** 的 agentic coding CLI：

- 透過自然語言指令編輯使用者的程式碼庫
- 多 agent 協作架構：File Picker（檔案選擇）→ Planner（規劃）→ Editor（編輯）→ Reviewer（審查）
- 無雲端後端、無額度、無訂閱，完全本地運作，模型由使用者自備（OpenAI 相容 / Anthropic 相容 provider）

### 2.2 技術棧

| 項目 | 內容 |
|---|---|
| 主要語言 | TypeScript（約 1,447 萬行）、JavaScript |
| Runtime | **Bun**（CLI 要求 `bun 1.3.11`；SDK 相容 Node ≥ 18） |
| CLI UI | @opentui/core + @opentui/react（React-based TUI）、yoga-layout、commander |
| SDK | `@openbuff/sdk`（npm 發佈，v0.11.0），可用 `OpenbuffClient.run()` 嵌入執行 agent |
| 程式碼解析 | tree-sitter（WASM 版）、quickjs-wasm |
| 二進位打包 | `bun build --compile`，`build-binary.ts` 支援 win32-x64 / linux-x64 / darwin-x64 / arm64 |
| 授權 | **Apache-2.0**（可商用、可改作、可再發佈） |

### 2.3 模組結構（GitHub 目錄）

- `cli/` — CLI 主程式（`src/app.tsx`、`src/chat.tsx`、`src/commands/`、`src/components/`）
- `sdk/` — 可嵌入的 SDK（`@openbuff/sdk`）
- `packages/` — 共用套件（`code-map`、`indexer` 等）
- `agents/` — 內建 agent 定義（base2、context-pruner 等）

### 2.4 Windows 相容性現況

| 面向 | 現況 |
|---|---|
| 編譯 | ✅ `build-binary.ts` 內建 `win32-x64` 目標，產出 `.exe` |
| 執行 | ✅ Bun 原生支援 Windows；CLI 的 TUI 依賴 ANSI 終端，Windows Terminal 已完整支援 |
| 原生依賴 | ⚠️ @opentui 有 native loader（建置腳本有對應 patch）；ripgrep 需附帶 `rg.exe` |
| 官方測試 | ⚠️ README 以 WSL 為 Windows 測試路徑，本機 Windows 測試覆蓋待補強（正是本專案可貢獻之處） |

---

## 3. 可行性評估

### 3.1 技術可行性 — ✅ 高

- SDK 純 JS/WASM、Node ≥ 18 相容 ⇒ 可直接嵌入 Electron 主程序，**無需改動 OpenBuff 核心程式碼**。
- 官方已支援產出 Windows exe ⇒ 需要 CLI 完整功能（`/init`、`/provider`、`/models`、自訂 agents）時，可將編譯後的 `openbuff.exe` 作為 sidecar 隨 App 附帶。
- 兩種整合路徑（SDK 嵌入 / CLI sidecar）皆可行，可擇一或並用。

### 3.2 法律可行性 — ✅ 高

- Apache-2.0：允許商用、修改、再分發；僅需保留原始版權聲明與授權條款，並在修改處標註。
- 專案無閉源後端綁定，local-first 架構讓桌面包裝完全自足。

### 3.3 市場與產品可行性 — ✅ 中高

- 目標使用者：開發者、AI 初學者（不想碰 CLI/終端機的人）、需要視覺化 diff 與檔案變更審查的使用者。
- 差異化：目前 OpenBuff 僅有 CLI，**官方沒有桌面版**（freebuff 上游有 VS Code 擴充，但無獨立 Windows App）。搶先提供 GUI 版有先行者優勢。
- 切入點：CLI 的 UX 天花板低（diff 檢視、多 agent 進度視覺化、Provider/模型設定都更適合 GUI）。

### 3.4 綜合評估

| 面向 | 分數（1–5） | 說明 |
|---|---|---|
| 技術可行性 | 5 | SDK 可嵌入、官方支援 Windows 編譯、UI 技術重用 |
| 授權/合規 | 5 | Apache-2.0，商用無障礙 |
| 開發成本 | 4 | 無需改核心，主要是包裝層與 UI 開發 |
| 市場機會 | 4 | 無官方桌面版，BYOK/local-first 有明確需求 |
| **總體** | **4.5 / 5 — 建議執行** | |

---

## 4. 方案比較與推薦

| 方案 | 技術 | 安裝檔大小 | 開發速度 | 記憶體 | 適合階段 |
|---|---|---|---|---|---|
| **A. Electron 包裝**（推薦 Phase 1） | Electron + React + @openbuff/sdk | 80–120 MB | ⭐⭐⭐⭐⭐ 最快 | 200–400 MB | MVP、快速驗證 |
| **B. Tauri 2 + sidecar** | Rust + WebView2 + CLI exe | 10–15 MB | ⭐⭐ 中等 | 50–100 MB | 正式產品化 |
| **C. 純 WebView2 包裝** | WebView2 + Node/Bun 後端 | 15–30 MB | ⭐ 較慢 | 中 | 不建議（boilerplate 多） |
| **D. WinUI 3 / WPF 原生** | C# 原生 + 橋接 SDK | 10–20 MB | ⭐ 最慢 | 低 | 需極致原生整合才考慮 |

### 4.1 推薦策略：兩階段

- **Phase 1（0–6 個月內）— Electron**：SDK 可在主程序內嵌執行，event stream 直接透過 IPC 推送到 renderer，串接成本最低；`electron-builder` 可一鍵產出 NSIS/MSI 安裝檔。風險最低、驗證最快。
- **Phase 2（產品驗證後）— 評估 Tauri 2**：以 WebView2 取代 Chromium，體積與記憶體大幅下降；OpenBuff CLI 編譯為 exe 當 sidecar，前端仍用 React。需要 Rust 工程師，故放在 PMF（Product-Market Fit）驗證之後再投入。

> 建議：不要一開始就押注 Tauri。先以 Electron 最短時間驗證產品價值，再視留存率決定是否重寫為 Tauri。

---

## 5. 目標架構（Phase 1：Electron）

```
┌─────────────────────────────────────────────────┐
│ Electron Renderer（React 19 UI）                 │
│  · 聊天介面（agent 思考/工具呼叫即時進度）        │
│  · 檔案變更清單 + diff 檢視器                     │
│  · Provider / API Key / 模型路由 設定頁          │
│  · Agent 管理（對應 CLI 的 /init、.agents/）      │
│  · 執行輸出面板（git / 測試指令輸出）             │
└──────────────┬──────────────────────────────────┘
               │ contextBridge + preload（嚴格最小權限）
┌──────────────▼──────────────────────────────────┐
│ Electron Main Process                           │
│  · OpenbuffClient（@openbuff/sdk）— 核心 agent  │
│  · 程式碼庫檔案讀寫（限於使用者授權的資料夾）      │
│  · 子程序管理（git、bun test 等指令）            │
│  · openbuff.json 設定檔管理（Provider/路由）      │
│  · 憑證安全儲存（Windows Credential Manager）     │
└─────────────────────────────────────────────────┘
```

### 5.1 關鍵設計決策

| 決策 | 選擇 | 理由 |
|---|---|---|
| SDK 嵌入 vs CLI sidecar | **主流程用 SDK 嵌入**：桌面端以 Renderer + IPC 實作 `/init` 視覺化 wizard 與自訂 agent scaffold；CLI sidecar 保留給未來尚未覆蓋的 CLI 專屬功能 | 目前不需額外 spawn sidecar，架構更單純 |
| 程式碼存取權限 | 啟動時由使用者選擇工作資料夾，renderer 只經由 main process 存取 | 資安最小權限原則 |
| API Key 儲存 | Windows Credential Manager（而非明文設定檔） | BYOK 工具的金鑰安全是信任基礎 |
| 終端機需求 | 應用程式不需要系統終端機；指令輸出以面板呈現 | 降低使用者門檻 |
| 更新機制 | electron-updater（自動更新） | 桌面 App 標準做法 |

---

## 6. 功能規劃

### 6.1 MVP（第 1 版，4–6 週）

- [ ] 專案資料夾選擇器 + 最近專案記錄
- [ ] 聊天式主介面：輸入指令 → 顯示多 agent 執行進度（File Picker → Planner → Editor → Reviewer）
- [ ] Streaming 輸出（即時顯示 token/工具呼叫）
- [ ] 檔案變更清單 + 逐檔 diff 檢視（接受/還原）
- [ ] Provider 設定精靈（對應 `/setup`、`/provider`；支援 OpenAI、Anthropic、OpenRouter、Ollama 等）
- [ ] `openbuff.json` 設定管理 UI
- [ ] Windows 10/11 相容性測試

### 6.2 V1.x（6–12 週）

- [ ] 模型路由設定 UI（對應 `/models`，per-agent 路由）
- [x] Agent 管理 UI（對應 `/init`，可視覺化建立 `.agents/` agent 定義；既有檔案的進階編輯仍待後續）
- [ ] 執行輸出面板（git 指令、測試結果、錯誤資訊）
- [ ] 程式碼庫導覽（檔案樹、搜尋）
- [ ] 系統托盤（tray）常駐 + 快速開啟
- [ ] 多視窗：同時處理多個專案

### 6.3 V2.0（產品化階段）

- [ ] 評估遷移 Tauri 2（體積 80→15 MB 以下）
- [ ] 全域快速鍵（從任何地方叫出）
- [ ] 離線模型優先整合（Ollama 一鍵安裝引導）
- [ ] 使用者工作階段管理 / 多設定檔
- [ ] 遙測（opt-in，符合 local-first 價值觀）

---

## 7. 開發時程與里程碑

```
里程碑 M0 — PoC（第 1 週）
  目標：Electron 殼 + SDK 嵌入 + 指令執行 + 輸出顯示
  驗收：可選資料夾、輸入「加註釋」、看到 agent 執行與檔案修改

里程碑 M1 — MVP（第 2–6 週）
  目標：6.1 全部項目
  驗收：內部 5 人試用一週，完成「選資料夾 → 下指令 → 看 diff → 接受變更」完整閉環

里程碑 M2 — 封閉測試（第 7–8 週）
  目標：V1.x 核心項目 + 錯誤回報管道
  驗收：20 人外部測試者，bug 收斂至 P0/P1 為 0

里程碑 M3 — 正式發佈（第 9–12 週）
  目標：V1.0 正式版 + 文件
  驗收：可下載安裝，更新流程驗證完成

里程碑 M4 — 產品化評估（第 13–16 週）
  目標：根據使用者數據決定 Tauri 遷移與 V2.0 路線
```

---

## 8. 技術風險與對策

| # | 風險 | 等級 | 對策 |
|---|---|---|---|
| 1 | **Bun runtime 依賴**：CLI 要求 bun 1.3.11，若 App 需完整 CLI 功能，需附帶 bun 或使用編譯後 exe | 中 | 主流程走 SDK（Node ≥ 18 相容）避開 bun；CLI sidecar 使用官方 `build-binary.ts` 編譯的 exe，不依賴使用者安裝 bun |
| 2 | **@opentui native loader**：僅 CLI TUI 需要，build 腳本已有 patch | 低 | 若只用 SDK + 自訂 React UI，完全不觸碰此問題 |
| 3 | **ripgrep 原生工具**：code-map/indexer 可能呼叫 rg | 中 | 隨 App 附帶 `rg.exe`（SDK 有 `fetch-ripgrep` 腳本，Windows 版可下載）；或用 WASM 替代方案 |
| 4 | **Windows Defender / SmartScreen**：未簽章 exe 會出現紅色警告，嚴重影響安裝轉換率 | 中高 | 正式發佈前購買 **OV 或 EV 程式碼簽章憑證**（EV 可立即獲得 SmartScreen 信任） |
| 5 | **上游變動**：fork 自 freebuff，上游可能快速演進 | 低 | 建立同步機制（定期 merge 上游）；鎖定 SDK 版本 |
| 6 | **tree-sitter WASM 效能**：大型 repo 解析速度 | 低 | 原生 CLI 已驗證可行性；必要時在 main process 以 worker 處理 |
| 7 | **終端機模擬需求**：若使用者需要互動式指令輸入（如 git 衝突解決） | 中 | 視需求在 V1.x 加入 xterm.js 嵌入式終端機 |
| 8 | **Windows 本機測試覆蓋不足**：官方測試以 WSL 為主 | 低 | 本專案建立 Windows 本機測試流程並回饋上游 |

---

## 9. 打包與發佈策略

| 項目 | 選擇 |
|---|---|
| 安裝格式 | **NSIS**（exe 安裝程式，最通用）；另附 **portable**（免安裝綠色版）供進階使用者 |
| 工具 | electron-builder（Phase 1）；Tauri bundler（Phase 2） |
| 支援版本 | Windows 10（21H2+）/ Windows 11，x64（arm64 視 Phase 2 需求） |

---

## 10. 資源與成本估算

### 10.1 人力

| 角色 | 投入 | 說明 |
|---|---|---|
| Senior Full-stack（TypeScript/React） | 1 人 × 4 個月 | 主要開發者，可兼任 Electron 主程序與 UI |
| QA / 測試 | 0.5 人 × 2 個月 | Windows 版本矩陣測試、安裝檔驗證 |
| （Phase 2）Rust 工程師 | 1 人 × 2 個月 | 僅在決定遷移 Tauri 時投入 |

### 10.2 費用（一次性/經常性）

| 項目 | 估算 |
|---|---|
| 程式碼簽章憑證 | OV：約 NT$10,000–20,000/年；EV：約 NT$30,000–60,000/年 |
| CI 建置 | 待定（後續打包階段再規劃） |
| 合計（不含人力） | **每年約 NT$10,000–60,000**，視簽章等級 |

---

## 11. 下一步建議（本週即可啟動）

1. ~~建立 PoC 儲存庫~~（✅ 已完成，見附錄 C）
2. **驗證 Windows 編譯**：在本機 Windows 跑 `bun run build:binary`，確認產出 `openbuff.exe` 可執行（作為 sidecar 備案）
3. **鎖定 SDK 版本**：pin `@openbuff/sdk` 版本，追蹤上游變更（目前以 symlink 安裝本地建置版）
4. ~~撰寫 PoC 驗收清單~~（✅ 已透過 smoke 腳本與實際對話驗證；下一步為完整端對端驗證）

---

## 附錄 A：參考資料

- OpenBuff 儲存庫：https://github.com/AnzoBenjamin/openbuff
- SDK 套件：`@openbuff/sdk`（npm，v0.11.0，engines: node ≥ 18）
- 授權：Apache-2.0
- 上游：https://github.com/CodebuffAI/freebuff
- CLI 二進位建置：`cli/scripts/build-binary.ts`（支援 win32-x64 → `bun-windows-x64`）

## 附錄 C：專案狀態快照（2026-08-17）

Phase 1 PoC 已完成並持續打磨。目前為可用的桌面雛形，`npm run dev` 啟動，設定與專案資料夾皆會記憶。

### C.1 已完成

| 項目 | 狀態 | 說明 |
|---|---|---|
| Electron + Vite + React 骨架 | ✅ | electron-vite 5 / Electron 43 / React 19 / TS strict；`npm run dev` / `build` / `typecheck` 皆通過 |
| SDK 本地建置與嵌入 | ✅ | `@openbuff/sdk` v0.11.0 由原始碼建置（npm 尚未 publish），以 symlink 方式安裝於 `node_modules/@openbuff/sdk → openbuff-src/sdk`，重建即時生效 |
| Bundled agents 接入 | ✅ | 46 個官方 agent（含 `base2`）由 `prebuild-agents.ts` 產生並隨 App 載入 |
| Provider 設定 | ✅ | OpenAI / Anthropic / OpenRouter / 自訂（含 Ollama）；API key 以 DPAPI 加密儲存；**設定持久化**（重啟恢復 provider/model/核准模式） |
| 取得模型清單 | ✅ | `fetchModels` IPC：OpenAI 相容端點 `GET /models`、Ollama `GET /api/tags`；設定 UI 可拉取、篩選、點選填入 |
| 聊天 + 事件串流 | ✅ | 指令執行、streaming 文字（打字光標）、工具呼叫折疊卡片、Markdown 渲染 + 語法高亮 |
| 三欄佈局 UI | ✅ | icon rail（52px）+ 檔案樹（264px，點擊預覽）+ 聊天 + 活動/Diff 面板（320px），左右側可開關 |
| 深/淺主題 | ✅ | 雙主題 CSS 變數 + 語法高亮 token 色；topbar 切換按鈕；localStorage 記憶；無邊框視窗 overlay 同步 |
| 無邊框視窗 | ✅ | `titleBarStyle: hidden` + 原生控制按鈕 overlay；topbar 為拖曳區 |
| 專案資料夾記憶 | ✅ | 選擇後存入 userData，啟動自動恢復 |
| web_search 接入 | ✅ | OpenBuff 原生 `web_search` 工具（DuckDuckGo、免 key）已 patch 進 `base2`，主 agent 可直接使用 |
| Gemini 相容性修復 | ✅ | Gemini 相容端點串流 tool-call 缺 `index` 欄位導致「Type validation failed」：已放寬 SDK 的 chunk schema（`openai-compatible-chat-language-model.ts` 的 `index: z.number().nullish()`）並重建 SDK；App 層另過濾此類 SDK 內部驗證噪音 |
| 端對端 SDK 驗證 | ✅ | `bun run scripts/smoke-sdk.ts` 已跑通至 API key 檢查（缺真實 key 無法完成最終呼叫） |

### C.2 已知粗糙處與待打磨清單（下次優化優先序）

| 優先 | 項目 | 現況 | 目標 |
|---|---|---|---|
| 高 | Diff 檢視器 | 僅顯示 `git diff --no-color` 純文字 | 逐檔 split view（前/後比較）、單檔接受/還原、行號與語法高亮 |
| 高 | 執行階段指示 | 無 | Planning / Editing / Reviewing / Validating 進度列（topbar + 聊天區） |
| 中 | followup 建議 | `suggest_followups` 工具呼叫結果未渲染 | 顯示為可點擊的下一輪指令卡片 |
| 中 | 工具卡片內容 | detail 僅 status/message | 展示工具輸入/輸出摘要、web_search 結果卡片（標題/連結/摘要） |
| 中 | 訊息操作 | 無 | 複製按鈕、重新產生、程式碼區塊複製 |
| 中 | 視窗狀態 | 尺寸固定 | 記憶視窗大小/位置；自訂最小化/最大化/關閉按鈕（取代 overlay） |
| 中 | 檔案樹 | 僅遞迴列表 | 搜尋/過濾、.gitignore 尊重、目前編輯中檔案高亮 |
| 低 | 活動時間軸 | 事件摘要 | 分組/過濾（只看工具、只看子 agent） |
| 低 | 設定驗證 | 無 | baseURL 格式、連線測試按鈕 |
| 低 | light 主題細節 | 基本可用 | 陰影/scrollbar/工具卡在 light 下的微調 |
| 低 | 效能 | 無 | 長對話虛擬列表、大型專案檔案樹延遲載入 |

### C.3 尚未實作（V1.x 以後）

> 以下為 2026-08-17 的歷史快照；後續完成狀態以附錄 F、G、H、I 為準。

- diff 進階版（接受/還原單檔變更）
- 模型路由 UI（per-agent model 與 reasoning effort）
- `/init` 自訂 agents（`.agents/`）載入與管理
- 中斷恢復（checkpoint / resumeInterruptedTurn）
- 打包安裝檔（electron-builder：NSIS + portable）— **延後至 UI 優化與整體 review 後**
- 自動更新（electron-updater）— **延後至打包階段**

### C.4 下一個動作

1. 依 C.2 優先序打磨 UI（先做 Diff 檢視器與執行階段指示）
2. 使用者提供 API key 後完成第一個真實指令的端對端驗證（含 web_search、followups）

---

## 附錄 D：進度更新（2026-08-18）

Phase 2「UI 大改版」完成，Phase 3「C.2 打磨清單」亦全數完成。`npm run typecheck` 與 `npm run build` 皆通過，瀏覽器預覽模式（vite :5199）已實測各項互動（@ 選單、/ 選單、tab 切換、Settings、Search、右側欄開闔、Diff split view、時間軸過濾、檔案樹搜尋、複製按鈕、連線測試）。

### D.0 C.2 打磨清單完成狀態（2026-08-18 下午）

| C.2 項目 | 狀態 | 實作說明 |
|---|---|---|
| Diff 檢視器（高） | ✅ | 逐檔 split view（Before/After 雙欄、行號、+/− 著色）、單檔 Accept（`git add`）/ Revert（`git checkout`）、檔案清單 + 統計；新增 `openbuff:gitAccept` / `openbuff:gitRevert` IPC |
| 執行階段指示（高） | ✅ | 由 tool/subagent 事件推導 Researching / Planning / Editing / Reviewing / Validating / Working，顯示於 topbar running badge（含 spinner） |
| followup 建議（中） | ✅ | 解析 `suggest_followups` 的 tool_result（JSON 或純文字），顯示為可點擊的下一輪指令卡片，點擊填入 composer |
| 工具卡片內容（中） | ✅ | 輸出文字保留；web_search/researcher 結果解析為卡片（標題/連結/摘要），可開新分頁 |
| 訊息操作（中） | ✅ | 使用者/助手訊息複製、最後一則使用者訊息 Revert（還原該輪檔案變更，並將原訊息放回輸入框）、程式碼區塊複製（copy 按鈕內嵌於 markdown HTML，delegated click） |
| 視窗狀態（中） | ✅ | 視窗大小/位置/maximized 記憶（`window-state.json`，含 off-screen 防護），resize/move/close 時儲存 |
| 檔案樹（中） | ✅ | 搜尋/過濾（命中自動展開）、.gitignore 尊重（`listDir` 解析並套用規則）、目前檔案高亮；改為逐目錄延遲載入（`openbuff:listDir`） |
| 活動時間軸（低） | ✅ | All / Tools / Agents / Errors 過濾 chips |
| 設定驗證（低） | ✅ | Base URL 格式檢查（http/https + 可解析）、每 provider 連線測試按鈕（呼叫 endpoint 顯示成功/失敗） |
| light 主題細節（低） | ✅ | 工具卡/卡片陰影、running 光暈、scrollbar 色、modal 陰影微調 |
| 效能（低） | ✅ | 長對話以 `content-visibility: auto` 跳過離屏行渲染；檔案樹逐目錄延遲載入（不再一次遞迴 4 層） |

### D.1 本次完成

| 項目 | 狀態 | 說明 |
|---|---|---|
| 三欄架構 + 收闔按鈕 | ✅ | 維持「左側欄 / 中間對話 / 右側欄」；topbar 兩端各一個收闔按鈕，開闔為漸進式動畫（width transition） |
| 左側欄導覽 | ✅ | New Task / Search / Projects（新增按鈕 + 歷史專案與任務，持久化）/ 底部 Settings |
| 右側欄 tabs | ✅ | 頂部 2 個 tab：檔案樹、Agent 活動與 Diff；內容顯示於右側欄內部（依使用者確認） |
| Composer 升級 | ✅ | 新佔位文字、Attach files/folder 按鈕、model selector、reasoning level selector、token usage 圖像化（context_window used/max 進度條 + finish totalCost 累計成本） |
| `/` skills 與 `@` files | ✅ | 掃描 `.agents/skills` / `.claude/skills`；選取後注入 SKILL.md / 檔案內容（比照 CLI 行為） |
| Provider 設定重寫 | ✅ | 每 provider 獨立加密 API key（safeStorage/DPAPI，重啟保留）；每 provider 可有多個模型（可自 endpoint 拉取）；可新增任意多個 OpenAI 相容 provider（apiKeyEnv 自動去重） |
| 工具卡片 | ✅ | 完成/失敗後自動展開，tool_result 實際輸出文字帶入 UI（不再只剩一條線和空白） |
| 原生 Windows 標題列 | ✅ | 依使用者要求恢復原生標題列，移除 frameless overlay / titleBarStyle hidden |
| 圖示更新 | ✅ | New Task＝筆＋記事本、新增專案＝資料夾＋號、歷史專案＝資料夾（展開變開啟資料夾）、左側欄/歡迎畫面＝App icon SVG |
| Search | ✅ | 同時搜尋對話訊息與檔案名稱；點檔案結果自動開啟右側欄 File Tree 並高亮；訊息結果捲動＋閃光高亮 |
| UI 語言 | ✅ | 全 UI（含 main process 錯誤訊息、dialog 標題、預覽模擬資料）統一為英文，`src/` 經 ripgrep 驗證零殘留中文字元 |
| 其他細節 | ✅ | 移除左側欄頂端 OpenBuff logo 列、移除「切換專案」按鈕、預設左開右闔、toggle 按鈕透明化、Search/Projects 去深色高亮、對話框文字垂直置中 + Shift+Enter 換行 + 隨行數自動擴展（上限 184px） |

### D.2 C.3 清單異動

| 原清單項目 | 異動 |
|---|---|
| 模型路由 UI（C.3） | 部分完成：全域 model selector 與 reasoning effort selector 已實作；per-agent 模型路由仍待做 |
| 中斷恢復（C.3） | 待做（SDK 提供 checkpoint / resumeInterruptedTurn） |

### D.3 下一個動作（更新）

1. C.2 全數完成。下一步：C.3 剩餘項目（diff 接受/還原已做、per-agent 模型路由、`/init` 自訂 agents、codebase index 視覺化、中斷恢復）
2. 使用者提供 API key 後完成第一個真實指令的端對端驗證（含 web_search、followups）

## 附錄 E：進度更新（2026-08-18 晚間）— Revert 流程與訊息操作 UX 最佳化

依使用者反饋完成三項 UX 調整：訊息操作按鈕移出訊息框、Revert 流程不再卡頓、Revert 後原訊息保留在輸入框供修改。`npm run typecheck` 通過，瀏覽器預覽模式（vite :5199）已實測完整流程（點 Revert → 應用內確認 → 訊息回填輸入框 → 立即打字）。

### E.1 本次完成

| 項目 | 狀態 | 說明 |
|---|---|---|
| 訊息操作按鈕移至訊息框外 | ✅ | 使用者與助手訊息的 Copy / Revert 按鈕不再位於氣泡框內，改為訊息框下方、框外的動作列（`.msg-stack`），滑鼠靠近訊息時浮現 |
| Revert 確認改為應用內視窗 | ✅ | 移除會阻塞畫面的原生 `window.confirm`，改為應用內確認 modal（列出將還原的檔案清單，並說明原訊息會保留在輸入框） |
| Revert 即時回應 | ✅ | 確認後立即更新畫面：移除該輪對話、訊息放回輸入框並自動聚焦；檔案還原改以 `Promise.all` 並行執行（原為逐檔依序 `git checkout`，檔案多時明顯卡頓），期間顯示「Reverting N file(s)…」進度通知 |
| Revert 後訊息回到輸入框 | ✅ | 最後一則使用者訊息以未送出狀態保留在 Composer（游標自動定位至文字末端），可直接修改後重新送出；通知文字同步改為「Your original message is back in the input box — edit and resend.」 |

### E.2 後續

- C.3 剩餘項目（per-agent 模型路由、`/init` 自訂 agents、codebase index 視覺化、中斷恢復）維持不變。打包/發佈規劃延後至 UI 優化與整體 review 完成後再執行。

## 附錄 F：進度更新（2026-08-18 深夜）— C.3 剩餘項目：Per-agent 模型路由、中斷恢復、自訂 Agents

依 D.3 行動清單實作 C.3 剩餘項目（`npm run typecheck` 與 `npm run build` 皆通過，瀏覽器預覽模式已實測 Agent Routing 新增/移除/儲存與 Custom Agents 面板）。

### F.1 本次完成

| 項目 | 狀態 | 說明 |
|---|---|---|
| Per-agent 模型路由（C.3） | ✅ | Settings 新增「Agent Routing」區：將任一 agent（含 46 個 bundled agents 與自訂 agents）路由到特定 model + reasoning effort；持久化於 app settings，寫入 openbuff.json 的 `agents[agentId]` 與 `agentReasoningEfforts[agentId]`（SDK 原生支援的 per-agent 路由欄位）；儲存前驗證 model 存在於 provider 清單 |
| 中斷恢復（C.3） | ✅ | 接入 SDK `onCheckpoint`（每 ~30s 將 mainAgentState 以 temp+rename 原子寫入 `${taskId}.checkpoint.json`，供崩潰復原）；runPrompt 支援 `resumeInterruptedTurn`；run 結束時回傳 `interrupted`（output type = error）旗標；聊天區新增 Resume / Discard banner——Stop 或 API 失敗後進度與對話保留，可一鍵續跑（SDK 不會重複 append user prompt）或捨棄；重開歷史任務時若 runState 為 error 型態同樣顯示 Resume |
| `/init` 自訂 agents（C.3） | ✅ | 從 `~/.agents` 與 `<project>/.agents` 載入 agent 檔案（`.ts/.tsx` 以 `typescript5` 的 `transpileModule` 轉譯至暫存目錄後交由 SDK `loadLocalAgents` 動態 import；`.js/.mjs/.cjs` 直接載入）；單檔失敗僅記錄錯誤不阻斷；合併順序與 CLI 一致（專案 > home > bundled，同 id 覆蓋）；自訂 agent id 自動加入 base2 的 spawnableAgents 使其可被 spawn；Settings「Custom Agents」面板顯示已載入 agents 與驗證錯誤（附 Reload 按鈕） |
| 依賴調整 | ✅ | `typescript@7`（原生版）無 JS transpile API，以別名新增 `typescript5@npm:typescript@^5.9` 作為執行期轉譯器（typecheck 仍用 TS7） |

### F.2 C.3 清單最新狀態

| 原清單項目 | 狀態 |
|---|---|
| 模型路由 UI（C.3） | ✅ 完成（全域 model/effort selector + per-agent 路由） |
| `/init` 自訂 agents（C.3） | ✅ 完成（`.agents/` 載入 + 合併 + 管理面板 + 互動式建立 wizard） |
| 中斷恢復（C.3） | ✅ 完成（checkpoint 持久化 + resumeInterruptedTurn + Resume banner；應用程式層 crash-recovery 重啟流程待 E2E） |
| codebase index（`query_index`）視覺化（C.3） | ✅ 完成（query_index 結構化事件經 IPC 傳遞，右側 Codebase Index 顯示查詢、狀態、排名結果與關聯檔案；可展開並開啟檔案） |

### F.3 下一個動作（更新）

1. 使用者提供 API key 後完成第一個真實指令的端對端驗證（含 query_index、web_search、followups、Stop→Resume 流程）
2. Codebase Index 背景自動更新與手動重建控制（後續 UX 打磨）

---

## 附錄 G：進度與架構修正（2026-08-19）— 檔案寫入與工具暴露機制（關閉 PTD）及 Harness 審批整合

在端對端測試過程中，發現 LLM 在處理寫入任務（如 `"Write a joke and save as .txt"` 或中文提示詞）時回報「沒有權限寫入檔案」，並在嘗試透過終端指令寫入時被拒絕。經深入原始碼調查，已完成架構層級的修復與對齊。

### G.1 問題診斷與根本原因

| 故障現象 | 根本原因 |
|---|---|
| 1. `Tool write_file is not available for agent base2`（主 Agent 找不到檔案修改工具） | **Progressive Tool Disclosure (PTD) 機制**：`base2` 原生啟用了 PTD，第一輪工具列表僅包含 CORE 層（唯讀 + `spawn_agents`）。要解鎖含 `edit_transaction` 的 IMPLEMENT 層，第一輪僅依賴一組硬編碼 Regex：`/\b(?:implement|fix|refactor|update|create|add)\b/i`。若使用者使用 `write`、`save`、`make` 或任何非英語（如中文）指令，PTD 無法識別意圖，導致編輯工具被隱藏。 |
| 2. `Command denied by harness approval policy: Approval receipt validation failed.` | **缺少 `requestApproval` 與 `approvalMode`**：桌面端建立 `OpenbuffClient` 時未傳遞 `requestApproval` 回調與 `approvalMode`。SDK 在需要審核終端指令（如 `basher`）時，因無回調直接回傳拒絕。 |

### G.2 關閉 Progressive Tool Disclosure 並還原完整 Tool Surface 的原因與依據

1. **PTD 的本質是 Token 優化而非安全邊界**：
   - 深入 `base2.ts` 與 `tool-tiers.ts` 可知，PTD 的原意是在純閱讀/查詢場景減少傳給 LLM 的 Tool JSON Schema 數量以節省 token。但其第一輪解鎖僅靠 6 個英文動詞匹配，存在嚴重的**假陰性**（常見寫入動詞如 `write`/`save` 與所有多語系輸入皆無法命中）與**假陽性**（如 `"create a summary"` 屬純讀取卻會解鎖寫入工具）。
   - 真正的安全與行為紀律在 OpenBuff 體系中是由 System Prompt（"Understand first, act second"）與 Harness Approval 策略所控管。
2. **還原原生完整工具表面（Full Tool Surface）**：
   - 在 `patchBundledAgents` 中，將 `base2` 及其變體的 `programmaticConfig.progressiveToolDisclosure` 設為 `false`。
   - 同時讀取 `def.programmaticConfig.fullToolSurface`，將其完整賦予 `toolNames`。這完全符合 OpenBuff 原始碼中 `resolveModelToolNames({ progressiveToolDisclosure: false })` 的標準行為，保證工具集 100% 符合官方原生定義。

### G.3 Harness 審批機制 IPC 整合（與 CLI AskUserBridge 一致）

1. **配置 `approvalMode`**：自 `loadSettings()` 讀取使用者設定（`balanced` / `strict` / `allow-all`）傳入 `OpenbuffClient`。
2. **實作 `requestApproval` 橋接**：
   - 當 SDK 攔截到需要審批的操作時，Main Process 透過 `approval_request` IPC 事件發送至 Renderer。
   - UI 在輸入框上方彈出審批 Banner（Allow / Deny）。
   - 行為完全比照 OpenBuff CLI 原生 `AskUserBridge`：**無限期等待使用者確認**（不設定任何自動超時），直到使用者主動點擊或按 Stop 中斷。

---

## 附錄 B：驗證紀錄（2026-08-17）

| 檢查項 | 結果 |
|---|---|
| 官方建置腳本包含 Windows 目標 | ✅ `win32-x64` 映射存在 |
| SDK 依賴皆純 JS/WASM | ✅ tree-sitter-wasm / quickjs-wasmfile |
| SDK Node 相容 | ✅ engines: `>=18.0.0` |
| 授權可商用 | ✅ Apache-2.0 |
| 無雲端後端綁定 | ✅ local-first / BYOK |
| 官方無桌面版 | ✅ 僅 CLI（+ 上游 VS Code 擴充） |

---

## 附錄 H：進度更新（2026-08-19）— Codebase Index 視覺化完成與端對端真實 API 全流程驗收通過

已完成 Codebase Index（`query_index`）視覺化整合，並執行端對端真實 API 全流程驗收測試腳本（`npm run test:e2e`），驗證實體模型呼叫、多 Agent 協作、工具讀寫、檔案實際變更與中斷還原。

### H.1 E2E 驗收測試項目與結果

| 測試階段 | 驗證項目 | 實測結果 | 說明 |
|---|---|---|---|
| **Stage 1** | 設定與 DPAPI 解密 | ✅ **PASS** | 成功透過 Electron `safeStorage` 解密 Provider API Key 並產生合規之 `openbuff.json` 配置。 |
| **Stage 2** | 自訂 Agent 掃描 | ✅ **PASS** | 掃描 `.agents/` 檔案與轉譯管線運作正常。 |
| **Stage 3** | 工具表面與 PTD 關閉 | ✅ **PASS** | `base2` 成功暴露 Full Tool Surface（含 `edit_transaction`、`web_search`、`read_files` 等），PTD 規則已關閉。 |
| **Stage 4** | 真實 LLM 任務執行與檔案變更 | ✅ **PASS** | Agent 自主排程多輪操作：`read_files` → `list_directory` → `edit_transaction` 成功寫入 `src/calculator.js`（新增 `pow(a, b)` 函數）→ 自動生成 `basher` 與 `code-reviewer` 子 Agent 審查程式碼。 |
| **Stage 5** | Codebase Index 數據解析 | ✅ **PASS** | `query_index` 數據結構與 `CodebaseIndexPanel.tsx` 視覺化元件（含 `results`、`symbols`、`headings`、`snippets`、`relatedFiles`）完全相容。 |
| **Stage 6** | 狀態清理與還原 | ✅ **PASS** | 驗收完成後自動還原測試檔案，工作目錄維持乾淨狀態。 |

---

*本計畫書基於 2026-08-17 的公開資訊撰寫，2026-08-18 新增附錄 D、E、F，2026-08-19 新增附錄 G、H、I。OpenBuff 為活躍開發中的專案，正式開發前請重新確認版本與上游變更。*

---

## 附錄 I：進度更新（2026-08-19）— `/init` 視覺化 Agent 建立精靈

已完成 P2 `/init` 視覺化 Agent 建立精靈，將原本需要直接編寫 `.agents/` 檔案的流程整合到桌面 UI。精靈產生的檔案可由現有 local-agent loader 掃描、轉譯、驗證，並在下一次 agent run 時合併到 bundled agents。

### I.1 本次完成

| 項目 | 狀態 | 實作說明 |
|---|---|---|
| `/init` 入口 | ✅ | Composer 的 `/` slash menu 新增 `init`；Settings → Custom Agents 新增 Create Agent 按鈕；直接送出 `/init` 也會開啟精靈 |
| Identity 步驟 | ✅ | 顯示名稱、全小寫 agent ID、spawner description、project/home scope；自動產生合法 slug |
| Behavior 步驟 | ✅ | 編輯 system prompt、instructions prompt，並選擇 `read_files`、`list_directory`、`query_index`、`edit_transaction`、`basher`、`web_search` 等工具能力 |
| Review 步驟 | ✅ | 顯示儲存位置、agent 摘要與即將寫入的完整 TypeScript definition |
| Agent 檔案建立 IPC | ✅ | 新增 `openbuff:createLocalAgent`，安全寫入 `<project>/.agents/<id>.ts` 或 `~/.agents/<id>.ts`；阻擋非法 ID、重複檔案與無法存取的專案路徑 |
| UI 動效與響應式版面 | ✅ | 左側進度軌、內容切換動畫、能力選取狀態與窄視窗單欄 fallback |

### I.2 使用流程

1. 開啟專案後，在 Composer 輸入 `/`，選擇 `init`；或從 Settings → Custom Agents → Create Agent 開啟精靈。
2. 選擇 Focused specialist、Code reviewer、Documentation writer、Test analyst 模板，或從空白 specialist 開始。
3. 編輯 agent identity、system prompt、工作指令與工具能力。
4. 在 Review 步驟確認 TypeScript definition，按 Create Agent。
5. 回到 Settings 的 Custom Agents 按 Reload；agent 會在下一次任務執行時載入並可由 `base2` spawn。

### I.3 驗證結果

| 驗證項目 | 結果 |
|---|---|
| `npm run typecheck` | ✅ PASS |
| `npm run build` | ✅ PASS |
| `git diff --check` | ✅ PASS |

### I.4 後續工作

1. 既有 custom agent 的 UI 編輯與刪除操作。
2. Codebase Index 背景自動更新與手動重建控制。
3. electron-builder NSIS / Portable 打包、自動更新與 Windows 發佈驗證。

## 附錄 J：進度更新（2026-08-19）— P2 APP 整體 Review 與邊界情境極端案例加固完成

已完成 P2 邊界情境與極端案例之全面審查、加固與自動化驗收測試（`npm run test:edge` 通過率 100%）。

### J.1 本次完成項目

| 分類 | 加固項目 | 實作說明 |
|---|---|---|
| **行程與生命週期** | 單一執行個體鎖定（Single Instance Lock） | `app.requestSingleInstanceLock()` 阻擋多開；`second-instance` 事件自動將既有視窗還原並聚焦，保護 DPAPI 與設定檔寫入安全。 |
| **行程與生命週期** | 全域未捕捉異常攔截（Global Error Traps） | 新增 `process.on('uncaughtException')` 與 `process.on('unhandledRejection')` 防護，防止行程無聲崩潰。 |
| **行程與生命週期** | 應用程式退出防護（Clean Exit on Quit） | `before-quit` 與視窗 `close` 事件中主動呼叫 `abortRun()`，安全終止進行中子行程與任務。 |
| **視窗與螢幕** | 多螢幕離屏保護與寬高 Clamp | `loadWindowState` 計算全螢幕最大工作區寬高，防止螢幕拔除或解析度降級後視窗溢出可視範圍。 |
| **輸入法 UX** | Windows CJK 輸入法選字防護 | `Composer.tsx` 的 `onKeyDown` 加入 `e.nativeEvent.isComposing \|\| e.keyCode === 229` 判斷，杜絕繁簡中文/日文選字按 Enter 時誤將未完成訊息送出或誤觸 slash 選單。 |
| **檔案系統安全** | Git Revert / Accept 路徑穿越防護 | `gitRevertFile` 與 `gitAcceptFile` 嚴格驗證路徑在 `cwd` 之內，徹底杜絕刪除或變更專案外檔案之風險。 |
| **檔案系統安全** | Windows DOS 保留檔名防護 | `createLocalAgent` 阻擋 `con`, `prn`, `aux`, `nul`, `com1`-`com9`, `lpt1`-`lpt9` 等保留名稱。 |
| **檔案與內容安全** | 二進位檔案預覽防護 | `readProjectFile` 增加首 512 bytes null-byte 檢測，防止二進位檔案以純文字載入造成畫面凍結。 |
| **檔案與內容安全** | 大型 Diff 截斷保護 | `parseDiff` 對單檔超過 2,000 行之變更進行截斷並提示，並支援 `Binary files ... differ` 解析。 |
| **安全性** | 外部連結防護 | Markdown 與 Web 搜尋結果之外部連結一律套用 `target="_blank"` 與 `rel="noopener noreferrer"`，防止 reverse tabnabbing。 |
| **任務狀態持久化** | Task ID 格式驗證與 Checkpoint 原子重試 | IPC 端點驗證 TaskId 格式，且 Checkpoint 寫入支援 Windows 檔案鎖定重試機制。 |

### J.2 驗證結果

| 驗證項目 | 結果 | 說明 |
|---|---|---|
| `npm run typecheck` | ✅ PASS | TypeScript Node & Web 端型別檢查 100% 通過 |
| `npm run build` | ✅ PASS | Vite SSR Main、Preload 與 Renderer 打包編譯無警告 |
| `npm run test:edge` | ✅ PASS | 包含 Windows 保留名稱、Git 路徑穿越、二進位檢測、TaskId 驗證、Markdown 連結安全 5 大自動化測試全部 PASS |

---

## 附錄 K：進度更新（2026-08-19）— 非 Git 專案/任務之 git_status 自動注入重複報錯與 Gating 抑制最佳化

已徹底解決非 Git 專案或純對話/非代碼任務中，底層 runtime 每輪自動注入 `git_status` 導致頻繁噴出 `fatal: not a git repository` 錯誤、LLM 上下文膨脹、無回應崩潰與 UI 紅字橫幅報錯之問題。

### K.1 問題診斷與根本原因

| 故障現象 | 根本原因 |
|---|---|
| 1. 非 Git 目錄任務中頻繁出現 `{"errorMessage":"fatal: not a git repository..."}` | **Runtime 每輪自動注入 `git_status`**：`base2` / `specialist` 等 Agent 在每一步驟開始/結束時會自動調用 `git_status` 觀察變更。在非 Git 專案中，`git` 指令以 exit code 128 失敗。 |
| 2. `applyGitStatusGate` 未能抑制重試錯誤 | **Fingerprint 缺少 `status` 欄位**：原 SDK `git-status.ts` 在非 0 exit code 時回傳 `{ errorMessage: stderr }` 而未帶 `status` 欄位。而 `applyGitStatusGate`（`sdk/src/run.ts`）的指紋比對依賴 `status` 字串，導致錯誤輸出每次都被視為新內容並重新塞入 LLM context，引發 Token 消耗、循環或 `No response from agent` 崩潰。 |
| 3. UI 呈現紅色報錯橫幅 | **UI 元件渲染 `errorMessage`**：CLI / Desktop 的 `GitStatusComponent` 只要檢測到 `output.errorMessage` 即以紅色錯誤文字顯示，造成使用者體驗困擾。 |

### K.2 修復方案與實作細節

1. **SDK 層錯誤語意平滑化（`sdk/src/tools/git-status.ts`）**：
   - 針對 `not a git repository` 錯誤，不再回傳 `errorMessage`，改為回傳標準結構 `{ status: 'Not a git repository.' }`。
   - 針對其他非零 exit code，回傳 `errorMessage` 同時附加 `status: ''`，確保 `applyGitStatusGate` 能正確計算指紋。
2. **自動去重與 Gating 觸發**：
   - 第一次執行時回傳 `status: 'Not a git repository.'`，告知 LLM 當前目錄非 Git 倉庫（UI 以一般靜態樣式顯示）。
   - 後續同 turn 的重複 `git_status` 自動被 Gating 機制攔截，轉為 `{"unchanged": true, "note": "Worktree is byte-identical..."}`，徹底消除上下文污染與 UI 重複干擾。
3. **編譯產物同步（Build Artifacts Rebuild）**：
   - 重新建置 `@openbuff/sdk`（`bun run build`），產出更新後之 `dist/index.cjs` 與 `dist/index.mjs`，使 Electron 桌面端（`openbuff-desktop`）完整載入最新邏輯。

### K.3 驗證結果

| 驗證項目 | 結果 | 說明 |
|---|---|---|
| 非 Git 目錄純對話任務測試（如 `"tell a short story"`） | ✅ **PASS** | 成功回傳 `{"unchanged": true}` Gating 提示，故事文字流暢生成，無任何紅字報錯或無回應情況。 |
| SDK 單元測試（`git-status.test.ts`、`run-git-status-gate.test.ts`） | ✅ **PASS** | Gating 與錯誤指紋測試 100% 通過。 |

---

## 當前開發順序（2026-08-19 更新）

1. ~~**APP 整體 Review 與邊界情境檢查**（跨平台視窗狀態、極端情況防護）~~（✅ 已完成，見附錄 J）
2. ~~**非 Git 任務環境穩定性加固**（`git_status` Gating 抑制與編譯產物同步）~~（✅ 已完成，見附錄 K）
3. **打包與發佈準備**（electron-builder NSIS / Portable、簽章評估、自動更新）

GitHub 相關設定與打包發佈規劃已從近期待辦事項中移除，待上述階段完成後再重新規劃。
