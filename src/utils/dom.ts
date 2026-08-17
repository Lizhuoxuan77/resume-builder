/**
 * DOM 操作工具
 * 仅放通用、无业务依赖的 DOM 辅助函数
 */

/** 创建带类名的元素 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: {
    className?: string;
    attrs?: Record<string, string>;
    html?: string;
    text?: string;
    children?: (Node | string)[];
    disabled?: boolean;
  } = {}
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.attrs) {
    for (const [k, v] of Object.entries(options.attrs)) {
      node.setAttribute(k, v);
    }
  }
  if (options.html !== undefined) node.innerHTML = options.html;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.disabled !== undefined) {
    (node as HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).disabled = options.disabled;
  }
  if (options.children) {
    for (const c of options.children) {
      node.append(c instanceof Node ? c : document.createTextNode(c));
    }
  }
  return node;
}

/** 清空节点 */
export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** 事件代理 */
export function delegate<K extends keyof HTMLElementEventMap>(
  root: Element,
  selector: string,
  type: K,
  handler: (e: HTMLElementEventMap[K], target: Element) => void
): () => void {
  const listener = (e: Event): void => {
    const target = e.target as Element | null;
    if (!target) return;
    const matched = target.closest(selector);
    if (!matched || !root.contains(matched)) return;
    handler(e as HTMLElementEventMap[K], matched);
  };
  root.addEventListener(type, listener);
  return () => root.removeEventListener(type, listener);
}

/** 隐藏 / 显示 */
export function setVisible(node: HTMLElement, visible: boolean): void {
  node.style.display = visible ? '' : 'none';
}
