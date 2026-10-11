# 後端、正式 ApiClient 與原生本機 QA

## 交付及正式界線

- 安裝檔：`supabase/migrations/001_platform.sql`；唯讀核對：`supabase/readback.sql`。
- 正式前端：`src/api.ts` 的 `createApiClient(config: SupabaseConfig): ApiClient`，遵循 `src/types.ts`。
- 原生驗證：`scripts/verify-native.mjs`。HTTP QA：`scripts/qa-server.mjs`。共用 runtime：`scripts/native-postgres.mjs`。
- **真實 UI＋測試資料；本機 PostgreSQL 非正式 Supabase。** HTTP 只模擬 Supabase REST 傳輸；業務規則全部執行同一 SQL，不是 mock／PGlite。尚未指定或安裝正式 Supabase，不能視為上線。
- 本次只有本機新建 cluster；沒有改既有資料庫、系統服務、PATH、正式專案或來源檔。測試完成關閉自己擁有的服務，保留 data/evidence，不刪資料夾。

## 安裝與初始化（由使用者在新的專用 Supabase 執行）

1. 先決定**這個平台自己的新專案**，核對 Project URL；不要使用其他網站正在使用的正式 Supabase。
2. 在該專案以資料庫管理身份執行完整 `001_platform.sql`。此檔沒有初始化碼、密碼或預設正式帳戶。
3. 使用安全、非公開的方式產生一次性初始化碼；離線計算它的 SHA-256（64 個小寫 hex），在管理連線以綁定參數呼叫 `compliance_private.provision_bootstrap(code_hash)`。此 helper 不授權給 anon。不要把原碼/雜湊寫進 Git、網頁、聊天、一般日誌或截圖。初始化碼先交給真正的 Owner，再由初始化表單建立 Owner 與進站密碼。
4. 執行 `readback.sql`：唯一 RPC 應是四個參數、`security_definer=true`、`search_path=""`；私有表 RLS 全部 true、anon 表權限/私有 schema usage/helper execute 全部 false；RPC execute true。`roster` 無合法 gate 應拒絕，無 session 的 `read` 應拒絕。
5. 前端只設定新 Project URL 與 publishable／anon key，不使用 service-role。連線失敗不能當成「未初始化」；只有成功 `bootstrap_status.initialized=false` 才能顯示首次初始化。
6. Owner 在管理頁從本機 `private-seed/platform-seed.json` 匯入。只允許空白業務 workspace；SeedBundle 不包含人員、設定、憑證。原始標準、公司自評及來源不可放到 public/dist/Git。
7. 正式接受還需實際 hosted PostgREST/ACL readback、兩個瀏覽器角色/保存驗證與部署檢查。本機 native PASS 不代替這些步驟。

`pgcrypto` 已在 `public` 或其他 namespace 時不搬動它；bcrypt helper 從 `pg_extension` 找實際 namespace，測試涵蓋預先安裝在 public 的情況。

## 唯一前端 RPC

POST `${config.url}/rest/v1/rpc/compliance_rpc`：

```ts
{ p_action: string, p_session: string, p_client_id: string, p_payload: object }
```

回覆 `RpcResult`：成功 `{ok:true,data:...}`；失敗 `{ok:false,code,message,holderName?}`。ApiClient 轉成帶 `code`、`holderName` 的 `RpcError`，不把 payload/密碼/hash/session 或原始 transport 錯誤文字放入錯誤日誌。

| action | payload / 回覆 |
|---|---|
| `bootstrap_status` | `{}` → `{initialized,siteGateConfigured}`，只公開這兩個布林 |
| `bootstrap` | `{bootstrapCode,name,username,departmentId,credentialHash,gateHash}` → `{initialized:true}`；一次性碼驗證及唯一 Owner 在同一交易。也相容原生 fixture 的 `initializationCode/owner/passwordHash/sitePasswordHash` 欄位 |
| `gate` | `{passwordHash}` → opaque `{gateToken}`，20 分鐘；site password 變更使舊 gate 失效 |
| `roster` | `{gateToken}` → 有效 gate 才返回啟用 Person 名冊，沒有 stored hash；畫面只顯示部門/姓名，角色不代表登入授權 |
| `login` | `{gateToken,personId,passwordHash}` → `{user,currentUser,sessionToken}`；Owner/admin 必須有個人密碼，operator/vessel 可不設密碼；session 最長 12 小時 |
| `current_user` | `{}` → 由有效 opaque session 查得的 canonical Person |
| `logout` | `{}` → 撤銷當前 session、移除它的 leases |
| `read` | `{}` → 完整 PlatformState；同一 SQL/MVCC snapshot 組合各 row；people 僅有 sanitized Person/hasPassword |
| `claim` | `{kind,id}` → Lease；baseVersion 為呼叫的 record 版本 |
| `renew` / `release` | `{kind,id,leaseToken}`；session+client+token 三重 fencing，expiry 後不可續租；遲到舊 token 不可移除新 lease |
| `save` | `{kind,record,expectedVersion,leaseToken,intent,operationId}` → canonical record。intent 為 `create/update/close/reopen/finalize/archive/activate`。個人密碼可在 record `credentialHash`／`passwordHash` 或 payload `passwordHash` 傳 SHA-256，回覆必移除 hash |
| `role_permissions` | 使用與 save 相同的完整 settings envelope，僅 Owner，CAS/lease/operation receipt 相同；ApiClient 自動把矩陣變更路由至此專用動作。一般 settings save 僅修改部門，不能偷偷改敏感字段 |
| `operation_status` | `{operationId,request?,action?}` → `{status:'unknown'}` 或 `{status:'committed',record}`；optional request 必須精確匹配；action 預設 save，矩陣用 role_permissions |
| `audit_query` | AuditQuery → `{rows,total}`；kind/itemCode/actorId/from/to/text 與 offset/limit 在伺服器套用；limit 1–200；date-only to 包含整個該日 |
| `export_authorize` | ExportRequest → server current 完整 PlatformState；snapshotToken 必须仍匹配；improvement IDs 非空、唯一、有效且仍符合 filters；私有表保存完整快照，audit 記錄指定 IDs/格式/receipt/itemCodes |
| `import_seed` | `{seed,operationId?}` → `{imported}`；Owner、一次、空白業務庫；整個 graph 驗證失敗則全交易回滾 |
| `site_password` | `{credentialHash,newGateHash,operationId?}` → `{changed:true}`；Owner 本人憑證重驗、settings 時钟/version、gate epoch 和 audit 原子更新 |
| `transfer_owner` | `{targetId,credentialHash,operationId?}` → `{transferred:true}`；Owner 憑證重驗，目標需啟用且有密碼；原 Owner→admin，新 Owner 唯一；兩個 Person/version/audit 及舊 sessions 失效原子完成 |

所有业务 action 都由當前有效 session/actor/雲端能力矩陣再次授權，不使用客戶端 userId/role 作權威。Owner 全權；admin 的 enterManagement/manageUsers 固定 true；非 Owner 的 manageRolePermissions/manageSystemSettings 固定 false；operator/vessel 所有管理能力固定 false。其他業務能力可以由 Owner 配置。預設六部門與私有 seed 一致：management、marine、technical、crew、safety、shipping。

## 逐筆保存、單 Item 鎖及恢復

- 每個 record 是獨立 `(kind,id,version,body)` row，沒有一巨型 JSON update 或共享 root version writer lock。獨立 item 可在不同 PostgreSQL connections 同時 commit。
- **item 定義及其 assessment 共用 `item:<item.id>` business lease/advisory key。** 既有 assessment 由它的 `itemId` 查實際資源，保留既有穩定 assessment ID（包含來源 namespace 冒號）；新 assessment claim 的 id 使用實際 item id，不能推測或重寫來源 IDs。
- Lease 75 秒；前端每 20 秒續期。Lease.resourceKey 為 business key，baseVersion 仍是原 kind/id 的 record version；ApiClient 在記憶體保留 token→原 kind/id，續租/釋放不把 operator 錯誤當成 item 管理者。不可跨 entity 偷用 token。
- 保存的 CAS、canonical record、immutable audit 和 operation receipt 在同一交易；stale/非法 reference/失鎖均零業務寫入。相同 session+client+operationId 與完整相同 envelope 返回第一次 canonical ACK（即使原 lease 已釋放）；更換 payload/action 拒絕。receipt 只存私有 request digest，沒有客戶端憑證。
- KPI/BPG/level/chapter 真的改變時，同交易把現有 assessment.reviewed=false、version+1、獨立 audit，保留 Y/N、文字及來源。code/排序/PIC 變更不強制降燈。停用 item 不可寫 assessment。
- ApiClient 只對保存類相同 operationId 的 network/lost-body 失敗安全重播一次，重新使用相同已序列化 envelope；不對 VERSION_CONFLICT/LEASE_LOST 自動製造新操作或重試。未知結果須保留草稿，透過同 operation 狀態核對/重播。
- receipt/status 仍需有效原 session+client；失效/過期 session 不取得原 canonical receipt。這是明確的安全恢復界線，不加入另一套永久恢復憑證；重新登入後先讀 canonical state 核對。
- `fpmc-compliance-client-id` 和 `fpmc-compliance-session`（`{user,sessionToken}`）在 sessionStorage；只恢復顯示 hint，read 後以 server current_user 校準。login/logout 更新自己的 key。進站 gate key 由 App 維護。舊 session/generation 回覆不套用到新身份。
- `response=yes` 必須 conformity=all；未補齊 sourceGap 禁止 Yes；reviewed 不由 Y/N 推導。原始 sources/sourceOriginals 保留；缺口補齊需新增有定位及補證說明的來源，不可只勾 checkbox。
- 改善為單一 row/event stream，舊 events 必須保持逐一相同，新增 event 的 actor/at 由 server stamp。close/reopen 不改 assessment；closedAt/closedBy 由 server。external 必有 valid inspection/finding，finding/general 可供追蹤，positive/guidance/no_finding 不製成缺失來源；跨框架合法 IDs 可引用。
- 建 inspection 時 server 凍結完整啟用 framework/chapters/items；少送的 result 補成未評（null/false），不是 Yes 或分數。final 不能覆寫，修訂建立新 ID+supersedesId。DRY levels 只允許 0/25/50/75/100/null。
- 不硬刪人員/標準；角色/停用/憑證變更增加 private credential epoch，舊 session 不可再讀/寫。admin 不能改 Owner；Owner 不能一般 save 降級自己或停用自己。lease 心跳不新增 audit。改 Item code 保留 aliases，audit 同時索引舊、新 code。

## 原生本機執行

Windows 的路徑有 `&`，npm 的 `.cmd` wrapper/某些 terminal workdir 會解析失敗。保留原路徑，不改名、不另 clone；直接呼叫 Node entrypoints：

```bash
cd 'E:/Projects/TMSA&DryBMS-system'
node scripts/verify-native.mjs
node scripts/qa-server.mjs
# 僅本機私有來源副本；不會將 seed 提供為 HTTP 靜態檔：
node scripts/qa-server.mjs --seed private-seed/platform-seed.json
# 可選固定的空閒 loopback port：
node scripts/qa-server.mjs --port 8787 --seed private-seed/platform-seed.json
```

runtime 尋找順序為 SHIP_QA_PG_BIN / COMPLIANCE_PG_BIN / 已有 Hermes cache 的便攜 17.11 / 本次 scratch 的官方便攜 17.6；也可顯式設定 `COMPLIANCE_PG_BIN`。不接受 DATABASE_URL 或任意 connection string。

每次必建立全新 owned scratch cluster：nonce+ownership.json+dataDir+隨機 PG port，清除 PG* 環境，以 127.0.0.1 啟動，連回核對 data_directory/address/port/version。只用 synthetic/local-copy 資料；local trust 不可拿來當正式部署設定。停止只針對自己 owned cluster，不關其他 Postgres、不刪任何檔案。

QA_READY 會輸出新的 HTTP URL 與 `qa-evidence/session-handles.json` 的 path；`GET /health` 可核對服務與標籤。REST 路徑是 `/rest/v1/rpc/compliance_rpc`；每 request 從 bounded pool 取得獨立 connection，BEGIN→SET LOCAL ROLE anon→同一正式 SQL RPC→COMMIT。只有 loopback origin CORS，沒有任意 SQL、bootstrap secret 或 credential HTTP endpoint。Ctrl+C/SIGTERM 關閉自己的 HTTP/PG，檔案保留。

- `session-handles.json` 有正常 Owner/admin/operator/peer/vessel 的合法 session/person/clientId，以及 config。測試可把 config 放 `fpmc-compliance-config` localStorage、clientId/session JSON 放以上 sessionStorage keys，再經正常 createApiClient/read 驗證；不是偽造角色或繞過 SQL。
- `qa-private-credentials.json` 是 QA-only 密碼等效的 SHA-256，**敏感且 gitignored**；只供原生專用動作 fixture，不印出、不打包、不貼聊天。session handles 也不可公開。
- 完成的 `qa-evidence/native-tests.json` 含 case IDs、PASS/FAIL、總數、SQL/ApiClient hashes；`http-tests.json` 只有 action/code/backend PID，不含 payload/session/hash。source 副本 import/readback smoke 位於 `qa-evidence/private-seed-smoke/`。

## 已實際核對與剩餘邊界

native runner 涵蓋初始化/gate/真實 sessions、直接私有表/helper/RLS拒絕、同 Item 互斥/holder、異 Item 真正雙 connection commit、75秒/續期/expiry/遲到 fencing、CAS與非法輸入零寫、lost-ACK exactly-once/status、角色/Owner/密碼與停用舊 session、append-only progress、final snapshot/新修訂、完整 server freeze/未知評定、DRY 值、sourceGap/補證、單 business Item 定義與 assessment interlock/降 reviewed、export 指定 snapshot/filter/audit、audit 分頁與舊代碼搜尋、專用 Owner 設定/轉移、既有 public pgcrypto、真實 HTTP ApiClient 恢復/holder/network replay/不重試 stale/舊身份回覆 fencing。

本機私有 seed 另已成功完整匯入並 readback：700 Items、700 assessments、50 chapters、2 inspections、124 improvements、30 DRY scores；保留來源 ID，沒有改原 JSON。這不代表正式 Supabase 已裝、正式資料已上雲或整體網站/browser/PDF/Excel 接受已完成；前端 build/UI/部署由主工作流程分別核對。
