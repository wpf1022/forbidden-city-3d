// Dev helper: reposition the camera before a screenshot.
// usage: node tools/shot.mjs "<url>&pos=x,y,z&tgt=x,y,z" out.png --eval tools/pose.js
(() => {
  const FC = window.__FC__;
  if (!FC) return 'no FC';
  const q = new URLSearchParams(location.search);
  const pos = (q.get('pos') || '0,60,430').split(',').map(Number);
  const tgt = (q.get('tgt') || '0,22,262').split(',').map(Number);
  FC.controls.setPose({ pos, target: tgt }, true);
  return 'posed ' + pos.join(',') + ' -> ' + tgt.join(',');
})()
