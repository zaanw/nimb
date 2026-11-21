const CACHE='nimb-shell-v10';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/','/icon-192.png','/icon-512.png'])));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));self.clients.claim()});
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==location.origin||url.pathname.startsWith('/api/')||url.pathname.startsWith('/socket.io/'))return;if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>caches.match('/')))});
self.addEventListener('push',event=>{event.waitUntil((async()=>{
  let payload={};try{payload=event.data?.json()||{}}catch{}
  const chatId=Number.isSafeInteger(payload.chatId)&&payload.chatId>0?payload.chatId:null;
  await self.registration.showNotification('nimb',{body:payload.test?'Уведомления включены. Теперь вы не пропустите новые сообщения.':'Новое сообщение',icon:'/icon-192.png',badge:'/icon-192.png',tag:payload.test?'nimb-test':chatId?'nimb-chat-'+chatId:'nimb-new-message',data:{chatId,url:chatId?'/?chat='+chatId:'/'}});
})())});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{
  const candidate=event.notification.data?.chatId;const chatId=Number.isSafeInteger(candidate)&&candidate>0?candidate:null;
  const windows=await clients.matchAll({type:'window',includeUncontrolled:true});
  const existing=windows.find(client=>new URL(client.url).origin===self.location.origin);
  if(existing){existing.postMessage({type:'OPEN_CHAT',chatId});await existing.focus();}
  else await clients.openWindow(chatId?'/?chat='+chatId:'/');
})())});
