const {contextBridge,ipcRenderer} = require('electron');
const listen = (channel,cb) => { const fn=(_,data)=>cb(data);ipcRenderer.on(channel,fn);return ()=>ipcRenderer.removeListener(channel,fn); };
contextBridge.exposeInMainWorld('blaze',{
  showWidget: widget => ipcRenderer.invoke('widget:show',widget),
  hideWidget: id => ipcRenderer.send('widget:hide',id),
  syncWidget: (widget,force=false) => ipcRenderer.send('widget:sync',{widget,force}),
  changeWidget: patch => ipcRenderer.send('widget:change',patch),
  setWidgetPinned: pinned => ipcRenderer.invoke('widget:pin',pinned),
  widgetAction: action => ipcRenderer.send('widget:action',action),
  focusCommand: (command,minutes) => ipcRenderer.invoke('focus:command',{command,minutes}),
  getFocus: () => ipcRenderer.invoke('focus:get'),
  onFocus: cb => listen('focus:data',cb),
  onWidgetAction: cb => listen('widget:action',cb),
  onWidget: cb => listen('widget:data',cb),
  onWidgetChange: cb => listen('widget:changed',cb),
  getWidget: () => ipcRenderer.invoke('widget:get'),
  getActivity: () => ipcRenderer.invoke('activity:get'),
  getSessions: () => ipcRenderer.invoke('activity:sessions:get'),
  onSessions: cb => listen('activity:sessions',cb),
  onActivity: cb => listen('activity:data',cb),
  setReminders: list => ipcRenderer.send('reminders:set',list),
  notify: data => ipcRenderer.send('notify',data),
  windowControl: action => ipcRenderer.send('window:control',action)
});
