import { Ps, PsOutputKey } from '@/core';

describe('ps', () => {
  let ps: Ps;

  beforeEach(() => {
    ps = new Ps();
  });

  test('default get pid,tty,cputime,command', async () => {
    const result = await ps.execute();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(Object.keys(result[0])).toEqual(
      expect.arrayContaining(['pid', 'tty', 'cputime', 'command'])
    );
  });

  test('getAvaliableSpecs', async () => {
    const result = await Ps.getAvaliableFields();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result).toEqual(
      expect.arrayContaining(['pid', 'tty', 'cputime', 'command'])
    );
  });

  test('Ps.avaliableOutputKeys get all avaliable keys', () => {
    const result = Ps.avaliableOutputKeys;
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result).toEqual(
      expect.arrayContaining(['pid', 'tty', 'cputime', 'command'])
    );
  });

  test('selectBy return filtered items', async () => {
    const result = await ps
      .selectBy(PsOutputKey.ruser, 'root')
      .output(['ruser'])
      .execute();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((item) => item.ruser === 'root')).toBeTruthy();
  });

  test('selectAll block selectBy', async () => {
    const result = await ps
      .selectAll()
      .selectBy(PsOutputKey.uid, 'root')
      .output(['uid'])
      .execute();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((item) => item.uid === 'root')).toBe(false);
  });

  test('execute method has input, act as command line', async () => {
    const result = await ps.raw('-e -o pid,tty -U root');
    expect(result).toEqual(expect.stringContaining('PID'));
    expect(result).toEqual(expect.stringContaining('TTY'));
  });

  test('get pcpu pmem', async () => {
    const result = await ps
      .selectBy('ruid', 'root')
      .output(['pcpu', 'pmem', 'etime', 'tty', 'ruid'])
      .execute();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((item) => item.ruid === 'root')).toBe(false);
  });
});
