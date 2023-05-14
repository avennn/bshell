<a href="README.md">English</a>｜<a href="README.zh_CN.md">简体中文</a>

# bshell

[![Download](https://img.shields.io/npm/dw/bshell)](https://www.npmjs.com/package/bshell)
[![Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen)](https://github.com/avennn/bshell)
[![Npm](https://img.shields.io/npm/v/bshell)](https://github.com/avennn/bshell)
[![Node](https://img.shields.io/node/v/bshell)](./package.json)
[![License](https://img.shields.io/npm/l/bshell)](./LICENSE)

提供[shelljs](https://github.com/shelljs/shelljs)之外的一些便捷的 nodejs 命令。

bshell（better shell）意思是更好的 shell。

## 安装

使用 npm

```bash
npm i bshell
```

使用 yarn

```bash
yarn add bshell
```

使用 pnpm

```bash
pnpm add bshell
```

## 使用

### ps

```js
import { Ps } from 'bshell';

const ps = new Ps();

ps.execute().then((res) => {
  console.log(res); // [{ pid: 123, tty: 'ttys001' }, ...]
});
```
