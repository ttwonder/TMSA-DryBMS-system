# 逐項頁「初始化自評」交付及本機驗證

## 使用與界線

- TMSA／DRYBMS逐項頁右上角、Excel左側新增「初始化自評」；Owner可用，沿用原管理頁權限。原管理 → 系統／資料 → 一鍵重新開始保留。
- 按「確認初始化」只清除目前體系全部條目的完成更新勾選（含停用條目，不受目前篩選影響）。其他評定／自評／佐證／人員／執行狀態、改善、歷史、另一體系及DRYBMS百分比不變。TMSA現行分數、章節燈號依原規則重算。
- 目前有編輯草稿時先保存或取消；有人持有此體系Item編輯鎖時整批拒絕。確認前取消零寫入；未知結果只核對原操作。
- **沒有新增SQL。** 重用已存在的006批次命令、原hook及operation journal；未修改API、SQL、CSS、計分或管理頁。若既有006安裝未確認，先執行其既有唯讀readback，不盲目重跑安裝。上一批009的正式安裝／核驗仍是獨立待交接事項，不由本批本機PASS代替。
- 本機commit由助手完成；Push／Pages／正式資料操作由使用者決定。本次沒有操作正式Supabase或清除任何正式勾選。

## 可重現命令與結果

| 命令 | 實際結果 |
|---|---|
| `npm test` | 174 PASS、0 FAIL，包含實際PDF／Excel builders的原回歸 |
| `npm run typecheck` | PASS |
| `npm run build` | PASS；既有reports.ts靜態／動態import混用提示保留，不展開打包改造 |
| `npm run qa:framework-initialize` | 10個原App＋本機PostgreSQL案例PASS；安裝001–009完整鏈 |
| `npm run qa:restart-updates` | 11個既有native批次回歸PASS；314項合成資料，TMSA208／DRYBMS106 |
| `node scripts/verify-public-artifacts.mjs` | PASS；22公開檔、0模板註解、1625個私有正文標記未洩漏 |
| `git diff --check` | PASS |

套件案例有重疊，不相加冒充獨立端到端總數。所有QA皆為**真實UI＋合成測試資料／本機PostgreSQL**，不是正式Supabase／Pages驗收。

## 本次原UI驗證

1. 兩個框架的按鈕順序為初始化自評、Excel、PDF。
2. 兩框架確認對象正確，取消與右上關閉均零業務寫入、零restart請求。
3. 自評文字及DRYBMS百分比草稿不被初始化入口丟棄；編輯中入口停用。
4. 同事持有Item lease時，整批拒絕且所有記錄／audit／operation不變。
5. 在TMSA搜尋只剩一項時初始化，其他隱藏／停用的已勾選項仍全部重設；已未勾選項不改版本，其餘所有記錄完整保留。
6. 真實COMMIT後暫扣回覆：仍顯示核對中、導航及匯出停用，不提前顯示操作成功；收到ACK及讀回後收斂。
7. DRYBMS實際保存後丟回覆：先到原管理入口確認同operation，重整再到TMSA仍明示原DRYBMS操作；精確重播不增加audit或業務寫入。
8. 繁中／英文、1440px桌面／390px手機幾何檢查，另存10張截圖；直接檢視代表性桌面及繁中／英文手機確認畫面，無新增裁切或整頁橫溢。
9. 新瀏覽器同事及管理員均讀回兩體系未勾選狀態，不能取得Owner按鈕。
10. 原管理入口仍可開啟兩體系選擇並取消；沒有被替代或移除。

receipt：`qa-evidence/framework-initialize/green-2026-10-14T09-01-31.544Z/receipt.json`，21個產品／腳本／SQL輸入SHA-256已核對；0外部請求、0pageerror，所屬UI／API／PG埠均已關閉。既有native receipt在 `qa-evidence/restart-updates/native/receipt.json`，15個輸入hash已核對；API／PG均已關閉。

## RED與有限自檢

- 修改前4個SSR入口斷言失敗，角色負例已通過；原UI RED在 `qa-evidence/framework-initialize/red-2026-10-14T08-55-32.984Z/receipt.json`，失敗原因是原頁面沒有初始化按鈕，非SQL或測試環境問題。
- 只改正式`FrameworkPage.tsx`的import、hook、header action及獨立確認視窗。原條目工作區以下markup、原保存／export handlers及其餘產品檔未改。
- 一次有限自檢涵蓋作用域、保留資料、Owner權限、原操作恢復、取消／ACK及原UI邊界；未發現本批阻斷項。不宣稱另有獨立第三方review，不展開其他模組審計。
