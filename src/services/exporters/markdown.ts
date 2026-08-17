/**
 * Markdown 导出
 * 纯文本：保证可读、可贴到任何支持 Markdown 的地方
 * 段落顺序与标题遵循 ResumeData.sections
 * 空段落自动跳过
 */

import type { ResumeData, SectionConfig, CustomSection } from '@/types/resume';
import { isSectionEmpty } from '@/types/resume';
import { sortedSections } from '@/models/ResumeData';

function section(title: string): string {
  return `\n## ${title}\n\n`;
}

function lines(text: string): string {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `- ${l}`)
    .join('\n');
}

function renderSection(sec: SectionConfig, d: ResumeData): string | null {
  if (!sec.enabled) return null;
  if (isSectionEmpty(sec, d)) return null;
  switch (sec.kind) {
    case 'education': {
      const out: string[] = [section(sec.title)];
      d.education.forEach((e) => {
        if (!e.school && !e.degree && !e.range) return;
        out.push(`**${e.school || ''}** ${e.range ? `· ${e.range}` : ''}  `);
        if (e.degree) out.push(`${e.degree}`);
      });
      return out.join('\n');
    }
    case 'experience': {
      const out: string[] = [section(sec.title)];
      d.experience.forEach((e) => {
        if (!e.company && !e.role && !e.desc) return;
        out.push(`### ${e.role || ''} · ${e.company || ''}  `);
        if (e.range) out.push(`*${e.range}*`);
        if (e.desc) out.push(lines(e.desc));
      });
      return out.join('\n');
    }
    case 'projects': {
      const out: string[] = [section(sec.title)];
      d.projects.forEach((p) => {
        if (!p.name && !p.tech && !p.desc) return;
        out.push(`### ${p.name || ''}  `);
        if (p.tech) out.push(`*${p.tech}*`);
        if (p.desc) out.push(lines(p.desc));
      });
      return out.join('\n');
    }
    case 'skills': {
      const list = d.skills.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
      return section(sec.title) + list.map((s) => `- ${s}`).join('\n');
    }
    case 'awards': {
      return section(sec.title) + lines(d.awards);
    }
    case 'about': {
      return section(sec.title) + d.about.trim();
    }
    case 'custom': {
      const cs: CustomSection | undefined = d.customSections.find((c) => c.id === sec.dataId);
      if (!cs) return null;
      if (cs.shape === 'list') {
        const items = cs.items.filter((it) => it.title.trim() || it.desc.trim());
        if (items.length === 0) return null;
        const out: string[] = [section(sec.title)];
        items.forEach((it) => {
          out.push(`### ${it.title || ''}`);
          if (it.desc) out.push(lines(it.desc));
        });
        return out.join('\n');
      }
      const content = (cs.content ?? '').trim();
      if (!content) return null;
      return section(sec.title) + lines(content);
    }
  }
}

export function renderMarkdown(d: ResumeData): string {
  const out: string[] = [];

  // 头部
  out.push(`# ${d.name || '未命名'}`);
  if (d.title) out.push(`*${d.title}*`);
  const contact: string[] = [];
  if (d.email) contact.push(`📧 ${d.email}`);
  if (d.phone) contact.push(`📱 ${d.phone}`);
  if (d.location) contact.push(`📍 ${d.location}`);
  if (d.website) contact.push(`🔗 ${d.website}`);
  // 自定义基础信息：用户自由添加的字段
  d.customBasics.forEach((b) => {
    const label = (b.label || '').trim();
    const value = (b.value || '').trim();
    if (!value) return;
    contact.push(label ? `${label}：${value}` : value);
  });
  if (contact.length) out.push(contact.join('  \n'));

  sortedSections(d).forEach((sec) => {
    const block = renderSection(sec, d);
    if (block) out.push(block);
  });

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
