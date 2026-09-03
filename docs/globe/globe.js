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

  const NEUTRAL_COUNTRY = '#9d9a92';
  const NEUTRAL_STROKE = 'rgba(43,37,31,.32)';
  const ACTIVE_STROKE = 'rgba(255,243,207,.96)';
  const BASE_GLOBE = '#c8c4bb';

  const countryRouteColors = {
    iraq: '#c9894a',
    turkey: '#d6a85f',
    greece: '#b96b52',
    egypt: '#d8b86c',
    italy: '#a95d48',
    tunisia: '#cb8e61',
    cyprus: '#d9a66e',
    jordan: '#be7758',
    palestine: '#d2a05f',
    syria: '#a96a50'
  };

  const slugCountryNames = {
    iraq: ['Iraq'],
    turkey: ['Turkey'],
    greece: ['Greece'],
    egypt: ['Egypt'],
    italy: ['Italy'],
    tunisia: ['Tunisia'],
    cyprus: ['Cyprus'],
    jordan: ['Jordan'],
    palestine: ['Palestine', 'Israel'],
    syria: ['Syria']
  };

  const countryName = feature =>
    feature?.properties?.NAME_LONG ||
    feature?.properties?.ADMIN ||
    feature?.properties?.NAME || '';

  const featureCountrySlug = feature => {
    const name = countryName(feature).toLowerCase();
    return Object.entries(slugCountryNames).find(([, names]) =>
      names.some(candidate => name.includes(candidate.toLowerCase()))
    )?.[0] || null;
  };

  // Curated order: exactly one new centre is revealed at each narrative step.
  const itineraryRoute = [
    { site: 'uruk', year: -3500, country: 'iraq' },
    { site: 'gordion', year: -800, country: 'turkey' },
    { site: 'olynthus', year: -430, country: 'greece' },
    { site: 'pella', year: -400, country: 'greece' },
    { site: 'alexandria', year: -250, country: 'egypt' },
    { site: 'delos', year: -200, country: 'greece' },
    { site: 'pompeii', year: -150, country: 'italy' },
    { site: 'rome', year: -100, country: 'italy' },
    { site: 'carthage', year: 50, country: 'tunisia' },
    { site: 'paphos', year: 150, country: 'cyprus' },
    { site: 'antioch', year: 150, country: 'turkey' },
    { site: 'ravenna', year: 400, country: 'italy' },
    { site: 'thessaloniki', year: 400, country: 'greece' },
    { site: 'constantinople', year: 400, country: 'turkey' },
    { site: 'madaba', year: 500, country: 'jordan' },
    { site: 'damascus', year: 705, country: 'syria' },
    { site: 'jericho', year: 720, country: 'palestine' },
    { site: 'venice', year: 1060, country: 'italy' },
    { site: 'palermo', year: 1130, country: 'italy' },
    { site: 'monreale', year: 1170, country: 'italy' }
  ].filter(step => byId[step.site]);

  let selectedYear = -3500;
  let selectedSiteId = itineraryRoute[0]?.site || null;
  let routeStepIndex = 0;
  let revealedSiteIds = new Set(selectedSiteId ? [selectedSiteId] : []);
  let visitedCountrySlugs = new Set(['iraq']);
  let activeCountrySlug = 'iraq';
  let storyPlaying = false;
  let storyToken = 0;
  let holdTimer = null;
  let holdStartedAt = 0;
  let longPressTriggered = false;
  let currentAltitude = 0.26;

  const formatYear = year => year < 0 ? `${Math.abs(year)} BCE` : `${year} CE`;

  const periodFor = year => {
    if (year < -1000) return ['The first experiments', 'Patterned architectural surfaces emerge in Mesopotamia.'];
    if (year < -500) return ['From cones to pebbles', 'Pebble pavements become an important new mosaic language.'];
    if (year < -50) return ['Greek and Hellenistic worlds', 'Mosaic becomes increasingly pictorial across Mediterranean centres.'];
    if (year < 350) return ['The Roman mosaic world', 'Mosaic spreads through villas, baths and public architecture across the empire.'];
    if (year < 750) return ['Late Antiquity and Byzantium', 'Glass and gold transform sacred and imperial interiors.'];
    return ['Medieval transformations', 'Byzantine traditions interact with Islamic, Venetian and Norman cultures.'];
  };

  const countryDisplayColor = feature => {
    const slug = featureCountrySlug(feature);
    if (!slug || !visitedCountrySlugs.has(slug)) return NEUTRAL_COUNTRY;
    return countryRouteColors[slug] || '#c8955a';
  };

  const countryStrokeColor = feature => {
    const slug = featureCountrySlug(feature);
    return slug && slug === activeCountrySlug ? ACTIVE_STROKE : NEUTRAL_STROKE;
  };

  const visibleSites = () =>
    itineraryRoute
      .slice(0, routeStepIndex + 1)
      .map(step => byId[step.site])
      .filter(Boolean);

  const visibleConnections = () => {
    if (!toggle.checked) return [];
    return connections
      .filter(link => revealedSiteIds.has(link.from) && revealedSiteIds.has(link.to))
      .map(link => ({ ...link, source: byId[link.from], target: byId[link.to] }))
      .filter(link => link.source && link.target);
  };

  const updatePinScale = altitude => {
    const scale = Math.max(.58, Math.min(1.18, (altitude + .36) / .68));
    globeHost.style.setProperty('--pin-scale', scale.toFixed(3));
  };

  const Globe = window.Globe()(globeHost)
    .backgroundColor('rgba(0,0,0,0)')
    .showAtmosphere(true)
    .atmosphereColor('#d8c8aa')
    .atmosphereAltitude(0.035)
    .showGraticules(true)
    .onGlobeReady(() => {
      const renderer = Globe.renderer();
      if (renderer) renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
      const material = Globe.globeMaterial?.();
      if (material) {
        material.map = null;
        material.bumpMap = null;
        if (material.color) material.color.set(BASE_GLOBE);
        if (material.emissive) material.emissive.set('#181511');
        material.needsUpdate = true;
      }
    })
    .polygonsData([])
    .polygonCapColor(countryDisplayColor)
    .polygonSideColor(() => 'rgba(83,72,61,.92)')
    .polygonStrokeColor(countryStrokeColor)
    .polygonAltitude(feature => featureCountrySlug(feature) === activeCountrySlug ? 0.008 : 0.004)
    .polygonsTransitionDuration(700)

    .htmlElementsData([])
    .htmlLat('lat')
    .htmlLng('lng')
    .htmlAltitude(site => site.id === selectedSiteId ? 0.04 : 0.02)
    .htmlElement(site => {
      const marker = document.createElement('button');
      marker.type = 'button';
      marker.dataset.siteId = site.id;
      marker.className = `city-pin${site.id === selectedSiteId ? ' is-active' : ''}`;
      marker.setAttribute('aria-label', `${site.name}, ${site.region}`);
      marker.innerHTML = `
        <span class="city-pin__shape" aria-hidden="true"></span>
        <span class="city-pin__label">${site.name}</span>
      `;
      marker.addEventListener('click', event => {
        event.stopPropagation();
        stopStory();
        jumpToSite(site);
      });
      return marker;
    })

    .arcStartLat(link => link.source.lat)
    .arcStartLng(link => link.source.lng)
    .arcEndLat(link => link.target.lat)
    .arcEndLng(link => link.target.lng)
    .arcColor(() => ['rgba(221,180,98,.04)', 'rgba(240,199,109,.50)'])
    .arcAltitudeAutoScale(0.10)
    .arcStroke(0.13)
    .arcDashLength(0.24)
    .arcDashGap(0.82)
    .arcDashAnimateTime(3600);

  const controls = Globe.controls();
  controls.autoRotate = false;
  controls.enablePan = false;
  controls.enableZoom = true;
  controls.minDistance = 106;
  controls.maxDistance = 360;
  controls.rotateSpeed = .78;
  controls.zoomSpeed = 1.1;

  controls.addEventListener('change', () => {
    currentAltitude = Globe.pointOfView().altitude;
    updatePinScale(currentAltitude);
  });

  const refreshCountries = () => {
    Globe
      .polygonCapColor(countryDisplayColor)
      .polygonStrokeColor(countryStrokeColor)
      .polygonAltitude(feature => featureCountrySlug(feature) === activeCountrySlug ? 0.008 : 0.004);
  };

  function refreshUI() {
    const site = byId[selectedSiteId];
    slider.value = String(selectedYear);
    yearLabel.textContent = formatYear(selectedYear);
    const [title, desc] = periodFor(selectedYear);
    periodTitle.textContent = title;
    periodDescription.textContent = desc;

    Globe.htmlElementsData(visibleSites());
    Globe.arcsData(visibleConnections());

    requestAnimationFrame(() => {
      globeHost.querySelectorAll('.city-pin').forEach(marker => {
        const active = marker.dataset.siteId === selectedSiteId;
        marker.classList.toggle('is-active', active);
        marker.classList.toggle('has-label', active);
      });
      const activeMarker = globeHost.querySelector(`[data-site-id="${selectedSiteId}"]`);
      activeMarker?.classList.add('is-arriving');
      setTimeout(() => activeMarker?.classList.remove('is-arriving'), 700);
    });

    refreshCountries();
    if (site) updateCard(site);
  }

  function updateCard(site) {
    infoCard.classList.remove('is-hidden');
    cardEra.textContent = `${formatYear(site.start)} · ${site.culture}`;
    cardTitle.textContent = site.name;
    cardText.textContent = site.text;
    cardMeta.innerHTML = `
      <span><b>Country / region:</b> ${site.region}</span>
      <span><b>Technique:</b> ${site.technique}</span>
      <span><b>Visible by:</b> ${formatYear(site.start)}</span>
    `;
    regionLink.hidden = false;
    regionLink.textContent = `Explore ${site.region} →`;
    regionLink.href = `./region.html?region=${encodeURIComponent(site.regionSlug)}&from=${encodeURIComponent(site.id)}`;

    if (window.gsap) {
      gsap.fromTo(infoCard,
        { opacity: 0, x: 26, yPercent: -50 },
        { opacity: 1, x: 0, yPercent: -50, duration: .55, ease: 'power3.out', overwrite: true }
      );
      gsap.fromTo([cardEra, cardTitle, cardText, cardMeta, regionLink],
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: .42, stagger: .04, ease: 'power2.out', overwrite: true }
      );
    }
  }

  function setStep(index, { fly = true } = {}) {
    const bounded = Math.max(0, Math.min(itineraryRoute.length - 1, index));
    routeStepIndex = bounded;
    const step = itineraryRoute[bounded];
    const site = byId[step.site];
    if (!site) return;

    revealedSiteIds = new Set(itineraryRoute.slice(0, bounded + 1).map(item => item.site));
    visitedCountrySlugs = new Set(itineraryRoute.slice(0, bounded + 1).map(item => item.country));
    selectedSiteId = site.id;
    selectedYear = step.year;
    activeCountrySlug = step.country;
    refreshUI();

    if (fly) flyToSite(site, bounded > 0 ? byId[itineraryRoute[bounded - 1].site] : null);
  }

  function flyToSite(site, previousSite = null) {
    const closeAltitude = site.importance >= 5 ? 0.20 : 0.27;
    const sameCountry = previousSite?.regionSlug === site.regionSlug;

    if (!window.gsap || sameCountry) {
      Globe.pointOfView({ lat: site.lat, lng: site.lng, altitude: sameCountry ? .34 : closeAltitude }, sameCountry ? 1100 : 1500);
      return;
    }

    const start = Globe.pointOfView();
    const state = { lat: start.lat, lng: start.lng, altitude: start.altitude };
    const timeline = gsap.timeline();

    timeline
      .to(state, {
        altitude: 1.75,
        duration: .82,
        ease: 'power2.inOut',
        onUpdate: () => Globe.pointOfView(state, 0)
      })
      .to(state, {
        lat: site.lat,
        lng: site.lng,
        duration: 1.05,
        ease: 'power2.inOut',
        onUpdate: () => Globe.pointOfView(state, 0)
      })
      .to(state, {
        altitude: closeAltitude,
        duration: 1.05,
        ease: 'power3.inOut',
        onUpdate: () => Globe.pointOfView(state, 0)
      });
  }

  function jumpToSite(site) {
    const index = itineraryRoute.findIndex(step => step.site === site.id);
    if (index >= 0) setStep(index);
  }

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  async function playStory() {
    stopStory(false);
    storyPlaying = true;
    longPressTriggered = true;
    holdHint.classList.add('is-hidden');
    const token = ++storyToken;
    controls.enableZoom = false;

    for (let i = routeStepIndex; i < itineraryRoute.length; i++) {
      if (!storyPlaying || token !== storyToken) break;
      setStep(i, { fly: i !== routeStepIndex || i === 0 });
      await wait(i === 0 ? 2200 : 3500);
    }

    if (token === storyToken) {
      storyPlaying = false;
      controls.enableZoom = true;
    }
  }

  function stopStory(increment = true) {
    storyPlaying = false;
    controls.enableZoom = true;
    if (increment) storyToken++;
  }

  function beginHold(event) {
    if (storyPlaying) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    holdStartedAt = performance.now();
    longPressTriggered = false;
    holdHint.classList.add('is-holding');
    holdTimer = window.setTimeout(() => {
      longPressTriggered = true;
      holdHint.classList.remove('is-holding');
      playStory();
    }, 2000);
  }

  function cancelHold() {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = null;
    holdHint.classList.remove('is-holding');
  }

  globeHost.addEventListener('pointerdown', beginHold);
  globeHost.addEventListener('pointerup', cancelHold);
  globeHost.addEventListener('pointercancel', cancelHold);
  globeHost.addEventListener('pointerleave', cancelHold);

  slider.addEventListener('input', () => {
    stopStory();
    const year = Number(slider.value);
    let index = 0;
    itineraryRoute.forEach((step, i) => {
      if (step.year <= year) index = i;
    });
    setStep(index, { fly: true });
  });

  document.querySelectorAll('[data-year]').forEach(button => {
    button.addEventListener('click', () => {
      stopStory();
      const year = Number(button.dataset.year);
      slider.value = String(year);
      slider.dispatchEvent(new Event('input'));
    });
  });

  toggle.addEventListener('change', () => Globe.arcsData(visibleConnections()));

  closeCard.addEventListener('click', () => {
    infoCard.classList.add('is-hidden');
  });

  async function loadCountries() {
    try {
      const response = await fetch(COUNTRY_GEOJSON_URL);
      if (!response.ok) throw new Error(`Countries fetch failed: ${response.status}`);
      const geojson = await response.json();
      Globe.polygonsData(Array.isArray(geojson.features) ? geojson.features : []);
      refreshCountries();
    } catch (error) {
      console.warn('Could not load country borders:', error);
    }
  }

  function resize() {
    Globe.width(globeHost.clientWidth);
    Globe.height(globeHost.clientHeight);
    const renderer = Globe.renderer();
    if (renderer) renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
  }

  window.addEventListener('resize', resize);

  loadCountries();
  resize();
  setStep(0, { fly: false });
  Globe.pointOfView({ lat: byId.uruk?.lat || 31.324, lng: byId.uruk?.lng || 45.636, altitude: 0.20 }, 0);
  updatePinScale(.20);
})();
