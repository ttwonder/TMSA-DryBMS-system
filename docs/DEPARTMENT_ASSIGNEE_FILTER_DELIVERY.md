# 涉及部門 → 執行跟進人候選篩選：本機交付

## 範圍及候選

基準 `897517d7a143196de0f2ee08c3569f0c6521a683`；開始時 working tree/index clean。本批由單一 writer 在唯一既有 repo 修改，父流程已核對9檔候選、225項source/test/config輸入與154組證據雜湊，按驗證後的獨立本機commit交付；**不push或操作正式SQL**。精確commit／tree另記於 ignored `qa-evidence/department-assignee-filter/local-delivery-receipt.json`。

實測：317單測通過；82個原App＋本機native案例通過，完整涵蓋13個mounted入口；12個既有輸入回歸通過，另已核對typecheck、build與公開產物檢查。全部為合成資料、本機原生PostgreSQL／HTTP adapter；正式Supabase／Pages仍待使用者部署及驗收。

產品只新增 `src/departmentAssignees.ts` 的純候選投影，並接至三個既有頁面的四處選項來源。保持原多選、標籤、欄位順序、樣式及保存方式。`Improvements` 的 `useMemo` 納入當前部門、已選ID、名冊、語言；一般文字輸入仍不逐鍵重建不相關選項。

- 單部門：該部門啟用人員；多部門：聯集，stable person ID去重，同名不同ID不合併。
- 未選部門：延續原 `peopleOptions`「全部啟用人員」語義。無匹配：維持原空選項，沒有fallback。
- 只篩候選，不自動選人、清人或改寫payload。角色不參與部門歸屬判斷。
- 已選範圍外者仍可見、可手動取消，附「不在目前涉及部門，請核對」／`Outside current departments; please check`。停用者附停用提示，缺名冊者保留原ID及核對提示；只保留既選、不擴大新選權限。取消後不合格人員即不再出現。
- 清空部門、更換部門、名冊正常刷新不清草稿人員。原手動保存／取消及伺服器驗證不變。

## 完整 mounted 入口盤點

正式路徑：`index.html:2 → src/main.tsx:6 → src/App.tsx:25`。下表為本批候選版本行號；基準對應欄位在 FrameworkPage:60、Improvements:98/248/255、Inspections:186。

| caseID前綴 | UI入口 | production 接線／共用元件 |
|---|---|---|
| `list-create` | 待改善項目 → 新增改善 | `Improvements.tsx:210,249` → memo(MultiSelect)，候選:99 |
| `list-full` | 待改善項目 → 完整編輯 | `Improvements.tsx:237,249` → 同上 |
| `list-progress` | 待改善項目 → 直接更新 | `Improvements.tsx:237,256` → MultiSelectDropdown，候選:99 |
| `TMSA-assessment` | TMSA → 修改自評 | `FrameworkPage.tsx:38,61` → MultiSelectDropdown |
| `DRYBMS-assessment` | DRYBMS → 修改自評 | `FrameworkPage.tsx:38,61` → 同上 |
| `TMSA-create` | TMSA細目 → ＋增加 | `FrameworkPage.tsx:76,90` → Improvements inline → :249 |
| `DRYBMS-create` | DRYBMS細目 → ＋增加 | 同上 |
| `TMSA-full` | TMSA細目 → 改善標題 → 完整編輯 | `FrameworkPage.tsx:77,90` → `Improvements.tsx:242,249` |
| `DRYBMS-full` | DRYBMS細目 → 改善標題 → 完整編輯 | 同上 |
| `TMSA-progress` | TMSA細目 → 更新 | `FrameworkPage.tsx:81,90` → `Improvements.tsx:256` |
| `DRYBMS-progress` | DRYBMS細目 → 更新 | 同上 |
| `history-TMSA-create` | 歷史TMSA → 查看 → 缺陷／改善建議 → 建立改善 | `Inspections.tsx:181,185–187` → MultiSelect |
| `history-DRYBMS-create` | 歷史DRYBMS → 查看 → 缺陷／改善建議 → 建立改善 | 同上 |

每個入口各有 `-single-department`、`-union-empty-retention-removal`、`-cancel-zero-write`、`-save-native-peer-reopen` coverage。後者包含原UI手動保存、native實際IDs/版本、未變欄位/其他記錄、不同使用者第二客戶端原10秒sync回應，以及重開表單。機器證據逐入口保留實際saved IDs，不只統計總數。

共用控制 `src/ui.tsx:7–8` 與其CSS原封不動；沒有把原多選換成單選。新增投影不使用effect、不呼叫API、不寫storage。全部選人寫入仍由原 `useRecordEditor`／lease／CAS／操作ID／ACK／pendingUnknown流程執行。

### 有意排除的消費點

- `FrameworkPage.tsx:33` 左側部門查詢、`Improvements.tsx:220–222` 清單部門／人員查詢、`Overview.tsx` 統計篩選：是查詢，不是責任分工編輯。
- `Management.tsx:244–245,270,273` 名冊篩選、人員部門管理與Item部門定義：不是執行人指派，不改角色或名冊管理語義。
- `FrameworkPage.tsx:61,78–79` 閱讀態責任分工及細目表、改善詳情／事件、Overview重點及reports：保持既有顯示。
- Overview／歷史「查看既有改善」連回同一主清單詳情，不是新可編輯候選來源；完整編輯使用已列入口。
- 改善結案／重開視窗沒有可編輯部門／人員欄位，不新增欄位。
- `src/reports.ts`、所有SQL 001–015及readback、GM資料投影、API、sync、useRecordEditor、評分、歷史原文、public資產及套件/config不變。

## 驗證及證據等級

**真實UI＋測試資料；owned本機native PostgreSQL／HTTP adapter；不是正式Supabase／Pages驗收。** 沿 `scripts/qa-server.mjs`、`scripts/native-postgres.mjs` 建立獨立cluster，安裝既有migration到015。合成人員用既有角色與RPC建立，沒有放寬權限；瀏覽器注入本機生成的已授權session，故不是正式登入UI／憑證驗收。外部網路請求被阻擋，正式資料未接觸。

### 行為 RED → GREEN

- 修改production前，原App的13個入口均實際勾選海技組；未選的船工處人員仍顯示，`expected 0 / received 1`。完整RED：`qa-evidence/department-assignee-filter/red-2026-10-20T21-10-51.702Z/receipt.json`。非missing-helper/API RED。
- 三個頁面接線後，同一組13個斷言轉GREEN：`green-2026-10-20T21-13-50.299Z/receipt.json`。後續補鄰接案例，未再修改production實作。
- 單元 `DA-U01–DA-U10`：單／多部門去重、同名穩定ID、無部門／無匹配、已選範圍外、移除、停用／缺名冊、refresh與輸入不變。缺名冊legacy ID僅純投影層測試，不以無效參照擴權或繞過native validator。
- Mounted/native runner：上述全入口矩陣；四種共享表單名冊跨部門refresh時same-node文字稿／勾選保留；清空部門手動保存不清人、明確移除後保存重開不重現；原inspection全文／事件及其他欄位精確比對。
- Layout：繁中／英文、1440／390px，兩框架自評、完整編輯、進度及歷史建立；開啟原dropdown，檢查候選及保留選取尾端。原picker自身高度／捲動不改；尾端截圖另附`-retained`。量測整頁寬、控制邊界和標籤換行；不是重新設計或pixel-perfect宣稱。
- GM僅做TMSA／DRYBMS唯讀責任分工、無備註／改善／編輯控制，以及歷史無建立改善入口。報表source及build輸入來源hash不變；不重跑本批未觸及的整套GM PDF／Excel下載。

所有最終數量、唯一caseID、命令exit code、完整log及SHA256、起訖input hashes、screenshots、SQL/native讀回、失敗harness處置與cleanup，以 ignored `qa-evidence/department-assignee-filter/handback.json` 為機器權威；早期失敗不覆蓋、不得把局部PASS當完整PASS。

### 可重跑

在唯一repo執行；需既有Node、Chrome與native PG runtime，不能提供正式DB連線：

```bash
node --experimental-strip-types --test tests/department-assignees.test.ts
node scripts/verify-department-assignees.mjs
node --experimental-strip-types scripts/verify-improvement-input.mjs
npm test
npm run typecheck
npm run build
node scripts/verify-public-artifacts.mjs
```

`--baseline`模式只收集同一原UI斷言，**不切換／還原source**；歷史RED已綁定基準production bytes，不可在修正後樹跑baseline再宣稱原版本RED。每次run建立獨立timestamp資料夾，不覆蓋舊結果。

### Harness修正紀錄及限制

保留初次歷史建立按鈕名稱錯誤、Playwright `uncheck()`等待已移除節點、英文Close同名兩控制、textarea既有內容影響exact label、重開未等待lease完成等失敗receipts。既有 `verify-improvement-input.mjs:75` 原本只選管理組卻再選海技組操作員，新規則下該人正確缺席；已用失敗截圖確認，僅在原測試明確勾選海技組作為合法前置，不改其原輸入效能／IME／保存斷言。僅修harness定位／等待／有效前置，未改product權限／保存行為來滿足測試。最終命令與receipt綁定當前source/test/config bytes；若廣域input清單中有不被該runner載入的獨立測試或文件後改，handback逐檔列出並由其後適用gate核驗，不偽稱所有舊hash相同。

本批不測正式Supabase Auth／PostgREST／Pages，不新增SQL、不測與變更無關的全部下載，亦不更動原lease/CAS/未知ACK協議。已授權native本機結果不代表正式網站已部署。一次有限自檢只處理本批可重現問題。

全部cluster、測試資料、screenshots、log與本機工作計畫保留；僅關閉自己owned browser／HTTP／PG並驗證port關閉，不操作使用者Chrome／Excel。`.git/info/exclude`及既有本機工作計畫原樣保留。子流程以未stage候選交回；父流程核對來源、實測紀錄及代表性桌面／手機截圖後建立獨立本機commit。交付文檔的最終狀態文字更新單獨記錄，未改已通過測試的產品或runner bytes。
