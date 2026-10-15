// Deterministic rasterization of our existing SVG mark; no external image service.
import { deflateSync } from 'node:zlib';
function crc32(buffer){let n=0xffffffff;for(const byte of buffer){n^=byte;for(let k=0;k<8;k++)n=(n>>>1)^((n&1)?0xedb88320:0);}return (n^0xffffffff)>>>0;}
function chunk(type,data){const tag=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([tag,data])));return Buffer.concat([length,tag,data,crc]);}
export function iconPng(size=1024){
  const raw=Buffer.alloc((size*3+1)*size),points=[[15,43],[15,30],[25,37],[38,17],[49,43]];
  const distance=(x,y,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);};
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const px=(x+.5)*64/size,py=(y+.5)*64/size;
    let color=[220,226,241];
    if(points.slice(1).some((p,i)=>distance(px,py,points[i],p)<2.5))color=[66,91,153];
    if(Math.hypot(px-38,py-17)<4)color=[45,120,106];
    const offset=y*(size*3+1)+1+x*3;for(let k=0;k<3;k++)raw[offset+k]=color[k];
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
