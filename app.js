const map = L.map('map').setView([22.9945, 120.2040], 14);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

const panel = document.getElementById('panel');
const initialHTML = panel.innerHTML;
const markers = {};
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const icon = L.divIcon({className:'', html:'<div style="font-size:26px;filter:drop-shadow(0 1px 2px #0008)">⛩️</div>', iconSize:[28,28], iconAnchor:[14,24]});

TEMPLES.forEach(t => {
  const m = L.marker([t.lat, t.lng], {icon, title: t.name}).addTo(map).bindTooltip(t.name);
  m.on('click', () => show(t));
  markers[t.id] = m;
});

function buildList() {
  const ul = document.getElementById('list');
  ul.innerHTML = TEMPLES.map(t => `<li><button data-id="${t.id}">${esc(t.name)}<small>${esc(t.tag)}</small></button></li>`).join('');
  ul.onclick = e => { const b = e.target.closest('button'); if (b) show(TEMPLES.find(t => t.id === b.dataset.id)); };
}
buildList();

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
