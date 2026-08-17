import type { Metadata } from 'next';
import UserscriptLibrary from '@/components/modules/userscript-library';

export const metadata: Metadata = {
  title: '网站插件大全 · JackYun Portal',
  description: 'JackYun、Greasy Fork 与 GitHub 的精选 Tampermonkey 脚本目录，覆盖学习、AI、视频、阅读、开发、社交、效率与隐私。',
};

export default function UserscriptsPage() {
  return <UserscriptLibrary />;
}
