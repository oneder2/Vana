# 附件 / 图片 Storage 方案

这份方案用于给当前 `SQLite + Supabase` 主线预留附件与图片能力，但暂时不直接放开云端上传。

## 当前结论

- 本地仍然是第一落点
- Supabase 现在只预留 `document_assets` 元数据表
- Storage bucket、上传限额、内容校验、清理策略放到下一阶段实施

这样做的原因很直接：

- 先把文档主线同步跑稳
- 避免一开始就把 Storage 成本和滥用风险暴露出来
- 给后续的图片嵌入、附件列表、断点补传留出兼容结构

## 已预留的数据结构

远端 migration：

- [202604180002_reserve_attachment_storage.sql](/home/gellar/Desktop/program/personal/Vana/supabase/migrations/202604180002_reserve_attachment_storage.sql)

核心字段：

- `user_id`
- `id`
- `document_id`
- `local_attachment_id`
- `kind`
- `file_name`
- `mime_type`
- `size_bytes`
- `checksum_sha256`
- `storage_bucket`
- `storage_object_path`
- `upload_status`
- `created_at`
- `updated_at`
- `uploaded_at`
- `deleted_at`

本地 SQLite 也已经预留：

- `attachments.kind`
- `attachments.storage_bucket`
- `attachments.storage_object_path`
- `attachments.checksum_sha256`
- `attachments.upload_state`

## 第一阶段

目标：仅打通“本地附件 + 远端元数据同步准备”。

建议内容：

- 编辑器继续只处理本地图片/附件引用
- 本地附件写入 SQLite `attachments`
- Supabase 只同步元数据，不上传实际二进制
- UI 中明确标识“仅本地附件”与“待上传附件”

## 第二阶段

目标：谨慎接入 Supabase Storage。

建议内容：

- 建立私有 bucket，例如 `document-assets`
- 上传路径按 `user_id/document_id/asset_id.ext`
- 上传前生成 `sha256`
- 服务端限制 MIME、大小、数量
- 客户端在同步成功后再回填 `storage_object_path`

## 防滥用要求

如果后续开放测试，至少要补这几条：

- 单用户总存储上限
- 单文件大小上限
- 图片 MIME 白名单
- 上传频率限制
- 软删除与定期清理任务
- 失败上传与孤儿对象回收

## 推荐实施顺序

1. 先把文档自动增量同步跑稳
2. 再补本地附件数据写入与引用渲染
3. 最后接入 Supabase Storage 上传与权限策略
