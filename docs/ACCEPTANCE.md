# 有限驗收清單

這是本次既定需求的驗證分母，不是新增產品規格或已通過證書。完成實作後一輪整合驗證；只針對可重現、違反以下行為的問題修正與重驗。正式雲端另驗，不用本機PASS取代。

| ID | 使用者要求／接受行為 | 預定證據 | 目前證據狀態 |
|---|---|---|---|
| R01 | 七個主分頁可到達；TMSA與DRYBMS內容獨立 | mounted desktop browser | 本機 mounted PASS；R01 browser case |
| R02 | 單項YN、自評、佐證、多部門、多執行人及執行狀態可保存，取消零內容寫入 | UI → 實際SQL → 新客戶端讀回 | 本機 PASS；R02 browser保存／取消及新客戶端讀回 |
| R03 | 管理新增/修改/停用/再啟用章節與條目，穩定ID；既有歷史與改善不丟失 | UI/native with frozen snapshot | 本機 PASS；R03定義／歷史／停用再啟用cases |
| R04 | Owner/admin/operator/vessel固定邊界；人員角色與密碼雲端共享；查種類/Item/人/日期的真實操作歷史 | native deny/readback + UI | 本機 PASS；四角色native否定及UI／audit／人員讀回；B01只授結案者的claim/續鎖/結案重開與未授更新否定已重驗；正式共享待驗 |
| R05 | 同一Item含定義及自評共用編輯鎖；顯示持有人；異Item可並行；lease+CAS+同操作重播；失鎖留稿 | 兩個SQL連線及兩瀏覽器context | 本機 PASS；native多連線及R05同Item／異Item／過期lease cases |
| R06 | 原總表同章/同欄/同格式Excel；動態條目、雙語長文完整；真正可下載中文PDF、字體及頁邊界可核對 | generated XLSX/native Excel/PDF text+image | 本機 PASS；12项報告產物檢查及UI真下載 |
| R07 | 分框架目前/上次分數，改善件數/章分佈/進度/計劃；章/部門/人/日期篩選不刷高分；試算不改正式自評 | domain + UI + export snapshot | 本機 PASS；計分／篩選／試算domain及R07 browser cases |
| R08 | 外部正式/非正式檢查逐項結果、完整建議；公司20分章逐級TMSA計分；發布後快照不被新定義改寫；未評歷史不造分 | domain + native + UI | 本機 PASS；R08發布／凍結快照／發現去重case |
| R09 | 改善external/non_external來源，多Item/部門/人，急迫四級、追加進度、結案/重開、取消、表格查詢/直接更新及選取PDF；所有入口共用id | unit/native/UI/export | 本機 PASS；R09共用多Item／事件／結案重開及imported-general回歸 |
| R10 | 提供的原LOGO；商務、克制、緊湊；中英文切換；桌面與390px手機無全頁橫溢 | byte hash + UI screenshots/DOM | 本機 PASS；原圖及31個版面狀態，另有native手機雙語case |
| R11 | 左章/級/Item导航、四燈號、⭐改善、KPI/BPG/YN/自評/佐證/部門及共用改善展開 | unit + mounted browser | 本機 PASS；domain四燈號及mounted條目保存／缺口／共用改善流程 |
| S01 | TMSA權威288項20分章、全部最新/歷史/註記；DRYBMS412分析列30主題/來源缺口，無偷偷補寫 | source import verification / exact IDs / hashes | 本機 PASS；13原檔、408快照、700項私有SQL讀回；來源未解照實保留 |
| S02 | 公開bundle/template無公司自評、佐證、標準全文、批註、私有seed與秘密；匿名直讀不通 | public-artifact scan + native ACL | 本機 PASS；1625正文marker、模板0批註及native匿名ACL |
| S03 | status失敗不謊稱無Owner；角色/專案切換不恢復舊資料；未ACK不假成功；來源缺口不算完全Yes | API/native + mounted race/failure | 本機 PASS；status不可用／未ACK／真失鎖／缺口及generation fences |
| D01 | 單一可Push git資料夾，鎖定依賴、Pages workflow、完整SQL/唯讀readback交接 | local commit and blob match | 交付檔及6項部署輔助QA PASS；最終commit與Preview識別以交接receipt為準 |
| D02 | 真正GitHub Pages版本、正式Supabase schema/資料/角色及兩用戶驗收 | exact hosted URL/readback/version | 未部署／未驗證；正式目標及使用者操作待確認 |

## 已執行的分層證據

單元53/53、native25/25、正式App＋原生PG mounted24/24、mock版面31/31、部署輔助6/6；typecheck/build及公開bundle核對PASS。報告12項產物檢查、來源13原檔／408快照及700項SQL匯入讀回PASS。各分母不能相加冒充E2E，完整命令及限制见 `LOCAL_VERIFICATION.md`。本機PASS不等於正式Supabase／Pages。

## 完成界線

R01–R11與S01–S03具實際測試輸出，typecheck/build/公開檔案掃描通過，沒有本次範圍可重現阻斷，D01完成，即可交付本機成品及正式部署操作。D02單獨標示未部署/部分部署/已讀回驗證，不混同本機結果。使用者補完整DRYBMS附件屬來源更新，不妨礙本版保留缺口的系統功能驗證。
