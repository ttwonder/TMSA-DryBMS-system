# 初始化自評：Owner／管理員升級與正式交接

## 這次交付

- TMSA／DRYBMS原頁Excel左側的「初始化自評」，僅啟用Owner／管理員可見及操作；操作員前端不可見、伺服器拒絕。
- 功能只把目前體系所有 `reviewed:true` 恢復為false；含停用項目、不受畫面篩選影響。其餘資料及另一體系保留，原未勾選項目不改版本。
- 新增 `supabase/migrations/010_restart_admin.sql`：以精確前版函式hash護欄，僅更換006原子命令的角色判斷。沒有新RPC、ACL擴權、資料遷移或批量清除；其他Owner專屬管理功能不變。
- `supabase/restart-admin-readback.sql`只讀catalog、權限與數量，沒有呼叫初始化或寫入業務資料。

## 執行前確認

1. 只在本App專屬 **TMSA／DRYBMS Supabase** 使用；核對Dashboard專案、正式環境、Primary Database及SQL Editor執行身分，不能套到其他App。此交付沒有代為連線確認正式專案。
2. 既有006批次功能必須已安裝且沒有自行改寫。正式前版若不明，先核對既有安裝證據；不要重跑001、bootstrap、公司資料匯入或整包舊migration。
3. 若不確定010是否已經執行過，先用本次唯讀readback。PASS表示不要重裝；FAIL／SQL錯誤先停止，釐清缺失及前置狀態，不代表可盲目重跑010。
4. 009（TMSA14）是獨立升級；010不安裝也不證明009。若009正式狀態未確認，沿用其唯讀 `supabase/tmsa14-scope-readback.sql` 核對；不要用010的PASS宣稱整個版本已正式驗收。

## 已確認尚未安裝010時的順序（使用者執行）

1. 從本次commit綁定的Preview，按步驟1「選取全部SQL」，自行Ctrl+C，貼到Supabase SQL Editor的空白查詢；完整執行 `010_restart_admin.sql` **一次**。
2. 成功無錯誤後另開空白查詢，複製步驟2的完整 `restart-admin-readback.sql`執行；兩段不合併，不重跑步驟1。
3. 須得到 `status: PASS_RESTART_ADMIN_INSTALL_ONLY`、`checkCount:11`且11項checks全部true。`initialized`／`imported`及Owner數量是獨立狀態：既有已投入使用的公司應為true／true／1；與實際使用階段不符時先停下核對。此標記只證安裝，不證明正式初始化已執行。
4. 保留Results；正常通過可連續完成上述步驟，不必每一步回訊息，將最終readback結果交回核對即可。
5. 安裝核對及既有版本前置條件通過後，由使用者在原GitHub Desktop資料夾Push本機commit，等Pages發布對應commit；助手不代Push或部署。
6. 正式新版用Owner／管理員／操作員登入檢查按鈕可見性，可開啟確認後取消；取消不應清除勾選。真正初始化會清除該體系全部完成更新勾選，**不是任意測試按鈕**：僅在使用者確定要重新開始該體系更新時確認執行，再由另一帳戶讀回，核對其他資料及另一體系保留。

## 停止條件

- `RESTART_ADMIN_ALREADY_INSTALLED_VERIFY_READBACK`：不要重裝，只執行本次唯讀readback。
- `RESTART_ADMIN_UNKNOWN_PREDECESSOR`、`RESTART_ADMIN_UNEXPECTED_FUNCTION`、`RESTART_ADMIN_GUARD_MISSING`或 `RESTART_ADMIN_POSTCHECK_FAILED`：停止；保留錯誤，不移除護欄、不覆寫其他版本。
- 逾時、連線中斷、成功與否不明：不要重試安裝，先核對本次唯讀readback。
- 任一check為false、專案不符、意外破壞性警告或結果不符：停止，不Push、不執行正式初始化，先釐清。

## 本機證據與限制

178單測、typecheck、build、公開產物檢查通過；原頁10案例、native17案例、原管理入口15案例通過。原頁使用原App＋合成資料＋獨立本機PostgreSQL，不是假SQL成功回覆；案例有重疊，不合計成獨立端到端總數。詳細receipt／受測hash及角色、lease、lost-ACK、資料保留證據見 `docs/FRAMEWORK_INITIALIZE_ACCEPTANCE.md`。

SQL交接頁只能從最終本機commit的raw Git blob產生，完整放入readonly textarea；按鈕只選取文字，不呼叫剪貼簿API或遠端服務。每段SHA-256與live textarea核對，只證明交付文字，不證明後續剪貼簿、貼上、目標或正式執行。

本次本機交付完成不等於正式上線；正式SQL、readback、Push、Pages版本及正式UI／資料驗收各自保留獨立狀態。
