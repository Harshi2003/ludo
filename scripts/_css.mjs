import { compile } from "@tailwindcss/node";
import { readFileSync } from "node:fs";
const css = readFileSync("app/globals.css", "utf8");
const c = await compile(css, { base: process.cwd(), onDependency() {} });
const out = c.build([]);
console.log(out.length, /keyframes fall/.test(out), /btn-cta/.test(out), /glass-a/.test(out));
