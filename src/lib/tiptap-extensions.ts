/**
 * No Visitors - Tiptap 扩展配置
 * 定义自定义块类型和主题相关的样式配置
 */

import { Node } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Blockquote from '@tiptap/extension-blockquote';
import Heading from '@tiptap/extension-heading';
import CodeBlock from '@tiptap/extension-code-block';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import Placeholder from '@tiptap/extension-placeholder';
import Paragraph from '@tiptap/extension-paragraph';
import TextAlign from '@tiptap/extension-text-align';

/**
 * Meta 块节点（元数据块）
 * 用于显示文档元信息，如日期、标签等
 */
const MetaExtension = Node.create({
  name: 'meta',

  group: 'block',

  content: 'inline*',

  parseHTML() {
    return [
      {
        tag: 'div[data-type="meta"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-type': 'meta', class: 'meta-block', ...HTMLAttributes }, 0];
  },

  addAttributes() {
    return {
      class: {
        default: 'meta-block',
      },
    };
  },
});

/**
 * 获取 Tiptap 扩展配置
 * @param themeId 当前主题 ID（用于动态样式）
 * @returns Tiptap 扩展数组
 */
export function getTiptapExtensions(themeId: string = 'arcane') {
  return [
    StarterKit.configure({
      // 禁用一些扩展，使用自定义配置
      heading: false, // 使用自定义 Heading 配置
      blockquote: false, // 使用自定义 Blockquote 配置
      codeBlock: false, // 使用自定义 CodeBlock 配置
      bulletList: false, // 使用自定义 BulletList 配置
      orderedList: false, // 使用自定义 OrderedList 配置
      paragraph: false, // 使用自定义 Paragraph 配置
    }),
    // 为 Paragraph 添加 UUID 支持
    Paragraph.extend({
      addAttributes() {
        return {
          ...this.parent?.(),
          uuid: {
            default: null,
            parseHTML: element => element.getAttribute('data-uuid'),
            renderHTML: attributes => {
              if (!attributes.uuid) {
                return {};
              }
              return {
                'data-uuid': attributes.uuid,
              };
            },
          },
          createdAt: {
            default: null,
            parseHTML: element => {
              const value = element.getAttribute('data-created-at');
              return value ? parseInt(value, 10) : null;
            },
            renderHTML: attributes => {
              if (!attributes.createdAt) {
                return {};
              }
              return {
                'data-created-at': attributes.createdAt.toString(),
              };
            },
          },
          updatedAt: {
            default: null,
            parseHTML: element => {
              const value = element.getAttribute('data-updated-at');
              return value ? parseInt(value, 10) : null;
            },
            renderHTML: attributes => {
              if (!attributes.updatedAt) {
                return {};
              }
              return {
                'data-updated-at': attributes.updatedAt.toString(),
              };
            },
          },
        };
      },
      // 添加键盘快捷键，防止删除最后一个段落
      addKeyboardShortcuts() {
        return {
          Backspace: () => {
            const { state } = this.editor;
            const { doc } = state;
            // 如果文档只有一个段落且为空，阻止删除
            if (doc.childCount === 1 && 
                doc.firstChild?.type.name === 'paragraph' && 
                doc.firstChild.content.size === 0) {
              return true; // 阻止删除
            }
            return false; // 允许默认行为
          },
          Delete: () => {
            const { state } = this.editor;
            const { doc } = state;
            // 如果文档只有一个段落且为空，阻止删除
            if (doc.childCount === 1 && 
                doc.firstChild?.type.name === 'paragraph' && 
                doc.firstChild.content.size === 0) {
              return true; // 阻止删除
            }
            return false; // 允许默认行为
          },
        };
      },
    }),
    Heading.configure({
      levels: [1, 2, 3],
      HTMLAttributes: {
        class: `heading-${themeId}`,
      },
      addAttributes() {
        return {
          ...this.parent?.(),
          uuid: {
            default: null,
            parseHTML: element => element.getAttribute('data-uuid'),
            renderHTML: attributes => {
              if (!attributes.uuid) {
                return {};
              }
              return {
                'data-uuid': attributes.uuid,
              };
            },
          },
          createdAt: {
            default: null,
            parseHTML: element => {
              const value = element.getAttribute('data-created-at');
              return value ? parseInt(value, 10) : null;
            },
            renderHTML: attributes => {
              if (!attributes.createdAt) {
                return {};
              }
              return {
                'data-created-at': attributes.createdAt.toString(),
              };
            },
          },
          updatedAt: {
            default: null,
            parseHTML: element => {
              const value = element.getAttribute('data-updated-at');
              return value ? parseInt(value, 10) : null;
            },
            renderHTML: attributes => {
              if (!attributes.updatedAt) {
                return {};
              }
              return {
                'data-updated-at': attributes.updatedAt.toString(),
              };
            },
          },
        };
      },
    }),
    Blockquote.configure({
      HTMLAttributes: {
        class: `blockquote-${themeId}`,
      },
      addAttributes() {
        return {
          ...this.parent?.(),
          uuid: {
            default: null,
            parseHTML: element => element.getAttribute('data-uuid'),
            renderHTML: attributes => {
              if (!attributes.uuid) {
                return {};
              }
              return {
                'data-uuid': attributes.uuid,
              };
            },
          },
          createdAt: {
            default: null,
            parseHTML: element => {
              const value = element.getAttribute('data-created-at');
              return value ? parseInt(value, 10) : null;
            },
            renderHTML: attributes => {
              if (!attributes.createdAt) {
                return {};
              }
              return {
                'data-created-at': attributes.createdAt.toString(),
              };
            },
          },
          updatedAt: {
            default: null,
            parseHTML: element => {
              const value = element.getAttribute('data-updated-at');
              return value ? parseInt(value, 10) : null;
            },
            renderHTML: attributes => {
              if (!attributes.updatedAt) {
                return {};
              }
              return {
                'data-updated-at': attributes.updatedAt.toString(),
              };
            },
          },
        };
      },
    }),
    CodeBlock.configure({
      HTMLAttributes: {
        class: `code-block-${themeId}`,
      },
      // 确保代码块可以编辑
      defaultLanguage: null,
      addAttributes() {
        return {
          ...this.parent?.(),
          uuid: {
            default: null,
            parseHTML: element => element.getAttribute('data-uuid'),
            renderHTML: attributes => {
              if (!attributes.uuid) {
                return {};
              }
              return {
                'data-uuid': attributes.uuid,
              };
            },
          },
          createdAt: {
            default: null,
            parseHTML: element => {
              const value = element.getAttribute('data-created-at');
              return value ? parseInt(value, 10) : null;
            },
            renderHTML: attributes => {
              if (!attributes.createdAt) {
                return {};
              }
              return {
                'data-created-at': attributes.createdAt.toString(),
              };
            },
          },
          updatedAt: {
            default: null,
            parseHTML: element => {
              const value = element.getAttribute('data-updated-at');
              return value ? parseInt(value, 10) : null;
            },
            renderHTML: attributes => {
              if (!attributes.updatedAt) {
                return {};
              }
              return {
                'data-updated-at': attributes.updatedAt.toString(),
              };
            },
          },
        };
      },
    }),
    BulletList.configure({
      HTMLAttributes: {
        class: `bullet-list-${themeId}`,
      },
    }),
    OrderedList.configure({
      HTMLAttributes: {
        class: `ordered-list-${themeId}`,
      },
    }),
    MetaExtension.extend({
      addAttributes() {
        return {
          ...this.parent?.(),
          uuid: {
            default: null,
            parseHTML: element => element.getAttribute('data-uuid'),
            renderHTML: attributes => {
              if (!attributes.uuid) {
                return {};
              }
              return {
                'data-uuid': attributes.uuid,
              };
            },
          },
          createdAt: {
            default: null,
            parseHTML: element => {
              const value = element.getAttribute('data-created-at');
              return value ? parseInt(value, 10) : null;
            },
            renderHTML: attributes => {
              if (!attributes.createdAt) {
                return {};
              }
              return {
                'data-created-at': attributes.createdAt.toString(),
              };
            },
          },
          updatedAt: {
            default: null,
            parseHTML: element => {
              const value = element.getAttribute('data-updated-at');
              return value ? parseInt(value, 10) : null;
            },
            renderHTML: attributes => {
              if (!attributes.updatedAt) {
                return {};
              }
              return {
                'data-updated-at': attributes.updatedAt.toString(),
              };
            },
          },
        };
      },
    }),
    // TextAlign 扩展 - 支持每个块独立对齐
    TextAlign.configure({
      types: ['heading', 'paragraph', 'blockquote'],
      defaultAlignment: 'left',
    }),
    Placeholder.configure({
      placeholder: '铭刻...',
      emptyEditorClass: 'is-editor-empty',
      emptyNodeClass: 'is-empty', // 为空节点添加类
      showOnlyWhenEditable: true, // 只在可编辑时显示
      showOnlyCurrent: false, // 显示所有空节点的占位符，确保空文档时占位符总是显示
    }),
  ];
}

