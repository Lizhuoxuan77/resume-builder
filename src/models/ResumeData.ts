/**
 * 简历数据工厂与不可变更新工具
 * 单一职责：构造/克隆/路径式更新，不感知 UI
 */

import type {
  ResumeData,
  EducationItem,
  ExperienceItem,
  ProjectItem,
  DataPath,
  ArrayFieldPath,
  SectionConfig,
  SectionKind,
  CustomSection,
  CustomItem,
  CustomShape,
  BasicField
} from '@/types/resume';
import { DEFAULT_SECTION_TITLE } from '@/types/resume';

/** 当前 schema 版本号 */
export const SCHEMA_VERSION = 4;

/** 创建空白简历 */
export function createEmptyResume(): ResumeData {
  return {
    name: '',
    title: '',
    email: '',
    phone: '',
    location: '',
    website: '',
    education: [{ school: '', degree: '', range: '' }],
    experience: [{ company: '', role: '', range: '', desc: '' }],
    projects: [{ name: '', tech: '', desc: '' }],
    skills: '',
    awards: '',
    about: '',
    customSections: [],
    customBasics: [],
    sections: createDefaultSections(),
    template: 'minimal',
    meta: { updatedAt: new Date().toISOString(), version: SCHEMA_VERSION }
  };
}

/** 默认段落配置（按用户最常见的顺序） */
export function createDefaultSections(): SectionConfig[] {
  const order: Exclude<SectionKind, 'custom'>[] = ['education', 'experience', 'projects', 'skills', 'awards', 'about'];
  return order.map((kind, i) => ({
    id: `sec_${kind}`,
    kind,
    title: DEFAULT_SECTION_TITLE[kind],
    enabled: true,
    order: i
  }));
}

/** 深度克隆（结构化数据足够浅，JSON 路线安全） */
export function cloneResume(data: ResumeData): ResumeData {
  return JSON.parse(JSON.stringify(data)) as ResumeData;
}

/** 触摸元信息：返回带新 updatedAt 的副本（不修改入参） */
export function touchMeta(data: ResumeData): ResumeData {
  return { ...data, meta: { ...data.meta, updatedAt: new Date().toISOString() } };
}

/**
 * 简单字段 set：返回新对象
 * 接受 DataPath（含 template），让 UI 偏好也能复用统一不可变更新
 */
export function setField<K extends DataPath>(
  data: ResumeData,
  path: K,
  value: ResumeData[K]
): ResumeData {
  return touchMeta({ ...data, [path]: value });
}

/** 数组条目字段 set：返回新对象（不可变） */
export function setArrayItemField(
  data: ResumeData,
  path: ArrayFieldPath,
  index: number,
  key: string,
  value: string
): ResumeData {
  const list = data[path] as unknown as Array<Record<string, string>>;
  if (index < 0 || index >= list.length) return data;
  const next = list.map((item, i) => (i === index ? { ...item, [key]: value } : item));
  return touchMeta({ ...data, [path]: next }) as unknown as ResumeData;
}

/** 数组新增条目 */
export function addArrayItem<K extends ArrayFieldPath>(
  data: ResumeData,
  path: K,
  factory: () => ResumeData[K][number]
): ResumeData {
  const list = data[path] as Array<unknown>;
  const next = [...list, factory()];
  return touchMeta({ ...data, [path]: next }) as ResumeData;
}

/** 数组删除条目（index 越界时静默 no-op） */
export function removeArrayItem<K extends ArrayFieldPath>(
  data: ResumeData,
  path: K,
  index: number
): ResumeData {
  const list = data[path] as Array<unknown>;
  if (index < 0 || index >= list.length) return data;
  const next = list.filter((_, i) => i !== index);
  return touchMeta({ ...data, [path]: next }) as ResumeData;
}

/** 工厂函数：构造各类空条目 */
export const ItemFactories = {
  education: (): EducationItem => ({ school: '', degree: '', range: '' }),
  experience: (): ExperienceItem => ({ company: '', role: '', range: '', desc: '' }),
  projects: (): ProjectItem => ({ name: '', tech: '', desc: '' })
} as const;

/* ---------------- Section 操作 ---------------- */

/** 通用 id 生成 */
function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 自定义段落条目的空对象 */
function genCustomItem(): CustomItem {
  return { id: genId('itm'), title: '', desc: '' };
}

/** 重命名段落 */
export function renameSection(data: ResumeData, sectionId: string, title: string): ResumeData {
  const sections = data.sections.map((s) => (s.id === sectionId ? { ...s, title } : s));
  return touchMeta({ ...data, sections });
}

/** 切换段落可见性 */
export function toggleSection(data: ResumeData, sectionId: string, enabled?: boolean): ResumeData {
  const sections = data.sections.map((s) =>
    s.id === sectionId ? { ...s, enabled: enabled ?? !s.enabled } : s
  );
  return touchMeta({ ...data, sections });
}

/** 段落上移 / 下移（交换 order） */
export function moveSection(data: ResumeData, sectionId: string, dir: 'up' | 'down'): ResumeData {
  const sorted = [...data.sections].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex((s) => s.id === sectionId);
  if (idx < 0) return data;
  const swap = dir === 'up' ? idx - 1 : idx + 1;
  if (swap < 0 || swap >= sorted.length) return data;
  const a = sorted[idx]!;
  const b = sorted[swap]!;
  const aOrder = a.order;
  const reordered = sorted.map((s) => {
    if (s.id === a.id) return { ...s, order: b.order };
    if (s.id === b.id) return { ...s, order: aOrder };
    return s;
  });
  return touchMeta({ ...data, sections: reordered });
}

/**
 * 段落拖拽到指定位置：将 sectionId 移动到目标 idx 之前
 * - 重新分配 order，使列表在按 order 排序后，sectionId 出现在 idx 处
 */
export function moveSectionTo(data: ResumeData, sectionId: string, targetIdx: number): ResumeData {
  const sorted = [...data.sections].sort((a, b) => a.order - b.order);
  const fromIdx = sorted.findIndex((s) => s.id === sectionId);
  if (fromIdx < 0) return data;
  let toIdx = targetIdx;
  if (toIdx < 0) toIdx = 0;
  if (toIdx > sorted.length - 1) toIdx = sorted.length - 1;
  if (fromIdx === toIdx) return data;
  // 抽出后插入
  const [moved] = sorted.splice(fromIdx, 1);
  sorted.splice(toIdx, 0, moved!);
  // 重新分配 order
  const reordered = sorted.map((s, i) => ({ ...s, order: i }));
  return touchMeta({ ...data, sections: reordered });
}

/** 删除自定义段落（同时移除数据和配置）；内置段落用 toggleSection(false) 替代 */
export function removeSection(data: ResumeData, sectionId: string): ResumeData {
  const sec = data.sections.find((s) => s.id === sectionId);
  if (!sec || sec.kind !== 'custom') return data;
  const sections = data.sections.filter((s) => s.id !== sectionId);
  const customSections = data.customSections.filter((c) => c.id !== sec.dataId);
  return touchMeta({ ...data, sections, customSections });
}

/**
 * 新增自定义段落（支持指定形态、标题、初始条目）
 * 用法：
 *   addCustomSection(data)                       // 默认 text 形态，标题"自定义段落"
 *   addCustomSection(data, { title, shape })     // 自定义标题/形态
 *   addCustomSection(data, { preset: 'publications' })  // 用预设一键添加
 */
export interface AddSectionInput {
  title?: string;
  shape?: CustomShape;
  /** 初始条目（list 形态专用） */
  initialItems?: number;
}

export function addCustomSection(
  data: ResumeData,
  input: AddSectionInput | string = {}
): ResumeData {
  const opts: AddSectionInput = typeof input === 'string' ? { title: input } : input;
  const id = genId('cus');
  const maxOrder = data.sections.reduce((m, s) => Math.max(m, s.order), -1);
  const shape: CustomShape = opts.shape ?? 'text';
  const newSection: SectionConfig = {
    id,
    kind: 'custom',
    title: opts.title ?? '自定义段落',
    enabled: true,
    order: maxOrder + 1,
    dataId: id,
    shape
  };
  const initial: CustomItem[] = [];
  const count = Math.max(0, opts.initialItems ?? (shape === 'list' ? 1 : 0));
  for (let i = 0; i < count; i += 1) {
    initial.push(genCustomItem());
  }
  const newData: CustomSection = { id, shape, content: '', items: initial };
  return touchMeta({
    ...data,
    sections: [...data.sections, newSection],
    customSections: [...data.customSections, newData]
  });
}

/** 设置自定义段落内容（text 形态） */
export function setCustomSectionContent(
  data: ResumeData,
  dataId: string,
  content: string
): ResumeData {
  const customSections = data.customSections.map((c) => (c.id === dataId ? { ...c, content } : c));
  return touchMeta({ ...data, customSections });
}

/** 在自定义段落（list 形态）中新增一个条目 */
export function addCustomItem(data: ResumeData, dataId: string): ResumeData {
  const customSections = data.customSections.map((c) =>
    c.id === dataId ? { ...c, items: [...c.items, genCustomItem()] } : c
  );
  return touchMeta({ ...data, customSections });
}

/** 设置自定义段落条目的字段 */
export function setCustomItemField(
  data: ResumeData,
  dataId: string,
  itemId: string,
  key: 'title' | 'desc',
  value: string
): ResumeData {
  const customSections = data.customSections.map((c) => {
    if (c.id !== dataId) return c;
    return {
      ...c,
      items: c.items.map((it) => (it.id === itemId ? { ...it, [key]: value } : it))
    };
  });
  return touchMeta({ ...data, customSections });
}

/** 删除自定义段落的一个条目 */
export function removeCustomItem(data: ResumeData, dataId: string, itemId: string): ResumeData {
  const customSections = data.customSections.map((c) => {
    if (c.id !== dataId) return c;
    const next = c.items.filter((it) => it.id !== itemId);
    // 至少保留一个空条目，避免用户无法继续添加
    if (next.length === 0) next.push(genCustomItem());
    return { ...c, items: next };
  });
  return touchMeta({ ...data, customSections });
}

/** 获取按 order 排序后的段落配置 */
export function sortedSections(data: ResumeData): SectionConfig[] {
  return [...data.sections].sort((a, b) => a.order - b.order);
}

/* ---------------- Custom Basics 操作 ---------------- */

/** 构造一个空的自定义基础信息字段（默认 label 为"自定义"） */
function genBasicField(label = '自定义'): BasicField {
  return { id: `bf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, label, value: '' };
}

/** 新增自定义基础信息字段（在末尾追加） */
export function addCustomBasic(data: ResumeData, label?: string): ResumeData {
  const next = [...data.customBasics, genBasicField(label)];
  return touchMeta({ ...data, customBasics: next });
}

/** 删除自定义基础信息字段（id 不存在时静默 no-op） */
export function removeCustomBasic(data: ResumeData, id: string): ResumeData {
  const next = data.customBasics.filter((b) => b.id !== id);
  if (next.length === data.customBasics.length) return data;
  return touchMeta({ ...data, customBasics: next });
}

/** 设置自定义基础信息字段的 label */
export function setCustomBasicLabel(data: ResumeData, id: string, label: string): ResumeData {
  const next = data.customBasics.map((b) => (b.id === id ? { ...b, label } : b));
  return touchMeta({ ...data, customBasics: next });
}

/** 设置自定义基础信息字段的 value */
export function setCustomBasicValue(data: ResumeData, id: string, value: string): ResumeData {
  const next = data.customBasics.map((b) => (b.id === id ? { ...b, value } : b));
  return touchMeta({ ...data, customBasics: next });
}

/** 移动自定义基础信息字段（dir='up' | 'down'） */
export function moveCustomBasic(data: ResumeData, id: string, dir: 'up' | 'down'): ResumeData {
  const idx = data.customBasics.findIndex((b) => b.id === id);
  if (idx < 0) return data;
  const swap = dir === 'up' ? idx - 1 : idx + 1;
  if (swap < 0 || swap >= data.customBasics.length) return data;
  const next = [...data.customBasics];
  const a = next[idx]!;
  const b = next[swap]!;
  next[idx] = b;
  next[swap] = a;
  return touchMeta({ ...data, customBasics: next });
}
