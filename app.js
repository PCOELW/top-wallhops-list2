(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const config = window.WALLHOPS_CONFIG || {};
  const state = {
    platform: location.hash.toLowerCase() === '#mobile' ? 'mobile' : 'pc',
    query: '', difficulty: 'all', attribute: 'all', sort: 'difficulty',
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
    if(state.payload?.status!=='live' && state.platform==='pc' && row.rank>=1 && row.rank<=10)return demoGrades[row.rank-1];
    return '—';
  }
  const attrClass = name => {
    const v = trim(name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    return ['headbump','mixed','precision','camera-control','unique','insane'].includes(v)?'attribute-'+v:'attribute-other';
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
  function normalizeList(raw){return Array.isArray(raw)?raw.filter(row=>row&&trim(row.title)).map((r,i)=>({
    rank:Number.isFinite(Number(r.rank))&&Number(r.rank)>0?Math.trunc(Number(r.rank)):i+1,
    title:trim(r.title),difficulty:trim(r.difficulty),tier:trim(r.tier),
    verifier:trim(r.verifier),creator:trim(r.creator),style:trim(r.style),
    attribute:trim(r.attribute),quality:trim(r.quality),gameUrl:url(r.gameUrl),videoUrl:url(r.videoUrl)
  })):[];}
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
      const hit=!q||[row.title,row.verifier,row.creator,row.style,row.tier,row.difficulty,attributeFor(row)].join(' ').toLocaleLowerCase().includes(q);
      const score=numericDifficulty(row);
      const diff=state.difficulty==='all'||(state.difficulty==='unknown'?score===null:(state.difficulty==='below6'?score!==null&&score<6:score!==null&&score>=Number(state.difficulty)));
      const attr=state.attribute==='all'||displayAttr(row)===state.attribute;
      return hit&&diff&&attr;
    });
    if(state.sort==='title')rows.sort((a,b)=>a.title.localeCompare(b.title,'en')||rankSort(a,b));
    else if(state.sort==='rank')rows.sort(rankSort);
    else rows.sort((a,b)=>(numericDifficulty(b)??-Infinity)-(numericDifficulty(a)??-Infinity)||rankSort(a,b));
    return rows;
  }
  function linkCell(label, link, type){
    const td=el('td');const href=url(link);
    if(!href){td.append(el('span','unavailable','—'));return td;}
    const a=el('a','short-link',label);a.href=href;a.target='_blank';a.rel='noopener noreferrer';a.addEventListener('click',e=>e.stopPropagation());
    a.setAttribute('aria-label',`${type} for ${label} (opens new tab)`);td.append(a);return td;
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
      $('detailQuality').replaceChildren(el('span','unavailable','—'));setAction('detailGame','');setAction('detailVideo','');return;}
    setText('detailRank','#'+row.rank);$('detailRank').className='detail-rank'+(row.rank<=3?' rank-'+row.rank:'');setText('detailTitle',row.title);setText('detailDifficulty',displayDifficulty(row));setText('detailTier',row.tier);
    setText('detailVerifier',row.verifier);setText('detailCreator',row.creator);
    setText('detailStyle',row.style.replace(/\s*\|\s*/g,' | '));
    const attr=displayAttr(row);$('detailAttribute').replaceChildren(attr==='—'?el('span','unavailable','—'):chip(attr));
    const q=qualityFor(row);$('detailQuality').replaceChildren(q==='—'?el('span','unavailable','—'):chip(q,'quality'));
    setAction('detailGame',row.gameUrl);setAction('detailVideo',row.videoUrl);
    panel.setAttribute('aria-label',`Details for ${row.title}`);
  }
  function render(){
    const platform=state.platform, isPc=platform==='pc';
    $('pageTitle').textContent=isPc?'PC Wallhops':'Mobile Wallhops';
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
  async function loadData(){
    if(state.busy)return;state.busy=true;$('refreshButton').disabled=true;
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),20000);
    try {
      const source=url(config.dataUrl)||config.dataUrl||'./data/rankings.json';
      const res=await fetch(source+(source.includes('?')?'&':'?')+'v='+Date.now(),{cache:'no-store',signal:abort.signal});
      if(!res.ok)throw new Error(`HTTP ${res.status}`);
      const data=await res.json();
      if(!Array.isArray(data.pc)||!Array.isArray(data.mobile))throw new Error('Unexpected ranking format');
      state.payload={...data,pc:normalizeList(data.pc),mobile:normalizeList(data.mobile)};
      const isLive=data.status==='live';$('syncState').textContent=isLive?'Connected to Google Sheets':'Preview data · waiting for first sync';
      $('syncDot').classList.toggle('is-live',isLive);
      $('lastSync').textContent='Last sync: '+displayTime(data.updatedAt);
      if(isLive){
        const warnings=(Array.isArray(data.warnings)?data.warnings:[]).filter(Boolean);
        setAlert(warnings.length?'Sync notice: '+warnings.join(' · '):'');
      }else setAlert(''); // The sidebar always identifies preview data until the first successful sync.
      state.lastCheck=Date.now();refreshAttributeOptions();render();
    }catch(err){
      $('syncState').textContent='Data connection unavailable';$('syncDot').classList.remove('is-live');
      setAlert('Could not load ranking data. Check GitHub Actions, Pages deployment, and public spreadsheet access. ('+err.message+')');
      if(!state.payload){state.payload={pc:[],mobile:[],status:'error'};refreshAttributeOptions();render();}
    }finally {clearTimeout(timer);state.busy=false;$('refreshButton').disabled=false;}
  }
  function init(){
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
    const every=Math.max(60000,Number(config.refreshMs)||60000);
    setInterval(()=>{if(!document.hidden)loadData();},every);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-state.lastCheck>every)loadData();});
  }
  init();
})();
