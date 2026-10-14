import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
test('frontend wiring has real DOM targets and static local assets',()=>{
  const html=readFileSync(join(root,'web/index.html'),'utf8'),js=readFileSync(join(root,'web/app.js'),'utf8');
  new Script(js);new Script(readFileSync(join(root,'web/config.js'),'utf8'));
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
  assert.equal(ids.length,new Set(ids).size,'HTML IDs must be unique');
  for(const match of js.matchAll(/\$\('([^']+)'\)/g))assert.ok(ids.includes(match[1]),'Missing element: '+match[1]);
  for(const match of html.matchAll(/(?:src|href)="\.\/([^"#]+)"/g))assert.ok(existsSync(join(root,'web',match[1])),'Missing asset: '+match[1]);
  assert.ok(!/\bon(?:click|submit|change)=/.test(html),'CSP-compatible event wiring');
  assert.ok(!/localStorage|sessionStorage/.test(js),'No browser credential persistence');
  const config=JSON.parse(readFileSync(join(root,'capacitor.config.json'),'utf8'));
  assert.equal(config.webDir,'dist');assert.equal(config.server,undefined,'No remote WebView URL or cleartext override');
});
