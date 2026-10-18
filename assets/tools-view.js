import {escapeHtml as e,safeURL} from './core.js?v=6';
import {icon} from './icons.js?v=6';

export function matchingTools(content,query='',category='all') {
  const terms=query.toLocaleLowerCase('ru-RU').trim().split(/\s+/).filter(Boolean);
  return content.articles.filter(article=>(category==='all'||article.category===category)&&terms.every(term=>JSON.stringify(article).toLocaleLowerCase('ru-RU').includes(term)));
}

const codeBlock=(step,article,index)=>step.code?`<div class="code-block tool-code"><div class="code-header"><span>${e(step.label||'Пример')}</span><button type="button" data-tool-copy="${e(article.id)}:${index}" aria-label="Скопировать: ${e(step.title)}">${icon('copy')} Копировать</button></div><pre><code>${e(step.code)}</code></pre></div>`:'';

export function renderToolResults(content,query='',category='all') {
  const articles=matchingTools(content,query,category);
  return `<p class="tool-result-count" role="status">Найдено инструкций: ${articles.length} из ${content.articles.length}</p>`+(articles.length?`<div class="tool-articles">${articles.map(article=>`<details class="tool-article panel" id="tool-${e(article.id)}" data-preserve>
    <summary><span class="tool-mark" aria-hidden="true">${icon(article.category==='start'?'terminal':article.category==='data'?'code':'spark')}</span><span class="tool-summary-copy"><span class="tool-badge">${e(article.badge)}<span>· ${e(article.time)}</span></span><h2>${e(article.title)}</h2><span class="tool-summary-text">${e(article.summary)}</span></span>${icon('chevron')}</summary>
    <div class="tool-article-body"><p class="tool-why">${e(article.why)}</p><ol class="tool-steps">${article.steps.map((step,index)=>`<li><span class="tool-step-number" aria-hidden="true">${String(index+1).padStart(2,'0')}</span><div><h3>${e(step.title)}</h3><p>${e(step.text)}</p>${codeBlock(step,article,index)}</div></li>`).join('')}</ol>
    <div class="tool-result">${icon('check')}<div><strong>Как понять, что получилось</strong><p>${e(article.result)}</p></div></div>
    <div class="tool-advice"><h3>Что советую</h3><ul>${article.tips.map(tip=>`<li>${e(tip)}</li>`).join('')}</ul></div>
    <div class="tool-problems"><h3>Если что-то пошло не так</h3>${article.problems.map(problem=>`<details><summary>${e(problem.title)}${icon('chevron')}</summary><p>${e(problem.text)}</p></details>`).join('')}</div>
    <div class="tool-links"><span>Официальные материалы</span>${article.links.map(link=>`<a href="${e(safeURL(link.url))}" target="_blank" rel="noopener noreferrer">${e(link.label)} ${icon('external')}</a>`).join('')}</div></div>
  </details>`).join('')}</div>`:`<div class="panel tool-empty">${icon('book')}<h2>Такой инструкции пока нет</h2><p>Попробуй «Rider», «коммит», «база» или сбрось фильтры.</p><button type="button" class="button secondary" id="tools-reset">Показать все инструкции</button></div>`);
}

export function renderTools(content,{query='',category='all'}={}) {
  const labels=['Установи SDK','Настрой Rider','Сделай коммит','Отправь в GitHub'];
  return `<div class="page-heading tools-page-heading"><div><div class="eyebrow">СПРАВКА, К КОТОРОЙ МОЖНО ВЕРНУТЬСЯ</div><h1>Твоя рабочая мастерская.</h1><p>${e(content.intro)}</p></div><button type="button" class="button secondary" id="tools-print">${icon('download')} Сохранить в PDF</button></div>
  <section class="tools-starter"><div class="tools-starter-copy"><span class="eyebrow">СНАЧАЛА — ТОЛЬКО НЕОБХОДИМОЕ</span><h2>Один редактор.<br>Первый запуск. Первый коммит.</h2><p>Для старта выбирай Rider + .NET SDK + Git. VS Code — альтернатива. Базы данных, API-клиенты и Docker подключай, когда они появятся в плане.</p><div class="tools-stack"><span>.NET 10 LTS</span><span>Rider</span><span>Git + GitHub</span></div></div><div class="tools-start-route"><span class="eyebrow">ТВОИ ПЕРВЫЕ ЧЕТЫРЕ ШАГА</span>${content.quickStart.map((id,index)=>`<button type="button" data-tool-open="${e(id)}"><span>${index+1}</span>${labels[index]}${icon('arrow')}</button>`).join('')}</div></section>
  <div class="tools-usage"><span>${icon('book')} Открой инструкцию → выполни шаг → проверь результат.</span><span>Команды подписаны: куда их вводить. Меню программ могут немного отличаться.</span></div>
  <section class="tools-library" aria-label="Инструкции по инструментам"><div class="tools-toolbar"><label class="tools-search"><span>${icon('search')}</span><input id="tools-search" type="search" placeholder="Rider, коммит, PostgreSQL, ошибка…" aria-label="Поиск по справке" value="${e(query)}" autocomplete="off"></label><div class="tools-categories" role="group" aria-label="Категория справки">${[{id:'all',title:'Всё'},...content.categories].map(item=>`<button type="button" data-tools-category="${e(item.id)}" aria-pressed="${item.id===category}" class="${item.id===category?'active':''}">${e(item.title)}</button>`).join('')}</div></div><div id="tools-results">${renderToolResults(content,query,category)}</div></section>
  <div class="tool-footer-note">${icon('shield')}<p>Справка — для личной практики. Условия лицензий и интерфейсы сервисов меняются: ссылки на официальные материалы есть в каждой инструкции. <a href="#guide">Как пользоваться самим трекером ${icon('arrow')}</a></p></div>`;
}

export function printToolsGuide(content) {
  document.getElementById('tools-print-document')?.remove();
  const documentRoot=document.createElement('section');
  documentRoot.id='tools-print-document';
  documentRoot.innerHTML=`<h1>Dev Growth · ${e(content.title)}</h1><p>${e(content.intro)}</p><p>Для старта: .NET SDK → Rider или VS Code → Git → GitHub. Остальное — по мере обучения. Команды выполняй в указанном месте; значения-заглушки сначала замени своими.</p>${renderToolResults(content)}`;
  documentRoot.querySelectorAll('[id]').forEach(element=>element.removeAttribute('id'));
  documentRoot.querySelectorAll('details').forEach(element=>element.open=true);
  document.body.append(documentRoot);
  window.addEventListener('afterprint',()=>documentRoot.remove(),{once:true});
  try{window.print();}catch(error){documentRoot.remove();throw error;}
}
