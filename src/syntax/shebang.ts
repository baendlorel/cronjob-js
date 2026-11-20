import { extname } from 'node:path';

/**
 * 获取解释器，同时也可用于判定是否存在 shebang
 * - 如果有人只是在第一行写了"#!"，后面没写任何东西，这里也会返回`null`
 */
export const getShebang = (line: string) => (line.startsWith('#!') ? line.slice(2) || null : null);

// 增加一个尝试找到python运行时的脚本

export const getDefaultShebang = (filepath: string) => {
  const ext = extname(filepath);
  switch (ext) {
    case 'ts':
      return 'tsx';
    case 'js':
      return process.execPath; // 一般这是可以找到的node运行时
    case 'py':
      return 'python';
    case 'sh':
      return 'sh'; // 或者bash
    default:
      return null;
  }
};
