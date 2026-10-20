# FPMC 第一批：改善追蹤本機交付

## 狀態與邊界

- 起點：`70f27b7444b2e0d086d48c9b24cc831b85fa8abe`。起點工作樹／index為clean。實作者交回22檔未stage候選；父流程已核對候選、180項source/test/config輸入、37組證據、542個受保護檔案及最終命令，按既定授權獨立本機commit。實際commit／tree及本段文檔狀態更新記錄見 `qa-evidence/fpmc-tracking/local-delivery-receipt.json`；未Push／正式部署。
- 本機驗證：**真實UI＋測試資料；本機PostgreSQL非正式Supabase**。使用原App、原HTTP adapter、installed SQL和第二客戶端；未連線正式站、未執行正式SQL／正式業務寫入。
- 第一批內容已實作；第二批報告版面與Excel功能仍待辦，詳見契約「最新FPMC追蹤/報告需求」。沒有第八頁、第二份改善資料或新增角色特權。
- 最終逐檔SHA-256、命令／loghash、run receipts、unique case IDs、coverage、cleanup及ownership以本機 `qa-evidence/fpmc-tracking/handback.json` 為準。該目錄為ignored本機證據，不應連同原生DB資料加入commit或公開發布。

## 實作結果

|需求|實作位置與行為|
|---|---|
|A 名稱|`src/branding.ts`、`App.tsx`、`index.html`精確中英文名；原logo、公司名及七頁順序不動，局部header可換行。報告只最小更正品牌與來源標籤。|
|B 來源／日期|`types.ts`、`improvementTracking.ts`、`Improvements.tsx`、`Inspections.tsx`：公司來源可獨立／連Item，獨立`proposedDate`，新建本地今日、可改可清空，歷史未填不猜。保存後來源不可換；舊來源與外部identity／分類規則保持。|
|C 清單|`filterImprovementList`共用selector；來源、提出日期、狀態等AND，包含日期首尾，無日期在有範圍時排除。管審會快捷入口直接派生同一source filter，按提出日期排列。保留40筆、跨頁明選、零結果與精確PDF範圍。|
|D 最新進度|`latestImprovementEvent`按真實時間、同時間按append次序；每列顯示日期、人、狀態及完整內容，另列計劃。metadata更新不冒充進度，無event明示尚無進度。|
|E 空白行|改善專用`ImprovementTextarea`初次顯示投影，真正輸入後不再逐鍵整理。主頁／TMSA／DRYBMS完整編輯、進度和歷史finding建立共用；未碰欄位保存保持原bytes，cancel零業務寫入，舊events不改。|
|F SQL|016沿已知installed函式鏈直接guarded延伸，只改兩個既有函式body；無non_external偽裝proxy。保存舊客戶端省略日期、合法日期、未知來源拒絕、不可偽帶外部關聯。獨立readback核對最後installed authority。|

共享接點：報告中心第二批應使用 `ImprovementListFilters`／`filterImprovementList`（`src/improvementList.ts`）與 `improvementSourceLabel`（`src/improvementTracking.ts`），不得另造日期fallback或來源副本。`src/Reports.tsx`本批未改。

## 已執行驗證及證據分類

- 原App mounted完整驗證25個unique cases：兩來源新增→HTTP→native DB→第二客戶端；三入口raw bytes／cancel／metadata保存；原生鍵盤Enter與Chrome CDP composition／insertText IME路徑；finding建立；ACK pending；十秒正常同步後新進度；stale lease草稿不覆寫；45筆跨頁、窄化、零結果與真實PDF；GM缺席；中英文1440／390頁首。
- Native 23個unique cases：兩來源各有／無Item；日期／空／舊client omission；原來源仍嚴格；外部去重、parent分類與既有general例外；append-only／fenced lease／CAS／exact replay／operation status；GM普通／performance讀取和export拒絕；remarks、TMSA14與歷史功能共存。安裝前後業務tuple／table digests一致，owner／ACL／proconfig不變；前置drift及重裝拒絕均atomic。
- 獨立 `fpmc-tracking-readback.sql` 實測24個checks全PASS。安裝及readback均有實測原檔SHA-256；001–015與舊readback不改。
- 補充單元19個，包含於 `npm test` 的336個通過測試，**不重複相加**。既有改善輸入回歸12個／24個input windows；不是另一套UI。
- `npm run typecheck`、`npm run build -- --emptyOutDir=false`、public-artifact hygiene及`git diff --check`須以handback最終命令exit核對。build保留既有dist檔，避免刪檔；既有`INEFFECTIVE_DYNAMIC_IMPORT`警告於前批build已存在，不作無關重構。
- 四張雙語desktop／mobile截圖及geometry：完整產品名、logo載入、身份、七頁導航無遮擋、document不橫向溢出；窄版導航／表格沿用局部橫向捲動。手機測試為Chrome viewport，不冒稱實體手機。
- PDF為沿既有輸出流程的精確篩後一筆下載，頁數／hash／授權IDs／filters有收據，文字亦讀回；只驗本批集合及來源，不冒稱第二批版面完成。沒有新增Excel需求驗收，亦未開使用者Excel。

### RED → GREEN provenance

`tracer-red-correct-locator`證原新增視窗缺公司來源；`tracer-native-red`證前端接好後原SQL拒絕（畫面`UNKNOWN_FIELD: proposedDate`）；016後`tracer-green`通過。另有editor／list／progress／brand／finding入口的行為RED，對應原空行、缺來源filter、缺完整最新進度、舊名稱與缺提出日期，之後同原App入口GREEN。

`tracer-red`及`expanded-mounted`中的兩次label locator錯誤保留但列為**harness error，不算產品RED**；修正locator後重跑，不為其改產品語意。日期與權限等native／unit邊界是補充驗證，不宣稱每條均先RED。機器清單按stable case ID去重；同一case跨run通過不重複計功能數。

## SQL交付

1. 本機從001–015順序安裝，再安裝016並執行獨立readback；未知前置定義／ACL、重複016皆拒絕。不自行修改guard hash或重跑舊migration繞過。
2. 016為DDL-only，無backfill、角色升權或history改寫。readback為唯讀，驗known chain、ACL／owner等安裝狀態；功能證據另在native cases，不把readback當成正式業務驗收。
3. 正式SQL由使用者另行核准／執行；本批沒有正式SQL。新前端依賴016識別`proposedDate`與新來源，部署前必須協調SQL版本，不可僅上新版前端。

## 保留、有限自檢與交回

一次有限自檢涵蓋本批diff、資料維度／來源／角色邊界、原編輯器保存鏈及新增SQL；僅修掉CSS檔尾多餘空行。沒有啟動全站重構或第二批報告審查。

保留`.git/info/exclude`、`.hermes`本機計畫、`private-seed`、舊QA及所有新QA；只停止測試自己擁有的Chrome／HTTP／PostgreSQL。各run收據記錄ports關閉；未操作使用者Chrome／Excel。初始snapshot保護的檔案以handback逐檔比對；未將未量測的ignored舊QA宣稱為全量前後hash證明。

父流程核對已完成：重算候選raw SHA-256、source/test/config與證據hash，核對HEAD／空index、最終命令及SQL實測bytes；有限檢視桌面繁中／390px英文截圖。父流程只更新本文件與契約的交付狀態，產品及測試輸入未再改動，故不重跑未受影響產品測試。原handback完整保留；獨立本機commit與tree綁定另見 `local-delivery-receipt.json`。第二批報告在此commit之後接續，並非本批已完成內容。
