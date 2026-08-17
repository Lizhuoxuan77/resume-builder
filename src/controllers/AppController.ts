/**
 * 应用主控制器
 * 单一职责：组装各 View / Service，编排数据流
 * - View 不持有数据；Controller 持有 ResumeData 单例
 * - 任何字段变更：Controller 更新数据 → 通知相关 View + 触发自动保存 + 触发校验
 * - 导出 / 模板切换 / 导入等横向动作由 Controller 统一协调
 */

import { bus } from '@/core/EventBus';
import { EVENTS, type EventName } from '@/types/events';
import type {
  ResumeData,
  FieldPath,
  ArrayFieldPath,
  TemplateId,
  ValidationError,
  ValidationResult,
  ExportFormat,
  SectionPreset,
  CustomShape
} from '@/types/resume';
import {
  setField,
  setArrayItemField,
  addArrayItem,
  removeArrayItem,
  ItemFactories,
  touchMeta,
  renameSection,
  toggleSection,
  moveSection,
  moveSectionTo,
  removeSection,
  addCustomSection,
  setCustomSectionContent,
  addCustomItem,
  setCustomItemField,
  removeCustomItem,
  addCustomBasic,
  removeCustomBasic,
  setCustomBasicLabel,
  setCustomBasicValue,
  moveCustomBasic
} from '@/models/ResumeData';
import { validateForExport } from '@/models/Validator';

import { StorageService } from '@/services/StorageService';
import { ValidationService } from '@/services/ValidationService';
import { KeyboardService } from '@/services/KeyboardService';
import { getStrategy, buildFilename } from '@/services/ExportService';
import { importDocxInto } from '@/services/importers';

import { EditorView } from '@/views/EditorView';
import { PreviewView } from '@/views/PreviewView';
import { TemplatePickerView } from '@/views/TemplatePickerView';
import { ExportDialogView } from '@/views/ExportDialogView';
import { ToastView } from '@/views/ToastView';
import { TopBarView, type TopBarState } from '@/views/TopBarView';
import { ValidationBarView } from '@/views/ValidationBarView';

import { el } from '@/utils/dom';
import { downloadText } from '@/utils';

export class AppController {
  private data: ResumeData;
  private readonly storage: StorageService;
  private readonly validation: ValidationService;
  private readonly keyboard: KeyboardService;

  private editor!: EditorView;
  private preview!: PreviewView;
  private templatePicker!: TemplatePickerView;
  private exportDialog!: ExportDialogView;
  private toast!: ToastView;
  private topBar!: TopBarView;
  private validationBar!: ValidationBarView;

  private root: HTMLElement;
  private baseCss: string;
  private templateCss: string;

  constructor(root: HTMLElement, baseCss: string, templateCss: string) {
    this.root = root;
    this.baseCss = baseCss;
    this.templateCss = templateCss;

    this.storage = new StorageService();
    this.validation = new ValidationService();
    this.keyboard = new KeyboardService();

    this.data = this.storage.load();
  }

  start(): void {
    this.layout();
    this.bindServices();
    this.keyboard.start();

    // 初次推送
    this.pushAll();
  }

  /* ---------------- Layout ---------------- */

  private layout(): void {
    this.root.innerHTML = '';
    this.root.classList.add('rb-app');

    // 顶部
    const topbar = el('header', { className: 'rb-topbar' });
    this.root.appendChild(topbar);
    this.topBar = new TopBarView({
      onSaveNow: () => this.handleSaveNow(),
      onExportJson: () => this.handleExportJson(),
      onImportJson: (file) => this.handleImportJson(file),
      onImportDocx: (file) => this.handleImportDocx(file),
      onClear: () => this.handleClear(),
      onOpenTemplate: () => this.openTemplatePicker(),
      onOpenExport: () => this.openExportDialog()
    });
    this.topBar.mount(topbar);

    // 校验条
    const vbar = el('div', { className: 'rb-validationbar-wrap' });
    this.root.appendChild(vbar);
    this.validationBar = new ValidationBarView();
    this.validationBar.mount(vbar);

    // 主工作区
    const main = el('main', { className: 'rb-main' });
    const editorPane = el('section', { className: 'rb-pane rb-pane--editor' });
    const previewPane = el('section', { className: 'rb-pane rb-pane--preview' });
    main.append(editorPane, previewPane);
    this.root.appendChild(main);

    this.editor = new EditorView({
      onField: (path, value) => this.handleFieldChange(path, value),
      onArrayField: (path, idx, key, value) => this.handleArrayFieldChange(path, idx, key, value),
      onAdd: (path) => this.handleAdd(path),
      onRemove: (path, idx) => this.handleRemove(path, idx),
      onCollapse: (_path, _collapsed) => { /* 视图内已维护状态 */ },
      onRenameSection: (id, title) => this.handleRenameSection(id, title),
      onToggleSection: (id, enabled) => this.handleToggleSection(id, enabled),
      onMoveSection: (id, dir) => this.handleMoveSection(id, dir),
      onMoveSectionTo: (id, targetIdx) => this.handleMoveSectionTo(id, targetIdx),
      onRemoveSection: (id) => this.handleRemoveSection(id),
      onAddSection: (input) => this.handleAddSection(input),
      onCustomSectionContent: (dataId, content) => this.handleCustomContent(dataId, content),
      onCustomItemField: (dataId, itemId, key, value) => this.handleCustomItemField(dataId, itemId, key, value),
      onCustomItemAdd: (dataId) => this.handleCustomItemAdd(dataId),
      onCustomItemRemove: (dataId, itemId) => this.handleCustomItemRemove(dataId, itemId),
      onAddCustomBasic: (label) => this.handleAddCustomBasic(label),
      onRemoveCustomBasic: (id) => this.handleRemoveCustomBasic(id),
      onCustomBasicLabel: (id, label) => this.handleCustomBasicLabel(id, label),
      onCustomBasicValue: (id, value) => this.handleCustomBasicValue(id, value),
      onMoveCustomBasic: (id, dir) => this.handleMoveCustomBasic(id, dir)
    });
    this.editor.mount(editorPane);

    this.preview = new PreviewView();
    this.preview.mount(previewPane);

    // 模态挂载点（每个 modal 独立挂载，避免互相 clear）
    const tplHost = el('div', { className: 'rb-modals rb-modals--tpl' });
    const expHost = el('div', { className: 'rb-modals rb-modals--exp' });
    this.root.append(tplHost, expHost);
    this.templatePicker = new TemplatePickerView({
      onPick: (id) => this.handlePickTemplate(id),
      onClose: () => this.closeTemplatePicker()
    });
    this.templatePicker.mount(tplHost);
    this.exportDialog = new ExportDialogView({
      onExport: (f) => this.handleExport(f),
      onClose: () => this.closeExportDialog()
    });
    this.exportDialog.mount(expHost);

    // Toast 挂载点
    const toastHost = el('div', { className: 'rb-toast-wrap' });
    this.root.appendChild(toastHost);
    this.toast = new ToastView();
    this.toast.mount(toastHost);
  }

  /* ---------------- Service Bindings ---------------- */

  private bindServices(): void {
    bus.on(EVENTS.TEMPLATE_PICKER_OPEN, () => this.openTemplatePicker());
    bus.on(EVENTS.TEMPLATE_PICKER_CLOSE, () => this.closeTemplatePicker());
    bus.on(EVENTS.EXPORT_OPEN, () => this.openExportDialog());
    bus.on(EVENTS.EXPORT_CLOSE, () => this.closeExportDialog());
    bus.on(EVENTS.AUTOSAVE_DONE, () => this.refreshTopBar());
    bus.on(EVENTS.STORAGE_DEGRADED, () => this.refreshTopBar());
    bus.on(EVENTS.STORAGE_OK, () => this.refreshTopBar());
    bus.on(EVENTS.VALIDATION_UPDATED, (result: ValidationResult) => this.validationBar.setState(result));
    bus.on('shortcut:save' as EventName, () => this.handleSaveNow());
    bus.on('shortcut:template:1' as EventName, () => this.handlePickTemplate('minimal'));
    bus.on('shortcut:template:2' as EventName, () => this.handlePickTemplate('sidebar'));
    bus.on('shortcut:template:3' as EventName, () => this.handlePickTemplate('compact'));
    bus.on('shortcut:escape' as EventName, () => this.handleEscape());
  }

  /* ---------------- Push state to views ---------------- */

  private pushAll(): void {
    this.editor.setState(this.data);
    this.preview.setState(this.data);
    this.templatePicker.setState({ current: this.data.template });
    this.validation.notify(this.data);
    this.refreshTopBar();
  }

  private refreshTopBar(): void {
    const status = this.storage.getStatus();
    const s: TopBarState = {
      savedText: this.storage.getLastSavedText(),
      sizeText: this.storage.getSizeText(),
      ratio: status.ratio,
      degraded: status.degraded
    };
    this.topBar.setState(s);
  }

  /* ---------------- Handlers: Editor ---------------- */

  private handleFieldChange(path: FieldPath, value: string): void {
    this.data = setField(this.data, path, value);
    this.afterDataChange();
  }

  private handleArrayFieldChange(
    path: ArrayFieldPath,
    index: number,
    key: string,
    value: string
  ): void {
    this.data = setArrayItemField(this.data, path, index, key, value);
    this.afterDataChange();
  }

  private handleAdd(path: ArrayFieldPath): void {
    const factory = ItemFactories[path];
    this.data = addArrayItem(this.data, path, factory);
    this.afterDataChange();
    this.pushAll();
  }

  private handleRemove(path: ArrayFieldPath, index: number): void {
    this.data = removeArrayItem(this.data, path, index);
    this.afterDataChange();
    this.pushAll();
    this.toast.show('已删除一条', 'info', 1500);
  }

  /* ---------------- Handlers: Sections ---------------- */

  private handleRenameSection(id: string, title: string): void {
    const t = title.trim();
    if (!t) return; // 空标题：忽略（保留原值）
    this.data = renameSection(this.data, id, t);
    this.afterDataChange();
  }

  private handleToggleSection(id: string, enabled?: boolean): void {
    this.data = toggleSection(this.data, id, enabled);
    // toggle 会改变 card 视觉态（badge / 虚线 / 删除线），需要 editor 重渲染
    this.afterDataChange();
    this.editor.setState(this.data);
  }

  private handleMoveSection(id: string, dir: 'up' | 'down'): void {
    this.data = moveSection(this.data, id, dir);
    this.afterDataChange();
    this.pushAll();
  }

  private handleMoveSectionTo(id: string, targetIdx: number): void {
    this.data = moveSectionTo(this.data, id, targetIdx);
    this.afterDataChange();
    this.pushAll();
  }

  private handleRemoveSection(id: string): void {
    this.data = removeSection(this.data, id);
    this.afterDataChange();
    this.pushAll();
    this.toast.show('已删除段落', 'info', 1500);
  }

  private handleAddSection(input: SectionPreset | { title: string; shape: CustomShape }): void {
    if ('key' in input) {
      // 预设：title/shape 直接用预设
      this.data = addCustomSection(this.data, {
        title: input.title,
        shape: input.shape,
        initialItems: input.shape === 'list' ? 1 : 0
      });
    } else {
      this.data = addCustomSection(this.data, {
        title: input.title,
        shape: input.shape,
        initialItems: input.shape === 'list' ? 1 : 0
      });
    }
    this.afterDataChange();
    this.pushAll();
  }

  private handleCustomContent(dataId: string, content: string): void {
    this.data = setCustomSectionContent(this.data, dataId, content);
    this.afterDataChange();
  }

  private handleCustomItemField(dataId: string, itemId: string, key: 'title' | 'desc', value: string): void {
    this.data = setCustomItemField(this.data, dataId, itemId, key, value);
    this.afterDataChange();
  }

  private handleCustomItemAdd(dataId: string): void {
    this.data = addCustomItem(this.data, dataId);
    this.afterDataChange();
    this.pushAll();
  }

  private handleCustomItemRemove(dataId: string, itemId: string): void {
    this.data = removeCustomItem(this.data, dataId, itemId);
    this.afterDataChange();
  }

  /* ---------------- Handlers: Custom Basics ---------------- */

  private handleAddCustomBasic(label: string): void {
    // label 由 EditorView 的内嵌 dialog 传入（避开 Electron 默认禁用 window.prompt 的坑）
    const t = (label ?? '').trim();
    if (!t) return;
    this.data = addCustomBasic(this.data, t);
    this.afterDataChange();
    this.pushAll();
    this.toast.show('已添加自定义字段', 'success', 1500);
  }

  private handleRemoveCustomBasic(id: string): void {
    // 确认逻辑放在 EditorView.showConfirm（避开 Electron 默认禁用 window.confirm 的坑）
    const f = this.data.customBasics.find((b) => b.id === id);
    if (!f) return;
    this.data = removeCustomBasic(this.data, id);
    this.afterDataChange();
  }

  private handleCustomBasicLabel(id: string, label: string): void {
    this.data = setCustomBasicLabel(this.data, id, label);
    this.afterDataChange();
  }

  private handleCustomBasicValue(id: string, value: string): void {
    this.data = setCustomBasicValue(this.data, id, value);
    this.afterDataChange();
  }

  private handleMoveCustomBasic(id: string, dir: 'up' | 'down'): void {
    this.data = moveCustomBasic(this.data, id, dir);
    this.afterDataChange();
  }

  /** 任意数据变更后的统一动作：通知 + 防抖保存 + 校验 */
  private afterDataChange(): void {
    this.preview.setState(this.data);
    this.validation.notify(this.data);
    this.storage.schedule(this.data);
  }

  /* ---------------- Handlers: TopBar ---------------- */

  private handleSaveNow(): void {
    const ok = this.storage.saveNow(this.data);
    if (ok) this.toast.show('已保存', 'success');
  }

  private handleExportJson(): void {
    const text = this.storage.exportJson(this.data);
    const name = (this.data.name || '未命名').replace(/[\\/:*?"<>|\s]+/g, '_');
    downloadText(text, `resume_${name}_backup.json`);
    this.toast.show('已导出 JSON 备份', 'success');
  }

  private async handleImportJson(file: File): Promise<void> {
    const text = await file.text();
    const next = this.storage.importJson(text);
    if (next) {
      this.data = next;
      this.pushAll();
      this.toast.show('已导入 JSON 备份', 'success');
    }
  }

  /**
   * 导入 docx 简历并合并到当前数据
   * - 提示用户将覆盖当前内容（带可跳过的二次确认）
   * - 解析过程异步进行，UI 提示加载状态
   * - 失败时回滚到原数据 + 错误提示
   */
  private async handleImportDocx(file: File): Promise<void> {
    // 当前已有非空数据时需要二次确认（避免误覆盖）
    const hasContent = Boolean(
      this.data.name.trim() ||
        this.data.email.trim() ||
        this.data.experience.length > 0 ||
        this.data.education.length > 0 ||
        this.data.projects.length > 0
    );
    if (hasContent) {
      const ok = window.confirm(
        `将解析「${file.name}」并合并到当前简历。\n\n注意：识别到的非空字段会覆盖当前内容，识别不到的内容会保留。建议先导出 JSON 备份。\n\n继续？`
      );
      if (!ok) return;
    }
    this.toast.show('正在解析简历…', 'info', 0);
    try {
      const { data, parsed } = await importDocxInto(this.data, file);
      this.data = data;
      // 立即落盘：避免后续操作冲突时丢失导入结果
      this.storage.saveNow(this.data);
      this.pushAll();
      this.toast.show(
        `已导入 DOCX（姓名 ${parsed.name ? '✓' : '✗'} · 邮箱 ${parsed.email ? '✓' : '✗'} · 教育 ${parsed.education?.length ?? 0} · 工作 ${parsed.experience?.length ?? 0}）`,
        'success',
        3500
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      this.toast.show(
        `DOCX 解析失败：${(err as Error).message ?? '未知错误'}`,
        'error',
        4000
      );
    }
  }

  private handleClear(): void {
    if (!window.confirm('确定清空全部数据？此操作不可撤销。')) return;
    this.data = this.storage.clear();
    this.pushAll();
  }

  /* ---------------- Handlers: Template Picker ---------------- */

  private openTemplatePicker(): void {
    this.root.classList.add('rb-modal-open', 'rb-modal-tpl');
  }

  private closeTemplatePicker(): void {
    this.root.classList.remove('rb-modal-open', 'rb-modal-tpl');
  }

  private handlePickTemplate(id: TemplateId): void {
    if (this.data.template === id) {
      this.closeTemplatePicker();
      return;
    }
    this.data = touchMeta({ ...this.data, template: id });
    this.afterDataChange();
    this.templatePicker.setState({ current: id });
    this.closeTemplatePicker();
    this.toast.show(`已切换到「${this.data.template}」`, 'success', 1500);
  }

  /* ---------------- Handlers: Export ---------------- */

  private openExportDialog(): void {
    this.root.classList.add('rb-modal-open', 'rb-modal-export');
  }

  private closeExportDialog(): void {
    this.root.classList.remove('rb-modal-open', 'rb-modal-export');
  }

  private async handleExport(format: ExportFormat): Promise<void> {
    // 阻塞性校验
    const v = validateForExport(this.data);
    if (!v.valid) {
      const first: ValidationError | undefined = v.errors[0];
      const field = first?.field;
      if (field === 'name' || field === 'email') {
        this.editor.focusField(field as string);
        this.toast.show('请先填写姓名和邮箱', 'error');
      } else {
        this.toast.show('请修复校验错误', 'error');
      }
      this.closeExportDialog();
      return;
    }

    this.exportDialog.setBusy(format, true);
    try {
      const strategy = getStrategy(format);
      await strategy.run({
        data: this.data,
        previewEl: this.preview.getPreviewElement() as HTMLElement,
        baseCss: this.baseCss,
        templateCss: this.templateCss
      });
      this.toast.show(`已导出 ${buildFilename(this.data, format)}`, 'success', 2400);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      this.toast.show(`${format} 导出失败：${(err as Error).message ?? '未知错误'}`, 'error', 3000);
    } finally {
      this.exportDialog.setBusy(null, false);
      this.closeExportDialog();
    }
  }

  /* ---------------- Handlers: Keyboard ---------------- */

  private handleEscape(): void {
    if (this.root.classList.contains('rb-modal-export')) this.closeExportDialog();
    else if (this.root.classList.contains('rb-modal-open')) this.closeTemplatePicker();
  }
}
