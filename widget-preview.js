if(new URLSearchParams(location.search).get('preview')==='design'){
 const type=new URLSearchParams(location.search).get('type')||'note';
 const key=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 window.blaze={onWidget(){},onFocus(){},getFocus:async()=>({duration:1500,remaining:1389,running:false}),getWidget:async()=>({id:'preview',type,title:'Быстрый маршрут',color:'#b5ff24',pin:false,headline:'Идеи не должны ждать.',body:'',tasks:[{text:'Собрать референсы для проекта',done:true},{text:'Продумать главный экран',done:false},{text:'Отправить макет на ревью',done:false}],route:{from:'Дом',to:'Офис',mode:'auto'},goal:22,workDays:Array.from({length:18},(_,i)=>key.slice(0,8)+String(i+1).padStart(2,'0')),activity:{[key]:{Figma:11520,'VS Code':7680,Safari:3840}}})};
}
