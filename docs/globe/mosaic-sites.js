window.MOSAIC_SITES = [
  { id:'uruk', name:'Uruk', region:'Iraq', regionSlug:'iraq', lat:31.324, lng:45.636, start:-3500, end:-3000, culture:'Mesopotamian', technique:'Clay cone mosaic', importance:5, text:'Among the earliest known mosaic-like architectural decorations: coloured clay cones pressed into plaster to form geometric patterns.' },
  { id:'gordion', name:'Gordion', region:'Anatolia', regionSlug:'turkey', lat:39.654, lng:31.994, start:-800, end:-700, culture:'Phrygian / Anatolian', technique:'Pebble mosaic', importance:4, text:'Early pebble pavements mark an important step toward figured floor mosaic traditions.' },
  { id:'olynthus', name:'Olynthus', region:'Greece', regionSlug:'greece', lat:40.294, lng:23.342, start:-430, end:-348, culture:'Classical Greek', technique:'Pebble mosaic', importance:4, text:'Classical pebble mosaics used contrasting stones to create increasingly complex figurative floors.' },
  { id:'pella', name:'Pella', region:'Greece', regionSlug:'greece', lat:40.761, lng:22.519, start:-400, end:-300, culture:'Macedonian / Greek', technique:'Pebble mosaic', importance:5, text:'Pella is famous for elaborate late Classical pebble mosaics with figural scenes and shading effects.' },
  { id:'delos', name:'Delos', region:'Greece', regionSlug:'greece', lat:37.400, lng:25.267, start:-200, end:-80, culture:'Hellenistic', technique:'Tessellated floors', importance:4, text:'Hellenistic houses on Delos preserve a wide range of mosaic floors, from geometric pavements to emblemata.' },
  { id:'alexandria', name:'Alexandria', region:'Egypt', regionSlug:'egypt', lat:31.200, lng:29.918, start:-250, end:200, culture:'Hellenistic / Roman', technique:'Tesserae', importance:4, text:'A major Hellenistic Mediterranean centre where luxury floor mosaics developed alongside other cosmopolitan arts.' },
  { id:'pompeii', name:'Pompeii', region:'Italy', regionSlug:'italy', lat:40.750, lng:14.486, start:-150, end:79, culture:'Roman', technique:'Opus tessellatum / vermiculatum', importance:5, text:'Roman domestic mosaics survive in exceptional quantity, including intricate mythological and illusionistic compositions.' },
  { id:'rome', name:'Rome', region:'Italy', regionSlug:'italy', lat:41.9028, lng:12.4964, start:-100, end:500, culture:'Roman / Early Christian', technique:'Stone and glass tesserae', importance:5, text:'Mosaic moved across villas, baths, public architecture and later Christian interiors throughout the Roman capital.' },
  { id:'carthage', name:'Carthage', region:'North Africa', regionSlug:'tunisia', lat:36.8528, lng:10.3233, start:50, end:500, culture:'Roman North Africa', technique:'Figurative floor mosaic', importance:4, text:'North Africa became one of the richest regions of Roman mosaic production, especially for large narrative floors.' },
  { id:'paphos', name:'Paphos', region:'Cyprus', regionSlug:'cyprus', lat:34.775, lng:32.424, start:150, end:400, culture:'Roman', technique:'Mythological floor mosaic', importance:4, text:'Roman villas preserve celebrated mythological mosaics with complex narrative programmes.' },
  { id:'antioch', name:'Antioch', region:'Eastern Mediterranean', regionSlug:'turkey', lat:36.2021, lng:36.1600, start:150, end:500, culture:'Roman / Late Antique', technique:'Figurative mosaic', importance:5, text:'Antioch was a major centre of Roman and Late Antique mosaic production whose works circulated widely through collections.' },
  { id:'ravenna', name:'Ravenna', region:'Italy', regionSlug:'italy', lat:44.4184, lng:12.2035, start:400, end:600, culture:'Late Roman / Ostrogothic / Byzantine', technique:'Glass and gold tesserae', importance:5, text:'Ravenna preserves one of the world’s most concentrated ensembles of Late Antique and Byzantine wall mosaics.' },
  { id:'thessaloniki', name:'Thessaloniki', region:'Greece', regionSlug:'greece', lat:40.6401, lng:22.9444, start:400, end:700, culture:'Early Christian / Byzantine', technique:'Glass mosaic', importance:4, text:'Early Christian monuments preserve important wall mosaics connecting the eastern Mediterranean and Byzantine visual world.' },
  { id:'madaba', name:'Madaba', region:'Jordan', regionSlug:'jordan', lat:31.719, lng:35.794, start:500, end:650, culture:'Byzantine', technique:'Floor mosaic', importance:5, text:'Madaba preserves major Byzantine church mosaics, including the famous mosaic map of the Holy Land.' },
  { id:'constantinople', name:'Constantinople', region:'Byzantine world', regionSlug:'turkey', lat:41.0082, lng:28.9784, start:400, end:1200, culture:'Byzantine', technique:'Glass and gold mosaic', importance:5, text:'The imperial capital became a key centre for monumental Byzantine mosaic art and workshop traditions.' },
  { id:'jericho', name:'Jericho — Hisham’s Palace', region:'Levant', regionSlug:'palestine', lat:31.883, lng:35.459, start:720, end:750, culture:'Umayyad', technique:'Floor mosaic', importance:4, text:'The palace preserves exceptional early Islamic floor mosaics, showing continuity and transformation of Late Antique craft traditions.' },
  { id:'damascus', name:'Damascus', region:'Syria', regionSlug:'syria', lat:33.511, lng:36.306, start:705, end:715, culture:'Umayyad', technique:'Glass mosaic', importance:4, text:'The Great Mosque’s monumental mosaics demonstrate the adaptation of mosaic into an early Islamic architectural programme.' },
  { id:'palermo', name:'Palermo', region:'Italy', regionSlug:'italy', lat:38.1157, lng:13.3615, start:1130, end:1190, culture:'Norman Sicily / Byzantine', technique:'Gold-ground wall mosaic', importance:5, text:'Norman Sicily brought Byzantine mosaic workshops into a new Mediterranean court culture.' },
  { id:'monreale', name:'Monreale', region:'Italy', regionSlug:'italy', lat:38.081, lng:13.289, start:1170, end:1190, culture:'Norman Sicily / Byzantine', technique:'Gold-ground wall mosaic', importance:5, text:'The cathedral preserves an enormous cycle of glittering medieval mosaics created in a Byzantine-derived tradition.' },
  { id:'venice', name:'Venice', region:'Italy', regionSlug:'italy', lat:45.434, lng:12.339, start:1060, end:1300, culture:'Venetian / Byzantine', technique:'Gold-ground wall mosaic', importance:5, text:'San Marco became a major western centre of mosaic, shaped by long artistic and commercial connections with Byzantium.' }
];

window.MOSAIC_CONNECTIONS = [
  { from:'uruk', to:'gordion', start:-900, label:'early architectural and pebble traditions' },
  { from:'gordion', to:'olynthus', start:-500, label:'pebble mosaic development' },
  { from:'olynthus', to:'pella', start:-400, label:'Classical Greek refinement' },
  { from:'pella', to:'delos', start:-250, label:'Hellenistic diffusion' },
  { from:'pella', to:'alexandria', start:-250, label:'Hellenistic Mediterranean networks' },
  { from:'delos', to:'pompeii', start:-150, label:'Hellenistic techniques in Roman Italy' },
  { from:'alexandria', to:'rome', start:-100, label:'Mediterranean workshop exchange' },
  { from:'rome', to:'carthage', start:100, label:'Roman imperial networks' },
  { from:'rome', to:'paphos', start:150, label:'Roman imperial networks' },
  { from:'rome', to:'antioch', start:150, label:'Roman imperial networks' },
  { from:'rome', to:'ravenna', start:400, label:'Late Roman continuity' },
  { from:'constantinople', to:'ravenna', start:540, label:'Eastern Roman / Byzantine connections' },
  { from:'constantinople', to:'thessaloniki', start:450, label:'Byzantine artistic network' },
  { from:'antioch', to:'madaba', start:500, label:'Late Antique eastern Mediterranean traditions' },
  { from:'constantinople', to:'madaba', start:550, label:'Byzantine visual culture' },
  { from:'constantinople', to:'damascus', start:705, label:'Late Antique craft adapted in Umayyad art' },
  { from:'madaba', to:'jericho', start:720, label:'regional continuity of mosaic workshops' },
  { from:'constantinople', to:'venice', start:1050, label:'Byzantine–Venetian exchange' },
  { from:'constantinople', to:'palermo', start:1130, label:'Byzantine craftsmen in Norman Sicily' },
  { from:'palermo', to:'monreale', start:1170, label:'Norman Sicilian mosaic programme' }
];

window.MOSAIC_STORY = [
  { year:-3500, site:'uruk', title:'A surface made from pieces', duration:4700 },
  { year:-750, site:'gordion', title:'Pebbles enter the story', duration:4300 },
  { year:-375, site:'pella', title:'Greek mosaics become pictorial', duration:4500 },
  { year:-125, site:'pompeii', title:'The technique spreads through the Roman world', duration:4700 },
  { year:500, site:'ravenna', title:'Walls begin to shimmer with glass and gold', duration:5200 },
  { year:560, site:'constantinople', title:'Byzantine networks reshape monumental mosaic', duration:4800 },
  { year:1150, site:'palermo', title:'The tradition crosses cultures again', duration:4800 }
];
