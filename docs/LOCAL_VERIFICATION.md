# 本機成品驗證紀錄

**證據層：正式 React App＋測試資料／本機原生 PostgreSQL；不是正式 Supabase 或 GitHub Pages。** 原來源匯入驗證另使用私有真實資料。原始 receipts 留在 gitignored `qa-evidence/`／`private-seed/`，不將 sessions、credentials 或公司正文附到公開 Git。

## 已執行且通過

| 檢查 | 實際結果 | 命令／receipt |
|---|---|---|
| 單元及輸出測試 | **53/53 PASS**，fail/cancelled/skipped均0 | `npm test`；`qa-evidence/closing/B01-final-aggregate.log` |
| TypeScript | PASS | `npm run typecheck` |
| 正式build | PASS | `npm run build`（含typecheck） |
| 原生PostgreSQL契約 | **25/25 PASS** | `npm run qa:native`；`qa-evidence/native-tests.json` |
| 真HTTP及ApiClient | PASS | `qa-evidence/http-tests.json` |
| 正式App mounted UI → 原生PG | **24/24 unique cases PASS**，0 runtime errors／外部provider聯絡 | `npm run qa:browser`；`qa-evidence/browser/summary.json` |
| 緊湊版面 | **31/31 unique states PASS**；1440px/390px、中英文、表格/篩選/彈窗；這一層用mock transport | `npm run qa:layout`；`qa-evidence/layout/compact/summary.json` |
| 報告產物 | **12項檢查 PASS**，9個交付輸入hash全匹配；Excel正常唯讀開啟、PDF字體/正文/邊界核對 | scratch `tmsa-report-qa/final-report-verification.json` |
| 真實來源 | PASS；13原檔hash、408快照、4504 Excel cells、378 PDF fields；700項/124改善/2歷史保留 | `scripts/verify_sources.py --no-write`；`private-seed/source-verification.json` |
| 私有seed → 原生PG → ApiClient | PASS；700 items/700 assessments/50 chapters/124 improvements/2 inspections/30 dryScores | `qa-evidence/private-seed-smoke/import-readback.json` |
| 公開build/模板 | PASS；10公開files、1625私有正文markers未洩漏；Excel模板0 comment parts | `node scripts/verify-public-artifacts.mjs` |
| 部署輔助與唯讀SQL | **6/6 PASS**；離線碼產生/手動選取/無storage及network；readback在READ ONLY transaction實際執行 | `npm run qa:handoff`；`qa-evidence/deployment-handoff/summary.json` |

不把不同層、重跑同案例或bookkeeping加成一個E2E總數。25 native、24 mounted UI、31 layout和6 handoff是不同分母；只有mounted UI層走正式App及真SQL。

## Mounted 24-case實際覆蓋

七分頁及框架隔離、status不可用不誤報無Owner、四角色邊界、既有imported general不猜Item仍可追加進度、同Item/定義鎖競爭、異Item並行保存、新客戶端讀回、取消零寫入、多部門/多人/完整自評、真過期lease保稿擋保存、缺口Yes停用、DRYBMS百分比計分、共用多Item改善、追加進度取消/保存、結案/重開不改評分、只授結案者的claim/真續鎖/取消/結案/重開與未授更新否定、篩選明選PDF及native授權、試算零正式寫入、檢查發布/凍結/發現去重、定義變動只清reviewed、章/條目停用/再啟用穩定ID、最新授權Excel下載、audit篩選與人員讀回、手機雙語不整頁橫溢、無外部provider及runtime錯誤。

## 候選及清理

browser receipt的全部product hashes與現有產品檔相符；native SQL/ApiClient重新核對，私有來源/匯入SQL與報告生產輸入亦核對。報告測試僅移除末尾一個LF，非語義變更；完整產物維持先前12項驗證。31個layout狀態保留既有證據：晚期修正沒有改CSS、render markup或文字，另以本次正式App/native手機case重驗。晚期B01修正限4個產品檔：改善操作把close/reopen意圖傳到editor/ApiClient並保留於續鎖context；預設update不變，未改角色能力、SQL儲存規則、UI或版面。唯讀readback僅安全的Owner數、各類/框架計數和初始化boolean，不回傳名冊、正文、token或hash。

最新browser receipt：browserClosed/uiPortClosed/apiPortClosed/databasePortClosed全部true。另核對此前此平台的owned QA PostgreSQL目錄沒有postmaster.pid；不刪除任何cluster／證據檔案。部署輔助QA的Chrome及owned PG亦正常停止。

## 有界review與B01處置

一次獨立唯讀review核對57個raw Git blob，對舊tree `e3d2011b71281e0e79544f09b268aa7e5f46609a`判定一項R04阻斷：只授結案、未授更新的操作員被預設update claim拒絕。父流程核對原生重現及來源hash後，先取得API回歸與正式App mounted RED，再做最小修正；API回歸2/2、包含真續鎖/零寫入取消/結案/重開/未授更新與撤銷結案否定的mounted case GREEN，整套24/24。

B01為已修正並實際重驗；新候選不沿用舊tree的獨立PASS，也沒有宣稱全部交錯窮盡或正式provider驗收。依有限收尾邊界，不另啟動廣泛review。完整來源缺口及正式部署限制照實保留。

## 首次推送後：乾淨安裝建置補正

首版 `1437c0952d60f04d51c25055818ea05e6692a944` 已推至公開 `ttwonder/TMSA-DryBMS-system`，遠端main與本機一致。GitHub Actions run `38116797447` 的安裝及測試步驟成功，但build出現Node型別缺失；尚未到Pages設定、產物上傳或部署。

使用首版58個raw Git blobs建立無`.git`、無私有seed、無既有node_modules的scratch驗證目錄，執行`npm ci`後確實重現相同TS2591。根因是`@types/node`只在原lockfile標為extraneous，未列入根package的devDependencies；本機既有安裝遮住了此缺口。最小修正將既有`@types/node`版本`26.6.5`明列為devDependency，並把它及其既有`undici-types`依賴的lock標記改為dev；未更新其他套件版本，未改src、UI、權限或SQL。

再以補正後兩份建置輸入及其餘56個不變的原始blob建立全新目錄：`npm ci`、`npm run build`（含typecheck）及53/53測試均PASS，無fail/cancelled/skipped。這是本機Windows的乾淨安裝驗證，不冒稱GitHub Linux runner或正式Pages已通過。有限補正不重啟業務／SQL／版面review；新的GitHub建置仍需使用者Push後另外讀回。詳見gitignored `qa-evidence/closing/ci-clean-install-repair.json`。

## 限制與未完成正式節點

- **首版程式碼已公開推送；Pages尚未驗證成功，正式SQL、Owner初始化、私有資料匯入及hosted readback仍未確認完成。** 本次補正只在本機提交，由使用者進行後續Push；SQL交接仍使用原commit中內容未變的安裝／唯讀原始blob。
- 本機RPC bridge不是Supabase provider；正式專案的版本/角色/網路/快取與多人保存仍按`DEPLOYMENT.md`驗收。
- 原來源20缺口/19列、`2.4.2`衝突、general定位及結案佐證仍待業務確認；維持未核實/未評，不偷偷造分。
- build有bundle大小警告（部分chunk >1000kB）。建構成功；目前是較大的Excel/PDF工具bundle，並未做未授權的架構重寫。
- CJK PDF字型包含U+4E00–U+9FEF；不覆蓋的字元明確停止輸出，不宣稱可輸出任意Unicode、也不靜默漏字。

## 後續可重跑的本機命令

```bash
cd 'E:/Projects/TMSA&DryBMS-system'
npm test
npm run typecheck
npm run build
node scripts/verify-public-artifacts.mjs
npm run qa:native
npm run qa:browser
npm run qa:layout
npm run qa:handoff
```

native/browser/handoff需要Windows既有原生PG runtime與Chrome；可用`COMPLIANCE_PG_BIN`及`QA_CHROME_PATH`指定，詳見`BACKEND.md`。所有QA只使用自建loopback資料庫，不接受任意正式連線字串。
