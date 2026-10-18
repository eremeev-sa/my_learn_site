import {escapeHtml as e,safeURL,dateOnly,progress,level} from './core.js';
import {datedDays,dayComplete,daySummary} from './days.js';
import {icon} from './icons.js';

const kinds={core:'C# / Backend',recall:'Повторение',reserve:'Резерв',ai:'AI простыми словами',prepare:'Подготовка',project:'Практика проекта',review:'Закрепление'};
const external=(url,title,klass='')=>`<a class="${klass}" href="${e(safeURL(url))}" target="_blank" rel="noopener noreferrer">${title}${icon('external')}</a>`;

function dayBody(day,lesson,done,note,week,schedule){
  const complete=dayComplete(done,week,day.offset),unit=lesson[day.unit];
  const query=day.offset===3?unit.sourceTopic:lesson.core.sourceTopic;
  const videos=day.videoIds.map(id=>lesson.videos.find(video=>video.id===id));
  const pdf=`${lesson.pdf}#page=${day.pdfPage}`;
  return `<div class="day-card-body"><div class="day-content-main">
    <span class="day-topic ${day.kind}">${e(kinds[day.kind])}</span>
    <h2>${e(day.title)}</h2><p class="day-intro">${e(day.summary)}</p>
    <div class="day-result"><span>${icon('target')} К концу занятия</span><p>${e(day.goal)}</p></div>
    <div class="day-section-label">Твой порядок действий</div><ol class="day-steps">${day.steps.map(step=>`<li>${e(step)}</li>`).join('')}</ol></div>
    <div class="day-materials"><a class="day-pdf" href="${e(pdf)}" target="_blank" rel="noopener"><span class="pdf-symbol">PDF</span><span><strong>Разбор для начинающего</strong><small>Пример, объяснение и проверка · стр. ${day.pdfPage}</small></span>${icon('arrow')}</a>
    <details class="day-explanation" id="explain-${week}-${day.offset}" data-preserve><summary>Прочитать объяснение здесь ${icon('chevron')}</summary><p>${e(unit.explain)}</p><pre><code>${e(unit.code)}</code></pre><strong>Ожидаемый результат</strong><p>${e(unit.expected)}</p><strong>Если запутался</strong><p>${e(unit.pitfall)}</p></details>
    <div class="day-video-heading"><span>Видео на выбор</span><small>Достаточно одного подходящего разбора</small></div>
    <div class="day-video-options">${videos.map((video,i)=>external(video.url,`<span class="day-play">▶</span><span><strong>${e(video.title)}</strong><small>${e(video.channel)} · YouTube</small></span><span class="language-tag">${e(video.language)}</span>`,'day-video-option')).join('')}</div>
    <div class="day-search-links">${external('https://www.youtube.com/results?search_query='+encodeURIComponent(query+' объяснение на русском'), 'Найти точнее на YouTube')}${external('https://rutube.ru/search/?query='+encodeURIComponent(query),'Поиск на RuTube')}</div>
    <p class="day-video-note">Это курсы и разборы на выбор. Открой подходящую главу; смотреть всё целиком не нужно. Для узкой темы используй поиск выше.</p></div>
    <details class="day-notes" id="notes-${week}-${day.offset}" data-preserve ${note?'open':''}><summary>${icon('book')} Мои заметки к этому дню ${icon('chevron')}</summary><label for="note-${week}-${day.offset}" class="sr-only">Заметки к занятию: ${e(day.title)}</label><textarea id="note-${week}-${day.offset}" data-note="w${week}-day-note-${day.offset}" maxlength="20000" rows="3" placeholder="Что понял? Где застрял?">${e(note)}</textarea><small>Сохраняются автоматически в твоём профиле</small></details>
    <label class="day-completion ${complete?'completed':''}"><input type="checkbox" data-day="${day.offset}" aria-label="${day.optional?'Отметить повторение':'Завершить занятие'}: ${e(day.title)}" ${complete?'checked':''}><span class="day-check-icon" aria-hidden="true">${icon('check')}</span><span>${complete?'Занятие выполнено':day.optional?'Повторение сделано':'Отметить занятие выполненным'}</span></label>
  </div>`;
}

export function renderDayWeek({week,lesson,start,done,note,schedule,allTaskIds,today=dateOnly()}) {
  const days=datedDays(start,week.number,lesson.days,today),p=daySummary(done,week.number),overall=progress(allTaskIds,done);
  const next=days.find(day=>!day.optional&&!dayComplete(done,week.number,day.offset));
  const dateRange=days[0].label+' — '+days[6].label;
  const sharedLesson={...lesson,videos:lesson.videos};
  return `<div class="daily-page-heading"><div><span class="eyebrow">ТВОЙ ЛИЧНЫЙ УЧЕБНЫЙ ПЛАН</span><h1>Одна неделя.<br class="mobile-only"> Понятные шаги.</h1><p>Открой день, выбери видео и попробуй пример. Всё нужное — в карточке.</p></div><a class="daily-guide-link" href="#guide">${icon('spark')} Я только начинаю ${icon('arrow')}</a></div>
  <section class="week-overview"><div class="week-overview-copy"><span class="week-number-label">НЕДЕЛЯ ${String(week.number).padStart(2,'0')} / 52</span><h2>${e(week.title)}</h2><p class="week-date-range">${icon('calendar')} ${e(dateRange)}</p><div class="week-picker"><button class="icon-button" data-week="${week.number-1}" ${week.number===1?'disabled':''} aria-label="Предыдущая неделя">${icon('arrow','flip')}</button><label class="sr-only" for="week-select">Выбрать неделю</label><select id="week-select">${Array.from({length:52},(_,i)=>`<option value="${i+1}" ${week.number===i+1?'selected':''}>Неделя ${i+1}</option>`).join('')}</select><button class="icon-button" data-week="${week.number+1}" ${week.number===52?'disabled':''} aria-label="Следующая неделя">${icon('arrow')}</button></div></div><div class="week-overview-progress"><span class="week-progress-value">${p.done}<small> / ${p.total}</small></span><span>прогресс занятий недели</span><div class="day-meter" role="progressbar" aria-label="Прогресс учебных дней недели" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.percent}"><span style="width:${p.percent}%"></span></div>${next?`<button class="button" data-day-focus="${next.offset}">К следующему занятию ${icon('arrow')}</button>`:'<p class="week-finished">Все занятия недели отмечены ✓</p>'}</div></section>
  <nav class="day-strip" aria-label="Дни выбранной недели">${days.map(day=>`<button data-day-focus="${day.offset}" class="day-strip-item ${day.today?'is-today':''} ${dayComplete(done,week.number,day.offset)?'is-complete':''}" ${day.today?'aria-current="date"':''}><span>${e(day.shortDay)}</span><strong>${dayComplete(done,week.number,day.offset)?'✓':day.date.slice(-2)}</strong><small>${day.optional?'Свободно':'Занятие'}</small></button>`).join('')}</nav>
  <div class="daily-grid">${days.map(day=>{
    const complete=dayComplete(done,week.number,day.offset),nextDay=next?.offset===day.offset;
    const caption=`<span class="day-weekday">${e(day.weekday)}<small>${e(day.label)}</small></span><span class="day-time">${day.optional?'По желанию':e(schedule[day.offset].time)}<small>${day.optional?'10–15 минут, если захочется':'Примерно '+day.minutes+' мин'}</small></span>`;
    const body=dayBody(day,sharedLesson,done,note(`w${week.number}-day-note-${day.offset}`),week.number,schedule);
    return `<details id="day-${week.number}-${day.offset}" name="week-${week.number}-days" class="day-card ${day.optional?'day-optional':''} ${complete?'is-done':''} ${nextDay?'is-next':''} ${day.today?'is-today':''}" data-preserve tabindex="-1" ${nextDay?'open':''}><summary><div class="day-card-head">${caption}${nextDay?'<span class="next-day-dot" title="Следующее занятие"></span>':''}</div><div class="optional-caption"><span>${complete?'✓':icon(day.optional?'spark':day.kind==='ai'?'spark':'book')}</span><div><strong>${e(day.title)}</strong><small>${day.optional?'Свободный день · открой для лёгкого повторения':nextDay?'Следующее занятие · начни здесь':'Учебный день · открой карточку'}</small></div>${icon('chevron')}</div></summary>${body}</details>`;
  }).join('')}</div>
  <section class="week-closing panel"><div><span class="eyebrow">РЕЗУЛЬТАТ НЕДЕЛИ</span><h2>${e(week.deliverable)}</h2><p>Необязательные дни можно пропустить. Если не успел — продолжи с последнего занятия, без гонки за календарём.</p></div><a class="button secondary" href="${e(lesson.pdf)}" download="dev-growth-week-${String(week.number).padStart(2,'0')}.pdf">${icon('download')} Вся неделя в PDF</a></section>
  <section class="weekly-notes panel"><label for="week-note">${icon('book')} Итоги и заметки недели</label><textarea id="week-note" data-note="week-${week.number}" maxlength="20000" rows="3" placeholder="Что получилось? Что хочется повторить?">${e(note('week-'+week.number))}</textarea><small>Старые заметки недели — здесь. Новые можно вести и в каждой карточке.</small></section>
  <div class="daily-footer-progress"><span>${icon('route')} Весь маршрут: <strong>${overall.done} / ${overall.total} результатов · ${overall.percent}%</strong></span><span>${e(level(overall.percent))}</span><a href="#roadmap">Все 52 недели ${icon('arrow')}</a></div>`;
}
