# TMSA第14章：兩層獨立計分範圍與正式交接

## 已完成的使用行為

- 總覽上方「納入TMSA14章」是公司共用設定：預設灰色關閉、納入為綠色。Owner／管理員可切換，全登入使用者看同一已確認值。只影響目前自評總分、公司目標試算及現況PDF；不連動既有歷史。
- 歷史檢查各有自己的開關，在原「直接修改／編輯草稿」內操作，按「保存檢查」才上雲。更新同一ID；原版本仍在audit，不建立修訂副本。
- 舊記錄沒有此欄位時，維持原本納入第14章；新建檢查只在開啟草稿時帶入當下總覽值，之後獨立。總覽改動不跟著改已開的檢查草稿。
- 關閉只排除計分，不刪除或隱藏第14章條文、評定、分章得分、來源、缺陷或改善。完整原20分章關閉時為19分章等權；篩選／啟停後依實際納入章數計算。章別用穩定ID `TMSA:14`，不靠可修改名稱／代碼。
- 排除章未完整評定或有來源缺口時，不抑制其他納入章的有效總分；該章本身仍顯示未完整／缺口。空範圍顯示未評而非0分。
- 第14章目標輸入在排除時停用，已保存目標保留；其他章目標仍可正常保存。DRYBMS計分完全不變。
- 歷史列表、總覽上一次檢查、草稿及歷史PDF使用同一份歷史旗標。現況PDF明示有效範圍；Excel維持原完整逐項、樣式與章sheet，不重加計分介紹區。

## 正式安裝順序（使用者執行）

1. 確認選中本專案專屬的 **TMSA／DRYBMS Supabase**，不是其他App。001–008必須已安裝；本批不重跑001、不重新bootstrap、不重匯公司資料。
2. 在Supabase SQL Editor執行完整 `supabase/migrations/009_tmsa14_scope.sql` **一次**。只更換validator／精簡歷史投影及新增私有helper，不改寫record、audit或operation內容；不改公用RPC簽名、帳號權限、lease/CAS規則。
3. 另開查詢執行完整唯讀 `supabase/tmsa14-scope-readback.sql`。應看到 `PASS_TMSA14_SCOPE_INSTALL_ONLY`，全部checks為true。其餘結果只列數量與旗標，不含密碼或來源正文。
4. 若出現 `TMSA14_UNKNOWN_PREDECESSOR`，停止，不移除檢查、不強制重裝。若 `TMSA14_ALREADY_INSTALLED_VERIFY_READBACK`，只跑readback核對。若任一check為false，先釐清，不Push新版。
5. SQL安裝核對通過後，由使用者Push此本機commit。依原GitHub Pages流程發布；確認Actions／Pages對應該commit後，才驗正式UI。
6. 正式驗收選一份允許修改的檢查：核對總覽開／關及第二帳號讀回；確認既有歷史不跟著變。再只修改該份歷史開關並手動保存，重新開啟核對同ID、旗標及成績，確認總覽設定與另一份歷史不變。最後各匯出一份現況／歷史PDF，核對標示範圍。正式改資料前仍須使用者同意。

安裝009後，舊 `inspection-history-readback.sql` 對最外層validator的008固定hash會按設計不符；不要據此重跑008。使用本批readback驗證009及保留的歷史規則鏈。

## 保存與相容界線

- 共用開關沿用原framework lease、版本CAS、operation ID及server ACK。等待確認／未知回覆時不開放另一個切換；可核對／重播原設定，不產生第二次業務更新。
- 有未保存公司目標時先保存目標，再切換範圍，避免同框架兩份草稿互撞。競爭鎖／過期版本會拒絕，不自動覆蓋。
- 歷史開關是普通歷史草稿的一部分，沿用原本機保稿及lost-ACK恢復；本機草稿不是雲端保存。取消零業務寫入。
- 新SQL保留舊客戶端省略旗標時的已存值，但舊前端不認得新計分範圍；正式發布後，舊分頁須先妥善保存／保留草稿，再重新開啟新版。不要把新舊前端混用的畫面差異當成雲端資料遺失。
- 若前端需暫停發布，保留已安裝009及資料不動；不要刪除已保存旗標或盲目回滾SQL。反向改造不屬本批授權。

## 可重現的本機驗證

```text
npm test
npm run typecheck
npm run build
npm run qa:tmsa14
npm run qa:tmsa14-reports
npm run qa:inspection-chapter-scores
npm run qa:shared-targets-ui
```

- `qa:tmsa14`：原App＋合成測試資料＋獨立本機PostgreSQL，經原ApiClient與本機RPC橋接以anon執行；不是假SQL回覆。涵蓋遷移零業務寫入、安裝readback、角色／版本／競爭鎖、同操作重播、歷史summary／detail／export一致、原UI取消／手動保存／跨客戶端／重整／雙語手機。
- `qa:tmsa14-reports`：實際PDF／Excel builders，透過PyMuPDF抽取可選文字及ExcelJS回讀；使用 `uv run --no-project --python 3.12 --with pymupdf`，不修改App依賴。比對開／關時完整Excel值、合併與欄寬，PDF驗有效分數、範圍及保留第14章文字。PDF樣本不是正式公司資料。
- 每次執行的receipt／截圖／樣本在gitignored `qa-evidence/tmsa14/`；receipt綁定當次產品及腳本SHA-256。早期失敗均保留，不覆蓋。
- 本機PASS不能代替正式Supabase、PostgREST網路、Pages部署或使用者實際資料驗收。本次沒有Push、正式SQL或正式資料寫入。
