const fs = require('node:fs');
const path = require('node:path');
const glyphs = {
  M: ['1100011','1110111','1111111','1101011','1100011','1100011','1100011','1100011','1100011'],
  I: ['111','111','111','111','111','111','111','111','111'],
  N: ['1100011','1110011','1110011','1111011','1101111','1100111','1100111','1100011','1100011'],
  E: ['111111','111111','110000','111110','111110','110000','110000','111111','111111'],
  C: ['011111','111111','110000','110000','110000','110000','110000','111111','011111'],
  R: ['111110','111111','110011','110011','111110','111100','110110','110011','110011'],
  A: ['0011100','0111110','1111111','1101011','1101011','1110111','1100011','1101011','1101011'],
  F: ['111111','111111','110000','111110','111110','110000','110000','110000','110000'],
  T: ['1111111','1111111','0011100','0011100','0011100','0011100','0011100','0011100','0011100'],
};
let x = 2, paths = [];
for (const letter of 'MINECRAFT') {
  const rows = glyphs[letter], edges = new Map(); let d = '';
  const filled = (xx,y) => rows[y]?.[xx] === '1';
  const edge = (a,b) => { const k=a.join(','); if(!edges.has(k))edges.set(k,[]);edges.get(k).push(b); };
  rows.forEach((row,y)=>[...row].forEach((on,xx)=>{
    if(on!=='1')return;
    if(!filled(xx,y-1))edge([xx,y],[xx+1,y]);
    if(!filled(xx+1,y))edge([xx+1,y],[xx+1,y+1]);
    if(!filled(xx,y+1))edge([xx+1,y+1],[xx,y+1]);
    if(!filled(xx-1,y))edge([xx,y+1],[xx,y]);
  }));
  while(edges.size){
    const start=edges.keys().next().value;let k=start; const first=k.split(',').map(Number);d+=`M${x+first[0]},${first[1]+1}`;
    do{const list=edges.get(k), next=list.pop();if(!list.length)edges.delete(k);d+=`L${x+next[0]},${next[1]+1}`;k=next.join(',');}while(k!==start&&edges.has(k));
    d+='z';
  }
  paths.push(d); x += rows[0].length + 1;
}
const shape = paths.join(''), width = x + 1;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 13" role="img" aria-label="Minecraft"><defs><linearGradient id="stone" x2="0" y2="1"><stop stop-color="#f2f1e8"/><stop offset=".4" stop-color="#c5c6bc"/><stop offset="1" stop-color="#8f938b"/></linearGradient></defs><path d="${shape}" transform="translate(0 1.35)" fill="#41443e" stroke="#191d18" stroke-width=".65" stroke-linejoin="miter"/><path d="${shape}" fill="url(#stone)" stroke="#242b23" stroke-width=".13"/><path d="M5 2v2m9 3h1m10-3v2m8 4h2m7-6v2m12 3h1" stroke="#5a6056" stroke-width=".12" opacity=".5"/></svg>`;
fs.writeFileSync(path.join(__dirname, '..', 'assets', 'logo.svg'), svg);
fs.writeFileSync(path.join(__dirname, '..', 'assets', 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="#70a744" d="M0 0h16v16H0z"/><path fill="#203524" d="M3 4h4v4H3zm6 0h4v4H9zM6 7h4v2H6zM4 9h8v4h-2v-2H6v2H4z"/></svg>');
