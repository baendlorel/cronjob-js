/**
 * 获取解释器，同时也可用于判定是否存在 shebang
 * - 如果有人只是在第一行写了"#!"，后面没写任何东西，这里也会返回`null`
 */
export const getShebang = (line: string) => (line.startsWith('#!') ? line.slice(2) || null : null);

const jstsAllow = (line) =>
  // 单行注释
  line.startsWith('//') ||
  // 多行注释
  line.startsWith('/*') ||
  // 多行注释的第二行
  line.startsWith('*') ||
  // 多行注释的最后一行
  line.startsWith('*/') ||
  // 什么都没有，也可能是多行注释
  line.length === 0;

const allows = {
  '.ts': jstsAllow,
  '.js': jstsAllow,
  '.py': (line: string) => /^(#|'''|""")/.test(line) || line.length === 0,
  '.sh': (line: string) => line.startsWith('#') || line.length === 0,
};

export function getAllowFn(ext: string): (line: string) => boolean {
  return allows[ext] || (() => false);
}
