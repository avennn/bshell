export type Transformer<T = string, R = unknown> = (source: T) => R;

export const tt2ttyTransformer: Transformer<string, string> = (source) => {
  if (source.startsWith('tty')) {
    return source;
  }
  return source === '??' ? '' : `tty${source}`;
};

export const cmd2ArgsTransformer: Transformer<string, string[]> = (source) => {
  const arr = source.trim().split(' ');
  arr.splice(0, 1);
  return arr || [];
};

export const parseFloatTransformer: Transformer<string, number> = (source) => {
  return parseFloat(source);
  // try {
  //   return parseFloat(source);
  // } catch (e) {
  //   return 0;
  // }
};

export const formatTime2SecTransformer: Transformer<string, number> = (
  source
) => {
  // 139-23:41:39
  let result = 0;
  const [s, m, h, d] = source.split(/[-:]/).reverse();
  if (s) {
    result += parseInt(s);
  }
  if (m) {
    result += parseInt(m) * 60;
  }
  if (h) {
    result += parseInt(h) * 60 * 60;
  }
  if (d) {
    result += parseInt(d) * 24 * 60 * 60;
  }
  return result;
};
