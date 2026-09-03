(() => {
  'use strict';

  const COUNTRY_GEOJSON_URL =
    'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';

  const sites = window.MOSAIC_SITES || [];
  const connections = window.MOSAIC_CONNECTIONS || [];
  const byId = Object.fromEntries(sites.map(site => [site.id, site]));
  const el = id => document.getElementById(id);

  const globeHost = el('globe');
  const slider = el('yearSlider');
  const yearLabel = el('yearLabel');
  const periodTitle = el('periodTitle');
  const periodDescription = el('periodDescription');
  const toggle = el('connectionsToggle');
  const infoCard = el('infoCard');
  const cardEra = el('cardEra');
  const cardTitle = el('cardTitle');
  const cardText = el('cardText');
  const cardMeta = el('cardMeta');
  const regionLink = el('regionLink');
  const closeCard = el('closeCard');
  const holdHint = el('holdHint');
  const stepCurrent = el('stepCurrent');
  const stepTotal = el('stepTotal');

  const slugCountryNames = {
    iraq:['Iraq'], turkey:['Turkey'], greece:['Greece'], egypt:['Egypt'], italy:['Italy'],
    tunisia:['Tunisia'], cyprus:['Cyprus'], jordan:['Jordan'], palestine:['Palestine','Israel'], syria:['Syria']
  };
  const routeGlow = {
    iraq:'#19d7ff', turkey:'#3ae2ff', greece:'#69eeff', egypt:'#2fb9ff', italy:'#00d8ff',
    tunisia:'#54b7ff', cyprus:'#49e6ff', jordan:'#39d8ff', palestine:'#5cc8ff', syria:'#31ddff'
  };
  const countryName = feature => feature?.properties?.NAME_LONG || feature?.properties?.ADMIN || feature?.properties?.NAME || '';
  const featureCountrySlug = feature => {
    const name = countryName(feature).toLowerCase();
    return Object.entries(slugCountryNames).find(([, names]) =>
      names.some(candidate => name.includes(candidate.toLowerCase()))
    )?.[0] || null;
  };

  const itineraryRoute = [
    {site:'uruk',year:-3500,country:'iraq'}, {site:'gordion',year:-800,country:'turkey'},
    {site:'olynthus',year:-430,country:'greece'}, {site:'pella',year:-400,country:'greece'},
    {site:'alexandria',year:-250,country:'egypt'}, {site:'delos',year:-200,country:'greece'},
    {site:'pompeii',year:-150,country:'italy'}, {site:'rome',year:-100,country:'italy'},
    {site:'carthage',year:50,country:'tunisia'}, {site:'paphos',year:150,country:'cyprus'},
    {site:'antioch',year:150,country:'turkey'}, {site:'ravenna',year:400,country:'italy'},
    {site:'thessaloniki',year:400,country:'greece'}, {site:'constantinople',year:400,country:'turkey'},
    {site:'madaba',year:500,country:'jordan'}, {site:'damascus',year:705,country:'syria'},
    {site:'jericho',year:720,country:'palestine'}, {site:'venice',year:1060,country:'italy'},
    {site:'palermo',year:1130,country:'italy'}, {site:'monreale',year:1170,country:'italy'}
  ].filter(step => byId[step.site]);

  let selectedYear = itineraryRoute[0]?.year ?? -3500;
  let selectedSiteId = itineraryRoute[0]?.site || null;
  let routeStepIndex = 0;
  let revealedSiteIds = new Set(selectedSiteId ? [selectedSiteId] : []);
  let visitedCountrySlugs = new Set();
  let activeCountrySlug = itineraryRoute[0]?.country || 'iraq';
  let storyPlaying = false;
  let storyToken = 0;
  let holdTimer = null;

  stepTotal.textContent = String(itineraryRoute.length).padStart(2,'0');

  const fmt = y => y < 0 ? `${Math.abs(y)} BCE` : `${y} CE`;
  const periodFor = y => y < -1000 ? ['The first experiments','Patterned architectural surfaces emerge in Mesopotamia.'] :
    y < -500 ? ['From cones to pebbles','Pebble pavements become an important new mosaic language.'] :
    y < -50 ? ['Greek and Hellenistic worlds','Mosaic becomes increasingly pictorial across Mediterranean centres.'] :
    y < 350 ? ['The Roman mosaic world','Mosaic spreads through villas, baths and public architecture across the empire.'] :
    y < 750 ? ['Late Antiquity and Byzantium','Glass and gold transform sacred and imperial interiors.'] :
    ['Medieval transformations','Byzantine traditions interact with Islamic, Venetian and Norman cultures.'];

  const countryCap = feature => {
    const slug = featureCountrySlug(feature);
    if (slug === activeCountrySlug) return 'rgba(0,220,255,.23)';
    if (slug && visitedCountrySlugs.has(slug)) return 'rgba(0,148,210,.075)';
    return 'rgba(5,15,25,.34)';
  };
  const countryStroke = feature => {
    const slug = featureCountrySlug(feature);
    if (slug === activeCountrySlug) return 'rgba(138,244,255,.95)';
    if (slug && visitedCountrySlugs.has(slug)) return 'rgba(55,205,255,.42)';
    return 'rgba(75,170,205,.18)';
  };

  const visibleSites = () => itineraryRoute.slice(0, routeStepIndex + 1).map(step => byId[step.site]).filter(Boolean);
  const visibleConnections = () => toggle.checked ? connections
    .filter(link => revealedSiteIds.has(link.from) && revealedSiteIds.has(link.to))
    .map(link => ({...link,source:byId[link.from],target:byId[link.to]}))
    .filter(link => link.source && link.target) : [];

  const Globe = window.Globe()(globeHost)
    .backgroundColor('rgba(0,0,0,0)')
    .showAtmosphere(true)
    .atmosphereColor('#29dfff')
    .atmosphereAltitude(.09)
    .showGraticules(true)
    .onGlobeReady(() => {
      const renderer = Globe.renderer();
      if (renderer) renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.45));
      const material = Globe.globeMaterial?.();
      if (material) {
        material.map = null; material.bumpMap = null;
        material.color?.set('#030a12');
        material.emissive?.set('#020914');
        material.emissiveIntensity = .85;
        material.shininess = 4;
        material.needsUpdate = true;
      }
    })
    .polygonsData([])
    .polygonCapColor(countryCap)
    .polygonSideColor(() => 'rgba(0,10,18,.92)')
    .polygonStrokeColor(countryStroke)
    .polygonAltitude(feature => featureCountrySlug(feature) === activeCountrySlug ? .009 : .003)
    .polygonsTransitionDuration(500)
    .htmlElementsData([])
    .htmlLat('lat').htmlLng('lng')
    .htmlAltitude(site => site.id === selectedSiteId ? .035 : .018)
    .htmlElement(site => {
      const marker = document.createElement('button');
      marker.type='button'; marker.dataset.siteId=site.id;
      marker.className=`city-pin${site.id===selectedSiteId?' is-active':''}`;
      marker.innerHTML=`<span class="city-pin__shape"></span><span class="city-pin__label"></span>`;
      marker.querySelector('.city-pin__label').textContent=site.name;
      marker.addEventListener('click',e=>{e.stopPropagation();stopStory();jumpToSite(site)});
      return marker;
    })
    .arcStartLat(l=>l.source.lat).arcStartLng(l=>l.source.lng)
    .arcEndLat(l=>l.target.lat).arcEndLng(l=>l.target.lng)
    .arcColor(l=> l.to===selectedSiteId || l.from===selectedSiteId
      ? ['rgba(44,220,255,.12)','rgba(255,212,103,.95)']
      : ['rgba(25,173,255,.03)','rgba(58,218,255,.32)'])
    .arcAltitudeAutoScale(.22).arcStroke(.17)
    .arcDashLength(.26).arcDashGap(.72).arcDashAnimateTime(2300);

  const controls=Globe.controls();
  controls.autoRotate=false; controls.enablePan=false; controls.enableZoom=true;
  controls.minDistance=112; controls.maxDistance=380; controls.rotateSpeed=.72; controls.zoomSpeed=1.08;

  const updatePinScale = alt => globeHost.style.setProperty('--pin-scale',Math.max(.62,Math.min(1.15,(alt+.42)/1.2)).toFixed(3));
  controls.addEventListener('change',()=>updatePinScale(Globe.pointOfView().altitude));

  function refreshCountries(){
    Globe.polygonCapColor(countryCap).polygonStrokeColor(countryStroke)
      .polygonAltitude(f=>featureCountrySlug(f)===activeCountrySlug?.009:.003);
  }

  function updateCard(site){
    infoCard.classList.remove('is-hidden');
    cardEra.textContent=`${fmt(site.start)} · ${site.culture}`;
    cardTitle.textContent=site.name; cardText.textContent=site.text;
    cardMeta.innerHTML=`<span><b>Country / region:</b> ${site.region}</span><span><b>Technique:</b> ${site.technique}</span><span><b>Visible by:</b> ${fmt(site.start)}</span>`;
    regionLink.hidden=false; regionLink.textContent=`Explore ${site.region} →`;
    regionLink.href=`./region.html?region=${encodeURIComponent(site.regionSlug)}&from=${encodeURIComponent(site.id)}`;
    if(window.gsap){
      gsap.fromTo(infoCard,{opacity:0,x:24,yPercent:-50},{opacity:1,x:0,yPercent:-50,duration:.5,ease:'power3.out',overwrite:true});
      gsap.fromTo([cardEra,cardTitle,cardText,cardMeta,regionLink],{opacity:0,y:8},{opacity:1,y:0,duration:.35,stagger:.035,ease:'power2.out',overwrite:true});
    }
  }

  function refreshUI(){
    const site=byId[selectedSiteId];
    slider.value=String(selectedYear); yearLabel.textContent=fmt(selectedYear);
    const [t,d]=periodFor(selectedYear); periodTitle.textContent=t; periodDescription.textContent=d;
    stepCurrent.textContent=String(routeStepIndex+1).padStart(2,'0');
    Globe.htmlElementsData(visibleSites()); Globe.arcsData(visibleConnections()); refreshCountries();
    requestAnimationFrame(()=>globeHost.querySelectorAll('.city-pin').forEach(m=>{
      const active=m.dataset.siteId===selectedSiteId; m.classList.toggle('is-active',active); m.classList.toggle('has-label',active);
    }));
    if(site) updateCard(site);
  }

  function setStep(index,{fly=true}={}){
    routeStepIndex=Math.max(0,Math.min(itineraryRoute.length-1,index));
    const step=itineraryRoute[routeStepIndex],site=byId[step.site]; if(!site)return;
    revealedSiteIds=new Set(itineraryRoute.slice(0,routeStepIndex+1).map(x=>x.site));
    visitedCountrySlugs=new Set(itineraryRoute.slice(0,routeStepIndex).map(x=>x.country));
    activeCountrySlug=step.country; selectedSiteId=site.id; selectedYear=step.year;
    refreshUI();
    if(fly) flyToSite(site,routeStepIndex>0?byId[itineraryRoute[routeStepIndex-1].site]:null);
  }

  function flyToSite(site,previousSite=null){
    const sameCountry=previousSite?.regionSlug===site.regionSlug;
    const close=.58;
    if(!window.gsap){Globe.pointOfView({lat:site.lat,lng:site.lng,altitude:close},1600);return}
    const p=Globe.pointOfView(); const s={lat:p.lat,lng:p.lng,altitude:p.altitude};
    const tl=gsap.timeline();
    if(!sameCountry){
      tl.to(s,{altitude:1.75,duration:.9,ease:'power2.inOut',onUpdate:()=>Globe.pointOfView(s,0)})
        .to(s,{lat:site.lat,lng:site.lng,duration:1.0,ease:'power2.inOut',onUpdate:()=>Globe.pointOfView(s,0)})
        .to(s,{altitude:close,duration:1.1,ease:'power3.inOut',onUpdate:()=>Globe.pointOfView(s,0)});
    }else{
      tl.to(s,{altitude:.92,duration:.45,ease:'power2.inOut',onUpdate:()=>Globe.pointOfView(s,0)})
        .to(s,{lat:site.lat,lng:site.lng,duration:.7,ease:'power2.inOut',onUpdate:()=>Globe.pointOfView(s,0)})
        .to(s,{altitude:close,duration:.65,ease:'power3.out',onUpdate:()=>Globe.pointOfView(s,0)});
    }
  }

  function jumpToSite(site){const i=itineraryRoute.findIndex(s=>s.site===site.id);if(i>=0)setStep(i)}
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  async function playStory(){
    stopStory(false); storyPlaying=true; holdHint.classList.add('is-hidden'); const token=++storyToken; controls.enableZoom=false;
    for(let i=routeStepIndex;i<itineraryRoute.length;i++){
      if(!storyPlaying||token!==storyToken)break;
      setStep(i,{fly:i!==routeStepIndex||i===0}); await wait(i===0?2200:3600);
    }
    if(token===storyToken){storyPlaying=false;controls.enableZoom=true}
  }
  function stopStory(increment=true){storyPlaying=false;controls.enableZoom=true;if(increment)storyToken++}
  function beginHold(e){if(storyPlaying)return;if(e.pointerType==='mouse'&&e.button!==0)return;holdHint.classList.add('is-holding');holdTimer=setTimeout(()=>{holdHint.classList.remove('is-holding');playStory()},2000)}
  function cancelHold(){if(holdTimer)clearTimeout(holdTimer);holdTimer=null;holdHint.classList.remove('is-holding')}
  globeHost.addEventListener('pointerdown',beginHold); globeHost.addEventListener('pointerup',cancelHold); globeHost.addEventListener('pointercancel',cancelHold); globeHost.addEventListener('pointerleave',cancelHold);
  slider.addEventListener('input',()=>{stopStory();const y=Number(slider.value);let i=0;itineraryRoute.forEach((s,n)=>{if(s.year<=y)i=n});setStep(i)});
  document.querySelectorAll('[data-year]').forEach(b=>b.addEventListener('click',()=>{stopStory();const y=Number(b.dataset.year);slider.value=String(y);slider.dispatchEvent(new Event('input'))}));
  toggle.addEventListener('change',()=>Globe.arcsData(visibleConnections())); closeCard.addEventListener('click',()=>infoCard.classList.add('is-hidden'));

  async function loadCountries(){
    try{const r=await fetch(COUNTRY_GEOJSON_URL);if(!r.ok)throw new Error(r.status);const g=await r.json();Globe.polygonsData(Array.isArray(g.features)?g.features:[]);refreshCountries()}catch(e){console.warn('Could not load country borders',e)}
  }
  function resize(){Globe.width(globeHost.clientWidth);Globe.height(globeHost.clientHeight);const r=Globe.renderer();if(r)r.setPixelRatio(Math.min(devicePixelRatio||1,1.45))}
  addEventListener('resize',resize);
  loadCountries(); resize(); setStep(0,{fly:false});
  Globe.pointOfView({lat:byId.uruk?.lat||31.324,lng:byId.uruk?.lng||45.636,altitude:.74},0); updatePinScale(.74);
})();
