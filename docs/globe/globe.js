(() => {
  'use strict';

  // The 50m Natural Earth boundaries are a good quality/performance balance
  // for this Mediterranean atlas. The 10m file is too large for a first load.
  const COUNTRY_GEOJSON_URL =
    'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson';

  const sites = window.MOSAIC_SITES || [];
  const connections = window.MOSAIC_CONNECTIONS || [];
  const story = window.MOSAIC_STORY || [];
  const byId = Object.fromEntries(sites.map(site => [site.id, site]));

  const GLOBE_RADIUS = 100; // matches three-globe's default globe radius
  const BASE_ALTITUDE = 1.78; // matches the initial pointOfView below
  const BASE_ROTATE_SPEED = 0.85;
  const BASE_ZOOM_SPEED = 1.15;
  const REFERENCE_HEIGHT = 700; // desktop-ish canvas height rotateSpeed was tuned against
  let currentAltitude = BASE_ALTITUDE;
  let labelDeclutterTimer = null;

  // OrbitControls normalizes drag rotation by the canvas's pixel HEIGHT, not
  // by finger/mouse travel distance. On a short mobile viewport the same
  // physical swipe covers a much bigger fraction of the screen, so the same
  // rotateSpeed value spins the globe far faster. Scale it down accordingly.
  const rotateSpeedForViewport = () => {
    const height = globeHost.clientHeight || REFERENCE_HEIGHT;
    const factor = Math.min(1, height / REFERENCE_HEIGHT);
    return BASE_ROTATE_SPEED * Math.max(0.35, factor);
  };

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
    // Keep every candidate available to the declutter pass. The pass decides
    // how many names can fit at this zoom rather than hiding useful labels
    // just because the timeline currently contains many sites.
    const labels = shownSites.filter(shouldShowSiteLabel);

    const regions = regionAnchors.filter(
      anchor => anchor.start <= selectedYear
    );

    return [
      ...regions,
      ...labels.map(site => ({ ...site, type: 'site' }))
    ];
  };

  const shouldShowSiteLabel = site =>
    site.id === selectedSiteId ||
    site.importance >= (currentAltitude <= 1.18 ? 4 : 5);

  const setSiteLabelVisibility = visibleIds => {
    globeHost.querySelectorAll('[data-site-id]').forEach(marker => {
      marker.classList.toggle(
        'has-label',
        visibleIds.has(marker.dataset.siteId)
      );
    });
  };

  const altitudeToLabelScale = altitude => {
    // Keeps a label's on-screen size roughly constant as you zoom,
    // instead of it ballooning the closer the camera gets.
    const raw = (altitude + 1) / (BASE_ALTITUDE + 1);
    return Math.min(1.35, Math.max(0.38, raw));
  };

  const updatePinScale = altitude => {
    const scale = Math.min(1.1, Math.max(0.55, (altitude + 0.35) / (BASE_ALTITUDE + 0.35)));
    globeHost.style.setProperty('--pin-scale', scale.toFixed(3));
  };

  // Is this geo point on the hemisphere currently facing the camera?
  // (a screen projection alone doesn't know a point is hidden behind the globe)
  const isFacingCamera = (lat, lng, altitude) => {
    const camera = Globe.camera();
    const p = Globe.getCoords(lat, lng, altitude);
    const pLen = Math.hypot(p.x, p.y, p.z);
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    const cLen = Math.hypot(cx, cy, cz);
    if (!pLen || !cLen) return true;
    const dot = (p.x * cx + p.y * cy + p.z * cz) / (pLen * cLen);
    const horizonCos = GLOBE_RADIUS / cLen - 0.03; // small buffer for near-limb labels
    return dot > horizonCos;
  };

  // Screen-space label declutter: project every candidate label, then keep
  // the highest-priority ones and drop any that would visually collide.
  // Region labels matter most when zoomed out and give way to specific
  // site names as you zoom in close.
  function applyLabelDeclutter() {
    const candidates = visibleLabels();
    const width = globeHost.clientWidth;
    const height = globeHost.clientHeight;

    if (!candidates.length || !width || !height) {
      Globe.labelsData(candidates.filter(item => item.type === 'region'));
      setSiteLabelVisibility(new Set());
      return;
    }

    const approxCharWidth = 7.4; // empirical, px/char at labelSize 1, labelResolution 2
    const regionPriority = 260 + Math.max(0, currentAltitude - 0.5) * 500;

    const scored = candidates
      .filter(item => item.type === 'region' || shouldShowSiteLabel(item))
      .map(item => {
        const altitude = item.type === 'region'
          ? 0.01
          : item.id === selectedSiteId
            ? 0.05
            : 0.03;

        if (!isFacingCamera(item.lat, item.lng, altitude)) return null;

        const screen = Globe.getScreenCoords(item.lat, item.lng, altitude);
        if (!screen) return null;

        const priority = item.id === selectedSiteId
          ? 1000
          : item.type === 'region'
            ? regionPriority
            : (item.importance || 1) * 110;

        const sizeMult = item.type === 'region'
          ? 1.15
          : item.id === selectedSiteId
            ? 1.15
            : 0.9;
        const fontScale = altitudeToLabelScale(currentAltitude) * sizeMult;

        const boxW = Math.max(26, (item.name || '').length * approxCharWidth * fontScale);
        const boxH = 17 * fontScale;

        return { item, screen, priority, boxW, boxH };
      })
      .filter(entry =>
        entry &&
        entry.screen.x > -entry.boxW && entry.screen.x < width + entry.boxW &&
        entry.screen.y > -entry.boxH && entry.screen.y < height + entry.boxH
      )
      .sort((a, b) => b.priority - a.priority);

    const margin = 4;
    const overlaps = (a, b) =>
      Math.abs(a.screen.x - b.screen.x) < (a.boxW + b.boxW) / 2 + margin &&
      Math.abs(a.screen.y - b.screen.y) < (a.boxH + b.boxH) / 2 + margin;

    const placed = [];
    scored.forEach(entry => {
      if (!placed.some(other => overlaps(entry, other))) placed.push(entry);
    });

    Globe.labelsData(
      placed
        .filter(entry => entry.item.type === 'region')
        .map(entry => entry.item)
    );
    setSiteLabelVisibility(
      new Set(
        placed
          .filter(entry => entry.item.type === 'site')
          .map(entry => entry.item.id)
      )
    );
  }

  function scheduleLabelDeclutter(delay = 140) {
    clearTimeout(labelDeclutterTimer);
    labelDeclutterTimer = setTimeout(applyLabelDeclutter, delay);
  }

  const Globe = window.Globe()(globeHost)
    .backgroundColor('rgba(0,0,0,0)')
    .globeImageUrl(
      // NASA's 5400 × 2700 Blue Marble base map gives the texture more room
      // before it softens, while the vector country layer handles the detail.
      'https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-base/january/world.200401.3x5400x2700.jpg'
    )
    .showAtmosphere(true)
    .showGraticules(false)
    .atmosphereColor('#5a8cff')
    .atmosphereAltitude(0.11)
    .onGlobeReady(() => {
      const renderer = Globe.renderer();
      if (renderer) {
        // The real cause of the blur: without this, the canvas can render
        // at a lower resolution than the screen's actual pixel density,
        // softening everything — text, pins, and the globe texture alike.
        // A 1.5x cap keeps text and pins crisp without creating a huge
        // WebGL framebuffer on Retina/4K displays.
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      }

      const material = Globe.globeMaterial ? Globe.globeMaterial() : null;
      if (material && material.map && renderer) {
        material.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
        material.map.needsUpdate = true;
      }
    })

    .polygonsData([])
    // Opaque vector land masks the softest part of the bitmap and keeps
    // borders/coastlines sharp at every zoom level.
    .polygonCapColor(() => 'rgba(24,41,42,.96)')
    .polygonSideColor(() => 'rgba(8,16,21,.98)')
    .polygonStrokeColor(() => 'rgba(221,198,139,.42)')
    .polygonAltitude(0.006)
    .polygonsTransitionDuration(0)

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
       marker.dataset.siteId = site.id;
       marker.innerHTML = `
         <span class="city-pin__shape" aria-hidden="true"></span>
         <span class="city-pin__label"></span>
       `;
       marker.querySelector('.city-pin__label').textContent = site.name;

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
    .labelSize(item => {
      const base = item.type === 'region'
        ? 1.15
        : item.id === selectedSiteId
          ? 1.15
          : 0.9;
      return base * altitudeToLabelScale(currentAltitude);
    })
    .labelAltitude(item =>
      item.type === 'region'
        ? 0.01
        : item.id === selectedSiteId
          ? 0.05
          : 0.03
    )
    .labelColor(item =>
      item.type === 'region'
        ? 'rgba(232,213,158,.78)'
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
    // Site locations use the sharper HTML nameplates above; keep the canvas
    // text layer for region labels only.
    .labelIncludeDot(() => false);

  Globe.controls().autoRotate = false;
  Globe.controls().enablePan = false;
  // 118 instead of 100 (the bare surface): stops zoom right around where
  // even the 4K texture starts turning to mush, instead of letting people
  // zoom in past what any static image texture can resolve.
  Globe.controls().minDistance = 118;
  Globe.controls().maxDistance = 330;
  Globe.controls().rotateSpeed = rotateSpeedForViewport();
  Globe.controls().zoomSpeed = BASE_ZOOM_SPEED;

  // globe.gl resets maxDistance asynchronously on init, and recalculates
  // zoomSpeed/rotateSpeed on every camera "change" event. Re-assert our
  // values, and keep label size / declutter / pin size in sync with zoom.
  setTimeout(() => {
    Globe.controls().maxDistance = 330;
  }, 0);

  Globe.controls().addEventListener('change', () => {
    Globe.controls().rotateSpeed = rotateSpeedForViewport();
    Globe.controls().zoomSpeed = BASE_ZOOM_SPEED;

    currentAltitude = Globe.pointOfView().altitude;
    updatePinScale(currentAltitude);
    scheduleLabelDeclutter();
  });

  Globe.controls().addEventListener('end', applyLabelDeclutter);

  updatePinScale(currentAltitude);

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
    applyLabelDeclutter();
  }

  function selectSite(site, fly = false, storyTitle = null) {
    if (!site) return;

    selectedSiteId = site.id;

    if (fly) {
      Globe.controls().autoRotate = false;
      currentAltitude = 0.9;
      updatePinScale(currentAltitude);
      Globe.pointOfView(
        {
          lat: site.lat,
          lng: site.lng,
          altitude: 0.9
        },
        1200
      );
      setTimeout(applyLabelDeclutter, 1250); // recompute once the fly-to settles
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
    Globe.controls().rotateSpeed = rotateSpeedForViewport();
    const renderer = Globe.renderer();
    if (renderer) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    }
    applyLabelDeclutter();
  }

  window.addEventListener('resize', resize);

  loadCountries();
  resize();
  refresh();
})();