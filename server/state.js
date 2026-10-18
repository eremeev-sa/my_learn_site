import {validateSetting} from '../assets/db.js';

// Only learning data crosses this boundary. Accounts and sessions never do.
export function validateState(state) {
  if (!state || Object.keys(state).some(k=>!['progress','notes','settings'].includes(k))) throw new Error('Некорректная база');
  for (const key of ['progress','notes','settings']) {
    if (!Array.isArray(state[key]) || state[key].length>2000) throw new Error('Слишком много записей');
    const ids=new Set();
    for (const row of state[key]) {
      if (!Array.isArray(row) || row.length!==(key==='notes'?3:2) || row.some(v=>typeof v!=='string') || !row[0] || row[0].length>100 || ids.has(row[0])) throw new Error('Некорректная запись');
      ids.add(row[0]);
      if (key==='progress' && (row[1].length>50 || isNaN(Date.parse(row[1])))) throw new Error('Некорректная дата');
      if (key==='notes' && (row[1].length>20000 || row[2].length>50 || isNaN(Date.parse(row[2])))) throw new Error('Некорректная заметка');
      if (key==='settings') {
        if (row[1].length>100000) throw new Error('Слишком большая настройка');
        validateSetting(row[0],JSON.parse(row[1]));
      }
    }
  }
  return state;
}
