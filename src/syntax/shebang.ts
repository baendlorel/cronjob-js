/**
 * 获取解释器，同时也可用于判定是否存在 shebang
 * - 如果有人只是在第一行写了"#!"，后面没写任何东西，这里也会返回`null`
 */
export const getShebang = (line: string) => (line.startsWith('#!') ? line.slice(2) || null : null);
