# 待改善更新三項操作：本機候選交付

## 範圍與結果

- 唯一工作目錄：`E:/Projects/TMSA&DryBMS-system`；基準 HEAD：`127950c0ee0c8ea0088507aaa23412f5acc99ef5`。
- TMSA／DRYBMS 細目待改善表保留「更新」，新增「完整編輯」「結案」；共用進度視窗也提供兩個入口。
- 「已經完成作業」沿用 `percent === 100`，沒有新增資料欄位。單勾完成及保存仍未結案；手動降到100以下取消勾選。取消勾選恢復本次最近的非100百分比，若開啟時已100且沒有本次先前值則回0；都須明確保存。
- 進度→完整編輯／結案只切換本地模式、更新同一 staged event，不重新 `open/start`、不換鎖、不先保存。結案自動100並固定勾選，沿原確認保存及 close intent。
- 更新與結案能力獨立。新控制在 busy／失鎖／pendingUnknown 停用；GM改善完全缺席。既有來源、原文、舊events、Item關聯及 assessment 的 Y/N／reviewed／executionStatus／評分不變。
- 沿既有 API、`useRecordEditor`、lease/CAS／operation ACK、SQL與清單投影；沒有修改這些共享層、types、migration或readback。

候選只含 `src/Improvements.tsx`、`src/FrameworkPage.tsx`、兩條 scoped `src/styles.css` 規則、`scripts/verify-improvement-update-actions.mjs`、package.json 的單一QA命令登記及本文件。父流程原11個報告候選以 raw SHA-256 與 Git-clean blob 保護；不接續報告修正。

## 實證與可重跑命令

本次為 **原 App＋真 ApiClient＋合成資料＋owned localhost HTTP adapter／原生 PostgreSQL**，不是正式 Supabase／Pages，也不使用使用者瀏覽器session。現有 native helper 安裝001，qa-server 安裝002–005及指定006–017，verifier只再安裝018；不重裝既有DDL。

```bash
cd 'E:/Projects/TMSA&DryBMS-system'
npm run qa:improvement-update-actions
npm test
npm run typecheck
npm run build -- --outDir qa-evidence/improvement-update-actions/build --emptyOutDir false
node scripts/verify-public-artifacts.mjs qa-evidence/improvement-update-actions/build
```

Build使用獨立保留目錄及 `--emptyOutDir false`，避免刪除既有dist／QA產物。若重跑交付build，另選新的outDir以保存歷次產物。

最終行為收據：
`qa-evidence/improvement-update-actions/green-all-2026-10-21T03-48-04.849Z/receipt.json`

- 18個唯一業務案例，全數PASS；子集、RED及重跑不累加為新案例。
- 分層：mounted/native一般流程7；雙客戶端2；真COMMIT故障注入2；UI＋native權限3；雙語視覺4。
- 完成與full案例：`IUA-COMPLETE-{TMSA,DRYBMS}`、`IUA-FULL-DIRECT-{TMSA,DRYBMS}`、`IUA-FULL-SWITCH-{TMSA,DRYBMS}`、`IUA-FULL-SAVE`。
- 結案：`IUA-CLOSE-{TMSA,DRYBMS}`。TMSA直接結案、DRYBMS進度草稿轉結案；各含取消零寫入、同ID單event、COMMIT後／ACK前視窗與inline仍在、ACK後星號／主表篩選／第二客戶端收斂。DRYBMS保留當次文字、部門、人員與急迫程度。
- 故障：`IUA-LOST-ACK`、`IUA-LOST-LEASE`。原保存的初次dispatch＋既有自動重播都在真COMMIT後丟回覆，pendingUnknown仍保稿；明確再按保存沿完全相同operation/payload/lease/event恢復。共3次dispatch、1張原生operation receipt、1次版本／event增加，沒有新operation。失鎖以原生到期後另一session取得鎖，原草稿保留且新控制停用。
- 權限：`IUA-UPDATE-ONLY`、`IUA-CLOSE-ONLY`、`IUA-GM-EXCLUDED`。原生server拒絕update-only的close claim及save；close-only實際保存成功，未冒用update權限；GM原UI及native讀取皆排除改善。
- 視覺：`IUA-LAYOUT-{zh,en}-{1440,390}`，每案涵蓋兩體系；共28張最終截圖。正文16px、細目改善正文15px；新操作不截字，表格自身橫捲，頁面不橫溢，百分比／執行狀態保持同列。
- 零pageerror、零外部瀏覽器網路要求；console僅故障案例明確注入的2筆 `net::ERR_FAILED`，無其他warning/error。

其他gates：`npm test` 355/355，typecheck及production build PASS；本批候選diff-check（含兩個untracked新檔）PASS。整個工作樹的 `git diff --check` 仍回exit 2：protected `docs/IMPLEMENTATION_CONTRACT.md:191` 原有檔尾空行；其raw SHA/Git blob與父流程起點完全相同，按界線不修改。既有reports靜態／動態import混用的build警告保留，未改報告載入架構。公開產物檢查PASS：22檔、模板0 comment parts，1625個私有敘述標記未出現。這些aggregate結果不代表重新驗收或修好正式PDF／Excel。

## RED與失敗證據保留

所有命令、exit、log hash在 `qa-evidence/improvement-update-actions/commands.jsonl`；每次mounted run都有當次實測inputs hash、cases、截圖與cleanup收據。

- 最初mounted RED為原進度視窗缺「已經完成作業」，在production修改前建立。
- 相鄰RED分別為細目表缺完整編輯、缺結案；各自最小實作後GREEN。後續視覺檢查發現新增勾選推開原百分比／狀態同列，先保留幾何RED，再加兩條scoped CSS，最終矩陣通過。
- 保留三項harness失敗：初次星號selector未限定當前細目、afterCommit未先防空並誤讀wrapped ACK、直接destroy HTTP socket未可靠進入未知ACK。只修verifier的定位／回應封裝／故障注入，沒有以這些失敗改共享產品層。
- 一次有限自審只對照本批spec、授權diff及上述實證；無範圍內剩餘blocker，未啟動全站或報告審計。

## 交回與限制

精確候選 raw SHA-256／Git-clean blob、實測inputs、所有run／log／receipt、唯一案例分層、截圖、11個protected核對及owned-process cleanup，見 `qa-evidence/improvement-update-actions/handback.json`。

沒有stage、commit、Push、正式SQL或部署；index保持空。原生PG、HTTP／Vite及Chrome均由本次各run建立並關閉，所有資料目錄與證據保留、不刪檔。由父流程接收候選並獨立核對／commit；正式資料、正式站與使用者發布仍未操作。
