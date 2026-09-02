(() => {
  'use strict';

  const sites = window.MOSAIC_SITES || [];
  const connections = window.MOSAIC_CONNECTIONS || [];
  const story = window.MOSAIC_STORY || [];
  const byId = Object.fromEntries(sites.map(site => [site.id, site]));

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

  const Globe = window.Globe()(globeHost)
    .backgroundColor('rgba(0,0,0,0)')
    // Natural-looking Earth rather than the dark/night texture.
    .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
    .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
    .showAtmosphere(true)
    .atmosphereColor('#8fc5ff')
    .atmosphereAltitude(0.14)
    .pointLat('lat')
    .pointLng('lng')
    .pointAltitude(site => 0.012 + site.importance * 0.0025)
    .pointRadius(site => 0.12 + site.importance * 0.025)
    .pointColor(site => site.id === 'uruk' ? '#e5ba53' : '#f1d27a')
    .pointLabel(site => `<div style="padding:7px 9px;background:rgba(4,5,8,.92);border:1px solid rgba(255,255,255,.14);border-radius:8px;font-family:Nunito,sans-serif"><strong>${site.name}</strong><br><span style="opacity:.65">${formatYear(site.start)} · ${site.culture}</span></div>`)
    .onPointClick(site => selectSite(site, true))
    .arcStartLat(link => link.source.lat)
    .arcStartLng(link => link.source.lng)
    .arcEndLat(link => link.target.lat)
    .arcEndLng(link => link.target.lng)
    .arcColor(() => ['rgba(76,119,255,.08)', 'rgba(113,165,255,.72)'])
    .arcAltitudeAutoScale(0.22)
    .arcStroke(0.45)
    .arcDashLength(0.28)
    .arcDashGap(0.7)
    .arcDashAnimateTime(3200)
    .arcLabel(link => link.label);

  const controls = Globe.controls();
  controls.autoRotate = false;
  controls.enablePan = false;
  controls.enableZoom = true;
  controls.zoomSpeed = 0.9;
  // Let the visitor zoom in very close, but also pull back to see the whole globe.
  controls.minDistance = 108;
  controls.maxDistance = 720;

  const FOCUS_ALTITUDE = 0.72;
  const DEFAULT_ALTITUDE = 0.96;

  // Open directly over Uruk instead of showing the whole planet.
  const uruk = byId.uruk;
  Globe.pointOfView(
    uruk
      ? { lat: uruk.lat, lng: uruk.lng, altitude: DEFAULT_ALTITUDE }
      : { lat: 31.3, lng: 45.6, altitude: DEFAULT_ALTITUDE },
    0
  );

  function refresh() {
    selectedYear = Number(slider.value);
    yearLabel.textContent = formatYear(selectedYear);
    const [title, description] = periodFor(selectedYear);
    periodTitle.textContent = title;
    periodDescription.textContent = description;
    Globe.pointsData(visibleSites());
    Globe.arcsData(visibleConnections());
  }

  function selectSite(site, fly = false, storyTitle = null) {
    if (!site) return;
    if (fly) {
      controls.autoRotate = false;
      Globe.pointOfView(
        { lat: site.lat, lng: site.lng, altitude: FOCUS_ALTITUDE },
        1200
      );
    }
    infoCard.classList.remove('is-hidden');
    cardEra.textContent = storyTitle || `${formatYear(site.start)} · ${site.culture}`;
    cardTitle.textContent = site.name;
    cardText.textContent = site.text;
    cardMeta.innerHTML = `<span><b>Region:</b> ${site.region}</span><span><b>Technique:</b> ${site.technique}</span><span><b>Visible by:</b> ${formatYear(site.start)}</span>`;
    regionLink.hidden = false;
    regionLink.textContent = `Explore ${site.region} →`;
    regionLink.href = `region.html?region=${encodeURIComponent(site.regionSlug)}&from=${encodeURIComponent(site.id)}`;
  }

  slider.addEventListener('input', () => { stopStory(); refresh(); });
  toggle.addEventListener('change', refresh);
  document.querySelectorAll('[data-year]').forEach(button => {
    button.addEventListener('click', () => {
      stopStory();
      slider.value = button.dataset.year;
      refresh();
    });
  });

  closeCard.addEventListener('click', () => infoCard.classList.add('is-hidden'));

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  async function playStory() {
    stopStory(false);
    storyPlaying = true;
    const run = ++storyRun;
    storyButton.classList.add('is-playing');
    storyButton.textContent = 'Ⅱ Pause story';
    controls.autoRotate = false;

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
