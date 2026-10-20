# General Manager 手動備註完整隱藏：015 本機交付

## 最新契約與交付邊界

使用者明確選擇「完整隱藏：頁面不顯示、不能匯出，伺服器也不回傳備註及其狀態」。此文件是 `MANAGEMENT_VIEWER_ACCEPTANCE.md` GM-R1／GM-R2 的有限修訂交付；`MANAGEMENT_VIEWER_DELIVERY.md` 原013證據保留，當時允許GM備註的約定已被取代。

本批交付為核驗後的獨立本機 commit；**未 Push、執行正式 SQL 或重新建立 GM 帳號**。起點為 `41dc9f870047b7515165831db1f7f332e2576fcb`、clean working tree。父流程已核對14檔候選、測試來源雜湊、68組證據檔案雜湊及25份命令紀錄；307單測、75 native、原013回歸57、27 UI、26 wire檢查及12份實際下載通過。精確commit／tree與commit-blob SQL Preview另記於 ignored `qa-evidence/gm-remarks/local-delivery-receipt.json`；正式SQL／Push由使用者執行。使用者已回報013／014與舊前端部署完成、GM正在使用，不將本次本機PASS當作正式新功能已上線。

## 實作範圍

- `FrameworkPage` 以伺服器 `viewScope=management_viewer` 排除完整 `.item-remarks` 區塊，包含標題、五態標籤、正文及空白提示，TMSA／DRYBMS共用同一判定。
- `Reports` 對GM沒有「條目備註」選項，原事件入口也拒絕remarks；共用 `selectedRemarkRows` 拒絕restricted snapshot，兩個直接Excel／PDF builder在讀取資產前即拒絕。
- 新增 `supabase/migrations/015_management_viewer_remarks.sql`：只替換三個既有私有函式的五處精確seam，不新增helper或公開API；以014有效catalog的16個精確前置hash、完整四RPC、owner／ACL／SECURITY DEFINER／search_path及替換次數保護。前置缺失、漂移、未知額外overload、ACL異常或重複安裝均拒絕。
- 只對真實 `management_viewer` 移除 `assessment.remarks`／`assessment.remarksStatus` 兩個JSON鍵，不按名稱或部門、不掃「備註／改善」字詞。非GM資料投影及原權限完全不變。
- 不修改CSS、密度、評分、共同editor、lease／CAS／ACK／pendingUnknown、身份系統、10秒更新或正常版本規則。後續「依已選部門篩選執行跟進人候選」需求不在本候選內。

## 真實傳輸路徑核對

| 路徑 | 015行為／保留證據 |
|---|---|
| 4參數 `read`／私有 `state` | 只在assessment陣列投影移除兩鍵；其餘欄位逐筆與資料庫相等 |
| 6參數 read overload | 沿原四參數讀取，得到相同排除；不允許export動作 |
| 5參數 boolean overload | 原本只允許首次import，不是讀取途徑；read／export仍拒絕，GM import仍FORBIDDEN |
| 文字performance `sync` cold／warm delta | 在真正輸出assessment body處移除兩鍵；完整version vector、scope、snapshotToken機制不變 |
| `sync_check` | 沒有業務body，無新增清洗；native smoke確認compact marker、cold／warm、變更後delta及匯出新鮮度 |
| `inspection_detail` | 原inspection只有凍結定義、results／findings等，不攜帶當前assessment兩欄；原文完整相等，不改此途徑 |
| 新舊 `export_authorize` | GM `filters.reportVariant=remarks` 都FORBIDDEN，拒絕前後所有實體表摘要相同，沒有export snapshot／audit副作用 |
| 允許的framework／overview／inspection匯出 | assessment投影先排除兩鍵，再產生授權回覆與持久化exports.snapshot；兩者逐字JSON相等 |

015為DDL，未UPDATE／DELETE業務列、原備註、歷史或audit。既有私有歷史export快照也不批次改寫；本次管制的是新讀取及新授權快照，系統沒有開放舊私有exports表讀取的新API。

Owner／admin／operator可按原能力查看、保存及匯出手動原文與全部五態。舊vessel按原矩陣保留讀取；預設沒有exportReports仍拒絕匯出，沒有為正控制擴權。GM的自評、Y/N／符合程度／執行狀態／分數、部門／跟進人、Implementation/evidence、來源note、歷史原始觀察／建議／凍結來源保持。原唯讀、改善排除與六入口保持。

## 本機證據與重跑入口

證據根目錄為 ignored `qa-evidence/gm-remarks/`，最終機器可核對清單：`handback.json`。其包含起點、changedFiles、逐檔SHA-256／allInputSHA256、實際命令與exit code、RED／GREEN receipt、完整readback、下載雜湊、cleanup與source drift。所有案例數以receipt程式聚合，不沿用013的舊數字。

- 行為RED：原014 native GM全量讀取確實回傳手動備註；原直接備註selector與Excel builder也沒有拒絕。不是缺新函式名稱或CSS字串測試。
- GREEN：獨立native PG按013→014→015執行；比對完整實體列含xmin／ctid、函式屬性／ACL／owner、四公開入口；測試非GM逐字投影、五態保存／輸出、GM full／cold／warm／detail／兩代export、拒絕零副作用、role／停用／登出失效。
- 原App＋native合成資料：1440與390、繁中與英文、TMSA與DRYBMS備註整塊缺席；保留責任分工、自評及佐證，六入口／報告選項、刷新與同瀏覽器operator登出→GM登入邊界。獨立browser只准localhost。
- GM實際8份允許下載：兩體系各framework XLSX／PDF、inspection PDF、overview PDF。沒有GM備註下載。另有operator兩體系各remarks XLSX／PDF共4份正控制；原文字節、五態標籤與五色均核對。
- PyMuPDF、openpyxl及獨立原生Excel檢查實際下載：GM檔案無manual markers／兩欄、來源文字照常；非GM備註有正文及色態；PDF字級／邊界與Excel原生開啟／列印通過。只停止自己啟動的Excel，不關使用者視窗。
- 原生sync-efficiency有限smoke沿原ApiClient：cold、warm重用、compact `sync_check`、正常version變化、hidden-control回覆不變與export新鮮度。沒有重跑全套A/B量測或無關全站layout。
- 全套 `npm test`、`npm run typecheck`、`npm run build`、`node scripts/verify-public-artifacts.mjs` 與diff檢查；build保留原reports模組靜態／動態import混用警告，未另做chunk架構修正。

可重跑（全部為本機，不連正式資料庫）：

```text
node --experimental-strip-types scripts/verify-management-viewer.mjs --latest
node --experimental-strip-types scripts/verify-management-viewer-ui.mjs --latest
uv run --offline --no-project --python 3.12 --with pymupdf==1.26.5 --with openpyxl==3.1.5 --with pywin32 python scripts/verify-management-viewer-artifacts.py <UI receipt.json>
npm test
npm run typecheck
npm run build
node scripts/verify-public-artifacts.mjs
```

native runner預設仍是013伺服器回歸；原 `--baseline` 模式保留，`--latest`明確包含015。`--remarks-red`以014後端驗證新期望，預期失敗，不是交付通過門檻。UI使用目前App，預設安裝013但最新全層驗收須用 `--latest`。artifact verifier也可讀舊013 receipt，不把舊GM備註下載混進015計數。

## 正式待部署（使用者／父流程）

1. 本機候選已由父流程核驗；交接必須使用本批獨立commit blobs生成的完整015＋readback SQL Preview。ignored QA、`.hermes`或本機排除規則不提交。
2. 使用者確認正確正式專案及已安裝014，僅執行 **015**。不重跑001–014、不重新匯入／建帳。
3. 另開新唯讀查詢執行 `supabase/management-viewer-remarks-readback.sql`。精確預期：`status=PASS_MANAGEMENT_VIEWER_REMARKS_INSTALL_ONLY`、`checkCount=24`、完整24個 `checks` 全為true；handback保留本機實際完整結果。缺check、不同status/count、false、錯誤或未知結果均停止，不以重跑寫入處理。
4. 使用者Push／發布新前端。所有已開舊分頁重新載入／重新登入，避免舊頁保留安裝前已取得的資料。正式SQL與新版前端尚未同時部署之前，不宣稱新缺席契約已在正式站生效。
5. 正式GM確認兩體系備註區與條目備註報告入口缺席，代表性允許報告沒有手動備註；普通角色備註仍可使用。正式UI／帳號及下載驗收尚待使用者完成。

本次為一次有限自檢；修正過native驗證腳本對vessel原匯出能力及export主動刷新cache的假設，沒有為讓測試通過修改權限或同步產品邏輯。所有失敗嘗試與最終GREEN均保留在handback命令清單；不把本機合成資料結果稱為正式驗收。
