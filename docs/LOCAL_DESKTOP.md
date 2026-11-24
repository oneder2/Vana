# Linux 本机安装、登录自启与更新

当前支持 Linux x86_64、Python 3、systemd 用户服务与 XDG 桌面。Linux Mint / Cinnamon 使用以下配置。所有文件都在当前用户目录，无需 sudo，正式版沿用 `com.vana.no-visitors` 的现有文档和账号空间。

```bash
npm run desktop:install
```

命令下载 `oneder2/Vana` 最新已公开的正式 Release 的 AppImage，核对 GitHub 提供的 SHA-256、文件大小、Linux x86_64 AppImage 头，再完成安装。网络、校验或数据备份失败时，当前安装入口保持不变。Draft 和预发布不进入更新，不自动降级。AppImage 需要系统 FUSE 2；当前 Mint 已具备。

桌面应用菜单会出现 Vana。登录桌面约 8 秒后自动打开，登录后两分钟及此后每小时由用户级定时任务检查新正式版，时间另加最多 90 秒随机延迟。电脑离线时照常打开已安装版本；下次定时检查会重试。

更新下载到独立版本目录，完成后原子切换 `current`。已有窗口继续使用其启动时的版本，关闭后再打开便使用新版。启动器持有单实例锁，重复启动会尝试激活现有窗口。版本更新前用 SQLite backup API 备份应用数据目录内的数据库，不修改原数据库文件；保留旧程序和备份以便手动回退。

## 文件位置

| 路径 | 用途 |
| --- | --- |
| `~/.local/bin/vana` | 稳定启动器 |
| `~/.local/share/applications/vana.desktop` | 应用菜单入口 |
| `~/.config/autostart/vana.desktop` | 登录桌面后自动启动 |
| `~/.config/systemd/user/vana-local-update.{service,timer}` | 更新任务和每小时定时器 |
| `~/.local/share/vana-desktop/manager.py` | 安装后的独立管理脚本，运行不依赖仓库位置 |
| `~/.local/share/vana-desktop/current` / `previous` | 当前 / 前一个版本的符号链接 |
| `~/.local/share/vana-desktop/versions/<版本>-<摘要>/` | 已验证 AppImage、安装信息与 `data-backup/` 数据库备份 |

应用安装目录与现有 `~/.local/share/com.vana.no-visitors/` 数据目录分开。`XDG_DATA_HOME` 和 `XDG_CONFIG_HOME` 如已设置则遵循其路径。重新安装配置时，修改过的旧配置先备份到安装目录下的 `config-backups/`。

## 日常操作

```bash
~/.local/bin/vana
npm run desktop:update
npm run desktop:status
systemctl --user list-timers vana-local-update.timer
journalctl --user -u vana-local-update.service -n 30
```

发布新的正式 Release 后，本机在下一次定时检查中安装。修改工作区代码、只改版本号或生成 Preview 不会更新这个正式安装；仍需按项目发布流程发布正式 Release。

停止自动更新：

```bash
systemctl --user disable --now vana-local-update.timer
```

关闭登录自启：在系统「启动应用程序」里禁用 Vana，或将 `~/.config/autostart/vana.desktop` 中 `X-GNOME-Autostart-enabled` 设为 `false`。重新运行 `desktop:install` 会重新启用这些设置。

手动回退程序时应先正常关闭所有 Vana 窗口，再把 `current` 指向 `previous` 的目标，并暂停更新定时器以免重新升级。数据库可能经过新版迁移，程序回退不等于数据回退；数据库备份保存在对应版本的 `data-backup/`，需要回退数据时先另外保留当前数据。

## 验证

`npm run test:local-linux` 在临时目录验证正式版筛选、下载校验、更新失败保留旧入口、数字版本比较、SQLite 备份、并发互斥、幂等配置及仓库无关启动器。测试不访问真实 Release、用户数据库或桌面配置，也纳入 `check-build-ready.sh`。
