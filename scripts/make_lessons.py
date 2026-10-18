#!/usr/bin/env python3
"""Build the 52 authored weekly PDFs and day-card manifest. No network/AI calls.
Requires reportlab 4.4.9 and DejaVu Sans/Mono fonts (Ubuntu: fonts-dejavu-core).
The committed PDFs let Cloudflare build the website using Node alone.
"""
import json,re,os
from pathlib import Path
from html import escape
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,PageBreak,Preformatted,KeepTogether,HRFlowable
from reportlab.lib.styles import getSampleStyleSheet,ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.pagesizes import A4

ROOT=Path(__file__).resolve().parents[1]
source=json.loads((ROOT/'content/lessons-source.json').read_text())
roadmap=json.loads((ROOT/'data/roadmap.json').read_text())
OUT=ROOT/'data/lessons';OUT.mkdir(exist_ok=True)
font_root=Path(os.environ.get('DEVGROWTH_FONT_DIR','/usr/share/fonts/truetype/dejavu'))
for name,file in [('Body','DejaVuSans.ttf'),('Bold','DejaVuSans-Bold.ttf'),('Code','DejaVuSansMono.ttf')]:
 pdfmetrics.registerFont(TTFont(name,str(font_root/file)))
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='Kicker',fontName='Bold',fontSize=8,leading=12,textColor=colors.HexColor('#7960d7'),spaceAfter=12))
styles.add(ParagraphStyle(name='TitleDG',fontName='Bold',fontSize=27,leading=34,textColor=colors.HexColor('#22243c'),spaceAfter=18))
styles.add(ParagraphStyle(name='H1DG',fontName='Bold',fontSize=20,leading=26,textColor=colors.HexColor('#22243c'),spaceAfter=16))
styles.add(ParagraphStyle(name='H2DG',fontName='Bold',fontSize=11,leading=16,textColor=colors.HexColor('#7153c8'),spaceBefore=13,spaceAfter=6,keepWithNext=True))
styles.add(ParagraphStyle(name='BodyDG',fontName='Body',fontSize=9.7,leading=15.8,textColor=colors.HexColor('#303349'),spaceAfter=9))
styles.add(ParagraphStyle(name='SmallDG',fontName='Body',fontSize=8,leading=12.5,textColor=colors.HexColor('#72758b'),spaceAfter=7))
styles.add(ParagraphStyle(name='CodeDG',fontName='Code',fontSize=8.4,leading=12,textColor=colors.HexColor('#26243e'),backColor=colors.HexColor('#f3effb'),borderPadding=10,spaceBefore=7,spaceAfter=12))
styles.add(ParagraphStyle(name='CalloutDG',fontName='Body',fontSize=9,leading=15,textColor=colors.HexColor('#4c3a79'),backColor=colors.HexColor('#f3effb'),borderPadding=11,spaceBefore=8,spaceAfter=10))

def p(text,style='BodyDG'):return Paragraph(escape(text).replace('\n','<br/>'),styles[style])
def section(title,text):return [p(title,'H2DG'),p(text)]
def steps(text):
 parts=re.split(r'(?<=[.!?])\s+(?=[А-ЯЁA-Z])',text)
 return [p(f'{i+1}. {item}') for i,item in enumerate(parts)]
def env_text(mode,n):
 if mode=='console':return f'Отдельная папка для опыта: dotnet new console -n Week{n:02}; затем cd Week{n:02}. Замени Program.cs примером и выполни dotnet run. Нужен установленный поддерживаемый .NET SDK; здесь используются возможности C# 12 и новее.'
 if mode=='web':return f'В отдельной папке: dotnet new web -n Week{n:02}Api; затем cd Week{n:02}Api. Замени Program.cs, выполни dotnet run. Адрес и порт возьми из своего терминала. GET открой в браузере; для POST используй .http-файл редактора или HTTP-клиент.'
 if mode=='sql':return 'Открой SQL-редактор отдельной учебной PostgreSQL (например, pgAdmin). Выполни команды в одном соединении. TEMP-таблицы исчезнут после закрытия соединения. Не выполняй эксперименты на единственной рабочей базе.'
 if mode=='shell':return 'Это команды терминала. Открой отдельную учебную копию проекта. Строки с # — комментарии. Сначала прочитай команды; пути и имена файлов должны соответствовать твоей копии.'
 if mode=='sketch':return 'Это учебный эскиз, а не самостоятельная программа. Настрой нужный проект и пакеты по официальной документации; подставь свои имена моделей, путей и переменных. Не копируй фрагмент в Program.cs без подготовки.'
 return 'Этот пример — схема, текст или макет ответа. Запиши его в заметке или Markdown-файле. Он объясняет логику и не требует API-ключа. Реальный AI-провайдер, если понадобится позже, подключается отдельно.'

def wrapped_code(text):
 # Wrap at token boundaries so examples are never clipped by a PDF text box.
 lines=[]
 for line in text.splitlines():
  while len(line)>88:
   split=line.rfind(' ',0,88)
   if split<20:split=86
   lines.append(line[:split]);line='  '+line[split:].lstrip()
  lines.append(line)
 return '\n'.join(lines)

# Two genuine course options plus a clearly labelled topic search in the UI.
# Existing resources are retained; new Git course URLs were checked via search.
videos={v['id']:v for v in roadmap['videos']}
for v in [
 {'id':'git-mosh','title':'Git: первые коммиты и история изменений','url':'https://www.youtube.com/watch?v=8JJ101D3knE','channel':'Programming with Mosh','language':'EN','category':'Git','purpose':'Бесплатная вводная часть курса: snapshots, staging, diff и история. Для недели 20.','type':'youtube'},
 {'id':'git-full','title':'Learn Git — полный курс для начинающих','url':'https://www.youtube.com/watch?v=zTjRZNkhiEU','channel':'freeCodeCamp.org','language':'EN','category':'Git','purpose':'Альтернативный разбор основ Git; выбери нужную главу курса.','type':'youtube'}]:
 v.update({'checkedOn':'2026-10-18','verification':'Найдено в веб-поиске; воспроизведение не проверялось'});videos[v['id']]=v


def core_video_ids(n,w):
 if n==20:return ['git-mosh','git-full']
 ids=[x for x in w['videos'] if videos[x]['category']!='AI']
 if len(ids)<2:ids=['agent-a','agent-b'] if 25<=n<=32 else ['api-a','api-b']
 return ids[:2]
def ai_video_ids(n):
 if n<=4:return ['ai-base','ai-net']
 if n<=8:return ['ai-net','ai-base']
 if 17<=n<=24 or n in [35,41,42]:return ['rag','ai-base']
 return ['agent-a','agent-b']

DOCS={
 'csharp':'https://learn.microsoft.com/ru-ru/dotnet/csharp/',
 'linq':'https://learn.microsoft.com/ru-ru/dotnet/csharp/tutorials/working-with-linq',
 'aspnet':'https://learn.microsoft.com/ru-ru/aspnet/core/fundamentals/',
 'sql':'https://www.postgresql.org/docs/current/tutorial.html',
 'indexes':'https://www.postgresql.org/docs/current/indexes.html',
 'ai':'https://learn.microsoft.com/en-us/dotnet/ai/quickstarts/build-chat-app',
 'local-ai':'https://learn.microsoft.com/en-us/dotnet/ai/quickstarts/chat-local-model',
 'pgvector':'https://github.com/pgvector/pgvector',
 'git':'https://git-scm.com/docs/gittutorial',
 'docker':'https://hub.docker.com/_/postgres',
 'testing':'https://learn.microsoft.com/ru-ru/dotnet/core/testing/',
 'actions':'https://docs.github.com/en/actions',
 'architecture':'https://learn.microsoft.com/en-us/dotnet/architecture/'
}
def core_ref(n):
 if n==2:return DOCS['linq']
 if n in [7,8,33,34,44,47,48]:return DOCS['testing']
 if 9<=n<=12:return DOCS['aspnet']
 if 13<=n<=16:return DOCS['sql']
 if n in [17,18,19,42]:return DOCS['indexes']
 if n==20:return DOCS['git']
 if n==21:return DOCS['docker']
 if n==22:return DOCS['actions']
 if n>=25:return DOCS['architecture']
 return DOCS['csharp']

def day_definitions(n,w,c,a):
 cv=core_video_ids(n,w);av=ai_video_ids(n)
 return [
 {'offset':0,'kind':'core','optional':False,'minutes':45,'title':c['title'],'summary':c['explain'],
  'steps':['Прочитай короткий разбор и запусти пример из PDF.','Выбери одно видео и посмотри нужный раздел.','Начни упражнение: '+c['exercise']],
  'goal':c['expected'],'videoIds':cv,'unit':'core'},
 {'offset':1,'kind':'recall','optional':True,'minutes':10,'title':'Вспомнить без подсказки',
  'summary':'Лёгкое повторение темы «'+c['title']+'». Можно пропустить и отдохнуть.',
  'steps':['Ответь своими словами: '+c['check'].split('?')[0]+'?','Сверь ответ с PDF.','Запиши одно непонятное слово.'],
  'goal':'Можешь объяснить одну идею без копирования определения.','videoIds':cv,'unit':'core'},
 {'offset':2,'kind':'reserve','optional':True,'minutes':15,'title':'Резерв или спокойный повтор',
  'summary':'Если всё идёт по плану, это свободный день. Если застрял — разбери одну ошибку, не всю тему заново.',
  'steps':['Открой пример понедельника и повтори его запуск.','Проверь подсказку: '+c['pitfall'],'Запиши, что изменилось и какой получился результат.'],
  'goal':'Есть один повторяемый пример или понятный вопрос к следующему занятию.','videoIds':cv,'unit':'core'},
 {'offset':3,'kind':'ai','optional':False,'minutes':45,'title':a['title'],'summary':a['explain'],
  'steps':['Прочитай схему и ожидаемый результат в PDF.','Выбери один видеовариант по теме.','Выполни учебный эксперимент: '+a['exercise']],
  'goal':a['expected'],'videoIds':av,'unit':'ai'},
 {'offset':4,'kind':'prepare','optional':True,'minutes':10,'title':'Подготовить субботний шаг',
  'summary':'Небольшая подготовка по желанию. Субботний результат: '+w['deliverable']+'.',
  'steps':['Открой свой учебный проект, не папку трекера.','Запиши один ожидаемый результат и способ его проверки.','Оставь себе короткую заметку, с чего начать.'],
  'goal':'Понятен первый шаг субботы; писать код сегодня необязательно.','videoIds':cv,'unit':'core'},
 {'offset':5,'kind':'project','optional':False,'minutes':120,'title':'Применить в своём проекте','summary':w['deliverable'],
  'steps':re.split(r'(?<=[.!?])\s+(?=[А-ЯЁA-Z])',c['project']),
  'goal':w['deliverable'],'videoIds':cv,'unit':'core'},
 {'offset':6,'kind':'review','optional':False,'minutes':120,'title':'Закрепить и подвести итог',
  'summary':'45 минут — закончить основной пример, 30 — объяснить решение, 45 — проверить и записать итог. Публичный запуск не нужен.',
  'steps':['Закончи упражнение понедельника и ответь на контрольный вопрос.','Объясни: что получилось, почему так и какая есть альтернатива.','Проверь результат и запиши один следующий шаг.'],
  'goal':'Можешь показать результат недели и своими словами объяснить одно решение.','videoIds':av,'unit':'core'}]

class Manual(SimpleDocTemplate):
 def __init__(self,*args,**kwargs):
  super().__init__(*args,**kwargs);self.day_pages={}
 def afterFlowable(self,flowable):
  key=getattr(flowable,'day_key',None)
  if key is not None:
   self.day_pages[key]=self.canv.getPageNumber();self.canv.bookmarkPage(f'day-{key}')
   self.canv.addOutlineEntry(f'День {key+1}',f'day-{key}',0)

def chrome(canvas,doc):
 canvas.saveState();width,height=A4
 canvas.setFillColor(colors.HexColor('#7860d7'));canvas.rect(0,height-9,width,9,fill=1,stroke=0)
 canvas.setFont('Bold',8);canvas.drawString(42,height-30,'devgrowth / личная учебная тетрадь')
 canvas.setFillColor(colors.HexColor('#8a8b9d'));canvas.setFont('Body',7)
 canvas.drawString(42,25,'Авторский разбор · примеры учебные · даты занятий смотри в трекере')
 canvas.drawRightString(width-42,25,str(doc.page));canvas.restoreState()

manifest={'version':1,'created':source['created'],'author':source['author'],'videos':list(videos.values()),'weeks':[]}
for n,(w,c,a) in enumerate(zip(roadmap['weeks'],source['core'],source['ai']),1):
 days=day_definitions(n,w,c,a)
 filename=f'week-{n:02}.pdf';doc=Manual(str(OUT/filename),pagesize=A4,rightMargin=43,leftMargin=43,topMargin=53,bottomMargin=44,
  title=f'Неделя {n:02}: {w["title"]} — разборы по дням',author='Dev Growth / авторская учебная тетрадь',pageCompression=1,invariant=1)
 story=[p(f'НЕДЕЛЯ {n:02} / 52','Kicker'),p(w['title'],'TitleDG'),p('Понятно. По дням. С практикой.','H1DG'),
  p('Это твоя учебная тетрадь: объяснения простыми словами, небольшие примеры и проверка результата. Не нужно смотреть все видео или делать необязательные дни. Все материалы подготовлены для личного обучения, публичный выпуск проекта не требуется.'),
  p('Как пользоваться','H2DG'),p('Открой нужный день из карточки трекера. Прочитай объяснение, выбери одно видео и попробуй пример самостоятельно. Когда получился ожидаемый результат, отметь занятие. Кнопка PDF в карточке ведёт сразу к нужному разделу.'),
  p('Ритм недели','H2DG')]
 for day in days:
  text=f'День {day["offset"]+1}. {day["title"]} — '+('по желанию, ' if day['optional'] else '')+str(day['minutes'])+' мин'
  story.append(Paragraph(f'<link href="#day-{day["offset"]}" color="#7153c8">{escape(text)}</link>',styles['BodyDG']))
 story+=section('Результат недели',w['deliverable'])
 story.append(p('Неделя привязана к дате начала в трекере. Основная работа: 45 + 45 + 120 + 120 минут. Дни 2, 3 и 5 — резерв, их можно пропустить без отставания. Примеры выполняются в отдельном учебном проекте, а не в коде сайта-трекера.','SmallDG'))
 for day in days:
  offset=day['offset'];u=a if day['unit']=='ai' else c
  story.append(PageBreak());story.append(p(f'ДЕНЬ {offset+1} / '+('ПО ЖЕЛАНИЮ' if day['optional'] else f'{day["minutes"]} МИНУТ'),'Kicker'))
  heading=p(day['title'],'H1DG');heading.day_key=offset;story.append(heading)
  if offset in [0,3]:
   story+=section('Простыми словами',u['explain'])
   story+=section('Где попробовать',env_text(u['mode'],n))
   story.append(p('Пример','H2DG'));story.append(Preformatted(wrapped_code(u['code']),styles['CodeDG']))
   story+=section('Что должно получиться',u['expected'])
   story+=section('Попробуй сам',u['exercise'])
   story+=section('Если запутался',u['pitfall'])
  elif offset==1:
   story+=section('Без обязательств','Этот день можно оставить свободным. Если есть 10 минут, попробуй вспомнить тему без видео и кода перед глазами.')
   story+=section('Вопрос себе',c['check'].split('?')[0]+'?')
   story+=section('Проверка ответа',c['check'])
   story+=section('Один маленький опыт',c['exercise'])
   story+=section('Как заметить понимание','Ты можешь предсказать результат примера, объяснить его и назвать один случай, когда этот приём не подходит. Не требуется идеальный ответ с первого раза.')
  elif offset==2:
   story+=section('Если ничего не пропущено','Отдохни. Резервный день не создаёт новую обязательную задачу. Если хочется повторить, выбери только один небольшой вопрос.')
   story+=section('Разбор типичной трудности',c['pitfall'])
   story+=section('Простой способ отладки','Запиши, что ожидал увидеть, и что увидел на самом деле. Сведи пример к нескольким строкам. Меняй только одно условие за раз и повторяй запуск.')
   story+=section('Где проверить пример',env_text(c['mode'],n))
   story+=section('Ожидаемый ориентир',c['expected'])
  elif offset==4:
   story+=section('По желанию, без написания кода','Подготовь начало субботнего занятия. Публично выкладывать результат не требуется. Достаточно отдельной учебной папки и понятного первого шага.')
   story+=section('Результат субботы',w['deliverable'])
   story+=section('С чего начать',c['project'])
   story+=section('Шаблон заметки','Хочу получить: ...\nПервое действие: ...\nКак проверю: ...\nЧто пока непонятно: ...')
  elif offset==5:
   story+=section('Один результат вместо большой переделки',w['deliverable'])
   story+=section('Связь с темой',c['explain'])
   story.append(p('Порядок действий','H2DG'));story+=steps(c['project'])
   story+=section('Как распределить два часа','15 минут — открыть проект и повторить пример. 60 — сделать один небольшой шаг. 30 — проверить обычный путь и одну границу. 15 — записать итог и сохранить изменение локально.')
   story+=section('Проверка перед отметкой','Покажи результат на вымышленных данных. Проверь один неверный вход или отказ. Сохрани, что ожидалось и что получилось. Если не успел, оставь короткий следующий шаг и продолжи в воскресенье.')
   story+=section('Подсказка',c['pitfall'])
  else:
   story+=section('45 минут: завершить основной пример',c['exercise'])
   story+=section('Контрольный вопрос',c['check'])
   story+=section('30 минут: объяснить решение',w['tasks'][3]['title']+' Для личного обучения достаточно голосовой заметки или нескольких абзацев самому себе.')
   story+=section('45 минут: проверить и записать итог','Проверь результат недели: '+w['deliverable']+'. Затем запиши: что понял, где застрял и какой один шаг сделаешь дальше. Сохрани резервную копию прогресса трекера.')
   story+=section('AI-вопрос недели',a['check'])
   story+=section('Как считаются отметки','Понедельник и воскресное закрепление вместе закрывают основной трек. Четверг закрывает AI-практику, суббота — проект. Воскресенье также включает объяснение решения и недельный обзор. Старые отметки трекера сохраняются.')
  story.append(p('Материалы на выбор','H2DG'))
  story.append(p('Выбери один подходящий раздел одного видео; смотреть два курса целиком не нужно. Большие курсы не обязаны содержать каждую узкую тему. Точечный поиск по теме и русскоязычный поиск доступны в карточке дня.','SmallDG'))
  for vid in day['videoIds']:
   v=videos[vid];story.append(Paragraph(f'<link href="{escape(v["url"],quote=True)}" color="#7153c8">{escape(v["title"])} · {v["language"]}</link>',styles['BodyDG']))
  ref=DOCS['ai'] if offset==3 else core_ref(n)
  story.append(Paragraph(f'<link href="{escape(ref,quote=True)}" color="#7153c8">Официальный материал для сверки примера</link>',styles['SmallDG']))
  story.append(p('Видео подобраны как варианты, не как обязательный список. Воспроизведение и доступность зависят от платформы. Объяснения и примеры этого PDF написаны отдельно для плана; это не копия или расшифровка курсов.','SmallDG'))
 doc.build(story,onFirstPage=chrome,onLaterPages=chrome)
 for day in days:day['pdfPage']=doc.day_pages[day['offset']]
 manifest['weeks'].append({'number':n,'title':w['title'],'pdf':f'/data/lessons/{filename}','pages':doc.page,'core':c,'ai':a,'days':days})
(ROOT/'data/lessons.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(f'Built {len(manifest["weeks"])} PDFs; {sum(w["pages"] for w in manifest["weeks"])} pages; 364 day cards.')
