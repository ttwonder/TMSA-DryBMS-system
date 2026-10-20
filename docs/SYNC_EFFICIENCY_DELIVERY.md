# 流量與更新優化 A＋B：本機交付

## 狀態與範圍

- 基準：GM 獨立提交 `a07f6e8eecfa3d29245ad59fd8a46c7110c25d4d`；本批以其後的獨立本機提交交付。Push／部署／正式 SQL／正式登入均未執行；本機提交與正式啟用是不同狀態。
- 實作、focused、原生 PG、原 App 雙端、GM 下載及產物驗證已通過。正式 Supabase／Pages、正式帳號建立仍由使用者操作，不是本機優化的阻塞。
- 本機 UI 證據均為「真實UI＋合成測試資料，獨立本機PG，非正式Supabase/Pages」。原 performance-native 回歸另使用既有 ignored 私有來源，只核對，不公開正文。
- 不改 JSX、CSS、文案、導航或密度；不改角色／保存協議／計分／歷史／改善關係，不新增持久業務快取、Realtime 或付費服務。

## 實作

### 小型同步檢查

1. 冷載仍走原 performance `sync`，以完整授權向量驗證 baseline；沒有有效 baseline 不走 unchanged。
2. 有可靠記憶體 baseline 時，前景每 10 秒只傳 `syncMarker`。伺服器先走原 actor/session/active/role 驗證，再讀版本 metadata。
3. 標記綁定 actor、session、client、coverage、角色可讀版本、可讀控制 metadata 與原可見 audit 摘要窗口。獨立 export audit 亦會使可見角色的標記改變。
4. check 與 sync 各自在自己的單一 SQL statement snapshot 產生標記／資料。check 的 changed marker 不會被當成稍後 sync 的權威。
5. unchanged 不回完整 versions、正文、audit、人員或新 export token；客戶端返回同一 immutable state reference，不重建業務 state。差異才走原 sync delta＋完整向量核對。
6. GM 標記排除 improvement、audit、cycles、provenance 的隱藏改動。`viewScope` 不符、格式損壞或支援後遺失 marker 都 fail closed。
7. 舊前端仍可用原 sync。新前端遇初始完整 sync 沒有 marker 時沿原路徑；檢查僅對精確 `INVALID_PERFORMANCE_ROUTE` 降級。auth、permission、network、scope／coverage 錯誤不是降級理由。

### 排程與保存

- 前景 10 秒不變；背景跳過一般 poll 是原有行為，不算新增收益。
- visibility 可見、focus、online 立即安排只讀追新；250ms 事件去重、single flight，飛行期間必要時最多保留一次 queued catchup。錯誤不自發緊密重試。
- offline 只是排程提示，不產生伺服器成功；online 不自動重送保存。
- 保留原 ACK serial／session／context fence、主及關聯 ACK 即時套用、lease 20 秒續期與 75 秒期限、CAS、取消、pendingUnknown 及 exact operation replay。原保存首次失 ACK 的安全同操作重播仍保留，與 online 觸發重送不同。
- `useRecordEditor.ts` 沒有改動；dirty/private draft、同節點 caret／scroll 及隱藏時續鎖均有實際 UI 證據。

### GM 匯出與嚴格 token 的交界

原 export `snapshotToken` 包含控制 metadata，不能直接換成新的可見同步標記。有限自檢以原生原 Api 重現：GM 隱藏控制資料改動後，unchanged 合理，但舊 export token 會一直過期。

修正只在 GM **明確匯出**時強制走一次原完整向量 sync：如果可見標記完全相同，才用同次資料的嚴格 export token；若可見資料已變，仍拒絕 `SNAPSHOT_STALE`。server export 自己再次驗證，不沿用先前 check 作權威。這增加 GM 匯出前的一次只讀往返；沒有改 SQL export token 計算、沒有新增匯出權限，也不把隱藏變化放回 poll marker。

## A/B 實測

主要比較來自 `transport-2026-10-20T10-39-02.538Z/receipt.json`：

- A 執行從上述 GM commit 取出的原 `api.ts`／`syncState.ts`，DB 安裝至 013。
- B 執行本批原 ApiClient，DB 安裝至 014。
- 兩臂各自 fresh owned PG、相同 700 Item／700 assessment 合成 fixture、相同 Owner 角色與流程。fixture／原 Git blob／本批輸入均記錄 SHA-256；時間、session、localhost port 為各次真實執行值。
- JSON bytes 為實際序列化 request／解碼 response（含 RPC envelope）。wire bytes 為每次 fresh HTTP/1.1 socket 的實際 bytesWritten／bytesRead，含 HTTP framing；不是 gzip 估算，也不是 Supabase HTTPS／HTTP2 計費。

| 場景 | 版本 | Requests | JSON request / response bytes | HTTP request / response bytes | App call 耗時 ms |
|---|---|---:|---:|---:|---:|
| 冷載 | A | 1 | 229 / 637,990 | 432 / 638,324 | 187.62 |
| 冷載 | B | 1 | 229 / 638,106 | 433 / 638,440 | 163.81 |
| 無異動，連續 5 次合計 | A | 5 | 193,705 / 204,364 | 194,730 / 206,029 | 96.13 |
| 無異動，連續 5 次合計 | B | 5 | 1,480 / 835 | 2,500 / 2,490 | 34.23 |
| 可見單筆異動 | A | 1 | 38,741 / 41,329 | 38,946 / 41,662 | 15.42 |
| 可見單筆異動，check＋delta | B | 2 | 39,037 / 41,593 | 39,447 / 42,257 | 22.52 |
| 保存主及關聯 ACK | A | 1 | 779 / 885 | 982 / 1,217 | 9.59 |
| 保存主及關聯 ACK | B | 1 | 779 / 883 | 983 / 1,215 | 9.75 |
| Owner 選取匯出授權 | A | 1 | 378 / 3,934 | 581 / 4,266 | 12.97 |
| Owner 選取匯出授權 | B | 1 | 378 / 3,933 | 582 / 4,265 | 10.64 |

- B 無異動每次 response **167 bytes**，本次達成含 envelope ≤2,048 bytes 目標。相對本次 A 的五次 response 合計減少 **99.59%**；只指這一類 response，不是全站或帳單降幅。
- 無異動平均 App call A 19.23ms（15.69–28.35）、B 6.85ms（4.08–16.13）。單筆異動多一次往返，本次多 7.10ms；不宣稱高延遲網路也只多這些時間。
- 冷載仍傳原必要內容，沒有將初始化速度或 SQL CPU／掃描成本改善列為承諾。兩個 fresh DB 的冷啟動時間不能當穩定吞吐結論。
- 另一份同 DB 升級前後 raw native 對照保留於 `native-2026-10-20T10-38-53.251Z/receipt.json`，確認不是舊 47,555-byte 樣本換算。
- 原 App A保存→B正常前景 timer 可見：本次 **7,214ms**；B隱藏後切回可見追新：**115ms**。這是兩個真瀏覽器 context、真正 SQL 保存／讀回的單次量測，不是全球協作 SLA。
- headless visibility／online 使用受控瀏覽器事件與狀態；原 App、真 timer、HTTP、PG、lease 續期均真實。未宣稱實測所有作業系統最小化／網路切換情境。原版 UI RED 在切回後 1,800ms 仍無新讀取；未將理論剩餘 timer 當成實測 A 耗時。
- UI receipt 另記錄 CDP `Network.loadingFinished.encodedDataLength`，未混入上述 Node socket 統計。

## 驗證與證據索引

所有路徑均在 ignored `qa-evidence/`；不要提交 session handles／合成 QA credential artifacts／DB cluster。

| Gate | exit | 實際結果／receipt |
|---|---:|---|
| `npm test` | 0 | 304/304；`sync-efficiency/unit-final.txt` |
| 新 Api＋scheduler focused | 0 | 納入上列：22 Api＋3 scheduler；舊 sync/history siblings 亦通過 |
| `npm run typecheck` | 0 | `sync-efficiency/typecheck-final.txt` |
| `npm run build` | 0 | `sync-efficiency/build-final.txt`；既有 reports dynamic/static import 警告，未擴改打包 |
| 公開產物 | 0 | 22 files、1,625 私有敘述標記核對，零公開；`sync-efficiency/public-artifacts-final.txt` |
| 新 native | 0 | 16 cases；`sync-efficiency/native-2026-10-20T10-38-53.251Z/receipt.json` |
| 原 Api A/B transport | 0 | 2 arms；`sync-efficiency/transport-2026-10-20T10-39-02.538Z/receipt.json` |
| 新原 App 雙端 UI | 0 | 9 cases；`sync-efficiency/ui-green-2026-10-20T10-36-39.476Z/receipt.json` |
| 原 native sync，實際載入 014 | 0 | 20 cases；`performance-20261013/native/receipt.json` |
| 原 App performance races，實際載入 014 | 0 | 9 cases；`performance-20261013/p4-races/receipt.json` |
| GM native，行為測試前載入 014 | 0 | 57 cases；`management-viewer/green-2026-10-20T10-39-15.788Z/receipt.json` |
| GM 原 UI／下載，實際載入 014 | 0 | 28 cases、12 downloads；`management-viewer/ui-green-2026-10-20T10-37-59.075Z/receipt.json` |
| 下載產物核驗 | 0 | 12/12；同上目錄 `artifact-verification.json`；4 本機 Excel 開啟／原生 PDF 列印，8 原下載 PDF 文字／字級／邊界核對 |
| Source boundary／diff | 0 | `sync-efficiency/source-boundary.json`；App JSX exact equality，CSS／editor／001–013 不變 |

readback 的 24 項 catalog/ACL checks 已包含在 native scenarios，不另外灌入 E2E 案例總數。多支 runner 的重複租約／ACK情境不加成唯一案例總數。

### RED 與有限修正記錄

- `sync-efficiency/native-red-2026-10-20T10-00-56.084Z/receipt.json`：013 的原公開 RPC 拒絕 sync_check；同時保留 GM 後 cold/warm 基準。
- `sync-efficiency/api-red.txt`：原 Api 第二次仍發 sync，不是小型檢查。
- `sync-efficiency/ui-red-2026-10-20T10-14-46.953Z/receipt.json`：原 App 返回可見未即時追新。
- `sync-efficiency/native-2026-10-20T10-29-26.452Z/receipt.json`：GM 隱藏控制改動造成原 export token 過期；已用上列顯式匯出核對封閉。
- `sync-efficiency/api-metadata-red.txt`：支援 marker 的 baseline 接受非字串 metadata／export token；已 fail closed。
- SQL 開發時曾修正 PL/pgSQL alias 衝突與字串生成錯誤，未執行至正式環境。缺欄位／未知欄位 fixture 的預期統一採既有 `INVALID_PAYLOAD`。
- GM UI 第一次截圖遭 Chrome `Unable to capture screenshot`，在任何產品斷言前失敗；保留失敗 receipt，未改產品，後續完整矩陣及最終 bytes 已通過。
- 原 races runner 的歷史操作名／finding 區入口已按目前既有 UI 修正；不是修改產品來符合過時測試。

## SQL 安裝／發布手續（使用者執行）

1. 確認此 TMSA／DRYBMS 專案已完整安裝至 013，先用既有 GM readback 確認；未完成者按原順序完成，不重跑已安裝 migration。
2. 新增且僅執行一次 `supabase/migrations/014_sync_efficiency.sql`。精確 predecessor hash、四 public overload、security-definer、search_path、timeout 都有 guard；未知前置／重裝拒絕。零業務資料或權限批改，無新 public grants。
3. 單獨執行 `supabase/sync-efficiency-readback.sql`。預期 `PASS_SYNC_EFFICIENCY_INSTALL_ONLY`，24 checks 全 true；read-only transaction，無帳戶／憑證輸出。
4. 014 安裝後改用 014 readback；舊 013 readback 的函式 hash 已不再是最新期待值，不以此要求重裝 013。
5. 本批交付採獨立 commit；SQL Preview 從該 commit 的原始 blob 產生，瀏覽器逐字核對完整 readonly textarea。使用者自行 Push／部署，再按既有角色核對正式首載、輪詢、保存與匯出。本機 PASS 不是正式驗收。
6. 不修改／amend GM 提交；不用刪 storage、刷新丟草稿或重送未知保存作升級補救。操作前先妥善處理原有未保存草稿。

## Source delta 與收尾

- 產品僅 `src/api.ts`、`src/syncState.ts`、`src/syncScheduler.ts`、`src/App.tsx` 內部同步接線，另加 014／獨立 readback。
- 測試：兩個新 unit 檔、三個新 QA runner；既有 QA server 增加可選 latestMigration；四支既有回歸 runner 支援 `--latest` 真載 014；package 僅註冊三個 QA 命令。
- 一輪有限自檢以已批准契約為界；沒有多代理 review、全站審計或架構重寫。
- 所有測試只停止本次 owned PG／HTTP／Vite／Chromium；Excel 只處理確認為 fresh owned instance。資料夾及證據保留，沒有清除使用者 storage、接觸正式憑證或外部寫入。
- 子任務交回時的完整輸入 SHA-256、實際 receipts、gate exits／counts、A/B、cleanup 與 Git 狀態見 `qa-evidence/sync-efficiency/handback.json`。父流程已接回唯一 writer，核對 146 個輸入及 13 份紀錄／日誌零漂移；收尾只修正本文件的交付狀態，不改測試過的產品／SQL／測試 bytes，不重跑無變動的矩陣。最終本機 commit、tree、檔案範圍及交接核對另記於 `qa-evidence/sync-efficiency/local-delivery-receipt.json`；`.hermes/` 計畫與 ignored QA 證據不提交。正式SQL完成並核對前，不把本機完成解讀為已上線。
