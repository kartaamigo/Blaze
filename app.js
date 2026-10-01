'use strict';
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const uid = () => crypto.randomUUID();
const dateKey = (date = new Date()) => new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
const formatTime = seconds => `${Math.floor(seconds/3600)} ч ${String(Math.floor(seconds%3600/60)).padStart(2,'0')} м`;
const COLORS = ['#b5ff24','#272b20','#f3f1e7','#bea7ff','#ffb57c'];
const {normalize:normalizeColor,theme:colorTheme}=window.BlazeColors;
function palette(){return [...new Set([...COLORS,...(state.customColors||[])])];}
function noteStyle(color){const t=colorTheme(color);return `--note:${t.background};--note-text:${t.text};--note-muted:${t.muted};--note-border:${t.border};color:${t.text};`;}
const TYPES = {note:['Заметка','note','Идеи, списки и всё, что важно.'],route:['Быстрый маршрут','route','Дом, работа и любимые места.'],activity:['Активность за неделю','chart','Ваше время и рабочий ритм.'],apps:['Сегодня в программах','clock','Время в приложениях, без лишних деталей.'],health:['Забота о себе','heart','Вода, движение и отдых для глаз.'],focus:['Время фокус','clock','Одно дело. Всё ваше внимание.'],days:['Рабочие дни','calendar','Дни работы и цель месяца.']};
const defaults = () => ({version:1,name:'Александр',goal:22,dailyGoal:5,customColors:[],workDays:[],dayEntries:{},focusSessions:[],focusSeconds:{},route:{from:'',to:'',mode:'mt'},widgets:[
  {id:'route-main',type:'route',title:'Быстрый маршрут',size:'medium',color:COLORS[0],desktop:false,pin:false,sync:true},
  {id:'note-main',type:'note',title:'Быстрая заметка',headline:'Идеи не должны ждать.',body:'',tasks:[{text:'Собрать референсы для проекта',done:true},{text:'Продумать главный экран',done:false},{text:'Отправить макет на ревью',done:false}],size:'medium',color:COLORS[0],desktop:false,pin:false,sync:true,updated:Date.now()},
  {id:'activity-main',type:'activity',title:'Активность за неделю',size:'medium',color:COLORS[0],desktop:false,pin:false,sync:true},
  {id:'apps-main',type:'apps',title:'Сегодня в программах',size:'medium',color:COLORS[0],desktop:false,pin:false,sync:true}
]});
let state;
const designPreview=window.blazeDesignPreview;
try { const saved = designPreview?null:JSON.parse(localStorage.getItem('blaze-state')); state = saved?.version === 1 && Array.isArray(saved.widgets) ? {...defaults(),...saved} : defaults(); }
catch { state = defaults(); }
if(designPreview){for(let day=1;day<=24;day++){const d=new Date(2026,8,day);if(d.getDay()!==0&&d.getDay()!==6){const key=`2026-09-${String(day).padStart(2,'0')}`;state.workDays.push(key);state.dayEntries[key]={hours:7,comment:'Дизайн экранов Blaze'};}}state.widgets[0].desktop=true;state.widgets[1].desktop=true;}
state.dayEntries=state.dayEntries&&typeof state.dayEntries==='object'?state.dayEntries:{};
state.focusSessions=Array.isArray(state.focusSessions)?state.focusSessions:[];
state.customColors=Array.isArray(state.customColors)?[...new Set(state.customColors.map(normalizeColor).filter(Boolean))]:[];
let page = 'widgets', filter = 'all', search = '', selected = state.widgets.find(w=>w.type==='note')?.id, calendarMonth = new Date(new Date().toLocaleString('en-US',{timeZone:'Europe/Moscow'}));
calendarMonth.setDate(1);
let nativeActivity = designPreview?.activity||{}, nativeSessions=designPreview?.sessions||[], focusTimer = null, focusEnd = 0, focusDuration = 25, currentFocus = null;
let activityPeriod='week',activityEnd=dateKey(),selectedDay=dateKey();
let modalCleanup = null, toastTimeout, dirty = false;
const desktop = designPreview?null:window.blaze;
let nativeFocus=null;
function receiveFocus(snapshot){if(!snapshot)return;nativeFocus=snapshot;focusEnd=snapshot.end;$$('[data-timer]').forEach(e=>e.textContent=timerText());if($('#focus-duration')){const running=!!snapshot.running;$('#focus-duration').disabled=running;const start=$('[data-action="start-focus"]'),stop=$('[data-action="stop-focus"]');if(start)start.hidden=running;if(stop)stop.hidden=!running&&!snapshot.paused;}}
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimeout); toastTimeout = setTimeout(()=>$('#toast').classList.remove('visible'),4200); }
function save(sync = true) {
  try { if(!designPreview)localStorage.setItem('blaze-state',JSON.stringify(state)); dirty=false; }
  catch { dirty=true; toast('Не удалось сохранить изменения. Проверьте свободное место.'); }
  if(desktop && sync) for(const widget of state.widgets) if(widget.desktop && widget.sync) desktop.syncWidget({...widget,route:state.route,workDays:state.workDays,goal:state.goal});
  desktop?.setReminders(state.widgets.filter(w=>w.type==='health' && w.enabled !== false).map(w=>({id:w.id,title:w.title,body:w.body || 'Время сделать небольшой перерыв.',interval:w.interval || 40})));
  renderSummary();
}
function mapURL(route = state.route, embedded = true) {
  const url = new URL(embedded ? 'https://yandex.ru/map-widget/v1/' : 'https://yandex.ru/maps/213/moscow/');
  url.searchParams.set('ll','37.617635,55.755814');url.searchParams.set('z','11');url.searchParams.set('l','map');url.searchParams.set('theme','dark');
  if(route.from.trim() && route.to.trim()){url.searchParams.set('rtext',`${route.from.trim()}~${route.to.trim()}`);url.searchParams.set('rtt',route.mode);}
  return url.toString();
}
function renderSummary() {
  const key = dateKey(), activity = nativeActivity[key] || {}, tracked = Object.values(activity).reduce((a,b)=>a+b,0);
  const total = desktop||designPreview ? tracked : (state.focusSeconds[key] || 0);
  $('#total-time').textContent = formatTime(total);
  $('#tracking-label').textContent = designPreview?'↗ 12% к прошлой неделе':desktop ? 'Учёт активного окна включён' : 'Время ваших фокус-сессий';
  const days = state.workDays.filter(d=>d.startsWith(key.slice(0,7))).length;
  $('#days-count').textContent = days;$('#days-goal').textContent = state.goal;
  $('#days-progress').style.width = `${Math.min(days/state.goal*100,100)}%`;
  $('#desktop-count').textContent = `${state.widgets.filter(w=>w.desktop).length} ${plural(state.widgets.filter(w=>w.desktop).length,['виджет','виджета','виджетов'])}`;
  if(designPreview)$('#desktop-count').textContent='5 виджетов';
  $('#profile-name').textContent = state.name;$('.avatar').textContent = state.name.charAt(0).toUpperCase();
}
function plural(n, forms){return n%100>=11&&n%100<=14?forms[2]:n%10===1?forms[0]:n%10>=2&&n%10<=4?forms[1]:forms[2];}
function chartHTML() {
  const keys=[],today=new Date();
  const day = Number(new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Moscow',weekday:'short'}).format(today).replace(/.*/,m=>({Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6,Sun:7}[m])));
  for(let i=0;i<7;i++){const d=new Date(today);d.setDate(d.getDate()-day+1+i);keys.push(dateKey(d));}
  let values=keys.map(k=>desktop||designPreview?Object.values(nativeActivity[k]||{}).reduce((a,b)=>a+b,0):(state.focusSeconds[k]||0));
  if(designPreview)values=[16200,21600,14400,28800,32400,9000,6300];
  const max=Math.max(...values,1),sum=values.reduce((a,b)=>a+b,0);
  return `<div class="chart-content"><div class="chart-caption"><strong>${designPreview?'32 ч 18 м':formatTime(sum)}</strong><p>${designPreview?'На 4 ч больше<br>прошлой недели':'Каждый день —<br>в вашем ритме'}</p><small>${designPreview?'↗ 14%':sum?'Ваше время в работе':'Всё начинается с первого дня'}</small></div><div class="bar-chart" role="img" aria-label="Время работы по дням недели">${values.map((v,i)=>`<div class="bar-column ${(designPreview?i===4:keys[i]===dateKey())?'today':''}" title="${keys[i]}: ${formatTime(v)}"><i style="height:${Math.max(5,v/max*104)}px"></i><small>${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'][i]}</small></div>`).join('')}</div></div>`;
}
function appsHTML() {
  const entries=Object.entries(nativeActivity[dateKey()]||{}).sort((a,b)=>b[1]-a[1]).slice(0,3);
  if(!entries.length)return `<div class="empty-apps">${icon('clock')}<div><strong>${desktop?'Здесь появятся ваши приложения':'Учёт времени в приложениях'}</strong><p>${desktop?'Поработайте в любой программе —<br>Blaze начнёт считать время.':'Откройте приложение Blaze для Windows.<br>В браузере доступны фокус-сессии.'}</p></div></div>`;
  const max=entries[0][1], colors=['#bea7ff','#8fc8ef','#eeeee1'];
  return `<div class="apps-list">${entries.map(([name,seconds],i)=>`<div class="app-row"><span class="app-icon" style="color:${colors[i]}">${esc(name.charAt(0).toUpperCase())}</span><div class="app-detail">${esc(name)}<div class="app-bar"><i style="width:${seconds/max*100}%;background:${colors[i]}"></i></div></div><span class="app-time">${formatTime(seconds)}</span></div>`).join('')}</div>`;
}
function widgetHTML(w) {
  let body='', headingAction = `<button class="icon-button" data-menu="${esc(w.id)}" aria-label="Настройки ${esc(w.title)}">···</button>`;
  if(w.type==='route') {
    headingAction=`<button class="icon-button" data-action="route" aria-label="Открыть карту">${icon('arrow')}</button>`;
    body=`<button class="mini-map route-art" data-action="route" aria-label="Открыть маршрут на интерактивной карте"><img src="assets/route-art.png" alt=""><span class="route-time">${designPreview?'18 мин':'Маршрут'}</span></button><div class="route-bottom"><div><div class="route-endpoints">Дом <span>→</span> Офис</div><small>${designPreview?'4,2 км · на машине':state.route.from && state.route.to ? 'Ваш сохранённый маршрут' : 'Укажите домашний и рабочий адрес'}</small></div><button class="primary" data-action="route">${icon('route')}Построить</button></div><div class="desktop-status"><i></i>${w.desktop?'На рабочем столе':'Ваш ежедневный маршрут'}</div>`;
  } else if(w.type==='note') {
    body=`<h3>${esc(w.headline)}</h3>${w.body?`<p class="note-body">${esc(w.body)}</p>`:''}<div class="task-list">${(w.tasks||[]).map((t,i)=>`<label class="task-row"><input type="checkbox" data-task="${esc(w.id)}" data-index="${i}" ${t.done?'checked':''}><span>${esc(t.text)}</span></label>`).join('')}</div><div class="note-footer"><span>${designPreview?'Изменено 5 минут назад':w.desktop?(w.pin?'Закреплена поверх окон':'На вашем рабочем столе'):'Сохранено в вашем пространстве'}</span><button data-desktop="${esc(w.id)}" aria-label="Вывести заметку на экран" title="Вывести на экран">${icon('monitor')}</button></div>`;
  } else if(w.type==='activity') { headingAction='<span class="period-pill">7 дней</span>';body=chartHTML(); }
  else if(w.type==='apps'){headingAction=`<button class="icon-button" data-page="activity" aria-label="Вся активность">${icon('arrow')}</button>`;body=appsHTML();}
  else if(w.type==='health') body=`<div class="health-big">Каждые ${Number(w.interval)||40} мин</div><p>${esc(w.body || 'Небольшой перерыв, глоток воды и отдых для глаз.')}</p><label class="toggle-row">Напоминания ${w.enabled===false?'выключены':'включены'}<input class="toggle" type="checkbox" data-health="${esc(w.id)}" ${w.enabled===false?'':'checked'}></label>`;
  else if(w.type==='days')body=`<div class="days-widget-total"><strong>${state.workDays.filter(d=>d.startsWith(dateKey().slice(0,7))).length}</strong><span>дней работы</span></div><p class="days-widget-goal">Цель: ${state.goal} дня</p><button class="primary" data-page="days">${icon('plus')}Отметить день</button>`;
  else if(w.type==='focus')body=`<div class="timer" data-timer>${timerText()}</div><div class="focus-controls"><button class="primary" data-action="focus">${icon('clock')}${focusEnd?'Открыть фокус':'Начать фокус'}</button></div>`;
  const desktopAction=`<button class="icon-button widget-desktop-action" data-select="${esc(w.id)}" aria-label="Настроить и вывести ${esc(w.title)} на экран" title="Настроить и вывести на экран">${icon('monitor')}</button>`;
  return `<article class="widget ${w.type}-widget size-${esc(w.size)}" data-widget="${esc(w.id)}" style="--widget-accent:${normalizeColor(w.color)||COLORS[0]};${w.type==='note'?noteStyle(w.color):''}"><div class="widget-heading">${icon(TYPES[w.type][1])}<span>${esc(w.title)}</span>${desktopAction}${headingAction}</div>${body}</article>`;
}
function renderContent() {
  renderPageHeader();
  const container=$('#content');container.className=page==='activity'?'analytics-layout':page==='days'?'workdays-layout':'widgets-grid';container.classList.toggle('list-layout',state.listView===true && page==='widgets');
  $('.widget-toolbar').hidden=page!=='widgets';
  $('#section-title').textContent=({widgets:'Мои виджеты',library:'Библиотека виджетов',activity:'Ваш рабочий ритм',days:'Рабочие дни',settings:'Ваше пространство'})[page];
  if(page==='widgets') {
    const widgets=state.widgets.filter(w=>(filter==='all'||(filter==='desktop'?w.desktop:!w.desktop)) && `${w.title} ${w.headline||''} ${w.body||''}`.toLowerCase().includes(search.toLowerCase()));
    container.innerHTML=widgets.length?widgets.map(widgetHTML).join(''):`<div class="empty-state">${icon('grid')}<h3>${search?'Ничего не найдено':'Здесь будут ваши виджеты'}</h3><p>${search?'Попробуйте другое название.':'Создайте виджет или добавьте его на рабочий стол.'}</p><button class="primary" data-action="create">Создать виджет</button></div>`;
  } else if(page==='library')container.innerHTML=Object.entries(TYPES).map(([type,[title,i,desc]])=>`<article class="widget library-card">${icon(i)}<h3>${title}</h3><p>${desc}</p><button class="secondary" data-create="${type}">${icon('plus')}Добавить виджет</button></article>`).join('');
  else if(page==='activity')renderActivity();
  else if(page==='days')renderCalendar();
  else container.innerHTML=`<div class="widget full-width"><form id="settings-form" class="settings-form"><h3>Личное пространство</h3><label class="field-label" for="settings-name">Ваше имя</label><input class="form-input" id="settings-name" maxlength="50" value="${esc(state.name)}" required><label class="field-label" for="settings-goal">Цель: рабочих дней в месяц</label><input class="form-input" id="settings-goal" type="number" min="1" max="31" value="${state.goal}" required><div class="info-block">Москва и область · Время Москвы<br>Ваши заметки и настройки сохраняются на этом устройстве.<br>${desktop?'Виджеты открываются отдельными окнами. Для напоминаний оставьте Blaze работающим в трее.':'Для виджетов поверх окон и учёта программ запустите версию Blaze для Windows.'}</div><button type="submit" class="primary">Сохранить настройки</button></form><button class="secondary" style="margin-top:20px" data-action="export">Экспортировать мои данные</button></div>`;
}

function renderPageHeader(){
  document.body.dataset.page=page;
  $('.summary').hidden=['activity','days'].includes(page);$('.section-top').hidden=['activity','days'].includes(page);
  const titles={widgets:['Ваш день. Ваш ритм.','Всё важное — в виджетах, которые вы создаёте сами.'],activity:['Понимайте, куда уходит время.','Приложения, сессии и ваш прогресс — в одном месте.'],days:['Каждый день — часть прогресса.','Отмечайте работу, добавляйте часы и следите за целью месяца.'],library:['Виджеты в вашем ритме.','Выберите то, что поможет сделать день вашим.'],settings:['Ваше пространство.','Настройте Blaze под себя.']};
  $('.heading-row h1').textContent=titles[page][0];$('.heading-row p').textContent=titles[page][1];
  $('.topline>span').textContent=page==='widgets'?'Рабочее пространство':`Рабочее пространство / ${({activity:'Активность',days:'Рабочие дни',library:'Библиотека',settings:'Настройки'})[page]}`;
  const button=$('.create-button');button.hidden=page==='settings';
  if(page==='activity'){const keys=window.BlazeAnalytics.keys(activityEnd,activityPeriod),first=keys[0];button.className='date-range-button create-button';button.dataset.action='activity-range';button.innerHTML=`<span>${rangeLabel(first,activityEnd)}</span>${icon('calendar')}`;}
  else{button.className='primary create-button';button.dataset.action=page==='days'?'mark-day':'create';button.innerHTML=`${icon('plus')}${page==='days'?'Отметить день':'Создать виджет'}`;}
}
function rangeLabel(from,to){
  const a=new Date(from.length===7?from+'-01T12:00:00+03:00':from+'T12:00:00+03:00'),b=new Date(to+'T12:00:00+03:00');
  return `${a.getDate()}–${b.toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'})}`.replace(' г.','');
}
function activityStats(){
  const data=window.BlazeAnalytics.aggregate(nativeActivity,state.focusSeconds,activityEnd,activityPeriod,!!(desktop||designPreview));
  if(designPreview&&activityPeriod==='week'){data.total=116280;data.average=116280/7;data.totals=[21600,19800,3600,5760,19080,23400,23040];data.apps={Figma:58140,'VS Code':38760,Safari:11640,'Другие':7740};}
  return data;
}
function renderActivity(){
  const stats=activityStats(),focus=[...state.focusSessions,...nativeSessions.filter(s=>s.app==='Фокус')].filter(s=>stats.keys.includes(activityPeriod==='year'?dateKey(new Date(s.started)).slice(0,7):dateKey(new Date(s.started)))),count=designPreview?12:focus.length,completed=designPreview?10:focus.filter(s=>s.completed).length;
  const dayLabel=k=>new Date(k+'T12:00:00+03:00').toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
  const maxHours=Math.max(8,Math.ceil(Math.max(...stats.totals,1)/3600/2)*2),colors=['#bea7ff','#80bae1','#d9dfcf','#9ba984'];
  const entries=Object.entries(stats.apps).sort((a,b)=>b[1]-a[1]),apps=entries.length>4?[...entries.slice(0,3),['Другие',entries.slice(3).reduce((s,e)=>s+e[1],0)]]:entries;
  const sessions=[...nativeSessions,...state.focusSessions].filter(s=>stats.keys.includes(activityPeriod==='year'?dateKey(new Date(s.started)).slice(0,7):dateKey(new Date(s.started)))).sort((a,b)=>new Date(b.started)-new Date(a.started)).slice(0,6);
  const displayed=designPreview?nativeSessions:sessions;
  const clock=stamp=>new Date(stamp).toLocaleTimeString('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit'});
  $('#content').innerHTML=`<section class="page-metrics"><article><span>Время в работе</span><strong>${formatTime(stats.total)}</strong><small class="lime-text">${designPreview?'↗ 14% к прошлой неделе':stats.total?'Ваше время за выбранный период':'Начните свой первый рабочий день'}</small></article><article><span>Среднее за день</span><strong>${formatTime(stats.average)}</strong><small>Цель: ${state.dailyGoal||5} часов в день</small></article><article><span>Фокус-сессии</span><strong>${count}</strong><small>${completed} завершены без пауз</small></article></section><article class="analytics-chart design-panel"><div class="panel-heading"><h2>Время по дням</h2><div class="chart-periods">${[['week','7 дней'],['month','Месяц'],['year','Год']].map(([value,label])=>`<button data-period="${value}" class="${activityPeriod===value?'active':''}" aria-pressed="${activityPeriod===value}">${label}</button>`).join('')}</div></div><p class="chart-range">${rangeLabel(stats.keys[0],activityEnd).replace(/ \d{4}$/,'')}</p><div class="large-chart"><div class="chart-axis">${[maxHours,maxHours*.75,maxHours*.5,maxHours*.25,0].map(n=>`<span>${n?n+' ч':'0'}</span>`).join('')}</div><div class="chart-plot" style="--column-count:${stats.keys.length}"><div class="chart-lines">${'<i></i>'.repeat(5)}</div>${stats.totals.map((seconds,i)=>`<div class="large-chart-column ${i===stats.totals.length-1?'highlighted':''}"><span class="chart-bar-label">${formatTime(seconds)}</span><i style="height:${Math.max(1,seconds/(maxHours*3600)*100)}%"></i><small>${activityPeriod==='year'?new Date(stats.keys[i]+'-01T12:00:00+03:00').toLocaleDateString('ru-RU',{month:'short'}):dayLabel(stats.keys[i])}</small></div>`).join('')}</div></div></article><article class="analytics-apps design-panel"><div class="panel-heading"><h2>Приложения</h2><small>Доля</small></div><div class="app-distribution">${apps.length?apps.map(([name,seconds],i)=>`<div class="distribution-row"><span class="app-icon" style="color:${colors[i]}">${esc(name==='Другие'?'Д':name.charAt(0).toUpperCase())}</span><div><div class="distribution-name"><span>${esc(name)}</span><small>${Math.round(seconds/Math.max(1,stats.total)*100)}%</small></div><p>${formatTime(seconds)}</p><div class="distribution-bar"><i style="width:${seconds/Math.max(1,stats.total)*100}%;background:${colors[i]}"></i></div></div></div>`).join(''):`<div class="distribution-empty">${icon('clock')}<p>${desktop?'Поработайте в программе —<br>её время появится здесь.':'Учёт программ доступен<br>в приложении для Windows.'}</p></div>`}</div></article><article class="sessions-panel design-panel"><div class="panel-heading"><h2>Последние сессии</h2><small>${activityEnd===dateKey()?'Сегодня':'Выбранный период'}</small></div><table class="sessions-table"><thead><tr><th>Приложение</th><th>Задача</th><th>Время</th><th>Длительность</th></tr></thead><tbody>${displayed.length?displayed.map((s,i)=>`<tr><td><i style="background:${colors[i%colors.length]}"></i>${esc(s.app)}</td><td>${esc(s.task||'Работа в программе')}</td><td>${clock(s.started)}–${clock(s.ended)}</td><td>${formatTime(s.seconds)}</td></tr>`).join(''):'<tr><td colspan="4" class="sessions-empty">Сессии появятся, когда вы начнёте работать в программе или запустите фокус.</td></tr>'}</tbody></table></article>`;
}
function openActivityRange(){openModal(`${modalHeading('Период активности')}<form id="activity-range-form"><label class="field-label" for="activity-end">Последний день периода</label><input class="form-input" type="date" id="activity-end" value="${activityEnd}" required><div class="modal-actions"><button class="primary">Показать</button></div></form>`);}
function openGoal(){openModal(`${modalHeading('Цель месяца')}<form id="goal-form"><label class="field-label" for="new-goal">Сколько рабочих дней запланировать</label><input class="form-input" id="new-goal" type="number" min="1" max="31" value="${state.goal}" required><div class="modal-actions"><button class="primary">Сохранить цель</button></div></form>`);}
function renderCalendar(){
  const year=calendarMonth.getFullYear(),month=calendarMonth.getMonth(),monthKey=`${year}-${String(month+1).padStart(2,'0')}`,count=new Date(year,month+1,0).getDate(),first=(new Date(year,month,1).getDay()+6)%7;
  const marked=state.workDays.filter(d=>d.startsWith(monthKey)),hours=marked.reduce((s,key)=>s+(Number(state.dayEntries[key]?.hours)||0),0),remaining=Math.max(0,state.goal-marked.length),percent=Math.min(100,Math.round(marked.length/state.goal*100)),chosen=state.dayEntries[selectedDay]||{hours:7,comment:designPreview?'Дизайн экранов Blaze':''};
  const chosenDate=new Date(selectedDay+'T12:00:00+03:00'),isToday=selectedDay===dateKey(),isMarked=state.workDays.includes(selectedDay);
  const monthTitle=calendarMonth.toLocaleDateString('ru-RU',{month:'long',year:'numeric'}).replace(' г.','').replace(/^./,s=>s.toUpperCase());
  $('#content').innerHTML=`<section class="page-metrics"><article><span>Отмечено в ${['январе','феврале','марте','апреле','мае','июне','июле','августе','сентябре','октябре','ноябре','декабре'][month]}</span><strong>${marked.length} ${plural(marked.length,['день','дня','дней'])}</strong><small>Из ${state.goal} рабочих дней</small></article><article><span>Всего отработано</span><strong>${Number(hours.toFixed(1))} ч</strong><small>В среднем ${marked.length?Number((hours/marked.length).toFixed(1)):0} часов в день</small></article><article><span>До цели</span><strong>${remaining} ${plural(remaining,['день','дня','дней'])}</strong><small class="lime-text">${percent}% месячной цели</small></article></section><article class="calendar-panel design-panel"><div class="panel-heading"><h2>${monthTitle}</h2><div class="month-arrows"><button data-month="-1" aria-label="Предыдущий месяц">‹</button><button data-month="1" aria-label="Следующий месяц">›</button></div></div><div class="work-calendar">${['ПН','ВТ','СР','ЧТ','ПТ','СБ','ВС'].map(d=>`<span class="calendar-weekday">${d}</span>`).join('')}${'<span></span>'.repeat(first)}${Array.from({length:count},(_,i)=>{const key=`${monthKey}-${String(i+1).padStart(2,'0')}`,marked=state.workDays.includes(key),weekend=(i+first)%7>=5,today=key===dateKey();return `<button class="work-calendar-day ${marked?'marked':''} ${weekend?'weekend':''} ${key===selectedDay?'selected':''}" data-day="${key}" aria-label="${i+1} ${calendarMonth.toLocaleDateString('ru-RU',{month:'long'})}${marked?', рабочий день':''}" aria-pressed="${key===selectedDay}"><span>${i+1}${marked?icon('check'):''}</span><small>${today?'Сегодня':marked?`${Number(state.dayEntries[key]?.hours)||0} ч`:weekend?'Выходной':''}</small></button>`;}).join('')}</div><div class="calendar-legend"><span><i></i>Рабочий день</span><span><i></i>Без отметки</span><small>Нажмите на день, чтобы изменить</small></div></article><div class="day-side"><article class="day-detail design-panel"><span class="today-badge">${isToday?'СЕГОДНЯ':'ВЫБРАННЫЙ ДЕНЬ'}</span><h2>${chosenDate.toLocaleDateString('ru-RU',{day:'numeric',month:'long'})}</h2><p>${chosenDate.toLocaleDateString('ru-RU',{weekday:'long'}).replace(/^./,s=>s.toUpperCase())} · ${designPreview||isMarked?'рабочий день':'без отметки'}</p><form id="workday-form" data-date="${selectedDay}"><label class="field-label" for="work-hours">Сколько вы поработали</label><div class="day-field">${icon('clock')}<input id="work-hours" type="number" min="0" max="24" step="0.25" value="${chosen.hours}" aria-label="Отработано часов" required><span>ч</span></div><label class="field-label" for="work-comment">Комментарий</label><div class="day-field">${icon('note')}<input id="work-comment" value="${esc(chosen.comment)}" placeholder="Над чем работали" maxlength="300" aria-label="Комментарий"></div><button class="primary">${icon('check')}<span>${isMarked?'Сохранить изменения':'Отметить рабочий день'}</span></button>${isMarked?'<button type="button" class="unmark-day" data-action="unmark-day">Снять отметку</button>':''}</form></article><article class="month-goal"><div>${icon('calendar')}<strong>Цель месяца</strong></div><div class="goal-numbers"><strong>${marked.length}</strong><span>/ ${state.goal} дня</span><small>${percent}%</small></div><div class="progress-track"><i style="width:${percent}%"></i></div><p>${remaining?`Ещё ${remaining} ${plural(remaining,['отметка','отметки','отметок'])} до вашей цели.`:'Цель достигнута. Отличный ритм!'}</p><button data-action="change-goal">Изменить цель →</button></article></div>`;
}
function saveWorkDay(form){const key=form.dataset.date;state.dayEntries[key]={hours:Number($('#work-hours').value),comment:$('#work-comment').value.trim()};if(!state.workDays.includes(key))state.workDays.push(key);save();renderCalendar();toast('Рабочий день сохранён.');}
function previewHTML(w){
  if(w.type==='note')return `<div class="preview-note" style="${noteStyle(w.color)}"><div class="preview-heading">${icon('note')}${esc(w.title)}</div><strong>${esc(w.headline)}</strong>${w.body?`<p>${esc(w.body.slice(0,80))}</p>`:(w.tasks||[]).slice(0,2).map(t=>`<p>${t.done?'☑':'▫'} ${esc(t.text)}</p>`).join('')}<small>blaze</small></div>`;
  return `<div style="text-align:center;color:${normalizeColor(w.color)||COLORS[0]}">${icon(TYPES[w.type][1])}<h3 style="margin:15px 0;color:var(--text)">${esc(w.title)}</h3><p style="color:var(--muted);font-size:12px">${TYPES[w.type][2]}</p></div>`;
}
function renderEditor(){
  const w=state.widgets.find(w=>w.id===selected),editor=$('#editor');
  editor.classList.toggle('closed',!w);$('.app-shell').classList.toggle('editor-closed',!w);
  if(!w){editor.innerHTML='';return;}
  editor.innerHTML=`<div class="editor-header">Настроить виджет<button data-action="close-editor" aria-label="Закрыть настройки">${icon('close')}</button></div><span class="type-badge">${TYPES[w.type][0]}</span><div class="field-label uppercase">Предпросмотр</div><div class="preview-stage">${previewHTML(w)}</div>${['note','health'].includes(w.type)?`<button class="edit-content-link" data-edit="${esc(w.id)}">Редактировать содержимое</button>`:''}<h3>Размер</h3><div class="size-options">${[['small','Маленький'],['medium','Средний'],['large','Большой']].map(([size,label])=>`<button class="size-option ${w.size===size?'active':''}" data-size="${size}" aria-pressed="${w.size===size}"><i></i>${label}</button>`).join('')}</div><h3>Оформление</h3><div class="color-options">${palette().map((color,i)=>`<button class="color-swatch" style="background:${color};color:${colorTheme(color).text}" data-color="${color}" aria-label="${['Лайм','Графит','Молочный','Лавандовый','Персиковый'][i]||`Свой цвет ${color}`}" title="${color}" aria-pressed="${w.color===color}">${w.color===color?icon('check'):''}</button>`).join('')}<button class="color-swatch add-color" data-action="custom-color" aria-label="Добавить свой цвет" title="Добавить свой цвет">${icon('plus')}</button></div><label class="field-label" for="widget-title">Название</label><input class="form-input" id="widget-title" maxlength="70" value="${esc(w.title)}"><div class="editor-toggles"><label class="toggle-row">Закрепить поверх окон<input class="toggle" type="checkbox" data-setting="pin" ${w.pin?'checked':''}></label><label class="toggle-row">Показывать на рабочем столе<input class="toggle" type="checkbox" data-setting="desktop" ${w.desktop?'checked':''}></label><label class="toggle-row">Синхронизировать изменения<input class="toggle" type="checkbox" data-setting="sync" ${w.sync?'checked':''}></label></div><div class="editor-bottom"><div class="editor-hint">${icon('monitor')}<span>${desktop||designPreview?'Изменения появятся на вашем экране':'Отдельные окна доступны в версии для Windows'}</span></div><button class="primary" data-action="desktop">${icon(w.desktop?'monitor':'plus')}<span>${designPreview?'Добавить на рабочий стол':w.desktop?'Открыть на рабочем столе':'Добавить на рабочий стол'}</span></button></div>`;
}
function setPage(next){const previous=page;page=next;if(page==='widgets'&&previous!==page&&innerWidth>=1250)selected=state.widgets.find(w=>w.type==='note')?.id;$$('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));renderContent();if(page!=='widgets'){selected=null;renderEditor();}location.hash=next;}
function openModal(html, kind='') { const modal=$('#modal');if(modal.open)closeModal();modal.className=kind;$('#modal-content').innerHTML=html;modal.showModal(); }
function closeModal(){modalCleanup?.();modalCleanup=null;$('#modal').close();}
function modalHeading(title){return `<div class="modal-heading"><h2>${title}</h2><button data-action="close-modal" aria-label="Закрыть">${icon('close')}</button></div>`;}
function openCustomColor(){
  const w=state.widgets.find(w=>w.id===selected);if(!w)return;
  const color=normalizeColor(w.color)||COLORS[0];
  openModal(`${modalHeading('Ваш цвет')}<p class="modal-subtitle">Выберите оттенок или введите его код. Он сохранится в палитре для других виджетов.</p><form id="custom-color-form" data-id="${esc(w.id)}"><div class="custom-color-fields"><label>Выбрать оттенок<input id="custom-color-picker" type="color" value="${color}" aria-label="Выбрать оттенок"></label><label>Код цвета<input id="custom-color-hex" class="form-input" value="${color}" maxlength="7" pattern="#?[a-fA-F0-9]{3}([a-fA-F0-9]{3})?" placeholder="#b5ff24" required aria-label="Код цвета"></label></div><div id="custom-color-preview" class="custom-color-preview" style="${noteStyle(color)}"><strong>Идеи не должны ждать.</strong><span>Ваш новый оттенок · blaze</span></div><div class="modal-actions"><button class="secondary" type="button" data-action="close-modal">Отмена</button><button class="primary" type="submit">Добавить цвет</button></div></form>`);
}
function openCreate(){openModal(`${modalHeading('Что создадим?')}<p class="modal-subtitle">Выберите виджет и задайте ему свой ритм.</p><div class="modal-library">${Object.entries(TYPES).map(([type,[title,i,desc]])=>`<button data-create="${type}">${icon(i)}<strong>${title}</strong><small>${desc}</small></button>`).join('')}</div>`);}
function createWidget(type){
  if(!TYPES[type])return;
  const w={id:uid(),type,title:type==='note'?'Быстрая заметка':TYPES[type][0],size:'medium',color:COLORS[0],pin:false,desktop:false,sync:true,updated:Date.now()};
  if(type==='note'){w.headline='Новая идея.';w.body='';w.tasks=[];}
  if(type==='health'){w.interval=40;w.body='Встаньте, разомнитесь и выпейте воды.';w.enabled=true;}
  state.widgets.push(w);selected=w.id;filter='all';search='';$('#search').value='';closeModal();setPage('widgets');$$('[data-filter]').forEach(b=>b.classList.toggle('active',b.dataset.filter==='all'));save();renderEditor();
  if(type==='note'||type==='health')openEdit(w.id);else if(type==='route')openRoute();else if(type==='focus')openFocus();
}
function openEdit(id){
  const w=state.widgets.find(w=>w.id===id);if(!w)return;
  if(w.type==='route'){openRoute();return;}
  if(w.type==='note'){
    openModal(`${modalHeading('Ваша заметка')}<form id="note-form" data-id="${esc(id)}"><div class="modal-field"><label for="note-headline">Главная мысль</label><input id="note-headline" class="form-input" value="${esc(w.headline)}" maxlength="140" required></div><div class="modal-field"><label for="note-body">Текст заметки</label><textarea id="note-body" class="form-input" placeholder="Запишите то, что важно…" maxlength="20000">${esc(w.body)}</textarea></div><div class="field-label">Список дел</div><div class="note-editor-tasks">${(w.tasks||[]).map(editableTask).join('')}</div><button type="button" class="secondary" style="margin-top:14px" data-action="add-task">${icon('plus')}Добавить пункт</button><div class="modal-actions"><button type="button" class="secondary" data-action="close-modal">Отмена</button><button class="primary" type="submit">Сохранить заметку</button></div></form>`);
  } else if(w.type==='health')openModal(`${modalHeading('Маленькая забота о себе')}<p class="modal-subtitle">${desktop?'Blaze напомнит, пока приложение работает в трее.':'В браузере напоминания работают, пока открыта страница.'}</p><form id="health-form" data-id="${esc(id)}"><div class="modal-field"><label for="health-body">О чём напомнить</label><textarea class="form-input" id="health-body" required maxlength="1000">${esc(w.body)}</textarea></div><div class="modal-field"><label for="health-interval">Интервал в минутах</label><input class="form-input" type="number" min="1" max="1440" id="health-interval" value="${w.interval||40}" required></div><div class="modal-actions"><button class="primary" type="submit">Сохранить напоминание</button></div></form>`);
}
function editableTask(t={text:'',done:false}){return `<div class="editable-task"><input type="checkbox" aria-label="Выполнено" ${t.done?'checked':''}><input class="form-input" value="${esc(t.text)}" placeholder="Новая задача" maxlength="300" aria-label="Текст задачи"><button type="button" data-action="delete-task" aria-label="Удалить пункт">${icon('close')}</button></div>`;}
function openMenu(id){
  const w=state.widgets.find(w=>w.id===id);if(!w)return;
  selected=id;renderEditor();
  openModal(`${modalHeading(esc(w.title))}<div class="delete-actions"><button class="secondary" data-desktop="${esc(id)}">${icon('monitor')}Вывести на экран</button>${['note','health','route'].includes(w.type)?`<button class="secondary" data-edit="${esc(id)}">${icon('note')}Редактировать содержимое</button>`:''}<button class="secondary" data-select="${esc(id)}">${icon('settings')}Настроить виджет</button><button class="secondary danger" data-delete="${esc(id)}">${icon('close')}Удалить виджет</button></div>`);
}
function openRoute(){
  openModal(`${modalHeading('Дом → работа')}<p class="modal-subtitle">Маршруты по Москве и области. Метро, автобусы, МЦД и электрички — в режиме общественного транспорта.</p><form class="route-form" id="route-form"><input class="form-input" id="route-from" value="${esc(state.route.from)}" placeholder="Откуда: домашний адрес" aria-label="Адрес отправления" maxlength="300" required><button type="button" class="swap-button" data-action="swap-route" aria-label="Поменять адреса местами">⇄</button><input class="form-input" id="route-to" value="${esc(state.route.to)}" placeholder="Куда: рабочий адрес" aria-label="Адрес назначения" maxlength="300" required><button class="primary" type="submit">Построить</button></form><div class="transport-options">${[['mt','train','Общественный транспорт'],['auto','car','На машине'],['pd','walk','Пешком']].map(([mode,i,label])=>`<button data-mode="${mode}" class="${state.route.mode===mode?'active':''}">${icon(i)}${label}</button>`).join('')}</div><p class="map-loading-note" id="route-status">${state.route.from&&state.route.to?'Ваш сохранённый маршрут. Варианты и время в пути появятся на карте.':'Введите два адреса. Для точности добавьте город и номер дома.'}</p><iframe id="route-map" class="large-map" src="${esc(mapURL())}" title="Яндекс Карты: маршруты, метро и электрички" referrerpolicy="strict-origin-when-cross-origin" allow="geolocation"></iframe><div class="map-footer"><span>Данные и маршруты — Яндекс Карты. Если встроенная карта не загрузилась, откройте её в браузере.</span><a id="route-external" href="${esc(mapURL(state.route,false))}" target="_blank" rel="noopener noreferrer">Открыть в Яндекс Картах ↗</a></div>`,'route-modal');
}
function applyRoute(mode=state.route.mode){
  const from=$('#route-from')?.value.trim()||'',to=$('#route-to')?.value.trim()||'';
  state.route={from,to,mode};save();
  $('#route-map').src=mapURL();$('#route-external').href=mapURL(state.route,false);
  $('#route-status').textContent=from&&to?'Маршрут передан в Яндекс Карты. Выберите подходящий вариант на карте.':'Введите адрес отправления и назначения.';
  $$('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
}
function timerText(){if(desktop&&nativeFocus){const n=nativeFocus.remaining;return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;}const sec=focusEnd?Math.max(0,Math.ceil((focusEnd-Date.now())/1000)):focusDuration*60;return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;}
function openFocus(){
  openModal(`${modalHeading('Время для одного дела')}<p class="modal-subtitle">Уберите лишнее. Выберите продолжительность и начните.</p><div class="focus-modal-time" data-timer>${timerText()}</div><div class="modal-field"><label for="focus-duration">Продолжительность, минут</label><input class="form-input" id="focus-duration" type="number" min="1" max="180" value="${focusDuration}" ${focusEnd?'disabled':''}></div><div class="modal-actions"><button class="secondary" data-action="stop-focus" ${focusEnd?'':'hidden'}>Завершить</button><button class="primary" data-action="start-focus" ${focusEnd?'hidden':''}>${icon('clock')}Начать фокус</button></div>`);
}
async function startFocus(){
  const input=$('#focus-duration');if(!input.reportValidity())return;focusDuration=Number(input.value);if(desktop){receiveFocus(await desktop.focusCommand('start',focusDuration));toast('Фокус начался.');return;}focusEnd=Date.now()+focusDuration*60000;currentFocus={last:Date.now(),started:Date.now(),seconds:0};
  clearInterval(focusTimer);focusTimer=setInterval(()=>{
    const now=Date.now(),elapsed=Math.max(0,Math.min(2,(Math.min(now,focusEnd)-currentFocus.last)/1000));currentFocus.last=now;currentFocus.seconds+=elapsed;
    const key=dateKey();state.focusSeconds[key]=(state.focusSeconds[key]||0)+elapsed;
    $$('[data-timer]').forEach(e=>e.textContent=timerText());
    if(now>=focusEnd){stopFocus();toast('Фокус завершён. Самое время немного отдохнуть.');desktop?.notify({title:'Фокус завершён',body:'Хорошая работа. Сделайте небольшой перерыв.'});}
    if(Math.floor(now/1000)%5===0)save(false);
  },1000);save(false);openFocus();toast('Фокус начался. Вы можете закрыть это окно.');
}
function stopFocus(){if(desktop){desktop.focusCommand('stop').then(receiveFocus);return;}if(currentFocus)state.focusSessions.push({app:'Фокус',task:'Фокус-сессия',started:new Date(currentFocus.started).toISOString(),ended:new Date().toISOString(),seconds:Math.round(currentFocus.seconds),completed:Date.now()>=focusEnd});clearInterval(focusTimer);focusTimer=null;focusEnd=0;currentFocus=null;save(false);renderContent();if($('#focus-duration'))openFocus();}
async function showDesktop(w){
  if(!desktop){toast('Для отдельных виджетов запустите Blaze для Windows через Start-Blaze.cmd.');renderEditor();return;}
  const supported=['note','route','health','focus','activity','apps','days'];if(!supported.includes(w.type))return;
  try{await desktop.showWidget({...w,route:state.route,activity:nativeActivity,focusSeconds:state.focusSeconds,workDays:state.workDays,goal:state.goal});w.desktop=true;save();renderEditor();renderContent();toast('Виджет добавлен на рабочий стол.');}catch{toast('Не удалось открыть виджет. Попробуйте ещё раз.');}
}
document.addEventListener('click',async event=>{
  const button=event.target.closest('button,a');if(!button)return;
  const d=button.dataset,w=state.widgets.find(w=>w.id===selected);
  if(d.page){setPage(d.page);return;}
  if(d.filter){filter=d.filter;$$('[data-filter]').forEach(b=>b.classList.toggle('active',b===button));renderContent();return;}
  if(d.create){createWidget(d.create);return;}
  if(d.desktop){const target=state.widgets.find(item=>item.id===d.desktop);if(target){closeModal();await showDesktop(target);}return;}
  if(d.select){selected=d.select;closeModal();renderEditor();return;}
  if(d.edit){openEdit(d.edit);return;}
  if(d.menu){openMenu(d.menu);return;}
  if(d.delete){openModal(`${modalHeading('Удалить этот виджет?')}<p class="modal-subtitle">Содержимое виджета будет удалено с этого устройства.</p><div class="modal-actions"><button class="secondary" data-action="close-modal">Отмена</button><button class="primary" data-confirm-delete="${esc(d.delete)}">Удалить</button></div>`);return;}
  if(d.confirmDelete){desktop?.hideWidget(d.confirmDelete);state.widgets=state.widgets.filter(w=>w.id!==d.confirmDelete);if(selected===d.confirmDelete)selected=null;save();closeModal();renderContent();renderEditor();return;}
  if(d.size&&w){w.size=d.size;save();renderContent();renderEditor();return;}
  if(d.color&&w){const color=normalizeColor(d.color);if(!color)return;w.color=color;save();renderContent();renderEditor();return;}
  if(d.day){selectedDay=d.day;renderCalendar();return;}
  if(d.period){activityPeriod=d.period;renderContent();return;}
  if(d.month){calendarMonth.setMonth(calendarMonth.getMonth()+Number(d.month));renderCalendar();return;}
  if(d.mode){applyRoute(d.mode);return;}
  if(d.window){desktop?desktop.windowControl(d.window):toast('Управление окном доступно в приложении для Windows.');return;}
  switch(d.action){
    case 'custom-color':openCustomColor();break;
    case 'mark-day':setPage('days');selectedDay=dateKey();renderCalendar();$('#work-hours').focus();break;
    case 'change-goal':openGoal();break;
    case 'activity-range':openActivityRange();break;
    case 'unmark-day':state.workDays=state.workDays.filter(d=>d!==selectedDay);save();renderCalendar();toast('Отметка снята.');break;
    case 'create':openCreate();break;case 'route':openRoute();break;case 'focus':openFocus();break;case 'close-modal':closeModal();break;
    case 'close-editor':selected=null;renderEditor();break;case 'desktop':if(w)await showDesktop(w);break;
    case 'add-task':$('.note-editor-tasks').insertAdjacentHTML('beforeend',editableTask());$('.note-editor-tasks .editable-task:last-child .form-input').focus();break;
    case 'delete-task':button.closest('.editable-task').remove();break;
    case 'swap-route':{const from=$('#route-from'),to=$('#route-to'),v=from.value;from.value=to.value;to.value=v;break;}
    case 'start-focus':startFocus();break;case 'stop-focus':stopFocus();break;
    case 'export':{const a=document.createElement('a');const url=URL.createObjectURL(new Blob([JSON.stringify({...state,activity:nativeActivity},null,2)],{type:'application/json'}));a.href=url;a.download=`blaze-${dateKey()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);break;}
  }
  if(button.id==='layout-toggle'){state.listView=!state.listView;save();renderContent();}
});
document.addEventListener('change',async event=>{
  const input=event.target,d=input.dataset,w=state.widgets.find(w=>w.id===selected);
  if(d.task){const note=state.widgets.find(w=>w.id===d.task);if(note?.tasks[d.index]){note.tasks[d.index].done=input.checked;note.updated=Date.now();save();renderEditor();}}
  if(d.health){const health=state.widgets.find(w=>w.id===d.health);health.enabled=input.checked;save();renderContent();}
  if(d.setting&&w){
    if(d.setting==='desktop'){if(input.checked)await showDesktop(w);else{w.desktop=false;desktop?.hideWidget(w.id);save();renderContent();renderEditor();}}
    else {w[d.setting]=input.checked;save();if(w.desktop)desktop?.syncWidget({...w,route:state.route,workDays:state.workDays,goal:state.goal},true);}
  }
  if(input.id==='widget-title'&&w){w.title=input.value.trim()||TYPES[w.type][0];w.updated=Date.now();save();renderContent();renderEditor();}
});
document.addEventListener('submit',event=>{
  event.preventDefault();const form=event.target;
  if(form.id==='route-form'){applyRoute();renderContent();return;}
  if(form.id==='settings-form'){state.name=$('#settings-name').value.trim()||'Моё пространство';state.goal=Number($('#settings-goal').value);save();toast('Настройки сохранены.');return;}
  if(form.id==='workday-form'){saveWorkDay(form);return;}
  if(form.id==='goal-form'){state.goal=Number($('#new-goal').value);save();closeModal();renderContent();return;}
  if(form.id==='activity-range-form'){activityEnd=$('#activity-end').value;closeModal();renderContent();return;}
  const w=state.widgets.find(w=>w.id===form.dataset.id);if(!w)return;
  if(form.id==='custom-color-form'){const color=normalizeColor($('#custom-color-hex').value);if(!color){toast('Введите код цвета, например #b5ff24.');return;}if(!palette().includes(color))state.customColors.push(color);w.color=color;save();closeModal();renderContent();renderEditor();toast('Цвет добавлен в вашу палитру.');return;}
  if(form.id==='note-form'){w.headline=$('#note-headline').value.trim();w.body=$('#note-body').value;w.tasks=$$('.editable-task',form).map(row=>({text:$('.form-input',row).value.trim(),done:$('input[type="checkbox"]',row).checked})).filter(t=>t.text);}
  if(form.id==='health-form'){w.body=$('#health-body').value.trim();w.interval=Number($('#health-interval').value);w.enabled=true;}
  w.updated=Date.now();save();closeModal();renderContent();renderEditor();toast('Сохранено.');
});
$('#search').addEventListener('input',e=>{search=e.target.value;renderContent();});
document.addEventListener('input',event=>{
  if(!['custom-color-picker','custom-color-hex'].includes(event.target.id))return;
  const color=normalizeColor(event.target.value);if(!color)return;
  if(event.target.id==='custom-color-picker')$('#custom-color-hex').value=color;
  else $('#custom-color-picker').value=color;
  $('#custom-color-preview').style.cssText=noteStyle(color);
});
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal();}});
$('#modal').addEventListener('cancel',()=>{modalCleanup?.();modalCleanup=null;});
window.addEventListener('beforeunload',()=>{save(false);});
window.addEventListener('hashchange',()=>{const next=location.hash.slice(1);if(['widgets','library','activity','days','settings'].includes(next)&&next!==page)setPage(next);});
if(desktop){
  desktop.getFocus?.().then(receiveFocus);desktop.onFocus?.(receiveFocus);
  desktop.onWidgetAction?.(({id,action})=>{if(action==='route')openRoute();else if(action==='days'){setPage('days');selectedDay=dateKey();renderCalendar();$('#work-hours').focus();}else if(action==='activity')setPage('activity');else if(action==='edit'){selected=id;renderEditor();openEdit(id);}});
  desktop.getSessions?.().then(rows=>{nativeSessions=rows;if(page==='activity')renderActivity();});
  desktop.onSessions?.(rows=>{nativeSessions=rows;if(page==='activity'&&!$('#modal').open)renderActivity();});
  desktop.getActivity().then(data=>{nativeActivity=data;renderSummary();if(['widgets','activity'].includes(page))renderContent();});
  desktop.onActivity(data=>{nativeActivity=data;renderSummary();if(page==='activity'&&!$('#modal').open)renderActivity();if(['widgets','activity'].includes(page)){for(const element of $$('.activity-widget')){const content=$('.chart-content',element);if(content)content.outerHTML=chartHTML();}for(const element of $$('.apps-widget')){const content=$('.apps-list,.empty-apps',element);if(content)content.outerHTML=appsHTML();}}});
  desktop.onWidgetChange(({id,patch})=>{const w=state.widgets.find(w=>w.id===id);if(w){if(patch.tasks)w.tasks=patch.tasks;if(patch.body!==undefined)w.body=patch.body;if(patch.desktop!==undefined)w.desktop=patch.desktop;if(typeof patch.pin==='boolean')w.pin=patch.pin;w.updated=Date.now();save();renderContent();renderEditor();}});
  for(const w of state.widgets.filter(w=>w.desktop))desktop.showWidget({...w,route:state.route,activity:nativeActivity,focusSeconds:state.focusSeconds,workDays:state.workDays,goal:state.goal}).catch(()=>{w.desktop=false;save();});
}else{
  const lastReminded=new Map();
  setInterval(()=>{for(const w of state.widgets.filter(w=>w.type==='health'&&w.enabled!==false)){const now=Date.now();if(!lastReminded.has(w.id))lastReminded.set(w.id,now);if(now-lastReminded.get(w.id)>=(w.interval||40)*60000){lastReminded.set(w.id,now);toast(`${w.title}: ${w.body}`);}}},10000);
}
$('#today').textContent = new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',weekday:'short',day:'numeric',month:'long'}).format(new Date()).replace(/^./,m=>m.toUpperCase());
if(innerWidth<1250)selected=null;
save(false);renderContent();renderEditor();
if(['library','activity','days','settings'].includes(location.hash.slice(1)))setPage(location.hash.slice(1));

