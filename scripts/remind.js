import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {weekNumber} from '../assets/core.js';

export function localParts(now,timezone){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
  const date=`${parts.year}-${parts.month}-${parts.day}`;
  return {date,weekday:new Date(date+'T12:00:00Z').getUTCDay(),minutes:Number(parts.hour)*60+Number(parts.minute)};
}
export function pendingReminder(config,now,manual=false){
  const p=localParts(now,config.timezone);
  const days=(Date.parse(p.date+'T12:00:00Z')-Date.parse(config.startDate+'T12:00:00Z'))/86400000;
  if(!manual&&(days<0||days>=364))return null;
  // Cron runs at the intended reminder time; a 30-minute window tolerates runner delays.
  const slot=config.schedule.find(s=>{
    const [h,m]=s.time.slice(0,5).split(':').map(Number);
    const since=p.minutes-(h*60+m-config.minutesBefore);
    return s.weekday===p.weekday&&since>=0&&since<30;
  });
  if(!slot&&!manual)return null;
  return {week:weekNumber(config.startDate,p.date),activity:slot?.activity||'Тестовое напоминание: запланируй следующую учебную сессию.',time:slot?.time||''};
}
export function reminderSiteURL(configured,repository){
  if(configured!=='auto')return configured;
  if(!/^[a-zA-Z0-9-]+\/[a-zA-Z0-9._-]+$/.test(repository||''))throw new Error('Укажи siteUrl в reminders.json или запусти через GitHub Actions');
  const [owner,name]=repository.split('/');return `https://${owner}.github.io/${name}/`;
}
export async function main(){
  const config=JSON.parse(await readFile(new URL('../data/reminders.json',import.meta.url)));
  const roadmap=JSON.parse(await readFile(new URL('../data/roadmap.json',import.meta.url)));
  const reminder=pendingReminder(config,new Date(),process.env.REMINDER_MANUAL==='true');
  if(!reminder){console.log('Подходящей сессии нет; сообщение не отправлено.');return;}
  const week=roadmap.weeks[reminder.week-1];
  const siteUrl=reminderSiteURL(config.siteUrl,process.env.GITHUB_REPOSITORY);
  const token=process.env.MAX_BOT_TOKEN,chat=process.env.MAX_CHAT_ID;
  if(!token||!chat||!/^[-]?\d+$/.test(chat))throw new Error('Нужны Secrets MAX_BOT_TOKEN и числовой MAX_CHAT_ID');
  const url=new URL('https://platform-api2.max.ru/messages');url.searchParams.set('chat_id',chat);
  const text=`Dev Growth · неделя ${reminder.week}/52\n${week.title}\n${reminder.time} ${reminder.activity}\nРезультат недели: ${week.deliverable}\n${siteUrl}\n\nОтметки выполнения хранятся в браузере. Это напоминание по расписанию.`;
  // Do not automatically retry a POST: delivery may have succeeded before a timeout.
  const response=await fetch(url,{method:'POST',headers:{Authorization:token,'Content-Type':'application/json'},body:JSON.stringify({text}),signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error(`MAX вернул HTTP ${response.status}. Проверь права бота и документацию.`);
  console.log('Напоминание отправлено.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
