# 既有平台 office 追加：完整手動SQL交接

只適用已安裝001/002/003、已初始化唯一Owner且已匯入完整業務的專用TMSA/DRYBMS。**本次只004＋private office import，不重跑001/002/003、任何Owner bootstrap或business seed。** 本文件不證明hosted安裝完成。

## 來源及資料邊界

批准的pinned `private-seed/office-import-preparation/current-20261012-office-roster.json`：108人、11來源部門、1 Owner/3 admin/104 operator，全啟用。舊proof revision10165只作lineage；current為10226，未連source cloud重新取樣。來源JSON嚴格allowlist六個person欄位，不含Email、船舶、密碼／雜湊；來源非Owner密码明確drop。

Source Owner對接當前唯一Owner：名稱／department採來源，target ID、username、credential/epoch/session原樣保留。其他107新入真姓名／帳號／角色／active／department，hasPassword=false。已存在非Owner/ambiguity/collision/活躍person或settings lease一律拒絕，不覆盖或順便清密碼。既有部門原ID/全部值/順序及全部business/history/reports/role/gate保留。11是**來源**部門數，不是假定target總部門只有11。

## 五份檔案，全部一起交付

完整private packet在 `private-seed/office-handoff-final/`（ignored，含PII，不可公開）：

| # | 檔案 | 行為及繼續条件 |
|---|---|---|
| 01 | `01-preflight-readonly.sql` | READ ONLY，版本／700 Item／唯一Owner／部門重用／lease。必須`PASS_READY_FOR_004_AND_PRIVATE_IMPORT`。 |
| 02 | `02-004-office-directory.sql` | 完整004 additive migration，只在已确认缺004及01 PASS時Run一次。已安装跳過02；非Owner密碼optional＋gated名冊dept display＋SQL-admin-only helper，非公開import RPC。 |
| 03 | `03-install-verify-readonly.sql` | READ ONLY、18 checks：有效函數body/signature/固定config、3 overload、ACL及receipt RLS。必須PASS。 |
| 04 | `04-private-office-import.sql` | 一筆transaction完整108/11＋21 checks，來源逐欄、保留完整業務／控制／credential／sessions／leases／舊部門／audit。讀回確認才COMMIT；晚期失敗全回滾。只輸出safe check names/counts。 |
| 05 | `05-private-reconcile-readonly.sql` | 完全獨立READ ONLY，21 checks及來源counts，必須PASS。不能select私有receipt、names或credential/session digest。 |

若以前004／import結果未知，先03／05 READ ONLY。**FAIL／SQL錯誤／逾時或不明結果立即停止，不猜測重Run，不Push。** 01不是已匯入後的健康check；import後01 fresh-state STOP不能當重匯授權。精確replay在本機證明零寫入，仍不建議用重匯猜未知结果。

## 人工Dashboard身份與執行

1. 父端從核定commit raw blobs重新產生並驗live SHA，再正式打開Preview。現在的WORKING_BYTES packet只是已測候選。
2. 使用者在自己的已登入Dashboard確認專用target project ref（private offline頁顯示）、production branch、Primary Database及SQL管理role；不得選source Ship Dynamics／其他app。SQL中project label不能驗證供應商身份。
3. 01–05期間暫停人員/部門及其他資料保存、登入/登出，避免完整preservation對帳遇到合法的並行變更；不清storage或重建Owner。原Owner session仍保留。助手不更改正式gate或開新authority。
4. `office-manual-sql.html`是完全離線、5個獨立readonly textarea及select-only按鈕。每份用一個**新空白query**，自行Ctrl+C、貼上、Run；無clipboard API、網路、provider Paste/Run。live UTF-8 bytes與SHA必須PASS。
5. 正常結果按表次序繼續，不必每步等聊天回覆。保留中間Results，最後只回傳05的safe counts/checks。任何stop condition立即保留畫面並停止，不再Run。
6. 本機Parent review/commit、使用者Push/Pages版本、hosted SQL/readback、fresh Owner/admin/operator company-gated smoke及人員驗收各自獨立；不得互相代替。正式報告中心Excel故障仍另列未關閉。

## 父端commit後唯一重生命令

從canonical bash執行，替換完整40字commit及全新private output（不得覆盖舊packet）：

```bash
cd 'E:/Projects/TMSA&DryBMS-system' && node scripts/prepare-office-handoff.mjs --revision <FULL_REVIEWED_COMMIT> --out private-seed/office-handoff-committed --confirmed-owner-mapping
```

public兩份取raw Git blobs；commit SQL必須LF才能與HTML textarea完全byte相等，否則fail closed。WORKING_BYTES checkout CRLF只在**生成copy** canonicalize為LF，沒有更改004原檔；manifest分別記錄raw source與offered artifact hashes。

重生後先比01–05與已native演練packet的5份bytes/hash，再只做offline HTML 5份value/readOnly/manual選取/live SHA/no-network check。不因commit/header重生重跑已byte-equal的product/SQL層。Parent可使用repo-external `C:/Users/tuotu/AppData/Local/hermes/cache/scratch/office-final-html-check.mjs`作模板，改其private `base`指向新packet（不搬PII到repo public）。目前腳本路徑固定final，因此不可把舊HTML receipt冒充新commit頁。

## 已測證據與限制

見 `docs/OFFICE_TEXT_ACCEPTANCE.md` 及 `qa-evidence/office-release/manifest.json`。完整5份SQL以真108/11＋真700 Item業務在owned native PG執行；01/03/05以READ ONLY真交易且body/xmin/ctid零變更；晚期rollback、錯名負控、exact replay皆有原始receipt。private preserving digests只存在SQL-owned receipt，不輸出credential/session/control values或其digest。本機Supabase REST adapter及合成UI不是hosted/provider身份證明。
