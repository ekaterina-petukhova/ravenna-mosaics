(() => {
  'use strict';

  const COUNTRY_GEOJSON_URL =
    'https://cdn.jsdelivr.net/gh/johan/world.geo.json@master/countries.geo.json';

  const sites = window.MOSAIC_SITES || [];
  const connections = window.MOSAIC_CONNECTIONS || [];
  const story = window.MOSAIC_STORY || [];
  const byId = Object.fromEntries(sites.map(site => [site.id, site]));

  const regionAnchors = [
    { id: 'label-iraq', name: 'Iraq', lat: 33.2, lng: 43.8, type: 'region', start: -3500 },
    { id: 'label-anatolia', name: 'Anatolia', lat: 39.0, lng: 35.0, type: 'region', start: -900 },
    { id: 'label-greece', name: 'Greece', lat: 39.2, lng: 22.6, type: 'region', start: -450 },
    { id: 'label-egypt', name: 'Egypt', lat: 27.2, lng: 30.2, type: 'region', start: -250 },
    { id: 'label-italy', name: 'Italy', lat: 42.5, lng: 12.6, type: 'region', start: -150 },
    { id: 'label-nafrica', name: 'North Africa', lat: 33.0, lng: 12.0, type: 'region', start: 50 },
    { id: 'label-cyprus', name: 'Cyprus', lat: 35.0, lng: 33.0, type: 'region', start: 150 },
    { id: 'label-levant', name: 'Levant', lat: 32.2, lng: 35.6, type: 'region', start: 500 },
    { id: 'label-syria', name: 'Syria', lat: 35.0, lng: 38.2, type: 'region', start: 700 },
    { id: 'label-byzantine', name: 'Byzantine world', lat: 41.2, lng: 27.5, type: 'region', start: 400 }
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

  const formatYear = year =>
    year < 0 ? `${Math.abs(year)} BCE` : `${year} CE`;

  const periodFor = year => {
    if (year < -1000) {
      return [
        'The first experiments',
        'In Mesopotamia, patterned architectural surfaces were assembled from repeated coloured elements.'
      ];
    }
    if (year < -500) {
      return [
        'From cones to pebbles',
        'Across Anatolia and the eastern Mediterranean, pebble pavements become an important new mosaic language.'
      ];
    }
    if (year < -50) {
      return [
        'Greek and Hellenistic worlds',
        'Pebble floors become pictorial and tessellated techniques spread through interconnected Mediterranean centres.'
      ];
    }
    if (year < 350) {
      return [
        'The Roman mosaic world',
        'Mosaic becomes a major art of villas, baths, houses and public architecture across the Roman Empire.'
      ];
    }
    if (year < 750) {
      return [
        'Late Antiquity and Byzantium',
        'Glass, gold and wall mosaic transform sacred and imperial interiors from Ravenna to the eastern Mediterranean.'
      ];
    }
    return [
      'Medieval transformations',
      'Byzantine traditions interact with Islamic, Venetian and Norman Mediterranean cultures in new monumental programmes.'
    ];
  };

  const visibleSites = () =>
    sites.filter(site => site.start <= selectedYear);

  const linksForYear = () =>
    connections
      .filter(
        link =>
          link.start <= selectedYear &&
          byId[link.from] &&
          byId[link.to]
      )
      .map(link => ({
        ...link,
        source: byId[link.from],
        target: byId[link.to]
      }));

  const visibleConnections = () => {
    if (!toggle.checked) return [];

    const base = linksForYear();
    if (!selectedSiteId) return base;

    const related = base.filter(
      link =>
        link.from === selectedSiteId ||
        link.to === selectedSiteId
    );

    return related.length ? related : base;
  };

  const visibleLabels = () => {
    const shownSites = visibleSites();
    const labels = shownSites.filter(site => site.importance >= 5);

    if (shownSites.length <= 8) {
      shownSites
        .filter(site => site.importance >= 4)
        .forEach(site => {
          if (!labels.some(item => item.id === site.id)) {
            labels.push(site);
          }
        });
    }

    if (
      selectedSiteId &&
      byId[selectedSiteId] &&
      !labels.some(item => item.id === selectedSiteId)
    ) {
      labels.push(byId[selectedSiteId]);
    }

    const regions = regionAnchors.filter(
      anchor => anchor.start <= selectedYear
    );

    return [
      ...regions,
      ...labels.map(site => ({ ...site, type: 'site' }))
    ];
  };

  const Globe = window.Globe()(globeHost)
    .backgroundColor('rgba(0,0,0,0)')
    .globeImageUrl(
      'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg'
    )
    .bumpImageUrl(
      'https://unpkg.com/three-globe/example/img/earth-topology.png'
    )
    .showAtmosphere(true)
    .showGraticules(true)
    .atmosphereColor('#5a8cff')
    .atmosphereAltitude(0.11)

    .polygonsData([])
    .polygonCapColor(() => 'rgba(0,0,0,0)')
    .polygonSideColor(() => 'rgba(0,0,0,0)')
    .polygonStrokeColor(() => 'rgba(255,255,255,.12)')
    .polygonAltitude(0.001)

    .htmlElementsData([])
    .htmlLat('lat')
    .htmlLng('lng')
    .htmlAltitude(site =>
      site.id === selectedSiteId ? 0.035 : 0.02
    )
    .htmlElement(site => {
      const marker = document.createElement('button');
      marker.type = 'button';
      marker.className = `city-pin${
        site.id === selectedSiteId ? ' is-active' : ''
      }`;
      marker.setAttribute(
        'aria-label',
        `${site.name}, ${site.region}`
      );
      marker.title = `${site.name}, ${site.region}`;
      marker.innerHTML = `<span class="city-pin__shape"></span>`;

      marker.addEventListener('click', event => {
        event.stopPropagation();
        stopStory();
        selectSite(site, true);
      });

      return marker;
    })

    .arcStartLat(link => link.source.lat)
    .arcStartLng(link => link.source.lng)
    .arcEndLat(link => link.target.lat)
    .arcEndLng(link => link.target.lng)
    .arcColor(() => [
      'rgba(105,150,255,.03)',
      'rgba(128,175,255,.46)'
    ])
    .arcAltitudeAutoScale(0.11)
    .arcStroke(0.18)
    .arcDashLength(0.22)
    .arcDashGap(0.88)
    .arcDashAnimateTime(3400)
    .arcLabel(link => link.label)

    .labelLat('lat')
    .labelLng('lng')
    .labelText(item => item.name)
    .labelSize(item =>
      item.type === 'region'
        ? 1.15
        : item.id === selectedSiteId
          ? 1.15
          : 0.9
    )
    .labelAltitude(item =>
      item.type === 'region'
        ? 0.01
        : item.id === selectedSiteId
          ? 0.05
          : 0.03
    )
    .labelColor(item =>
      item.type === 'region'
        ? 'rgba(255,255,255,.5)'
        : item.id === selectedSiteId
          ? '#ffe39a'
          : 'rgba(255,255,255,.88)'
    )
    .labelResolution(2)
    .labelDotRadius(item =>
      item.type === 'region'
        ? 0
        : item.id === selectedSiteId
          ? 0.22
          : 0.14
    )
    .labelIncludeDot(item => item.type !== 'region');

  Globe.controls().autoRotate = false;
  Globe.controls().enablePan = false;
  Globe.controls().minDistance = 100;
  Globe.controls().maxDistance = 330;
  Globe.controls().rotateSpeed = 0.85;
  Globe.controls().zoomSpeed = 1.15;
  

  Globe.controls().autoRotate = false;
  Globe.controls().enablePan = false;
  Globe.controls().minDistance = 100;
  Globe.controls().maxDistance = 330;
  Globe.controls().rotateSpeed = 0.85;
  Globe.controls().zoomSpeed = 1.15;

// globe.gl resets maxDistance asynchronously on init, and recalculates
// zoomSpeed/rotateSpeed on every camera "change" event. Re-assert our
// values so they actually stick.
  setTimeout(() => {
    Globe.controls().maxDistance = 330;
  }, 0);

  Globe.controls().addEventListener('change', () => {
    Globe.controls().rotateSpeed = 0.85;
    Globe.controls().zoomSpeed = 1.15;
  });
  Globe.pointOfView(
    { lat: 36, lng: 18, altitude: 1.78 },
    0
  );

  async function loadCountries() {
    try {
      const response = await fetch(COUNTRY_GEOJSON_URL);
      if (!response.ok) {
        throw new Error(`Countries fetch failed: ${response.status}`);
      }

      const geojson = await response.json();
      Globe.polygonsData(
        Array.isArray(geojson.features) ? geojson.features : []
      );
    } catch (error) {
      console.warn('Could not load country borders:', error);
    }
  }

  function refresh() {
    selectedYear = Number(slider.value);
    yearLabel.textContent = formatYear(selectedYear);

    const [title, description] = periodFor(selectedYear);
    periodTitle.textContent = title;
    periodDescription.textContent = description;

    const visible = visibleSites();

    if (
      selectedSiteId &&
      !visible.some(site => site.id === selectedSiteId)
    ) {
      selectedSiteId = null;
    }

    Globe.htmlElementsData(visible);
    Globe.arcsData(visibleConnections());
    Globe.labelsData(visibleLabels());
  }

  function selectSite(site, fly = false, storyTitle = null) {
    if (!site) return;

    selectedSiteId = site.id;

    if (fly) {
      Globe.controls().autoRotate = false;
      Globe.pointOfView(
        {
          lat: site.lat,
          lng: site.lng,
          altitude: 0.9
        },
        1200
      );
    }

    infoCard.classList.remove('is-hidden');
    cardEra.textContent =
      storyTitle || `${formatYear(site.start)} · ${site.culture}`;
    cardTitle.textContent = site.name;
    cardText.textContent = site.text;
    cardMeta.innerHTML = `
      <span><b>Country / region:</b> ${site.region}</span>
      <span><b>Technique:</b> ${site.technique}</span>
      <span><b>Visible by:</b> ${formatYear(site.start)}</span>
    `;

    regionLink.hidden = false;
    regionLink.textContent = `Explore ${site.region} →`;
    regionLink.href =
      `./region.html?region=${encodeURIComponent(site.regionSlug)}&from=${encodeURIComponent(site.id)}`;

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

  const wait = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

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

  loadCountries();
  resize();
  refresh();
})();
