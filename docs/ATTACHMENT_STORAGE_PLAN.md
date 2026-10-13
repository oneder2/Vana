# 附件 / 图片 Storage 方案

这份方案用于给当前 `SQLite + Supabase` 主线预留附件与图片能力，但暂时不直接放开云端上传。

## 当前结论

- 本地仍然是第一落点
- Supabase 现在只预留 `document_assets` 元数据表
- Storage bucket、上传限额、内容校验、清理策略放到下一阶段实施

本地第一阶段已在独立开发分支实现：附件内容写入账号空间 SQLite 的 `attachment_blobs`，元数据与内容在同一事务校验；正文 outbox 不携带二进制。备份含附件时自动使用 v2，旧 v1 备份仍可读取；导入重映射文档和附件 ID。界面显示“仅此设备”，可添加、导出/分享和移除文件。Linux 原生文件选择器、内容导出、异常拒绝、删除、备份复制和进程重启回读已通过；Android 正式签名包、设备故障恢复和长期容量行为仍待验证，见 [验收记录](ATTACHMENT_ACCEPTANCE.md)。

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
- `attachment_blobs.data`（本地内容，账号空间数据库内；不上传 Hosted）

## 第一阶段

目标：打通本地附件的完整生命周期；前四个工作包验收后实施，当前尚未交付。

当前实现与约束：

- 先在文档附件列表添加、读取和移除文件；图片嵌入要同时扩展正文校验、差异、恢复和导出契约，不能直接把本机绝对路径放入正文。
- 文件内容保存在当前账号空间 SQLite BLOB 中，使用独立 ID 和 SHA-256 校验；读取与删除均校验账号空间和所属文档。原始路径不入库，文件名拒绝路径穿越及不安全字符；导出另行校验目标路径与符号链接。
- 元数据与内容在同一 SQLite 事务提交，无需协调外部内容文件；模拟写入失败时整体回滚，账号切换拒绝迟到操作。设备断电和磁盘故障恢复仍需原生验收。
- 备份格式升级并兼容现有 v1：声明附件清单、长度、哈希与总体上限；先完整验证再提交，复制导入重映射文档与附件 ID。不能把只包含元数据的文件宣称为完整附件备份。
- 移到回收站保留文件；单独移除、永久删除文档及账号空间清理有明确且可重试的文件回收语义，正文历史是否仍引用文件必须计入。
- UI 明确标注“仅此设备”。云二进制流程验收前不上传孤立元数据，也不向其他设备同步不可解析的本地文件引用。

第一阶段需要有意义的回归：断网添加与重启回读、跨账号同 ID 隔离、篡改长度/哈希、恶意文件名/路径、备份复制导入、删除与历史恢复、文件/数据库故障后的回收。至少用桌面原生文件选择器和 Android 正式签名包各完成一轮；文件 input 在异步读取结束前不能清空。

## 第二阶段

目标：谨慎接入 Supabase Storage。

建议内容：

- 建立私有 bucket，例如 `document-assets`
- 上传路径按 `user_id/document_id/asset_id.ext`
- 上传前生成 `sha256`
- 服务端限制 MIME、大小、数量
- 客户端在同步成功后再回填 `storage_object_path`

第二阶段先设计服务端预约与完成协议：总量和频率限制需在服务端串行校验并约束 Storage 写入，不能只靠客户端检查或一个私有 bucket。重试使用同一操作 ID；上传成功但确认丢失不重复计费或生成重复对象；文档、附件元数据和二进制到达顺序不同时，界面显示可恢复的等待状态。账号切换、删除竞态、失败预约释放和孤儿清理必须有真实双账号验收，随后才能开放 Hosted 上传。

## 防滥用要求

如果后续开放测试，至少要补这几条：

- 单用户总存储上限
- 单文件大小上限
- 图片 MIME 白名单
- 上传频率限制
- 软删除与定期清理任务
- 失败上传与孤儿对象回收

## 本地第一阶段验收门槛

- 支持文件类型与 magic/UTF-8 校验；拒绝路径穿越、符号链接语义、伪造扩展名和损坏 SHA-256。
- 每个文件 5 MiB、每篇 20 个、每空间 25 MiB；软删除保留文件，永久删除清理 BLOB。
- 文档恢复、同步冲突副本和跨账号显式复制会复制内容并生成新附件 ID；远端永久删除若本地仍有文件，会保留可查看的冲突副本。
- 关闭、登出和账号切换等待附件操作结束；失败不提交元数据或文件，文件 input 在异步读取结束前不清空。
- v2 备份先完整校验所有文件和目录，再原子导入；内容长度、MIME、SHA-256 不一致时整份回滚。

## 推荐实施顺序

1. 先完成 revision 同步的真实 Supabase 集成验证及文档恢复能力（当前下行是固定快照分页，不是增量拉取），见 [开发路线](ROADMAP.md)
2. 再补本地附件数据写入与引用渲染
3. 最后接入 Supabase Storage 上传与权限策略
