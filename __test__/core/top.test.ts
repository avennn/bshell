import { Top } from '@/core';

describe('top', () => {
  let top: Top;

  beforeEach(() => {
    top = new Top();
  });

  test('get one sample, no streaming data', async () => {
    const output = await top.execute();
    expect(output).toBeTruthy();
  });

  test('get pcpu pmem', () => {
    // const topInstance = top.raw('-n 5');
    // topInstance.on('data', (data) => {
    //   console.log('===data===', data);
    // });
    expect(true).toBe(true);
  });
});
