# 初始匯入：後端 SQL 逾時修復

## 已確認原因及修正邊界

正式 Postgres 日誌 2026-10-11 19:23:57 明確顯示 `public.compliance_rpc` 被 `57014 / canceling statement due to statement timeout` 取消。截圖未包含 action 的實值，也未提供該請求的有效秒數；不要把官方預設 anon 3 秒當成該正式請求的實測設定。先前前端 180 秒等待修正只處理上傳途中取消，沒有解除資料庫執行限制。

本次保留同一個 RPC 名稱及 API URL。新增必須明確傳入 `p_import_mode=true` 的五參數 overload，且它只接受 `p_action='import_seed'`。PostgREST 在主 SQL 執行前將此 overload 的 `statement_timeout='60s'` 提升為交易設定；不是在已經開始的 SQL 內臨時 SET，亦不放寬 anon、authenticated、authenticator 或整個資料庫的 timeout。

它直接呼叫原四參數 RPC：Owner/session authority、fresh workspace、完整 graph validation、交易回滾、來源保存及 audit 均未改。一般登入、保存、讀取等仍走原四參數 RPC。前端整個初始匯入仍最多等 180 秒，其他請求仍 20 秒，初始匯入不自動重播。

`57014` 的 HTTP 500 現在顯示固定、安全的 `DB_57014` 訊息，不再只顯示 HTTP_500；不轉述 provider 原始 message/details/hint 或任何私有欄位。

## 正式操作順序

僅限專用 **TMSA-DryBMS-system**；不得套用 Ship Dynamics 或其他專案。

1. 執行完整 `supabase/migrations/002_import_timeout.sql` **一次**。它只新增限定 overload、ACL 及 schema-cache notification，不重建 Owner、不重置設定、不改業務資料，也不重跑 001。原 RPC/dispatch source fingerprint 不符時會停止；已有新 overload 時停止並要求獨立讀回，而不是重裝。
2. 在另一個 fresh query 執行 `supabase/import-timeout-readback.sql`，保存原始 CSV。必須取得 `PASS_IMPORT_ROUTE_INSTALL_ONLY`。此結果只確認安裝及目前 counts，不等於匯入完成。
3. 使用者 Push 本機已驗證 commit；核對 exact-SHA Actions、Pages 及實際發布資產。
4. 用不含 session、seed 的五參數 read-only guard request 確認 PostgREST schema cache 能分辨新 overload；預期 `INVALID_IMPORT_ROUTE`，不是寫入或實際匯入。guard 的有效 timeout 是否真由 hosted PostgREST 提升，仍需正式匯入結果驗證。
5. 先核對最新 `initialized/imported`、各業務 counts、活動可見性；不把舊快照當成最新狀態。若 imported 已 true 或已有業務資料，停止，不重新匯入。
6. 前四步完成、正式狀態允許且使用者決定後，Owner 才執行原畫面的完整匯入一次。成功後另做 counts/content readback，再驗一般使用。

任何 Error、timeout、unknown outcome、STOP/FAIL 或意外警告：停在當步，保留結果，不自行重跑安裝、清 storage、重建專案、升級付費或再次匯入。Supabase Client API 官方最大可配置預算為 60 秒；若正式雲端仍逾時，此修正不能被宣稱為正式成功，必須核對實際新 overload/執行結果後再決定下一個最小處理。

## 本機驗證

- `node --experimental-strip-types --test tests/api-import-route.test.ts tests/api-provider-timeout.test.ts tests/api-import-deadline.test.ts`：真 ApiClient，controlled transport/timers；不是 hosted 證據。
- `COMPLIANCE_POSTGREST_BIN='<verified official portable executable>' node scripts/verify-import-timeout.mjs --private-seed`：owned native PostgreSQL + official PostgREST + 真 ApiClient。完整私有檔只送至 owned loopback。100ms 角色預算是用來穩定重現的 controlled QA，不是正式限制。receipts 留 ignored `qa-evidence/import-sql-timeout-repair/`。
- 該 runner 比較原四參數 source/OID/owner/ACL/settings、role budget、實際 rollback、限定路由、無 session、非法 graph、完整來源字段與 frozen snapshots、只匯入一次、直接私有表/helper 拒絕及 owned process 停止。它不修改或連線正式資料庫。
- `npm test`、`npm run typecheck`、`npm run build`、`npm run qa:native`、`npm run qa:browser`、`git diff --check`；範圍不擴及重新設計 UI 或新儲存架構。

## 官方依據

- https://supabase.com/docs/guides/database/postgres/timeouts — Function level 與 Client API 60 秒邊界。
- https://docs.postgrest.org/en/stable/references/transactions.html#hoisted-function-settings — 函式設定在主 query 前提升為交易設定。
- 查核官方 Git source：Supabase timeouts blob `13e803959e24898d36a47c0a2778e4a5de597d30`；PostgREST transactions blob `a7828ef31c12027db5ae608a057421d3cf8da633`。

本機成功、SQL installer acknowledgment、安裝 readback、正式完整匯入及多人保存驗收是五個不同的完成邊界。助手不代 Push、不貼入 SQL Editor、不代 Run 正式 SQL。
