/**
 * 预览视图（右侧简历纸）
 * 职责：渲染数据 → DOM；不感知编辑区
 * 通过 class 切换模板（tpl-minimal / tpl-sidebar / tpl-compact）
 * 通过 sections 配置驱动段落顺序、标题、可见性
 *
 * 自动隐藏：未启用（enabled=false）或无内容（isSectionEmpty）的段落
 * 不在预览中显示（按用户的"所见即所得"原则）。
 */

import { el, clear } from '@/utils/dom';
import type { ResumeData, TemplateId, SectionConfig, CustomSection } from '@/types/resume';
import { isSectionEmpty, DEFAULT_SECTION_TITLE } from '@/types/resume';
import { View } from './View';
import { formatDateYMD } from '@/utils';
import { sortedSections } from '@/models/ResumeData';

const TEMPLATE_CLASS: Record<TemplateId, string> = {
  minimal: 'tpl-minimal',
  sidebar: 'tpl-sidebar',
  compact: 'tpl-compact'
};

const CONTACT_ITEMS: Array<[string, (d: ResumeData) => string | undefined]> = [
  ['📧', (d) => d.email],
  ['📱', (d) => d.phone],
  ['📍', (d) => d.location],
  ['🔗', (d) => d.website]
];

export class PreviewView extends View<ResumeData> {
  private paperEl: HTMLElement | null = null;
  private emptyEl: HTMLElement | null = null;
  private paneTitle: HTMLElement | null = null;
  private body: HTMLElement | null = null;

  mount(root: HTMLElement): void {
    this.root = root;
    this.paneTitle = el('div', { className: 'rb-pane-title', text: '实时预览' });
    root.appendChild(this.paneTitle);
    this.body = el('div', { className: 'rb-preview' });
    root.appendChild(this.body);
    this.renderEmpty();
  }

  onStateChange(data: ResumeData): void {
    if (!this.body) return;
    if (this.emptyEl) {
      this.emptyEl.remove();
      this.emptyEl = null;
    }
    this.renderPaper(data);
  }

  getPreviewElement(): HTMLElement | null {
    return this.paperEl;
  }

  private renderEmpty(): void {
    if (!this.body) return;
    const host = el('div', { className: 'rb-paper-host' });
    const empty = el('div', { className: 'rb-empty' });
    empty.append(
      el('div', { className: 'rb-empty__icon', text: '📝' }),
      el('p', { className: 'rb-empty__title', text: '从左侧开始填写' }),
      el('p', { className: 'rb-empty__sub', text: '所有内容会自动保存到本机，关闭浏览器也不会丢' })
    );
    host.appendChild(empty);
    this.body.appendChild(host);
    this.emptyEl = host;
  }

  private renderPaper(d: ResumeData): void {
    if (!this.body) return;
    if (!this.paperEl) {
      this.paperEl = el('article', { className: `rb-paper ${TEMPLATE_CLASS[d.template]}` });
      const host = el('div', { className: 'rb-paper-host' });
      host.appendChild(this.paperEl);
      if (this.emptyEl) {
        this.emptyEl.replaceWith(host);
        this.emptyEl = null;
      } else {
        this.body.appendChild(host);
      }
    } else {
      this.paperEl.className = `rb-paper ${TEMPLATE_CLASS[d.template]}`;
    }
    clear(this.paperEl);
    this.paperEl.appendChild(this.buildHeader(d));
    this.paperEl.appendChild(this.buildContact(d));
    // 过滤：未启用 或 空内容 的段落不显示（侧栏模板对部分段落有特殊处理）
    const visible = (sec: SectionConfig): boolean => sec.enabled && !isSectionEmpty(sec, d);
    if (d.template === 'sidebar') {
      // 侧栏布局：教育 + 技能 放左栏，其他段落放右栏
      // 左栏"基础信息"标题沿用用户给 education 段设置的自定义标题，避免硬编码不一致
      const eduSec = sortedSections(d).find((s) => s.kind === 'education');
      const eduTitle = eduSec?.title || DEFAULT_SECTION_TITLE.education;
      const skillSec = sortedSections(d).find((s) => s.kind === 'skills');
      const skillTitle = skillSec?.title || DEFAULT_SECTION_TITLE.skills;

      const infoBlock = this.buildInfoBlock(d);
      const hasEdu = infoBlock.childElementCount > 0;
      const hasSkill = d.skills.split(/[,，]/).map((s) => s.trim()).filter(Boolean).length > 0;

      // 左栏有内容时才挂载（避免出现空标题的尴尬）
      if (hasEdu || hasSkill) {
        const left = el('div', { className: 'rb-rsec', attrs: { 'data-side': 'left' } });
        if (hasEdu) {
          left.appendChild(el('h3', { className: 'rb-rsec__title', text: eduTitle }));
          left.appendChild(infoBlock);
        }
        if (hasSkill) {
          this.appendSkillsIfAny(left, d.skills, skillTitle);
        }
        this.paperEl.appendChild(left);
      }

      const right = el('div', { className: 'rb-rsec', attrs: { 'data-side': 'right' } });
      right.style.paddingTop = hasEdu || hasSkill ? '24px' : '0';
      sortedSections(d).forEach((sec) => {
        if (!visible(sec)) return;
        if (sec.kind === 'education' || sec.kind === 'skills') return; // 已在左栏
        this.appendSectionByKind(right, sec, d);
      });
      this.paperEl.appendChild(right);
    } else {
      // minimal / compact：按 sections 顺序渲染（自动跳过空段）
      sortedSections(d).forEach((sec) => {
        if (!visible(sec)) return;
        this.appendSectionByKind(this.paperEl!, sec, d);
      });
    }
  }

  /** 按 section 类型渲染到 host */
  private appendSectionByKind(host: HTMLElement, sec: SectionConfig, d: ResumeData): void {
    switch (sec.kind) {
      case 'education':
        this.appendSectionIfAny(host, sec.title, this.buildEducation(d.education));
        break;
      case 'experience':
        this.appendSectionIfAny(host, sec.title, this.buildExperience(d.experience));
        break;
      case 'projects':
        this.appendSectionIfAny(host, sec.title, this.buildProjects(d.projects));
        break;
      case 'skills':
        this.appendSkillsIfAny(host, d.skills, sec.title);
        break;
      case 'awards':
        this.appendTextSection(host, sec.title, d.awards);
        break;
      case 'about':
        this.appendTextSection(host, sec.title, d.about);
        break;
      case 'custom': {
        const cs: CustomSection | undefined = d.customSections.find((c) => c.id === sec.dataId);
        if (!cs) return;
        if (cs.shape === 'list') {
          this.appendSectionIfAny(host, sec.title, this.buildCustomList(cs));
        } else {
          this.appendTextSection(host, sec.title, cs.content);
        }
        break;
      }
    }
  }

  private appendTextSection(host: HTMLElement, title: string, content: string): void {
    if (!content.trim()) return;
    const sec = el('section', { className: 'rb-rsec' });
    sec.appendChild(el('h3', { className: 'rb-rsec__title', text: title }));
    // 自定义段：多行按 bullet 输出
    const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length > 1) {
      const ul = el('ul', { className: 'rb-rlist' });
      lines.forEach((l) => ul.appendChild(el('li', { text: l })));
      sec.appendChild(ul);
    } else {
      sec.appendChild(el('div', { className: 'rb-ritem', text: content.trim() }));
    }
    host.appendChild(sec);
  }

  private buildHeader(d: ResumeData): HTMLElement {
    const head = el('header', { className: 'rb-phead' });
    head.setAttribute('data-date', formatDateYMD());
    head.appendChild(el('h2', { className: 'rb-rname', text: d.name || '未命名' }));
    if (d.title) head.appendChild(el('div', { className: 'rb-rtitle', text: d.title }));
    return head;
  }

  private buildContact(d: ResumeData): HTMLElement {
    const contact = el('div', { className: 'rb-rcontact' });
    CONTACT_ITEMS.forEach(([icon, getter]) => {
      const value = getter(d);
      if (!value) return;
      contact.appendChild(el('span', { className: 'rb-rcontact__item', text: `${icon} ${value}` }));
    });
    // 自定义基础信息：用户自由添加的字段（年龄 / 工作年限 / 期望薪资等）
    d.customBasics.forEach((b) => {
      const label = (b.label || '').trim();
      const value = (b.value || '').trim();
      if (!value) return; // 没有值就不显示
      // 兼容：value 里若已含 "label：" 前缀则不再重复拼接
      const text = label && !value.startsWith(label)
        ? `${label}：${value}`
        : value;
      contact.appendChild(el('span', { className: 'rb-rcontact__item', text }));
    });
    return contact;
  }

  /** 侧栏专用：把教育经历渲染为简洁块（仅在 sidebar 模板的左栏使用） */
  private buildInfoBlock(d: ResumeData): HTMLElement {
    const wrap = el('div', { className: 'rb-info-block' });
    d.education.forEach((e) => {
      if (!e.school && !e.degree && !e.range) return;
      const item = el('div', { className: 'rb-ritem' });
      item.appendChild(el('div', { className: 'rb-ritem__left', text: e.school || '' }));
      if (e.range) item.appendChild(el('div', { className: 'rb-ritem__sub', text: e.range }));
      if (e.degree) item.appendChild(el('div', { className: 'rb-ritem__sub', text: e.degree }));
      wrap.appendChild(item);
    });
    return wrap;
  }

  private appendSectionIfAny(host: HTMLElement, title: string, items: HTMLElement[]): void {
    if (items.length === 0) return;
    const sec = el('section', { className: 'rb-rsec' });
    sec.appendChild(el('h3', { className: 'rb-rsec__title', text: title }));
    items.forEach((it) => sec.appendChild(it));
    host.appendChild(sec);
  }

  private appendSkillsIfAny(host: HTMLElement, raw: string, title: string = '技能'): void {
    const list = raw.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) return;
    const sec = el('section', { className: 'rb-rsec' });
    sec.appendChild(el('h3', { className: 'rb-rsec__title', text: title }));
    const wrap = el('div', { className: 'rb-rskills' });
    list.forEach((s) => wrap.appendChild(el('span', { className: 'rb-rskill', text: s })));
    sec.appendChild(wrap);
    host.appendChild(sec);
  }

  private buildEducation(list: ResumeData['education']): HTMLElement[] {
    return list
      .filter((e) => e.school || e.degree || e.range)
      .map((e) => {
        const item = el('div', { className: 'rb-ritem' });
        const row1 = el('div', { className: 'rb-ritem__row1' });
        row1.append(
          el('span', { className: 'rb-ritem__left', text: e.school || '' }),
          el('span', { className: 'rb-ritem__right', text: e.range || '' })
        );
        item.appendChild(row1);
        if (e.degree) item.appendChild(el('div', { className: 'rb-ritem__sub', text: e.degree }));
        return item;
      });
  }

  private buildExperience(list: ResumeData['experience']): HTMLElement[] {
    return list
      .filter((e) => e.company || e.role || e.desc)
      .map((e) => {
        const item = el('div', { className: 'rb-ritem' });
        const row1 = el('div', { className: 'rb-ritem__row1' });
        const left = el('span', { className: 'rb-ritem__left' });
        const role = e.role || '';
        const comp = e.company ? ` · ${e.company}` : '';
        left.textContent = role + comp;
        row1.append(left, el('span', { className: 'rb-ritem__right', text: e.range || '' }));
        item.appendChild(row1);
        if (e.desc.trim()) {
          const ul = el('ul', { className: 'rb-rlist' });
          e.desc.split('\n').map((l) => l.trim()).filter(Boolean).forEach((l) => {
            ul.appendChild(el('li', { text: l }));
          });
          item.appendChild(ul);
        }
        return item;
      });
  }

  private buildProjects(list: ResumeData['projects']): HTMLElement[] {
    return list
      .filter((p) => p.name || p.tech || p.desc)
      .map((p) => {
        const item = el('div', { className: 'rb-ritem' });
        const row1 = el('div', { className: 'rb-ritem__row1' });
        row1.append(
          el('span', { className: 'rb-ritem__left', text: p.name || '' }),
          el('span', { className: 'rb-ritem__right', text: p.tech || '' })
        );
        item.appendChild(row1);
        if (p.desc.trim()) {
          const ul = el('ul', { className: 'rb-rlist' });
          p.desc.split('\n').map((l) => l.trim()).filter(Boolean).forEach((l) => {
            ul.appendChild(el('li', { text: l }));
          });
          item.appendChild(ul);
        }
        return item;
      });
  }

  /** 自定义段（list 形态）按条目渲染：与 project 视觉对齐，title 居左 */
  private buildCustomList(cs: CustomSection): HTMLElement[] {
    return cs.items
      .filter((it) => it.title.trim() || it.desc.trim())
      .map((it) => {
        const item = el('div', { className: 'rb-ritem' });
        const row1 = el('div', { className: 'rb-ritem__row1' });
        row1.append(
          el('span', { className: 'rb-ritem__left', text: it.title || '' }),
          el('span', { className: 'rb-ritem__right', text: '' })
        );
        item.appendChild(row1);
        if (it.desc.trim()) {
          const ul = el('ul', { className: 'rb-rlist' });
          it.desc.split('\n').map((l) => l.trim()).filter(Boolean).forEach((l) => {
            ul.appendChild(el('li', { text: l }));
          });
          item.appendChild(ul);
        }
        return item;
      });
  }
}
