/* CallSliven — reference data and SAMPLE reports for the prototype.
   Categories, sub-categories, priorities and institutions follow the agreed table.
   When the backend is connected, REPORTS will come from the API instead. */
(() => {
  const I = (bg, en) => ({ bg, en });
  const MUN_TECH = I('Община, Техническа инфраструктура', 'Municipality, Technical infrastructure');
  const MUN_BUILD = I('Община, Строителен контрол', 'Municipality, Construction control');
  const MUN_ECO = I('Община, Екология', 'Municipality, Ecology');
  const CRISIS = I('Управление при кризи', 'Crisis management');

  /* icon paths (24×24, stroke) per category */
  const ICONS = {
    roads: '<path d="M8 3 4 21M16 3l4 18M12 4v2M12 10v3M12 17v3"/>',
    utilities: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    environment: '<path d="M11 20A7 7 0 0 1 4 13c0-6 7-10 16-10 0 9-4 16-10 16"/><path d="M4 21c3-5 6-8 11-11"/>',
    animals: '<circle cx="5" cy="10" r="2"/><circle cx="9" cy="5" r="2"/><circle cx="15" cy="5" r="2"/><circle cx="19" cy="10" r="2"/><path d="M12 11c-3 0-6 4-6 7 0 2 2 3 3.5 2.5 1-.3 1.6-.8 2.5-.8s1.5.5 2.5.8C16 21 18 20 18 18c0-3-3-7-6-7z"/>',
    construction: '<path d="M3 21h18M6 21V8l6-4 6 4v13M10 21v-5h4v5M10 11h4"/>',
    transport: '<rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 11h16M8 21l1-3M16 21l-1-3"/><circle cx="8" cy="14.5" r=".8"/><circle cx="16" cy="14.5" r=".8"/>',
    safety: '<path d="M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6z"/><path d="M12 8v5M12 16h.01"/>',
    health: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/><path d="M12 9v6M9 12h6"/>',
    other: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'
  };

  /* priority: 0 low, 1 medium, 2 high, 3 critical */
  const CATEGORIES = [
    { id:'roads', key:'cRoads', subs:[
      { name:I('Опасна дупка на улица','Dangerous pothole'), p:2, inst:MUN_TECH },
      { name:I('Повреден тротоар','Damaged sidewalk'), p:1, inst:MUN_TECH },
      { name:I('Пътна маркировка, знаци, пешеходни пътеки','Road markings, signs, crossings'), p:1, inst:MUN_TECH },
      { name:I('Неработещ светофар','Traffic light out of order'), p:2, inst:MUN_TECH },
      { name:I('Републикански път / АМ „Тракия“','National road / Trakia motorway'), p:2, inst:I('ОПУ Сливен','Regional Road Administration Sliven') },
      { name:I('Нарушена настилка след разкопаване','Surface damaged after excavation'), p:1, inst:MUN_BUILD }
    ]},
    { id:'utilities', key:'cUtil', subs:[
      { name:I('Неработещо улично осветление','Street lighting out'), p:1, inst:I('Сименс мобилити','Siemens Mobility') },
      { name:I('Паднал стълб или кабел под напрежение','Fallen pole or live cable'), p:3, inst:I('ЕВН','EVN'), copy:CRISIS },
      { name:I('Спряно електрозахранване','Power outage'), p:2, inst:I('ЕВН','EVN') },
      { name:I('Авария на водопровод, липса на вода','Water main failure, no water'), p:2, inst:I('ВиК Сливен','ViK Sliven') },
      { name:I('Запушена канализация, шахта без капак','Blocked sewer, missing manhole cover'), p:2, inst:I('ВиК Сливен','ViK Sliven') },
      { name:I('Миризма на газ, изтичане','Gas smell or leak'), p:3, inst:I('Газтрейд Сливен','Gastrade Sliven'), copy:CRISIS },
      { name:I('Проблем с топлоснабдяването','District heating problem'), p:1, inst:I('Топлофикация Сливен','Toplofikatsia Sliven') }
    ]},
    { id:'environment', key:'cEnv', subs:[
      { name:I('Нередовно сметоизвозване','Irregular waste collection'), p:1, inst:MUN_ECO },
      { name:I('Нерегламентирано сметище','Illegal dump'), p:1, inst:MUN_ECO },
      { name:I('Екологично замърсяване','Environmental pollution'), p:2, inst:I('РИОСВ','Regional Environment Inspectorate (RIOSV)') },
      { name:I('Опасно дърво или клон','Dangerous tree or branch'), p:2, inst:MUN_ECO },
      { name:I('Повредена детска площадка или пейка','Damaged playground or bench'), p:1, inst:MUN_ECO },
      { name:I('Неподдържана зелена площ','Neglected green area'), p:0, inst:MUN_ECO }
    ]},
    { id:'animals', key:'cAnimals', subs:[
      { name:I('Безстопанствени животни','Stray animals'), p:1, inst:MUN_ECO },
      { name:I('Нехуманно отношение към животни','Animal cruelty'), p:1, inst:I('ОДБХ','Regional Food Safety Directorate (ODBH)') }
    ]},
    { id:'construction', key:'cBuild', subs:[
      { name:I('Незаконно строителство или гараж','Illegal construction or garage'), p:0, inst:MUN_BUILD },
      { name:I('Опасна или самосрутваща се сграда','Dangerous or collapsing building'), p:2, inst:MUN_BUILD }
    ]},
    { id:'transport', key:'cTransport', subs:[
      { name:I('Неправилно паркиране, синя зона','Illegal parking, blue zone'), p:0, inst:I('ОП „Градска мобилност“','Urban Mobility (municipal enterprise)') },
      { name:I('Спирка или градски транспорт','Bus stop or public transport'), p:0, inst:I('Пътнически превози','Passenger transport') },
      { name:I('Нарушаване на обществения ред','Public order disturbance'), p:2, inst:I('ОДМВР','Regional Police Directorate') }
    ]},
    { id:'safety', key:'cSafety', subs:[
      { name:I('Пожар или опасност от пожар','Fire or fire hazard'), p:3, inst:I('РДПБЗН','Fire Safety and Civil Protection'), copy:CRISIS },
      { name:I('Авария или бедствие','Accident or disaster'), p:3, inst:CRISIS }
    ]},
    { id:'health', key:'cHealth', subs:[
      { name:I('Дезинсекция, дератизация','Pest control'), p:1, inst:I('Община, Социални дейности','Municipality, Social services') },
      { name:I('Хигиена, заразни болести, тютюнопушене','Hygiene, infectious diseases, smoking'), p:1, inst:I('РЗИ','Regional Health Inspectorate') },
      { name:I('Безопасност на храните','Food safety'), p:1, inst:I('ОДБХ','Regional Food Safety Directorate (ODBH)') }
    ]},
    { id:'other', key:'cOther', subs:[
      { name:I('Друго','Other'), p:0, inst:I('Неопределена институция','Institution to be determined') }
    ]}
  ];

  /* districts with an approximate centre (sample coordinates) */
  const DISTRICTS = [
    { id:'center', name:I('Център','City centre'), at:[42.6822, 26.3228] },
    { id:'klutsohor', name:I('Клуцохор','Klutsohor'), at:[42.6885, 26.3318] },
    { id:'druzhba', name:I('Дружба','Druzhba'), at:[42.6702, 26.3052] },
    { id:'sini-kamani', name:I('Сини камъни','Sini Kamani'), at:[42.6772, 26.3375] },
    { id:'novo-selo', name:I('Ново село','Novo Selo'), at:[42.6668, 26.3368] },
    { id:'balgarka', name:I('Българка','Balgarka'), at:[42.6965, 26.3165] },
    { id:'rechitsa', name:I('Речица','Rechitsa'), at:[42.6935, 26.3440] },
    { id:'nadezhda', name:I('Надежда','Nadezhda'), at:[42.6740, 26.3105] }
  ];

  /* sample reports: [category, sub index, district, offset lat, offset lng, days ago, status 0-3, title, description] */
  const RAW = [
    ['roads',0,'center',.0011,-.0008,9,3, I('Дупка на пешеходна пътека','Pothole at a pedestrian crossing'), I('Дълбока дупка точно на пешеходната пътека пред пощата. Колите рязко спират, за да я заобиколят.','A deep pothole right on the crossing in front of the post office. Cars brake sharply to avoid it.')],
    ['utilities',0,'druzhba',.0006,.0012,4,2, I('Три изгорели лампи в алея на парка','Three lamps out along a park alley'), I('Алеята между блоковете е напълно тъмна вечер. Хората минават с фенерчета.','The alley between the blocks is completely dark at night. People walk through with torches.')],
    ['environment',1,'sini-kamani',-.0015,.0021,2,1, I('Строителни отпадъци край реката','Construction waste dumped by the river'), I('Изсипани са тухли, мазилка и чували с отпадъци до коритото на Асеновска река.','Bricks, plaster and bags of rubble have been dumped next to the Asenovska river bed.')],
    ['environment',3,'klutsohor',.0004,-.0010,1,0, I('Паднал клон блокира тротоар','Fallen branch blocking a sidewalk'), I('След вятъра голям клон е паднал и затваря целия тротоар. Майки с колички слизат на платното.','After the wind a large branch fell and blocks the whole sidewalk. Parents with strollers have to step onto the road.')],
    ['utilities',3,'nadezhda',-.0009,.0007,3,2, I('Тече вода от шахта на улицата','Water leaking from a manhole'), I('От два дни от шахтата блика чиста вода и се стича по улицата.','For two days clean water has been gushing from the manhole and running down the street.')],
    ['roads',3,'center',-.0012,.0016,0,1, I('Светофарът мига жълто цял ден','Traffic light flashing yellow all day'), I('Светофарът на кръстовището не работи нормално от сутринта, само мига жълто.','The traffic light at the junction has only been flashing yellow since the morning.')],
    ['animals',0,'balgarka',.0010,.0005,6,2, I('Глутница кучета до училището','Pack of dogs near the school'), I('Около пет кучета се събират всяка сутрин до входа на училището.','About five dogs gather every morning by the school entrance.')],
    ['environment',4,'novo-selo',.0007,-.0014,14,3, I('Счупена люлка на детската площадка','Broken swing at the playground'), I('Едната верига на люлката е скъсана, седалката виси.','One chain of the swing is broken and the seat is hanging.')],
    ['transport',0,'center',.0018,.0004,5,1, I('Паркирани коли върху тротоара','Cars parked on the sidewalk'), I('Всеки ден коли паркират изцяло върху тротоара и пешеходците вървят по платното.','Every day cars park fully on the sidewalk and pedestrians walk on the road.')],
    ['roads',1,'klutsohor',-.0006,.0009,21,3, I('Разбити плочки на тротоара','Broken paving slabs on the sidewalk'), I('Плочките са надигнати от корените на дърветата, лесно се спъва човек.','The slabs are lifted by tree roots and it is easy to trip.')],
    ['utilities',6,'druzhba',-.0011,-.0006,8,2, I('Студени радиатори във входа','Cold radiators in the building'), I('В целия вход радиаторите са студени въпреки че отоплителният сезон започна.','All radiators in the entrance are cold although the heating season has started.')],
    ['construction',0,'rechitsa',.0005,.0008,30,1, I('Нов гараж в междублоково пространство','New garage built between blocks'), I('Строи се метален гараж върху зелената площ между блоковете.','A metal garage is being built on the green area between the blocks.')],
    ['health',0,'sini-kamani',.0012,-.0004,11,3, I('Плъхове около контейнерите','Rats around the bins'), I('Вечер около контейнерите се виждат плъхове, има нужда от дератизация.','Rats can be seen around the bins in the evening; pest control is needed.')],
    ['environment',0,'nadezhda',.0008,-.0012,2,0, I('Контейнерите не са изпразвани от седмица','Bins not emptied for a week'), I('Контейнерите са препълнени, отпадъците са по земята.','The bins are overflowing and rubbish is on the ground.')],
    ['roads',2,'balgarka',-.0007,-.0011,17,2, I('Изтрита пешеходна пътека до детската градина','Faded crossing near the kindergarten'), I('Маркировката почти не се вижда, особено вечер.','The markings are barely visible, especially in the evening.')],
    ['environment',5,'rechitsa',-.0010,.0003,25,1, I('Висока трева в парка','Tall grass in the park'), I('Тревата в малкия парк не е косена от месеци.','The grass in the small park has not been mowed for months.')],
    ['transport',1,'center',-.0004,-.0019,7,3, I('Счупен заслон на спирка','Broken shelter at a bus stop'), I('Стъклото на заслона е счупено, по пейката има парчета.','The shelter glass is broken and there are shards on the bench.')],
    ['roads',5,'novo-selo',-.0005,.0010,12,2, I('Неравна настилка след ремонт на ВиК','Uneven surface after a water repair'), I('След разкопаването асфалтът не е възстановен, остана дупка с чакъл.','After the excavation the asphalt was not restored; a hole with gravel remains.')]
  ];

  const DAY = 86400000;
  const today = new Date(); today.setHours(10, 0, 0, 0);
  const district = id => DISTRICTS.find(d => d.id === id);
  const category = id => CATEGORIES.find(c => c.id === id);

  const REPORTS = RAW.map((r, i) => {
    const [cat, sub, dist, dLat, dLng, days, status, title, desc] = r;
    const created = new Date(today - days * DAY);
    // status history: each step a little later than the previous one
    const history = [];
    for (let s = 0; s <= status; s++) {
      const step = Math.max(0, Math.round(days * (s / 3.2)));
      history.push({ status: s, at: new Date(Math.min(+today, +created + step * DAY + s * 3600000)) });
    }
    const d = district(dist);
    return {
      id: 1040 + i * 7, cat, sub, district: dist, days, status, title, desc, created, history,
      at: [d.at[0] + dLat, d.at[1] + dLng]
    };
  }).sort((a, b) => b.created - a.created);

  window.CSDATA = {
    ICONS, CATEGORIES, DISTRICTS, REPORTS, category, district,
    sub: r => category(r.cat).subs[r.sub],
    icon: (cat, attrs = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${attrs}>${ICONS[cat]}</svg>`,
    PRIORITY_KEYS: ['pLow', 'pMedium', 'pHigh', 'pCritical']
  };
})();
