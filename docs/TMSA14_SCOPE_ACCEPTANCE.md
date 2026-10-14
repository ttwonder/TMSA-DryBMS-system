# TMSA14獨立範圍：本機接受證據

## 範圍與結論

本批總覽共用範圍、每份歷史獨立範圍、計分／目標／summary／PDF連動及009升級已實作並通過以下本機驗證。只在唯一repo修改；正式Supabase、GitHub遠端及Pages未寫入。不是全系統重新審計，也不代表正式部署／資料驗收完成。

## 實際執行結果

| 閘門 | 結果 | 證據範圍 |
|---|---|---|
| `npm test` | 169 PASS、0 FAIL | 既有單元／契約／SSR／實際輸出測試及新增7個計分契約 |
| `npm run typecheck` | PASS | 正式TypeScript專案 |
| `npm run build` | PASS | 正式Vite production build；仍有reports.ts靜態／動態匯入混用提示，未改打包策略 |
| `npm run qa:tmsa14` | 19 PASS | 原App、Chrome、獨立本機PostgreSQL、原ApiClient、anon RPC、合成資料；零外部請求、零pageerror，擁有的UI／API／DB埠已關閉 |
| `npm run qa:tmsa14-reports` | 5 PASS、9個實際文件 | PDF文字回讀與Excel回讀；包含7 PDF及2 XLSX。檢查範圍、有效分數、原文保留及Excel值／合併／欄寬一致 |
| `npm run qa:inspection-chapter-scores` | 14 PASS | 原歷史分章分數、草稿／取消／保存及雙語手機回歸；此既有套件維持其008環境，009全路徑由本批19案例覆蓋 |
| `npm run qa:shared-targets-ui` | 14 PASS | 原公司目標、雙客戶端、unknown／重播／衝突及雙語手機回歸 |
| `node scripts/verify-public-artifacts.mjs` | PASS | 22公開檔、模板0註解，1625個私有正文標記未洩漏 |
| `git diff --check` | PASS | 無diff空白錯誤 |

不同套件有重疊，不把它們相加當成獨立驗收總數。Git索引核對中，只有 `src/reports.ts` 由工作檔CRLF正規化為LF（546個換行）；已逐byte確認除CRLF→LF外完全相同，其餘暫存檔與工作檔raw bytes相同。receipt的SHA-256記錄實際受測工作檔，不混稱Git blob hash。

### 當次receipt（gitignored本機證據）

- `qa-evidence/tmsa14/green-2026-10-14T08-37-58.498Z/receipt.json`：19案例；35個產品／腳本／SQL輸入SHA-256已與最終bytes核對。
- `qa-evidence/tmsa14/reports-green-2026-10-14T08-41-29.391Z/receipt.json`：5案例、9文件；5個輸入SHA-256已核對。
- `qa-evidence/inspection-chapter-scores/fixed-2026-10-14T08-38-22.563Z/receipt.json`：14案例、12個輸入hash。
- `qa-evidence/shared-targets/ui/receipt.json`：14案例、13個輸入hash。

已直接檢視1440px桌面及390px手機繁中／英文截圖；新開關與歷史範圍標示沒有整頁橫向溢出。實際繁中歷史／英文現況PDF首頁另有渲染圖檢視；完整文字與保留第14章由全文件抽取斷言覆蓋，不宣稱逐頁人工校對。

## 有限自檢結果

1. **作用域獨立**：目前設定只存framework；歷史旗標只存該inspection。原角色／命令／lease/CAS重用，取消零寫入。新草稿與共用設定的跨客戶端競爭已驗。
2. **舊資料不改分**：舊歷史缺欄位維持納入；目前缺欄位採關閉。遷移前後全部record/version/body及audit/operation counts相同；舊客戶端省略旗標保存不會清除已存值。
3. **結果一致**：SQL summary、客戶端summary、full hydrate、export的獨立歷史旗標一致；含排除未評章的PDF regression。
4. **保留原內容**：切換前後snapshot/results/findings及其他業務記錄不變；DRYBMS獨立。Excel不重加介紹、保留第14章內容與原樣式。
5. **真實保存**：原UI held-COMMIT-ACK不提前亮成功；network unknown用原operation確認，ledger不增加第二筆；歷史重整後恢復保稿及同操作回執已驗。
6. **交付邊界**：009已在本機順序安裝，唯讀readback安裝前拒絕／安裝後9項全true；重跑升級會明確拒絕。正式順序見 `TMSA14_SCOPE_UPGRADE.md`。

本次是有限自檢加實際執行，不宣稱另有獨立第三方review。上述範圍未留本機阻斷項；正式SQL／Push／部署／正式雙人讀回仍由使用者決定並執行。

## 保留的RED與測試環境修正

- 原SQL RED：`red-native-2026-10-14T08-08-54.465Z`，既有保存命令拒絕新旗標 `INVALID_PAYLOAD`。
- 原UI RED：`red-ui-2026-10-14T08-09-01.750Z`，總覽沒有指定開關。
- 實際PDF RED：`reports-red-2026-10-14T08-18-00.091Z`，排除未評第14章仍被舊全項coverage gate抑制分數；已修正為共用included-scope判斷。
- 試跑中的alert locator同時命中toast／頁內提示，以及新建測試漏填必填日期，均屬harness問題；已只改測試選取／輸入，沒有放寬產品驗證。Python系統環境缺少PyMuPDF改用隔離uv runtime；新腳本使用`pymupdf`原生名稱，避免已棄用`fitz`別名警告。
