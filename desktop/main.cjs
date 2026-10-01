const {app,BrowserWindow,ipcMain,Menu,Tray,Notification,shell,screen} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const {spawn} = require('node:child_process');
const root=path.join(__dirname,'..');
// Electron's IPC error reporter can throw synchronously on closed Windows pipes.
require('./runtime-logging.cjs').installLogging(path.join(app.getPath('userData'),'runtime-errors.log'));
const {normalize:normalizeColor}=require('../color-utils.js');
const {FocusTimer}=require('./focus-timer.cjs');
let main,tray,tracker,quitting=false,activity={},activityFile,activityDirty=false,sessions=[],sessionsFile,currentSession=null;
const widgets=new Map(),reminders=new Map();
const focus=new FocusTimer(()=>Date.now(),session=>{sessions.push(session);activityDirty=true;if(session.completed)notify('Фокус завершён','Хорошая работа. Сделайте небольшой перерыв.');});
function broadcastFocus(snapshot=focus.snapshot()){if(main&&!main.isDestroyed())main.webContents.send('focus:data',snapshot);for(const {win,data} of widgets.values())if(data.type==='focus')win.webContents.send('focus:data',snapshot);return snapshot;}
let loadedRevision='';
function coreRevision(){return ['main.cjs','preload.cjs','runtime-logging.cjs','focus-timer.cjs'].map(file=>fs.statSync(path.join(__dirname,file)).mtimeMs).join(':');}
const loadedCoreRevision=coreRevision();
console.info('Blaze runtime started: pid=%s core=%s',process.pid,loadedCoreRevision);
function uiRevision(){return ['index.html','styles.css','design.css','app.js','analytics.js','widget.html','widget.css','widget.js','color-utils.js','assets/logo-full-v2.png','assets/icon-v2.png'].map(file=>{try{return fs.statSync(path.join(root,file)).mtimeMs;}catch{return 0;}}).join(':');}
const localDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const isMain=event=>main && !main.isDestroyed() && event.sender.id===main.webContents.id;
function notify(title,body){if(Notification.isSupported())new Notification({title:String(title).slice(0,100),body:String(body).slice(0,1000),icon:path.join(root,'assets/icon-v2.png')}).show();}
function safeExternal(url){try{const u=new URL(url);if(u.protocol==='https:'&&(u.hostname==='yandex.ru'||u.hostname.endsWith('.yandex.ru')))shell.openExternal(u.toString());}catch{}}
function secure(win){
  win.webContents.setWindowOpenHandler(({url})=>{safeExternal(url);return {action:'deny'};});
  win.webContents.on('will-navigate',(event,url)=>{if(url!==win.webContents.getURL()){event.preventDefault();safeExternal(url);}});
}
function validatedWidget(data){
  if(!data || typeof data.id!=='string' || data.id.length>100 || !['note','route','health','focus','activity','apps','days'].includes(data.type))throw new Error('Invalid widget');
  return {id:data.id,type:data.type,title:String(data.title||'Blaze').slice(0,100),headline:String(data.headline||'').slice(0,200),body:String(data.body||'').slice(0,20000),tasks:Array.isArray(data.tasks)?data.tasks.slice(0,100).map(t=>({text:String(t.text||'').slice(0,300),done:!!t.done})):[],color:normalizeColor(data.color)||'#b5ff24',size:['small','medium','large'].includes(data.size)?data.size:'medium',pin:!!data.pin,sync:data.sync!==false,goal:Math.max(1,Math.min(31,Number(data.goal)||22)),workDays:Array.isArray(data.workDays)?data.workDays.filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)):[],interval:Math.max(1,Math.min(1440,Number(data.interval)||40)),route:{from:String(data.route?.from||'').slice(0,300),to:String(data.route?.to||'').slice(0,300),mode:['mt','auto','pd'].includes(data.route?.mode)?data.route.mode:'mt'},activity:data.activity||{},focusSeconds:data.focusSeconds||{}};
}
function widgetSize(widget){return ({small:['apps','activity'].includes(widget.type)?[660,170]:[320,260],medium:['apps','activity'].includes(widget.type)?[920,138]:widget.type==='days'?[578,300]:widget.type==='focus'?[328,300]:[518,328],large:['apps','activity'].includes(widget.type)?[1100,165]:widget.type==='focus'?[410,430]:[650,430]})[widget.size];}
function openWidget(data){
  const widget=validatedWidget(data),existing=widgets.get(widget.id);
  if(existing){existing.data=widget;existing.win.webContents.send('widget:data',widget);existing.win.setAlwaysOnTop(widget.pin);existing.win.show();existing.win.focus();return;}
  const [width,height]=widgetSize(widget);
  const area=screen.getPrimaryDisplay().workArea,offset=widgets.size*35;
  const win=new BrowserWindow({width,height,minWidth:260,minHeight:110,x:Math.max(area.x,area.x+area.width-width-25-offset),y:Math.min(area.y+area.height-height,area.y+35+offset),frame:false,transparent:true,hasShadow:false,resizable:false,movable:true,backgroundColor:'#00000000',alwaysOnTop:widget.pin,title:widget.title,icon:path.join(root,'assets/icon-v2.ico'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  widgets.set(widget.id,{win,data:widget});secure(win);win.loadFile(path.join(root,'widget.html'));
  win.on('closed',()=>{widgets.delete(widget.id);if(!quitting&&main&&!main.isDestroyed())main.webContents.send('widget:changed',{id:widget.id,patch:{desktop:false}});});
}
function saveActivity(){if(!activityDirty||!activityFile)return;try{const temp=activityFile+'.tmp';fs.writeFileSync(temp,JSON.stringify(activity));fs.renameSync(temp,activityFile);if(sessionsFile){fs.writeFileSync(sessionsFile+'.tmp',JSON.stringify(sessions));fs.renameSync(sessionsFile+'.tmp',sessionsFile);}activityDirty=false;}catch(error){console.error('Activity save failed:',error.message);}}
function startTracker(){
  if(process.platform!=='win32')return;
  let buffer='';
  tracker=spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'tracker.ps1')],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  tracker.stdout.setEncoding('utf8');tracker.stdout.on('data',chunk=>{
    buffer+=chunk;const lines=buffer.split(/\r?\n/);buffer=lines.pop();
    for(const line of lines){try{const data=JSON.parse(line);if(!data.name||data.idle>=60){currentSession=null;continue;}const day=localDay(),name=String(data.name).slice(0,80),seconds=Math.max(0,Math.min(6,Number(data.seconds)||5)),now=Date.now();activity[day]??={};activity[day][name]=(activity[day][name]||0)+seconds;if(!currentSession||currentSession.app!==name||now-new Date(currentSession.ended).getTime()>12000){currentSession={app:name,task:'Работа в программе',started:new Date(now-seconds*1000).toISOString(),ended:new Date(now).toISOString(),seconds:0};sessions.push(currentSession);if(sessions.length>2000)sessions.splice(0,sessions.length-2000);}currentSession.ended=new Date(now).toISOString();currentSession.seconds+=seconds;activityDirty=true;}catch{}}
  });
  tracker.on('error',error=>console.error('Tracker unavailable:',error.message));
  tracker.stderr.on('data',chunk=>console.error(String(chunk)));
}
function createMain(){
  main=new BrowserWindow({width:1640,height:1000,minWidth:820,minHeight:680,frame:false,backgroundColor:'#101213',title:'Blaze',icon:path.join(root,'assets/icon-v2.ico'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  secure(main);main.loadFile(path.join(root,'index.html'));main.setMenuBarVisibility(false);
  loadedRevision=uiRevision();
  main.on('close',event=>{if(!quitting && tray){event.preventDefault();main.hide();}});
}
if(!app.requestSingleInstanceLock()){app.quit();}else{
  app.on('second-instance',()=>{if(coreRevision()!==loadedCoreRevision){quitting=true;app.relaunch();app.quit();return;}if(main){const revision=uiRevision();if(revision!==loadedRevision){loadedRevision=revision;main.webContents.reloadIgnoringCache();for(const {win} of widgets.values())win.webContents.reloadIgnoringCache();}if(main.isMinimized())main.restore();main.show();main.focus();}});
  app.whenReady().then(()=>{
    app.setAppUserModelId('Blaze.Workspace');
    activityFile=path.join(app.getPath('userData'),'activity.json');
    sessionsFile=path.join(app.getPath('userData'),'activity-sessions.json');
    try{activity=JSON.parse(fs.readFileSync(activityFile,'utf8'));}catch{activity={};}
    try{sessions=JSON.parse(fs.readFileSync(sessionsFile,'utf8'));if(!Array.isArray(sessions))sessions=[];}catch{sessions=[];}
    app.on('web-contents-created',(_,contents)=>contents.session.setPermissionRequestHandler((_,permission,callback)=>callback(false)));
    createMain();
    tray=new Tray(path.join(root,'assets/icon-v2.ico'));tray.setToolTip('Blaze — Ваш день. Ваш ритм.');
    tray.setContextMenu(Menu.buildFromTemplate([{label:'Открыть Blaze',click:()=>{main.show();main.focus();}},{label:'Перезапустить Blaze',click:()=>{quitting=true;app.relaunch();app.quit();}},{type:'separator'},{label:'Завершить Blaze',click:()=>{quitting=true;app.quit();}}]));
    tray.on('double-click',()=>{main.show();main.focus();});
    startTracker();
    setInterval(()=>broadcastFocus(focus.tick()),1000);
    setInterval(()=>{saveActivity();if(main&&!main.isDestroyed()){main.webContents.send('activity:data',activity);main.webContents.send('activity:sessions',sessions);}for(const {win,data} of widgets.values())if(['apps','activity'].includes(data.type)&&data.sync){data.activity=activity;win.webContents.send('widget:data',data);}},15000);
    setInterval(()=>{const now=Date.now();for(const reminder of reminders.values())if(now>=reminder.next){notify(reminder.title,reminder.body);reminder.next=now+reminder.interval*60000;}},5000);
  });
}
ipcMain.handle('widget:show',(event,data)=>{if(!isMain(event))throw new Error('Not permitted');openWidget(data);return true;});
ipcMain.on('widget:hide',(event,id)=>{if(isMain(event))widgets.get(id)?.win.close();});
ipcMain.on('widget:sync',(event,{widget,force})=>{
  if(!isMain(event))return;
  try{const data=validatedWidget(widget),entry=widgets.get(data.id);if(entry&&(entry.data.sync||force)){const sizeChanged=entry.data.size!==data.size;entry.data={...data,activity};entry.win.setAlwaysOnTop(data.pin);if(sizeChanged)entry.win.setSize(...widgetSize(data));entry.win.webContents.send('widget:data',entry.data);}}catch{}
});
ipcMain.handle('widget:get',event=>{for(const entry of widgets.values())if(entry.win.webContents.id===event.sender.id)return entry.data;return null;});
ipcMain.handle('widget:pin',(event,pinned)=>{
  if(typeof pinned!=='boolean')throw new Error('Invalid pin state');
  for(const [id,entry] of widgets)if(entry.win.webContents.id===event.sender.id){
    entry.win.setAlwaysOnTop(pinned);
    entry.win.setMovable(true);
    entry.data.pin=entry.win.isAlwaysOnTop();
    if(main&&!main.isDestroyed())main.webContents.send('widget:changed',{id,patch:{pin:entry.data.pin}});
    return entry.data.pin;
  }
  throw new Error('Widget window not found');
});
ipcMain.on('widget:change',(event,patch)=>{
  for(const [id,entry] of widgets)if(entry.win.webContents.id===event.sender.id && main&&!main.isDestroyed()){
    const clean={};if(Array.isArray(patch?.tasks))clean.tasks=patch.tasks.slice(0,100).map(t=>({text:String(t.text||'').slice(0,300),done:!!t.done}));if(typeof patch?.body==='string')clean.body=patch.body.slice(0,20000);
    Object.assign(entry.data,clean);main.webContents.send('widget:changed',{id,patch:clean});
  }
});
ipcMain.handle('activity:get',event=>isMain(event)?activity:{});
ipcMain.handle('activity:sessions:get',event=>isMain(event)?sessions:[]);
ipcMain.handle('focus:get',event=>isMain(event)||[...widgets.values()].some(e=>e.win.webContents.id===event.sender.id)?focus.snapshot():null);
ipcMain.handle('focus:command',(event,{command,minutes})=>{if(!isMain(event)&&![...widgets.values()].some(e=>e.win.webContents.id===event.sender.id&&e.data.type==='focus'))throw new Error('Not permitted');if(!['start','pause','add','stop'].includes(command))throw new Error('Invalid focus command');return broadcastFocus(focus.command(command,minutes));});
ipcMain.on('widget:action',(event,action)=>{for(const [id,entry] of widgets)if(entry.win.webContents.id===event.sender.id&&['route','days','activity','edit'].includes(action)&&main&&!main.isDestroyed()){main.show();main.focus();main.webContents.send('widget:action',{id,action});}});
ipcMain.on('reminders:set',(event,list)=>{
  if(!isMain(event)||!Array.isArray(list))return;
  const ids=new Set();for(const r of list.slice(0,100)){if(typeof r.id!=='string')continue;ids.add(r.id);const interval=Math.max(1,Math.min(1440,Number(r.interval)||40)),existing=reminders.get(r.id);reminders.set(r.id,{title:String(r.title||'Забота о себе').slice(0,100),body:String(r.body||'Время перерыва').slice(0,1000),interval,next:existing&&existing.interval===interval?existing.next:Date.now()+interval*60000});}
  for(const id of reminders.keys())if(!ids.has(id))reminders.delete(id);
});
ipcMain.on('notify',(event,data)=>{if(isMain(event))notify(data?.title||'Blaze',data?.body||'');});
ipcMain.on('window:control',(event,action)=>{const win=BrowserWindow.fromWebContents(event.sender);if(!win)return;if(action==='close')win.close();if(action==='minimize')win.minimize();if(action==='maximize')win.isMaximized()?win.unmaximize():win.maximize();});
app.on('before-quit',()=>{quitting=true;tracker?.kill();activityDirty=true;saveActivity();});
app.on('window-all-closed',()=>app.quit());


