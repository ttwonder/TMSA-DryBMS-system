# 報表篩選及密度修訂候選（1–9）

> 前段保留最初 writer 交回時的紀錄（當時 PARTIAL）。**目前父流程補核結果見末段「父流程補核與關閉」**；不可把前段過期缺口或舊測試總數當作目前狀態。

基準 HEAD：`5ea4eff28ca8d525def44415bcb28d0882ac8c2f`。唯一 canonical writer 在原 repo 實作；本批不stage／commit／Push／部署。來源管理明確留下一批，無SQL、來源身份或保存協議修改。

## 已實作

1. 共用多選來源／章節／部門／人員元件及 selector；同維OR、跨維AND、舊scalar相容、明選及canonical再核對，Overview不帶入新陣列篩選。
2. HTML報告恢復ratio欄寬；改善／備註整組單一table、metadata橫排、全文滿寬與續頁識別，減少重複header及間距。
3. HTML及舊TextPdf renderer同步12pt；XLSX正文、欄頭與富文字run同步12pt，真正報告／章節標題例外。
4–5. 普通內容不再固定9／10行拆分；極長仍無損續列，保留全部filterable原值。同組重複號名以白字及淡續列邊框抑制，不以相同code合併不同record。無垂直合併資料格。原生Excel驗證發現`;;;`會破壞篩選，已移除而非放寬oracle。
6. 共用canonical日期＋顯示名稱篩選命名，最多170字元stem；縮短時明示文件內完整範圍。瀏覽器title僅建議PDF名稱。
7. 指定中英文說明已刪，純builder無範圍文字時原兩列隱藏；mounted報告只顯示實際篩選範圍，非替換成大說明帶。
8. 每列個別測量；不再256pt或common-max。原生Excel揭露續文末端硬換行多一行，已補算。最新長文native AutoFit差約1.6–2.2pt；普通含長metadata列仍可有較保守餘量。
9. PDF／XLSX共用改善報告排序：urgent/high/medium/low，targetDate升、proposedDate升、缺值後、stable ID tie。主清單原排序不變。

## 真實驗證

- 真RED：多選行為、HTML欄位／字級、Excel說明帶／列高、報告順序、mounted print命名；保留首次測試語法錯誤及修正後真RED，沒有把setup error當行為RED。
- `npm test`：466 PASS；`npm run typecheck`、`npm run build`、`git diff --check` PASS。
- `npm run qa:report-selection`：原App＋owned PostgreSQL 018–022，39 cases PASS（既有37＋多選主頁／報告中心），14實際PDF/XLSX產物；含390px繁中／英文、跨40頁明選、零集合及Overview分離。
- `npm run qa:browser-print`：21 cases PASS，14份真CDP PDF，2份mounted下載長文XLSX，字型網路請求0；完整1000行富文字大於32767字元經真正保存／授權／下載，完整stream精確比對。
- `npm run qa:browser-print-artifacts -- <receipt>`：14份實際PDF全文、12pt span下限／標題例外、邊界、無空白頁PASS；第一／中間／末頁有render。
- `npm run qa:report-refinement-native -- <receipt>`：原生Excel DispatchEx、CorruptLoad=0、唯讀copy，真filter／雙向整表sort／metadata與全文association、AutoFit及PDF render；原檔與copy hash未改，owned Excel退出。最新一般7份及極長2份工作簿通過；前次`;;;`與硬換行clipping FAIL證據保留。

## 未完全關閉／限制（整批PARTIAL）

- 框架／歷史／總覽HTML雖已恢復橫欄及ratio，長短敘述並列仍會在短欄留下空白；尚未證明所有情境已達使用者要求的最緊湊合理版面。已看實際框架及改善PDF render，不冒稱此項完全閉環。
- 行高為瀏覽器測量加有限安全餘量，不是Excel自身的精確AutoFit算法。原生證據證明本次完整下載樣本不裁文；未證明所有字型／任意未來文字均為數學最小高度。任意使用者排序後需AutoFit；原分組視覺應以原始匯出閱讀，不承諾任意排序可自動還原（相同display code不同真Item尤其如此）。
- 多選頁的390px zh/en已測主頁；報告中心新多選的展開mobile全矩陣尚未獨立補齊（原既有報告控件mobile矩陣已跑）。
- 名稱來源是canonical；FrameworkPage XLSX完整篩選長名的文件內scope補充尚未逐入口再驗，勿把報告中心名稱測試當全部入口驗收。
- PDF是Chrome CDP真產物，不是native Save-as-PDF對話框；前輪桌面操作拒絕未重試。非正式Supabase／部署驗收。未擴做全庫audit。

完整命令、輸入前後hash、changedPaths SHA、失敗及cleanup收據由 `qa-evidence/report-refinement/handback.json` 索引。QA證據全在ignored目錄，不在public或dist。父流程接回唯一writer ownership後先核驗上述剩餘項。

## R1 限定補核

獨立review唯一 R1（條目備註長scope固定44pt裁切）已在原builder與原生Excel重現：20章長名稱的末端17個章節標記不可見，短scope正常；同共享函數的改善／進度表也有裁切。修正僅按合併區欄寬測量scope高度，保留第4列表頭、filter/freeze座標及12pt；超過Excel單格／兩列容量時明確拒絕，不產生已裁掉的檔案。

實際瀏覽器Canvas再次產檔後查出長scope的原生行距為16.08–16.11pt，原15.4pt會裁掉最後一行；校準scope行距16.2pt，而非整表放大或改正文。最後三份瀏覽器產物（長備註、短備註、長改善）四個scope區在原生Excel PDF全部全文可見、原檔bytes不變、owned Excel及browser/server清理。Node fallback先通過不冒充browser Canvas通過；中間失敗收據全部保留。新回歸及完整 **471 tests／typecheck／build**通過，其餘未受影響證據沿原review攜入，僅做R1 closure。

證據：`qa-evidence/report-refinement/r1-scope/red/`、`r1-scope/browser-leading-green/`，與 `r1-tests-final.log`、`r1-typecheck-final.log`、`r1-build-final.log`。

## 父流程補核與關閉

已補齊具體缺口；獨立 review／本機提交證據另綁精確候選。本批仍不 Push／部署或正式 SQL。

- 多選報告中心補驗桌面／390px、繁中／英文展開幾何及選取保持。
- PDF 長短欄不均時按預估高度選擇滿寬流排；無法省高的短硬換行維持橫表，不為了滿寬反而增長文件。六個 framework／inspection／overview×雙語長段落控制（兩側皆12pt）實測內容高度比固定欄比較組少36.6–58.4%，不是所有報告的普遍減頁承諾。
- FrameworkPage Excel 下載補入完整 canonical scope；長 scope 的標題列按內容增高。可見 Excel 頁尾文字與頁碼明確12pt。
- 總覽 PDF 改善清單補上相同緊迫度→截止日期→提出日期排序；有正確 fixture 的實際 RED→GREEN。
- 原生 Excel 校準內容欄寬與窄中英混合模板欄安全內距，逐列檢查同時拒絕裁文及多留一整行（15.4pt）。未恢復共同最大行高。
- 舊已註冊產物 checker 仍採14pt、request輸入順序與排序後共同列高的 oracle，已依新契約修正；原失敗保留，沒有把新輸出改回舊規則。

最新本機證據（原App／真renderer＋合成資料＋owned native PostgreSQL，不是正式驗收）：

- **470 tests、typecheck、build、whitespace check PASS**。
- **報告選擇40 cases；browser-print 21 cases PASS**。
- **14份CDP PDF／43頁**：文字、12pt下限、頁界與無空白頁 PASS。
- **已註冊 report-selection artifact command 的14份 PDF／XLSX全部 PASS**。
- **11份XLSX**：正常原生唯讀開啟、初始逐列高度、整組篩選、雙向排序關聯及排序後明確AutoFit PASS；含完整scope、12pt頁尾及>32767字元富文字長文。原檔與副本bytes保持、owned Excel退出。

主要收據：

- `qa-evidence/report-refinement/selection/green-2026-10-23T16-32-26.516Z/receipt.json`
- 同目錄 `artifacts-85ab01c6.json`、`native-refinement-b4012705.json`
- `qa-evidence/report-refinement/browser-print/green-2026-10-23T16-33-05.783Z/receipt.json`
- 同目錄 `artifact-verification.json`、`native-refinement-f7577148.json`
- `qa-evidence/report-refinement/parent-height-closure-tests.log`
- 雙語密度控制的實際 HTML／PDF／receipt：`qa-evidence/report-refinement/density/`

一次 native checker 的外層等待逾時，但同一份完整七工作簿收據隨後完成PASS及清理；後續註冊 artifact command 也獨立正常結束PASS。最初handback與所有失敗收據未改寫。

保留限制：CDP產物／預覽不等於native Save／Cancel；原被拒絕桌面操作未重試。最終PDF檔名仍由瀏覽器／使用者決定。Excel極長內容仍受32767字元／409.5pt上限而需安全續列，保留少量字型相關餘量，不宣稱任意未來文字的數學最小高度；任意排序後需AutoFit，原視覺分組不保證自動還原。來源目錄管理屬下一獨立批次，沒有在本批改SQL／來源身份／權限／保存協議。
