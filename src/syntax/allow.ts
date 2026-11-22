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
  '.mts': jstsAllow,
  '.cts': jstsAllow,
  '.js': jstsAllow,
  '.mjs': jstsAllow,
  '.cjs': jstsAllow,
  '.py': (line: string) => /^(#|'''|""")/.test(line) || line.length === 0,
  '.sh': (line: string) => line.startsWith('#') || line.length === 0,
};

export function getAllowFn(ext: string): (line: string) => boolean {
  return allows[ext] || (() => false);
}
