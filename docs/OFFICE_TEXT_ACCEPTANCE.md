# OFFICE 與最新 UI-U1–U6：有限本機驗收

## 授權／停止界線
實作與修正採單一writer串行使用canonical `E:/Projects/TMSA&DryBMS-system`，保留既有WIP。既有108辦公室／11來源部門、唯一既有Owner對接及使用者drop-non-owner決定不变；不轉入船端、Email或船舶分管。Writer未stage/commit/Push/部署/正式SQL/清storage/刪檔；ownership交回後由父端核對、有限review及本機commit。正式SQL與Push由使用者操作。

## 本批關閉的要求
| ID | 結果／界線 |
|---|---|
| O01 | 真實私有108人／11來源部門，1 Owner/3 admin/104 operator、啟用108；逐欄姓名/登入/角色/啟用/部門匹配。Owner登入為有意例外；原ID/credential/epoch/session、舊部門及完整業務保存。 |
| O02 | 公司gate必需；非Owner個人密碼可選；已有密碼仍驗證，不因普通保存清除；Owner必有密碼且不新增第二Owner。 |
| O03 | 原人員操作、三角色、部門/角色AND篩選、Owner防護、取消零record/audit寫入、逐筆lease/expiry/CAS、停用/再啟用及session revocation／reload。 |
| UI-U1 | 更新進度顯示真content全文而非技術source metadata；source data／其他來源入口保留。 |
| UI-U2 | 寬进度＋窄百分比/status；部門/人員多選＋原urgency與新增事件一筆原子保存，真SQL COMMIT後held ACK仍保留editor，等待確認時所有可變進度控制不可修改，ACK後關閉；重開可正常編輯。100%不close/改Y/N；取消、失鎖、immutable events通過。 |
| UI-U3 | Guidance左欄下方責任上下兩行；人員收合多選，兩人ID保存讀回。原assessment lease失效後禁責任修改、不假成功。 |
| UI-U4 | 單條兩塊來源自述提示/details只撤顯示；note/initialDepartmentResponses及source-gap/data/評分仍保存。 |
| UI-U5 | 管理Items兩個BilingualText復用sentence；兩框架/雙語顯示整理、原文編輯/取消及其他metadata保存不重寫kpi/guidance/IDs/code/source/reviewed。 |
| UI-U6 | 部門多選OR＋其他filter AND、assessment覆蓋/刻意[]、零結果/清除、篩後pagination；assessment/dryScore/inline草稿保留same entity/node。無業務寫入/角色/score/export變更。 |
| T01/T02 | 原formatter及來源完整性層不改；112-test aggregate包含原formatter／計分／輸出回歸。真700-Item seed SHA不變，office原生before/after完整record與history/report paths相等。 |

## 真實收據（不是 hosted 完成）
- `qa-evidence/office-release/npm-test-final-export.log`：112/112，fail/skipped/cancelled 0；typecheck/build exit 0。build到新ignored `qa-evidence/office-build-final-candidate`，`--emptyOutDir false`不清除舊產物。既有dynamic-import／bundle-size警告保留。
- `C:/Users/tuotu/AppData/Local/hermes/cache/scratch/office-native-20261013-A/office-tests.json`：47/47，含3項有效舊版RED characterization；004最小OID/ACL/config/body、3 overload、atomic abort/replay/password/role/session/lease/CAS。
- `qa-evidence/native-tests.json`：25/25原生回歸。
- `qa-evidence/office-browser-final-D/summary.json`：原App人員13/13；所有own Chrome/UI/API/PG關閉且端口拒絕連線。後續U6僅Framework及scoped navigation CSS，不涉及人員路徑。
- `qa-evidence/office-handoff-native-D/summary.json`：13/13，以真108/11與完整business seed演練完整01–05，不以合成108替代來源驗證；獨立安装18 checks／對帳21 checks。唯讀查詢前後table body/xmin/ctid相等；錯名負控FAIL、晚期credential collision全回滾、精確replay零寫入。
- `qa-evidence/update-ui-red-D/summary.json`：U1–U5共5行為RED；`qa-evidence/update-ui-final/summary.json`：35/35，list/inline、TMSA/DRYBMS、zh/en、1440/390及真原子保存。最終U6 checkbox CSS只把搜尋input selector限定直接child，無影響這些既有consumer。
- `qa-evidence/department-filter-red/summary.json`：兩框架mounted U6缺控制的RED；`qa-evidence/department-filter-checkbox-red/`：實際202px checkbox造成文字裁切的visual RED；`qa-evidence/department-filter-final/summary.json`：14/14，checkbox回18px。inline-modal篩選case為原DOM controlled click event，**不是**使用者能點穿modal。
- `private-seed/office-handoff-final/html-receipt.json`：5份textarea byte/value/readOnly/manual選取/live SHA全PASS，network/page errors 0。01–05與完整native已測packet逐byte相同。
- 原office批次的機器計數、source/input hashes、公開PII檢查與清理以 `qa-evidence/office-release/manifest.json` 為原始證據；下列U2定點修正及父端最終綁定另記 `qa-evidence/office-u2-ack-fix/parent-close-manifest.json`，不覆寫舊收據或把舊hash冒充新候選。保留已知failed receipts，不隱藏舊RED或harness失敗。

## 唯一 review finding：等待保存確認期間的進度丟稿
- 有限唯讀review在原候選找到UI-U2控制未停用：請求提交後仍可修改urgency，ACK後原editor取消草稿，該後續輸入消失。初次35項PASS沒有在held ACK期間輸入，不能證明此邊界已關閉。
- `qa-evidence/office-u2-ack-fix/red-final/summary.json`：清單直接更新、TMSA／DRYBMS inline三入口，原App＋owned native PostgreSQL在真COMMIT後hold回覆；3/3實際ASSERTION RED。四個進度欄位均接受後續輸入而未送出，每例dispatch/save/event增量各1，ACK後該修改丟失。早期locator TIMEOUT只屬harness失敗，不計產品RED。
- 產品最小更動只有四個既有進度欄位的`editor.busy`停用條件；百分比保留close guard。Hook、角色、資料模型、CSS、文字、結構及既有lease/CAS／ACK流程未改。部門與人員多選原本已有pending guard。
- `green-targeted/summary.json`：同三例3/3 GREEN；`green-full/summary.json`：36/36，保留原35個case IDs，只增加DRYBMS held-ACK入口。等待時不可接受輸入且值不變；ACK後權威reload、重新開窗正常輸入、取消零寫入、失鎖保存失敗保稿及原子事件均驗證。
- `npm-test-command.log`與相應command receipts：112/112、fail/cancelled/skipped/todo 0，typecheck/build exit0；原export controlled seam包含於aggregate。Build另輸出新ignored目錄且`--emptyOutDir false`，保留既有warnings及舊產物。
- 受影響UI／aggregate在產品與probe最後bytes上執行；只更新本驗收文件不影響runtime。Office47／native25／人員13／真來源與五SQL13／部門filter14等unchanged-layer gate仍依原收據重用，不外推為正式驗收。服務finally收据及父端獨立端口／owned cluster標記讀回另記於最終綁定。

## 匯出附加修正界線
匯出未知訊息不再指示不存在的operation replay，提示授權未確認／下載未建立、保留選取與畫面且不反覆匯出。safe metadata不含body/header/URL/session/credentials/原exception。普通mutation原replay規則、DB57014/domain/session處理、20000ms及四參數路由保留。父端隔離診斷的健康原970edaa報告中心下載是獨立evidence，不能證明正式NETWORK_UNKNOWN原因；native Excel控制未合格也不能推論報告壞檔。

## 來源／正式未驗範圍
主來源是使用者批准的current pinned roster revision10226；舊proof revision10165僅lineage，不冒充同revision逐欄來源證據。共同project/workspace/git/storage identity已離線對照；未重讀source cloud，也未登入production。目標專用project label不是供應商身份認證，正式需Dashboard project/branch/Primary Database/SQL role確認。

原正式Excel NETWORK_UNKNOWN根因尚未證實、原App正式下載與native Excel尚未驗收。父端隔離QA已完成並核實970edaa原App＋owned native PostgreSQL實際下載、20 sheets／288 literal TMSA Items及3882全部源語字段精確保存；這是未修改产品的健康對照，不是本批候選或hosted恢復。Native Excel小控制與兩份報告均被Workbooks.Open拒絕，控制未合格，不能歸因報告壞檔；不重啟相同診斷。匯出專用未知訊息/safe metadata已修：`tests/export-diagnostic.test.ts`原ApiClient受控transport，15案例原12 RED／3 positive，GREEN15/15；fetch與body-read-or-parse的abort/SyntaxError/network/unknown不混為parse。只有訊息／safe診斷層關閉，原正式故障沒有因此關閉。不得稱全平台可正式匯出或已上線。
