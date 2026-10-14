# 逐項頁「初始化自評」交付及本機驗證

## 使用與界線

- TMSA／DRYBMS逐項頁右上角、Excel左側新增「初始化自評」；僅啟用Owner／管理員可見及操作；普通操作員、舊vessel角色及停用帳戶不可使用，前端隱藏且後端拒絕。原管理 → 系統／資料 → 一鍵重新開始的Owner入口保留。
- 按「確認初始化」只清除目前體系全部條目的完成更新勾選（含停用條目，不受目前篩選影響）。其他評定／自評／佐證／人員／執行狀態、改善、歷史、另一體系及DRYBMS百分比不變。TMSA現行分數、章節燈號依原規則重算。
- 目前有編輯草稿時先保存或取消；有人持有此體系Item編輯鎖時整批拒絕。確認前取消零寫入；未知結果只核對原操作。
- **管理員支援需要新增010 SQL。** 重用006原子命令、原hook及operation journal；010只擴充此命令的角色檢查，不改006、不新增RPC、不改CSS／計分及其他Owner權限。安裝010本身不清除勾選。本文取代初版「Owner專用／沒有新增SQL」說明；`c435a50`不含管理員補正。正式操作見 `docs/FRAMEWORK_INITIALIZE_ADMIN_UPGRADE.md`。若既有006安裝未確認，先核對唯讀證據，不盲目重跑；009正式安裝／核驗仍是獨立事項，不由010或本機PASS代替。
- 本機commit由助手完成；Push／Pages／正式資料操作由使用者決定。本次沒有操作正式Supabase或清除任何正式勾選。

## 可重現命令與結果

| 命令 | 實際結果 |
|---|---|
| `npm test` | 178 PASS、0 FAIL，包含實際PDF／Excel builders的原回歸 |
| `npm run typecheck` | PASS |
| `npm run build` | PASS；既有reports.ts靜態／動態import混用提示保留，不展開打包改造 |
| `npm run qa:framework-initialize` | 10個原App＋本機PostgreSQL案例PASS；安裝001–010完整鏈，包含管理員兩體系真實保存及操作員不可見 |
| `npm run qa:restart-updates` | 17個native權限／升級／原子批次回歸PASS；314項合成資料，TMSA208／DRYBMS106 |
| `npm run qa:restart-updates-ui` | 15個原管理入口UI相容案例PASS |
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
8. 繁中／英文、1440px桌面／390px手機幾何檢查並保存截圖；代表性Owner／管理員桌面、手機確認視窗及操作員無按鈕畫面已直接檢視，無新增裁切或整頁橫溢。
9. 新瀏覽器操作員讀回兩體系未勾選狀態且沒有初始化按鈕；管理員可在兩體系原頁實際初始化並讀回，其他業務資料與DRYBMS四級百分比保留。
10. 原管理入口仍可開啟兩體系選擇並取消；沒有被替代或移除。

| 最新receipt | 案例 | 已核對輸入SHA-256 |
|---|---:|---:|
| `qa-evidence/framework-initialize/green-2026-10-14T09-24-40.168Z/receipt.json` | 10 | 22 |
| `qa-evidence/restart-updates/native-2026-10-14T09-22-48.158Z/receipt.json` | 17 | 18 |
| `qa-evidence/restart-updates/ui/receipt.json` | 15 | 14 |

三份receipt的PASS、案例ID唯一性、cleanup及每個輸入hash已核對。原UI兩份均0外部請求、0pageerror；native正式請求0；所屬UI／API／PG均已關閉。hash指工作檔原始bytes的SHA-256，不混稱Git blob ID；提交時另核對index blobs。交付收尾只更新文件及交接頁，沒有更改受測產品／SQL／QA bytes，因此沿用相同bytes的有效測試，沒有重跑整套。

## RED與有限自檢

- 修改前4個SSR入口斷言失敗，角色負例已通過；原UI RED在 `qa-evidence/framework-initialize/red-2026-10-14T08-55-32.984Z/receipt.json`，失敗原因是原頁面沒有初始化按鈕，非SQL或測試環境問題。
- 初版新增入口；管理員補正版產品僅改 `FrameworkPage.tsx`與 `useFrameworkRestart.ts`的初始化角色條件，加上010權限升級。原條目工作區markup、原保存／export handlers、CSS、計分及其他Owner功能未改。
- 一次有限自檢涵蓋作用域、保留資料、Owner／admin與操作員權限、原操作恢復、取消／ACK、升級及原UI邊界；未發現本批阻斷項。未另請獨立第三方review，不展開其他模組審計。
- 管理員補正先以SSR及native權限測試取得RED，再修改前端、hook及010；後端RED保留於 `qa-evidence/framework-initialize-admin/backend-red.json`。
- 管理員UI測試準備階段對停用項目的普通保存被既有 `INACTIVE_ITEM` 正確拒絕；只修正自有本機fixture，不放寬產品防線，之後原UI測試PASS。

## 010後端升級核驗

- 只更換原restart helper的角色predicate；全部業務資料、ACL及其他函式不變。重跑及未知前版均拒絕，不覆寫。
- operator／vessel／匿名被拒絕且零寫入；管理員仍不能使用其他Owner專屬功能。降級使舊session的新命令及重播失效，停用管理員無法初始化任一體系。
- 同operation精確重播零重複寫入；late-row audit故障整批rollback；有效lease整批拒絕；一般新增Item不混入更早的批次。
- 新唯讀核驗本機得到 `PASS_RESTART_ADMIN_INSTALL_ONLY`、`checkCount:11`且全部checks為true，沒有執行初始化或業務寫入；舊performance安裝核驗亦保留通過。這只證本機安裝，不代表正式Supabase／Pages驗收。
