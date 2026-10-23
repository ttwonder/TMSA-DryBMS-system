# 瀏覽器列印／另存 PDF：本機候選交付

## 範圍與狀態

- 起點 `main`／`0b1d30a3542dcbf5171d58f1f07d2a858f3d84a0`。本批**未stage、未commit、未Push、未部署**；父流程另做有限review、native對話框核對及本機commit。
- 使用者已選擇列印預覽／另存PDF，明確取代舊contract直下載／嵌入大型TTF規定。Excel、角色、導航、三主題、業務保存、SQL／api/session authority均不更改。
- `render*Report<T>`共享既有五類完整內容，legacy PDF writer與新HtmlReport共用投影。mounted頁面不再呼叫build/download PDF。大型舊字型與legacy純API保留，不刪檔。
- 同步保留窗口、原授權canonical快照、既有篩選前後核對、安全rich-text HTML、session／actor／API／unmount守衛。資料未授權不得填入窗口；popup被阻擋明示重試。通知／audit只表示授權提供列印快照，從不表示已保存PDF。

## 實測證據

完整manifest：`qa-evidence/browser-print/handback.json`，含每個changed path的SHA-256、命令／exit／logs及產物路徑。

| Gate | 結果 |
|---|---|
| 原mounted備註＋封鎖所有字型網路 RED | exit 1；實際TTF請求1、print 0；失敗證據保留 |
| 新純單元 `tests/browser-print.test.ts` | 8/8 |
| `npm test` 最終bytes | 455/455 |
| `npm run typecheck`／`npm run build`／`git diff --check` | 全部exit 0 |
| `npm run qa:browser-print` | 20 cases PASS；14份真Chrome CDP PDF，共88頁 |
| `npm run qa:browser-print-artifacts -- <receipt>` | 14份PDF PASS；所有90行長文標記、CJK／箭頭／下標、最小字級／頁界／非空頁檢查 |
| `npm run qa:report-selection`（只改PDF交付期待） | 37 cases PASS／12產物；45筆跨頁明選Excel及原精確部門交集assertions保留 |

- RED：`qa-evidence/browser-print/red-2026-10-23T13-56-21.114Z/receipt.json`。
- 最終瀏覽器：`qa-evidence/browser-print/green-2026-10-23T14-15-12.083Z/receipt.json`；同目錄含HTML、canonical JSON、DOM文字、PDF、expected JSON、PDF全文、首頁／中頁／尾頁PNG及`artifact-verification.json`。
- 篩選／Excel：`qa-evidence/report-selection/green-2026-10-23T14-06-36.018Z/receipt.json`；包含雙語、1440／390及normal／dark／eye主題原App截圖。
- 正向每次列印均核對exports+1／audit+1、business records不變。無授權階段拒絕零export；已授權後canonical窄化／使用者取消／退出，保留實際已授權紀錄但print 0，不造保存成功。
- 最終14次列印入口到stub print觀測：95.11–210.86ms（中位194.45ms）。僅本機合成資料、dev App及本機DB的觀測，不是正式速度SLA或正式修復聲明。實際CDP產檔與截圖時間另記在各artifact的elapsedMs。
- 最終字型網路請求0、外網被請求0、pageerror0。所有owned browser／Vite／HTTP／PostgreSQL已停止，receipt證實三個port均關閉，資料與失敗證據未刪除。

## 入口／內容覆蓋

- Reports：framework／remarks／improvements／inspection／overview；TMSA／DRYBMS備註與框架；英文framework正向。
- FrameworkPage：TMSA、DRYBMS；Overview；Inspections清單及唯讀視窗；Improvements主清單。
- 安全鄰居：popup blocked→retry、空章、原部門OR×章節AND／saved[]／無部門、空active、canonical變更、native權限拒絕、pending關窗／navigation／signout、busy恢復；Excel等待後退出仍不下載。
- 報告沿原投影保留完整標準／雙語／frozen來源、備註三組、改善metadata／內容／計劃／所有進度／階段及變更歷史；原Excel內容與樣式未改。rich字串不當HTML執行，測試含script文字及粗體紅色／清單／中文／箭頭／下標。
- 曾有QA fixture於早期migration import階段失敗（INVALID_FINDING、INVALID_PAYLOAD）；只改合成fixture符合當時schema，未改產品validator／SQL。曾有10個舊button-label／直接PDF函式source contract測試失配；按已批准文案／路徑修正，原初始化順序、空選停用及canonical要求仍測。

## 限制／父流程剩餘

- print()在自動QA中stub，用真Chrome `Page.printToPDF`另產實際PDF；**未將stub、afterprint或CDP當native列印對話框／用戶已另存成功**。父流程應核真native對話框，並獨立核PDF全文／視覺。
- 自動產物驗證覆蓋長行marker全集與核心field marker及幾何；不是任意正式資料的逐字完整證明。已視覺查看長備註／改善首頁及中續頁，無空白首頁／裁切、重複識別與表頭可讀；其他產物保留供父核對。
- 未測所有瀏覽器／OS字型、特殊Unicode、瀏覽器列印選項組合；系統字型取代舊嵌入字型，不再保證legacy fontkit同一換行幾何。使用者自行變更縮放／紙張可能改版。
- 正式Supabase／GitHub Pages、正式資料／正式export完全未操作。不宣稱independent review PASS。
