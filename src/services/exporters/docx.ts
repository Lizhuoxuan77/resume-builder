/**
 * Word (.docx) 导出
 * 使用 docx 库生成；保真度不追求 100% 像素一致，但保证字段完整可编辑
 * 段落顺序与标题遵循 ResumeData.sections
 * 空段落自动跳过
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle
} from 'docx';
import type { ResumeData, SectionConfig, CustomSection } from '@/types/resume';
import { isSectionEmpty } from '@/types/resume';
import { sortedSections } from '@/models/ResumeData';

function p(text: string, opts: { bold?: boolean; size?: number } = {}): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: opts.bold, size: opts.size ?? 22 })]
  });
}

function emptyP(): Paragraph {
  return new Paragraph({ children: [new TextRun('')] });
}

function line(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text })],
    border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: '111418' } }
  });
}

export async function buildDocxBlob(d: ResumeData): Promise<Blob> {
  const children: Paragraph[] = [];

  // Header
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.LEFT,
      children: [new TextRun({ text: d.name || '未命名', bold: true, size: 36 })]
    })
  );
  if (d.title) {
    children.push(p(d.title, { size: 22 }));
  }
  const contactParts: string[] = [
    d.email,
    d.phone,
    d.location,
    d.website
  ].filter(Boolean);
  // 自定义基础信息：用户自由添加的字段
  d.customBasics.forEach((b) => {
    const label = (b.label || '').trim();
    const value = (b.value || '').trim();
    if (!value) return;
    contactParts.push(label ? `${label}：${value}` : value);
  });
  const contact = contactParts.join('  ·  ');
  if (contact) children.push(p(contact, { size: 18 }));
  children.push(emptyP());

  sortedSections(d).forEach((sec) => {
    if (!sec.enabled) return;
    if (isSectionEmpty(sec, d)) return;
    appendDocxSection(children, sec, d);
  });

  const doc = new Document({ sections: [{ properties: {}, children }] });
  return Packer.toBlob(doc);
}

function appendDocxSection(children: Paragraph[], sec: SectionConfig, d: ResumeData): void {
  switch (sec.kind) {
    case 'education': {
      children.push(line(sec.title));
      d.education.forEach((e) => {
        if (!e.school && !e.degree && !e.range) return;
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: e.school || '', bold: true }),
              new TextRun({ text: e.range ? `   ${e.range}` : '' })
            ]
          })
        );
        if (e.degree) children.push(p(e.degree, { size: 20 }));
      });
      children.push(emptyP());
      break;
    }
    case 'experience': {
      children.push(line(sec.title));
      d.experience.forEach((e) => {
        if (!e.company && !e.role && !e.desc) return;
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: e.role || '', bold: true }),
              new TextRun({ text: e.role && e.company ? ' · ' : '' }),
              new TextRun({ text: e.company || '', bold: true }),
              new TextRun({ text: e.range ? `   ${e.range}` : '' })
            ]
          })
        );
        if (e.desc) {
          e.desc.split('\n').map((l) => l.trim()).filter(Boolean).forEach((l) => {
            children.push(new Paragraph({ children: [new TextRun({ text: l, size: 20 })], bullet: { level: 0 } }));
          });
        }
      });
      children.push(emptyP());
      break;
    }
    case 'projects': {
      children.push(line(sec.title));
      d.projects.forEach((it) => {
        if (!it.name && !it.tech && !it.desc) return;
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: it.name || '', bold: true }),
              new TextRun({ text: it.tech ? `   ${it.tech}` : '' })
            ]
          })
        );
        if (it.desc) {
          it.desc.split('\n').map((l) => l.trim()).filter(Boolean).forEach((l) => {
            children.push(new Paragraph({ children: [new TextRun({ text: l, size: 20 })], bullet: { level: 0 } }));
          });
        }
      });
      children.push(emptyP());
      break;
    }
    case 'skills': {
      children.push(line(sec.title));
      children.push(p(d.skills.trim(), { size: 20 }));
      children.push(emptyP());
      break;
    }
    case 'awards': {
      children.push(line(sec.title));
      children.push(p(d.awards.trim(), { size: 20 }));
      children.push(emptyP());
      break;
    }
    case 'about': {
      children.push(line(sec.title));
      children.push(p(d.about.trim(), { size: 20 }));
      children.push(emptyP());
      break;
    }
    case 'custom': {
      const cs: CustomSection | undefined = d.customSections.find((c) => c.id === sec.dataId);
      if (!cs) return;
      children.push(line(sec.title));
      if (cs.shape === 'list') {
        cs.items.forEach((it) => {
          if (!it.title.trim() && !it.desc.trim()) return;
          children.push(
            new Paragraph({
              children: [new TextRun({ text: it.title || '', bold: true })]
            })
          );
          if (it.desc) {
            it.desc.split('\n').map((l) => l.trim()).filter(Boolean).forEach((l) => {
              children.push(new Paragraph({ children: [new TextRun({ text: l, size: 20 })], bullet: { level: 0 } }));
            });
          }
        });
      } else {
        const content = (cs.content ?? '').trim();
        content.split('\n').map((l) => l.trim()).filter(Boolean).forEach((l) => {
          children.push(new Paragraph({ children: [new TextRun({ text: l, size: 20 })], bullet: { level: 0 } }));
        });
      }
      children.push(emptyP());
      break;
    }
  }
}
