# 發布交接：本機核對 → 新專案SQL → 使用者Push／初始化

此文件是操作流程，不是「已部署」證明。正式目標的GitHub repository名稱/公開性、Supabase project及使用者執行狀態仍須在交接時核對。不要把這個平台的SQL安裝到Ship Dynamics或其他舊專案。

## 1. 一個資料夾、一個repository

GitHub Desktop → File → Add local repository → 選 `E:\Projects\TMSA&DryBMS-system`。不要Create/Clone到巢狀資料夾，也不要另外複製一份ready版。新remote用Publish repository；已有remote用Push origin。先核對remote與account，不猜不存在的URL。

可以以公開的**純程式碼**repo配合免費GitHub Pages，但不得公開公司自評、受保護的標準全文或初始化碼。若使用私人repo，先確認GitHub方案是否支援私人repo的Pages；不在未確認前購買升級。

## 2. 新的Supabase專案：安裝與唯讀核驗

使用者建立／選定本平台專用的新專案，先核對Project名稱與URL。前端只使用Project URL及publishable/anon key；service_role/secret key不放前端、Git或聊天。不得套用到Ship Dynamics或其他已有資料的專案。

在已核對的新專案SQL Editor，新query完整貼上 `supabase/migrations/001_platform.sql`，Run一次。交接Preview由已驗證本機commit的raw blob顯示完整唯讀textarea；使用者自行Ctrl+C／貼上／Run。助手不代貼、不用剪貼簿API、不執行正式SQL。錯誤、既有資料或不明結果立即停止，不重跑猜測。

安裝成功後另開query，執行 `supabase/readback.sql`。预期：RPC四參數簽名正確、Security Definer且固定search_path；私有表 `anon_has_any_direct_grant` 全false；私有helper `anon_can_execute_helper` 全false；`anon_private_schema_usage=false`／`anon_rpc_execute=true`。bootstrap_status成功、`initialized=false`、`active_owners=0`是尚未建立Owner的正常階段；無gate名冊及無session讀取均須拒絕。SQL/RPC錯誤不能當無Owner。

## 3. 私有一次性碼設定（與公開migration分開）

**初始匯入 timeout 修正（新專案及既有已安裝專案）：** `001_platform.sql` 的原始安裝核驗完成後，另開 query 執行 `supabase/migrations/002_import_timeout.sql` 一次，再另開 query 執行 `supabase/import-timeout-readback.sql`，必須取得 `PASS_IMPORT_ROUTE_INSTALL_ONLY`，才完成初始匯入路由安裝。新版前端還須先完成下方 003 與 15 項核驗，再發布／首次匯入。已完成 001／Owner 初始化、但尚缺 002 的既有專案只需這個 002 修正及獨立讀回，**不重跑 001、初始化或資料匯入**。這個修正保留同一 RPC 名稱／URL；只有初始匯入多傳 `p_import_mode=true` 並取得 60 秒 SQL 預算。`supabase/readback.sql` 的四參數 `expected_signature` 判斷只適用原 overload；新增五參數 row 的 false 不代表安裝錯誤，新增路由必須以專用 12 項 readback 核對。完整原因、驗證及停止條件見 `docs/IMPORT_SQL_TIMEOUT_REPAIR.md`。

**登入後完整讀取修正：** 002 已安装並核對後，另開 query 執行 `supabase/migrations/003_read_timeout.sql` 一次，再另開 query 執行 `supabase/read-timeout-readback.sql`，必須取得完整 15 項 `PASS_READ_ROUTE_INSTALL_ONLY` 才發布目前前端。既有已完成匯入的專案只補 003，不重做任何初始化／匯入。只有完整 read 多傳 `p_import_mode=false,p_read_mode=true` 並取得固定 15s SQL／60s 客戶端預算；普通操作與初始匯入不變。003 後已共有三個 overload，舊 002 的 exact-two 檢查不再適用。這是後端安装核驗，不是正式 Owner 登入成功證明。完整操作／證據邊界見 `docs/READ_TIMEOUT_REPAIR.md`。

開啟本機 `docs/BOOTSTRAP.html`，按「產生一次性初始化碼」。按之前不會產生秘密；工具不連網、不寫瀏覽器storage、不執行SQL。先把碼保管在自己的密碼管理器；不得貼到聊天或公開Git。

在同一已核對專案，另開query執行工具產生的私有設定SQL一次。它只含SHA-256，不含明文碼，只設定bootstrap權限，不建立Owner或匯入資料。設定後再readback：`initialized=false`、`active_owners=0`、`bootstrap_provisioned=true`。若已初始化、錯誤或結果不明，停止，不重新產生或重跑來猜測。

接著先發布前端（第4節），再在網站建立Owner（第5節）。進站／Owner密碼只由使用者在網站輸入，不貼聊天。

## 4. 發布前端

repo Settings → Pages → Build and deployment → Source → GitHub Actions。Workflow `.github/workflows/pages.yml`使用鎖定的npm依賴建構並上傳`dist`，不上传repository整个目录或private-seed。

若不用網站內連線設定，可在GitHub repository variables設定`SUPABASE_URL`及`SUPABASE_ANON_KEY`（前端公開值，不是service_role）。Workflow將其注入build。使用者Push後等待最新Pages run為green，再核對真正Pages URL與頁腳commit識別；raw main更新不等於Pages已更新。

## 5. 在網站建立Owner及私有資料首次匯入

網站連線到已核對專案，只有伺服器確認initialized=false時才提供初始化。輸入一次性碼、Owner名稱／帳號、Owner密碼及進站密碼。伺服器確認建立後碼即失效，再使用進站密碼及Owner身分登入。


Owner登入 → 管理 → 資料匯入 → 選本機 `private-seed/platform-seed.json` → 核對預覽：TMSA288條/20分章、DRYBMS412分析條/30主題及來源缺口 → 明確確認匯入。只能匯入新的空workspace，既有資料不能被初始seed覆蓋。

完成後重新登入/重新讀回核對條目數、兩個原檢查報告、改善、部門回覆、週期與原始來源。不要僅看匯入成功訊息。


匯入後readback預期：initialized=true、site_gate_configured=true、bootstrap_provisioned=false、active_owners=1；Item TMSA288／DRYBMS412，共700；assessment700、chapter50、improvement124、inspection2、dryScores30。cycles及完整provenance保留。正常結果可按序繼續，保留各階段Results，最後回傳readback；錯誤或不符立即停止。

## 6. 正式網站有限驗收（尚未執行）

使用 `supabase/readback.sql` 的基線唯讀核驗 SQL，003 後另用 `supabase/read-timeout-readback.sql` 核對新增路由；再在真正網站驗證：Owner/admin/operator角色、人員改動refresh後保持、一個Item兩位編輯者互斥且顯姓名、不同Item可同時保存、取消零資料變更、失鎖留稿、保存後新頁面讀到同一版本、改善列表與條目共用、歷史快照不受新版定義變動、Excel及PDF下載。

正式核驗與本機native測試是兩份證據。遇到錯誤先查UI、資料讀回、版本及network/快取，不重設或拿初始seed覆蓋正式庫。

## 7. 備份與回退

初始資料包以及完整private source snapshot保存本機，不公開。正式操作前匯出受控資料備份；不要以重新Run seed當作回退。前端可以回到前一個已驗證commit重新部署；資料庫回退需另核對目前schema/資料，不能任意drop schema或刪除紀錄。
