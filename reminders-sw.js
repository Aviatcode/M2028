/* M2028 background reminders. Add this ONE line at the very top of your sw.js:
     importScripts('reminders-sw.js');
   The page sends its upcoming task + medicine reminders here; they are shown even when the app is closed
   (via Periodic Background Sync on Chrome/Android installed apps, or a Web Push message). */
(function(){
var DB='m2028-reminders';
function db(){return new Promise(function(ok,no){var r=indexedDB.open(DB,1);r.onupgradeneeded=function(){r.result.createObjectStore('kv')};r.onsuccess=function(){ok(r.result)};r.onerror=function(){no(r.error)}})}
function put(k,v){return db().then(function(d){return new Promise(function(ok){var t=d.transaction('kv','readwrite');t.objectStore('kv').put(v,k);t.oncomplete=ok;t.onerror=ok})})}
function get(k){return db().then(function(d){return new Promise(function(ok){var q=d.transaction('kv').objectStore('kv').get(k);q.onsuccess=function(){ok(q.result)};q.onerror=function(){ok()}})})}
function show(x){return self.registration.showNotification(x.title,{body:x.body||'',icon:'icon-192.png',badge:'icon-192.png',vibrate:[200,100,200],tag:'m2028-bg-'+(x.k||x.title),renotify:true,data:{url:'./'}})}
/* show every stored reminder that is due (and not older than 6h), once */
function fireDue(){return Promise.all([get('list'),get('fired')]).then(function(r){
  var L=r[0]||[],F=r[1]||{},now=Date.now(),jobs=[],keep={};
  L.forEach(function(x){if(F[x.k])keep[x.k]=1;if(x.ts<=now&&now-x.ts<216e5&&!F[x.k]){keep[x.k]=1;F[x.k]=1;jobs.push(show(x))}});
  Object.keys(F).forEach(function(k){if(!keep[k])delete F[k]});
  return Promise.all(jobs).then(function(){return put('fired',F)})})}
self.addEventListener('message',function(e){var d=e.data;if(d&&d.type==='m2028-reminders'&&Array.isArray(d.list))e.waitUntil(put('list',d.list))});
self.addEventListener('periodicsync',function(e){if(e.tag==='m2028-reminders')e.waitUntil(fireDue())});
self.addEventListener('push',function(e){var d={};try{d=e.data?e.data.json():{}}catch(x){}e.waitUntil(d&&d.title?show(d):fireDue())});
self.addEventListener('notificationclick',function(e){e.notification.close();
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(function(w){for(var i=0;i<w.length;i++)if('focus' in w[i])return w[i].focus();return self.clients.openWindow((e.notification.data&&e.notification.data.url)||'./')}))});
})();
