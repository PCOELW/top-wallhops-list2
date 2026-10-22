/* TTWL player leaderboard — no extra API, account, or spreadsheet required.
   Based exclusively on published data/rankings.json + data/victors.json.
   Ranking: lexicographically compare each player's completed wallhop ranks
   in ascending order; for an identical prefix, more clears wins. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = {scope:'all', search:'', players:[], selected:'', rankings:null, victors:null};
  const text = x => String(x ?? '').trim();
  const canonical = x => text(x).normalize('NFKC').replace(/[\u200b-\u200f\u2060\ufeff]/g,'').replace(/[\u2018\u2019\u201b\u00b4\u0060]/g,"'").replace(/[\u2010-\u2015\u2212]/g,'-').replace(/\s+/g,' ').toLowerCase();
  const signature = x => canonical(x).replace(/[^\p{L}\p{N}]+/gu,'');
  const validName = x => /^[A-Za-z0-9_]{3,20}$/.test(text(x));
  const node = (tag, className, value) => {const n=document.createElement(tag);if(className)n.className=className;if(value!==undefined)n.textContent=value;return n;};
  const byRank = (a,b) => a.rank-b.rank || a.platform.localeCompare(b.platform) || a.title.localeCompare(b.title,'en');
  function compareVectors(a,b){
    const x=a.clears.map(c=>c.rank), y=b.clears.map(c=>c.rank);
    for(let i=0;i<Math.min(x.length,y.length);i++)if(x[i]!==y[i])return x[i]-y[i];
    return y.length-x.length;
  }
  function matchedWallhop(title, rows){
    const exact=rows.filter(r=>canonical(r.title)===canonical(title));
    if(exact.length===1)return exact[0];
    const normalized=signature(title);
    if(normalized.length<4)return null;
    const candidates=rows.filter(r=>signature(r.title)===normalized);
    return candidates.length===1?candidates[0]:null;
  }
  function createPlayers(rankings,victors,scope){
    const players=new Map(), platformNames=scope==='all'?['pc','legacy']:[scope];
    const seenCompleted=new Set();
    let rejected=0, unmatched=0;
    for(const platform of platformNames){
      const rows=Array.isArray(rankings[platform]) ? rankings[platform]
        .filter(r=>r&&text(r.title)&&Number.isInteger(Number(r.rank))&&Number(r.rank)>0)
        .map(r=>({...r,rank:Number(r.rank),platform})) : [];
      const section=victors[platform];
      if(!section || typeof section!=='object' || Array.isArray(section))continue;
      for(const [wallhop,names] of Object.entries(section)){
        if(!Array.isArray(names))continue;
        const ranked=matchedWallhop(wallhop,rows);
        if(!ranked){unmatched++;continue;}
        for(const rawName of names){
          if(!validName(rawName)){rejected++;continue;}
          const playerName=text(rawName), key=playerName.toLowerCase();
          const distinct=key+'\u0000'+platform+'\u0000'+canonical(ranked.title);
          if(seenCompleted.has(distinct))continue;
          seenCompleted.add(distinct);
          if(!players.has(key))players.set(key,{key,name:playerName,clears:[]});
          players.get(key).clears.push({rank:ranked.rank,title:ranked.title,platform});
        }
      }
    }
    const output=[...players.values()];
    output.forEach(p=>p.clears.sort(byRank));
    output.sort((a,b)=>compareVectors(a,b)||a.name.localeCompare(b.name,'en',{sensitivity:'base'}));
    output.forEach((p,i)=>{p.place=(i>0&&compareVectors(output[i-1],p)===0)?output[i-1].place:i+1;});
    return {players:output,rejected,unmatched};
  }
  function makeWallhopLink(clear){
    const path=new URL('./index.html',location.href);
    path.searchParams.set('list',clear.platform);
    path.searchParams.set('wallhop',clear.title);
    path.hash=clear.platform;
    return path.href;
  }
  function renderPlayerDetails(){
    const player=state.players.find(p=>p.key===state.selected)||state.players[0];
    const list=$('selectedPlayerClears');
    if(!player){
      $('selectedPlayerRank').textContent='#—';$('selectedPlayerName').textContent='No player selected';
      $('selectedPlayerBest').textContent='—';$('selectedPlayerCount').textContent='0';
      $('selectedPlayerCaption').textContent='0 clears';
      list.replaceChildren(node('li','player-empty','No completed wallhops are available for this selection.'));
      return;
    }
    $('selectedPlayerRank').textContent='#'+player.place;
    $('selectedPlayerName').textContent=player.name;
    $('selectedPlayerBest').textContent='#'+player.clears[0].rank;
    $('selectedPlayerCount').textContent=String(player.clears.length);
    $('selectedPlayerCaption').textContent=player.clears.length+' clear'+(player.clears.length===1?'':'s');
    const frag=document.createDocumentFragment();
    player.clears.forEach(clear=>{
      const li=node('li');const link=node('a');link.href=makeWallhopLink(clear);
      link.title='Open '+clear.title+' in '+(clear.platform==='legacy'?'Legacy List':'PC Wallhops');
      link.append(node('span','player-clear-rank','#'+clear.rank),node('span','player-clear-title',clear.title),node('span','player-clear-tag',clear.platform==='legacy'?'Legacy':'PC'));
      li.append(link);frag.append(li);
    });
    list.replaceChildren(frag);
  }
  function renderPlayers(){
    const query=canonical(state.search);
    const visible=state.players.filter(p=>!query||canonical(p.name).includes(query));
    const frag=document.createDocumentFragment();
    if(!visible.length){
      const tr=node('tr'), td=node('td','leaderboard-empty',state.players.length?'No players match your search.':'No Victors available in the selected list.');
      td.colSpan=5;tr.append(td);frag.append(tr);
    }
    for(const player of visible){
      const tr=node('tr',player.key===state.selected?'is-selected':'');tr.tabIndex=0;
      tr.setAttribute('aria-label',`Player ${player.name}, position ${player.place}. View completed wallhops`);
      const place=node('td','leaderboard-place'+(player.place<=3?' top-'+player.place:''),'#'+player.place);
      const username=node('td','leaderboard-name',player.name);
      const best=node('td','leaderboard-best','#'+player.clears[0].rank);
      const total=node('td','leaderboard-total',String(player.clears.length));
      const rankText=player.clears.slice(0,5).map(c=>'#'+c.rank).join(' · ')+(player.clears.length>5?' · +'+(player.clears.length-5):'');
      const ranks=node('td','leaderboard-ranks',rankText);
      tr.append(place,username,best,total,ranks);
      const choose=()=>{state.selected=player.key;renderPlayers();renderPlayerDetails();if(window.innerWidth<=900)$('playerDetailsPanel').scrollIntoView({behavior:'smooth',block:'start'});};
      tr.addEventListener('click',choose);
      tr.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}});
      frag.append(tr);
    }
    $('playerRankingRows').replaceChildren(frag);
    $('playerResults').textContent=`${visible.length} of ${state.players.length} players`;
  }
  function recompute(){
    if(!state.rankings||!state.victors)return;
    const oldSelection=state.selected;
    const result=createPlayers(state.rankings,state.victors,state.scope);
    state.players=result.players;
    const requested=new URLSearchParams(location.search).get('player');
    state.selected=state.players.find(p=>p.key===oldSelection)?.key||state.players.find(p=>p.key===canonical(requested))?.key||state.players[0]?.key||'';
    const alerts=[];
    if(!state.players.length){alerts.push('No valid PC/Legacy Victors were found. Check data/victors.json: the PC and Legacy sections need the M-column note usernames.');}
    else if(result.unmatched){alerts.push(`${result.unmatched} Victor entries did not match a ranked wallhop and were not counted.`);}
    if(state.victors.status==='unavailable')alerts.push('The latest Victors import is marked unavailable.');
    $('leaderboardAlert').hidden=!alerts.length;
    $('leaderboardAlert').textContent=alerts.join(' ');
    renderPlayers();renderPlayerDetails();
  }
  async function readJson(filename){
    const r=await fetch('./data/'+filename+'?t='+Date.now(),{cache:'no-store'});
    if(!r.ok)throw new Error(`${filename}: HTTP ${r.status}`);
    return r.json();
  }
  async function refresh(){
    try{
      const [r,v]=await Promise.all([readJson('rankings.json'),readJson('victors.json')]);
      if(!r || !Array.isArray(r.pc) || !Array.isArray(r.legacy))throw new Error('Rankings JSON is missing PC or Legacy lists.');
      if(!v || !v.pc || !v.legacy)throw new Error('Victors JSON is missing PC or Legacy data.');
      state.rankings=r;state.victors=v;
      const raw=v.updatedAt||r.updatedAt;
      const date=raw?new Date(raw):null;
      $('leaderboardUpdated').textContent='Victors last synced: '+(date&&!Number.isNaN(date.getTime())?date.toLocaleString(): 'not available')+'. Rankings and Victors are read from the published site data.';
      recompute();
    }catch(e){
      if(!state.players.length){$('playerRankingRows').replaceChildren((()=>{const tr=node('tr'),td=node('td','leaderboard-empty','Could not load the player leaderboard.');td.colSpan=5;tr.append(td);return tr;})());}
      $('leaderboardAlert').hidden=false;
      $('leaderboardAlert').textContent='Data could not be loaded: '+e.message+' Check that both data/rankings.json and data/victors.json are published.';
      console.warn('[TTWL leaderboard]',e);
    }
  }
  function init(){
    const config=window.WALLHOPS_CONFIG||{};
    if(/^https:\/\//.test(text(config.discordUrl))){$('leaderboardDiscord').href=config.discordUrl;$('leaderboardDiscord').hidden=false;}
    $('playerSearch').addEventListener('input',e=>{state.search=e.target.value;renderPlayers();});
    $('playerScope').addEventListener('change',e=>{state.scope=e.target.value;recompute();});
    refresh();
    setInterval(()=>{if(!document.hidden)refresh();},30000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
