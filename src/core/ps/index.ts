// https://man7.org/linux/man-pages/man1/ps.1.html
// FIXME: all the code is so far tested in zsh
/**
 * UNIX格式，短选项，可以组合，以一个横杠开头
 * BSD格式，短选项，可以组合，不横杠开头
 * GNU格式，长选项，双横杠开头
 */
/**
  标准语法查所有
  ps -e
  ps -ef
  ps -eF zsh不支持
  ps -ely zsh不支持
  BSD语法查所有
  ps ax
  ps aux ax和aux返回格式不同
 */
// a选择所有有tty的进程
// ax, -A, -e选择所有进程
// -a选择所有除了session leaders和没有关联tty的进程
// -d选择所有除了session leaders的进程
// -N, --deselect反选
// T, t 当前tty关联的进程
// r只在跑着的进程
import { exec } from 'child_process';
import {
  tt2ttyTransformer,
  cmd2ArgsTransformer,
  parseFloatTransformer,
  formatTime2SecTransformer,
} from './transformer';
import type { Transformer } from './transformer';

interface Options {
  selectAll: boolean;
  selectBy: Record<OutputKey, unknown[]>;
}

// consistent with type OutputKey, Ps.avaliableOutputKeys
export enum PsOutputKey {
  pid = 'pid',
  ppid = 'ppid',
  tty = 'tty',
  cputime = 'cputime',
  command = 'command',
  arguments = 'arguments',
  uid = 'uid',
  user = 'user',
  ruid = 'ruid',
  ruser = 'ruser',
  pcpu = 'pcpu',
  pmem = 'pmem',
  etime = 'etime',
}

// consistent with enum PsOutputKey, Ps.avaliableOutputKeys
type OutputKey = [
  'pid',
  'ppid',
  'tty',
  'cputime',
  'command',
  'arguments',
  'uid',
  'user',
  'ruid',
  'ruser',
  'pcpu',
  'pmem',
  'etime'
][number];

type ExpectKey =
  | OutputKey
  | {
      key: OutputKey;
      spec?: string; // 自定义key对应的specifier，如果没有，则使用内部推断的
      transformer?: (source: string) => unknown;
    };

const equivalentCols: string[][] = [
  ['uid', 'euid'],
  ['user', 'euser', 'uname'],
  // zsh实测，ucmd没有，ucomm只显示执行文件名，comm显示完整执行路径
  ['comm', 'ucomm', 'ucmd'],
  // 命令+参数
  ['command', 'args'],
  ['cputime', 'time'],
  ['cputimes', 'times'], // 以秒为单位显示
];

type Task = () => Promise<void> | void;

interface SpecTransformer {
  spec: string;
  transformer?: Transformer;
}

interface KeyTransformer {
  key: OutputKey;
  transformer?: Transformer | null;
}

type KeySpec = (string | SpecTransformer)[];

function generateKey2SpecMap() {
  const originMap: Record<OutputKey, KeySpec> = {
    [PsOutputKey.pid]: ['pid'],
    [PsOutputKey.ppid]: ['ppid'],
    [PsOutputKey.tty]: ['tty', 'tt'].map((spec) => ({
      spec,
      transformer: tt2ttyTransformer,
    })),
    [PsOutputKey.cputime]: ['cputime', 'time'],
    // 后3个不包含参数
    // TODO: 是否需要区分，分别返回无参数命令，包含参数命令
    [PsOutputKey.command]: ['command', 'args', 'comm', 'ucomm', 'ucmd'],
    [PsOutputKey.arguments]: ['command', 'args'].map((spec) => ({
      spec,
      transformer: cmd2ArgsTransformer,
    })),
    [PsOutputKey.uid]: ['uid', 'euid'],
    [PsOutputKey.user]: ['user', 'euser'],
    [PsOutputKey.ruid]: ['ruid'],
    [PsOutputKey.ruser]: ['ruser'],
    [PsOutputKey.pcpu]: ['pcpu', '%cpu'].map((spec) => ({
      spec,
      transformer: parseFloatTransformer,
    })),
    [PsOutputKey.pmem]: ['pmem', '%mem'].map((spec) => ({
      spec,
      transformer: parseFloatTransformer,
    })),
    // @changed
    [PsOutputKey.etime]: [
      'etimes',
      {
        spec: 'etime',
        transformer: formatTime2SecTransformer,
      },
    ],
  };
  // 序列化成标准格式
  const map = {} as Record<OutputKey, SpecTransformer[]> & {
    [index: string]: SpecTransformer[];
  };
  (Object.keys(originMap) as OutputKey[]).forEach((key) => {
    const specList = originMap[key];
    map[key] = [];
    specList.forEach((specItem) => {
      if (typeof specItem === 'string') {
        (map[key] as SpecTransformer[]).push({
          spec: specItem,
        });
      } else {
        (map[key] as SpecTransformer[]).push(specItem);
      }
    });
  });

  return map;
}

const key2SpecMap = generateKey2SpecMap();

// consistent with enum PsOutputKey, OutputKey
const avaliableOutputKeys = [
  'pid',
  'ppid',
  'tty',
  'cputime',
  'command',
  'arguments',
  'uid',
  'user',
  'ruid',
  'ruser',
  'pcpu',
  'pmem',
  'etime',
];

export default class Ps {
  private options: Options;
  private spec2Keys: Record<string, KeyTransformer[]>;
  private taskQueue: Task[];

  // static currentTty = Symbol('ps.currentTty');
  static defaultKeys = [
    PsOutputKey.pid,
    PsOutputKey.tty,
    PsOutputKey.cputime,
    PsOutputKey.command,
  ];

  constructor() {
    this.options = {
      selectAll: false,
      selectBy: {} as Options['selectBy'],
    };
    this.spec2Keys = {};
    this.taskQueue = [];
  }

  static getAvaliableSpecs(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      // 在zsh上测得
      // TODO: 兼容不同平台
      exec('ps -L', (err, stdout) => {
        if (err) {
          reject(err);
          return;
        }
        // TODO: 兼容不同平台换行符
        resolve(stdout.trim().split(/[\s\n]/));
      });
    });
  }

  static get avaliableOutputKeys() {
    return avaliableOutputKeys;
  }

  get hasInitedKeys(): boolean {
    return !!Object.keys(this.spec2Keys).length;
  }

  get sortedSpecs(): string[] {
    // 把cmd放到最后，便于处理文本分割
    const specs = Object.keys(this.spec2Keys);
    specs.sort((a) => {
      if (['command', 'args', 'comm', 'ucomm', 'ucmd'].includes(a)) {
        return 1;
      }
      return -1;
    });
    return specs;
  }

  addTask(task: Task): void {
    this.taskQueue.push(task);
  }

  // Methods below are public
  _selectAll(): void {
    this.options['selectAll'] = true;
  }

  selectAll(): Ps {
    this.addTask(() => this._selectAll());
    return this;
  }

  _selectBy(key: OutputKey, value: unknown) {
    const { selectBy } = this.options;
    if (!selectBy[key]) {
      selectBy[key] = [];
    }
    if (Array.isArray(value)) {
      selectBy[key].push(...value);
    } else {
      selectBy[key].push(value);
    }
  }

  selectBy(key: OutputKey, value: unknown): Ps {
    this.addTask(() => this._selectBy(key, value));
    return this;
  }

  async _output(expectKeys: ExpectKey[] | (() => ExpectKey[])): Promise<void> {
    const avaliableCols = await Ps.getAvaliableSpecs();
    const keys = typeof expectKeys === 'function' ? expectKeys() : expectKeys;

    function reflectSpec(reflectSpecs: SpecTransformer[], specs: string[]) {
      return reflectSpecs.find((specObj) => specs.includes(specObj.spec));
    }

    keys.filter(Boolean).forEach((key) => {
      let reflectSpecs: SpecTransformer[] = [];
      let realKey = '' as OutputKey;
      if (typeof key === 'string') {
        realKey = key;
      } else if (typeof key === 'object' && key !== null) {
        realKey = key.key;
      }
      reflectSpecs = key2SpecMap[realKey] ?? [];
      if (reflectSpecs.length) {
        const specObj = reflectSpec(reflectSpecs, avaliableCols);
        if (specObj) {
          if (!this.spec2Keys[specObj.spec]) {
            this.spec2Keys[specObj.spec] = [];
          }
          const keyObj = {
            key: realKey,
          } as KeyTransformer;
          if (specObj.transformer) {
            keyObj.transformer = specObj.transformer;
          }
          this.spec2Keys[specObj.spec].push(keyObj);
        }
      }
    });
  }

  output(expectKeys: ExpectKey[] | (() => ExpectKey[])): Ps {
    this.addTask(() => this._output(expectKeys));
    return this;
  }

  sort(): Ps {
    return this;
  }

  createParams(): string {
    const params = [];
    const { selectAll, selectBy } = this.options;
    const createSelectOption = (opt: string, key: OutputKey) => {
      if (selectBy[key]) {
        params.push(`${opt} ${selectBy[key].join(',')}`);
      }
    };

    if (selectAll) {
      params.push('-e');
    } else {
      createSelectOption('-p', PsOutputKey.pid);
      createSelectOption('-t', PsOutputKey.tty);
      // 有效用户id或者姓名，进程使用了谁的文件访问权限
      // uid和user查询方式一样，结果不一定跟入参一样，-u root可能返回user不是root的项
      createSelectOption('-u', PsOutputKey.uid);
      createSelectOption('-u', PsOutputKey.user);
      // 真实用户id或者姓名，谁创建了该进程
      // ruid和ruser查询方式一样，结果跟入参一样
      createSelectOption('-U', PsOutputKey.ruid);
      createSelectOption('-U', PsOutputKey.ruser);
    }

    const specs = this.sortedSpecs;
    if (specs.length) {
      params.push(`-o ${specs.join(',')}`);
    }

    return params.join(' ');
  }

  format(stdout: string): Record<OutputKey, unknown>[] {
    const rows = stdout.trim().split('\n');

    // 去除header
    rows.splice(0, 1);

    const cols = this.sortedSpecs;
    const size = cols.length;
    const result = rows.map((row) => {
      const formatted = {} as Record<OutputKey, unknown>;
      const colValues = row.trim().split(/\s+/);
      let index = 0;
      const newColValues: string[] = [];
      while (index < size - 1 && colValues.length) {
        newColValues.push(colValues.shift() as string);
        index++;
      }
      if (colValues.length) {
        newColValues.push(colValues.join(' '));
      }
      newColValues.forEach((source, i) => {
        const keyObjs = this.spec2Keys[cols[i]];
        keyObjs.forEach((keyObj) => {
          formatted[keyObj.key] = keyObj.transformer
            ? keyObj.transformer(source)
            : source;
        });
      });
      return formatted;
    });

    return result;
  }

  psWrapper(params: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const cmd = `ps ${params}`;
      exec(cmd, (err, stdout) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(stdout);
      });
    });
  }

  async execute(): Promise<Record<OutputKey, unknown>[]> {
    while (this.taskQueue.length) {
      await (this.taskQueue.shift() as Task)();
    }
    if (!this.hasInitedKeys) {
      await this._output(Ps.defaultKeys);
    }

    const stdout = await this.psWrapper(this.createParams());

    return this.format(stdout);
  }

  // 直接通过"ps -e -o pid,tty"这种原始的形式执行
  raw(params: string) {
    return this.psWrapper(params);
  }
}
