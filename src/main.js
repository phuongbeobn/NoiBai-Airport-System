import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import { appConfig } from './config.js';

const ARP = { lng: 105.8072, lat: 21.2212 };
const STORAGE = { ils: 'vvnb_ils_devices_named', drawings: 'vvnb_drawn_features_undo' };
const defaultILS = [
  { id: 1, name: 'Đài Localizer RWY 11L', type: 'LLZ', runway: '11L/29R', cat: 'CAT II', lat: 21.2185, lng: 105.8235, freq: 110.3, status: 'Hoạt động' },
  { id: 2, name: 'Đài Glide Path RWY 11L', type: 'GP', runway: '11L/29R', cat: 'CAT II', lat: 21.223, lng: 105.795, freq: 334.7, status: 'Hoạt động' },
];
const readStorage = (key, fallback, validate) => {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    return validate(parsed) ? parsed : fallback;
  } catch { return fallback; }
};
let ilsDevices = readStorage(STORAGE.ils, defaultILS, value => Array.isArray(value));
let drawnFeatures = readStorage(STORAGE.drawings, [], value => Array.isArray(value));
let activeDrawMode = null;
let currentDrawCoords = [];
let editingId = null;
let markers = [];
let drawnPointMarkers = [];
let activeIlsPopup = null;
let dataFileHandle = null;
let fileSaveTimer = null;
let mapReady = false;

document.querySelector('#app').innerHTML = `
  <header class="topbar">
    <div class="brand-mark" aria-hidden="true">✈</div>
    <div class="brand-copy"><strong>NỘI BÀI <span>INTL AIRPORT</span></strong><small>Airfield planning workspace <i>•</i> VVNB / HAN</small></div>
    <div class="airport-meta"><span><b class="live-dot"></b> ARP <code>21.2212°N · 105.8072°E</code></span><span>ELEV <code>12 m AMSL</code></span></div>
  </header>
  <main class="workspace">
    <aside class="sidebar" id="tool-sidebar">
      <nav class="tabs" aria-label="Công cụ"><button class="tab active" data-tab="ils">◉ <span>Thiết bị ILS</span></button><button class="tab" data-tab="camera">⌖ <span>Góc nhìn 3D</span></button><button class="tab" data-tab="draw">✎ <span>Bản vẽ</span></button></nav>
      <section class="panel active" id="panel-ils">
        <div class="section-heading"><div><small>QUẢN LÝ THIẾT BỊ</small><h1>Hệ thống ILS</h1></div><span class="count-pill" id="ils-count">0 thiết bị</span></div>
        <form id="ils-form" class="card form-card">
          <div class="card-title"><span class="title-icon blue">＋</span><div><strong id="form-title">Thêm thiết bị</strong><small>Thông tin vị trí và cấu hình</small></div></div>
          <label>Tên đài / thiết bị<input id="ils-name" maxlength="80" placeholder="VD: Localizer RWY 11L" required /></label>
          <div class="field-grid"><label>Thành phần<select id="ils-type"><option>LLZ</option><option>GP</option><option>DME</option></select></label><label>Đường cất hạ cánh<select id="ils-runway"><option>11L/29R</option><option>11R/29L</option></select></label></div>
          <div class="field-grid"><label>Tiêu chuẩn<select id="ils-cat"><option>CAT I</option><option selected>CAT II</option><option>CAT IIIa</option><option>CAT IIIb</option></select></label><label>Tần số (MHz)<input id="ils-freq" type="number" step="0.05" min="108" max="400" placeholder="VD: 110.30" required /></label></div>
          <div class="field-grid"><label>Vĩ độ<input id="ils-lat" type="number" step="any" min="-90" max="90" placeholder="VD: 21.221200" required /></label><label>Kinh độ<input id="ils-lng" type="number" step="any" min="-180" max="180" placeholder="VD: 105.807200" required /></label></div>
          <div class="form-actions"><button class="button primary" type="submit" id="submit-ils">Lưu thiết bị <span>↗</span></button><button class="button quiet hidden" type="button" id="cancel-edit">Hủy sửa</button></div>
        </form>
        <div class="list-heading"><div><small>DANH SÁCH TRÊN BẢN ĐỒ</small><h2>Thiết bị đã lưu</h2></div><button class="text-button" id="reset-data" title="Khôi phục dữ liệu mẫu">Đặt lại</button></div>
        <div id="ils-list" class="device-list"></div>
        <div class="storage-note"><span>▣</span><p>${appConfig.storageMode === 'supabase' ? 'Đồng bộ cloud đang được cấu hình' : 'Dữ liệu được lưu trên trình duyệt này'}<br/><small>${appConfig.storageMode === 'supabase' ? 'Cần kết nối Supabase để đồng bộ giữa các máy' : 'Chọn file tự lưu để ghi thay đổi vào một tệp dữ liệu riêng'}</small></p></div>
        <div class="backup-actions"><button class="button secondary" type="button" id="choose-data-file">▣ Chọn file tự lưu</button><button class="button secondary" type="button" id="open-data-file">↥ Mở file dữ liệu</button><button class="button secondary" type="button" id="export-project">↓ Sao lưu dữ liệu</button><label class="button secondary import-project" for="import-project">↑ Mở tệp sao lưu<input id="import-project" type="file" accept="application/json,.json" /></label></div>
      </section>
      <section class="panel" id="panel-camera">
        <div class="section-heading"><div><small>ĐIỀU HƯỚNG BẢN ĐỒ</small><h1>Góc nhìn 3D</h1></div></div>
        <div class="card control-card"><div class="control-label"><span>Hướng xoay</span><output id="bearing-label">0°</output></div><input type="range" min="0" max="360" value="0" id="bearing"/><div class="control-label"><span>Độ nghiêng</span><output id="pitch-label">0°</output></div><input type="range" min="0" max="60" value="0" id="pitch"/><small class="hint">Kéo chuột phải để xoay và nghiêng bản đồ.</small></div>
        <div class="card preset-card"><div class="card-title"><span class="title-icon teal">⌖</span><div><strong>Hướng đường băng</strong><small>Góc nhìn nhanh</small></div></div><div class="preset-grid"><button data-view="0,0"><b>Bắc</b><small>000°</small></button><button data-view="110,45"><b>RWY 11</b><small>110°</small></button><button data-view="290,45"><b>RWY 29</b><small>290°</small></button></div></div>
        <div class="hint-box">Bản đồ hỗ trợ zoom, xoay và nghiêng. Dùng nút la bàn trên bản đồ để quay về hướng bắc.</div>
      </section>
      <section class="panel" id="panel-draw">
        <div class="section-heading"><div><small>CÔNG CỤ QUY HOẠCH</small><h1>Bản vẽ</h1></div><span class="count-pill" id="draw-count">0 đối tượng</span></div>
        <div class="draw-tools"><button class="tool-card" data-mode="polygon"><span class="tool-icon violet">⬠</span><span><b>Vùng quy hoạch</b><small>Polygon · từ 3 điểm</small></span><span class="tool-state">VẼ</span></button><button class="tool-card" data-mode="line"><span class="tool-icon green">⌁</span><span><b>Tuyến taxiway</b><small>Đường gấp khúc · từ 2 điểm</small></span><span class="tool-state">VẼ</span></button><button class="tool-card" data-mode="point"><span class="tool-icon amber">⊙</span><span><b>Đánh dấu vị trí</b><small>Thêm một điểm trên bản đồ</small></span><span class="tool-state">VẼ</span></button></div>
        <div id="draw-actions" class="card draw-actions hidden"><div class="drawing-status"><b class="live-dot"></b><span id="draw-status">Đang vẽ · nhấp bản đồ để thêm điểm</span></div><fieldset class="flag-colors" id="flag-colors"><legend>Màu cờ đánh dấu</legend><label><input type="radio" name="flag-color" value="red" checked /><span class="flag-swatch red">⚑</span> Đỏ</label><label><input type="radio" name="flag-color" value="blue" /><span class="flag-swatch blue">⚑</span> Xanh</label><label><input type="radio" name="flag-color" value="yellow" /><span class="flag-swatch yellow">⚑</span> Vàng</label></fieldset><div class="draw-help"><span id="last-coordinate">Chưa có điểm</span><label class="snap-toggle"><input id="snap-vertices" type="checkbox" checked /> Bắt dính điểm gần</label></div><div class="coordinate-entry"><label>Vĩ độ<input id="draw-lat" type="number" step="any" min="-90" max="90" placeholder="21.221200" /></label><label>Kinh độ<input id="draw-lng" type="number" step="any" min="-180" max="180" placeholder="105.807200" /></label><button class="button secondary" type="button" id="add-coordinate">＋ Thêm tọa độ</button></div><p class="shortcut-help">Phím tắt: <kbd>Enter</kbd> hoàn thành · <kbd>Backspace</kbd> lùi điểm · <kbd>Esc</kbd> hủy</p><div class="action-grid"><button class="button secondary" id="undo-point">↶ Điểm trước</button><button class="button primary" id="finish-draw">Hoàn thành</button><button class="button danger" id="cancel-draw">Hủy nét</button></div></div>
        <div class="drawing-summary"><div><small>BẢN VẼ ĐÃ LƯU</small><strong id="draw-summary">0 nét</strong></div><button class="button secondary" id="undo-feature">↶ Xóa nét mới nhất</button></div>
        <div id="drawn-feature-list" class="drawn-feature-list" aria-label="Danh sách bản vẽ đã lưu"></div>
        <button class="button export-button" id="export-geojson">↓ <span>Xuất tệp GeoJSON</span></button>
        <button class="button clear-button" id="clear-drawings">Xóa toàn bộ bản vẽ</button>
        <div class="hint-box">Các nét vẽ được lưu tự động trong trình duyệt. Tệp GeoJSON có thể mở bằng phần mềm GIS.</div>
      </section>
    </aside>
    <section class="map-region"><div id="map"></div><div class="map-toolbar"><button id="sidebar-toggle" title="Ẩn hoặc hiện bảng công cụ" aria-expanded="true">☰ <span>Ẩn công cụ</span></button><span class="map-status"><b class="live-dot"></b> ẢNH VỆ TINH</span><button id="home-map" title="Về Nội Bài">⌖ <span>Về sân bay</span></button><button id="quick-draw" title="Vẽ taxiway">＋ <span>Vẽ mới</span></button></div><div class="map-coordinates" id="coordinates">21.2212°N&nbsp;&nbsp; 105.8072°E</div><div id="toast" class="toast" role="status"></div></section>
  </main>`;

const map = new maplibregl.Map({
  container: 'map',
  style: { version: 8, sources: { imagery: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, minzoom: 0, maxzoom: 18, attribution: '&copy; Esri' } }, layers: [{ id: 'imagery', type: 'raster', source: 'imagery', minzoom: 0 }] },
  center: [ARP.lng, ARP.lat], zoom: 13.8, maxZoom: 18, maxPitch: 60, pitch: 0, bearing: 0, antialias: true,
});
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); scheduleDataFileSave(); } catch { notify('Không thể lưu dữ liệu. Bộ nhớ trình duyệt có thể đã đầy.'); } };
let toastTimer;
function notify(message) { const el = document.querySelector('#toast'); el.textContent = message; el.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'), 2600); }
function setTab(tab) { document.querySelectorAll('.tab').forEach(button => button.classList.toggle('active', button.dataset.tab === tab)); document.querySelectorAll('.panel').forEach(panel => panel.classList.toggle('active', panel.id === `panel-${tab}`)); }
function setSidebarHidden(hidden) {
  const workspace = document.querySelector('.workspace');
  const toggle = document.querySelector('#sidebar-toggle');
  workspace.classList.toggle('sidebar-hidden', hidden);
  toggle.setAttribute('aria-expanded', String(!hidden));
  toggle.innerHTML = hidden ? '☰ <span>Hiện công cụ</span>' : '☰ <span>Ẩn công cụ</span>';
  window.setTimeout(() => map.resize(), 260);
}
document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => setTab(button.dataset.tab)));

function renderILS() {
  document.querySelector('#ils-count').textContent = `${ilsDevices.length} thiết bị`;
  document.querySelector('#ils-list').innerHTML = ilsDevices.length ? ilsDevices.map(item => `<article class="device-card"><button class="device-main" data-fly="${item.id}" aria-label="Định vị ${esc(item.name)}"><span class="device-type">${esc(item.type)}</span><span class="device-info"><b>${esc(item.name)}</b><small>RWY ${esc(item.runway)} <i>·</i> ${Number(item.freq).toFixed(2)} MHz</small><small>${Number(item.lat).toFixed(5)}, ${Number(item.lng).toFixed(5)} <i>·</i> ${esc(item.cat)}</small></span></button><div class="device-actions"><button data-edit="${item.id}" title="Sửa thiết bị">✎</button><button data-delete="${item.id}" title="Xóa thiết bị">×</button></div></article>`).join('') : '<div class="empty-state">Chưa có thiết bị nào.<br/>Thêm thiết bị bằng biểu mẫu phía trên.</div>';
  activeIlsPopup?.remove(); activeIlsPopup = null;
  markers.forEach(marker => marker.remove()); markers = [];
  ilsDevices.forEach(item => {
    const el = document.createElement('div');
    const runwayEnd = item.runway.split('/')[0].trim();
    el.className = `ils-map-label marker-${item.type.toLowerCase()}`;
    el.innerHTML = `<span class="ils-device-name">${esc(item.name)}</span>`;
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', `${item.name} — ILS/${item.type} RWY ${runwayEnd}`);
    const popup = new maplibregl.Popup({ anchor: 'left', offset: [76, -20], closeButton: false, closeOnClick: false })
      .setLngLat([item.lng, item.lat])
      .setHTML(`<div class="popup popup-device"><span><b>Tên:</b> ${esc(item.name)}</span><span><b>Tần số:</b> ${Number(item.freq)} MHz</span><span><b>Vĩ độ:</b> ${Number(item.lat)}</span><span><b>Kinh độ:</b> ${Number(item.lng)}</span></div>`);
    const marker = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, 8] }).setLngLat([item.lng, item.lat]).addTo(map);
    el.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (activeIlsPopup === popup && popup.isOpen()) { popup.remove(); activeIlsPopup = null; return; }
      activeIlsPopup?.remove();
      popup.addTo(map);
      activeIlsPopup = popup;
    });
    markers.push(marker);
  });
}
document.querySelector('#ils-list').addEventListener('click', event => {
  const fly = event.target.closest('[data-fly]'); if (fly) { const item = ilsDevices.find(device => device.id === Number(fly.dataset.fly)); if (item) map.flyTo({ center: [item.lng, item.lat], zoom: 16 }); return; }
  const edit = event.target.closest('[data-edit]'); if (edit) { const item = ilsDevices.find(device => device.id === Number(edit.dataset.edit)); if (!item) return; editingId = item.id; for (const key of ['name', 'type', 'runway', 'cat', 'freq', 'lat', 'lng']) document.querySelector(`#ils-${key}`).value = item[key]; document.querySelector('#form-title').textContent = 'Cập nhật thiết bị'; document.querySelector('#submit-ils').innerHTML = 'Cập nhật thiết bị <span>↗</span>'; document.querySelector('#cancel-edit').classList.remove('hidden'); document.querySelector('#ils-form').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  const del = event.target.closest('[data-delete]'); if (del) { ilsDevices = ilsDevices.filter(device => device.id !== Number(del.dataset.delete)); save(STORAGE.ils, ilsDevices); renderILS(); notify('Đã xóa thiết bị.'); }
});
function resetForm() { editingId = null; document.querySelector('#ils-form').reset(); document.querySelector('#form-title').textContent = 'Thêm thiết bị'; document.querySelector('#submit-ils').innerHTML = 'Lưu thiết bị <span>↗</span>'; document.querySelector('#cancel-edit').classList.add('hidden'); }
document.querySelector('#cancel-edit').addEventListener('click', resetForm);
document.querySelector('#ils-form').addEventListener('submit', event => {
  event.preventDefault(); const item = { id: editingId ?? Date.now(), name: document.querySelector('#ils-name').value.trim(), type: document.querySelector('#ils-type').value, runway: document.querySelector('#ils-runway').value, cat: document.querySelector('#ils-cat').value, freq: Number(document.querySelector('#ils-freq').value), lat: Number(document.querySelector('#ils-lat').value), lng: Number(document.querySelector('#ils-lng').value), status: 'Hoạt động' };
  if (!item.name || !Number.isFinite(item.freq) || !Number.isFinite(item.lat) || !Number.isFinite(item.lng)) return;
  if (editingId !== null) ilsDevices = ilsDevices.map(old => old.id === editingId ? item : old); else ilsDevices.push(item);
  save(STORAGE.ils, ilsDevices); renderILS(); resetForm(); map.flyTo({ center: [item.lng, item.lat], zoom: 16 }); notify('Đã lưu thiết bị ILS.');
});
document.querySelector('#reset-data').addEventListener('click', () => { ilsDevices = structuredClone(defaultILS); drawnFeatures = []; save(STORAGE.ils, ilsDevices); save(STORAGE.drawings, drawnFeatures); resetForm(); renderILS(); renderDrawings(); notify('Đã khôi phục dữ liệu mẫu.'); });

function renderDrawings() {
  document.querySelector('#draw-count').textContent = `${drawnFeatures.length} đối tượng`;
  document.querySelector('#draw-summary').textContent = `${drawnFeatures.length} nét`;
  const featureList = document.querySelector('#drawn-feature-list');
  const featureLabel = feature => ({ Polygon: 'Vùng quy hoạch', LineString: 'Tuyến taxiway', Point: 'Cờ đánh dấu' }[feature.geometry.type] ?? 'Đối tượng bản vẽ');
  featureList.innerHTML = drawnFeatures.length
    ? drawnFeatures.map((feature, index) => `<div class="drawn-feature-item"><span class="feature-kind feature-${feature.geometry.type.toLowerCase()}">${feature.geometry.type === 'Polygon' ? '⬠' : feature.geometry.type === 'LineString' ? '⌁' : '⚑'}</span><span><b>${esc(feature.properties?.name || featureLabel(feature))}</b><small>${featureLabel(feature)}</small></span><button type="button" data-delete-drawing="${index}" title="Xóa đối tượng này" aria-label="Xóa ${featureLabel(feature)}">×</button></div>`).join('')
    : '<p class="drawn-empty">Chưa có bản vẽ nào.</p>';
  if (mapReady && map.getSource('custom-draw-source')) map.getSource('custom-draw-source').setData({ type: 'FeatureCollection', features: drawnFeatures });
  if (!mapReady) return;
  drawnPointMarkers.forEach(marker => marker.remove());
  drawnPointMarkers = drawnFeatures.filter(feature => feature.geometry.type === 'Point').map(feature => {
    const color = ['red', 'blue', 'yellow'].includes(feature.properties?.flagColor) ? feature.properties.flagColor : 'yellow';
    const el = document.createElement('div');
    el.className = `draw-flag ${color}`;
    el.setAttribute('title', `Điểm đánh dấu (${color})`);
    el.setAttribute('aria-label', `Cờ đánh dấu màu ${color}`);
    el.innerHTML = '<span class="flag-pole"><span class="flag-cloth"></span></span><span class="flag-pin"></span>';
    const marker = new maplibregl.Marker({ element: el, anchor: 'center', subpixelPositioning: true }).setLngLat(feature.geometry.coordinates).addTo(map);
    return marker;
  });
}
function persistDrawings() { save(STORAGE.drawings, drawnFeatures); renderDrawings(); }
function updateTempDraw() {
  if (!mapReady || !map.getSource('temp-draw-source')) return;
  const features = [];
  if (currentDrawCoords.length) features.push({ type: 'Feature', properties: {}, geometry: { type: 'MultiPoint', coordinates: currentDrawCoords } });
  if (currentDrawCoords.length > 1) features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: currentDrawCoords } });
  map.getSource('temp-draw-source').setData({ type: 'FeatureCollection', features });
  document.querySelector('#draw-status').textContent = `Đang vẽ · ${currentDrawCoords.length} điểm`;
  const last = currentDrawCoords.at(-1);
  document.querySelector('#last-coordinate').textContent = last ? `Điểm cuối: ${last[1].toFixed(6)}, ${last[0].toFixed(6)}` : 'Chưa có điểm';
}
function cancelDraw() { activeDrawMode = null; currentDrawCoords = []; document.querySelector('#draw-actions').classList.add('hidden'); document.querySelectorAll('.tool-card').forEach(button => button.classList.remove('selected')); document.querySelector('#map').classList.remove('drawing'); updateTempDraw(); }
function finishDraw() {
  if (activeDrawMode === 'polygon' && currentDrawCoords.length >= 3) drawnFeatures.push({ type: 'Feature', properties: { id: Date.now(), name: 'Vùng quy hoạch' }, geometry: { type: 'Polygon', coordinates: [[...currentDrawCoords, currentDrawCoords[0]]] } });
  else if (activeDrawMode === 'line' && currentDrawCoords.length >= 2) drawnFeatures.push({ type: 'Feature', properties: { id: Date.now(), name: 'Tuyến taxiway' }, geometry: { type: 'LineString', coordinates: currentDrawCoords } });
  else if (activeDrawMode) { notify(activeDrawMode === 'polygon' ? 'Polygon cần ít nhất 3 điểm.' : 'Tuyến cần ít nhất 2 điểm.'); return; }
  cancelDraw(); persistDrawings();
}
document.querySelectorAll('.tool-card').forEach(button => button.addEventListener('click', () => { cancelDraw(); activeDrawMode = button.dataset.mode; setTab('draw'); button.classList.add('selected'); document.querySelector('#draw-actions').classList.remove('hidden'); document.querySelector('#map').classList.add('drawing'); notify('Nhấp lên bản đồ để thêm điểm.'); }));
document.querySelector('#undo-point').addEventListener('click', () => { currentDrawCoords.pop(); updateTempDraw(); });
document.querySelector('#finish-draw').addEventListener('click', finishDraw);
document.querySelector('#cancel-draw').addEventListener('click', cancelDraw);
function featureVertices(feature) {
  const { type, coordinates } = feature.geometry;
  if (type === 'Point') return [coordinates];
  if (type === 'LineString') return coordinates;
  if (type === 'Polygon') return coordinates.flat();
  return [];
}
function snapCoordinate(coord) {
  if (!document.querySelector('#snap-vertices').checked || !mapReady) return coord;
  const screenPoint = map.project(coord);
  const vertices = [...currentDrawCoords, ...drawnFeatures.flatMap(featureVertices)];
  let nearest = null;
  let nearestDistance = 13;
  vertices.forEach(vertex => { const point = map.project(vertex); const distance = Math.hypot(point.x - screenPoint.x, point.y - screenPoint.y); if (distance < nearestDistance) { nearest = vertex; nearestDistance = distance; } });
  return nearest ?? coord;
}
function addDrawingCoordinate(coord) {
  if (!activeDrawMode) return;
  const snapped = snapCoordinate(coord);
  if (activeDrawMode === 'point') {
    const flagColor = document.querySelector('input[name="flag-color"]:checked').value;
    drawnFeatures.push({ type: 'Feature', properties: { id: Date.now(), name: 'Điểm đánh dấu', flagColor }, geometry: { type: 'Point', coordinates: snapped } });
    persistDrawings(); cancelDraw(); return;
  }
  currentDrawCoords.push(snapped);
  updateTempDraw();
}
document.querySelector('#add-coordinate').addEventListener('click', () => {
  const lat = Number(document.querySelector('#draw-lat').value);
  const lng = Number(document.querySelector('#draw-lng').value);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return notify('Nhập vĩ độ và kinh độ hợp lệ.');
  addDrawingCoordinate([lng, lat]);
  document.querySelector('#draw-lat').value = '';
  document.querySelector('#draw-lng').value = '';
});
document.addEventListener('keydown', event => {
  if (!activeDrawMode || ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
  if (event.key === 'Enter') { event.preventDefault(); finishDraw(); }
  if (event.key === 'Backspace') { event.preventDefault(); currentDrawCoords.pop(); updateTempDraw(); }
  if (event.key === 'Escape') { event.preventDefault(); cancelDraw(); }
});
document.querySelector('#undo-feature').addEventListener('click', () => { if (drawnFeatures.length) { drawnFeatures.pop(); persistDrawings(); } else notify('Chưa có nét vẽ để hoàn tác.'); });
document.querySelector('#drawn-feature-list').addEventListener('click', event => {
  const button = event.target.closest('[data-delete-drawing]');
  if (!button) return;
  const index = Number(button.dataset.deleteDrawing);
  if (!Number.isInteger(index) || !drawnFeatures[index]) return;
  drawnFeatures.splice(index, 1);
  persistDrawings();
  notify('Đã xóa đối tượng bản vẽ.');
});
document.querySelector('#clear-drawings').addEventListener('click', () => { if (!drawnFeatures.length) return notify('Bản vẽ đang trống.'); drawnFeatures = []; persistDrawings(); notify('Đã xóa toàn bộ bản vẽ.'); });
document.querySelector('#export-geojson').addEventListener('click', () => { const blob = new Blob([JSON.stringify({ type: 'FeatureCollection', features: drawnFeatures }, null, 2)], { type: 'application/geo+json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'noi-bai-airfield-design.geojson'; link.click(); URL.revokeObjectURL(url); });
function isValidCoordinate(value) { return Array.isArray(value) && value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1])); }
function isValidDrawing(feature) {
  if (!feature || feature.type !== 'Feature' || !feature.geometry) return false;
  const { type, coordinates } = feature.geometry;
  if (type === 'Point') return isValidCoordinate(coordinates);
  if (type === 'LineString') return Array.isArray(coordinates) && coordinates.length >= 2 && coordinates.every(isValidCoordinate);
  return type === 'Polygon' && Array.isArray(coordinates) && coordinates.length && coordinates.every(ring => Array.isArray(ring) && ring.length >= 4 && ring.every(isValidCoordinate));
}
function isValidIlsDevice(device) { return device && typeof device.name === 'string' && typeof device.type === 'string' && typeof device.runway === 'string' && typeof device.cat === 'string' && Number.isFinite(Number(device.freq)) && Number.isFinite(Number(device.lat)) && Number.isFinite(Number(device.lng)); }
const getProjectData = () => ({ format: 'vvnb-airfield-planner', version: 1, exportedAt: new Date().toISOString(), ilsDevices, drawnFeatures });
function openHandleDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('vvnb-file-storage', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('handles');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function saveDataFileHandle(handle) {
  const database = await openHandleDatabase();
  await new Promise((resolve, reject) => { const transaction = database.transaction('handles', 'readwrite'); transaction.objectStore('handles').put(handle, 'project'); transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); });
  database.close();
}
async function loadDataFileHandle() {
  const database = await openHandleDatabase();
  const handle = await new Promise((resolve, reject) => { const request = database.transaction('handles').objectStore('handles').get('project'); request.onsuccess = () => resolve(request.result ?? null); request.onerror = () => reject(request.error); });
  database.close();
  return handle;
}
async function writeDataFile() {
  if (!dataFileHandle) return;
  const permission = await dataFileHandle.queryPermission({ mode: 'readwrite' });
  if (permission !== 'granted') return;
  const writable = await dataFileHandle.createWritable();
  await writable.write(JSON.stringify(getProjectData(), null, 2));
  await writable.close();
}
function scheduleDataFileSave() {
  if (!dataFileHandle) return;
  clearTimeout(fileSaveTimer);
  fileSaveTimer = setTimeout(() => writeDataFile().catch(() => notify('Không thể ghi file dữ liệu. Hãy chọn lại file.')), 350);
}
function applyProjectData(backup) {
  if (backup?.format !== 'vvnb-airfield-planner' || !Array.isArray(backup.ilsDevices) || !Array.isArray(backup.drawnFeatures) || !backup.ilsDevices.every(isValidIlsDevice) || !backup.drawnFeatures.every(isValidDrawing)) throw new Error('invalid backup');
  ilsDevices = backup.ilsDevices.map((device, index) => ({ ...device, id: device.id ?? Date.now() + index, lat: Number(device.lat), lng: Number(device.lng), freq: Number(device.freq) }));
  drawnFeatures = backup.drawnFeatures;
  save(STORAGE.ils, ilsDevices);
  save(STORAGE.drawings, drawnFeatures);
  resetForm(); renderILS(); renderDrawings();
}
document.querySelector('#export-project').addEventListener('click', () => {
  const backup = getProjectData();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `vvnb-airfield-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  notify('Đã tạo tệp sao lưu dữ liệu.');
});
document.querySelector('#import-project').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const backup = JSON.parse(await file.text());
    applyProjectData(backup);
    notify('Đã khôi phục dữ liệu từ tệp sao lưu.');
  } catch { notify('Tệp sao lưu không hợp lệ hoặc không đúng định dạng.'); }
  event.target.value = '';
});
document.querySelector('#choose-data-file').addEventListener('click', async () => {
  if (!('showSaveFilePicker' in window)) return notify('Trình duyệt này chưa hỗ trợ tự lưu vào file. Hãy dùng Microsoft Edge hoặc Chrome.');
  try {
    const handle = await window.showSaveFilePicker({ suggestedName: 'vvnb-airfield-data.json', types: [{ description: 'Tệp dữ liệu VVNB', accept: { 'application/json': ['.json'] } }] });
    if (await handle.requestPermission({ mode: 'readwrite' }) !== 'granted') return;
    dataFileHandle = handle;
    await saveDataFileHandle(handle);
    await writeDataFile();
    notify('Đã kết nối file dữ liệu. Các thay đổi sẽ tự lưu vào file này.');
  } catch (error) { if (error.name !== 'AbortError') notify('Không thể chọn file dữ liệu.'); }
});
document.querySelector('#open-data-file').addEventListener('click', async () => {
  if (!('showOpenFilePicker' in window)) return notify('Trình duyệt này chưa hỗ trợ mở file dữ liệu. Hãy dùng Microsoft Edge hoặc Chrome.');
  try {
    const [handle] = await window.showOpenFilePicker({ types: [{ description: 'Tệp dữ liệu VVNB', accept: { 'application/json': ['.json'] } }], multiple: false });
    if (await handle.requestPermission({ mode: 'readwrite' }) !== 'granted') return;
    applyProjectData(JSON.parse(await (await handle.getFile()).text()));
    dataFileHandle = handle;
    await saveDataFileHandle(handle);
    notify('Đã mở file dữ liệu. Các thay đổi tiếp theo sẽ tự lưu vào file này.');
  } catch (error) { if (error.name !== 'AbortError') notify('File dữ liệu không hợp lệ hoặc không thể mở.'); }
});
loadDataFileHandle().then(async handle => { if (handle && await handle.queryPermission({ mode: 'readwrite' }) === 'granted') dataFileHandle = handle; }).catch(() => {});

map.on('load', () => {
  mapReady = true;
  map.addSource('custom-draw-source', { type: 'geojson', data: { type: 'FeatureCollection', features: drawnFeatures } });
  map.addSource('temp-draw-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'draw-fill', type: 'fill', source: 'custom-draw-source', filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': '#8b78ff', 'fill-opacity': 0.22 } });
  map.addLayer({ id: 'draw-polygon-line', type: 'line', source: 'custom-draw-source', filter: ['==', '$type', 'Polygon'], paint: { 'line-color': '#a59aff', 'line-width': 2.5 } });
  map.addLayer({ id: 'draw-lines', type: 'line', source: 'custom-draw-source', filter: ['==', '$type', 'LineString'], paint: { 'line-color': '#35d5a0', 'line-width': 3.5 } });
  map.addLayer({ id: 'temp-lines', type: 'line', source: 'temp-draw-source', filter: ['==', '$type', 'LineString'], paint: { 'line-color': '#ff8e71', 'line-width': 2, 'line-dasharray': [2, 2] } });
  map.addLayer({ id: 'temp-points', type: 'circle', source: 'temp-draw-source', filter: ['==', '$type', 'MultiPoint'], paint: { 'circle-radius': 5, 'circle-color': '#ff8e71' } });
  renderILS(); renderDrawings();
});
map.on('click', event => {
  if (activeIlsPopup) { activeIlsPopup.remove(); activeIlsPopup = null; }
  if (!activeDrawMode) return;
  addDrawingCoordinate([event.lngLat.lng, event.lngLat.lat]);
});
map.on('mousemove', event => { const { lng, lat } = event.lngLat; document.querySelector('#coordinates').innerHTML = `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}&nbsp;&nbsp; ${Math.abs(lng).toFixed(4)}°${lng >= 0 ? 'E' : 'W'}`; });
map.on('rotate', syncCamera); map.on('pitch', syncCamera);
function syncCamera() { const bearing = Math.round((map.getBearing() + 360) % 360); const pitch = Math.round(map.getPitch()); document.querySelector('#bearing').value = bearing; document.querySelector('#pitch').value = pitch; document.querySelector('#bearing-label').textContent = `${bearing}°`; document.querySelector('#pitch-label').textContent = `${pitch}°`; }
document.querySelector('#bearing').addEventListener('input', event => map.setBearing(Number(event.target.value)));
document.querySelector('#pitch').addEventListener('input', event => map.setPitch(Number(event.target.value)));
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => { const [bearing, pitch] = button.dataset.view.split(',').map(Number); map.easeTo({ bearing, pitch, duration: 800 }); }));
document.querySelector('#home-map').addEventListener('click', () => map.flyTo({ center: [ARP.lng, ARP.lat], zoom: 13.8, pitch: 0, bearing: 0 }));
document.querySelector('#quick-draw').addEventListener('click', () => { setTab('draw'); document.querySelector('[data-mode="line"]').click(); });
document.querySelector('#sidebar-toggle').addEventListener('click', () => setSidebarHidden(!document.querySelector('.workspace').classList.contains('sidebar-hidden')));
renderILS(); renderDrawings();
