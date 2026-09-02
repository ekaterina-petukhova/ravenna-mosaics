(() => {
  'use strict';

  const sites = window.MOSAIC_SITES || [];
  const connections = window.MOSAIC_CONNECTIONS || [];
  const story = window.MOSAIC_STORY || [];
  const byId = Object.fromEntries(sites.map(site => [site.id, site]));

  const regionAnchors = [
    { id: 'label-iraq', name: 'IRAQ', lat: 33.7, lng: 43.3, type: 'region', start: -3500 },
    { id: 'label-anatolia', name: 'ANATOLIA', lat: 39.0, lng: 36.0, type: 'region', start: -900 },
    { id: 'label-greece', name: 'GREECE', lat: 38.3, lng: 21.4, type: 'region', start: -450 },
    { id: 'label-egypt', name: 'EGYPT', lat: 26.4, lng: 29.4, type: 'region', start: -250 },
    { id: 'label-italy', name: 'ITALY', lat: 42.2, lng: 10.8, type: 'region', start: -150 },
    { id: 'label-nafrica', name: 'NORTH AFRICA', lat: 32.2, lng: 8.5, type: 'region', start: 50 },
    { id: 'label-cyprus', name: 'CYPRUS', lat: 34.6, lng: 32.5, type: 'region', start: 150 },
    { id: 'label-levant', name: 'LEVANT', lat: 31.6, lng: 36.0, type: 'region', start: 500 },
    { id: 'label-syria', name: 'SYRIA', lat: 35.2, lng: 39.4, type: 'region', start: 700 },
    { id: 'label-byzantine', name: 'BYZANTINE WORLD', lat: 43.0, lng: 30.0, type: 'region', start: 400 }
  ];

  const el = id => document.getElementById(id);
  const globeHost = el('globe');
  const slider = el('yearSlider');
  const yearLabel = el('yearLabel');
  const periodTitle = el('periodTitle');
  const periodDescription = el('periodDescription');
  const toggle = el('connectionsToggle');
  const storyButton = el('storyButton');
  const infoCard = el('infoCard');
  const cardEra = el('cardEra');
  const cardTitle = el('cardTitle');
  const cardText = el('cardText');
  const cardMeta = el('cardMeta');
  const regionLink = el('regionLink');
  const closeCard = el('closeCard');

  let selectedYear = Number(slider.value);
  let storyPlaying = false;
  let storyRun = 0;
  let selectedSiteId = null;

  const formatYear = year => year < 0 ? `${Math.abs(year)} BCE` : `${year} CE`;

  const periodFor = year => {
    if (year < -1000) return ['The first experiments', 'In Mesopotamia, patterned architectural surfaces were assembled from repeated coloured elements.'];
    if (year < -500) return ['From cones to pebbles', 'Across Anatolia and the eastern Mediterranean, pebble pavements become an important new mosaic language.'];
    if (year < -50) return ['Greek and Hellenistic worlds', 'Pebble floors become pictorial and tessellated techniques spread through interconnected Mediterranean centres.'];
    if (year < 350) return ['The Roman mosaic world', 'Mosaic becomes a major art of villas, baths, houses and public architecture across the Roman Empire.'];
    if (year < 750) return ['Late Antiquity and Byzantium', 'Glass, gold and wall mosaic transform sacred and imperial interiors from Ravenna to the eastern Mediterranean.'];
    return ['Medieval transformations', 'Byzantine traditions interact with Islamic, Venetian and Norman Mediterranean cultures in new monumental programmes.'];
  };

  const visibleSites = () => sites.filter(site => site.start <= selectedYear);

  const visibleConnections = () => {
    if (!toggle.checked) return [];
    return connections
      .filter(link => link.start <= selectedYear && byId[link.from] && byId[link.to])
      .map(link => ({ ...link, source: byId[link.from], target: byId[link.to] }));
  };

  const visibleLabels = () => {
    const shownSites = visibleSites();

    // Keep the globe readable: show only the most important cities by default.
    const labels = shownSites.filter(site => site.importance >= 5);

    // When there are only a few sites in an early period, include importance 4 too.
    if (shownSites.length <= 6) {
      labels.push(
        ...shownSites.filter(
          site => site.importance >= 4 &&
          !labels.some(item => item.id === site.id)
        )
      );
    }

    // A selected city is always labelled.
    if (
      selectedSiteId &&
      byId[selectedSiteId] &&
      !labels.some(item => item.id === selectedSiteId)
    ) {
      labels.push(byId[selectedSiteId]);
    }

    const regions = regionAnchors.filter(anchor => anchor.start <= selectedYear);

    return [
      ...regions,
      ...labels.map(site => ({ ...site, type: 'site' }))
    ];
  };

  const Globe = window.Globe()(globeHost)
    .backgroundColor('rgba(0,0,0,0)')
    .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
    .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
    .showAtmosphere(true)
    .showGraticules(true)
    .atmosphereColor('#5a8cff')
    .atmosphereAltitude(0.11)
    .pointLat('lat')
    .pointLng('lng')
    .pointAltitude(site => site.id === selectedSiteId ? 0.03 : 0.012 + site.importance * 0.002)
    .pointRadius(site => site.id === selectedSiteId ? 0.2 : 0.08 + site.importance * 0.018)
    .pointColor(site => site.id === selectedSiteId ? '#ffd86d' : site.id === 'uruk' ? '#e5ba53' : '#f1d27a')
    .pointLabel(site => `
      <div style="padding:7px 9px;background:rgba(4,5,8,.94);border:1px solid rgba(255,255,255,.14);border-radius:8px;font-family:Nunito,sans-serif">
        <strong>${site.name}</strong><br>
        <span style="opacity:.74">${site.region}</span><br>
        <span style="opacity:.6">${formatYear(site.start)} · ${site.culture}</span>
      </div>`)
    .onPointClick(site => {
      stopStory();
      selectSite(site, true);
    })
    .arcStartLat(link => link.source.lat)
    .arcStartLng(link => link.source.lng)
    .arcEndLat(link => link.target.lat)
    .arcEndLng(link => link.target.lng)
    .arcColor(() => ['rgba(72,116,255,.08)', 'rgba(128,175,255,.78)'])
    .arcAltitudeAutoScale(0.16)
    .arcStroke(0.35)
    .arcDashLength(0.22)
    .arcDashGap(0.88)
    .arcDashAnimateTime(3400)
    .arcLabel(link => link.label)
    ;

  // Crisp HTML labels are much easier to read than the default 3D text.
  if (typeof Globe.htmlElementsData === 'function') {
    Globe
      .htmlLat('lat')
      .htmlLng('lng')
      .htmlAltitude(item => item.type === 'region' ? 0.012 : item.id === selectedSiteId ? 0.045 : 0.03)
      .htmlElement(item => {
        const node = document.createElement('div');

        if (item.type === 'region') {
          node.className = 'globe-label globe-label--region';
          node.textContent = item.name;
        } else {
          node.className =
            'globe-label globe-label--city' +
            (item.id === selectedSiteId ? ' is-selected' : '');

          const city = document.createElement('span');
          city.className = 'globe-label__city';
          city.textContent = item.name;

          const country = document.createElement('span');
          country.className = 'globe-label__country';
          country.textContent = item.region;

          node.append(city, country);
        }

        return node;
      });
  }

  Globe.controls().autoRotate = false;
  Globe.controls().enablePan = false;
  Globe.controls().minDistance = 135;
  Globe.controls().maxDistance = 290;
  Globe.controls().rotateSpeed = 0.9;
  Globe.controls().zoomSpeed = 0.9;
  Globe.pointOfView({ lat: 36, lng: 20, altitude: 1.42 }, 0);

  function refresh() {
    selectedYear = Number(slider.value);
    yearLabel.textContent = formatYear(selectedYear);
    const [title, description] = periodFor(selectedYear);
    periodTitle.textContent = title;
    periodDescription.textContent = description;

    const visible = visibleSites();
    if (selectedSiteId && !visible.some(site => site.id === selectedSiteId)) {
      selectedSiteId = null;
    }

    Globe.pointsData(visible);
    Globe.arcsData(visibleConnections());

    const labels = visibleLabels();

    if (typeof Globe.htmlElementsData === 'function') {
      Globe.htmlElementsData(labels);
    } else if (typeof Globe.labelsData === 'function') {
      // Fallback for older Globe.gl builds.
      Globe
        .labelLat('lat')
        .labelLng('lng')
        .labelText(item => item.name)
        .labelSize(item => item.type === 'region' ? 0.52 : 0.62)
        .labelAltitude(item => item.type === 'region' ? 0.012 : 0.032)
        .labelColor(item => item.type === 'region' ? 'rgba(255,255,255,.72)' : '#ffffff')
        .labelResolution(4)
        .labelIncludeDot(item => item.type !== 'region')
        .labelDotRadius(item => item.type === 'region' ? 0 : 0.11)
        .labelsData(labels);
    }
  }

  function selectSite(site, fly = false, storyTitle = null) {
    if (!site) return;
    selectedSiteId = site.id;

    if (fly) {
      Globe.controls().autoRotate = false;
      Globe.pointOfView({ lat: site.lat, lng: site.lng, altitude: 1.08 }, 1200);
    }

    infoCard.classList.remove('is-hidden');
    cardEra.textContent = storyTitle || `${formatYear(site.start)} · ${site.culture}`;
    cardTitle.textContent = site.name;
    cardText.textContent = site.text;
    cardMeta.innerHTML = `
      <span><b>Country / region:</b> ${site.region}</span>
      <span><b>Technique:</b> ${site.technique}</span>
      <span><b>Visible by:</b> ${formatYear(site.start)}</span>`;

    regionLink.hidden = false;
    regionLink.textContent = `Explore ${site.region} →`;
    regionLink.href = `./region.html?region=${encodeURIComponent(site.regionSlug)}&from=${encodeURIComponent(site.id)}`;

    refresh();
  }

  slider.addEventListener('input', () => {
    stopStory();
    refresh();
  });

  toggle.addEventListener('change', refresh);

  document.querySelectorAll('[data-year]').forEach(button => {
    button.addEventListener('click', () => {
      stopStory();
      slider.value = button.dataset.year;
      refresh();
    });
  });

  closeCard.addEventListener('click', () => {
    selectedSiteId = null;
    infoCard.classList.add('is-hidden');
    refresh();
  });

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  async function playStory() {
    stopStory(false);
    storyPlaying = true;
    const run = ++storyRun;
    storyButton.classList.add('is-playing');
    storyButton.textContent = 'Ⅱ Pause story';
    Globe.controls().autoRotate = false;

    for (const step of story) {
      if (!storyPlaying || run !== storyRun) break;
      slider.value = step.year;
      refresh();
      const site = byId[step.site];
      selectSite(site, true, step.title);
      await wait(step.duration || 4500);
    }

    if (run === storyRun) stopStory(false);
  }

  function stopStory(increment = true) {
    storyPlaying = false;
    if (increment) storyRun++;
    storyButton.classList.remove('is-playing');
    storyButton.textContent = '▶ Story mode';
  }

  storyButton.addEventListener('click', () => {
    if (storyPlaying) stopStory();
    else playStory();
  });

  function resize() {
    Globe.width(globeHost.clientWidth);
    Globe.height(globeHost.clientHeight);
  }

  window.addEventListener('resize', resize);
  resize();
  refresh();
})();
