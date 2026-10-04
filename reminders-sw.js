/* M2028 background reminders (imported by sw.js).
   - Web Push from the Supabase server is the reliable path: it arrives on time even if the app is closed.
   - Periodic Background Sync / stored list stay as a backup. */
(function(){
var DB='m2028-reminders';
function db(){return new Promise(function(ok,no){var r=indexedDB.open(DB,1);r.onupgradeneeded=function(){r.result.createObjectStore('kv')};r.onsuccess=function(){ok(r.result)};r.onerror=function(){no(r.error)}})}
function put(k,v){return db().then(function(d){return new Promise(function(ok){var t=d.transaction('kv','readwrite');t.objectStore('kv').put(v,k);t.oncomplete=ok;t.onerror=ok})})}
function get(k){return db().then(function(d){return new Promise(function(ok){var q=d.transaction('kv').objectStore('kv').get(k);q.onsuccess=function(){ok(q.result)};q.onerror=function(){ok()}})})}
function show(x){return self.registration.showNotification(x.title,{body:x.body||'',icon:'icon-192.png',badge:'icon-192.png',vibrate:[200,100,200],tag:x.tag||('m2028-bg-'+(x.k||x.title)),renotify:true,requireInteraction:true,data:{url:self.registration.scope}})}
function fireDue(){return Promise.all([get('list'),get('fired')]).then(function(r){
  var L=r[0]||[],F=r[1]||{},now=Date.now(),jobs=[],keep={};
  L.forEach(function(x){if(F[x.k])keep[x.k]=1;if(x.ts<=now&&now-x.ts<216e5&&!F[x.k]){keep[x.k]=1;F[x.k]=1;jobs.push(show(x))}});
  Object.keys(F).forEach(function(k){if(!keep[k])delete F[k]});
  return Promise.all(jobs).then(function(){return put('fired',F)})})}
self.addEventListener('message',function(e){var d=e.data;if(d&&d.type==='m2028-reminders'&&Array.isArray(d.list))e.waitUntil(put('list',d.list))});
self.addEventListener('periodicsync',function(e){if(e.tag==='m2028-reminders')e.waitUntil(fireDue())});
self.addEventListener('push',function(e){var d={};try{d=e.data?e.data.json():{}}catch(x){}
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(function(cs){
    /* if the app is on screen it already shows its own alert, so don't double up */
    if(cs.some(function(c){return c.visibilityState==='visible'}))return;
    return d&&d.title?show(d):fireDue()}))});
/* notification taps are handled by sw.js */
})();
