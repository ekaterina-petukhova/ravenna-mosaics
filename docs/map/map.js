const sites = [
  {
    id: 1,
    name: "Mausoleum of Galla Placidia",
    coords: [44.42099, 12.19714],
    period: "5th century",
    era: "lateRoman",
    tag: "Late Roman",

    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/7/70/Mausoleo_di_Galla_Placidia_interno.jpg/1280px-Mausoleo_di_Galla_Placidia_interno.jpg",

    description:
      "A richly decorated Late Antique monument whose starry vaults and symbolic imagery create one of Ravenna's most immersive mosaic interiors.",

    routes: ["power", "christ", "unesco"],
  },

  {
    id: 2,
    name: "Neonian Baptistery",
    coords: [44.41588, 12.19705],
    period: "5th century",
    era: "lateRoman",
    tag: "Baptistery",

    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/Battistero_Neoniano_Ravenna.jpg/1280px-Battistero_Neoniano_Ravenna.jpg",

    description:
      "Its dome centres on the Baptism of Christ and surrounds the scene with a rhythmic procession of the twelve apostles.",

    routes: ["christ", "unesco"],
  },

  {
    id: 3,
    name: "Archiepiscopal Chapel",
    coords: [44.41518, 12.19735],
    period: "Late 5th–early 6th century",
    era: "lateRoman",
    tag: "Episcopal",

    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/Cappella_Arcivescovile_Ravenna.jpg/1280px-Cappella_Arcivescovile_Ravenna.jpg",

    description:
      "A private episcopal oratory whose mosaics communicate Christian identity through an intimate and highly symbolic visual programme.",

    routes: ["christ", "unesco"],
  },

  {
    id: 4,
    name: "Basilica of Sant'Apollinare Nuovo",
    coords: [44.41679, 12.20458],
    period: "Early 6th century",
    era: "ostrogothic",
    tag: "Ostrogothic",

    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Sant%27Apollinare_Nuovo_Ravenna_interior.jpg/1280px-Sant%27Apollinare_Nuovo_Ravenna_interior.jpg",

    description:
      "Originally connected with Theodoric's royal complex, the basilica preserves long mosaic processions and traces of changing political authority.",

    routes: ["power", "christ", "unesco"],
  },

  {
    id: 5,
    name: "Arian Baptistery",
    coords: [44.41869, 12.20269],
    period: "Early 6th century",
    era: "ostrogothic",
    tag: "Arian",

    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Battistero_degli_Ariani_-_mosaico.jpg/1280px-Battistero_degli_Ariani_-_mosaico.jpg",

    description:
      "Built under Theodoric, the baptistery offers a striking comparison with the Neonian Baptistery through its representation of Christ's baptism.",

    routes: ["power", "christ", "unesco"],
  },

  {
    id: 6,
    name: "Mausoleum of Theodoric",
    coords: [44.42504, 12.20916],
    period: "Early 6th century",
    era: "ostrogothic",
    tag: "Royal",

    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/Mausoleo_di_Teodorico_Ravenna.jpg/1280px-Mausoleo_di_Teodorico_Ravenna.jpg",

    description:
      "The monumental tomb of Theodoric anchors the Ostrogothic phase of Ravenna and provides architectural context for the city's mosaic heritage.",

    routes: ["power", "unesco"],
  },

  {
    id: 7,
    name: "Basilica of San Vitale",
    coords: [44.42058, 12.19643],
    period: "6th century",
    era: "byzantine",
    tag: "Byzantine",

    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/0/03/Ravenna_San_Vitale_mosaics.jpg/1280px-Ravenna_San_Vitale_mosaics.jpg",

    description:
      "One of the defining monuments of Ravenna, famous for the imperial panels of Justinian and Theodora and its sophisticated Byzantine visual language.",

    routes: ["power", "christ", "unesco"],
  },

  {
    id: 8,
    name: "Basilica of Sant'Apollinare in Classe",
    coords: [44.38032, 12.23406],
    period: "6th century",
    era: "byzantine",
    tag: "Byzantine",

    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/Sant%27Apollinare_in_Classe_-_apse.jpg/1280px-Sant%27Apollinare_in_Classe_-_apse.jpg",

    description:
      "Its luminous apse transforms landscape, cross, saints and symbolic imagery into a monumental vision of sacred space.",

    routes: ["christ", "unesco"],
  },
];


/* =========================================================
   HISTORICAL PERIODS
========================================================= */

const eraInfo = {
  lateRoman: {
    title: "Late Roman Ravenna",

    label: "5th century · Late Roman",

    description:
      "Ravenna emerged as an imperial capital in the early fifth century. Christian monuments increasingly reshaped the city's sacred and political landscape.",
  },

  ostrogothic: {
    title: "Theodoric's Ravenna",

    label: "493–540 · Ostrogothic",

    description:
      "Under Theodoric, Ravenna became the centre of the Ostrogothic kingdom, where Arian and Nicene Christian communities occupied the same urban landscape.",
  },

  byzantine: {
    title: "Byzantine Ravenna",

    label: "6th century · Byzantine",

    description:
      "After the Byzantine reconquest, Ravenna developed a visual language that linked Christian ritual, imperial power and Eastern Mediterranean artistic traditions.",
  },

  all: {
    title: "Ravenna across centuries",

    label: "5th–6th centuries",

    description:
      "Trace the transformation of Ravenna from Late Roman imperial capital to Ostrogothic kingdom and Byzantine centre.",
  },
};


/* =========================================================
   CREATE LEAFLET MAP
========================================================= */

const map = L.map("map", {
  zoomControl: false,
  scrollWheelZoom: true,
}).setView(
  [44.4184, 12.2035],
  14
);


/* Move zoom controls to top right */

L.control
  .zoom({
    position: "topright",
  })
  .addTo(map);


/* OpenStreetMap background */

L.tileLayer(
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  {
    maxZoom: 19,

    attribution:
      "&copy; OpenStreetMap contributors",
  }
).addTo(map);


/* =========================================================
   MAP STATE
========================================================= */

const markers = {};

let currentEra = "all";
let currentRoute = "all";

let routeLayer = null;


/* =========================================================
   CREATE CUSTOM MARKERS
========================================================= */

function createMarker(site) {
  const icon = L.divIcon({
    className: "",

    html: `
      <div class="mosaic-marker">
        ${String(site.id).padStart(2, "0")}
      </div>
    `,

    iconSize: [36, 36],

    iconAnchor: [18, 18],

    popupAnchor: [0, -17],
  });


  const marker = L.marker(
    site.coords,
    {
      icon,
    }
  );


  marker.bindPopup(`
    <img
      class="popup-image"
      src="${site.image}"
      alt="${site.name}"
    />

    <div class="popup-info">

      <span class="popup-kicker">
        ${site.period}
      </span>

      <h3>
        ${site.name}
      </h3>

      <p>
        ${site.description}
      </p>

    </div>
  `);


  /* When marker is clicked,
     highlight corresponding card */

  marker.on("click", () => {
    activateCard(
      site.id,
      true
    );
  });


  return marker;
}


/* Create markers for all sites */

sites.forEach((site) => {
  markers[site.id] =
    createMarker(site);
});


/* =========================================================
   CREATE SIDEBAR CARDS
========================================================= */

const siteList =
  document.getElementById("site-list");


sites.forEach((site) => {
  const card =
    document.createElement("article");


  card.className =
    "site-card";


  card.dataset.id =
    site.id;


  card.dataset.era =
    site.era;


  card.innerHTML = `

    <div class="card-image-wrap">

      <img
        class="card-image"
        src="${site.image}"
        alt="${site.name}"
        loading="lazy"
      />

      <div class="card-number">
        ${String(site.id).padStart(2, "0")}
      </div>

    </div>


    <div class="card-content">

      <h3>
        ${site.name}
      </h3>

      <div class="period">
        ${site.period}
      </div>


      <p class="description">
        ${site.description}
      </p>


      <div class="card-footer">

        <span class="tag">
          ${site.tag}
        </span>

        <span class="explore">
          View on map →
        </span>

      </div>

    </div>
  `;


  /* Clicking card zooms to monument */

  card.addEventListener(
    "click",
    () => {
      activateCard(site.id);


      map.flyTo(
        site.coords,
        17,
        {
          duration: 1.1,
        }
      );


      /* Wait for map animation
         before opening popup */

      setTimeout(
        () => {
          markers[
            site.id
          ].openPopup();
        },
        500
      );
    }
  );


  siteList.appendChild(card);
});


/* =========================================================
   ACTIVE CARD
========================================================= */

function activateCard(
  id,
  scrollIntoView = false
) {
  document
    .querySelectorAll(
      ".site-card"
    )
    .forEach(
      (card) => {
        card.classList.toggle(
          "active",
          Number(
            card.dataset.id
          ) === id
        );
      }
    );


  /* If marker was clicked,
     automatically find the card */

  if (scrollIntoView) {
    const card =
      document.querySelector(
        `.site-card[data-id="${id}"]`
      );


    if (card) {
      card.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }
}


/* =========================================================
   MARKER VISIBILITY
========================================================= */

function clearMarkers() {
  Object
    .values(markers)
    .forEach(
      (marker) => {
        if (
          map.hasLayer(marker)
        ) {
          map.removeLayer(
            marker
          );
        }
      }
    );
}


/* =========================================================
   REMOVE ROUTE
========================================================= */

function clearRouteLayer() {
  if (
    routeLayer &&
    map.hasLayer(routeLayer)
  ) {
    map.removeLayer(
      routeLayer
    );
  }


  routeLayer = null;
}


/* =========================================================
   SHOW A SET OF MONUMENTS
========================================================= */

function setVisibleSites(
  visibleSites
) {
  clearMarkers();


  const visibleIds =
    new Set(
      visibleSites.map(
        (site) =>
          site.id
      )
    );


  sites.forEach(
    (site) => {

      const card =
        document.querySelector(
          `.site-card[data-id="${site.id}"]`
        );


      const isVisible =
        visibleIds.has(
          site.id
        );


      /* Hide / show card */

      card.classList.toggle(
        "hidden",
        !isVisible
      );


      /* Hide / show marker */

      if (isVisible) {
        markers[
          site.id
        ].addTo(map);
      }

    }
  );


  /* Automatically frame visible sites */

  if (
    visibleSites.length
  ) {
    const bounds =
      L.latLngBounds(
        visibleSites.map(
          (site) =>
            site.coords
        )
      );


    map.fitBounds(
      bounds,
      {
        padding: [
          70,
          70
        ],

        maxZoom: 15,
      }
    );
  }
}


/* =========================================================
   BUTTON HELPERS
========================================================= */

function resetRouteButtons() {
  document
    .querySelectorAll(
      ".route-btn"
    )
    .forEach(
      (button) => {
        button
          .classList
          .remove(
            "active"
          );
      }
    );
}


function resetTimelineButtons() {
  document
    .querySelectorAll(
      ".timeline-point"
    )
    .forEach(
      (button) => {
        button
          .classList
          .remove(
            "active"
          );
      }
    );
}


/* =========================================================
   HISTORICAL TIMELINE
========================================================= */

function showEra(era) {
  currentEra = era;

  currentRoute =
    "all";


  clearRouteLayer();

  resetRouteButtons();

  resetTimelineButtons();


  const activeButton =
    document.querySelector(
      `.timeline-point[data-era="${era}"]`
    );


  if (activeButton) {
    activeButton
      .classList
      .add("active");
  }


  const info =
    eraInfo[era];


  document
    .getElementById(
      "period-title"
    )
    .textContent =
      info.title;


  document
    .getElementById(
      "period-description"
    )
    .textContent =
      info.description;


  document
    .getElementById(
      "header-period"
    )
    .textContent =
      info.label;


  const visibleSites =
    era === "all"
      ? sites
      : sites.filter(
          (site) =>
            site.era ===
            era
        );


  setVisibleSites(
    visibleSites
  );
}


/* =========================================================
   NARRATIVE ROUTES
========================================================= */

function showRoute(route) {
  currentRoute =
    route;

  currentEra =
    "all";


  clearRouteLayer();

  resetRouteButtons();

  resetTimelineButtons();


  /* Keep "All" timeline
     visually active */

  const allTimelineButton =
    document.querySelector(
      '.timeline-point[data-era="all"]'
    );


  if (
    allTimelineButton
  ) {
    allTimelineButton
      .classList
      .add("active");
  }


  /* RESET */

  if (
    route === "all"
  ) {
    document
      .getElementById(
        "period-title"
      )
      .textContent =
        eraInfo.all.title;


    document
      .getElementById(
        "period-description"
      )
      .textContent =
        eraInfo.all.description;


    document
      .getElementById(
        "header-period"
      )
      .textContent =
        eraInfo.all.label;


    setVisibleSites(
      sites
    );


    return;
  }


  /* Highlight selected route */

  const activeButton =
    document.querySelector(
      `.route-btn[data-route="${route}"]`
    );


  if (
    activeButton
  ) {
    activeButton
      .classList
      .add("active");
  }


  /* Select monuments that
     belong to this route */

  const routeSites =
    sites.filter(
      (site) =>
        site.routes.includes(
          route
        )
    );


  setVisibleSites(
    routeSites
  );


  /* =====================================================
     DRAW ROUTE LINE
  ===================================================== */

  const coordinates =
    routeSites.map(
      (site) =>
        site.coords
    );


  if (
    coordinates.length > 1
  ) {
    routeLayer =
      L.polyline(
        coordinates,
        {
          weight: 3,

          opacity: 0.78,

          dashArray:
            "7 8",
        }
      ).addTo(map);
  }


  /* =====================================================
     ROUTE TEXT
  ===================================================== */

  const routeLabels = {
    power: {
      title:
        "Power & Empire",

      description:
        "Follow monuments connected with imperial, royal and ecclesiastical authority across Ravenna's changing political landscape.",
    },


    christ: {
      title:
        "Images of Christ",

      description:
        "Compare how Christ, baptism, sacred authority and Christian symbolism are represented across different monuments and communities.",
    },


    unesco: {
      title:
        "UNESCO Heritage",

      description:
        "Explore the eight Early Christian monuments that together define Ravenna's internationally recognised Late Antique heritage landscape.",
    },
  };


  const routeInfo =
    routeLabels[route];


  document
    .getElementById(
      "period-title"
    )
    .textContent =
      routeInfo.title;


  document
    .getElementById(
      "period-description"
    )
    .textContent =
      routeInfo.description;


  document
    .getElementById(
      "header-period"
    )
    .textContent =
      "Narrative route";
}


/* =========================================================
   TIMELINE EVENTS
========================================================= */

document
  .querySelectorAll(
    ".timeline-point"
  )
  .forEach(
    (button) => {

      button.addEventListener(
        "click",
        () => {
          showEra(
            button.dataset.era
          );
        }
      );

    }
  );


/* =========================================================
   ROUTE EVENTS
========================================================= */

document
  .querySelectorAll(
    ".route-btn"
  )
  .forEach(
    (button) => {

      button.addEventListener(
        "click",
        () => {
          showRoute(
            button.dataset.route
          );
        }
      );

    }
  );


/* =========================================================
   INITIAL STATE
========================================================= */

showEra("all");