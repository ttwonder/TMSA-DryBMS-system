# 保存／同步／Excel／PDF 本機交付

## 範圍與界線

本次是既有平台的內部性能及報告修正，保留原七頁導航、角色、公司進站、單筆租約／CAS、operation receipt、原子保存、來源／歷史及凍結計分。不是重新初始化或更換儲存架構。

- **保存**：伺服器 ACK 即更新同筆權威狀態、關閉成功流程；lease release／背景同步不阻塞成功。背景讀取失敗不改稱保存失敗；未知寫入結果保留草稿與 operation ID，不能假成功。
- **同步**：共用 singleflight、session／actor／API／epoch fence、版本單調合併；暖同步只傳變動正文，版本與已快取正文雙向完整。首載歷史用明確 `ReadonlyInspectionSummary`／`FrozenInspectionScoring`，cycles／provenance 傳權威 counts，不以空陣列冒充完整資料。
- **歷史**：查看／修訂／來源改善按需取得完整授權快照。拒絕晚到、錯版本／metadata／身份／API 或不完整回覆；不得用現行定義造歷史分數。
- **報告**：伺服器選取範圍內完整 snapshot；舊 overload 不改。Excel 保原模板、完整英文／繁中與同 Item 續列。PDF 長正文滿寬、短 metadata 合併多欄、合理續頁，正文 15pt、輔助至少 14pt；不縮字、不裁文。
- **PDF 字元**：僅顯示將 `U+0095`／`U+0099`／`U+009C` 代為真正 `U+2022 •`；來源、DB、Excel及凍結快照不改。可見箭頭、₂、U+2011／U+00AD 保原 Unicode，使用固定 OFL 補字型。不支持的其他字元仍拒絕，不能擴大替換。

## 已執行證據（本機，不是正式驗收）

| 層次 | 結果與實際覆蓋 |
|---|---|
| 整合候選 | 128/128 單元測試；typecheck／build exit 0 |
| 性能 native | 20/20 owned PostgreSQL；完整 detail、凍結分数／缺口、selected export、原子／audit及授權 |
| 原 App 既有 race／ACK | mounted races 9/9、ACK 2/2；輸入 byte manifest 已核對，非 hosted |
| 父端原 App＋native | 10/10：真 actor A→B→A 的晚到 detail；9 個原報告入口下載，含兩完整 XLSX、两框架明選分章 PDF、全部改善、兩歷史、兩總覽；每下載 audit 增量 1，九個業務集合讀回不變；零 pageerror／外部请求 |
| 七份完整 PDF | 七件實產、11,110 字段完整相等及幾何／字級／embedded outline／頁尾檢查通過，獨立碼點核對真正 • 和正常符號；代表頁已視覺檢視。兩框架全量 PDF 屬 builder 層，原 UI 層另驗明選分章，不混稱全量原 UI 下載 |
| Excel saved-file | 原入口兩件下載：TMSA 20 sheets／288 Items、DRYBMS 30 sheets／412 Items；7,000 完整語言字段、28,945 順序保存片段相等；OOXML、邊框、續列高度及 TMSA 模板樣式獨立核對 |

P4 同 fixture 的首載 sync 為 14,835,020 bytes／512ms → 3,481,383 bytes／190ms。這是本機單次比較，不是正式延遲或原 timeout 根因證明。PDF 全文保留來源及重複 provenance，資料很長；不能用刪原文或縮字減頁。DRYBMS 總覽同來源由 27 頁降為 12 頁。

保留所有 failed receipts：舊字型把 • 抽成 ·；整批 390 秒 controller 上限；Node 保守 Excel 字寬不能代替 Chromium Canvas。最後一項只修 QA oracle，原 UI／正文沒有為通過測試而改。

最終 review 的唯一 finding `EXPORT_PERSON_REFERENCE_COVERAGE` 已原生重現：非目前 assignee 的進度作者／結案人員雖仍存在於權威名冊，selected export 卻漏帶其姓名。最小修正只追加所選改善的 `events[].by`／`closedBy` 人員關聯；不擴大選取範圍、角色或可寫權。Native RED 保留（合法保存及原子匯出通過後，在姓名相等斷言失敗，壞 PDF 也已保存），修後 native 6 項＋原 App 實際下載 1 項 PASS；包含停用結案人仍顯歷史姓名、不恢復啟用、未選人員不帶入、空／錯／stale 選取零效果。獨立 saved-PDF 抽取確認修前 ID fallback、修後姓名。Native 全矩陣 20/20 已重驗；整體128 unit／typecheck／build於修後再驗。這是同一 finding 的有限 closure，不重開全平台 review。初次 probe 的 `INVALID_INTENT` 為測試錯用 `progress`，改回既有 `update`，該次不算產品 RED。

**尚未閉合的獨立項**：正式 `NETWORK_UNKNOWN` 的原始原因／復原，Microsoft Excel native 開啟（健康小控制亦拒絕 `0x800A03EC`），新 hosted SQL／PostgREST、多用戶正式保存與歷史／報告驗收。不得改 Office 安全設定強行通過，不盲重播未知匯出。

## 既有正式環境：只追加 005，再核驗，再由使用者 Push

舊人員／U1–U6／001–004已交付；使用者回報舊 SQL 全通過，舊 `34db712` Pages 已唯讀核對。**不重跑舊 SQL、Owner 初始化、office／業務 seed，不清 session／草稿。**

### 第一步：確認目標，再手動安裝

確認 Supabase Dashboard 是本平台專用的 **TMSA-DryBMS-system**，不是 Ship Dynamics／其他專案。使用經本機 commit raw blob 核對的 Preview，完整選取 **`supabase/migrations/005_performance.sql`** 的 readonly textarea，自己 Ctrl+C → 新 SQL Editor query → 貼上 → Run。助手不操作剪貼簿、不代貼／Run。005交易會檢查已安裝前身，新增 guarded `performance-v1` text overload，保留舊四／五／六參數 boolean 路由。

### 第二步：獨立唯讀 readback

另開新 query，完整複製 **`supabase/performance-readback.sql`** → Run。預期 status **`PASS_PERFORMANCE_ROUTE_INSTALL_ONLY`**，完整 **13** check keys 皆 true；initialized／imported／Owner及業務 counts 符合既有庫。這只證 catalog 安裝，不能當正式登入／下載已通過。安裝或讀回若錯誤、逾時、結果未知或不符，停止該步，保留 Results，勿重 Run 或繼續 Push。

### 第三步：使用者 Push，再核正式版本

只有第一／二步通過且本機交付 commit 已完成，才由使用者在 GitHub Desktop 已驗證的唯一資料夾按 **Push origin**。助手不 Push。核 exact-head Pages workflow success、正式 asset／頁腳 commit，再進行正常使用驗收；新前端依賴 005，不能先推而將 missing RPC 當使用者登入錯。

### 第四步：有限正式使用驗收

Owner／管理員／操作員各走正常登入；同筆互鎖／異筆保存、ACK即成功、background失敗仍保已提交；重開讀同版本；歷史完整查看／修訂及改善來源；明選報告與完整 Excel／PDF；確認 disabled user／未知結果保稿。正式任一異常先交叉核對画面、request action／phase、权威讀回、版本與快取，不盲重試。

## 本機重現與證據位置

`npm test`／`npm run typecheck`／`npm run build`；`qa:performance`、`qa:performance-native`、`qa:performance-races`、`qa:report-mounted`、`qa:report-fallback` 為分層檢查。原報告 UI 測試需明確 `REPORT_FIXTURE_PATH` 指向私有副本；身份由 native QA 生成，不能拿正式 session 或 credentials 代入。源正文、oracle、下載、network／native receipts 留在 ignored `qa-evidence/`，不入 Git／dist；發給使用者的私有包只收報告、精簡證據與 commit-bound SQL，不含身份、連線值或秘密。

瀏覽器 Excel 的 Canvas 字寬與 Node conservative fallback 會產生不同但完整的續列分段。saved-file oracle 要用 `verify-report-browser-plans.mjs` 從授權來源產生原 production `splitExcelBiText` 的真 Chromium 計畫，再以 `REPORT_BROWSER_PLANS=1` 執行 `verify-report-streams.mjs`；不能把保存的 cell 文本當 expected。
