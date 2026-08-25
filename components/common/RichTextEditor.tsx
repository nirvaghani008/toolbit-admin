'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import { Mark, Extension, Node, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Youtube from '@tiptap/extension-youtube';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model';
import {
  Undo, Redo, List, ListOrdered, Quote,
  Code as CodeIcon, Bold, Italic, Strikethrough,
  Underline as UnderlineIcon,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  PlusCircle, Moon, Sun, Image as ImageIcon,
  Link2, ChevronDown, ListChecks, Heading1, Heading2, Heading3, Heading4,
  Type, Sparkles, Upload, X, Loader2, HardDrive
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { uploadImageFile } from '@/lib/image-upload';

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  showFormatButton?: boolean;
  name?: string;
}

declare module '@tiptap/core' {
  interface NodeConfig<Options = any, Storage = any> {
    tableRole?: string | ((this: { options: Options; storage: Storage }) => string);
  }
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (fontSize: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
    fontFamily: {
      setFontFamily: (fontFamily: string) => ReturnType;
      unsetFontFamily: () => ReturnType;
    };
  }
}

// 1. Custom TextStyle Mark for inline styling
const TextStyleMark = Mark.create({
  name: 'textStyle',
  priority: 101,
  parseHTML() {
    return [
      {
        tag: 'span',
        getAttrs: element => {
          const hasStyle = (element as HTMLElement).hasAttribute('style');
          return hasStyle ? {} : false;
        },
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },
});

// 2. Custom Font Size extension for Tiptap (applies inline to selected text)
const FontSizeExtension = Extension.create({
  name: 'fontSize',
  addOptions() {
    return {
      types: ['textStyle'],
    };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: element => element.style.fontSize?.replace(/['"]+/g, '') || null,
            renderHTML: attributes => {
              if (!attributes.fontSize) {
                return {};
              }
              return {
                style: `font-size: ${attributes.fontSize}`,
              };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize: (fontSize: string) => ({ chain }: any) => {
        return chain()
          .setMark('textStyle', { fontSize })
          .run();
      },
      unsetFontSize: () => ({ chain }: any) => {
        return chain()
          .setMark('textStyle', { fontSize: null })
          .run();
      },
    };
  },
});

// 3. Custom Font Family extension for Tiptap (applies font-family to selected text)
const FontFamilyExtension = Extension.create({
  name: 'fontFamily',
  addOptions() {
    return {
      types: ['textStyle'],
    };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontFamily: {
            default: null,
            parseHTML: element => element.style.fontFamily?.replace(/['"]+/g, '') || null,
            renderHTML: attributes => {
              if (!attributes.fontFamily) {
                return {};
              }
              return {
                style: `font-family: ${attributes.fontFamily}`,
              };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontFamily: (fontFamily: string) => ({ chain }: any) => {
        return chain()
          .setMark('textStyle', { fontFamily })
          .run();
      },
      unsetFontFamily: () => ({ chain }: any) => {
        return chain()
          .setMark('textStyle', { fontFamily: null })
          .run();
      },
    };
  },
});

// 4. Custom Table Extensions for TipTap schema
const TableExtension = Node.create({
  name: 'table',
  group: 'block',
  content: 'tableRow+',
  tableRole: 'table',
  isolating: true,
  parseHTML() {
    return [{ tag: 'table' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['table', mergeAttributes(HTMLAttributes, { class: 'tiptap-table' }), 0];
  },
});

const TableRowExtension = Node.create({
  name: 'tableRow',
  content: '(tableHeader | tableCell)+',
  tableRole: 'row',
  parseHTML() {
    return [{ tag: 'tr' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['tr', mergeAttributes(HTMLAttributes), 0];
  },
});

const TableHeaderExtension = Node.create({
  name: 'tableHeader',
  content: 'inline*',
  tableRole: 'header_cell',
  parseHTML() {
    return [
      { tag: 'th' },
      { tag: 'thead td' },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['th', mergeAttributes(HTMLAttributes), 0];
  },
});

const TableCellExtension = Node.create({
  name: 'tableCell',
  content: 'inline*',
  tableRole: 'cell',
  parseHTML() {
    return [{ tag: 'td' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['td', mergeAttributes(HTMLAttributes), 0];
  },
});

export const normalizeDOMTables = (doc: Document) => {
  const tables = Array.from(doc.querySelectorAll('table'));
  tables.forEach(table => {
    const rows = Array.from(table.querySelectorAll('tr'));
    if (rows.length < 1) return;

    const rowCellCounts = rows.map(r => r.querySelectorAll('th, td').length);
    const maxCols = Math.max(...rowCellCounts);

    const firstRowEls = Array.from(rows[0].querySelectorAll('th, td'));
    const firstRowTexts = firstRowEls.map(c => (c.textContent || '').trim());

    // Helper: find preceding non-empty label element climbing up parent wrappers if needed
    const findPrecedingLabel = (): { el: Element; text: string } | null => {
      let curr: Element | null = table;
      while (curr && curr !== doc.body) {
        let prev = curr.previousElementSibling;
        while (prev) {
          const text = (prev.textContent || '').trim();
          if (text) {
            const tag = prev.tagName.toUpperCase();
            if (tag === 'P' || tag === 'SPAN' || tag === 'DIV' || tag === 'STRONG' || /^H[1-6]$/.test(tag)) {
              if (text.length > 0 && text.length <= 80 && !text.includes('\n')) {
                return { el: prev, text };
              }
            }
            break;
          }
          prev = prev.previousElementSibling;
        }
        curr = curr.parentElement;
      }
      return null;
    };

    // CASE A: Row 0 has exactly 1 cell (e.g. <td>Adobe</td>)
    if (firstRowTexts.length === 1) {
      const label = findPrecedingLabel();
      if (label) {
        const newCell = doc.createElement(firstRowEls[0].tagName);
        newCell.textContent = label.text;
        rows[0].insertBefore(newCell, firstRowEls[0]);
        label.el.remove();
        return;
      }
      if (rows.length >= 2 && maxCols >= 2) {
        const secondRowFirstCell = rows[1].querySelector('th, td');
        if (firstRowEls[0] && secondRowFirstCell && firstRowTexts[0]) {
          const newCell = doc.createElement(secondRowFirstCell.tagName);
          newCell.textContent = firstRowTexts[0];
          rows[1].insertBefore(newCell, secondRowFirstCell);
          rows[0].remove();
        }
      }
      return;
    }

    // CASE B: Row 0 has 2+ cells, Cell 0 non-empty, Cell 1 empty (e.g. <td>Adobe</td><td></td>)
    if (firstRowTexts.length >= 2 && firstRowTexts[0] !== '' && (firstRowTexts[1] === '' || firstRowTexts[1] === '&nbsp;')) {
      const label = findPrecedingLabel();
      if (label) {
        firstRowEls[0].textContent = label.text;
        firstRowEls[1].textContent = firstRowTexts[0];
        label.el.remove();
        return;
      }
    }

    // CASE C: Row 0 already has all columns and cell 1 is non-empty → pass through
    if (maxCols >= 2 && rowCellCounts[0] === maxCols && firstRowTexts.length >= 2 && firstRowTexts[1] !== '') {
      return;
    }
  });
};

export const normalizeTableMatrix = (matrix: string[][]): string[][] => {
  if (matrix.length === 0) return matrix;

  const colCount = Math.max(...matrix.map(r => r.length));

  // If row 0 already has maxCols AND row 0 cell 1 is non-empty, the matrix is intact.
  if (colCount >= 2 && matrix[0].length === colCount && matrix[0].length >= 2 && matrix[0][1].trim() !== '' && matrix[0][1] !== '&nbsp;') {
    return matrix;
  }

  const result: string[][] = [];
  let i = 0;

  while (i < matrix.length) {
    const currentRow = matrix[i];
    const nextRow = matrix[i + 1];

    if (currentRow.length === 1 && nextRow && nextRow.length === 1) {
      result.push([currentRow[0], nextRow[0]]);
      i += 2;
      continue;
    }

    if (currentRow.length === 1 && nextRow && nextRow.length >= 2 && (nextRow[1] === '' || nextRow[1] === '&nbsp;')) {
      result.push([currentRow[0], nextRow[0]]);
      i += 2;
      continue;
    }

    if (currentRow.length >= 2 && (currentRow[1] === '' || currentRow[1] === '&nbsp;') && nextRow && nextRow.length >= 2) {
      // Row 0 has cell 1 empty, move cell 0 into cell 1 if previous result had single key or next row is key-val
      result.push(currentRow);
      i++;
      continue;
    }

    result.push(currentRow);
    i++;
  }

  return result;
};

export const convertHTMLToMarkdown = (html: string): string => {
  if (!html) return '';

  if (typeof window !== 'undefined' && window.DOMParser) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    normalizeDOMTables(doc);

    const processNode = (node: globalThis.Node): string => {
      if (node.nodeType === globalThis.Node.TEXT_NODE) {
        return node.textContent || '';
      }

      if (node.nodeType !== globalThis.Node.ELEMENT_NODE) {
        return '';
      }

      const element = node as HTMLElement;
      const tagName = element.tagName.toLowerCase();

      const childrenMarkdown = Array.from(element.childNodes)
        .map(child => processNode(child))
        .join('');

      switch (tagName) {
        case 'h1':
          return `\n\n# ${childrenMarkdown.trim()}\n\n`;
        case 'h2':
          return `\n\n## ${childrenMarkdown.trim()}\n\n`;
        case 'h3':
          return `\n\n### ${childrenMarkdown.trim()}\n\n`;
        case 'h4':
          return `\n\n#### ${childrenMarkdown.trim()}\n\n`;
        case 'h5':
          return `\n\n##### ${childrenMarkdown.trim()}\n\n`;
        case 'h6':
          return `\n\n###### ${childrenMarkdown.trim()}\n\n`;
        case 'p': {
          const isInsideLi = element.closest('li') !== null;
          if (isInsideLi) {
            return childrenMarkdown.trim() ? ` ${childrenMarkdown.trim()} ` : '';
          }
          return `\n\n${childrenMarkdown.trim()}\n\n`;
        }
        case 'strong':
        case 'b':
          return childrenMarkdown.trim() ? `**${childrenMarkdown.trim()}**` : '';
        case 'em':
        case 'i':
          return childrenMarkdown.trim() ? `*${childrenMarkdown.trim()}*` : '';
        case 's':
        case 'strike':
        case 'del':
          return childrenMarkdown.trim() ? `~~${childrenMarkdown.trim()}~~` : '';
        case 'u':
          return childrenMarkdown.trim() ? `<u>${childrenMarkdown.trim()}</u>` : '';
        case 'span': {
          const style = element.getAttribute('style') || '';
          let res = childrenMarkdown;
          if (style.includes('text-decoration: underline')) res = `<u>${res}</u>`;
          if (style.includes('text-decoration:line-through')) res = `~~${res}~~`;
          if (style.includes('font-weight: bold') || style.includes('font-weight: 700')) res = `**${res}**`;
          if (style.includes('font-style: italic')) res = `*${res}*`;
          return res;
        }
        case 'sub':
          return childrenMarkdown.trim() ? `~${childrenMarkdown.trim()}~` : '';
        case 'sup':
          return childrenMarkdown.trim() ? `^${childrenMarkdown.trim()}^` : '';
        case 'code':
          if (element.parentElement?.tagName.toLowerCase() === 'pre') {
            return childrenMarkdown;
          }
          return childrenMarkdown.trim() ? `\`${childrenMarkdown.trim()}\`` : '';
        case 'pre':
          return `\n\n\`\`\`\n${childrenMarkdown.trim()}\n\`\`\`\n\n`;
        case 'blockquote':
          const lines = childrenMarkdown.trim().split('\n');
          const bqLines = lines.map(line => `> ${line}`).join('\n');
          return `\n\n${bqLines}\n\n`;
        case 'a':
          const href = element.getAttribute('href') || '';
          return href ? `[${childrenMarkdown.trim()}](${href})` : childrenMarkdown;
        case 'img':
          const src = element.getAttribute('src') || '';
          const alt = element.getAttribute('alt') || 'Image';
          const title = element.getAttribute('title');
          return src ? `![${alt}](${src}${title ? ` "${title}"` : ''})` : '';
        case 'hr':
          return `\n\n---\n\n`;
        case 'br':
          return `\n`;
        case 'ul':
          const isTaskList = element.getAttribute('data-type') === 'taskList';
          const ulItems = Array.from(element.children)
            .filter(c => c.tagName.toLowerCase() === 'li')
            .map(li => {
              const liElem = li as HTMLElement;
              const isChecked = liElem.getAttribute('data-checked') === 'true';
              const text = processNode(liElem).replace(/\s+/g, ' ').trim();
              if (isTaskList) {
                return `- [${isChecked ? 'x' : ' '}] ${text}`;
              }
              return `- ${text}`;
            })
            .join('\n');
          return `\n\n${ulItems}\n\n`;
        case 'ol': {
          const olItems = Array.from(element.children)
            .filter(c => c.tagName.toLowerCase() === 'li')
            .map((li, idx) => {
              // Process li children separately: paragraphs become double-newline-separated blocks
              const liEl = li as HTMLElement;
              const paragraphs: string[] = [];
              let inlineText = '';
              Array.from(liEl.childNodes).forEach(child => {
                const cTag = (child as HTMLElement).tagName?.toLowerCase();
                if (cTag === 'p' || cTag === 'div') {
                  const pText = processNode(child).trim();
                  if (pText) paragraphs.push(pText);
                } else {
                  inlineText += processNode(child);
                }
              });
              if (paragraphs.length > 0) {
                return `${idx + 1}. ${paragraphs.join('\n\n')}`;
              }
              const text = inlineText.replace(/\s+/g, ' ').trim();
              return `${idx + 1}. ${text}`;
            })
            .join('\n\n');
          return `\n\n${olItems}\n\n`;
        }
        case 'li':
          return childrenMarkdown.replace(/\s+/g, ' ').trim();
        case 'table': {
          const rows = Array.from(element.querySelectorAll('tr'));
          if (rows.length === 0) return '';
          const matrix: string[][] = [];
          rows.forEach(row => {
            const cells = Array.from(row.querySelectorAll('th, td')).map(cell => {
              let inner = cell.innerHTML || cell.textContent || '';
              inner = inner
                .replace(/<br\s*\/?>/gi, ' ')
                .replace(/<\/p>\s*<p>/gi, ' ')
                .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
                .replace(/<b>(.*?)<\/b>/gi, '**$1**')
                .replace(/<em>(.*?)<\/em>/gi, '*$1*')
                .replace(/<i>(.*?)<\/i>/gi, '*$1*')
                .replace(/<s>(.*?)<\/s>/gi, '~~$1~~')
                .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
                .replace(/<a[^>]+href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
                .replace(/<[^>]+>/g, '')
                .replace(/\|/g, '\\|')
                .replace(/[\r\n]+/g, ' ')
                .trim();
              return inner;
            });
            if (cells.length > 0) matrix.push(cells);
          });
          if (matrix.length === 0) return '';
          const normalizedMatrix = normalizeTableMatrix(matrix);
          const colCount = Math.max(...normalizedMatrix.map(r => r.length));
          if (colCount === 0) return '';

          const header = normalizedMatrix[0];
          while (header.length < colCount) header.push('');
          const headerLine = `| ${header.join(' | ')} |`;
          const sepLine = `| ${header.map(() => '---').join(' | ')} |`;
          const bodyLines = normalizedMatrix.slice(1).map(r => {
            while (r.length < colCount) r.push('');
            return `| ${r.join(' | ')} |`;
          });
          return `\n\n${[headerLine, sepLine, ...bodyLines].join('\n')}\n\n`;
        }
        default:
          return childrenMarkdown;
      }
    };

    const markdown = Array.from(doc.body.childNodes)
      .map(node => processNode(node))
      .join('');

    return markdown
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  return html;
};

const formatMarkdownToHTML = (text: string) => {
  if (!text) return '';

  let formatted = convertHTMLToMarkdown(text).replace(/\r\n/g, '\n');
  formatted = formatted.replace(/^([\s]*[-*•+]\s*)\t+/gm, '$1 ');
  formatted = formatted.replace(/^([\s]*\d+[\.\)]\s*)\t+/gm, '$1 ');

  // Pre-clean broken \n fragments where a short title, word, or list item is separated from its continuation line
  const initialLines = formatted.split('\n');
  const cleanedLines: string[] = [];

  const isBlockBoundary = (str: string) => /^([#|]|[-*]\s+|\d+\.\s+|<[a-z]|[-*_]{3,}\s*$)/i.test(str.trim());

  for (let i = 0; i < initialLines.length; i++) {
    const line = initialLines[i].trim();
    if (!line) {
      if (cleanedLines.length > 0 && cleanedLines[cleanedLines.length - 1] !== '') {
        cleanedLines.push('');
      }
      continue;
    }

    if (cleanedLines.length > 0) {
      const prevIdx = cleanedLines.length - 1;
      const prevLine = cleanedLines[prevIdx];

      if (prevLine !== '') {
        const prevIsShort = prevLine.length < 70 && !/[.!?:]$/.test(prevLine);
        const currIsLower = /^[a-z]/.test(line);
        const currIsSymbol = /^[\u2190-\u21FF\u2100-\u214F\u2700-\u27BF\:\,\;\.\-\→\⇒]/.test(line);
        const prevIsListHeader = /^([-*]|\d+\.)\s+[^\n]+$/i.test(prevLine) && !/[.!?]$/.test(prevLine);
        const isBoundary = isBlockBoundary(line) || isBlockBoundary(prevLine);

        if (!isBoundary && (currIsLower || currIsSymbol || prevIsListHeader || (prevIsShort && !prevLine.startsWith('#')))) {
          cleanedLines[prevIdx] = `${prevLine} ${line}`;
          continue;
        }
      } else if (cleanedLines.length >= 2) {
        const prevContentLine = cleanedLines[cleanedLines.length - 2];
        const prevIsListHeader = /^([-*]|\d+\.)\s+[^\n]+$/i.test(prevContentLine) && !/[.!?]$/.test(prevContentLine);
        const prevIsShortWord = /^[A-Za-z0-9\s\u{1F300}-\u{1F9FF}-]{1,50}$/u.test(prevContentLine) && !/[.!?]$/.test(prevContentLine);
        const currIsLower = /^[a-z]/.test(line);
        const currIsSymbol = /^[\u2190-\u21FF\u2100-\u214F\u2700-\u27BF\:\,\;\.\-\→\⇒]/.test(line);
        const isBoundary = isBlockBoundary(line) || isBlockBoundary(prevContentLine);

        if (!isBoundary && (currIsLower || currIsSymbol || prevIsListHeader || prevIsShortWord)) {
          cleanedLines.pop();
          cleanedLines[cleanedLines.length - 1] = `${prevContentLine} ${line}`;
          continue;
        }
      }
    }

    cleanedLines.push(line);
  }

  formatted = cleanedLines.join('\n');

  // Auto-repair orphaned key lines (like "Developer\n\n| Adobe | |" or "<p>Developer</p>\n| Adobe |") back into table row 1
  formatted = formatted.replace(
    /(?:^|\n)(?:<p[^>]*>)?(?:<strong>|<b>)?([^\n|#-][^\n|]{0,60}?)(?:<\/strong>|<\/b>)?(?:<\/p>)?\s*\n+[^\S\r\n]*\|[^\S\r\n]*([^|\n]+?)[^\S\r\n]*\|[^\S\r\n]*(?:(?:&nbsp;|\s)*)?\|?[^\S\r\n]*(?=\n|$)/gi,
    (match, key, val) => {
      const trimmedKey = key.replace(/<[^>]+>/g, '').trim();
      const trimmedVal = val.replace(/<[^>]+>/g, '').trim();
      if (!trimmedKey || !trimmedVal || trimmedKey.startsWith('http')) return match;
      return `\n| ${trimmedKey} | ${trimmedVal} |`;
    }
  );

  // 1. Handle Plain Image URLs on their own line
  formatted = formatted.replace(/^(https?:\/\/[^\s\n]+\.(?:png|jpe?g|gif|webp|svg|bmp)(?:\?[^\s\n]*)?)$/gim, '<img src="$1" alt="Image">');

  // 2. Handle Code Blocks: ```code```
  formatted = formatted.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

  // 3. Handle Inline Code: `code`
  formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');

  // 4. Handle Images: ![alt](url)
  formatted = formatted.replace(/!\[(.*?)\]\((.*?)(?:\s+"(.*?)"|)\)/g, '<img src="$2" alt="$1" title="$3">');

  // 5. Handle Links: [text](url "title")
  formatted = formatted.replace(/\[(.*?)\]\((.*?)(?:\s+"(.*?)"|)\)/g, '<a href="$2" title="$3">$1</a>');

  // 6. Handle Headings (h1 to h6)
  formatted = formatted.replace(/^# (.*$)/gm, '<h1>$1</h1>');
  formatted = formatted.replace(/^## (.*$)/gm, '<h2>$1</h2>');
  formatted = formatted.replace(/^### (.*$)/gm, '<h3>$1</h3>');
  formatted = formatted.replace(/^#### (.*$)/gm, '<h4>$1</h4>');
  formatted = formatted.replace(/^##### (.*$)/gm, '<h5>$1</h5>');
  formatted = formatted.replace(/^###### (.*$)/gm, '<h6>$1</h6>');

  // 7. Handle Horizontal Rules
  formatted = formatted.replace(/^\s*[-*_]{3,}\s*$/gm, '<hr>');

  // 8. Handle Strikethrough
  formatted = formatted.replace(/~~(.*?)~~/g, '<s>$1</s>');

  // 9. Handle Superscript & Subscript
  formatted = formatted.replace(/\^([^^]+)\^/g, '<sup>$1</sup>');
  formatted = formatted.replace(/~([^~]+)~/g, '<sub>$1</sub>');

  // 10. Handle Bold & Italic
  formatted = formatted.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
  formatted = formatted.replace(/___(.*?)___/g, '<strong><em>$1</em></strong>');
  formatted = formatted.replace(/__(.*?)__/g, '<strong>$1</strong>');
  formatted = formatted.replace(/_(.*?)_/g, '<em>$1</em>');

  // 11. Handle Blockquotes
  formatted = formatted.replace(/(?:^> (.*$)\n?)+/gm, (match) => {
    const innerText = match.replace(/^> ?/gm, '').replace(/\n/g, '<br>');
    return `<blockquote>${innerText}</blockquote>`;
  });

  // 12. Handle Lists
  formatted = formatted.replace(/^[-*+] \[x\] (.*$)/gim, '<li data-type="taskItem" data-checked="true">$1</li>');
  formatted = formatted.replace(/^[-*+] \[ \] (.*$)/gim, '<li data-type="taskItem" data-checked="false">$1</li>');
  formatted = formatted.replace(/^[-*+] (.*$)/gm, '<li>$1</li>');
  formatted = formatted.replace(/^(\d+)\.\s+(.*$)/gm, '<li data-type="ol" value="$1">$2</li>');

  formatted = formatted.replace(/(?:<li data-type="taskItem"[^>]*>.*?<\/li>\s*)+/g, (match) => {
    return `<ul data-type="taskList">\n${match.trim()}\n</ul>\n`;
  });

  formatted = formatted.replace(/(?:<li>(?!.*data-type="ol")(?!.*data-type="taskItem").*<\/li>\s*)+/g, (match) => {
    return `<ul>\n${match.trim()}\n</ul>\n`;
  });

  formatted = formatted.replace(/(?:<li data-type="ol"[^>]*>.*?<\/li>\s*)+/g, (match) => {
    const cleanItems = match.replace(/ data-type="ol"/g, '');
    const firstValMatch = match.match(/value="(\d+)"/);
    const startAttr = firstValMatch ? ` start="${firstValMatch[1]}"` : '';
    return `<ol${startAttr}>\n${cleanItems.trim()}\n</ol>\n`;
  });

  // 13. Handle Tables
  const editorLines = formatted.split('\n');
  const edResultLines: string[] = [];
  let edTableBlock: string[] = [];

  const renderInlineMd = (text: string) =>
    text
      .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/~~(.*?)~~/g, '<s>$1</s>');

  const processEdTableBlock = (tLines: string[]) => {
    if (tLines.length === 0) return '';
    let headerRow = '';
    const bodyRows: string[] = [];

    let headerSet = false;
    tLines.forEach((l) => {
      if (/^[|\s-:]+$/.test(l.trim())) return;
      let parts = l.split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
      if (parts.length > 0 && parts[0] === '') parts.shift();
      if (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
      const cells = parts;
      if (cells.length === 0) return;

      if (!headerSet) {
        headerRow = `<tr>${cells.map(c => `<th>${renderInlineMd(c)}</th>`).join('')}</tr>`;
        headerSet = true;
      } else {
        bodyRows.push(`<tr>${cells.map(c => `<td>${renderInlineMd(c)}</td>`).join('')}</tr>`);
      }
    });

    const thead = headerRow ? `<thead>${headerRow}</thead>` : '';
    const tbody = bodyRows.length > 0 ? `<tbody>${bodyRows.join('')}</tbody>` : '';
    return `\n<table>${thead}${tbody}</table>\n`;
  };

  for (let i = 0; i < editorLines.length; i++) {
    const line = editorLines[i].trim();
    if (line.includes('|') && !/^\[[^\]]+\]\([^)]+\)$/.test(line)) {
      edTableBlock.push(line);
    } else {
      if (edTableBlock.length > 0) {
        edResultLines.push(processEdTableBlock(edTableBlock));
        edTableBlock = [];
      }
      edResultLines.push(editorLines[i]);
    }
  }
  if (edTableBlock.length > 0) {
    edResultLines.push(processEdTableBlock(edTableBlock));
  }

  formatted = edResultLines.join('\n');

  // Ensure tables are isolated top-level blocks with double line breaks so they never get wrapped in <p>
  formatted = formatted.replace(/(<table[^>]*>[\s\S]*?<\/table>)/gi, '\n\n$1\n\n');

  // 14. Clean escaping backslashes
  formatted = formatted.replace(/\\([*`#+\-~_!|\[\]()])/g, '$1');

  // 15. Handle Paragraphs
  const blocks = formatted.split(/\n\n+/);
  return blocks.map(block => {
    const trimmed = block.trim();
    if (!trimmed) return '';

    const blockTags = ['<h', '<ul', '<ol', '<li', '<blockquote', '<img', '<table', '<pre', '<hr'];
    if (blockTags.some(tag => trimmed.startsWith(tag))) return trimmed;

    const content = trimmed.replace(/\n/g, ' ');
    return `<p>${content}</p>`;
  }).join('\n');
};

const isMarkdownText = (text: string) => {
  if (!text) return false;
  if (text.trim().startsWith('<')) return false;

  const indicators = [
    /^(?:#+\s)/m,
    /^(?:\s*[-*+]\s)/m,
    /^(?:\s*\d+\.\s)/m,
    /^\s*[-*_]{3,}\s*$/m,
    /\*\*[^*]+\*\*/,
    /_[^_]+_/,
    /~~[^~]+~~/,
    /\^[^^]+\^/,
    /~[^~]+~/,
    /\[[^\]]+\]\([^)]+\)/,
    /^(?:https?:\/\/[^\s\n]+\.(?:png|jpe?g|gif|webp|svg|bmp)(?:\?[^\s\n]*)?)$/im,
    /(?:^|\n)\|.*\|/,
  ];

  return indicators.some(regex => regex.test(text));
};

const Dropdown = ({ label, icon: Icon, children, active }: { label?: string; icon?: any; children: React.ReactNode; active?: boolean }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as globalThis.Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`p-1.5 rounded-md transition-all flex items-center gap-1 min-w-[36px] justify-between ${active ? 'bg-indigo-500/10 text-indigo-500 font-bold' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
      >
        <div className="flex items-center gap-1 overflow-hidden">
          {Icon && <Icon size={14} className="shrink-0" />}
          {label && <span className="text-[11px] font-bold truncate max-w-[110px]">{label}</span>}
        </div>
        <ChevronDown size={10} className={`shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 min-w-[120px] max-w-[220px] bg-white dark:bg-[#161b22] border border-gray-200 dark:border-gray-800 rounded-xl shadow-xl z-50 p-1 animate-in fade-in zoom-in-95 duration-100 origin-top-left">
          <div onClick={() => setIsOpen(false)}>{children}</div>
        </div>
      )}
    </div>
  );
};

const MenuBar = ({
  editor,
  editorTheme,
  onToggleTheme,
  showFormatButton,
  onOpenImageModal
}: {
  editor: any;
  editorTheme: 'light' | 'dark';
  onToggleTheme: (t: 'light' | 'dark') => void;
  showFormatButton?: boolean;
  onOpenImageModal: () => void;
}) => {
  if (!editor) return null;

  const btnClass = (active: boolean) => `p-1.5 rounded-md transition-all flex items-center justify-center ${active ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100'}`;
  const itemClass = (active: boolean) => `w-full flex items-center gap-2 px-3 py-1.5 text-xs font-bold transition-colors rounded-lg ${active ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100' : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`;

  const activeTextStyle = editor.getAttributes('textStyle');

  const currentHeading = () => {
    if (editor.isActive('heading', { level: 1 })) return 'H1';
    if (editor.isActive('heading', { level: 2 })) return 'H2';
    if (editor.isActive('heading', { level: 3 })) return 'H3';
    if (editor.isActive('heading', { level: 4 })) return 'H4';
    return 'P';
  };

  const handleApplyHeading = (level: number | null) => {
    if (level) {
      editor.chain().focus().toggleHeading({ level: level as any }).run();
    } else {
      editor.chain().focus().setParagraph().run();
    }
  };

  const currentFontSize = () => {
    if (activeTextStyle?.fontSize) {
      return activeTextStyle.fontSize.replace('px', '');
    }
    return '16';
  };

  const currentFontFamilyLabel = () => {
    if (activeTextStyle?.fontFamily) {
      const family = activeTextStyle.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
      return family;
    }
    return 'Calibri (Body)';
  };

  const fontFamilies = [
    { label: 'Calibri (Body)', value: 'Calibri, sans-serif' },
    { label: 'Inter', value: 'Inter, sans-serif' },
    { label: 'Arial', value: 'Arial, sans-serif' },
    { label: 'Georgia', value: 'Georgia, serif' },
    { label: 'Times New Roman', value: 'Times New Roman, serif' },
    { label: 'Courier New', value: 'Courier New, monospace' },
    { label: 'Verdana', value: 'Verdana, sans-serif' },
    { label: 'Trebuchet MS', value: 'Trebuchet MS, sans-serif' },
    { label: 'Comic Sans MS', value: 'Comic Sans MS, cursive' },
  ];

  const fontSizes = ['8', '9', '10', '11', '12', '14', '16', '18', '20', '22', '24', '26', '28', '36', '48', '72'];

  return (
    <div className={`sticky top-0 z-30 flex flex-wrap items-center gap-0.5 p-2 rounded-t-xl border-b transition-colors duration-300 ${editorTheme === 'dark'
      ? 'bg-[#161b22]/95 border-gray-800 text-gray-200 backdrop-blur-md'
      : 'bg-[#f4f3ef]/95 border-[var(--border-color)] text-zinc-700 backdrop-blur-md'
      }`}>
      <button type="button" onClick={() => editor.chain().focus().undo().run()} className={btnClass(false)} title="Undo"><Undo size={15} /></button>
      <button type="button" onClick={() => editor.chain().focus().redo().run()} className={btnClass(false)} title="Redo"><Redo size={15} /></button>

      <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-1.5" />

      {/* Font Family Dropdown */}
      <Dropdown label={currentFontFamilyLabel()}>
        {fontFamilies.map((font) => (
          <button
            key={font.value}
            type="button"
            onClick={() => editor.chain().focus().setMark('textStyle', { fontFamily: font.value }).run()}
            className={itemClass(activeTextStyle?.fontFamily === font.value)}
            style={{ fontFamily: font.value }}
          >
            {font.label}
          </button>
        ))}
      </Dropdown>

      {/* Font Size Dropdown (Numerical List) */}
      <Dropdown label={currentFontSize()}>
        <div className="max-h-56 overflow-y-auto py-1">
          {fontSizes.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => editor.chain().focus().setMark('textStyle', { fontSize: `${size}px` }).run()}
              className={`w-full text-left px-3 py-1.5 text-xs font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center justify-between ${activeTextStyle?.fontSize === `${size}px` ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100' : 'text-zinc-700 dark:text-zinc-300'
                }`}
            >
              <span>{size}</span>
              {activeTextStyle?.fontSize === `${size}px` && <span className="text-[10px] text-zinc-900 dark:text-zinc-100">✓</span>}
            </button>
          ))}
        </div>
      </Dropdown>

      <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-1.5" />

      {/* Headings / Block Types */}
      <Dropdown label={currentHeading()} active={currentHeading() !== 'P'}>
        <button type="button" onClick={() => handleApplyHeading(null)} className={itemClass(currentHeading() === 'P')}><Type size={14} /> Paragraph</button>
        <button type="button" onClick={() => handleApplyHeading(1)} className={itemClass(currentHeading() === 'H1')}><Heading1 size={14} /> Heading 1</button>
        <button type="button" onClick={() => handleApplyHeading(2)} className={itemClass(currentHeading() === 'H2')}><Heading2 size={14} /> Heading 2</button>
        <button type="button" onClick={() => handleApplyHeading(3)} className={itemClass(currentHeading() === 'H3')}><Heading3 size={14} /> Heading 3</button>
        <button type="button" onClick={() => handleApplyHeading(4)} className={itemClass(currentHeading() === 'H4')}><Heading4 size={14} /> Heading 4</button>
      </Dropdown>

      <Dropdown icon={List} active={editor.isActive('bulletList') || editor.isActive('orderedList') || editor.isActive('taskList')}>
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={itemClass(editor.isActive('bulletList'))}><List size={14} /> Bullet List</button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={itemClass(editor.isActive('orderedList'))}><ListOrdered size={14} /> Ordered List</button>
        <button type="button" onClick={() => editor.chain().focus().toggleTaskList().run()} className={itemClass(editor.isActive('taskList'))}><ListChecks size={14} /> Task List</button>
      </Dropdown>

      <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={btnClass(editor.isActive('blockquote'))} title="Quote"><Quote size={15} /></button>

      <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-1.5" />

      <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btnClass(editor.isActive('bold'))} title="Bold"><Bold size={15} /></button>
      <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btnClass(editor.isActive('italic'))} title="Italic"><Italic size={15} /></button>
      <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} className={btnClass(editor.isActive('strike'))} title="Strikethrough"><Strikethrough size={15} /></button>
      <button type="button" onClick={() => editor.chain().focus().toggleCode().run()} className={btnClass(editor.isActive('code'))} title="Code"><CodeIcon size={15} /></button>
      <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className={btnClass(editor.isActive('underline'))} title="Underline"><UnderlineIcon size={15} /></button>

      <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-1.5" />

      <button type="button" onClick={() => editor.chain().focus().setTextAlign('left').run()} className={btnClass(editor.isActive({ textAlign: 'left' }))} title="Align Left"><AlignLeft size={15} /></button>
      <button type="button" onClick={() => editor.chain().focus().setTextAlign('center').run()} className={btnClass(editor.isActive({ textAlign: 'center' }))} title="Align Center"><AlignCenter size={15} /></button>
      <button type="button" onClick={() => editor.chain().focus().setTextAlign('right').run()} className={btnClass(editor.isActive({ textAlign: 'right' }))} title="Align Right"><AlignRight size={15} /></button>
      <button type="button" onClick={() => editor.chain().focus().setTextAlign('justify').run()} className={btnClass(editor.isActive({ textAlign: 'justify' }))} title="Align Justify"><AlignJustify size={15} /></button>

      <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-1.5" />

      <Dropdown label="Add" icon={PlusCircle}>
        <button type="button" onClick={onOpenImageModal} className={itemClass(false)}>
          <ImageIcon size={14} className="text-zinc-600 dark:text-zinc-300" /> Upload Image
        </button>
        <button type="button" onClick={() => {
          const previousUrl = editor.getAttributes('link').href;
          const url = window.prompt('URL', previousUrl);
          if (url) editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
        }} className={itemClass(false)}>
          <Link2 size={14} className="text-zinc-600 dark:text-zinc-300" /> Insert Link
        </button>
      </Dropdown>

      <div className="flex-1" />

      <button type="button" onClick={() => onToggleTheme(editorTheme === 'light' ? 'dark' : 'light')} className={btnClass(false)} title="Toggle Theme">
        {editorTheme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
      </button>

      {showFormatButton && (
        <>
          <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-1.5" />
          <button
            type="button"
            onClick={() => {
              const rawText = editor.getText();
              const formatted = formatMarkdownToHTML(rawText);
              editor.commands.setContent(formatted);
            }}
            className="p-1.5 rounded-md transition-all flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 shadow-xs cursor-pointer"
            title="AI Magic Format"
          >
            <Sparkles size={14} />
            <span className="text-[10px] font-black uppercase tracking-wider pr-1">Format</span>
          </button>
        </>
      )}
    </div>
  );
};

export default function RichTextEditor({ content, onChange, placeholder, showFormatButton = true, name }: RichTextEditorProps) {
  const { theme } = useTheme();
  const [editorTheme, setEditorTheme] = useState<'light' | 'dark'>(theme);
  const [hasToggledLocally, setHasToggledLocally] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Modal State for Image Upload / Browse
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [imageTab, setImageTab] = useState<'pc' | 'url'>('pc');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!hasToggledLocally) {
      setEditorTheme(theme);
    }
  }, [theme, hasToggledLocally]);

  const handleToggleTheme = (t: 'light' | 'dark') => {
    setEditorTheme(t);
    setHasToggledLocally(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setFilePreview(url);
    }
  };

  const handleModalClose = () => {
    setIsImageModalOpen(false);
    setSelectedFile(null);
    if (filePreview) URL.revokeObjectURL(filePreview);
    setFilePreview(null);
    setImageUrlInput('');
    setIsUploading(false);
  };

  const handleConfirmInsertImage = async () => {
    if (!editor) return;

    if (imageTab === 'pc') {
      if (!selectedFile) return;
      setIsUploading(true);
      try {
        const uploadedUrl = await uploadImageFile(selectedFile);
        editor.chain().focus().setImage({ src: uploadedUrl }).run();
        handleModalClose();
      } catch (err) {
        console.error('Failed uploading image from PC:', err);
        alert('Failed to insert image. Please try again.');
      } finally {
        setIsUploading(false);
      }
    } else {
      if (!imageUrlInput.trim()) return;
      editor.chain().focus().setImage({ src: imageUrlInput.trim() }).run();
      handleModalClose();
    }
  };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        link: false,
        underline: false,
      }),
      TextStyleMark,
      FontSizeExtension,
      FontFamilyExtension,
      TableExtension,
      TableRowExtension,
      TableHeaderExtension,
      TableCellExtension,
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          class: 'text-indigo-600 underline cursor-pointer',
        },
      }),
      Image.configure({
        allowBase64: false,
        HTMLAttributes: {
          class: 'max-w-full h-auto rounded-lg my-4 shadow-sm border border-gray-200 dark:border-gray-800',
        },
      }),
      Youtube.configure({ inline: false }),
      Superscript,
      Subscript,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: placeholder || 'Start writing...' }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: formatMarkdownToHTML(content || ''),
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const markdownContent = convertHTMLToMarkdown(html);
      onChange(markdownContent);
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none p-8 min-h-[400px] outline-none leading-relaxed transition-colors duration-300',
      },
      handlePaste(view, event) {
        const files = event.clipboardData?.files;
        if (files && files.length > 0) {
          const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
          if (imageFiles.length > 0) {
            event.preventDefault();
            imageFiles.forEach(async (file) => {
              try {
                const url = await uploadImageFile(file);
                const { schema, tr } = view.state;
                const imageNode = schema.nodes.image.create({ src: url });
                const transaction = tr.replaceSelectionWith(imageNode);
                view.dispatch(transaction);
              } catch (e) {
                console.error('Error handling pasted image:', e);
              }
            });
            return true;
          }
        }

        const text = event.clipboardData?.getData('text/plain');
        const html = event.clipboardData?.getData('text/html');

        // PRIORITY 1: HTML with <table> tags (e.g. copied from Word, Web, Excel, Docs)
        if (html && (html.includes('<table') || html.includes('<TABLE'))) {
          try {
            event.preventDefault();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            normalizeDOMTables(doc);

            const bodyHTML = doc.body.innerHTML;
            const markdown = convertHTMLToMarkdown(bodyHTML);
            const tableHtml = formatMarkdownToHTML(markdown);

            const div = document.createElement('div');
            div.innerHTML = tableHtml;
            const { schema, tr } = view.state;
            const slice = ProseMirrorDOMParser.fromSchema(schema).parseSlice(div);
            const transaction = tr.replaceSelection(slice);
            view.dispatch(transaction);
            return true;
          } catch (e) {
            console.error('Error pasting HTML table:', e);
          }
        }

        // PRIORITY 2: Tab-separated plain text (strictly requires true TSV table data)
        const isBulletListWithTabs = /^[\s]*[-*•+]\s*\t|^[\s]*\d+[\.\)]\s*\t/m.test(text || '');
        if (text && text.includes('\t') && text.includes('\n') && !isBulletListWithTabs) {
          const lines = text.trim().split('\n').map(l => l.trim()).filter(l => l !== '');
          const tsvRows = lines.filter(l => l.includes('\t') && !/^[-*•+]\s*/.test(l));

          if (lines.length >= 2 && tsvRows.length >= 2) {
            const rawMatrix = lines.map(line => line.split('\t').map(c => c.trim()));
            const normalizedMatrix = normalizeTableMatrix(rawMatrix);
            const maxCols = Math.max(...normalizedMatrix.map(r => r.length));

            if (maxCols >= 2 && normalizedMatrix.length >= 1) {
              try {
                event.preventDefault();
                const rowsHtml = normalizedMatrix.map((row) => {
                  while (row.length < maxCols) row.push('&nbsp;');
                  return `<tr>${row.map((c, idx) => `<td>${idx === 0 ? `<strong>${c || '&nbsp;'}</strong>` : (c || '&nbsp;')}</td>`).join('')}</tr>`;
                }).join('');
                const tableHtml = `<table><tbody>${rowsHtml}</tbody></table>`;
                const div = document.createElement('div');
                div.innerHTML = tableHtml;
                const { schema, tr } = view.state;
                const slice = ProseMirrorDOMParser.fromSchema(schema).parseSlice(div);
                const transaction = tr.replaceSelection(slice);
                view.dispatch(transaction);
                return true;
              } catch (e) {
                console.error('Error pasting tabbed table:', e);
              }
            }
          }
        }

        // PRIORITY 3: Markdown pipe-table text
        if (text && text.includes('|') && /(?:^|\n)\|.*\|/.test(text)) {
          try {
            event.preventDefault();
            const tableHtml = formatMarkdownToHTML(text);
            const div = document.createElement('div');
            div.innerHTML = tableHtml;
            const { schema, tr } = view.state;
            const slice = ProseMirrorDOMParser.fromSchema(schema).parseSlice(div);
            const transaction = tr.replaceSelection(slice);
            view.dispatch(transaction);
            return true;
          } catch (e) {
            console.error('Error pasting Markdown table:', e);
          }
        }

        if (text && !html) {
          try {
            const urlString = text.trim();
            const parsedUrl = new URL(urlString);
            const isImage = /\.(png|jpe?g|gif|webp|svg|bmp)(?:\?.*)?$/i.test(parsedUrl.pathname);

            if (isImage) {
              const { schema, tr } = view.state;
              const imageNode = schema.nodes.image.create({ src: urlString });
              const transaction = tr.replaceSelectionWith(imageNode);
              view.dispatch(transaction);
              return true;
            }
          } catch { }

          if (isMarkdownText(text)) {
            const htmlContent = formatMarkdownToHTML(text);
            const element = window.document.createElement('div');
            element.innerHTML = htmlContent;

            const { schema, tr } = view.state;
            const slice = ProseMirrorDOMParser.fromSchema(schema).parseSlice(element);
            const transaction = tr.replaceSelection(slice);
            view.dispatch(transaction);
            return true;
          }
        }
        return false;
      },
      handleDrop(view, event) {
        const files = event.dataTransfer?.files;
        if (files && files.length > 0) {
          const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
          if (imageFiles.length > 0) {
            event.preventDefault();
            const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
            const pos = coordinates ? coordinates.pos : view.state.selection.from;
            imageFiles.forEach(async (file) => {
              try {
                const url = await uploadImageFile(file);
                const { schema, tr } = view.state;
                const imageNode = schema.nodes.image.create({ src: url });
                const transaction = tr.insert(pos, imageNode);
                view.dispatch(transaction);
              } catch (e) {
                console.error('Error handling dropped image:', e);
              }
            });
            return true;
          }
        }

        const text = event.dataTransfer?.getData('text/plain');
        if (text) {
          try {
            const urlString = text.trim();
            const parsedUrl = new URL(urlString);
            const isImage = /\.(png|jpe?g|gif|webp|svg|bmp)(?:\?.*)?$/i.test(parsedUrl.pathname);

            if (isImage) {
              const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
              if (coordinates) {
                const { schema, tr } = view.state;
                const imageNode = schema.nodes.image.create({ src: urlString });
                const transaction = tr.insert(coordinates.pos, imageNode);
                view.dispatch(transaction);
                return true;
              }
            }
          } catch { }
        }
        return false;
      },
    },
  });

  useEffect(() => {
    if (editor && content !== undefined && !editor.isFocused) {
      const currentMarkdown = convertHTMLToMarkdown(editor.getHTML());
      if (currentMarkdown.trim() !== (content || '').trim()) {
        const formatted = formatMarkdownToHTML(content || '');
        editor.commands.setContent(formatted);
      }
    }
  }, [content, editor]);

  return (
    <div id={name} data-field={name} className={`border rounded-xl shadow-2xs transition-colors duration-300 relative flex flex-col max-h-[680px] overflow-hidden ${editorTheme === 'dark'
      ? 'dark bg-[#0d1117] text-gray-100 border-gray-800'
      : 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-color)]'
      }`}>
      <MenuBar
        editor={editor}
        editorTheme={editorTheme}
        onToggleTheme={handleToggleTheme}
        showFormatButton={showFormatButton}
        onOpenImageModal={() => setIsImageModalOpen(true)}
      />
      <div className="overflow-y-auto flex-1 rounded-b-xl max-h-[600px]">
        <EditorContent editor={editor} className={`${editorTheme === 'dark' ? 'bg-[#0d1117] text-gray-100' : 'bg-white text-gray-900'}`} />
      </div>

      {/* Insert Image Modal rendered via React Portal to document.body */}
      {isImageModalOpen && isMounted && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white dark:bg-[#161b22] border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl overflow-hidden text-left animate-in zoom-in-95 duration-200 relative z-[100000]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-zinc-700 dark:text-zinc-300" />
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Insert Image</h3>
              </div>
              <button
                type="button"
                onClick={handleModalClose}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-6 space-y-5">
              {/* Tab Selector */}
              <div className="flex p-1 bg-gray-100 dark:bg-gray-900 rounded-xl">
                <button
                  type="button"
                  onClick={() => setImageTab('pc')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${imageTab === 'pc'
                    ? 'bg-white dark:bg-[#161b22] text-zinc-900 dark:text-zinc-100 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-200'
                    }`}
                >
                  <HardDrive size={14} /> Browse from PC
                </button>
                <button
                  type="button"
                  onClick={() => setImageTab('url')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${imageTab === 'url'
                    ? 'bg-white dark:bg-[#161b22] text-zinc-900 dark:text-zinc-100 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-200'
                    }`}
                >
                  <Link2 size={14} /> Image URL
                </button>
              </div>

              {/* Tab 1: Browse from PC */}
              {imageTab === 'pc' && (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />

                  {filePreview ? (
                    <div className="relative group border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-4">
                      <img src={filePreview} alt="Preview" className="max-h-48 rounded-lg object-contain mb-3" />
                      <p className="text-xs font-medium text-gray-600 dark:text-gray-400 truncate max-w-xs">{selectedFile?.name}</p>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="mt-2 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:underline cursor-pointer"
                      >
                        Change Image
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-zinc-500 dark:hover:border-zinc-500 rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all bg-zinc-50/50 dark:bg-zinc-900/50 hover:bg-zinc-100/50 dark:hover:bg-zinc-900/80 group"
                    >
                      <div className="p-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-full mb-3 group-hover:scale-110 transition-transform">
                        <Upload size={24} />
                      </div>
                      <p className="text-xs font-bold text-gray-800 dark:text-gray-200 mb-1">
                        Click to browse local image files
                      </p>
                      <p className="text-[11px] text-gray-400">
                        Supports PNG, JPG, JPEG, WEBP, GIF, SVG
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Image URL */}
              {imageTab === 'url' && (
                <div className="space-y-3">
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
                    Direct Image URL
                  </label>
                  <input
                    type="text"
                    value={imageUrlInput}
                    onChange={(e) => setImageUrlInput(e.target.value)}
                    placeholder="https://example.com/image.png"
                    className="w-full px-3 py-2.5 text-xs border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400 transition-all"
                  />
                  {imageUrlInput.trim() && (
                    <div className="p-2 border border-gray-200 dark:border-gray-800 rounded-xl bg-gray-50 dark:bg-gray-900 flex justify-center">
                      <img
                        src={imageUrlInput.trim()}
                        alt="URL Preview"
                        className="max-h-36 rounded-lg object-contain"
                        onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2 px-6 py-4 bg-gray-50 dark:bg-gray-900/60 border-t border-gray-200 dark:border-gray-800">
              <button
                type="button"
                onClick={handleModalClose}
                disabled={isUploading}
                className="px-4 py-2 text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-xl transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmInsertImage}
                disabled={isUploading || (imageTab === 'pc' ? !selectedFile : !imageUrlInput.trim())}
                className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 rounded-xl transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isUploading ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Uploading...
                  </>
                ) : (
                  'Insert Image'
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <style jsx global>{`
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #adb5bd;
          pointer-events: none;
          height: 0;
        }
        .ProseMirror h1 { font-size: 2rem !important; font-weight: 800 !important; margin-top: 1.5rem; margin-bottom: 1rem; line-height: 1.2; }
        .ProseMirror h2 { font-size: 1.5rem !important; font-weight: 700 !important; margin-top: 1.3rem; margin-bottom: 0.8rem; line-height: 1.3; }
        .ProseMirror h3 { font-size: 1.25rem !important; font-weight: 700 !important; margin-top: 1.1rem; margin-bottom: 0.6rem; }
        .ProseMirror h4 { font-size: 1.1rem !important; font-weight: 700 !important; margin-top: 1rem; margin-bottom: 0.5rem; }
        .ProseMirror ul { list-style-type: disc; padding-left: 1.5rem; margin-bottom: 1rem; }
        .ProseMirror ol { list-style-type: decimal; padding-left: 1.5rem; margin-bottom: 1rem; }
        .ProseMirror li { margin-bottom: 0.25rem; }
        .ProseMirror li p { display: inline; margin: 0; }
        .ProseMirror blockquote { border-left: 3px solid #6366f1; padding-left: 1rem; font-style: italic; color: #6b7280; margin: 1.5rem 0; }
        .ProseMirror hr { border: none; border-top: 2px solid #e2e8f0; margin: 2rem 0; }
        
        .dark .ProseMirror { color: #e5e7eb; }
        .dark .ProseMirror h1, .dark .ProseMirror h2, .dark .ProseMirror h3, .dark .ProseMirror h4 { color: #ffffff; }
        .dark .ProseMirror blockquote { color: #9ca3af; border-left-color: #818cf8; }
        .dark .ProseMirror hr { border-top-color: #27272a; }
        
        .ProseMirror table {
          border-collapse: collapse;
          margin: 1.5rem 0;
          width: 100%;
          border-radius: 16px;
          overflow: hidden;
          border: 1px solid #e2e8f0 !important;
          font-size: 0.875rem;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.04);
        }
        .ProseMirror th, .ProseMirror td {
          border: 1px solid #e2e8f0 !important;
          outline: none !important;
          padding: 0.75rem 1.1rem !important;
          text-align: left;
          vertical-align: top;
          line-height: 1.6;
        }
        .ProseMirror th {
          background-color: #f8fafc !important;
          font-weight: 700 !important;
          color: #0f172a !important;
          border-bottom: 2px solid #cbd5e1 !important;
        }
        .ProseMirror td {
          background-color: #ffffff;
          color: #334155;
        }
        .ProseMirror td:first-child {
          font-weight: 600;
          color: #0f172a;
        }
        .ProseMirror tr:nth-child(even) td {
          background-color: #f8fafc;
        }
        .ProseMirror tr:hover td {
          background-color: #f1f5f9;
        }
        .ProseMirror .selectedCell:after {
          display: none !important;
        }

        .dark .ProseMirror table {
          border-color: #27272a !important;
          box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.4);
        }
        .dark .ProseMirror th, .dark .ProseMirror td {
          border-color: #27272a !important;
          color: #a1a1aa;
        }
        .dark .ProseMirror th {
          background-color: #18181b !important;
          color: #fafafa !important;
          border-bottom-color: #3f3f46 !important;
        }
        .dark .ProseMirror td {
          background-color: #09090b;
        }
        .dark .ProseMirror td:first-child {
          color: #f4f4f5;
        }
        .dark .ProseMirror tr:nth-child(even) td {
          background-color: #121215;
        }
        .dark .ProseMirror tr:hover td {
          background-color: #1c1c21;
        }

        ul[data-type="taskList"] {
          list-style: none;
          padding: 0;
        }
        ul[data-type="taskList"] li {
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
        }
        ul[data-type="taskList"] input[type="checkbox"] {
          margin-top: 0.3rem;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
