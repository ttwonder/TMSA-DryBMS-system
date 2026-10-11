# 台塑海運 TMSA & DRYBMS 管控與評估平台

React / TypeScript / Vite 前端，GitHub Pages 發布，Supabase 保管共享資料、身份、逐筆編輯鎖與操作紀錄。單一原始碼資料夾：`E:\Projects\TMSA&DryBMS-system`。

## 功能範圍

總覽、TMSA、DRYBMS、待改善項目、歷史檢查記錄、報告中心、管理。逐條自評與佐證、多選部門及執行人、改善事件流及結案、外部檢查快照、框架條目調整、角色與人員管理、可搜尋操作歷史、Excel/PDF、目標試算、中英文及手機介面。

## 資料與計分界線

- TMSA公司基準：20分章、288個Item，含公司第14章人因。各Stage全部有效Item已更新且Yes才達標，必須由Stage1連續達標。各分章等權平均0–4；不是官方13 Element成績。
- DRYBMS：30主題，四級成熟度，沿用另一對話的412列分析索引（不是官方條款編號）。原附件已知裁切/不確定缺口保留；未知條文不得算已符合。逐項YN與四級百分比自評是不同欄位，依Guidance v1.1第7頁降權計分。
- 已匯入的Mandeep及Exxon發現報告，不等於完整逐項外部成績。未有完整評定時顯示尚未完整記分；不假設未列項目Yes、不把OFI直接判No。
- 公司自評、佐證、稽核、全文來源及私有匯入包在 `private-seed/`；**此資料夾不進Git，也不進網站公開assets或dist**。Supabase正式空库由Owner確認私有匯入。公开Excel仅无正文样式模板。

## 本機開發

```bash
cd 'E:/Projects/TMSA&DryBMS-system'
npm ci
npm test
npm run typecheck
npm run build
npm run dev -- --port 4641
```

前端的連線設定只允許Supabase Project URL＋publishable/anon key，不能填service_role/secret key。`VITE_SUPABASE_URL`及`VITE_SUPABASE_ANON_KEY`可放在未提交的`.env.local`，或於網站連線設定填寫。沒有可用後端時，網站明確停留在連線設定，不用本機假資料覆蓋正式雲端。

本機原生PostgreSQL與真實UI測試方法在 `docs/BACKEND.md`；來源匯入在 `docs/SOURCE_DATA.md`；輸出在 `docs/REPORTS.md`；實際分層驗證紀錄在 `docs/LOCAL_VERIFICATION.md`。部署需用的離線一次性碼工具為 `docs/BOOTSTRAP.html`，不連網、不替你執行SQL。所有QA要標「真實UI＋測試資料／本機副本；非正式Supabase」。

## 發布界線

先完成本機與部署交接核對，再由使用者在GitHub Desktop加入**這一個資料夾**及Publish/Push。正式Supabase SQL、一次性Owner初始化、私有資料匯入和正式讀回核驗分開。尚未部署不能稱已上線。詳見 `docs/DEPLOYMENT.md`。
