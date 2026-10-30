// opencv.js 안에 문자열로 박힌 WASM을 별도 바이너리 파일로 꺼낸다
const fs = require('fs')
const src = fs.readFileSync(process.argv[2], 'latin1') // 바이트 보존
const head = "function findWasmBinary(){return binaryDecode('"
const i = src.indexOf(head)
if (i < 0) throw new Error('marker not found')
const start = i + head.length
const end = src.indexOf("')}function getBinarySync", start)
// 원본은 UTF-8 텍스트 → 그 구간만 UTF-8로 해석해 JS 문자열 리터럴로 평가
const litUtf8 = Buffer.from(src.slice(start, end), 'latin1').toString('utf8')
const str = eval("'" + litUtf8 + "'")
const o = new Uint8Array(str.length)
for (let k = 0; k < str.length; k++) { const c = str.charCodeAt(k); o[k] = ~c >> 8 & c }
if (!(o[0] === 0 && o[1] === 0x61 && o[2] === 0x73 && o[3] === 0x6d)) throw new Error('not wasm magic')
fs.writeFileSync(process.argv[4], o)
const patched = src.slice(0, i) + "function findWasmBinary(){var w=globalThis.__JAGUK_CV_WASM;if(!w)throw new Error('opencv wasm not preloaded');return w}" + src.slice(end + 3)
fs.writeFileSync(process.argv[3], Buffer.from(patched, 'latin1'))
console.log('wasm bytes', o.length, 'js bytes', patched.length)
