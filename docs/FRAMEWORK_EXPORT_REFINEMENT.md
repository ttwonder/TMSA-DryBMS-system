# 框架輸出精簡修訂

## 最新追加：英文／中文自評同列等寬（取代前批七欄）

- 使用者最新要求僅拆目前自評：精簡 XLSX／PDF 為 Item、KPI、BPG、Y/N、英文自評、中文自評、佐證、中文部門八欄。E／F 各沿原自評欄寬 58.265625，不把舊欄硬分半；其餘欄寬保持。Excel 一 Item 一實體列、A:H 篩選／列印／末端註記，資料列不合併。
- 完整資訊 PDF 自評也英文左、中文右，同一邏輯列等寬。僅此 pair 使用平行標記及真正兩欄網格，避免通用長文滿寬重排與100格 colspan 像素累積誤差；其他欄位／報表流不改。長自評可跨頁，正常12pt，不用縮字湊PDF頁。
- 兩語各自原文／富文字／非空行保留，空語言維持空，不互相fallback。Excel各語獨立32767字元上限；32k＋32k可保留，任一超限則指出該Item停止。原局部11／10pt、409.5pt警告與排序後AutoFit契約保留。不承諾所有極端長內容都降高或完全可見。
- 不改資料儲存、角色、scope、授權、SQL、模板、private seed、其他頁面或業務操作。

### 本批實際證據（不是沿用前批結果）
- Excel 行為 RED：E 格仍混入中文；GREEN：純英文 E／純中文 F、等寬、富文字、12pt、八欄篩選與獨立字元限制。完整PDF RED：兩語未同列；GREEN：長內容pair不被重排、空值獨立、direct TextPdf geometry。direct PDF 是 builder 層，不冒稱 mounted。
- 原 App＋真 ApiClient＋owned native PostgreSQL migration23 重新跑17情境、14份實際產物（5 XLSX、9 Chromium PDF）。保留GM／operator、EN／ZH、DRY自訂章、部門OR×章節AND、saved-empty、無自評fallback、no-match／空章／空選負控制；新增24＋24行自評與單語空值。canonical回傳與資料庫儲存快照一致，業務記錄／非export audit不變。
- 新原生Excel5份全部正常唯讀開啟；八欄完整關聯、各sheet Activate、篩選／雙向排序／AutoFit、N色與佐證紅、富文字及原檔hash不變。自評兩欄 native ColumnWidth 均57.67（OOXML均58.265625）。24＋24短硬換行控制：舊同格409.5pt／10pt，新並排377.5pt／兩格12pt，native AutoFit需求369pt。此為特定控制，不是全資料通用降高保證。
- 100行overflow仍標示 LIMITED_USE_PDF_FULL_TEXT／PASS_WITH_KNOWN_OVERFLOW_LIMITATION；正常非overflow未發現native初始列高裁切，不把409.5pt AutoFit飽和值當作無裁切證據。
- 新9份PDF獨立解析核1564個非空行次、全文、頁界、至少12pt、粗體藍色；24行兩語逐行同頁同基線並分欄。mounted DOM精確語言streams、同y及等寬bbox另存各artifact。真Page.pdf不等於原生Save As或正式Supabase。
- 完整gates：491/491 tests、typecheck、build、nodecheck、native Python compile及git diff --check通過。完整input manifests及public/dist40檔（XLSX解壓內容）marker零命中見 final-gates.json；最後文件追加不改產品／測試／腳本bytes。
- 所有失敗收據保留：100欄網格1.5px誤差為mounted RED並以真正兩欄修正；空br innerText及相同order資料排序屬harness oracle，修oracle不改產品全文／scope。所有owned UI／API／PG及Excel PID已停止；native短路徑副本／render亦保留。

### 本批位置及交接
- `qa-evidence/framework-assessment-split/20261024-141638/`：RED／GREEN、舊builder控制XLSX、完整gate logs／manifest及本批handback。
- `qa-evidence/framework-assessment-split/browser-2026-10-24T06-28-10.156Z/receipt.json`：17情境／14產物，逐份path、SHA256、canonical SHA256、角色、entry及request。
- 同目錄 `native-92d1883b.json`（SHA256 adc1a8087ba3a0a08235962009bfed14758a9f80ade689c32aec8161191b066f）、`split-pdf-9e056320.json`（SHA256 e982695b6b4461db344a6e4c59fe29467e8455a6f9be95c54f4f7cc7c501f1a4）。
- PDF驗證器 `C:/Users/tuotu/AppData/Local/hermes/cache/scratch/framework-assessment-split-pdf.py`；舊解析器及前批證據未覆寫。
- 候選基底 `main`／`39b226729d3aabf06565964576ed01843fe43f3b`；唯一writer未stage／commit／Push／部署／正式SQL，交回父流程有限review與commit判斷。相同framework重複code仍受既有SQL禁止，builder雙stable-ID回歸保持；未冒稱native same-code驗證。

## 前批七欄範本與證據（本批僅覆蓋自評分格）

採用使用者最新保存的七欄範本（SHA256 `724126394c98c8473ea4a1f6ae0d42e9adbcc3d7d7cbd83bcf9a64766800d547`），僅擷取格式，不複製私有正文。此批只改框架輸出，不刪資料庫欄位；備註／改善／歷史／總覽維持原預設。

精簡 XLSX/PDF：Item、KPI、BPG、Y/N、canonical 年份目前自評、佐證、中文部門。每章保存選中啟用項目；一 Item 一資料列，stable ID 不按代碼合併。XLSX 標題第一列、欄頭第二列，正常12pt，正文完整同格；超高只局部逐步縮至11／10pt，仍超高明示用PDF全文，不續列、不截斷。任何正文格超過32767字元停止Excel並指出Item。範圍註記放資料末端，不塞入自評。末端註記前設隱藏空隔列，避免原生Excel把合併註記納入AutoFilter／排序。排序後須AutoFit。

完整資訊 PDF：報告中心新增「框架完整資訊」，PDF-only；原協議 `kind=framework`、`filters.reportVariant=complete`。保留完整框架要求、自評、佐證、人工備註／五態、reviewed／conformity／execution、級別、責任部門／人員、來源缺口／分析資訊與整章計分。以既有canonical授權快照產生；GM builder主動排除備註／狀態及改善整塊。無SQL變更。

## 已實際完成
- 原behavioral RED、舊6份產物/native與父流程英文框架中文部門檔名/scope regression完整保留。
- 新mounted RED：真server GM報告中心說明仍提受限備註/狀態。只修Reports.tsx restricted文案，同一真UI路徑GREEN，一般角色文案不變。
- 最後npm test 488/488；typecheck/build/node syntax/git diff --check均exit0。完整301檔input manifest涵蓋src/tests/scripts/supabase/public及root package/config，前後不變。
- 原App/CSS＋isolated native PostgreSQL migration23＋真ApiClient產生14份實際文件：5 XLSX、9 Chromium PDF。保留原6個scenario，新增server GM/operator完整PDF；英文marine及marine+technical部門OR×章節AND；saved-empty不回退、未存自評回退Item部門、no-match/active-empty/空選零export及export audit；DRYBMS原章及自訂章、inactive排除、Y/?、rich bold-blue及完整換行。
- 每次返回canonical與private.exports.snapshot完全相等；GM viewScope由server提供，remarks/remarksStatus keys缺席，improvements/auditLogs空集合；可見報告中心及完整PDF不含受限整塊。operator同fixture正向保留人工備註及改善全文。輸出前後業務records及非export audit完全相等。
- 完整資訊已選取的中英文桌面/390px手機PNG與geometry通過，PDF-only格式控制停用。英文UI部門選項仍Management，框架檔名及descriptor scope為管理組。
- 新9份PDF真bytes以PyMuPDF核對每個所選KPI/Guidance/自評/佐證及適用人工備註非空行、範圍外markers缺席、頁界與DRY粗體藍色。100個OVERFLOW、28個SHRINK及中文尾行完整，全文txt及首尾頁PNG保留。
- 5份實際下載均通過owned Excel唯讀/禁止宏links、逐sheet Activate後freeze、精確AutoFilter末列/七欄cell關聯、僅N驗紅底紅字、佐證紅字、DRY富文字藍色粗體/12pt、篩選/雙向排序/AutoFit/原檔hash不變及owned PID停止。COM Characters呼叫失敗保留，只修驗證器。
- 409.5pt極長列仍可見受限，native明列LIMITED_USE_PDF_FULL_TEXT及PASS_WITH_KNOWN_OVERFLOW_LIMITATION；同格全文及PDF警示保留，不能稱無裁切。
- public/dist共40檔（XLSX解壓XML亦查）針對本次fixture/private markers掃描零命中；不是全站公司來源審計。
- 父流程讀回實際英文完整PDF，發現部門篩選說明仍用英文部門；補behavioral RED→GREEN，只將該說明切為中文標籤。既有兩份已授權合成快照以原renderer重產PDF，完整327行次／頁界與中文說明讀回PASS；這是renderer replay，不另算mounted/native情境。原17情境及5份native XLSX證據沿用，XLSX另逐Item七格對canonical獨立精確核對。
- 父流程另核最新參考原檔hash不變；7個長原文片段對本批18個預定檔案與public/dist共58檔（含XLSX解壓XML）零命中，公開產物的合成fixture markers亦零命中。

## 明確限制與交付邊界
- 原生既有item_code_unique禁止同框架重複code；import_seed真拒絕DUPLICATE_RECORD。不改SQL/validator放行fixture。same-code由獨立builder regression驗兩stable ID/item.order/不同自評/inactive排除，不能稱native/mounted same-code PASS；這是既有資料模型邊界，不為測試放寬正式規則。
- 新fixture未擴全部originals或五態全排列；保留既有完整builder/單元回歸。PDF為stub window.print＋真Page.pdf，沒有重試原生另存/列印對話框，不是正式Supabase驗收。
- 本機提交須與四類有限獨立review批准的精確候選一致，實際提交與批准狀態以delivery收據為準；Push／部署／正式SQL仍由使用者決定。所有失敗成功證據保留，不刪資料夾；角色/權威/lease/CAS/ACK不變。

## 證據與命令
- 舊qa-evidence/framework-export-refinement/handback.json僅歷史carry，不當新候選hash。
- 新UI：qa-evidence/framework-export-refinement/browser-2026-10-24T05-00-58.921Z/receipt.json。
- 同目錄native-7af06154.json與closure-pdf-verification.json；新gate為closure-gates-20261024-130529.json，完整logs由收據定位。
- npm run qa:framework-export；npm run qa:framework-export-native -- <receipt.json>（既有uv offline依賴，未新安裝）。
- PDF解析器位於Hermes scratch/framework-closure-pdf.py，hash/命令在closure-handback-*.json；native verifier最後修復不改產品/既有產物bytes，其新證據取代前次native失敗。
- 最終父流程：parent-final-64fafe9d/receipt.json；兩份部門完整PDF修正：parent-department-2026-10-24T05-18-03.726Z/receipt.json及closure-pdf-verification.json。兩者位於qa-evidence/framework-export-refinement/。
