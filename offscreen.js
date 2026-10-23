/**
 * M2028 offscreen sound player.
 * A Manifest V3 background script cannot play audio, so it asks this hidden page to do it.
 * The tones are the same ones the popup plays (bell, chime, digital, marimba, pulse), generated as a WAV
 * in code so no audio files are needed and playback does not depend on the Web Audio autoplay rules.
 */
'use strict';

var RATE = 44100;

// Same schedule as popup.js pomSound(): kind 'session' = 3 rounds, anything else = 4 rounds
function buildNotes(style, kind) {
  var rounds = kind === 'session' ? 3 : 4;
  var notes = [];
  var add = function (freq, delay, dur, type, vol) { notes.push({ f: freq, d: delay, l: dur, t: type, v: vol }); };
  var r, i;
  if (style === 'bell') {
    var bell = [523, 659, 784];
    for (r = 0; r < rounds; r++) for (i = 0; i < bell.length; i++) add(bell[i], 0.85 * r + 0.18 * i, 0.75, 'sine', 0.4);
  } else if (style === 'chime') {
    var pairs = [[880, 660], [800, 600], [720, 540], [660, 500]];
    for (r = 0; r < rounds; r++) {
      var p = pairs[r % pairs.length];
      add(p[0], 0.75 * r, 0.65, 'triangle', 0.32);
      add(p[1], 0.75 * r + 0.25, 0.6, 'triangle', 0.3);
    }
  } else if (style === 'digital') {
    for (r = 0; r < rounds; r++) {
      add(1046, 0.55 * r, 0.12, 'square', 0.22);
      add(1046, 0.55 * r + 0.18, 0.12, 'square', 0.22);
    }
  } else if (style === 'marimba') {
    var mar = [392, 494, 587, 494];
    for (r = 0; r < rounds; r++) add(mar[r % mar.length], 0.5 * r, 0.55, 'sine', 0.38);
  } else {
    for (r = 0; r < rounds; r++) add(660 + 60 * r, 0.6 * r, 0.4, 'sine', 0.35);
  }
  return notes;
}

function wave(type, phase) {
  var x = phase - Math.floor(phase);
  if (type === 'square') return x < 0.5 ? 1 : -1;
  if (type === 'triangle') return 4 * Math.abs(x - 0.5) - 1;
  return Math.sin(2 * Math.PI * x);
}

// Gain envelope identical to the popup: 0 -> vol (linear, 40 ms) -> 0.001 (exponential) at the note's end
function envelope(t, dur, vol) {
  if (t < 0) return 0;
  if (t < 0.04) return vol * (t / 0.04);
  if (t < dur) return vol * Math.pow(0.001 / vol, (t - 0.04) / (dur - 0.04));
  return 0.001;
}

function renderWav(style, kind) {
  var notes = buildNotes(style, kind);
  var total = 0;
  notes.forEach(function (n) { total = Math.max(total, n.d + n.l + 0.05); });
  var count = Math.ceil((total + 0.1) * RATE);
  var mix = new Float32Array(count);
  notes.forEach(function (n) {
    var start = Math.floor(n.d * RATE);
    var end = Math.min(count, Math.floor((n.d + n.l + 0.05) * RATE));
    for (var s = start; s < end; s++) {
      var t = (s - start) / RATE;
      mix[s] += wave(n.t, n.f * t) * envelope(t, n.l, n.v);
    }
  });
  var buf = new ArrayBuffer(44 + count * 2);
  var v = new DataView(buf);
  var str = function (o, text) { for (var i = 0; i < text.length; i++) v.setUint8(o + i, text.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + count * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, count * 2, true);
  for (var i = 0; i < count; i++) {
    var x = Math.max(-1, Math.min(1, mix[i]));
    v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

function playSound(style, kind) {
  return new Promise(function (resolve) {
    var url;
    try {
      url = URL.createObjectURL(renderWav(style, kind));
      var audio = new Audio(url);
      audio.volume = 1;
      var done = function (ok) { try { URL.revokeObjectURL(url); } catch (e) {} resolve(ok); };
      audio.addEventListener('ended', function () { done(true); });
      audio.addEventListener('error', function () { done(false); });
      var p = audio.play();
      if (p && p.catch) p.catch(function () { done(false); });
      setTimeout(function () { done(true); }, 9000); // safety net
    } catch (e) {
      resolve(false);
    }
  });
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  // Only answer messages meant for this page; the background script answers everything else.
  if (!msg || msg.target !== 'm2028-offscreen' || msg.type !== 'PLAY_POMO_SOUND') return;
  playSound(msg.style || 'bell', msg.kind || 'session').then(function (ok) { sendResponse({ ok: ok }); });
  return true;
});
