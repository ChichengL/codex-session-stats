const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {installProjectColors}=require('../agent.cjs');
const prefix='codex-session-stats.project-color.v1:';
const row=(id,kind,index,name)=>`<div class="project" data-sidebar-project-kind="${kind}"><div class="row" tabindex="0" role="button" data-app-action-sidebar-project-row data-app-action-sidebar-project-id="${id}" data-app-action-sidebar-project-label="${name}"><span class="icon-leading-slot" data-sidebar-project-container-id="project:${id}" data-sidebar-project-kind="${kind}"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7V5a2 2 0 0 1 2-2h5l3 3h6a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7h18"/></svg></span><span class="name">${name}</span><button aria-haspopup="menu" aria-expanded="false" id="trigger-${index}" aria-label="${name} 项目操作">•••</button></div></div>`;
const fixture=`<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><style>
*{box-sizing:border-box}body{margin:0;padding:24px;background:#1e2021;color:#e5e7e8;font:14px -apple-system,sans-serif}.row{display:flex;gap:10px;align-items:center;width:270px;height:38px;padding:8px;border-radius:9px}.row:hover{background:#303233}.name{flex:1}.icon-leading-slot{display:grid;place-items:center}button{color:inherit;background:none;border:none;cursor:pointer;font:inherit}[role=menu]{position:fixed;top:70px;left:100px;width:244px;background:#292c2e;border:1px solid #60666a;border-radius:12px;padding:5px;box-shadow:0 8px 28px #0008}[role=menu]>[role=menuitem]{padding:8px 10px;border-radius:7px}[role=menu]>[role=menuitem]:hover,[role=menu]>[role=menuitem]:focus{background:#42474b;outline:0}h2{font-size:12px;color:#909496;font-weight:500}input{color:inherit;background:#333;border:1px solid #555;margin-top:20px;border-radius:5px;padding:7px}
</style><h2>置顶</h2>${row('one','local',1,'示例项目')}${row('two','local',2,'示例项目')}${row('one','remote',3,'远程项目')}<h2>项目</h2>${row('one','local',4,'示例项目')}<input id="editor" value="继续编辑"/><script>
window.rowClicks=0;window.nativeContexts=0;document.addEventListener('contextmenu',e=>{if(e.target.closest('.row')){window.nativeContexts++;e.preventDefault()}});document.querySelectorAll('.row').forEach(row=>row.addEventListener('click',()=>window.rowClicks++));document.querySelectorAll('button[aria-haspopup]').forEach(button=>button.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.stopPropagation();document.querySelector('[role=menu]')?.remove();button.setAttribute('aria-expanded','true');const menu=document.createElement('div');menu.setAttribute('role','menu');menu.setAttribute('aria-labelledby',button.id);menu.dataset.state='open';['取消置顶','编辑','分区','在 Finder 中显示','归档聊天','移除项目'].forEach(label=>{const el=document.createElement('div');el.setAttribute('role','menuitem');el.tabIndex=-1;el.textContent=label;menu.append(el)});menu.addEventListener('keydown',e=>{if(e.key==='Escape'){menu.remove();button.setAttribute('aria-expanded','false')}});document.body.append(menu);menu.tabIndex=-1;menu.focus();}));</script></html>`;
async function run(){
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined});
 const context=await browser.newContext({viewport:{width:440,height:480},deviceScaleFactor:2});
 await context.route('http://badge.test/**',route=>route.fulfill({contentType:'text/html',body:fixture}));
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const inject=p=>p.evaluate(`(${installProjectColors.toString()})()`);
 const open=async(index=0)=>{await page.locator('[data-app-action-sidebar-project-row]').nth(index).click({button:'right'});await page.waitForSelector('[data-codex-project-palette]');};
 try{
  await page.goto('http://badge.test/');await page.locator('#editor').focus();await inject(page);
  assert.equal(await page.locator('#editor').evaluate(el=>el===document.activeElement),true);
  await open();
  assert.equal(await page.evaluate(()=>window.nativeContexts),0);
  assert.equal(await page.getByRole('menuitemradio').count(),7);
  assert.equal(await page.getByRole('menuitem',{name:'编辑',exact:true}).count(),1);
  await page.getByRole('menuitemradio',{name:'蓝色'}).click();
  assert.equal(await page.locator('[role=menu]').count(),0);
  assert.equal(await page.locator('[data-codex-project-color="blue"]').count(),2);
  assert.equal(await page.evaluate(()=>window.rowClicks),0);
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),prefix+'local:one'),'blue');
  await open(1);await page.getByRole('menuitemradio',{name:'红色'}).click();
  assert.equal(await page.locator('[data-codex-project-color="red"]').count(),1);
  assert.equal(await page.locator('[data-codex-project-color="blue"]').count(),2);
  await page.reload();await inject(page);
  assert.equal(await page.locator('[data-codex-project-color="blue"]').count(),2);
  assert.equal(await page.locator('[data-codex-project-color="red"]').count(),1);
  await page.locator('.name').first().evaluate(el=>el.textContent='改名后的示例项目');
  await page.locator('.project').first().evaluate(el=>el.parentElement.append(el.cloneNode(true)));
  await page.waitForFunction(()=>document.querySelectorAll('[data-codex-project-color="blue"]').length===3);
  await open();
  await page.getByRole('menuitem',{name:'恢复默认'}).click();
  assert.equal(await page.locator('[data-codex-project-color="blue"]').count(),0);
  const second=await context.newPage();await second.goto('http://badge.test/');await inject(second);
  await open();await page.getByRole('menuitemradio',{name:'紫色'}).click();
  await second.waitForSelector('[data-codex-project-color="purple"]');
  assert.equal(await second.locator('[data-codex-project-color="purple"]').count(),2);
  await open();
  await page.getByRole('menuitem',{name:'移除项目',exact:true}).focus();await page.keyboard.press('ArrowDown');
  assert.equal(await page.getByRole('menuitemradio',{name:'红色'}).evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');
  assert.equal(await page.locator('[data-codex-project-color="orange"]').count(),3);
  await page.locator('[data-app-action-sidebar-project-row]').first().focus();await page.keyboard.press('Shift+F10');
  await page.waitForSelector('[data-codex-project-palette]');await page.keyboard.press('Escape');
  // Storage write failure must leave the previous color intact and display an error.
  await open();await page.evaluate(()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new Error('quota')}});
  await page.getByRole('menuitemradio',{name:'绿色'}).click();
  assert.equal(await page.getByRole('status').textContent(),'颜色保存失败，请重试');
  assert.equal(await page.locator('[data-codex-project-color="orange"]').count(),3);
  await page.evaluate(()=>{Storage.prototype.setItem=window.originalSetItem;delete window.originalSetItem});
  for(let i=0;i<3;i++)await inject(page);
  assert.equal(await page.locator('#codex-project-colors-style').count(),1);
  assert.equal(await page.locator('[data-codex-project-palette]').count(),1);
  await page.evaluate(()=>{localStorage.setItem('unrelated-test','keep');window.__codexProjectColors.destroy({clearStorage:true})});
  assert.equal(await page.locator('[data-codex-project-color]').count(),0);
  assert.equal(await page.locator('[data-codex-project-palette]').count(),0);
  assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('codex-session-stats.project-color.v1:')).length),0);
  assert.equal(await page.evaluate(()=>localStorage.getItem('unrelated-test')),'keep');
  assert.deepEqual(errors,[]);
  console.log('PASS project colors: right-click/actions, seven colors, project identity isolation, duplicate rows, rename/remount/reload, cross-window sync, reset, keyboard, storage failure, repeat injection and uninstall cleanup');
 }finally{await browser.close()}
}
run().catch(e=>{console.error(e);process.exitCode=1});
