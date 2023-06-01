// https://man7.org/linux/man-pages/man1/top.1.html
import util from 'node:util';
import { spawn, exec as execLegacy } from 'node:child_process';
import Command from '../command';
import { noop } from '@/shared';
import autoBind from 'auto-bind';
import parse from './parser';

type EventName = 'data' | 'error' | 'close';

const exec = util.promisify(execLegacy);

export default class Top extends Command {
  #dataCallback: (data: unknown) => unknown = noop;
  #errorCallback: (data: unknown) => unknown = noop;
  #closeCallback: (code: number) => unknown = noop;

  constructor() {
    super();
    autoBind(this);
  }

  async execute(): Promise<unknown> {
    const { stdout } = await exec('top -l 1');
    return parse(stdout);
  }

  raw(params: string) {
    const subProc = spawn('top', params.trim().split(/\s+/));
    subProc.stdout.on('data', this.emitData);

    subProc.stderr.on('data', this.emitError);
    subProc.on('close', this.emitClose);
    return this;
  }

  emitData(data: Buffer) {
    this.#dataCallback(data.toString());
  }

  emitError(data: Buffer) {
    console.log('===>>>', this);
    this.#errorCallback(data.toString());
  }

  emitClose(code: number) {
    this.#closeCallback(code);
  }

  on(eventName: EventName, fn: (data: unknown) => any) {
    switch (eventName) {
      case 'error':
        this.#errorCallback = fn;
        break;
      case 'close':
        this.#closeCallback = fn;
        break;
      default:
        this.#dataCallback = fn;
        break;
    }
  }
}
