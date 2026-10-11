# 初始匯入：上傳時間與前端等待上限修復

> 本頁保存第一階段 frontend-only 修正的證據。其後正式日誌已確認後端 `57014`，第二階段的限定 SQL timeout 修復、migration/readback 與操作順序見 [IMPORT_SQL_TIMEOUT_REPAIR.md](IMPORT_SQL_TIMEOUT_REPAIR.md)。下列「尚未取得 SQLSTATE」描述的是第一階段當時狀態，不能作為目前判斷。

## 結論

本次已實證一個會令完整初始資料匯入失敗的原因：前端把所有 RPC（包括大型初始匯入）的完整請求等待時間一律限制為 20 秒；實際瀏覽器對既有專用 Supabase 的完整大小只讀請求，僅上傳就用了 25.7 秒。因此，資料還沒傳完，前端便中止請求並顯示 `NETWORK_UNKNOWN`。

這不是重新安裝、重建 Owner 或重新填連線設定可以處理的問題。

## 證據與界限

### 原始資料及正式 SQL：本機原生 PostgreSQL

- 同一份私有初始資料、未修改的正式匯入 RPC。
- `anon` 執行角色，3 秒 SQL 上限：完整驗證／匯入在 2.51 秒完成；該對照交易明確 rollback。
- 60 秒 SQL 上限：2.37 秒完成，明確 commit，資料庫讀回 1,608 筆業務記錄：framework 2、chapter 50、item 700、assessment 700、improvement 124、inspection 2、dryScore 30。
- 原始私有檔及 migration bytes 未變；owned 測試資料庫已停止。
- 以上是本機原生執行證據，不是正式 Supabase 匯入成功或正式 SQL 執行時間的證據。

### 既有正式 Supabase：隔離瀏覽器、只讀請求

- 從目前發布網站的公開設定核對預期專案及 `anon` key 類型，不輸出任何 key。
- 只呼叫 `bootstrap_status`。該分支由目前 migration 確認只讀；不登入、不執行 `import_seed`、不寫入業務記錄。
- 大型診斷內容是非私有測試字串，不包含私有來源。

| 請求 body | 等待上限 | 實測結果 |
|---|---:|---|
| 小型狀態請求 | 20 秒 | HTTP 200，約 0.6–0.8 秒 |
| 64 KiB | 20 秒 | HTTP 200，1.25 秒 |
| 256 KiB | 20 秒 | HTTP 200，2.34 秒 |
| 1 MiB | 20 秒 | HTTP 200，8.96 秒；上傳約 7.26 秒 |
| 4 MiB | 20 秒 | 前端 AbortError；NetLog 顯示取消前仍在上傳，尚未進入等待回覆標頭階段 |
| 14,769,232 bytes | 20 秒 | 前端 AbortError |
| 14,769,232 bytes | 60 秒 | 當次前端 AbortError |
| 14,769,232 bytes | 180 秒 | HTTP 200，29.30 秒；上傳 25.74 秒 |

不同時間的傳輸速度有差異，60 秒那次未完成不能被解讀為伺服器存在固定 60 秒上限。180 秒那次成功亦不保證所有網路狀況都能成功。

曾觀察到的另一筆正式 HTTP 500 尚未取得其 SQLSTATE／操作內容。以上證據不能把它直接定性為資料庫逾時，也不能排除正式環境另有問題。

## 最小修正

`src/api.ts`：

- 只把 `import_seed` 的完整請求等待上限設為 180,000 ms。
- 其他 RPC 維持 20,000 ms。
- 等待上限仍包含回覆 body 解析，並在 finally 清除 timer。
- 不增加初始匯入自動重播。
- 原本身分／epoch 檢查、伺服器驗證、原子匯入與 fresh-workspace guard 保持不變。
- 不改 UI、導航、資料格式、權限、SQL、連線設定或部署形態。

`tests/api-import-deadline.test.ts`：以實際 ApiClient、受控 transport 和 deterministic timer 驗證：

1. 30 秒才完成的初始匯入不再於 20 秒被中止；此案例在原程式 RED、修正後 GREEN。
2. 一般請求仍於 20 秒中止。
3. 初始匯入仍於 180 秒中止並保留結果不明，不自動重播。
4. 已變更登入身分／epoch 後，舊匯入回覆仍被拒絕。

這四個客戶端測試使用受控回覆，不能代替正式 Supabase 資料匯入驗收。

## 驗證及部署邊界

本機驗證命令：`npm test`、`npm run typecheck`、`npm run build`、`npm run qa:native`、`npm run qa:browser`。

本次是 frontend-only 修正，不需要重新執行安裝 SQL、初始化 SQL 或重新建立專案。由使用者 Push；其後應獨立核對 exact-SHA Actions／Pages 與實際發布資產中的新等待上限。

在正式重新匯入前，仍須先核對最新匯入標記、業務 counts 及有必要時的進行中活動。只有確認可執行並取得使用者對正式匯入的決定後才匯入一次。最終需正式讀回完整 counts；本機成功、只讀大請求成功或前端更新都不是正式業務匯入完成。
