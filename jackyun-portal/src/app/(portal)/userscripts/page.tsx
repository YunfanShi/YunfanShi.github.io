import type { Metadata } from 'next';
import UserscriptLibrary from '@/components/modules/userscript-library';

export const metadata: Metadata = {
  title: '网站插件大全 · JackYun Portal',
  description: 'JackYun 与 GitHub 社区的 Tampermonkey 用户脚本目录和安装中心。',
};

export default function UserscriptsPage() {
  return <UserscriptLibrary />;
}
