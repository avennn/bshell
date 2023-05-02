import { Ps, PsOutputKey } from '../../src/core';

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
    const result = await Ps.getAvaliableSpecs();
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
  test('get pcpu pmem', async () => {
    const result = await ps
      .selectBy('tty', 'ttys027')
      .output(['pcpu', 'pmem', 'etime', 'tty'])
      .execute();
    console.log('===result===', result);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((item) => item.uid === 'root')).toBe(false);
  });
});
