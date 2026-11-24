# React Bits 候选动效

状态：供选择，未纳入本轮实现。调研日期：2026-11-14。

本轮已实现的菜单、弹层和参数展开过渡使用项目自身 CSS，没有引入下表组件或新增动效依赖。项目原有 FadeContent 的来源声明继续保留。

## 调研依据

入口：[React Bits](https://www.reactbits.dev/get-started/index)。入口 HTML 可读取，细分演示地址在当前命令行访问返回 403，因此下表依据官方仓库实际源码，未声称已在网站演示中实测。

审阅版本：[DavidHDev/react-bits @ cf28010](https://github.com/DavidHDev/react-bits/tree/cf2801031f07f53d4684e65b961bde7c2e2a6921/src/ts-default)。原始源码快照在本地 `output/interaction-refinement/reactbits/*.tsx.txt`。依赖与行为按此版本记录，之后升级需重新核查。

## 供选择的组件

| 候选 | 在 Vana 的用途 | 实现与适配要求 | 建议 |
| --- | --- | --- | --- |
| [ClickSpark](https://github.com/DavidHDev/react-bits/blob/cf2801031f07f53d4684e65b961bde7c2e2a6921/src/ts-default/Animations/ClickSpark/ClickSpark.tsx) | 冲印完成、落下一枚痕迹时，出现一次短促墨点或火星 | React + Canvas；源码有 burst 上限和动态偏好处理。只挂在明确的成功反馈点，避免覆盖正文点击与长按。降低像素比与粒子数量，减少动态时关闭装饰 | 优先候选 |
| [PixelTransition](https://github.com/DavidHDev/react-bits/blob/cf2801031f07f53d4684e65b961bde7c2e2a6921/src/ts-default/Animations/PixelTransition/PixelTransition.tsx) | 终端介质预览、切换材质时的短暂像素显影 | React + Canvas/CSS；支持受控 active、click/hover 和减少动态。只对缩略预览做一次转场，保持最终导出画面确定，不把交互正文转换为截图 | 优先候选 |
| [DecryptedText](https://github.com/DavidHDev/react-bits/blob/cf2801031f07f53d4684e65b961bde7c2e2a6921/src/ts-default/TextAnimations/DecryptedText/DecryptedText.tsx) | 终端信稿打开时解码一次标题或短句 | 使用 `motion/react` 与计时器，包含屏幕阅读器真实文本和装饰层。中文需使用完整字素并限制长度；只用于展示层，原文、编辑、复制与导出不参与乱码动画 | 可选主题效果 |
| [AnimatedList](https://github.com/DavidHDev/react-bits/blob/cf2801031f07f53d4684e65b961bde7c2e2a6921/src/ts-default/Components/AnimatedList/AnimatedList.tsx) | 个人预设列表的选择指示条和条目进入 | React + CSS；默认示例依赖 Hugeicons，项目应改用已有 Lucide。源码含 RAF 弹簧与键盘导航；只借鉴选中反馈，文档树仍保持原有 tree 语义，避免窗口级键盘监听干扰编辑器 | 可选基础反馈 |
| [SpotlightCard](https://github.com/DavidHDev/react-bits/blob/cf2801031f07f53d4684e65b961bde7c2e2a6921/src/ts-default/Components/SpotlightCard/SpotlightCard.tsx) | 材质缩略卡随指针出现局部照明 | React + CSS/RAF；含可见性、焦点与减少动态处理。关闭 ambient 持续动画；桌面悬停触发，手机使用稳定选中边框；不用于每篇正文背景 | 可选桌面点缀 |
| [ElasticSlider](https://github.com/DavidHDev/react-bits/blob/cf2801031f07f53d4684e65b961bde7c2e2a6921/src/ts-default/Components/ElasticSlider/ElasticSlider.tsx) | 痕迹浓度、纹理强度的回弹手感 | 此版本使用自有 RAF，默认图标依赖 Hugeicons；有 slider ARIA、键盘和动态偏好。需保留精确数值、范围约束，验证纵向参数滚动和滑块横向拖动冲突，不能让视觉回弹改变保存值 | 后续单独试验 |
| [Dock](https://github.com/DavidHDev/react-bits/blob/cf2801031f07f53d4684e65b961bde7c2e2a6921/src/ts-default/Components/Dock/Dock.tsx) | 桌面文字工坊工具随指针轻微放大 | React + CSS/RAF，源码还包含菜单行为。只借鉴桌面放大，不替换已统一的菜单逻辑；手机保持固定触摸尺寸，避免移动点击目标 | 低优先级 |
| [Noise](https://github.com/DavidHDev/react-bits/blob/cf2801031f07f53d4684e65b961bde7c2e2a6921/src/ts-default/Animations/Noise/Noise.tsx) | 终端介质上的局部扫描噪点 | React + Canvas；连续播放会持续 RAF，虽处理可见性与减少动态，手机仍需耗电评估。纸张已使用可复现纹理，静态纹理继续沿用；动态噪点若采纳只在终端预览开启 | 暂缓 |

建议先选择 **ClickSpark + PixelTransition**：一个表达动作完成，一个表达材质变化。若希望强化终端主题，再增加 DecryptedText。三者都可做为可关闭的显示效果。

## 接入边界

- 用户决定采纳后，再制作独立开关与原型，分别验证 Android 实机、桌面键盘、减少动态偏好。
- 正文与导出始终保存真实文字和确定的设计参数。动画不写入文档内容，不影响撤销、复制、同步或图片导出。
- 不把全屏粒子、流体光标、磁吸文字挂在编辑区；这些会与选字、滚动、模块长按竞争。
- 官方仓库当前声明 MIT + Commons Clause，应按具体选取文件核对许可，并更新 `THIRD_PARTY_NOTICES.md` 与 `licenses/`。本表不等同于已完成未来商业用途的许可确认。
