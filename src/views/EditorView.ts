/**
 * 编辑器视图（左侧填写区）
 * 职责：渲染表单、收集输入、上报变更
 * 完全无状态：data 通过 props 由控制器注入；所有改动通过回调冒泡
 *
 * 段落交互：每个段落支持
 *  - 拖拽手柄重排
 *  - 标题直接编辑（常驻 input）
 *  - 显隐切换（dashed 边框 + "已隐藏" 角标，明显反馈）
 *  - 展开/收起
 *  - 自定义段：删除
 *  - 自定义段（list 形态）：多条目编辑
 */

import { el, delegate } from '@/utils/dom';
import type {
  ResumeData,
  FieldPath,
  ArrayFieldPath,
  EducationItem,
  ExperienceItem,
  ProjectItem,
  BasicField,
  SectionConfig,
  SectionKind,
  SectionPreset,
  CustomSection,
  CustomItem,
  CustomShape
} from '@/types/resume';
import { DEFAULT_SECTION_TITLE, SECTION_PRESETS, isSectionEmpty } from '@/types/resume';
import { View } from './View';
import { sortedSections } from '@/models/ResumeData';

/** 数组条目的可索引视图（编辑时只关心字符串字段） */
type ArrayItem = EducationItem | ExperienceItem | ProjectItem;

export interface EditorEvents {
  onField: (path: FieldPath, value: string) => void;
  onArrayField: (path: ArrayFieldPath, index: number, key: string, value: string) => void;
  onAdd: (path: ArrayFieldPath) => void;
  onRemove: (path: ArrayFieldPath, index: number) => void;
  onCollapse: (path: ArrayFieldPath, collapsed: boolean) => void;
  onRenameSection: (sectionId: string, title: string) => void;
  onToggleSection: (sectionId: string, enabled?: boolean) => void;
  onMoveSection: (sectionId: string, dir: 'up' | 'down') => void;
  onMoveSectionTo: (sectionId: string, targetIdx: number) => void;
  onRemoveSection: (sectionId: string) => void;
  onAddSection: (preset: SectionPreset | { title: string; shape: CustomShape }) => void;
  onCustomSectionContent: (dataId: string, content: string) => void;
  onCustomItemField: (dataId: string, itemId: string, key: 'title' | 'desc', value: string) => void;
  onCustomItemAdd: (dataId: string) => void;
  onCustomItemRemove: (dataId: string, itemId: string) => void;
  /** 自定义基础信息：新增/删除/编辑 label/编辑 value/上下移 */
  onAddCustomBasic: (label: string) => void;
  onRemoveCustomBasic: (id: string) => void;
  onCustomBasicLabel: (id: string, label: string) => void;
  onCustomBasicValue: (id: string, value: string) => void;
  onMoveCustomBasic: (id: string, dir: 'up' | 'down') => void;
}

const FIELD_LABELS: Record<FieldPath, { label: string; required?: boolean; placeholder?: string }> = {
  name: { label: '姓名', required: true, placeholder: '请输入姓名' },
  title: { label: '求职意向', placeholder: '如：前端开发工程师' },
  email: { label: '邮箱', required: true, placeholder: 'name@example.com' },
  phone: { label: '手机', placeholder: '11 位数字' },
  location: { label: '所在地', placeholder: '如：上海' },
  website: { label: '个人网站 / GitHub', placeholder: 'https://github.com/xxx' },
  skills: { label: '技能（用逗号分隔）', placeholder: 'JavaScript, TypeScript, React' },
  awards: { label: '内容', placeholder: '2024 全国大学生数学建模竞赛 一等奖' },
  about: { label: '内容', placeholder: '一段话介绍自己的优势与方向' }
};

const ITEM_LABELS = {
  education: { school: '学校', degree: '专业 / 学历', range: '时间区间' },
  experience: { company: '公司', role: '职位', range: '时间区间' },
  projects: { name: '项目名', tech: '技术栈' }
} as const;

const ADD_LABELS: Record<ArrayFieldPath, string> = {
  education: '+ 新增一段',
  experience: '+ 新增一段',
  projects: '+ 新增一个'
};

export class EditorView extends View<ResumeData> {
  private collapsed = new Set<string>();
  private errors: Map<string, string> = new Map();
  private events: EditorEvents;
  private paneTitle: HTMLElement | null = null;
  private body: HTMLElement | null = null;
  /** 段落选择弹层（用于新增段落） */
  private presetMenuOpen = false;

  constructor(events: EditorEvents) {
    super();
    this.events = events;
  }

  mount(root: HTMLElement): void {
    this.root = root;
    this.paneTitle = el('div', { className: 'rb-pane-title', text: '编辑区' });
    root.appendChild(this.paneTitle);
    this.body = el('div', { className: 'rb-editor' });
    root.appendChild(this.body);
    this.render();
  }

  onStateChange(data: ResumeData): void {
    if (!this.body) return;
    this.render(data);
  }

  setError(field: string, message: string | null): void {
    if (message) this.errors.set(field, message);
    else this.errors.delete(field);
    if (!this.body) return;
    const node = this.body.querySelector(`[data-field="${field}"]`);
    if (!node) return;
    node.classList.toggle('is-error', !!message);
    const tip = node.parentElement?.querySelector('.rb-error-tip') as HTMLElement | null;
    if (tip) tip.textContent = message ?? '';
  }

  /** 聚焦到指定字段（用于校验失败时回拉焦点） */
  focusField(field: string): void {
    const node = this.body?.querySelector(`[data-field="${field}"]`) as HTMLElement | null;
    node?.focus();
    node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  private render(data?: ResumeData): void {
    if (!this.body) return;
    const d = data ?? (this.state as ResumeData | null);
    if (!d) return;
    this.state = d;
    this.body.innerHTML = '';

    // 基础信息
    this.body.appendChild(this.renderBasics(d));

    // 段落（按 sections 顺序）
    const sorted = sortedSections(d);
    sorted.forEach((sec) => {
      this.body!.appendChild(this.renderSection(sec, d));
    });

    // "+ 新增段落" 按钮 + 预设弹层容器
    const addHost = el('div', { className: 'rb-add-section-host' });
    const addBtn = el('button', {
      className: 'rb-add-section',
      attrs: { 'data-add-section': '', type: 'button' },
      text: '+ 新增段落'
    });
    addHost.appendChild(addBtn);
    this.body.appendChild(addHost);

    /* ---------------- 事件代理 ---------------- */
    // input：基础字段 + 数组条目 + 自定义段 + 自定义基础信息
    this.track(
      delegate(this.body, '[data-field], [data-array], [data-custom], [data-custom-item], [data-cb-label], [data-cb-value]', 'input', (_e, target) => {
        const t = target as HTMLInputElement | HTMLTextAreaElement;
        const itemStr = t.dataset['customItem'];
        const customId = t.dataset['custom'];
        const cbLabelId = t.dataset['cbLabel'];
        const cbValueId = t.dataset['cbValue'];
        const raw = t.dataset['array'];
        if (itemStr) {
          const [dataId, itemId, key] = itemStr.split('|');
          this.events.onCustomItemField(dataId!, itemId!, key as 'title' | 'desc', t.value);
        } else if (customId) {
          this.events.onCustomSectionContent(customId, t.value);
        } else if (cbLabelId) {
          this.events.onCustomBasicLabel(cbLabelId, t.value);
        } else if (cbValueId) {
          this.events.onCustomBasicValue(cbValueId, t.value);
        } else if (raw) {
          const [path, indexStr, key] = raw.split('|');
          this.events.onArrayField(path as ArrayFieldPath, Number(indexStr), key, t.value);
        } else {
          const f = t.dataset['field'] as FieldPath;
          this.events.onField(f, t.value);
        }
        if (t.parentElement?.classList.contains('is-error')) {
          t.parentElement.classList.remove('is-error');
          const tip = t.parentElement.querySelector('.rb-error-tip');
          if (tip) tip.textContent = '';
        }
      })
    );

    // 数组新增
    this.track(
      delegate(this.body, '[data-add]', 'click', (_e, target) => {
        const path = (target as HTMLElement).dataset['add'] as ArrayFieldPath;
        this.events.onAdd(path);
      })
    );

    // 数组条目删除
    this.track(
      delegate(this.body, '[data-remove]', 'click', (_e, target) => {
        const t = target as HTMLElement;
        const [path, indexStr] = (t.dataset['remove'] ?? '').split('|');
        this.events.onRemove(path as ArrayFieldPath, Number(indexStr));
      })
    );

    // 段落折叠
    this.track(
      delegate(this.body, '[data-collapse]', 'click', (_e, target) => {
        const t = target as HTMLElement;
        const id = t.dataset['collapse']!;
        const isCollapsed = this.collapsed.has(id);
        if (isCollapsed) this.collapsed.delete(id);
        else this.collapsed.add(id);
        const body = this.body?.querySelector(`[data-section-body="${id}"]`);
        if (body) {
          (body as HTMLElement).style.display = isCollapsed ? '' : 'none';
        }
        t.textContent = isCollapsed ? '收起' : '展开';
      })
    );

    // 段落上移 / 下移
    this.track(
      delegate(this.body, '[data-section-move]', 'click', (_e, target) => {
        const t = target as HTMLElement;
        const id = t.dataset['sectionMove']!;
        const dir = t.dataset['dir'] as 'up' | 'down';
        this.events.onMoveSection(id, dir);
      })
    );

    // 段落显隐
    this.track(
      delegate(this.body, '[data-section-toggle]', 'click', (_e, target) => {
        const t = target as HTMLElement;
        const id = t.dataset['sectionToggle']!;
        this.events.onToggleSection(id);
      })
    );

    // 段落删除
    this.track(
      delegate(this.body, '[data-section-remove]', 'click', (_e, target) => {
        const t = target as HTMLElement;
        const id = t.dataset['sectionRemove']!;
        if (!window.confirm('确定删除该段落？')) return;
        this.events.onRemoveSection(id);
      })
    );

    // 段落标题编辑（常驻 input）
    this.track(
      delegate(this.body, '[data-section-title-input]', 'input', (_e, target) => {
        const t = target as HTMLInputElement;
        const id = t.dataset['sectionTitleInput']!;
        this.events.onRenameSection(id, t.value);
      })
    );

    // 自定义条目新增
    this.track(
      delegate(this.body, '[data-custom-item-add]', 'click', (_e, target) => {
        const t = target as HTMLElement;
        const dataId = t.dataset['customItemAdd']!;
        this.events.onCustomItemAdd(dataId);
      })
    );

    // 自定义条目删除
    this.track(
      delegate(this.body, '[data-custom-item-remove]', 'click', (_e, target) => {
        const t = target as HTMLElement;
        const [dataId, itemId] = (t.dataset['customItemRemove'] ?? '').split('|');
        this.events.onCustomItemRemove(dataId!, itemId!);
      })
    );

    // 新增段落按钮：切换预设弹层
    this.track(
      delegate(this.body, '[data-add-section]', 'click', (_e, _target) => {
        this.togglePresetMenu(addHost, d);
      })
    );

    // 添加自定义基础信息字段
    this.track(
      delegate(this.body, '[data-add-custom-basic]', 'click', () => {
        // Electron 默认禁用 window.prompt，会静默返回 null；改用内嵌 dialog
        this.showCustomBasicLabelDialog((label) => {
          if (label) this.events.onAddCustomBasic(label);
        });
      })
    );

    // 上下移自定义基础信息字段
    this.track(
      delegate(this.body, '[data-cb-move]', 'click', (_e, target) => {
        const t = target as HTMLElement;
        const id = t.dataset['cbMove']!;
        const dir = t.dataset['dir'] as 'up' | 'down';
        this.events.onMoveCustomBasic(id, dir);
      })
    );

    // 删除自定义基础信息字段
    this.track(
      delegate(this.body, '[data-cb-remove]', 'click', (_e, target) => {
        const t = target as HTMLElement;
        const id = t.dataset['cbRemove']!;
        // 找一下这个字段的 label，给 confirm 用
        const row = t.closest('.rb-custom-basic') as HTMLElement | null;
        const labelInput = row?.querySelector<HTMLInputElement>('.rb-custom-basic__label');
        const name = (labelInput?.value || '').trim() || '该字段';
        this.showConfirm(`确定删除自定义字段「${name}」？`, () => {
          this.events.onRemoveCustomBasic(id);
        });
      })
    );

    // 预设项点击
    this.track(
      delegate(this.body, '[data-preset-key]', 'click', (_e, target) => {
        const t = target as HTMLElement;
        const key = t.dataset['presetKey']!;
        if (key === '__custom__') {
          // 自定义输入
          this.openCustomTitleDialog(addHost, d);
          return;
        }
        const preset = SECTION_PRESETS.find((p) => p.key === key);
        if (preset) {
          this.events.onAddSection(preset);
          this.presetMenuOpen = false;
          this.render(d);
        }
      })
    );

    // 拖拽（HTML5 原生）
    this.bindDragAndDrop();

    // 点击其它区域关闭预设弹层
    if (this.presetMenuOpen) {
      // render 后若仍处于打开态，重建弹层
      this.renderPresetMenu(addHost, d);
    }
  }

  /** 切换/打开预设弹层 */
  private togglePresetMenu(host: HTMLElement, d: ResumeData): void {
    if (this.presetMenuOpen) {
      this.presetMenuOpen = false;
      this.render(d);
    } else {
      this.presetMenuOpen = true;
      this.renderPresetMenu(host, d);
    }
  }

  private renderPresetMenu(host: HTMLElement, _d: ResumeData): void {
    // 移除已有弹层
    const old = host.querySelector('.rb-preset-menu');
    if (old) old.remove();

    const menu = el('div', { className: 'rb-preset-menu', attrs: { 'data-preset-menu': '' } });
    const head = el('div', { className: 'rb-preset-menu__head', text: '选择段落类型' });
    menu.appendChild(head);

    const grid = el('div', { className: 'rb-preset-menu__grid' });
    SECTION_PRESETS.forEach((p) => {
      const card = el('button', {
        className: 'rb-preset-card',
        attrs: { 'data-preset-key': p.key, type: 'button' }
      });
      card.appendChild(el('div', { className: 'rb-preset-card__title', text: p.title }));
      card.appendChild(el('div', { className: 'rb-preset-card__hint', text: p.hint }));
      const tag = el('span', {
        className: `rb-preset-card__tag rb-preset-card__tag--${p.shape}`,
        text: p.shape === 'list' ? '多条' : '文本'
      });
      card.appendChild(tag);
      grid.appendChild(card);
    });
    // 自定义
    const custom = el('button', {
      className: 'rb-preset-card rb-preset-card--custom',
      attrs: { 'data-preset-key': '__custom__', type: 'button' }
    });
    custom.appendChild(el('div', { className: 'rb-preset-card__title', text: '自定义…' }));
    custom.appendChild(el('div', { className: 'rb-preset-card__hint', text: '自己起名字，选择文本或多条' }));
    grid.appendChild(custom);

    menu.appendChild(grid);
    host.appendChild(menu);
  }

  /** 弹出自定义标题输入（浏览器 prompt 即可，避免再造一个 modal） */
  private openCustomTitleDialog(_host: HTMLElement, d: ResumeData): void {
    const title = window.prompt('请输入段落标题', '自定义段落');
    if (title === null) return;
    const t = title.trim();
    if (!t) return;
    const shape: CustomShape = window.confirm('点击「确定」= 多条目（适合出版物/证书等）；「取消」= 单段文本（适合兴趣爱好等）')
      ? 'list'
      : 'text';
    this.events.onAddSection({ title: t, shape });
    this.presetMenuOpen = false;
    this.render(d);
  }

  /* ---------------- 拖拽 ---------------- */
  private dragSourceId: string | null = null;

  private bindDragAndDrop(): void {
    if (!this.body) return;
    const cards = Array.from(this.body.querySelectorAll<HTMLElement>('.rb-card--sec'));
    cards.forEach((card) => {
      card.setAttribute('draggable', 'true');
      card.addEventListener('dragstart', (e) => {
        const id = card.getAttribute('data-section');
        if (!id) return;
        this.dragSourceId = id;
        card.classList.add('is-dragging');
        e.dataTransfer?.setData('text/plain', id);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('is-dragging');
        cards.forEach((c) => c.classList.remove('is-drag-over', 'is-drag-over-bottom'));
        this.dragSourceId = null;
      });
      card.addEventListener('dragover', (e) => {
        if (!this.dragSourceId) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        const rect = card.getBoundingClientRect();
        const isUpperHalf = e.clientY < rect.top + rect.height / 2;
        cards.forEach((c) => c.classList.remove('is-drag-over', 'is-drag-over-bottom'));
        if (isUpperHalf) card.classList.add('is-drag-over');
        else card.classList.add('is-drag-over-bottom');
      });
      card.addEventListener('dragleave', () => {
        card.classList.remove('is-drag-over', 'is-drag-over-bottom');
      });
      card.addEventListener('drop', (e) => {
        e.preventDefault();
        const id = this.dragSourceId;
        if (!id) return;
        const targetId = card.getAttribute('data-section');
        if (!targetId || targetId === id) return;
        const sorted = sortedSections(this.state as ResumeData);
        const fromIdx = sorted.findIndex((s) => s.id === id);
        const toIdxRaw = sorted.findIndex((s) => s.id === targetId);
        if (fromIdx < 0 || toIdxRaw < 0) return;
        const rect = card.getBoundingClientRect();
        const isUpperHalf = e.clientY < rect.top + rect.height / 2;
        // 拖到目标的上半 = 插到目标前；下半 = 插到目标后
        let toIdx = isUpperHalf ? toIdxRaw : toIdxRaw + 1;
        // 若向下移动，需要 -1，因为原位置已被 splice 掉
        if (toIdx > fromIdx) toIdx -= 1;
        this.events.onMoveSectionTo(id, toIdx);
      });
    });
  }

  /* ---------------- 渲染：基础信息 ---------------- */
  private renderBasics(d: ResumeData): HTMLElement {
    const wrap = el('div', { className: 'rb-basics' });
    const rows: Array<[FieldPath, FieldPath?]> = [
      ['name', 'title'],
      ['email', 'phone'],
      ['location', 'website']
    ];
    rows.forEach(([a, b]) => {
      const row = el('div', { className: 'rb-row' });
      row.appendChild(this.renderField(d, a));
      if (b) row.appendChild(this.renderField(d, b));
      wrap.appendChild(row);
    });

    // 自定义基础信息：用户自由添加（年龄 / 工作年限 / 状态等）
    if (d.customBasics.length > 0) {
      const list = el('div', { className: 'rb-custom-basics' });
      d.customBasics.forEach((f, idx) => {
        list.appendChild(this.renderCustomBasicField(f, idx, d.customBasics.length));
      });
      wrap.appendChild(list);
    }

    // "+ 添加自定义字段" 按钮
    const addBtn = el('button', {
      className: 'rb-add-custom-basic',
      attrs: { 'data-add-custom-basic': '', type: 'button' },
      text: '+ 添加自定义字段（年龄 / 工作年限 …）'
    });
    wrap.appendChild(addBtn);

    return wrap;
  }

  private renderCustomBasicField(f: BasicField, idx: number, total: number): HTMLElement {
    const row = el('div', { className: 'rb-custom-basic', attrs: { 'data-custom-basic': f.id } });

    const labelInput = el('input', {
      className: 'rb-input rb-custom-basic__label',
      attrs: {
        type: 'text',
        'data-cb-label': f.id,
        value: f.label,
        maxlength: '12',
        placeholder: '标签（如：年龄）',
        'aria-label': '自定义字段标签'
      }
    }) as HTMLInputElement;

    const valueInput = el('input', {
      className: 'rb-input rb-custom-basic__value',
      attrs: {
        type: 'text',
        'data-cb-value': f.id,
        value: f.value,
        placeholder: '值（如：28）',
        'aria-label': '自定义字段值'
      }
    }) as HTMLInputElement;

    // 操作组：上下移 + 删除
    const actions = el('div', { className: 'rb-custom-basic__actions' });
    actions.appendChild(el('button', {
      className: 'rb-icon-btn',
      attrs: { 'data-cb-move': f.id, 'data-dir': 'up', type: 'button', title: '上移', 'aria-label': '上移' },
      text: '↑',
      disabled: idx === 0
    }));
    actions.appendChild(el('button', {
      className: 'rb-icon-btn',
      attrs: { 'data-cb-move': f.id, 'data-dir': 'down', type: 'button', title: '下移', 'aria-label': '下移' },
      text: '↓',
      disabled: idx === total - 1
    }));
    actions.appendChild(el('button', {
      className: 'rb-icon-btn rb-icon-btn--danger',
      attrs: { 'data-cb-remove': f.id, type: 'button', title: '删除', 'aria-label': '删除' },
      text: '×'
    }));

    row.append(labelInput, valueInput, actions);
    return row;
  }

  /**
   * 弹出一个内嵌的小对话框，让用户输入"自定义基础信息"字段的 label
   * 避免使用 window.prompt：在 Electron 渲染进程中 prompt 默认被禁用
   *   - 传 null 表示取消
   *   - 传 string 为 trim 后的输入（空串视为取消）
   */
  private showCustomBasicLabelDialog(onDone: (label: string | null) => void): void {
    if (!this.root) return onDone(null);
    // 卸载旧的
    const old = this.root.querySelector('.rb-cb-dialog');
    if (old) old.remove();

    const overlay = el('div', { className: 'rb-modal__overlay rb-cb-dialog', attrs: { 'data-cb-dialog': '' } });
    const modal = el('div', { className: 'rb-modal', attrs: { role: 'dialog', 'aria-label': '添加自定义字段' } });
    const head = el('div', { className: 'rb-modal__head' });
    head.append(
      el('h2', { className: 'rb-modal__title', text: '添加自定义基础信息' }),
      el('button', {
        className: 'rb-iconbtn',
        attrs: { 'data-cb-dialog-close': '', type: 'button', 'aria-label': '关闭' },
        text: '×'
      })
    );
    const body = el('div', { className: 'rb-modal__body' });
    body.appendChild(el('p', { className: 'rb-modal__hint', text: '请输入字段名（建议 2-8 个字），例如：年龄 / 工作年限 / 期望薪资 / 状态。' }));
    const input = el('input', {
      className: 'rb-input',
      attrs: {
        type: 'text',
        'data-cb-dialog-input': '',
        maxlength: '12',
        placeholder: '如：年龄',
        value: '自定义'
      }
    }) as HTMLInputElement;
    body.appendChild(input);

    const actions = el('div', { className: 'rb-modal__actions' });
    actions.append(
      el('button', {
        className: 'rb-btn rb-btn--ghost',
        attrs: { 'data-cb-dialog-cancel': '', type: 'button' },
        text: '取消'
      }),
      el('button', {
        className: 'rb-btn',
        attrs: { 'data-cb-dialog-ok': '', type: 'button' },
        text: '添加'
      })
    );
    body.appendChild(actions);

    modal.append(head, body);
    overlay.appendChild(modal);
    this.root.appendChild(overlay);

    // 自动 focus + 选中默认文字，方便用户直接覆盖
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });

    const cleanup = (): void => {
      overlay.remove();
      document.removeEventListener('keydown', onKey, true);
    };
    const confirm = (): void => {
      const v = input.value.trim();
      cleanup();
      onDone(v || null);
    };
    const cancel = (): void => {
      cleanup();
      onDone(null);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (!this.root?.contains(overlay)) {
        document.removeEventListener('keydown', onKey, true);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      } else if (e.key === 'Enter' && document.activeElement === input) {
        e.preventDefault();
        confirm();
      }
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cancel();
    });
    modal.querySelector('[data-cb-dialog-close]')?.addEventListener('click', cancel);
    modal.querySelector('[data-cb-dialog-cancel]')?.addEventListener('click', cancel);
    modal.querySelector('[data-cb-dialog-ok]')?.addEventListener('click', confirm);
    document.addEventListener('keydown', onKey, true);
  }

  /**
   * 通用确认弹窗（替代 window.confirm，在 Electron 中同样会被静默返回 false）
   * 用户点"确定"才执行 onConfirm；点取消 / 关闭 / Esc / 点遮罩 = 取消
   */
  private showConfirm(message: string, onConfirm: () => void): void {
    if (!this.root) return;
    const old = this.root.querySelector('.rb-confirm-dialog');
    if (old) old.remove();

    const overlay = el('div', { className: 'rb-modal__overlay rb-confirm-dialog', attrs: { 'data-confirm-dialog': '' } });
    const modal = el('div', { className: 'rb-modal rb-modal--sm', attrs: { role: 'alertdialog', 'aria-label': '确认操作' } });
    const head = el('div', { className: 'rb-modal__head' });
    head.append(
      el('h2', { className: 'rb-modal__title', text: '请确认' }),
      el('button', {
        className: 'rb-iconbtn',
        attrs: { 'data-confirm-close': '', type: 'button', 'aria-label': '关闭' },
        text: '×'
      })
    );
    const body = el('div', { className: 'rb-modal__body' });
    body.appendChild(el('p', { className: 'rb-modal__hint', text: message }));
    const actions = el('div', { className: 'rb-modal__actions' });
    actions.append(
      el('button', { className: 'rb-btn rb-btn--ghost', attrs: { 'data-confirm-cancel': '', type: 'button' }, text: '取消' }),
      el('button', { className: 'rb-btn rb-btn--danger', attrs: { 'data-confirm-ok': '', type: 'button' }, text: '确定' })
    );
    body.appendChild(actions);
    modal.append(head, body);
    overlay.appendChild(modal);
    this.root.appendChild(overlay);

    const cleanup = (): void => {
      overlay.remove();
      document.removeEventListener('keydown', onKey, true);
    };
    const ok = (): void => {
      cleanup();
      onConfirm();
    };
    const cancel = (): void => {
      cleanup();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (!this.root?.contains(overlay)) {
        document.removeEventListener('keydown', onKey, true);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        ok();
      }
    };

    overlay.addEventListener('click', (e) => { if (e.target === overlay) cancel(); });
    modal.querySelector('[data-confirm-close]')?.addEventListener('click', cancel);
    modal.querySelector('[data-confirm-cancel]')?.addEventListener('click', cancel);
    modal.querySelector('[data-confirm-ok]')?.addEventListener('click', ok);
    document.addEventListener('keydown', onKey, true);
  }

  private renderField(d: ResumeData, path: FieldPath): HTMLElement {
    const meta = FIELD_LABELS[path];
    const wrap = el('div', { className: 'rb-field' });
    const label = el('label', { className: 'rb-label' });
    label.append(document.createTextNode(meta.label));
    if (meta.required) {
      label.append(el('span', { className: 'rb-label__required', text: '*' }));
    }
    const value = (d[path] as string) ?? '';
    const input = path === 'about'
      ? el('textarea', { className: 'rb-input rb-textarea', attrs: { 'data-field': path, placeholder: meta.placeholder ?? '' } })
      : el('input', { className: 'rb-input', attrs: { type: 'text', 'data-field': path, placeholder: meta.placeholder ?? '' } });
    (input as HTMLInputElement | HTMLTextAreaElement).value = value;
    const tip = el('div', { className: 'rb-error-tip' });
    wrap.append(label, input, tip);
    return wrap;
  }

  /* ---------------- 渲染：段落 ---------------- */
  private renderSection(sec: SectionConfig, d: ResumeData): HTMLElement {
    const empty = isSectionEmpty(sec, d);
    const card = el('div', {
      className: `rb-card rb-card--sec${sec.enabled ? '' : ' is-disabled'}${empty ? ' is-empty' : ''}`,
      attrs: { 'data-section': sec.id }
    });

    const head = el('div', { className: 'rb-card__head' });

    // 拖拽手柄
    const handle = el('span', {
      className: 'rb-card__handle',
      attrs: { 'aria-label': '拖动排序', title: '拖动排序' },
      text: '⋮⋮'
    });
    head.appendChild(handle);

    // 标题（常驻可编辑）
    const fallbackTitle = sec.kind === 'custom'
      ? '自定义段落'
      : DEFAULT_SECTION_TITLE[sec.kind as Exclude<SectionKind, 'custom'>];
    const titleInput = el('input', {
      className: 'rb-card__title-input',
      attrs: {
        type: 'text',
        'data-section-title-input': sec.id,
        value: sec.title || fallbackTitle,
        maxlength: '24',
        'aria-label': '段落标题'
      }
    }) as HTMLInputElement;
    const titleWrap = el('div', { className: 'rb-card__title-wrap' });
    titleWrap.appendChild(titleInput);
    if (!sec.enabled) {
      titleWrap.appendChild(el('span', { className: 'rb-card__badge', text: '已隐藏' }));
    }
    if (empty && sec.enabled) {
      titleWrap.appendChild(el('span', { className: 'rb-card__hint', text: '暂无内容' }));
    }
    head.appendChild(titleWrap);

    // 操作按钮组
    const actions = el('div', { className: 'rb-card__actions' });
    // 上移
    actions.appendChild(
      el('button', {
        className: 'rb-btn-mini',
        attrs: { 'data-section-move': sec.id, 'data-dir': 'up', type: 'button', title: '上移', 'aria-label': '上移' },
        text: '↑'
      })
    );
    // 下移
    actions.appendChild(
      el('button', {
        className: 'rb-btn-mini',
        attrs: { 'data-section-move': sec.id, 'data-dir': 'down', type: 'button', title: '下移', 'aria-label': '下移' },
        text: '↓'
      })
    );
    // 显示/隐藏
    actions.appendChild(
      el('button', {
        className: `rb-btn-mini${sec.enabled ? ' is-on' : ''}`,
        attrs: { 'data-section-toggle': sec.id, type: 'button', title: sec.enabled ? '在预览中隐藏' : '在预览中显示', 'aria-label': sec.enabled ? '隐藏' : '显示' },
        text: sec.enabled ? '●' : '○'
      })
    );
    // 折叠
    actions.appendChild(
      el('button', {
        className: 'rb-btn-mini',
        attrs: { 'data-collapse': sec.id, type: 'button', title: '展开/收起', 'aria-label': '展开/收起' },
        text: this.collapsed.has(sec.id) ? '展开' : '收起'
      })
    );
    // 删除（仅 custom 段）
    if (sec.kind === 'custom') {
      actions.appendChild(
        el('button', {
          className: 'rb-btn-mini rb-btn-mini--danger',
          attrs: { 'data-section-remove': sec.id, type: 'button', title: '删除段落', 'aria-label': '删除段落' },
          text: '×'
        })
      );
    }
    head.appendChild(actions);
    card.appendChild(head);

    // 段落主体
    const body = el('div', {
      className: 'rb-card__body',
      attrs: { 'data-section-body': sec.id }
    });
    if (this.collapsed.has(sec.id)) (body as HTMLElement).style.display = 'none';
    if (!sec.enabled) (body as HTMLElement).style.display = 'none';

    if (sec.kind === 'education' || sec.kind === 'experience' || sec.kind === 'projects') {
      const path = sec.kind;
      const list = d[path];
      list.forEach((item, idx) => {
        body.appendChild(this.renderItem(path, idx, item));
      });
      body.appendChild(
        el('button', {
          className: 'rb-add',
          attrs: { 'data-add': path, type: 'button' },
          text: ADD_LABELS[path]
        })
      );
    } else if (sec.kind === 'skills') {
      body.appendChild(this.renderField(d, 'skills'));
    } else if (sec.kind === 'awards') {
      body.appendChild(this.renderField(d, 'awards'));
    } else if (sec.kind === 'about') {
      body.appendChild(this.renderField(d, 'about'));
    } else if (sec.kind === 'custom') {
      const cs: CustomSection | undefined = d.customSections.find((c) => c.id === sec.dataId);
      if (cs) {
        if (cs.shape === 'list') {
          body.appendChild(this.renderCustomList(cs, sec));
        } else {
          body.appendChild(this.renderCustomText(cs));
        }
      } else {
        body.appendChild(this.renderCustomText({ id: '', shape: 'text', content: '', items: [] }));
      }
    }
    card.appendChild(body);
    return card;
  }

  private renderCustomText(cs: CustomSection): HTMLElement {
    const wrap = el('div', { className: 'rb-field' });
    const ta = el('textarea', {
      className: 'rb-input rb-textarea',
      attrs: {
        'data-custom': cs.id,
        placeholder: '每行一条要点'
      }
    }) as HTMLTextAreaElement;
    ta.value = cs.content;
    wrap.appendChild(ta);
    return wrap;
  }

  private renderCustomList(cs: CustomSection, sec: SectionConfig): HTMLElement {
    const wrap = el('div', { className: 'rb-custom-list' });

    // 从 SECTION_PRESETS 推断占位（通过 title 匹配）
    const preset = SECTION_PRESETS.find((p) => p.title === sec.title);
    const tPH = preset?.itemTitlePH ?? '标题';
    const dPH = preset?.itemDescPH ?? '描述';

    cs.items.forEach((it) => {
      wrap.appendChild(this.renderCustomItem(cs.id, it, tPH, dPH));
    });

    wrap.appendChild(
      el('button', {
        className: 'rb-add',
        attrs: { 'data-custom-item-add': cs.id, type: 'button' },
        text: '+ 新增一个'
      })
    );
    return wrap;
  }

  private renderCustomItem(dataId: string, it: CustomItem, tPH: string, dPH: string): HTMLElement {
    const wrap = el('div', { className: 'rb-item rb-custom-item' });
    const titleInput = el('input', {
      className: 'rb-input',
      attrs: {
        type: 'text',
        'data-custom-item': `${dataId}|${it.id}|title`,
        placeholder: tPH
      }
    }) as HTMLInputElement;
    titleInput.value = it.title;
    const descInput = el('textarea', {
      className: 'rb-input rb-textarea',
      attrs: {
        'data-custom-item': `${dataId}|${it.id}|desc`,
        placeholder: dPH
      }
    }) as HTMLTextAreaElement;
    descInput.value = it.desc;
    wrap.append(titleInput, descInput);
    const removeBtn = el('button', {
      className: 'rb-remove',
      attrs: { 'data-custom-item-remove': `${dataId}|${it.id}`, type: 'button', title: '删除条目', 'aria-label': '删除条目' },
      text: '×'
    });
    wrap.appendChild(removeBtn);
    return wrap;
  }

  /* ---------------- 渲染：数组条目 ---------------- */
  private renderItem(path: ArrayFieldPath, idx: number, item: ArrayItem): HTMLElement {
    const wrap = el('div', { className: 'rb-item' });

    if (path === 'education') {
      wrap.appendChild(this.fieldRow([
        { key: 'school', placeholder: ITEM_LABELS.education.school },
        { key: 'degree', placeholder: ITEM_LABELS.education.degree }
      ], path, idx, item));
      wrap.appendChild(this.fieldRow([
        { key: 'range', placeholder: ITEM_LABELS.education.range, full: true }
      ], path, idx, item));
    } else if (path === 'experience') {
      wrap.appendChild(this.fieldRow([
        { key: 'company', placeholder: ITEM_LABELS.experience.company },
        { key: 'role', placeholder: ITEM_LABELS.experience.role }
      ], path, idx, item));
      wrap.appendChild(this.fieldRow([
        { key: 'range', placeholder: ITEM_LABELS.experience.range, full: true }
      ], path, idx, item));
      const ta = el('textarea', {
        className: 'rb-input rb-textarea',
        attrs: { 'data-array': `${path}|${idx}|desc`, placeholder: '每行一条要点，建议以动词开头' }
      }) as HTMLTextAreaElement;
      ta.value = (item as unknown as Record<string, string>)['desc'] ?? '';
      wrap.appendChild(ta);
    } else if (path === 'projects') {
      wrap.appendChild(this.fieldRow([
        { key: 'name', placeholder: ITEM_LABELS.projects.name },
        { key: 'tech', placeholder: ITEM_LABELS.projects.tech }
      ], path, idx, item));
      const ta = el('textarea', {
        className: 'rb-input rb-textarea',
        attrs: { 'data-array': `${path}|${idx}|desc`, placeholder: '项目介绍 / 个人贡献' }
      }) as HTMLTextAreaElement;
      ta.value = (item as unknown as Record<string, string>)['desc'] ?? '';
      wrap.appendChild(ta);
    }

    const removeBtn = el('button', {
      className: 'rb-remove',
      attrs: { 'data-remove': `${path}|${idx}`, type: 'button' },
      text: '×'
    });
    wrap.appendChild(removeBtn);
    return wrap;
  }

  private fieldRow(
    defs: Array<{ key: string; placeholder: string; full?: boolean }>,
    path: ArrayFieldPath,
    idx: number,
    item: ArrayItem
  ): HTMLElement {
    const row = el('div', { className: defs.length > 1 ? 'rb-row' : 'rb-row rb-row--full' });
    defs.forEach((d) => {
      const f = el('div', { className: 'rb-field' });
      const input = el('input', {
        className: 'rb-input',
        attrs: { type: 'text', 'data-array': `${path}|${idx}|${d.key}`, placeholder: d.placeholder }
      }) as HTMLInputElement;
      input.value = (item as unknown as Record<string, string>)[d.key] ?? '';
      f.appendChild(input);
      row.appendChild(f);
    });
    return row;
  }
}
