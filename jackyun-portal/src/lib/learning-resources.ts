export type ResourceCategory = 'igcse' | 'alevel-cie' | 'alevel-edexcel' | 'ielts' | 'computer' | 'tools';

export interface LearningResource {
  name: string;
  url: string;
  category: ResourceCategory;
  description: string;
  tags: string[];
  source: 'bookmark' | 'official' | 'added';
  featured?: boolean;
}

export const RESOURCE_CATEGORIES: { id: 'all' | ResourceCategory; label: string; icon: string }[] = [
  { id: 'all', label: '全部', icon: 'apps' },
  { id: 'igcse', label: 'IGCSE', icon: 'school' },
  { id: 'alevel-cie', label: 'A Level · CIE', icon: 'science' },
  { id: 'alevel-edexcel', label: 'A Level · Edexcel', icon: 'calculate' },
  { id: 'ielts', label: 'English · IELTS', icon: 'translate' },
  { id: 'computer', label: 'Computer', icon: 'terminal' },
  { id: 'tools', label: '学习工具', icon: 'auto_awesome' },
];

export const LEARNING_RESOURCES: LearningResource[] = [
  {
    name: 'Best Exam Help',
    url: 'https://bestexamhelp.com/exam/cambridge-igcse/pp-igcse.php',
    category: 'igcse',
    description: '按科目与考试季整理 Cambridge IGCSE 历年真题，适合集中查找 question paper 与 mark scheme。',
    tags: ['Past Papers', 'Cambridge', '真题'],
    source: 'bookmark',
    featured: true,
  },
  {
    name: 'ZNotes · IGCSE',
    url: 'https://znotes.org/caie/igcse/',
    category: 'igcse',
    description: '社区维护的 CAIE IGCSE 笔记、知识点与练习入口，适合快速复习和查漏补缺。',
    tags: ['Notes', 'CAIE', 'Quiz'],
    source: 'bookmark',
    featured: true,
  },
  {
    name: 'PapaCambridge Past Papers',
    url: 'https://pastpapers.papacambridge.com/',
    category: 'igcse',
    description: '覆盖多个考试局与科目的历年试卷库，可作为真题检索的备用来源。',
    tags: ['Past Papers', '多考试局'],
    source: 'bookmark',
  },
  {
    name: 'RevisionTown IGCSE',
    url: 'https://revisiontown.com/igcse-past-papers/',
    category: 'igcse',
    description: '按 IGCSE 科目汇总的真题入口，适合快速跳转至对应资料目录。',
    tags: ['Past Papers', '分类目录'],
    source: 'bookmark',
  },
  {
    name: 'Save My Exams · CIE Biology',
    url: 'https://www.savemyexams.com/igcse/biology/cie/23/revision-notes/',
    category: 'igcse',
    description: 'CIE IGCSE Biology 分章节复习笔记；部分内容可能需要账户或订阅。',
    tags: ['Biology', 'Revision Notes'],
    source: 'bookmark',
  },
  {
    name: 'Physics & Maths Tutor · Biology',
    url: 'https://www.physicsandmathstutor.com/biology-revision/igcse-cie/',
    category: 'igcse',
    description: 'CIE IGCSE Biology 的专题笔记、题目与复习材料集合。',
    tags: ['Biology', 'Topic Questions'],
    source: 'bookmark',
  },
  {
    name: 'Cambridge International AS & A Level',
    url: 'https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-advanced/cambridge-international-as-and-a-levels/subjects/',
    category: 'alevel-cie',
    description: 'Cambridge 官方科目目录，可查 syllabus、样卷、past papers 与官方支持资料。',
    tags: ['Official', 'Syllabus', 'Past Papers'],
    source: 'official',
    featured: true,
  },
  {
    name: 'ZNotes · Subjects',
    url: 'https://znotes.org/subjects/',
    category: 'alevel-cie',
    description: '从科目总目录进入 CAIE AS & A Level 社区笔记和学习小组。',
    tags: ['Notes', 'Community'],
    source: 'bookmark',
  },
  {
    name: 'Pearson Edexcel International A Level',
    url: 'https://qualifications.pearson.com/en/qualifications/edexcel-international-advanced-levels.html',
    category: 'alevel-edexcel',
    description: 'Pearson 官方 IAL 入口，按科目查 specification、考试材料与资格说明。',
    tags: ['Official', 'IAL', 'Specification'],
    source: 'official',
    featured: true,
  },
  {
    name: 'IELTS Official Preparation',
    url: 'https://ielts.org/take-a-test/preparation-resources',
    category: 'ielts',
    description: 'IELTS 官方备考资源，包含样题、写作讲解、课程、讲座与练习材料。',
    tags: ['Official', 'Practice Tests', 'Writing'],
    source: 'official',
    featured: true,
  },
  {
    name: '雅思中文官方网站 · 备考指南',
    url: 'https://www.chinaielts.org/prepare',
    category: 'ielts',
    description: '中文 IELTS 备考指南与考试信息，适合了解考试结构和备考路径。',
    tags: ['中文', 'Official', '指南'],
    source: 'bookmark',
  },
  {
    name: 'CS50P · Python',
    url: 'https://www.youtube.com/watch?v=nLRL_NcnK-4',
    category: 'computer',
    description: 'Harvard CS50 的 Python 完整课程视频，适合系统入门编程。',
    tags: ['Python', 'YouTube', 'Course'],
    source: 'bookmark',
    featured: true,
  },
  {
    name: 'C++ Full Course',
    url: 'https://www.youtube.com/watch?v=-TkoO8Z07hI',
    category: 'computer',
    description: '从基础语法开始的 C++ 长课程，适合作为入门路线或复习索引。',
    tags: ['C++', 'YouTube', 'Course'],
    source: 'bookmark',
  },
  {
    name: '洛谷',
    url: 'https://www.luogu.com.cn/',
    category: 'computer',
    description: '中文算法题库、在线评测与计算机科学学习社区。',
    tags: ['算法', 'OJ', '中文'],
    source: 'bookmark',
  },
  {
    name: 'W3Schools',
    url: 'https://www.w3schools.com/',
    category: 'computer',
    description: '网页开发与常见编程语言的交互式入门教程和语法参考。',
    tags: ['Web', 'Reference', 'Tutorial'],
    source: 'bookmark',
  },
  {
    name: 'NotebookLM',
    url: 'https://notebooklm.google.com/',
    category: 'tools',
    description: '把课程资料、PDF 与笔记整理为可追溯来源的 AI 学习空间。',
    tags: ['AI', 'Notes', 'Research'],
    source: 'bookmark',
    featured: true,
  },
  {
    name: 'paper.sc',
    url: 'https://paper.sc/',
    category: 'tools',
    description: '简洁的在线文档与写作工具，可用于快速记录、整理和分享内容。',
    tags: ['Writing', 'Notes'],
    source: 'bookmark',
  },
  {
    name: 'YouTube',
    url: 'https://www.youtube.com/',
    category: 'tools',
    description: '寻找学科讲解、公开课与编程长课程；建议配合播放列表建立学习路径。',
    tags: ['Video', 'Courses'],
    source: 'bookmark',
  },
];
