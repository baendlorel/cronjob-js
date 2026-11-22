import { Marker } from '../consts.js';

const jstsAllow = (line) =>
  // 单行注释
  line.startsWith('//') ||
  // 多行注释
  line.startsWith('/*') ||
  // 多行注释的第二行
  line.startsWith('*') ||
  // 多行注释的最后一行
  line.startsWith('*/') ||
  // 允许多行注释中直接出现@cron
  //! 这不是百分百准确，但绝大多数时候，此条是有效的，原因如下：
  //! @cron开头的只可能是字符串中或装饰器或多行注释。
  //! 字符串会被其他规则排除
  //! 装饰器@cron或者@cron(...)，一般不会解析出cron表达式，需要精心构造特例才能实现
  //! 这种情况确实对多行注释不友好，不便在多行注释中以其他文字开头，但基本不会有问题
  //! 这里不会做字符walking解析注释块，否则开销过大
  Marker.REGEX_START.test(line) ||
  Marker.BEGIN_REGEX_START.test(line) ||
  Marker.END_REGEX_START.test(line) ||
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
