export function progress(ids, completed) {
  const total = ids.length;
  const done = ids.filter(id => completed.has(id)).length;
  return { done, total, percent: total ? Math.round(done / total * 100) : 0 };
}
export function dateOnly(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function weekNumber(start, today = dateOnly()) {
  const diff = (Date.parse(today+'T12:00:00Z') - Date.parse(start+'T12:00:00Z')) / 86400000;
  return Math.min(52, Math.max(1, Math.floor(diff / 7) + 1));
}
export function level(percent) {
  return percent >= 100 ? 'Маршрут пройден' : percent >= 75 ? 'Самостоятельный инженер' : percent >= 50 ? 'Создатель решений' : percent >= 25 ? 'Уверенный практик' : 'Исследователь';
}
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
export function safeURL(value) {
  try { const u = new URL(value); return u.protocol === 'https:' ? u.href : '#'; } catch { return '#'; }
}
export function weekDate(start, week, day=0) {
  const d = new Date(start+'T12:00:00'); d.setDate(d.getDate() + (week-1)*7+day); return d;
}
export function calendarText(start, schedule) {
  const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Dev Growth//Learning//RU','CALSCALE:GREGORIAN'];
  const escape = s => s.replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
  schedule.forEach((slot, index) => {
    const m = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(slot.time);
    if (!m) return;
    const first = new Date(start+'T12:00:00');
    first.setDate(first.getDate() + (index+1-first.getDay()+7)%7);
    const day = dateOnly(first).replaceAll('-','');
    lines.push('BEGIN:VEVENT', `UID:devgrowth-${start}-${index}@local`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+Z/,'Z')}`,`DTSTART:${day}T${m[1]}${m[2]}00`,`DTEND:${day}T${m[3]}${m[4]}00`,'RRULE:FREQ=WEEKLY;COUNT=52',`SUMMARY:${escape('Dev Growth: '+slot.activity)}`,'BEGIN:VALARM','TRIGGER:-PT10M','ACTION:DISPLAY','DESCRIPTION:Время учиться','END:VALARM','END:VEVENT');
  });
  lines.push('END:VCALENDAR'); return lines.join('\r\n')+'\r\n';
}
