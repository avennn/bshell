<a href="README.md">English</a>｜<a href="README.zh_CN.md">简体中文</a>

# bshell

[![Download](https://img.shields.io/npm/dw/bshell)](https://www.npmjs.com/package/bshell)
[![Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen)](https://github.com/avennn/bshell)
[![Npm](https://img.shields.io/npm/v/bshell)](https://github.com/avennn/bshell)
[![Node](https://img.shields.io/node/v/bshell)](./package.json)
[![License](https://img.shields.io/npm/l/bshell)](./LICENSE)

Provide portable Unix shell commands out of [shelljs](https://github.com/shelljs/shelljs) for Node.js.

bshell means "better shell".

## Install

With npm

```bash
npm i bshell
```

With yarn

```bash
yarn add bshell
```

With pnpm

```bash
pnpm add bshell
```

## Usage

### ps

```js
import { Ps } from 'bshell';

const ps = new Ps();

ps.execute().then((res) => {
  console.log(res); // [{ pid: 123, tty: 'ttys001' }, ...]
});
```
