# 章節導航四色及總覽指定文案移除

## 本批完成範圍

- TMSA 與 DRYBMS 左側章節名稱依整章所有啟用項目的已保存狀態顯示四種顏色。
- 空章，或任何項目尚未更新／尚未評定：紫色。
- 全部已更新後，至少一項不符合：紅色；沒有不符合但至少一項部分符合：黃色；全部更新且全部符合：綠色。
- 聚合優先序為紫 → 紅 → 黃 → 綠；重用原 `statusOf`，保留來源缺口對綠色的限制。
- 文字色碼精確沿用現有狀態燈：綠 `#268355`、黃 `#d3a03a`、紅 `#bc4747`、紫 `#8b62ae`。選取背景、章節字級、排序／收合、細目、導航尺寸及既有操作保持不變。
- 搜尋、級別、狀態及部門篩選只改可見導航，不縮小章節狀態判定集合。停用項目不計入有效章節集合。
- 草稿不改已保存章色；取消不改業務資料。原保存及權威讀回後，章節文字反映新狀態。
- 總覽中使用者逐字指定的計分／日期說明，以及對應英文，已移除。僅刪除顯示段落，不改公式、歷史、百分比、篩選或目標保存。原操作恢復提示仍保留。

## 尚未完成，不能混稱完成

1. **符合程度聯動已另批完成**：使用者明確選擇聯動。all→當次草稿 Y/N Yes，partial/none→No；兩欄在正常編輯都能選，保存核對期間暫時停用。僅原保存交易上雲，取消零業務寫入；來源缺口未解仍禁 all／Yes，後端 `YES_REQUIRES_ALL` 不變。本次先交付此聯動供使用者 Push，不混入 Excel。
2. **Excel 指定區塊延期**：使用者已補圖，定位每章 E2 的計分範圍／本章得分／快照及加高空白；其後明確要求先修聯動、先 Push，再改 Excel。未完成的 Excel 變更已私有保留 patch 並精確回復，本次 `src/reports.ts`、`tests/reports.test.ts` 與前一版逐字相同，不混入提交。
3. 正式站发布／使用驗收與原 006／007 安裝仍由使用者掌握。這兩項顯示修正不增加 SQL；沒有 Push 或正式 SQL 執行。本文件的本機驗證不能代正式驗收。

## 聯動批次的目前驗證與推送邊界

- 原 App 編輯 Yes／all 時下拉選單停用的真行為 RED 已保留；聯動修正後，原 App＋owned PostgreSQL 的 **33 個具名 checks 全 PASS**，含兩框架三選項草稿／取消、六次原保存／刷新讀回、未知評定驗證、來源缺口、不自動勾完成更新／改執行狀態／改正文、held COMMIT ACK 雙欄停用、第二人同筆鎖定，以及兩語言／1440與390的8組畫面和8個幾何checks。
- 完整 **145 unit PASS、0 FAIL、0 SKIP**；typecheck／build／公開產物22檔 PASS。原生業務及協作回歸 **25 checks 全 PASS**，保留來源缺口／Yes符合守衛、CAS、角色／Owner、多操作人、原操作恢復。
- receipt 綁定候選輸入 hash；自有 API／UI／PG 已關閉。這是本機原 UI＋合成資料，不是正式環境驗收。沒有新增 SQL、沒有 Push。
- 改動限兩個評定下拉控制及其測試／命令／文件；UI標籤、字級、排版、計分、API／SQL、角色和報告不改。這一批先交由使用者 Push；Excel待其後另批，不自行恢復。

## 先前章節色／文案批次的實際驗證

所有本機寫入僅限 owned PostgreSQL 與合成測試資料；不操作使用者瀏覽器或正式資料。

- 原 UI 行為 RED：整章全部更新全部符合，實際名稱色仍 `rgb(28,87,123)`（選取藍），期望現有綠燈 `rgb(38,131,85)`，斷言失敗。修前證據保留 `qa-evidence/chapter-navigation/navigation-red`。
- 指定文案 RED：原 UI `.calculation-note` 顯示段落數為 1，要求為 0；原完整斷言保留 `qa-evidence/chapter-navigation/note-red`。此階段章節四色相關檢查已通過。
- 新原 UI＋真實 PostgreSQL：**25 個具名 checks 全 PASS**，含 TMSA／DRYBMS、中英文、1440／390 的 8 組視窗及對應 8 個幾何 checks；其餘為狀態聚合、空章、搜尋／級別／狀態／部門篩選、唯讀零寫入、文案雙語移除、草稿／取消與正常原保存及刷新讀回。
- 新聚合 helper：11 項單元覆蓋全部符合、部分／不符合混合、未更新優先、缺少評定、未知評定、空章／停用、另一框架、原來源缺口限制、DRYBMS 百分比分離及投影不修改原資料。
- 全部單元 **145 PASS、0 FAIL、0 SKIP**；typecheck、build 皆 exit 0。
- 原公司目標保存 UI 回歸 **14 checks 全 PASS**，保留保存／刷新、角色、CAS 留稿、租約及原操作恢復，不因文案刪除受影響。
- 公開產物掃描 **22 files PASS**，未出版私有正文／來源或樣板註解。
- 已視覺檢查本機中文桌面 TMSA 與 390px 英文 DRYBMS 畫面；各矩陣實測章節字級仍 14px、文字色等於現有燈色、整頁無橫溢。
- UI 與目標回歸 receipt 的具名 checks、零正式請求、零 runtime errors、測試輸入 hashes 與自有 API／UI／PG 關閉，均以程式核對。

### 保留失敗，不能冒充全套舊 QA 通過

- 首次部門篩選測試誤選第一個部門（不是 fixture 的 marine）導致找不到章節；修正僅測試 locator，原失敗保留 `note-red-harness-department-mismatch`，不當成產品 RED。
- 額外執行舊 `qa:layout` 時，在登入後找導航逾時；**此舊 mock-only gate 仍 FAIL，不宣稱通過**。其 mock 只有 read、current_user 等舊 action，未支援目前 App 啟動所用 sync；App、API、該腳本與 fixture 都逐字等於修前 commit。其責任分工位置斷言亦屬舊版，不在本批重新改造全平台測試。
- 本批導航／總覽的真實原 UI、幾何、保存及公司目標回歸已透過 owned PostgreSQL 直接驗證，不以舊 mock gate 的失敗或舊截圖取代這些 current-tree 結果。完整 logs 及 exit codes 保留 `qa-evidence/chapter-navigation/final-gates`。

## 重現命令

```bash
npm test
npm run typecheck
npm run build
npm run qa:chapter-navigation
npm run qa:shared-targets-ui
node scripts/verify-public-artifacts.mjs
```

這是有限本機自查與可重現回歸，沒有另起全平台獨立 review；不宣稱全平台無缺陷、正式多人或原生 Microsoft Excel 已驗收。
