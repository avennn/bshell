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
import util from 'node:util';
import { exec as execLegacy } from 'node:child_process';
import Command from '../command';
import {
  tt2ttyTransformer,
  cmd2ArgsTransformer,
  parseFloatTransformer,
  formatTime2SecTransformer,
} from './transformer';
import type { Transformer } from './transformer';

const exec = util.promisify(execLegacy);

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
      field?: string; // 自定义key对应的field，如果没有，则使用内部推断的
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

interface FieldTransformer {
  field: string;
  transformer?: Transformer;
}

interface KeyTransformer {
  key: OutputKey;
  transformer?: Transformer | null;
}

type KeyField = (string | FieldTransformer)[];

function generateKey2FieldMap() {
  const originMap: Record<OutputKey, KeyField> = {
    [PsOutputKey.pid]: [{ field: 'pid', transformer: parseInt }],
    [PsOutputKey.ppid]: [{ field: 'ppid', transformer: parseInt }],
    [PsOutputKey.tty]: ['tty', 'tt'].map((field) => ({
      field,
      transformer: tt2ttyTransformer,
    })),
    [PsOutputKey.cputime]: ['cputime', 'time'],
    // 后3个不包含参数
    // TODO: 是否需要区分，分别返回无参数命令，包含参数命令
    [PsOutputKey.command]: ['command', 'args', 'comm', 'ucomm', 'ucmd'],
    [PsOutputKey.arguments]: ['command', 'args'].map((field) => ({
      field,
      transformer: cmd2ArgsTransformer,
    })),
    [PsOutputKey.uid]: ['uid', 'euid'].map((field) => ({
      field,
      transformer: parseInt,
    })),
    [PsOutputKey.user]: ['user', 'euser'],
    [PsOutputKey.ruid]: [{ field: 'ruid', transformer: parseInt }],
    [PsOutputKey.ruser]: ['ruser'],
    [PsOutputKey.pcpu]: ['pcpu', '%cpu'].map((field) => ({
      field,
      transformer: parseFloatTransformer,
    })),
    [PsOutputKey.pmem]: ['pmem', '%mem'].map((field) => ({
      field,
      transformer: parseFloatTransformer,
    })),
    // @changed
    [PsOutputKey.etime]: [
      'etimes',
      {
        field: 'etime',
        transformer: formatTime2SecTransformer,
      },
    ],
  };
  // 序列化成标准格式
  const map = {} as Record<OutputKey, FieldTransformer[]> & {
    [index: string]: FieldTransformer[];
  };
  (Object.keys(originMap) as OutputKey[]).forEach((key) => {
    const fieldList = originMap[key];
    map[key] = [];
    fieldList.forEach((fieldItem) => {
      if (typeof fieldItem === 'string') {
        (map[key] as FieldTransformer[]).push({
          field: fieldItem,
        });
      } else {
        (map[key] as FieldTransformer[]).push(fieldItem);
      }
    });
  });

  return map;
}

const key2FieldMap = generateKey2FieldMap();

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

export default class Ps extends Command {
  private options: Options;
  private field2Keys: Record<string, KeyTransformer[]>;
  private taskQueue: Task[];

  // static currentTty = Symbol('ps.currentTty');
  static defaultKeys = [
    PsOutputKey.pid,
    PsOutputKey.tty,
    PsOutputKey.cputime,
    PsOutputKey.command,
  ];

  constructor() {
    super();
    this.options = {
      selectAll: false,
      selectBy: {} as Options['selectBy'],
    };
    this.field2Keys = {};
    this.taskQueue = [];
  }

  static async getAvaliableFields(): Promise<string[]> {
    try {
      // 在zsh上测得
      // TODO: 兼容不同平台
      const { stdout } = await exec('ps -L');
      // TODO: 兼容不同平台换行符
      return stdout.trim().split(/[\s\n]/);
    } catch (e) {
      console.error(e);
      return [];
    }
  }

  static get avaliableOutputKeys() {
    return avaliableOutputKeys;
  }

  get hasInitedKeys(): boolean {
    return !!Object.keys(this.field2Keys).length;
  }

  get sortedFields(): string[] {
    // 把cmd放到最后，便于处理文本分割
    const fields = Object.keys(this.field2Keys);
    fields.sort((a) => {
      if (['command', 'args', 'comm', 'ucomm', 'ucmd'].includes(a)) {
        return 1;
      }
      return -1;
    });
    return fields;
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

  async #_output(expectKeys: ExpectKey[] | (() => ExpectKey[])): Promise<void> {
    const avaliableCols = await Ps.getAvaliableFields();
    const keys = typeof expectKeys === 'function' ? expectKeys() : expectKeys;

    function reflectField(reflectFields: FieldTransformer[], fields: string[]) {
      return reflectFields.find((fieldObj) => fields.includes(fieldObj.field));
    }

    keys.filter(Boolean).forEach((key) => {
      let reflectFields: FieldTransformer[] = [];
      let realKey = '' as OutputKey;
      if (typeof key === 'string') {
        realKey = key;
      } else if (typeof key === 'object' && key !== null) {
        realKey = key.key;
      }
      reflectFields = key2FieldMap[realKey] ?? [];
      if (reflectFields.length) {
        const fieldObj = reflectField(reflectFields, avaliableCols);
        if (fieldObj) {
          if (!this.field2Keys[fieldObj.field]) {
            this.field2Keys[fieldObj.field] = [];
          }
          const keyObj = {
            key: realKey,
          } as KeyTransformer;
          if (fieldObj.transformer) {
            keyObj.transformer = fieldObj.transformer;
          }
          this.field2Keys[fieldObj.field].push(keyObj);
        }
      }
    });
  }

  output(expectKeys: ExpectKey[] | (() => ExpectKey[])): Ps {
    this.addTask(() => this.#_output(expectKeys));
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

    const fields = this.sortedFields;
    if (fields.length) {
      params.push(`-o ${fields.join(',')}`);
    }

    return params.join(' ');
  }

  format(stdout: string): Record<OutputKey, unknown>[] {
    const rows = stdout.trim().split('\n');

    // 去除header
    rows.splice(0, 1);

    const cols = this.sortedFields;
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
        const keyObjs = this.field2Keys[cols[i]];
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

  async psWrapper(params: string): Promise<string> {
    const { stdout } = await exec(`ps ${params}`);
    return stdout;
  }

  async execute(): Promise<Record<OutputKey, unknown>[]> {
    while (this.taskQueue.length) {
      await (this.taskQueue.shift() as Task)();
    }
    if (!this.hasInitedKeys) {
      await this.#_output(Ps.defaultKeys);
    }

    const stdout = await this.psWrapper(this.createParams());

    return this.format(stdout);
  }

  // 直接通过"ps -e -o pid,tty"这种原始的形式执行
  raw(params: string) {
    return this.psWrapper(params);
  }
}
