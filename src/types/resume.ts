/**
 * 简历数据模型类型定义
 * 单一数据源：所有 UI 状态都派生自 ResumeData
 */

/** 教育经历单条 */
export interface EducationItem {
  school: string;
  degree: string;
  range: string;
}

/** 实习/工作经历单条 */
export interface ExperienceItem {
  company: string;
  role: string;
  range: string;
  desc: string;
}

/** 项目经历单条 */
export interface ProjectItem {
  name: string;
  tech: string;
  desc: string;
}

/** 模板标识 */
export type TemplateId = 'minimal' | 'sidebar' | 'compact';

/** 段落类型 */
export type SectionKind =
  | 'education'    // 教育经历（数组）
  | 'experience'   // 实习/工作经历（数组）
  | 'projects'     // 项目经历（数组）
  | 'skills'       // 技能（文本）
  | 'awards'       // 奖项（文本）
  | 'about'        // 自我评价（文本）
  | 'custom';      // 用户自定义段落（文本 + 多条目）

/** 自定义段落的单条（用于 list 模式） */
export interface CustomItem {
  id: string;
  /** 标题（如"论文标题"、"语言"） */
  title: string;
  /** 描述 / 副标题 / 范围等 */
  desc: string;
}

/** 自定义段落形态 */
export type CustomShape = 'text' | 'list';

/** 段落配置：用户可编辑标题、调整顺序、切换可见性 */
export interface SectionConfig {
  /** 唯一 id，custom 段落用 random */
  id: string;
  /** 段落类型（决定数据来源） */
  kind: SectionKind;
  /** 用户可见的标题（可重命名） */
  title: string;
  /** 是否在预览中显示（手动开关） */
  enabled: boolean;
  /** 排序权重：值越小越靠前 */
  order: number;
  /** custom 段指向的数据 id（SectionConfig.id === CustomSection.id） */
  dataId?: string;
  /** custom 段的形态：text 单段 / list 多条目 */
  shape?: CustomShape;
}

/** 自定义段落的纯文本内容（多条目 = 多行） */
export interface CustomSection {
  id: string;
  /** 形态 */
  shape: CustomShape;
  /** 单段文本（shape='text' 时使用） */
  content: string;
  /** 多条目（shape='list' 时使用） */
  items: CustomItem[];
}

/** 元信息（自动维护，禁止用户直接编辑） */
export interface ResumeMeta {
  /** ISO8601 时间戳 */
  updatedAt: string;
  /** 数据 schema 版本，用于未来字段迁移 */
  version: number;
}

/**
 * 基础信息中的自定义字段（用户自由添加：年龄 / 工作年限 / 期望薪资 / 状态 …）
 * - 独立于 6 个内置字段（name/title/email/phone/location/website）
 * - label 与 value 都是 string
 * - id 内部用于不可变更新
 */
export interface BasicField {
  id: string;
  label: string;
  value: string;
}

/** 简历数据根对象 */
export interface ResumeData {
  /** 基础信息 */
  name: string;
  title: string;
  email: string;
  phone: string;
  location: string;
  website: string;

  /** 结构化经历 */
  education: EducationItem[];
  experience: ExperienceItem[];
  projects: ProjectItem[];

  /** 纯文本字段 */
  skills: string;
  awards: string;
  about: string;

  /** 自定义段落 */
  customSections: CustomSection[];

  /** 自定义基础信息字段（年龄 / 工作年限 / 状态等用户自由添加的项） */
  customBasics: BasicField[];

  /** 段落配置：决定渲染顺序、标题、可见性 */
  sections: SectionConfig[];

  /** UI 偏好 */
  template: TemplateId;

  /** 元信息 */
  meta: ResumeMeta;
}

/** 字段路径：用于事件定位与表单绑定 */
export type FieldPath =
  | 'name' | 'title' | 'email' | 'phone' | 'location' | 'website'
  | 'skills' | 'awards' | 'about';

/** 可被 setField 设置的所有数据字段（含 UI 偏好 template） */
export type DataPath = FieldPath | 'template';

/** 数组字段路径：用于新增/删除条目 */
export type ArrayFieldPath = 'education' | 'experience' | 'projects';

/** 段落内置类型的默认标题（用作初始值与重命名提示） */
export const DEFAULT_SECTION_TITLE: Record<Exclude<SectionKind, 'custom'>, string> = {
  education: '教育经历',
  experience: '实习 / 工作经历',
  projects: '项目经历',
  skills: '技能',
  awards: '奖项',
  about: '自我评价'
};

/**
 * 新增段落时的预设：用户一键选择，无需手打段名
 * - shape: 段落形态（text = 单段文本 / list = 多条目）
 * - title: 建议的默认标题（仍可在添加后重命名）
 * - hint: 一句话说明，弹层里展示
 * - placeholder: list 形态下条目的标题位占位文字
 */
export interface SectionPreset {
  key: string;
  title: string;
  shape: CustomShape;
  hint: string;
  /** list 形态：条目标题占位 */
  itemTitlePH?: string;
  /** list 形态：条目描述占位 */
  itemDescPH?: string;
  /** text 形态：文本占位 */
  textPH?: string;
}

export const SECTION_PRESETS: SectionPreset[] = [
  { key: 'publications', title: '出版物 / 论文', shape: 'list', hint: '用于学术论文、技术博客、演讲等', itemTitlePH: '标题', itemDescPH: '作者 / 期刊 / 时间' },
  { key: 'certificates', title: '证书 / 执照', shape: 'list', hint: '职业证书、从业资格、语言成绩等', itemTitlePH: '证书名称', itemDescPH: '颁发机构 / 获得时间' },
  { key: 'languages', title: '语言能力', shape: 'list', hint: '如：英语 CET-6、雅思 7.0', itemTitlePH: '语言', itemDescPH: '等级 / 分数' },
  { key: 'volunteer', title: '志愿者经历', shape: 'list', hint: '公益 / 社区 / 学生组织等', itemTitlePH: '组织 / 活动', itemDescPH: '角色 / 时间 / 简述' },
  { key: 'training', title: '培训 / 课程', shape: 'list', hint: '进修课程、训练营、认证培训', itemTitlePH: '课程名', itemDescPH: '机构 / 时间' },
  { key: 'interests', title: '兴趣爱好', shape: 'text', hint: '一段话介绍个人兴趣与特质', textPH: '如：开源贡献、长跑、钢琴 8 级' },
  { key: 'refs', title: '推荐人', shape: 'list', hint: '列出可联系的推荐人', itemTitlePH: '姓名 / 职位', itemDescPH: '联系方式 / 关系' },
  { key: 'links', title: '链接 / 作品集', shape: 'list', hint: '个人主页、博客、GitHub、Dribbble 等', itemTitlePH: '站点名', itemDescPH: 'URL' }
];

/** 判断段落是否有可显示内容（用于预览自动隐藏空段） */
export function isSectionEmpty(sec: SectionConfig, d: ResumeData): boolean {
  switch (sec.kind) {
    case 'education':
      return d.education.every((e) => !e.school && !e.degree && !e.range);
    case 'experience':
      return d.experience.every((e) => !e.company && !e.role && !e.range && !e.desc.trim());
    case 'projects':
      return d.projects.every((p) => !p.name && !p.tech && !p.desc.trim());
    case 'skills':
      return !d.skills.trim();
    case 'awards':
      return !d.awards.trim();
    case 'about':
      return !d.about.trim();
    case 'custom': {
      const cs = d.customSections.find((c) => c.id === sec.dataId);
      if (!cs) return true;
      if (cs.shape === 'text') return !cs.content.trim();
      return cs.items.every((it) => !it.title.trim() && !it.desc.trim());
    }
  }
}

/** 校验错误 */
export interface ValidationError {
  field: FieldPath | { path: ArrayFieldPath; key: string };
  message: string;
}

/** 校验结果 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/** 导出格式 */
export type ExportFormat = 'pdf' | 'docx' | 'md' | 'png';
