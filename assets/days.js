import {weekDate, dateOnly} from './core.js';

export const STUDY_DAYS = [0, 3, 5, 6];

export function dayKeys(week, offset) {
  const prefix=`w${week}`;
  const keys=[['core-start'],['day-repeat'],['day-reserve'],['ai'],['day-prepare'],['project'],['core-finish','soft','review']][offset];
  if(!Number.isInteger(week)||week<1||week>52||!keys)throw new Error('Неизвестный день обучения');
  return keys.map(key=>`${prefix}-${key}`);
}

function expandLegacy(done,week) {
  const expanded=new Set(done);
  if(expanded.has(`w${week}-core`)){
    expanded.add(`w${week}-core-start`);
    expanded.add(`w${week}-core-finish`);
  }
  return expanded;
}

export function dayComplete(done,week,offset) {
  const expanded=expandLegacy(done,week);
  return dayKeys(week,offset).every(key=>expanded.has(key));
}

// Preserve the original 260 task IDs and old backups. The 90-minute core task
// is completed after its two sessions, Monday and Sunday, have both been done.
export function dayChanges(done,week,offset,complete) {
  const next=expandLegacy(done,week);
  for(const key of dayKeys(week,offset))complete?next.add(key):next.delete(key);
  if(next.has(`w${week}-core-start`)&&next.has(`w${week}-core-finish`))next.add(`w${week}-core`);
  else next.delete(`w${week}-core`);
  return {add:[...next].filter(key=>!done.has(key)),remove:[...done].filter(key=>!next.has(key))};
}

export function daySummary(done,week) {
  const finished=STUDY_DAYS.filter(offset=>dayComplete(done,week,offset)).length;
  return {done:finished,total:STUDY_DAYS.length,percent:Math.round(finished/STUDY_DAYS.length*100)};
}

export function datedDays(start,week,definitions,today=dateOnly()) {
  return definitions.map(day=>{
    const date=weekDate(start,week,day.offset);
    return {...day,date:dateOnly(date),today:dateOnly(date)===today,
      weekday:date.toLocaleDateString('ru-RU',{weekday:'long'}),
      shortDay:date.toLocaleDateString('ru-RU',{weekday:'short'}),
      label:date.toLocaleDateString('ru-RU',{day:'numeric',month:'long'})};
  });
}
