/* M2028 push reminders: registers this device + its upcoming task/medicine reminders with the push server,
   so notifications arrive on time even when the app is closed. */
(function(){
var API="https://lvzcctsqcpikisdzztot.supabase.co/functions/v1/smooth-api";
var ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2emNjdHNxY3Bpa2lzZHp6dG90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MDk4OTQsImV4cCI6MjA5NzI4NTg5NH0.Z1GejKEAkFuJmum-amd5zin8TFEIaeptroRtjFmojdw";
var VAPID="BKXNMDQ70tAt4e-JvpUPI7C4pSd9r2rMdY__2aJqgNKDyiBiPv2SybsoNlgtftqPrNQLzjNLYP6XMBCtpXqOb2k";
var last="",busy=0;
function key(s){var p="=".repeat((4-s.length%4)%4),r=atob((s+p).replace(/-/g,"+").replace(/_/g,"/")),o=new Uint8Array(r.length);for(var i=0;i<r.length;i++)o[i]=r.charCodeAt(i);return o}
function jobs(){var out=[],now=Date.now();
 try{(window.m2028ReminderItems?window.m2028ReminderItems():[]).forEach(function(x){
  var k=x.k,tag="m2028-bg-"+k;
  if(/^t_.+_(pre|due)$/.test(k))tag="m2028-task-"+k.slice(2,k.lastIndexOf("_"))+"-"+k.slice(k.lastIndexOf("_")+1);
  else if(k.indexOf("m_")===0){var mk=k.slice(2,k.lastIndexOf("_"));tag="m2028-med-"+mk+"-due";
   if(x.ts-36e5>now)out.push({k:k+"_pre",ts:x.ts-36e5,title:"\uD83D\uDC8A Medicine in 1 hour",body:x.body,tag:"m2028-med-"+mk+"-pre"})}
  out.push({k:k,ts:x.ts,title:x.title,body:x.body,tag:tag})})}catch(e){}
 try{getTasks().forEach(function(t){if(t.done||!t.date||t.time)return;var ts=new Date(t.date+"T08:00").getTime();
  if(!isNaN(ts)&&ts>now&&ts-now<6048e5)out.push({k:"t_"+t.id+"_day",ts:ts,title:"\u23F0 Task due today",body:t.text,tag:"m2028-task-"+t.id+"-day"})})}catch(e){}
 out.sort(function(a,b){return a.ts-b.ts});return out.slice(0,100)}
function hex(b){return Array.from(new Uint8Array(b)).map(function(x){return("0"+x.toString(16)).slice(-2)}).join("")}
function salt(){try{var s=localStorage.getItem("m2028_push_salt");if(!s){s=hex(crypto.getRandomValues(new Uint8Array(16)));localStorage.setItem("m2028_push_salt",s)}return s}catch(e){return"x"}}
/* the server only gets a time + an opaque id + a generic title; the real text stays on this device (see reminders-sw.js) */
async function opaque(list){var s=salt(),map={},pub=[];
 for(var i=0;i<list.length;i++){var x=list[i],h=hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s+x.k))).slice(0,16);
  pub.push({k:h,ts:x.ts,title:"\u23F0 M2028",body:"You have a reminder",tag:"m2028-"+h});map[h]=x}
 return{pub:pub,map:map}}
async function register(){
 if(busy||!("serviceWorker" in navigator)||!("PushManager" in window)||!("Notification" in window)||Notification.permission!=="granted")return;
 busy=1;try{
  var reg=await navigator.serviceWorker.ready,sub=await reg.pushManager.getSubscription();
  if(!sub){try{sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key(VAPID)})}
   catch(e){var o=await reg.pushManager.getSubscription();if(o)await o.unsubscribe();sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key(VAPID)})}}
  var op=await opaque(jobs()),list=op.pub,sig=sub.endpoint+JSON.stringify(list)+JSON.stringify(op.map);if(sig===last)return;
  var sw=reg.active||navigator.serviceWorker.controller;if(sw)sw.postMessage({type:"m2028-push-map",map:op.map});
  var r=await fetch(API,{method:"POST",keepalive:true,headers:{"Content-Type":"application/json",apikey:ANON,Authorization:"Bearer "+ANON},
   body:JSON.stringify({action:"register",subscription:sub.toJSON(),jobs:list})});
  if(r.ok)last=sig;
 }catch(e){}finally{busy=0}}
window.m2028PushRegister=register;
setTimeout(register,3000);setInterval(register,15000);
document.addEventListener("visibilitychange",function(){if(document.hidden)register()});
addEventListener("pagehide",register);
})();
