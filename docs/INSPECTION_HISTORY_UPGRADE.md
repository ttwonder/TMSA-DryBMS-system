# 歷史檢查修訂：正式手動安裝指南

本次只準備並演練本機SQL，沒有連接正式Supabase，沒有重新匯入或批改原資料。

1. 確认選中專屬TMSA／DRYBMS專案；原001–007必須已安裝。不要重跑001／bootstrap／業務seed。
2. 由使用者在Supabase SQL Editor完整貼上並執行 `supabase/migrations/008_inspection_history.sql` 一次。它只修改函數定義及私有函數ACL；所有record／audit／operation原資料不動。
3. 執行唯讀 `supabase/inspection-history-readback.sql`，須看到 `PASS_INSPECTION_HISTORY_INSTALL_ONLY` 且8項checks全true。`UNKNOWN_PREDECESSOR` 時停止，不跳過防線；`ALREADY_INSTALLED` 時只跑readback，不重裝。
4. SQL成功後才由使用者Push／部署本機確認的前端。前端未安裝008前直接修改final會被舊SQL拒絕；前端不會假裝保存成功，草稿仍保留。
5. 部署後用一筆獲准測試的檢查執行直接修改、保存、重新讀回，確認相同id／來源及上一次檢查成績。正式UI驗收仍未執行，本機結果不能代替。

## 使用及保稿界線

- 歷史「保存檢查」是明確手動上雲，顯示「已由伺服器確認」才算成功。綠燈及本機草稿不是server ACK。
- 本機保稿只在此分頁sessionStorage，相同登入／配置／分頁可在重整後按「恢復本機草稿」。不要退出登入或關閉分頁作為解鎖方法；本機保稿失敗時不要關閉。
- 失鎖按「核對／重新取得編輯鎖」。只有相同版本可續存；VERSION_CONFLICT時保留內容並與他人的最新版本人工核對，沒有自動覆寫或stale CAS retry。
- lost-ACK不確定時用原保存操作重試或核對。重整後若同操作的server回執存在，可確認原結果且不再新增事件；沒有回執則保留待核對，不會生成新操作假裝成功。
- 不再用「修訂副本」工作流。原先已存在的副本仍保留；不合併或刪除歷史記錄。
- 既有來源raw／snapshot／關聯改善不隨文字修訂改寫，原版本保留於操作記錄before／after。已連結改善的finding分類及itemIds不可改，避免破壞來源關係；可以修改觀察／建議。
