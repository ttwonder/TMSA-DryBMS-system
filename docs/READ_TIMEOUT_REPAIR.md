# 登入後完整資料讀取逾時：限定 read 的修正

## 影響及證據界線

Owner 輸入個人密碼登入後，需要完整資料讀回才能開啟工作區。連線檢查成功、Owner 存在及 seed 已提交，都不能替代這一步。既有雲端診斷顯示資料生成 2,780.30 ms、JSON 編碼 1,375.79 ms，合計 4,156.09 ms，回應 15,206,413 bytes；與已取得的 anon 3s 設定及登入後 `57014` 一致。SQL Editor 的執行角色與 REST 不同：這是具體瓶頸證據，不是瀏覽器恢復證明。

已確認 `imported=true`、唯一 active Owner、700 Item／700 assessment／124 improvement／2 inspection 及其他業務筆數。**不再匯入、不初始化、不重跑 001／002、不改密碼。** 辦公室 11 部門／108 人員的私有準備檔是另一筆工作，尚未正式搬入；此次修正不聲稱完成名冊搬移。

## 最小改動

- 原 URL／RPC 名稱、四參數普通路由、五參數 initial-import 路由都保留。
- 完整 `read` 明確選六參數路由：`p_import_mode=false,p_read_mode=true`；後端同時驗 exact action、兩個旗標，其他 action／空旗標拒絕。
- 六參數函式固定 SQL `statement_timeout=15s`、空 `search_path`；仍呼叫原 RPC，保留原 session／有效人員／角色投影、全部來源、凍結歷史及 snapshotToken。
- 只有完整讀取的客戶端期限為 60 秒，含回應下載及 JSON parsing。普通請求仍 20 秒、初始匯入仍 180 秒。不自動重播 read，不缺路由降級。
- 不修改 role-wide 或 database-wide timeout，不新增私有表權限，不改既有函式 OID／body／owner／ACL／settings，不更改 UI 版面或操作。
- 這是有上限的讀取時間預算修正，**不是聲稱減少 JSON／CPU 成本的架構優化**。全量資料及現有輪詢仍保留；若其後實證負載問題，另決定增量讀取，不在這輪順手重寫。
- 匯入 ACK 與後續 read 失敗分離；ACK 後停用重匯 controls，不能把已提交寫入誤報為未匯入。

## 後端先、前端後

目標僅限專用 `TMSA-DryBMS-system`（project ref `fvdzmktjmoeysdfjeuuq`），不是 Ship Dynamics。

1. **第一步／新增限定讀取路由**：在新 SQL Editor query 自行貼上 `supabase/migrations/003_read_timeout.sql` 並 Run 一次。只改 schema／function，沒有業務、身份或設定資料寫入。成功應為 `Success. No rows returned`；未知結果停下回傳，再安排必要的唯讀核對，不能盲目再 Run。
2. **第二步／独立唯讀核驗**：新 query 執行 `supabase/read-timeout-readback.sql`，Export CSV。預期 `PASS_READ_ROUTE_INSTALL_ONLY`、完整 15 項 checks 為 true、imported=true、activeOwnerCount=1 及既有業務筆數。此時已共有三個 overload，舊 002 的「exact_two_rpc_overloads」檢查已不適用；不要用舊 12 項 readback 要求移除新函式。
3. **第三步／由使用者 Push**：待第二步 CSV 核對完成，才上傳已驗證本機前端 commit。助手不 Push、不代貼、不使用剪貼簿 API、不 Run 正式 SQL。
4. **第四步／正式驗收**：核對 remote、Pages workflow 及 served commit；再由使用者在新瀏覽器 context 通過 gate、Owner 登入、完整 TMSA／DRYBMS 工作區。保留 error/action／安全碼，不重匯或清 storage。正式 Owner／admin／operator及多人保存仍是獨立驗收項。

任何錯誤、逾時、不符的 Owner／counts／checks、錯目標，立即停下回傳結果。Preflight 對未知 predecessor fail closed；`READ_ROUTE_ALREADY_INSTALLED_VERIFY_READBACK` 代表先讀回，不覆寫或重裝。

## 可重現本機驗證

```bash
npm test
npm run typecheck
npm run build
# 指向既有且已核驗的官方 PostgREST 16.4 binary，不由腳本下載。
COMPLIANCE_POSTGREST_BIN='C:/.../postgrest.exe' npm run qa:read-timeout
npm run qa:browser
```

`qa:read-timeout` 建立自有 loopback PostgreSQL＋PostgREST：完整私有 seed 副本、合成 QA 身份；以有 anon membership 的獨立 NOINHERIT connector 比照真實角色邊界，受控普通角色限 100ms。未改讀取真實回傳 `57014`、健康小請求成功；新路由讀回全部資料並比對原 snapshot，拒絕 writer／不正確 flags／無 session，保留原函式／角色設定／所有私有表，核對 15 項 catalog、真 ApiClient Owner驗證及新 context 原 App 操作員登入後 TMSA／DRYBMS。最後注入只限 owned fixture 的延遲，確認新路由約 15s 仍會取消而非无限等待。

受控 100ms 不是宣稱正式失敗的精確環境；本機成功不等於 hosted 恢復。原 App 的 Owner 密碼輸入動作尚需正式驗收；本機 Owner gate/login/read 使用真 ApiClient＋DB，操作員則實際點原登入按鈕。

初次 harness 使用 superuser connector 未取得預期 role budget、以及以 tbody 找實際非表格頁的 selector 失敗均留在 ignored `qa-evidence/read-timeout-repair/`。修正的是測試環境／selector，不據此改正式 UI 或放寬產品權限。每次 runtime 只停止自有 processes，保留檔案及完整失敗／成功 receipts。QA REST simulation 同步使用實際 4／5／6 參數路由，不能忽略旗標冒充路由驗收；timeout hoisting 僅由真 PostgREST 證明。

## 回退界線

本輪不準備或執行正式回退。需要回退時先核對已服務的 frontend 與後端版本；舊四／五參數路由保留可供舊客戶端使用。僅將前端回到舊版不會刪改已提交業務資料，但舊版完整讀取可能再次逾時。移除新路由或重設其 deadline 都是另一個正式 SQL 決定，不自行執行。

官方依據：[Supabase Timeouts](https://supabase.com/docs/guides/database/postgres/timeouts)，本輪已讀取，支援 REST 的 function-level deadline 且 Client API 上限 60s。固定 15s 比整體放寬 anon 更小；仍須正式讀回及新 context 驗收。
