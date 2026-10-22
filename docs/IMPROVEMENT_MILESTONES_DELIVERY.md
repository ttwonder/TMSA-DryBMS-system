# 具體階段目標：本機交付與 SQL 操作說明

## 新增／完整編輯的版面修正

- 標題維持原英文在左、繁中在右，第一行等寬平分；窄手機亦保留兩欄且輸入框上緣對齊。
- 英文及中文內容各佔獨立滿寬一行，左右邊界對齊；預設由5行降為3行，正文仍為16px且保留富文字／換行。
- 關聯章節區桌機上限180px，普通單行章節約4條可見；手機上限200px，長名稱自然換行。其餘章節以區內垂直捲動到達，不截斷候選資料、不改三層多選語義。
- `npm run qa:improvement-editor-layout`：原App＋合成資料＋本機原生PostgreSQL，25 cases PASS（新增／完整編輯 × 兩尺寸 × 雙語 × 三主題；另含真保存、富文字／跨體系章節及Item讀回、重開與新context讀取）。全部取消操作未改業務記錄。
- `npm run qa:improvement-reference-picker`：原有30 cases PASS；保留選取、展開、範圍及可及性行為。
- 版面證據：`qa-evidence/improvement-editor-layout/green-2026-10-22T23-30-26.892Z/receipt.json`。基線同目錄 `baseline-2026-10-22T23-25-46.858Z` 在新增／完整編輯均重現標題／內容／高度／章節視窗四項缺口；工具框線的次像素幾何、富文字編碼及innerText斷行均按實際控制修正測試，沒有為通過測試放寬產品規則。
- 此排版修正本身不需SQL；022是同批已授權的階段目標功能後端。

## 功能與操作

- 保留原富文字「改善計劃／執行計劃」，作為總體思路；在完整編輯及直接更新共用「具體階段目標」。
- 「＋新增階段」填寫純文字目標及預期完成日期。勾選已達成會先填本機當日，仍可更正實際日期；晚完成不會自動改動其他階段。
- 延期必填理由，預設依陣列順序順延後續未達成階段，也可取消勾選，只延期目前階段。前段、已達成階段及實際日期不動。
- 撤銷達成需理由；日期更正、延期、移除與目標修改保留變更歷史。移除已保存階段需確認，歷史不刪除。
- 所有操作先留在草稿，按原「確認保存」才寫入同一改善記錄；取消不寫業務資料。尚未套用的延期／更正操作會阻擋整體保存。
- 有階段時，完成率為等權已達成數／階段數；未全部達成最高99%，全部達成為100%。首次從手動切換會預覽及確認；移除最後階段回到手動並保留顯示百分比。
- 100%不自動結案；未全部達成不能結案。已結案階段唯讀，重開不清除已達成日期及事實。
- 整項「目標日期」不自動更動；階段日期超過總期限會提醒，需在完整編輯自行核對。
- 詳情／清單／體系 inline／總覽／報告中心共用完成率。PDF增加完整階段及變更歷史；Excel保留既有欄位位置，追加完成率、達成數、階段總數，並在有階段或歷史時增加兩張可篩選工作表。

## 已實跑的本機證據

本節是「真實原 App＋合成資料＋owned native PostgreSQL」，不是正式 Supabase／Pages驗收，也不是對正式資料筆數的查核。

| 層級 | 結果與證據 |
|---|---|
| 原保存行為 RED→GREEN | 未完成階段不能結案；原進度事件拒絕衝突百分比；總覽不能使用衝突的快取百分比。原新增視窗的缺少階段控制與報表缺少階段輸出也保留RED。 |
| 核心及報表單元 | 日期跨月、cascade、理由、撤銷／更正／移除、穩定ID、歷史鏈、舊手動、99%上限、完整長文字及整表輸出。全套數量及退出碼見 `qa-evidence/improvement-milestones/aggregate-layout-final.json`。 |
| 022 原生SQL | 82 cases PASS，catalog readback 25 checks PASS；安裝前合法新欄位確實被原RPC拒絕，安裝後原RPC保存及peer讀回成功。10張private表的count與含xmin/ctid digest不變；原owner／OID／ACL及公函式保留。 |
| 原 App | 26 cases PASS：新增／保存／取消／達成／更正／延期／撤銷／移除／最後階段回手動／結案重開／peer收斂／未知ACK同body同operation重試／失鎖及無效草稿保留／體系inline／總覽／雙語與三主題手機左右端。 |
| 真實下載 | 中英文各一份PDF及Excel；伺服器存下的授權快照只含所選記錄，階段及歷史與原生讀回一致。 |
| PDF | 兩份各6頁；獨立PyMuPDF驗全文目標／理由／變更日期、字級至少14pt及頁面邊界，檢視首頁／密集續頁／尾頁。 |
| Excel | 兩份各4張表；Microsoft Excel正常開啟 `CorruptLoad=0`、日期原生型別、完整AutoFilter、凍結表頭、未合併資料區、階段次序排序／數值篩選及完整資料關聯。原檔與副本未保存改寫。英文三行日期表頭經實際AutoFit量測修正高度，未縮字。 |
| 清理 | UI/API/PG測試port已關閉；owned Excel已正常退出。保留所有成功／失敗證據及PG資料目錄，未刪使用者檔案。 |

主要證據（ignored，不進公開成品）：
- `qa-evidence/improvement-milestones/sql/handback.json`
- `qa-evidence/improvement-milestones/sql/run-2026-10-22T22-28-06.465Z/receipt.json`
- `qa-evidence/improvement-milestones/ui-2026-10-22T23-10-02.161Z/receipt.json`
- 同目錄的 `artifact-verification.json`、實際PDF／XLSX及圖片。
- `qa-evidence/improvement-milestones/aggregate-layout-final.json`

驗證過程中，測試腳本的舊欄位名稱、撤銷尚待理由時不能直接斷言取消勾選、Chrome隱含重傳、尚未peer同步的 `SNAPSHOT_STALE`、Excel排序Header設定均已分層處理；沒有為通過測試放寬產品的權限、快照或保存守衛。

## 正式操作順序（由使用者執行）

1. 確認使用同一個原 Supabase 專案，且019–021已成功安裝。本次沒有重寫任何舊migration，也不要求重跑舊SQL。
2. 執行本提交的 `supabase/migrations/022_improvement_milestones.sql` 一次。它只更新私有驗證／保存定義，不回填舊業務記錄、不新增公開權限；已安裝時會拒絕重裝。
3. 另開唯讀核查，執行 **本次** `supabase/improvement-milestones-readback.sql`。預期 `PASS_IMPROVEMENT_MILESTONES_INSTALL_ONLY` 且25個checks全true。此核查不等於正式使用者流程已驗收。
4. 核查成功後，由使用者Push本機提交及沿既有方式發布前端。不要先發布會提交新階段欄位的前端，再補後端。
5. 正式試用時，以一筆合適記錄核對保存／另一端讀回／報告下載；實際正式寫入與檢查仍由使用者決定。本次助手未代做。

SQL將由最終commit blob產生只讀textarea交接頁，供使用者自行全選／複製到SQL Editor；不自動複製到剪貼簿、不代貼或Run。

## 重跑命令

```text
npm test
npm run typecheck
npm run build
npm run qa:improvement-milestones-sql
npm run qa:improvement-milestones
uv run --no-project --offline --python 3.12 --with "pymupdf<2" --with pywin32 python scripts/verify-improvement-milestone-artifacts.py <原App證據目錄>
```

原生Excel檢查限已安裝Microsoft Excel的Windows；未安裝不得冒稱通過。所有QA使用自有loopback服務與合成資料，禁止指向正式資料庫。

## 邊界與停止點

保留原角色與lease／CAS／ACK，不新增身份架構、autosave或獨立階段儲存實體。詳細契約見 `IMPROVEMENT_MILESTONES_CONTRACT.md`。本文件列功能及驗證事實；精確commit、候選tree及有限審查的完成狀態，以最後交付回覆及獨立review receipt為準。Push、部署、正式SQL及正式資料驗證均不包含於助手本次執行。
