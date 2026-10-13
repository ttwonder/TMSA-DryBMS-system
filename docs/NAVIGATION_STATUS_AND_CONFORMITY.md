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

1. **符合程度三項直接選擇**：現行前端在 Yes 時固定 all，後端亦有 `YES_REQUIRES_ALL`。尚須使用者確認：選 all 時同步 Yes、選 partial/none 時同步 No（當次草稿），或兩欄獨立並修改後端驗證。詢問表單未有答案，不能視為同意；本批未改評定／保存規則。
2. **Excel 指定區塊刪除**：現有兩張附件分別是 App 導航及評定控制，不含 Excel 區塊。尚須補圖或提供工作表／欄位。不能猜測並刪除分數、快照、正文、佐證或來源；本批未改匯出產生器。
3. 正式站发布／使用驗收與原 006／007 安裝仍由使用者掌握。這兩項顯示修正不增加 SQL；沒有 Push 或正式 SQL 執行。本文件的本機驗證不能代正式驗收。

## 實際驗證

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
