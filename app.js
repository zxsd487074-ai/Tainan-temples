const map = L.map('map').setView([22.9945, 120.2040], 14);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

const panel = document.getElementById('panel');
const initialHTML = panel.innerHTML;
const markers = {};
let current = 'ALL';
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const icon = L.divIcon({className:'', html:'<div style="font-size:26px;filter:drop-shadow(0 1px 2px #0008)">⛩️</div>', iconSize:[28,28], iconAnchor:[14,24]});

TEMPLES.forEach(t => {
  const m = L.marker([t.lat, t.lng], {icon, title: t.name}).addTo(map).bindTooltip(t.name);
  m.on('click', () => show(t));
  markers[t.id] = m;
});

function buildList() {
  const ul = document.getElementById('list');
  let html = '';
  Object.entries(REGIONS).forEach(([k, label]) => {
    if (current !== 'ALL' && current !== k) return;
    const items = TEMPLES.filter(t => t.region === k);
    if (!items.length) return;
    html += `<h3>${esc(label)}</h3>` + items.map(t => `<li><button data-id="${t.id}">${esc(t.name)}<small>${esc(t.tag)}</small></button></li>`).join('');
  });
  ul.innerHTML = html;
  ul.onclick = e => { const b = e.target.closest('button'); if (b) show(TEMPLES.find(t => t.id === b.dataset.id)); };
}
buildList();

function setRegion(k) {
  current = k;
  document.querySelectorAll('#chips button').forEach(b => b.classList.toggle('on', b.dataset.r === k));
  const items = TEMPLES.filter(t => k === 'ALL' || t.region === k);
  TEMPLES.forEach(t => { const on = items.includes(t); markers[t.id][on ? 'addTo' : 'remove'](map); });
  map.flyToBounds(L.latLngBounds(items.map(t => [t.lat, t.lng])).pad(.2), {duration:.8, maxZoom:15});
  panel.innerHTML = initialHTML; buildList();
}
document.getElementById('chips').innerHTML = '<button data-r="ALL" class="on">全部</button>' +
  Object.entries(REGIONS).map(([k, v]) => `<button data-r="${k}">${esc(v)}</button>`).join('');
document.getElementById('chips').onclick = e => { const b = e.target.closest('button'); if (b) setRegion(b.dataset.r); };

// 全台南市 OSM 寺廟（Overpass API，即時查詢）
let osmLayer = null;
document.getElementById('osmToggle').onchange = async e => {
  const st = document.getElementById('osmStatus');
  if (!e.target.checked) { if (osmLayer) map.removeLayer(osmLayer); st.textContent = '已隱藏'; return; }
  if (osmLayer) { osmLayer.addTo(map); st.textContent = '已顯示'; return; }
  st.textContent = '載入中…';
  const q = '[out:json][timeout:60];area["name"="臺南市"]["boundary"="administrative"]["admin_level"="4"]->.a;nwr(area.a)["amenity"="place_of_worship"]["religion"~"taoist|buddhist|folk"]["name"];out center tags 4000;';
  try {
    const r = await fetch('https://overpass-api.de/api/interpreter', {method:'POST', body:'data=' + encodeURIComponent(q)});
    const d = await r.json();
    osmLayer = L.markerClusterGroup({chunkedLoading:true});
    d.elements.forEach(el => {
      const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;
      if (lat == null) return;
      const n = el.tags.name, link = `https://www.openstreetmap.org/${el.type}/${el.id}`;
      L.circleMarker([lat, lng], {radius:6, color:'#a8321f', fillOpacity:.7})
        .bindPopup(`<b>${esc(n)}</b><br>${esc(el.tags['name:en'] || '')}<br><a href="${link}" target="_blank" rel="noopener">OSM 詳情</a>`)
        .addTo(osmLayer);
    });
    osmLayer.addTo(map);
    st.textContent = `已顯示 ${osmLayer.getLayers().length} 間`;
  } catch (err) { st.textContent = '載入失敗，請稍後再試'; e.target.checked = false; }
};

function show(t) {
  map.flyTo([t.lat, t.lng], 17, {duration: .8});
  const osm = 'https://www.openstreetmap.org/search?query=' + encodeURIComponent(t.q);
  panel.innerHTML = `
    <button class="back">← 返回清單</button>
    <h2>${esc(t.name)}</h2>
    <span class="tag">${esc(t.tag)}</span>
    <p>${esc(t.desc)}</p>
    <dl><dt>主祀</dt><dd>${esc(t.deity)}</dd><dt>地址</dt><dd>${esc(t.addr)}</dd></dl>
    <div class="links"><a href="${osm}" target="_blank" rel="noopener">在 OSM 搜尋</a>
    <a href="https://zh.wikipedia.org/w/index.php?search=${encodeURIComponent(t.q)}" target="_blank" rel="noopener">維基百科</a></div>
    <div class="gallery" id="gallery"><p>照片載入中…</p></div>`;
  panel.querySelector('.back').onclick = () => { panel.innerHTML = initialHTML; buildList(); map.flyTo([22.9945,120.2040],14); };
  panel.scrollTop = 0;
  loadPhotos(t);
}

async function loadPhotos(t) {
  const g = document.getElementById('gallery');
  const key = 'photos:' + t.id;
  let photos;
  try { photos = JSON.parse(sessionStorage.getItem(key)); } catch (e) {}
  if (!photos) {
    try {
      const url = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
        action:'query', format:'json', origin:'*', generator:'search', gsrsearch: t.q, gsrnamespace:'6', gsrlimit:'20',
        prop:'imageinfo', iiprop:'url|extmetadata', iiurlwidth:'640', iiextmetadatafilter:'Artist|LicenseShortName'
      });
      const data = await (await fetch(url)).json();
      photos = Object.values(data.query?.pages || {})
        .filter(p => /\.jpe?g$/i.test(p.title) && p.imageinfo)
        .sort((a, b) => a.index - b.index).slice(0, 4)
        .map(p => { const i = p.imageinfo[0], m = i.extmetadata || {};
          return {thumb: i.thumburl, page: i.descriptionurl,
                  by: (m.Artist?.value || '').replace(/<[^>]*>/g, '').slice(0, 40), lic: m.LicenseShortName?.value || ''}; });
      try { sessionStorage.setItem(key, JSON.stringify(photos)); } catch (e) {}
    } catch (e) { photos = null; }
  }
  if (!g.isConnected) return;
  if (!photos || !photos.length) { g.innerHTML = '<p>暫時無法載入照片，可點上方連結查看。</p>'; return; }
  g.innerHTML = photos.map(p => `<figure><img loading="lazy" src="${esc(p.thumb)}" alt="${esc(t.name)}" data-full="${esc(p.thumb)}">
    <figcaption><a href="${esc(p.page)}" target="_blank" rel="noopener">${esc(p.by || '來源')}</a> ${esc(p.lic)}</figcaption></figure>`).join('');
}

const lb = document.getElementById('lightbox');
panel.addEventListener('click', e => { if (e.target.matches('.gallery img')) { lb.querySelector('img').src = e.target.dataset.full; lb.hidden = false; } });
lb.onclick = () => lb.hidden = true;
document.addEventListener('keydown', e => { if (e.key === 'Escape') lb.hidden = true; });
