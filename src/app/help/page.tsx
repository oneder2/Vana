import { ArrowLeft, Mail } from 'lucide-react';
import { TitleBar } from '@/components/TitleBar';
import { FadeContent } from '@/components/motion/FadeContent';
import { AppLink } from '@/lib/router';

const questions = [
  { title: '没有账号，也可以写作吗？', body: '可以。点击“开始写作”即可使用本机文档，无需联网或登录。账号用于在其他设备上继续使用文档。' },
  { title: '不同设备上的文档不一致怎么办？', body: '进入账号页，确认两端登录同一个账号，再点击“立即同步”。如果有不同的修改，正文页的更多操作中可以查看保留的同步副本。' },
  { title: '如何回看或恢复修改？', body: '打开文档，点击“修改记录”对照正文变化，再选择要恢复的版本。恢复前会保留当前正文；记录仅保存在此设备，较早记录可能被清理。' },
  { title: '如何保存一份备份？', body: '在设置中导出文档备份，也可以选择备份文件，预览后导入副本。备份含文档内容，请妥善保管。' },
  { title: '文档可以导出哪些格式？', body: '从文件菜单导出 Markdown、DOCX 或 PDF；手机上可通过分享按钮打开系统分享面板。' },
];

export default function HelpPage() {
  return <div className="preferences-page">
    <TitleBar />
    <main className="mx-auto max-w-3xl px-6 py-8 sm:py-12">
      <AppLink href="/" className="preferences-back"><ArrowLeft size={16} />返回文档</AppLink>
      <FadeContent>
        <header className="preferences-heading mt-6"><h1>使用帮助</h1><p>关于写作、同步与文档备份。</p></header>
        {questions.map(question => <details key={question.title} className="help-question preference-section">
          <summary>{question.title}</summary><p className="preference-description">{question.body}</p>
        </details>)}
        <a href="mailto:eclospy@duck.com" className="ui-button ui-button-quiet mt-6"><Mail size={16} />联系支持</a>
      </FadeContent>
    </main>
  </div>;
}
