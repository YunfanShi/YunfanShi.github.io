import type { Metadata } from 'next';
import Link from 'next/link';
import TechEmpireExperience from './techempire-experience';
import styles from './techempire.module.css';

export const metadata: Metadata = {
  title: 'TECH EMPIRE · 科技帝国',
  description: '一个关于科技、秩序与共同建设的虚构基础设施世界观。',
  openGraph: { title: 'TECH EMPIRE · 科技帝国', description: '科技为基 · 法治为本' },
};

const principles = [
  ['01', '科技为基', '以可验证的技术建设长期可用的基础设施。'],
  ['02', '法治为本', '以公开规则约束权力，也保护每一位参与者。'],
  ['03', '创新自由', '允许试验、质疑与迭代，让新设施有机会被看见。'],
  ['04', '权利平等', '每位公民都拥有表达、参与和被尊重的权利。'],
  ['05', '共筑繁荣', '把个人想法变成可共享、可持续的公共成果。'],
];
const infrastructure = [
  ['NET-01', '无线网络覆盖', 'Operational', '保持关键区域的稳定连接。'],
  ['LUX-02', '备用照明设施', 'Standby', '在主照明不可用时维持基础可见度。'],
  ['PWR-03', '电力供应设施', 'Operational', '为日常设备与实验提供可靠能源。'],
  ['SUP-04', '补给仓库', 'Stocked', '储存必要的零食与应急补给。'],
  ['AIR-05', '驱蚊设施', 'Active', '改善基础设施区域的舒适度。'],
];
const timeline = [
  ['2024.04.14', '帝国建立', '以一套虚构的科技文明设定开启长期建设。'],
  ['PHASE 01', '首批公民加入', '共同制定早期规则，确认设施建设方向。'],
  ['PHASE 02', '基础设施部署', '网络、照明、电力与补给系统进入运行状态。'],
  ['PHASE 03', '宪法确立', '五项核心原则成为所有后续建设的公共坐标。'],
];

export default function TechEmpirePage() {
  return <main className={styles.page} data-tech-page>
    <TechEmpireExperience />
    <nav className={styles.nav} aria-label="科技帝国主导航">
      <a href="#overview" className={styles.brand}><span className={styles.brandMark}>TE</span>TECH EMPIRE</a>
      <div className={styles.navLinks}><a href="#infrastructure">基础设施</a><a href="#governance">治理体系</a><a href="#timeline">时间线</a><a href="#citizens">公民计划</a></div>
      <span className={styles.status}><i /> OPERATIONAL</span>
    </nav>
    <section id="overview" className={styles.hero} data-tech-section>
      <div className={styles.heroGrid} /><div className={styles.heroOrb} aria-hidden="true" />
      <div className={styles.heroCopy}><p className={styles.kicker}>EST. 2024.04.14 / VIRTUAL CIVILIZATION INFRASTRUCTURE</p><h1>TECH<br /><span>EMPIRE</span></h1><p className={styles.heroLead}>科技为基 · 法治为本</p><p className={styles.heroText}>构建面向未来的虚拟文明基础设施。这里是一家虚构的科技与基础设施集团，也是一个由公民共同维护的世界观。</p><div className={styles.heroActions}><a href="#infrastructure" className={styles.primaryButton}>进入帝国概览 <span>↗</span></a><a href="#principles" className={styles.textButton}>阅读核心原则</a></div></div>
      <div className={styles.heroMeta}><span>EMPIRE STATUS</span><strong>ACTIVE</strong><span>BUILD CYCLE</span><strong>∞ / CONTINUOUS</strong></div>
    </section>
    <section className={styles.intro} data-tech-section><p className={styles.sectionEyebrow}>01 / THE MISSION</p><div><h2>把想象变成<br /><em>可运行的秩序。</em></h2><p className={styles.sectionText}>科技帝国是一个明确标记为虚构的企业化世界观：它用基础设施、治理规则和共同建设，描述一个可以持续演进的未来社会。我们热烈接纳新公民与新设施。</p></div></section>
    <section id="principles" className={styles.section} data-tech-section><div className={styles.sectionHeader}><p className={styles.sectionEyebrow}>02 / CORE PRINCIPLES</p><h2>五项基础协议</h2></div><div className={styles.principleGrid}>{principles.map(([number, title, detail]) => <article key={number} className={styles.principle}><span>{number}</span><h3>{title}</h3><p>{detail}</p></article>)}</div></section>
    <section id="infrastructure" className={`${styles.section} ${styles.darkSection}`} data-tech-section><div className={styles.sectionHeader}><p className={styles.sectionEyebrow}>03 / INFRASTRUCTURE CONTROL</p><h2>基础设施运行中心</h2><p className={styles.muted}>当前设施状态 · 全部系统均为虚构设定</p></div><div className={styles.infraGrid}>{infrastructure.map(([id, name, status, detail]) => <article key={id} className={styles.infraCard}><div className={styles.infraTop}><span>{id}</span><b>{status}</b></div><h3>{name}</h3><p>{detail}</p><div className={styles.signal}><i /><i /><i /><i /><i /></div></article>)}</div></section>
    <section id="governance" className={styles.section} data-tech-section><div className={styles.sectionHeader}><p className={styles.sectionEyebrow}>04 / GOVERNANCE</p><h2>以责任连接每个角色</h2></div><div className={styles.governance}><div className={styles.command}><span>01</span><strong>总督 / GOVERNOR</strong><small>设定方向 · 承担最终责任</small></div><div className={styles.command}><span>02</span><strong>高级工程师 / SENIOR ENGINEER</strong><small>建设系统 · 审核技术方案</small></div><div className={styles.command}><span>03</span><strong>资助方与公民 / CITIZENS</strong><small>提出提案 · 参与维护 · 共享成果</small></div></div></section>
    <section id="timeline" className={`${styles.section} ${styles.timelineSection}`} data-tech-section><div className={styles.sectionHeader}><p className={styles.sectionEyebrow}>05 / CHRONICLE</p><h2>建设仍在继续</h2></div><div className={styles.timeline}>{timeline.map(([date, title, detail]) => <article key={date}><span>{date}</span><div><h3>{title}</h3><p>{detail}</p></div></article>)}</div></section>
    <section id="citizens" className={styles.citizen} data-tech-section><p className={styles.sectionEyebrow}>06 / CITIZEN PROGRAM</p><h2>新公民，欢迎加入。</h2><p>公民意味着遵守共同规则、尊重他人权利，并愿意为一项可共享的设施贡献时间或想法。第一版计划仅用于展示世界观，不收集真实注册信息。</p><div className={styles.citizenTags}><span>RESPECT</span><span>BUILD</span><span>PROPOSE</span><span>SHARE</span></div></section>
    <footer className={styles.footer} data-tech-section><div><span className={styles.brandMark}>TE</span><p>TECH EMPIRE / 虚构科技与基础设施集团</p></div><div><span>FOUNDED 2024.04.14 · VERSION 1.1</span><Link href="/dashboard">返回 JackYun Portal ↗</Link></div></footer>
  </main>;
}
