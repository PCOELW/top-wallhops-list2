(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const config = window.WALLHOPS_CONFIG || {};
  const state = {
    platform: location.hash.toLowerCase() === '#mobile' ? 'mobile' : 'pc',
    query: '', difficulty: 'all', attribute: 'all', sort: 'difficulty', reverseOrder: false,
    payload: null, selection: {pc:null, mobile:null}, busy:false, lastCheck:0
  };
  const trim = x => x === null || x === undefined ? '' : String(x).trim();
  function url(value) { try { const u = new URL(trim(value)); return ['http:','https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } }
  function el(tag, className='', text=null) { const n=document.createElement(tag); if(className)n.className=className; if(text!==null)n.textContent=text; return n; }
  function setText(id, value) { $(id).textContent = trim(value) || '—'; }
  function attributeFor(row) {
    if (trim(row.attribute)) return trim(row.attribute);
    const s=(trim(row.style)+' '+trim(row.title)).toLowerCase();
    if (/headbump/i.test(s)) return 'Headbump';
    if (/precision|one studs|one stud/i.test(s)) return 'Precision';
    if (/cam(?:era)? control/i.test(s)) return 'Camera Control';
    if (/hard jumps.*net|net.*low jp/i.test(s)) return 'Insane';
    if (/mixed|lodges|co(?:s|\b)|consistency/i.test(s)) return 'Mixed';
    if (/unique|cylinder|slides/i.test(s)) return 'Unique';
    return 'Other';
  }
  const demoGrades = ['S','A','B','C','A','S','C','D','B','S'];
  function qualityFor(row) {
    const grade = trim(row.quality).toUpperCase();
    if (/^[SABCD]$/.test(grade))return grade;
    // The original A–I spreadsheet has no Quality column. Illustrative only before first live sync.
    if(state.payload?.status==='demo' && state.platform==='pc' && row.rank>=1 && row.rank<=10)return demoGrades[row.rank-1];
    return '—';
  }
  const attrClass = name => {
    const v = trim(name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    return ['legendary','insane','popular','unknown','unique','headbump','trash','endurance','camera-control','precision','mixed','hard-jumps'].includes(v)?'attribute-'+v:'attribute-other';
  };
  function chip(label, type='attribute') {
    const s = el('span','chip '+(type==='quality'?'quality-chip '+(/^[SABCD]$/.test(label)?'quality-'+label.toLowerCase():'quality-other'):attrClass(label)),label);
    return s;
  }
  function displayAttr(row) {
    const value=attributeFor(row);
    return value==='Other' && !trim(row.style) ? '—' : value;
  }
  function numericDifficulty(r){const n=parseFloat(trim(r.difficulty));return Number.isFinite(n)?n:null;}
  function displayDifficulty(row){const raw=trim(row.difficulty),n=Number(raw);return raw&&Number.isFinite(n)&&Number.isInteger(n)?n.toFixed(1):(raw||'—');}
  // Avoid duplicate rows if Google Sheets / the generated rankings.json contains
  // repeated ranks or titles. Within one rank, keep the LAST source record;
  // a title appearing at multiple ranks is kept at its smallest remaining rank.
  function dedupeRankingRecords(items){
    const byRank=new Map();
    for(const item of items) byRank.set(item.rank,item);
    const byTitle=new Map();
    for(const item of byRank.values()){
      const key=item.title.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase();
      const existing=byTitle.get(key);
      if(!existing || item.rank<existing.rank) byTitle.set(key,item);
    }
    return [...byTitle.values()].sort((a,b)=>a.rank-b.rank);
  }
  function normalizeList(raw){
    if(!Array.isArray(raw)) return [];
    const parsed=raw.filter(row=>row&&trim(row.title)).map((r,i)=>({
      rank:Number.isFinite(Number(r.rank))&&Number(r.rank)>0?Math.trunc(Number(r.rank)):i+1,
      title:trim(r.title),difficulty:trim(r.difficulty),tier:trim(r.tier),
      verifier:trim(r.verifier),creator:trim(r.creator),style:trim(r.style),
      attribute:trim(r.attribute),quality:trim(r.quality),gameUrl:url(r.gameUrl),videoUrl:url(r.videoUrl),
      date:formatWallhopDate(r.date),towerCreatorId:parseTowerCreatorId(r.towerCreatorId)
    }));
    return dedupeRankingRecords(parsed);
  }
  // Google Visualization transmits dates as Date(year, zeroBasedMonth, day).
  // L is the Date column; M may contain an explicitly entered Tower Creator ID.
  function formatWallhopDate(value) {
    const raw=trim(value);
    if(!raw)return '';
    const gviz=raw.match(/^Date\((\d{4}),\s*(\d{1,2}),\s*(\d{1,2})(?:,[^)]*)?\)$/i);
    if(gviz){
      const [y,m,d]=gviz.slice(1).map(Number);
      const parsed=new Date(Date.UTC(y,m,d));
      return Number.isNaN(parsed.getTime())?raw:parsed.toISOString().slice(0,10);
    }
    const serial=Number(raw);
    if(/^\d{5}(?:\.\d+)?$/.test(raw)&&serial>30000&&serial<80000){
      const parsed=new Date(Date.UTC(1899,11,30)+Math.round(serial*86400000));
      return parsed.toISOString().slice(0,10);
    }
    const simple=raw.match(/^(\d{4})[.\/\-]\s*(\d{1,2})[.\/\-]\s*(\d{1,2})\.?$/);
    if(simple)return simple[1]+'-'+simple[2].padStart(2,'0')+'-'+simple[3].padStart(2,'0');
    return raw;
  }
  function parseTowerCreatorId(raw) {
    const text=trim(raw);
    const match=text.match(/^(?:Tower\s*Creator\s*(?:ID)?\s*[:：]\s*)?(\d{6,20}(?:#[A-Za-z0-9_-]+)?)$/i);
    return match?match[1]:'';
  }
  function isTowerCreatorGame(row) {
    const href=url(row?.gameUrl);
    if(!href)return false;
    try{
      const parsed=new URL(href);
      if(!/(^|\.)roblox\.com$/i.test(parsed.hostname))return false;
      return /^\/games\/8646026339(?:\/|$)/i.test(parsed.pathname);
    }catch{return false;}
  }
  const rankSort = (a,b)=>a.rank-b.rank;
  function listRows() {return state.payload?.[state.platform] || [];}
  function selectedRow(){
    const rows=listRows();
    const selection=state.selection[state.platform];
    return rows.find(r => r.title===selection) || [...rows].sort(rankSort)[0] || null;
  }
  function getFilteredRows(){
    const q=state.query.trim().toLocaleLowerCase();
    const rows=listRows().filter(row=>{
      const hit=!q||row.title.toLocaleLowerCase().includes(q);
      const score=numericDifficulty(row);
      // Difficulty group matches a complete unit interval: 6.x, 5.x ... 0.x.
      // Unrated wallhops are still shown under All Difficulties only.
      const group=Number(state.difficulty);
      const diff=state.difficulty==='all'||(
        score!==null && Number.isInteger(group) && group>=0 && group<=6 &&
        score>=group && score<group+1
      );
      const attr=state.attribute==='all'||displayAttr(row)===state.attribute;
      return hit&&diff&&attr;
    });
    if(state.sort==='title')rows.sort((a,b)=>a.title.localeCompare(b.title,'en')||rankSort(a,b));
    else if(state.sort==='quality'){
      // S is highest, then A, B, C, D. Unknown grades go last.
      // Equal grades keep their original ranking order.
      const gradeOrder={S:0,A:1,B:2,C:3,D:4};
      const gradeIndex=row=>gradeOrder[qualityFor(row)]??5;
      rows.sort((a,b)=>gradeIndex(a)-gradeIndex(b)||rankSort(a,b));
    }
    else if(state.sort==='rank')rows.sort(rankSort);
    else rows.sort((a,b)=>(numericDifficulty(b)??-Infinity)-(numericDifficulty(a)??-Infinity)||rankSort(a,b));
    // One independent toggle reverses whichever order the dropdown selected.
    if(state.reverseOrder)rows.reverse();
    return rows;
  }
  function installTowerCreatorUI(){
    if(!$('detailCreator'))return;
    const creatorLine=$('detailCreator').closest('.detail-line');
    if(!creatorLine)return;
    if(!$('wallhopDateLine')){
      const dateLine=el('div','detail-line');dateLine.id='wallhopDateLine';
      dateLine.append(el('dt','', 'Date'));
      const dateValue=el('dd','');dateValue.id='wallhopDate';
      dateLine.append(dateValue);
      creatorLine.after(dateLine);
    }
    if(!$('towerCreatorLine')){
      const line=el('div','detail-line');line.id='towerCreatorLine';line.hidden=true;
      line.append(el('dt','', 'Tower Creator ID'));
      const value=el('dd','');value.id='towerCreatorId';
      line.append(value);
      $('wallhopDateLine').after(line);
    }
  }
  function showDateAndTowerCreator(row){
    const dateLine=$('wallhopDateLine');
    if(dateLine){
      const value=formatWallhopDate(row?.date);
      dateLine.hidden=state.platform==='mobile'||!value;
      $('wallhopDate').textContent=value||'—';
    }
    const idLine=$('towerCreatorLine');
    if(idLine){
      const id=isTowerCreatorGame(row)?parseTowerCreatorId(row.towerCreatorId):'';
      idLine.hidden=!id;
      $('towerCreatorId').textContent=id;
    }
  }
  function linkCell(label, link, type){
    const td=el('td');const href=url(link);
    if(!href){td.append(el('span','unavailable','—'));return td;}
    const a=el('a','short-link',label);a.href=href;a.target='_blank';a.rel='noopener noreferrer';a.addEventListener('click',e=>e.stopPropagation());
    a.setAttribute('aria-label',`${type} for ${label} (opens new tab)`);
    td.append(a);return td;
  }
  function renderRow(row, selected){
    const tr=el('tr',selected?'is-selected':'');tr.tabIndex=0;
    tr.setAttribute('aria-selected',String(selected));tr.setAttribute('aria-label',`Rank ${row.rank}, ${row.title}. Press Enter for details`);
    tr.append(el('td','rank-value rank-'+row.rank,String(row.rank)));
    const title=el('td','title-value',row.title);tr.append(title);
    const diff=el('td');const score=el('div','difficulty-cell');score.append(el('strong','difficulty-score',displayDifficulty(row)),el('span','tier-inline',row.tier||'—'));diff.append(score);tr.append(diff);
    tr.append(el('td','person-value',row.verifier||'—'),el('td','person-value',row.creator||'—'));
    tr.append(linkCell('Game',row.gameUrl,'Game link'),linkCell('Video',row.videoUrl,'Video link'));
    tr.append(el('td','style-value',row.style||'—'));
    const attr=el('td');const attrName=displayAttr(row);attr.append(attrName==='—'?el('span','unavailable','—'):chip(attrName));tr.append(attr);
    const quality=el('td');const grade=qualityFor(row);quality.append(grade==='—'?el('span','unavailable','—'):chip(grade,'quality'));tr.append(quality);
    function select(){state.selection[state.platform]=row.title;render();}
    tr.addEventListener('click',event=>{if(event.target.closest('a'))return;select();});
    tr.addEventListener('keydown',event=>{if(event.target!==tr)return;if(event.key==='Enter'||event.key===' '){event.preventDefault();select();}});
    return tr;
  }
  function setAction(id,href){
    const a=$(id),valid=url(href);
    a.classList.toggle('is-disabled',!valid);
    if(valid){a.href=valid;a.target='_blank';a.rel='noopener noreferrer';a.removeAttribute('aria-disabled');a.removeAttribute('tabindex');}
    else {a.removeAttribute('href');a.setAttribute('aria-disabled','true');a.tabIndex=-1;}
  }
  function renderDetails(){
    const row=selectedRow(), panel=$('detailPanel');
    if(!row){setText('detailRank','#—');$('detailRank').className='detail-rank';setText('detailTitle','No selection');
      for(const id of ['detailDifficulty','detailTier','detailVerifier','detailCreator','detailStyle'])setText(id,'—');
      $('detailAttribute').replaceChildren(el('span','unavailable','—'));
      $('detailQuality').replaceChildren(el('span','unavailable','—'));showDateAndTowerCreator(null);setAction('detailGame','');setAction('detailVideo','');return;}
    setText('detailRank','#'+row.rank);$('detailRank').className='detail-rank'+(row.rank<=3?' rank-'+row.rank:'');setText('detailTitle',row.title);setText('detailDifficulty',displayDifficulty(row));setText('detailTier',row.tier);
    setText('detailVerifier',row.verifier);setText('detailCreator',row.creator);showDateAndTowerCreator(row);
    setText('detailStyle',row.style.replace(/\s*\|\s*/g,' | '));
    const attr=displayAttr(row);$('detailAttribute').replaceChildren(attr==='—'?el('span','unavailable','—'):chip(attr));
    const q=qualityFor(row);$('detailQuality').replaceChildren(q==='—'?el('span','unavailable','—'):chip(q,'quality'));
    setAction('detailGame',row.gameUrl);setAction('detailVideo',row.videoUrl);
    panel.setAttribute('aria-label',`Details for ${row.title}`);
  }
  function render(){
    const platform=state.platform, isPc=platform==='pc';
    $('pageTitle').textContent=isPc?'PC Wallhops':'Mobile Wallhops';
    const description=$('pageDescription');
    if(description) description.textContent=isPc?'Community-ranked wallhops for keyboard and mouse players.':'Community-ranked wallhops for mobile players.';
    const filtered=getFilteredRows(),tbody=$('rankingRows'),frag=document.createDocumentFragment();
    if(filtered.length){const selected=selectedRow();filtered.forEach(r=>frag.append(renderRow(r,r.title===selected?.title)));}
    else {const tr=el('tr');const td=el('td','table-message',state.payload? (listRows().length?'No wallhops match your filters.':'No rankings available for this platform yet.'):'Loading rankings...');td.colSpan=10;tr.append(td);frag.append(tr);}
    tbody.replaceChildren(frag);$('resultsLabel').textContent=`${filtered.length} of ${listRows().length} wallhops`;
    renderDetails();
  }
  function refreshAttributeOptions(){
    const select=$('attributeFilter');const options=[...new Set(listRows().map(displayAttr))].filter(x=>x!=='—').sort((a,b)=>a.localeCompare(b));
    if(state.attribute!=='all'&&!options.includes(state.attribute))state.attribute='all';
    select.replaceChildren();select.append(new Option('All Attributes','all'));
    options.forEach(name=>select.append(new Option(name,name)));
    select.value=state.attribute;
  }
  function switchPlatform(platform){
    if(!['pc','mobile'].includes(platform))return;
    state.platform=platform;
    document.querySelectorAll('[data-platform]').forEach(btn=>{
      const active=btn.dataset.platform===platform;btn.classList.toggle('is-active',active);
      if(active)btn.setAttribute('aria-current','page');else btn.removeAttribute('aria-current');
    });
    if(location.hash.toLowerCase()!=='#'+platform){try{history.replaceState(null,'',location.pathname+location.search+'#'+platform);}catch{/* File/preview context may not have an addressable history URL. */}}
    state.attribute='all';refreshAttributeOptions();render();
  }
  function setAlert(text){$('statusText').textContent=text;$('statusAlert').hidden=!text;}
  function displayTime(raw){
    const when=raw?new Date(raw):null;
    return when&&!Number.isNaN(when.getTime())?when.toLocaleString('en-US',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'Not synced yet';
  }
  // Fetch a public Google Sheets tab via GViz JSONP: cross-origin script loading
  // works on GitHub Pages without Apps Script or private credentials.
  let requestSerial=0;
  function spreadsheetId(){
    const configured=trim(config.sheetId);
    if(configured)return configured;
    return trim(config.spreadsheetUrl).match(/\/spreadsheets\/d\/([\w-]+)/)?.[1] || '';
  }
  function fetchSheet(tab){
    const id=spreadsheetId();
    if(!id)return Promise.reject(new Error('Spreadsheet ID missing from config.js'));
    const callback='__wallhopsGViz_'+(++requestSerial)+'_'+Date.now();
    return new Promise((resolve,reject)=>{
      let settled=false;
      const script=document.createElement('script');
      const timeout=setTimeout(()=>finish(new Error('Google Sheets request timed out')),14000);
      function finish(error,response){
        if(settled)return;
        settled=true;
        clearTimeout(timeout);
        script.remove();
        try{delete window[callback];}catch{window[callback]=undefined;}
        if(error)reject(error);else resolve(response);
      }
      window[callback]=(response)=>{
        if(!response || String(response.status).toLowerCase()!=='ok' || !response.table){
          const message=response?.errors?.map(e=>e.detailed_message||e.message).filter(Boolean).join('; ')||'Invalid Google Sheets response';
          finish(new Error(message));return;
        }
        finish(null,response.table);
      };
      script.async=true;
      script.onerror=()=>finish(new Error('Public sheet not accessible or connection blocked'));
      const base='https://docs.google.com/spreadsheets/d/'+encodeURIComponent(id)+'/gviz/tq';
      const params=new URLSearchParams({
        sheet:tab,
        headers:'0',
        tqx:'out:json;responseHandler:'+callback,
        cacheBust:String(Date.now())
      });
      script.src=base+'?'+params.toString();
      document.head.appendChild(script);
    });
  }
  function readCell(cell){
    if(!cell)return '';
    // v is the underlying value, f only its formatted display.
    // Prefer the formatted text for long text/links, but use raw numeric values.
    const raw=cell.v;
    if(raw===null||raw===undefined)return trim(cell.f);
    return trim(typeof raw==='string'?raw:(cell.f??raw));
  }
  function decodeSheet(table){
    if(!Array.isArray(table.rows))throw new Error('Sheet contains no table rows');
    const columns=(Array.isArray(table.cols)?table.cols:[]).map(c=>trim(c?.id).toUpperCase());
    const colIndex=letter=>{const n=columns.indexOf(letter);return n===-1?letter.charCodeAt(0)-65:n;};
    const result=[];
    for(const dataRow of table.rows){
      const cells=Array.isArray(dataRow?.c)?dataRow.c:[];
      const get=letter=>readCell(cells[colIndex(letter)]);
      const rawRank=get('A');
      const rank=Number(rawRank);
      const title=get('B');
      if(!Number.isSafeInteger(rank)||rank<=0||!title)continue;
      result.push({
        rank,title,difficulty:get('C'),tier:get('D'),verifier:get('E'),
        creator:get('F'),gameUrl:url(get('G')),videoUrl:url(get('H')),
        style:get('I'),attribute:get('J'),quality:get('K'),date:get('L'),towerCreatorId:get('M')
      });
    }
    return result.sort((a,b)=>a.rank-b.rank);
  }
  // A public GViz response often contains only the visible text of a hyperlink,
  // not the URL stored behind [GAME] / [Link]. A direct refresh must NEVER
  // clear URLs that were already present in the GitHub snapshot or on screen.
  function stableTitle(title) {
    return trim(title).replace(/\s+/g,' ').toLocaleLowerCase('en');
  }
  function mergeLiveRows(rows, savedRows, previousRows) {
    const saved=new Map((savedRows||[]).map(r=>[stableTitle(r.title),r]));
    const previous=new Map((previousRows||[]).map(r=>[stableTitle(r.title),r]));
    return rows.map(row=>{
      const key=stableTitle(row.title);
      const snapshot=saved.get(key);
      const earlier=previous.get(key);
      // For links, prefer newly read valid URLs; then the updated GitHub
      // snapshot; then the last URL known to this browser session.
      const gameUrl=url(row.gameUrl)||url(snapshot?.gameUrl)||url(earlier?.gameUrl)||'';
      const videoUrl=url(row.videoUrl)||url(snapshot?.videoUrl)||url(earlier?.videoUrl)||'';
      // Missing optional values are not allowed to wipe known metadata.
      return {...row, gameUrl, videoUrl,
        attribute:trim(row.attribute)||trim(earlier?.attribute)||trim(snapshot?.attribute),
        quality:trim(row.quality)||trim(earlier?.quality)||trim(snapshot?.quality),
        date:formatWallhopDate(row.date)||formatWallhopDate(earlier?.date)||formatWallhopDate(snapshot?.date),
        towerCreatorId:parseTowerCreatorId(row.towerCreatorId)||parseTowerCreatorId(snapshot?.towerCreatorId)||parseTowerCreatorId(earlier?.towerCreatorId)
      };
    });
  }
  async function readBackup(){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),12000);
    try{
      const source=url(config.dataUrl)||config.dataUrl||'./data/rankings.json';
      const separator=source.includes('?')?'&':'?';
      const result=await fetch(source+separator+'v='+Date.now(),{cache:'no-store',signal:controller.signal});
      if(!result.ok)throw new Error('Backup HTTP '+result.status);
      const payload=await result.json();
      if(!Array.isArray(payload.pc)||!Array.isArray(payload.mobile))throw new Error('Invalid backup data');
      state.backup={...payload,pc:normalizeList(payload.pc),mobile:normalizeList(payload.mobile)};
      state.backupChecked=Date.now();
      if(!state.payload){
        state.payload=state.backup;
        $('syncState').textContent=payload.status==='live'?'GitHub backup · awaiting direct sync':'Preview · awaiting direct sync';
        $('lastSync').textContent='Backup sync: '+displayTime(payload.updatedAt);
        $('syncDot').classList.toggle('is-live',payload.status==='live');
        refreshAttributeOptions();render();
      }
    }finally{clearTimeout(timer);}
  }
  async function loadData(){
    if(state.busy)return;
    state.busy=true;
    $('refreshButton').disabled=true;
    let backupError=null;
    try{
      // Update the URL fallback only every 5 minutes. Its hyperlinks can be
      // embedded in Google Sheets cells and are not guaranteed in GViz output.
      if(!state.backup || Date.now()-(state.backupChecked||0)>=300000){
        try{await readBackup();}catch(err){backupError=err;}
      }
      const backup=state.backup||{pc:[],mobile:[]};
      const tabs={pc:trim(config.pcSheetName)||'Top PC Wallhops',mobile:trim(config.mobileSheetName)||'Top Mobile Wallhops'};
      const outcomes=await Promise.allSettled([fetchSheet(tabs.pc),fetchSheet(tabs.mobile)]);
      const result={pc:null,mobile:null};
      const errors=[];
      for(const [index,platform] of ['pc','mobile'].entries()){
        const item=outcomes[index];
        if(item.status==='fulfilled'){
          try{
            const decoded=decodeSheet(item.value);
            if(!decoded.length)throw new Error('No ranking rows in '+tabs[platform]);
            const earlierRows=state.payload?.[platform]||[];
            result[platform]=normalizeList(mergeLiveRows(decoded,backup[platform],earlierRows));
          }catch(err){errors.push(platform+': '+err.message);}
        }else errors.push(platform+': '+item.reason?.message);
      }
      if(result.pc||result.mobile){
        // Retain last successful direct data if only one tab fails temporarily.
        const oldLive=state.payload?.status==='direct'?state.payload:null;
        state.payload={
          ...(state.backup||{}),status:'direct',updatedAt:new Date().toISOString(),
          pc:result.pc||oldLive?.pc||backup.pc,
          mobile:result.mobile||oldLive?.mobile||backup.mobile
        };
        $('syncState').textContent=errors.length?'Google Sheets · partial live data':'Google Sheets · direct (30s)';
        $('syncDot').classList.add('is-live');
        $('lastSync').textContent='Last checked: '+displayTime(new Date().toISOString());
        setAlert(errors.length?'Direct sync notice: '+errors.join(' · '):'');
      }else if(state.backup){
        // Preserve last direct results if present; otherwise show last GitHub snapshot.
        if(!state.payload||state.payload.status!=='direct')state.payload=state.backup;
        $('syncState').textContent='Direct sync unavailable · showing saved data';
        $('syncDot').classList.remove('is-live');
        $('lastSync').textContent='Backup sync: '+displayTime(backup.updatedAt);
        setAlert('Direct Google Sheets access failed; showing the last saved data. '+errors.join(' · '));
      }else{
        $('syncState').textContent='Unable to access Google Sheets';
        $('syncDot').classList.remove('is-live');
        setAlert('Direct sync failed and no saved data was available. '+errors.join(' · ')+(backupError?' · '+backupError.message:''));
        if(!state.payload)state.payload={pc:[],mobile:[],status:'error'};
      }
      state.lastCheck=Date.now();
      refreshAttributeOptions();render();
    }finally{state.busy=false;$('refreshButton').disabled=false;}
  }
  function setupDifficultyAndSortMenus(){
    // Modify options in code so there is no need to edit the user's index.html.
    const difficulty=$('difficultyFilter');
    difficulty.replaceChildren(new Option('All Difficulties','all'));
    for(let number=6;number>=0;number--){
      difficulty.append(new Option(number+'.0–'+number+'.9',String(number)));
    }
    difficulty.value=state.difficulty;

    const sort=$('sortSelect');
    const rankOption=sort.querySelector('option[value="rank"]');
    if(rankOption){
      rankOption.value='quality';
      rankOption.textContent='Sort by: Quality';
    }else if(!sort.querySelector('option[value="quality"]')){
      sort.append(new Option('Sort by: Quality','quality'));
    }
    // Reverse ordering is handled by its own square button, not this menu.
    sort.querySelector('option[value="reverse-rank"]')?.remove();
    if(state.sort==='reverse-rank')state.sort='difficulty';
    sort.value=state.sort;
  }
  function installOrderToggle(){
    const search=$('listSearch')?.closest('.toolbar-search');
    if(!search || $('ttwl-order-toggle'))return;

    // Minimal two-way sort glyph: the highlighted side indicates the active direction.
    const button=el('button','ttwl-order-toggle');
    button.id='ttwl-order-toggle';
    button.type='button';
    const svgNs='http://www.w3.org/2000/svg';
    const glyph=document.createElementNS(svgNs,'svg');
    glyph.setAttribute('viewBox','0 0 24 24');
    glyph.setAttribute('width','20');
    glyph.setAttribute('height','20');
    glyph.setAttribute('fill','none');
    glyph.setAttribute('aria-hidden','true');
    const arrows=[
      {cls:'sort-up',paths:['M8 19V5','M4.5 8.5 8 5l3.5 3.5']},
      {cls:'sort-down',paths:['M16 5v14','m12.5 15.5 3.5 3.5 3.5-3.5']}
    ];
    for(const item of arrows){
      const group=document.createElementNS(svgNs,'g');
      group.setAttribute('class',item.cls);
      for(const d of item.paths){
        const path=document.createElementNS(svgNs,'path');
        path.setAttribute('d',d);
        group.appendChild(path);
      }
      glyph.appendChild(group);
    }
    button.appendChild(glyph);
    const update=()=>{
      button.setAttribute('aria-pressed',String(state.reverseOrder));
      const label=state.reverseOrder?'Descending order. Switch to ascending':'Ascending order. Switch to descending';
      button.setAttribute('aria-label',label);
      button.title=label;
    };
    update();
    button.addEventListener('click',()=>{
      state.reverseOrder=!state.reverseOrder;
      update();
      render();
    });
    search.after(button);

    // All styling lives here; the user's site CSS and color customizations remain untouched.
    const style=document.createElement('style');
    style.id='ttwl-order-toggle-style';
    style.textContent=`
      .toolbar .toolbar-search{flex:1 1 0;min-width:120px}
      .toolbar #ttwl-order-toggle{
        flex:0 0 44px;width:44px;height:45px;padding:0;
        display:inline-flex;align-items:center;justify-content:center;
        border:1px solid #374252;border-radius:9px;
        background:#1a2533;cursor:pointer;
        transition:background-color .15s,border-color .15s;
      }
      .toolbar #ttwl-order-toggle svg{
        width:19px;height:19px;
        fill:none;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;
      }
      .toolbar #ttwl-order-toggle .sort-up{stroke:#edf2fa;transition:stroke .15s}
      .toolbar #ttwl-order-toggle .sort-down{stroke:#64758a;transition:stroke .15s}
      .toolbar #ttwl-order-toggle[aria-pressed="true"] .sort-up{stroke:#64758a}
      .toolbar #ttwl-order-toggle[aria-pressed="true"] .sort-down{stroke:#edf2fa}
      .toolbar #ttwl-order-toggle:hover{background:#222f40;border-color:#56667b}
      .toolbar #ttwl-order-toggle:focus-visible{outline:2px solid #c5ceda;outline-offset:2px}
      @media(max-width:1040px){
        .toolbar .toolbar-search{flex:1 1 calc(100% - 64px);min-width:120px}
        .toolbar #ttwl-order-toggle{flex:0 0 44px}
      }
      @media(max-width:620px){.toolbar #ttwl-order-toggle{height:42px}}
    `;
    document.head.appendChild(style);
  }
  function init(){
    installTowerCreatorUI();
    setupDifficultyAndSortMenus();
    installOrderToggle();
    const sheet=url(config.spreadsheetUrl);
    if(sheet){$('sheetLink').href=sheet;$('dialogSheetLink').href=sheet;}
    const discord=url(config.discordUrl);
    if(discord){$('discordNav').href=discord;$('discordNav').hidden=false;}
    document.querySelectorAll('[data-platform]').forEach(btn=>btn.addEventListener('click',()=>switchPlatform(btn.dataset.platform)));
    const inputs=[$('globalSearch'),$('listSearch')];inputs.forEach(input=>input.addEventListener('input',()=>{
      state.query=input.value;inputs.forEach(other=>{if(other!==input)other.value=state.query;});render();
    }));
    $('difficultyFilter').addEventListener('change',event=>{state.difficulty=event.target.value;render();});
    $('attributeFilter').addEventListener('change',event=>{state.attribute=event.target.value;render();});
    $('sortSelect').addEventListener('change',event=>{state.sort=event.target.value;render();});
    $('refreshButton').addEventListener('click',loadData);
    $('dismissAlert').addEventListener('click',()=>{$('statusAlert').hidden=true;});
    $('rulesButton').addEventListener('click',()=>{$('rulesDialog').showModal();});
    $('rulesDialog').addEventListener('click',e=>{if(e.target===$('rulesDialog'))$('rulesDialog').close();});
    window.addEventListener('hashchange',()=>{const page=location.hash.slice(1).toLowerCase();if(['pc','mobile'].includes(page)&&page!==state.platform)switchPlatform(page);});
    switchPlatform(state.platform);loadData();
    const every=Math.max(10000,Number(config.refreshMs)||30000);
    setInterval(()=>{if(!document.hidden)loadData();},every);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-state.lastCheck>every)loadData();});
  }
  init();
})();
