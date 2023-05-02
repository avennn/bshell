export default abstract class Command {
  constructor() {}
  abstract raw(params: string): unknown;
  abstract execute(): Promise<unknown>;
}
