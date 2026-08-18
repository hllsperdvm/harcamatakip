/* YUVAM modül parçası — sırayla yüklenir (ES module değil, ortak global scope)
 * Hava, IBAN, kategori, sekmeler, admin, activityLog lazy, auth boot
 * GitHub: js/ klasörünün tamamını yükleyin.
 */
        // ——— Anasayfa hava durumu (Ankara · Open-Meteo) ———
        let _homeWeatherCache = null;
        let _homeWeatherAt = 0;

        function weatherCodeTr(code) {
            const c = Number(code);
            if (c === 0) return { text: 'Güneşli', icon: '☀️' };
            if (c === 1) return { text: 'Çoğunlukla açık', icon: '🌤️' };
            if (c === 2) return { text: 'Parçalı bulutlu', icon: '⛅' };
            if (c === 3) return { text: 'Bulutlu', icon: '☁️' };
            if (c === 45 || c === 48) return { text: 'Sisli', icon: '🌫️' };
            if (c >= 51 && c <= 57) return { text: 'Çisenti', icon: '🌦️' };
            if (c >= 61 && c <= 67) return { text: 'Yağmurlu', icon: '🌧️' };
            if (c >= 71 && c <= 77) return { text: 'Karlı', icon: '❄️' };
            if (c >= 80 && c <= 82) return { text: 'Sağanak', icon: '🌧️' };
            if (c >= 85 && c <= 86) return { text: 'Kar sağanağı', icon: '🌨️' };
            if (c >= 95 && c <= 99) return { text: 'Fırtınalı', icon: '⛈️' };
            return { text: 'Değişken', icon: '🌡️' };
        }

        window.loadHomeWeather = async function(force) {
            const el = document.getElementById('homeWeather');
            if (!el) return;
            const CACHE_MS = 30 * 60 * 1000;
            if (!force && _homeWeatherCache && (Date.now() - _homeWeatherAt) < CACHE_MS) {
                el.textContent = _homeWeatherCache;
                return;
            }
            try {
                // Keçiören, Ankara
                const url = 'https://api.open-meteo.com/v1/forecast?latitude=39.9767&longitude=32.8639&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Europe%2FIstanbul&forecast_days=7';
                const res = await fetch(url);
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const data = await res.json();
                const cur = data.current || {};
                const temp = cur.temperature_2m;
                const meta = weatherCodeTr(cur.weather_code);
                const t = (temp != null && isFinite(Number(temp))) ? Math.round(Number(temp)) : '—';
                const line = meta.icon + ' Ankara / Keçiören ' + t + '° · ' + meta.text;
                _homeWeatherCache = line;
                _homeWeatherAt = Date.now();
                el.textContent = line;
                // 7 günlük önbellek
                if (data.daily && Array.isArray(data.daily.time)) {
                    _weatherDailyCache = data.daily;
                    _weatherDailyAt = Date.now();
                }
            } catch (err) {
                console.warn('weather', err);
                if (!_homeWeatherCache) el.textContent = 'Ankara / Keçiören hava alınamadı';
            }
        };

        window.openWeatherModal = async function() {
            const modal = document.getElementById('weatherModal');
            const body = document.getElementById('weatherModalBody');
            if (!modal || !body) return;
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            body.innerHTML = '<p class="text-slate-400 font-semibold text-center py-4">Yükleniyor…</p>';
            try {
                const CACHE_MS = 30 * 60 * 1000;
                if (!_weatherDailyCache || (Date.now() - _weatherDailyAt) > CACHE_MS) {
                    await loadHomeWeather(true);
                }
                const daily = _weatherDailyCache;
                if (!daily || !daily.time || !daily.time.length) {
                    body.innerHTML = '<p class="text-rose-600 font-semibold text-center py-4">Tahmin alınamadı</p>';
                    return;
                }
                const today = todayDateStr();
                let html = '';
                for (let i = 0; i < daily.time.length; i++) {
                    const d = daily.time[i];
                    const code = (daily.weather_code || [])[i];
                    const tmax = (daily.temperature_2m_max || [])[i];
                    const tmin = (daily.temperature_2m_min || [])[i];
                    const meta = weatherCodeTr(code);
                    const isToday = d === today;
                    const dayName = new Date(d + 'T12:00:00').toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'short' });
                    html += '<div class="flex items-center gap-3 p-3 rounded-xl border ' + (isToday ? 'bg-sky-50 border-sky-200' : 'bg-slate-50 border-slate-100') + '">' +
                        '<span class="text-2xl shrink-0">' + meta.icon + '</span>' +
                        '<div class="min-w-0 flex-1">' +
                        '<p class="text-sm font-black text-slate-800">' + (isToday ? 'Bugün · ' : '') + dayName + '</p>' +
                        '<p class="text-[11px] text-slate-500 font-semibold">' + meta.text + '</p>' +
                        '</div>' +
                        '<div class="text-right shrink-0">' +
                        '<p class="text-sm font-black text-slate-800">' + Math.round(tmax) + '°</p>' +
                        '<p class="text-[11px] text-slate-400 font-semibold">' + Math.round(tmin) + '°</p>' +
                        '</div></div>';
                }
                body.innerHTML = html;
            } catch (err) {
                body.innerHTML = '<p class="text-rose-600 font-semibold text-center py-4">' + escapeHtml(err.message || String(err)) + '</p>';
            }
        };

        window.closeWeatherModal = function() {
            const modal = document.getElementById('weatherModal');
            if (!modal) return;
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        };


        // IBAN YÖNETIMI
        window.openIbanModal = () => {
            document.getElementById('editIbanId').value = '';
            document.getElementById('ibanOwnerName').value = '';
            document.getElementById('ibanNumber').value = '';
            document.getElementById('ibanBank').value = '';
            document.getElementById('ibanModal').classList.remove('hidden');
            document.getElementById('ibanModal').classList.add('flex');
        };

        window.closeIbanModal = () => {
            document.getElementById('ibanModal').classList.add('hidden');
            document.getElementById('ibanModal').classList.remove('flex');
        };

        window.handleIbanSubmit = async (e) => {
            e.preventDefault();
            const editId = document.getElementById('editIbanId').value;
            const ownerName = document.getElementById('ibanOwnerName').value;
            const ibanNumber = document.getElementById('ibanNumber').value.toUpperCase();
            const bank = document.getElementById('ibanBank').value;

            if (!ibanNumber.startsWith('TR') || ibanNumber.length < 24) {
                alert('Geçerli bir IBAN numarası girin (TR ile başlamalı, en az 24 karakter)');
                return;
            }

            const data = {
                ownerName,
                ibanNumber,
                bank,
                createdAt: new Date().toISOString()
            };

            if (editId) {
                await db.collection("ibans").doc(editId).update(data);
            } else {
                await db.collection("ibans").add(data);
            }

            closeIbanModal();
        };

        window.deleteIban = async (id) => {
            if (!confirm('Bu IBAN kaydını silmek istediğinize emin misiniz?')) return;
            await db.collection("ibans").doc(id).delete();
        };

        function maskIban(raw) {
            const s = String(raw || '').replace(/\s/g, '').toUpperCase();
            if (!s) return 'TR•• •••• •••• •••• •••• ••••';
            const start = s.slice(0, 4);
            const end = s.length > 8 ? s.slice(-4) : '';
            return start + ' •••• •••• •••• •••• ' + end;
        }

        function formatIbanSpaces(raw) {
            const s = String(raw || '').replace(/\s/g, '').toUpperCase();
            return s.replace(/(.{4})/g, '$1 ').trim();
        }

        function getIbanFull(item) {
            if (!item) return '';
            // Olası tüm alan adları
            const keys = ['ibanNumber', 'iban', 'number', 'ibanNo', 'IBAN', 'Iban'];
            for (let i = 0; i < keys.length; i++) {
                if (item[keys[i]]) return String(item[keys[i]]).replace(/\s/g, '').toUpperCase();
            }
            // Nesnedeki TR ile başlayan ilk string
            try {
                for (const k in item) {
                    if (!Object.prototype.hasOwnProperty.call(item, k)) continue;
                    if (k === 'id' || k === 'ownerName' || k === 'name' || k === 'bank' || k === 'bankName') continue;
                    const v = String(item[k] || '').replace(/\s/g, '').toUpperCase();
                    if (v.indexOf('TR') === 0 && v.length >= 16) return v;
                }
            } catch (_) {}
            return '';
        }

        // Tam IBAN DOM'da tutulmaz (sadece bellek)
        window._ibanSecrets = window._ibanSecrets || {};

        window.toggleIbanReveal = function(btn) {
            if (!btn) return;
            const wrap = btn.closest('[data-iban-wrap]');
            if (!wrap) return;
            const id = wrap.getAttribute('data-iban-id') || '';
            const el = wrap.querySelector('[data-iban-value]');
            const full = (window._ibanSecrets && window._ibanSecrets[id]) || '';
            const masked = maskIban(full);
            const on = wrap.getAttribute('data-revealed') === '1';
            if (on) {
                if (el) el.textContent = masked;
                wrap.setAttribute('data-revealed', '0');
                btn.setAttribute('aria-label', 'Göster');
                btn.innerHTML = '👁️';
            } else {
                if (el) el.textContent = full ? formatIbanSpaces(full) : masked;
                wrap.setAttribute('data-revealed', '1');
                btn.setAttribute('aria-label', 'Gizle');
                btn.innerHTML = '🙈';
            }
        };

        window._ibanOwnerOpen = window._ibanOwnerOpen || {};

        window.toggleIbanOwnerGroup = function(key) {
            if (!key) return;
            window._ibanOwnerOpen[key] = !window._ibanOwnerOpen[key];
            const body = document.querySelector('[data-iban-owner-body="' + key + '"]');
            const chev = document.querySelector('[data-iban-owner-chevron="' + key + '"]');
            const open = !!window._ibanOwnerOpen[key];
            if (body) body.classList.toggle('hidden', !open);
            if (chev) chev.textContent = open ? '▾' : '▸';
        };

        window.renderIbans = function() {
            const box = document.getElementById('ibanListContainer');
            if (!box) return;
            const list = Array.isArray(ibans) ? ibans : [];
            window._ibanSecrets = {};
            if (!list.length) {
                box.innerHTML = '<div class="col-span-full">' + yuvamEmptyState('💳', 'Henüz IBAN yok', 'Banka hesaplarınızı güvenle saklayın', '+ IBAN Ekle', 'openIbanModal()') + '</div>';
                return;
            }
            const groups = {};
            list.forEach(function(item) {
                const owner = String(item.ownerName || item.name || 'Diğer').trim() || 'Diğer';
                if (!groups[owner]) groups[owner] = [];
                groups[owner].push(item);
            });
            const owners = Object.keys(groups).sort(function(a, b) {
                return a.localeCompare(b, 'tr');
            });
            box.className = 'space-y-3';
            box.innerHTML = owners.map(function(owner, idx) {
                const items = groups[owner];
                const safeKey = 'o' + idx + '_' + owner.toLowerCase().replace(/[^a-z0-9ğüşıöç]+/gi, '_').slice(0, 40);
                const open = !!window._ibanOwnerOpen[safeKey];
                const rows = items.map(function(item) {
                    const full = getIbanFull(item);
                    const masked = maskIban(full);
                    const safeId = String(item.id || '');
                    window._ibanSecrets[safeId] = full;
                    const bank = escapeHtml(item.bank || item.bankName || '');
                    return '<div class="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1.5" data-iban-wrap data-iban-id="' + escapeHtml(safeId) + '" data-revealed="0">' +
                        '<div class="flex justify-between items-start gap-2">' +
                        '<p class="text-xs font-bold text-slate-500">' + bank + '</p>' +
                        '<div class="flex gap-1 shrink-0">' +
                        '<button type="button" onclick="event.preventDefault();event.stopPropagation();copyIbanById(\'' + escapeHtml(safeId) + '\')" class="w-8 h-8 rounded-lg bg-white border border-slate-200 text-sm flex items-center justify-center" title="Kopyala">📋</button>' +
                        '<button type="button" onclick="event.preventDefault();event.stopPropagation();toggleIbanReveal(this)" class="w-8 h-8 rounded-lg bg-white border border-slate-200 text-sm flex items-center justify-center" title="Göster">👁️</button>' +
                        '<button type="button" onclick="event.preventDefault();event.stopPropagation();editIban(\'' + escapeHtml(safeId) + '\')" class="w-8 h-8 rounded-lg bg-white border border-slate-200 text-sm flex items-center justify-center" title="Düzenle">✏️</button>' +
                        '<button type="button" onclick="event.preventDefault();event.stopPropagation();deleteIban(\'' + escapeHtml(safeId) + '\')" class="w-8 h-8 rounded-lg bg-white border border-slate-200 text-xs text-rose-600 flex items-center justify-center" title="Sil">🗑️</button>' +
                        '</div></div>' +
                        '<p data-iban-value class="font-mono text-sm font-bold text-slate-700 tracking-wide">' + escapeHtml(masked) + '</p>' +
                        '</div>';
                }).join('');
                return '<div class="rounded-2xl border border-slate-100 overflow-hidden bg-white">' +
                    '<button type="button" onclick="toggleIbanOwnerGroup(\'' + safeKey + '\')" class="w-full flex items-center justify-between gap-2 px-4 py-3 bg-slate-50 hover:bg-slate-100 text-left">' +
                    '<span class="text-sm font-black text-slate-800">👤 ' + escapeHtml(owner) + ' <span class="text-xs font-bold text-slate-400">(' + items.length + ')</span></span>' +
                    '<span data-iban-owner-chevron="' + safeKey + '" class="text-slate-400 font-bold text-lg leading-none">' + (open ? '▾' : '▸') + '</span>' +
                    '</button>' +
                    '<div data-iban-owner-body="' + safeKey + '" class="' + (open ? '' : 'hidden') + ' border-t border-slate-100 p-3 space-y-2">' + rows + '</div>' +
                    '</div>';
            }).join('');
        };

        // KATEGORİ YÖNETIMI FONKSIYONLARI

        let removedTabIds = [];

        function mergeTabsConfig(saved, removed) {
            removedTabIds = Array.isArray(removed) ? removed.slice() : (removedTabIds || []);
            const byId = {};
            DEFAULT_TABS.forEach(t => { byId[t.id] = { ...t }; });
            const result = [];
            const seen = new Set();

            const LEGACY_TABS = new Set(['calculator', 'reports', 'alisveris', 'alışveriş', 'deneme', 'homeHub', 'homehub', 'tasks', 'calendar', 'notes']);
            (saved || []).forEach(s => {
                if (!s || !s.id) return;
                if (LEGACY_TABS.has(s.id)) return;
                if (removedTabIds.includes(s.id)) return;
                if (byId[s.id]) {
                    result.push({
                        ...byId[s.id],
                        label: (s.id === 'expense' ? 'Bütçe Takip' : (s.id === 'stats' ? 'Raporlar' : (s.label || byId[s.id].label))),
                        emoji: s.emoji || byId[s.id].emoji,
                        visible: s.visible !== false,
                        adminOnly: s.adminOnly != null ? s.adminOnly : byId[s.id].adminOnly,
                        visibleTo: Array.isArray(s.visibleTo) ? s.visibleTo : (byId[s.id].adminOnly ? ['Bekir'] : ['Bekir', 'Duygu']),
                        content: s.content || '',
                        widgetType: s.widgetType || null,
                        aiHtml: s.aiHtml || null
                    });
                    seen.add(s.id);
                } else if (String(s.id).startsWith('custom_')) {
                    result.push({
                        id: s.id,
                        emoji: s.emoji || '📌',
                        label: s.label || 'Özel',
                        visible: s.visible !== false,
                        core: false,
                        adminOnly: !!s.adminOnly,
                        visibleTo: Array.isArray(s.visibleTo) ? s.visibleTo : ['Bekir', 'Duygu'],
                        content: s.content || '',
                        widgetType: s.widgetType || null,
                        aiHtml: s.aiHtml || null
                    });
                    seen.add(s.id);
                }
            });

            // Silinmemiş sistem sekmelerini ekle (kayıtta yoksa)
            DEFAULT_TABS.forEach(t => {
                if (seen.has(t.id)) return;
                if (removedTabIds.includes(t.id)) return;
                result.push({ ...t, content: '', widgetType: null });
            });

            // Ana Sayfa her zaman en başta — diğer sıra kullanıcının kaydettiği gibi kalsın
            const homeIdx = result.findIndex(t => t && t.id === 'home');
            if (homeIdx > 0) {
                const homeTab = result.splice(homeIdx, 1)[0];
                result.unshift(homeTab);
            } else if (homeIdx < 0 && !removedTabIds.includes('home')) {
                const defHome = DEFAULT_TABS.find(t => t.id === 'home');
                if (defHome) result.unshift(Object.assign({}, defHome, { content: '', widgetType: null }));
            }
            // Plan yoksa Raporlar'dan hemen sonra ekle (sadece ilk kurulum)
            const hasPlan = result.some(function(t) { return t && t.id === 'plan'; });
            if (!hasPlan && !removedTabIds.includes('plan')) {
                const defPlan = DEFAULT_TABS.find(function(t) { return t.id === 'plan'; });
                if (defPlan) {
                    const statsIdx = result.findIndex(function(t) { return t && t.id === 'stats'; });
                    const planTab = Object.assign({}, defPlan, { content: '', widgetType: null });
                    if (statsIdx >= 0) result.splice(statsIdx + 1, 0, planTab);
                    else result.push(planTab);
                }
            }
            return result;
        }

        window.saveTabsConfig = async () => {
            try {
                await db.collection("settings").doc("tabs").set({
                    list: tabsConfig,
                    removed: removedTabIds
                }, { merge: true });
            } catch (err) {
                console.error(err);
                alert('Sekmeler kaydedilemedi: ' + (err.message || err));
                throw err;
            }
        };

        // ----- Sekme içeriği üretici (istem metninden sayfa oluşturur) -----
        function detectWidgetType(prompt) {
            const p = (prompt || '').toLowerCase();
            if (/akaryak|yakıt fiyat|yakit fiyat|benzin fiyat|motorin|mazot|otogaz|fuel price/.test(p)) return 'fuel';
            if (/hesap\s*makine|calculator|calc\b/.test(p)) return 'calculator';
            if (/yüzde|yuzde|percent/.test(p)) return 'percentage';
            if (/yapılacak|yapilacak|todo|görev|gorev|checklist|liste/.test(p)) return 'todo';
            if (/not\b|defter|notlar/.test(p)) return 'notes';
            if (/sayaç|sayac|counter|tıkla|tikla/.test(p)) return 'counter';
            if (/kronometre|stopwatch|zamanlayıcı|zamanlayici|timer/.test(p)) return 'timer';
            if (/yazı\s*tahta|yazi\s*tahta|whiteboard|karalama/.test(p)) return 'scratch';
            return 'text';
        }

        function buildWidgetHtml(type, prompt) {
            if (type === 'calculator') {
                return `
                <div class="max-w-xs mx-auto">
                    <p class="text-xs text-slate-400 font-semibold mb-3 text-center">Hesap Makinesi</p>
                    <input id="dynCalcDisplay" readonly class="w-full bg-slate-900 text-white text-right text-2xl font-black rounded-2xl p-4 mb-3 outline-none" value="0">
                    <div class="grid grid-cols-4 gap-2" id="dynCalcKeys">
                        ${['C','÷','×','⌫','7','8','9','-','4','5','6','+','1','2','3','=','.','0','00','%'].map(k =>
                            `<button type="button" data-k="${k}" class="py-3 rounded-xl font-bold text-sm ${k==='='?'bg-indigo-600 text-white':'bg-slate-100 text-slate-800 hover:bg-slate-200'} transition">${k}</button>`
                        ).join('')}
                    </div>
                </div>`;
            }
            if (type === 'fuel') {
                return `
                <div class="max-w-2xl mx-auto space-y-4">
                    <div class="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p class="text-xs text-slate-400 font-semibold uppercase tracking-wider">Güncel Akaryakıt</p>
                            <p class="text-lg font-black text-slate-900">Opet pompa fiyatları</p>
                        </div>
                        <div class="flex gap-2 items-center">
                            <select id="dynFuelCity" class="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none">
                                <option value="34">İstanbul (34)</option>
                                <option value="06">Ankara (06)</option>
                                <option value="35">İzmir (35)</option>
                                <option value="16">Bursa (16)</option>
                                <option value="07">Antalya (07)</option>
                                <option value="01">Adana (01)</option>
                                <option value="41">Kocaeli (41)</option>
                                <option value="27">Gaziantep (27)</option>
                            </select>
                            <button type="button" id="dynFuelRefresh" class="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-indigo-700">Yenile</button>
                        </div>
                    </div>
                    <p id="dynFuelStatus" class="text-xs text-slate-500 font-semibold">Yükleniyor…</p>
                    <p id="dynFuelUpdated" class="text-[11px] text-slate-400"></p>
                    <div class="overflow-x-auto rounded-2xl border border-slate-100">
                        <table class="w-full text-sm text-left">
                            <thead class="bg-slate-50 text-[11px] uppercase text-slate-400 font-black">
                                <tr><th class="px-4 py-3">Ürün</th><th class="px-4 py-3 text-right">Fiyat (TL/lt)</th></tr>
                            </thead>
                            <tbody id="dynFuelBody" class="divide-y divide-slate-100 font-bold text-slate-800"></tbody>
                        </table>
                    </div>
                    <p class="text-[10px] text-slate-400">Kaynak: Opet API. Fiyatlar istasyona göre değişebilir. CORS engeli olursa tarayıcı engellemiş demektir.</p>
                </div>`;
            }
                        if (type === 'percentage') {
                return `
                <div class="max-w-md mx-auto space-y-4">
                    <p class="text-xs text-slate-400 font-semibold">Yüzde Hesaplama</p>
                    <input type="number" id="dynPercA" placeholder="A sayısı" class="w-full bg-slate-50 rounded-xl p-3 font-bold outline-none ring-1 ring-slate-200">
                    <input type="number" id="dynPercB" placeholder="B (yüzde veya sayı)" class="w-full bg-slate-50 rounded-xl p-3 font-bold outline-none ring-1 ring-slate-200">
                    <button type="button" id="dynPercBtn" class="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold">A'nın %B'si</button>
                    <p id="dynPercOut" class="text-2xl font-black text-indigo-600 text-center">—</p>
                </div>`;
            }
            if (type === 'todo') {
                return `<div class="max-w-md mx-auto text-center py-6 space-y-2">
                    <p class="text-sm font-black text-slate-800">Görevler Sekmesini Kullanın</p>
                    <button type="button" onclick="switchTab('tasks')" class="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold">Görevler</button>
                </div>`;
            }
            if (type === 'notes') {
                return `
                <div class="max-w-lg mx-auto space-y-3">
                    <p class="text-xs text-slate-400 font-semibold">Hızlı Not</p>
                    <textarea id="dynNoteArea" rows="8" placeholder="Notlarınızı yazın..." class="w-full bg-slate-50 rounded-2xl p-4 font-medium outline-none ring-1 ring-slate-200"></textarea>
                    <button type="button" id="dynNoteSave" class="bg-indigo-600 text-white px-5 py-2 rounded-xl font-bold text-sm">Tarayıcıya Kaydet</button>
                    <p id="dynNoteMsg" class="text-xs text-emerald-600 font-semibold hidden">Kaydedildi</p>
                </div>`;
            }
            if (type === 'counter') {
                return `
                <div class="max-w-xs mx-auto text-center space-y-4">
                    <p class="text-xs text-slate-400 font-semibold">Sayaç</p>
                    <p id="dynCounterVal" class="text-5xl font-black text-indigo-600">0</p>
                    <div class="flex gap-2 justify-center">
                        <button type="button" id="dynCounterMinus" class="w-14 h-14 rounded-2xl bg-slate-100 font-black text-xl">−</button>
                        <button type="button" id="dynCounterReset" class="px-4 h-14 rounded-2xl bg-slate-50 font-bold text-sm">Sıfırla</button>
                        <button type="button" id="dynCounterPlus" class="w-14 h-14 rounded-2xl bg-indigo-600 text-white font-black text-xl">+</button>
                    </div>
                </div>`;
            }
            if (type === 'timer') {
                return `
                <div class="max-w-xs mx-auto text-center space-y-4">
                    <p class="text-xs text-slate-400 font-semibold">Kronometre</p>
                    <p id="dynTimerVal" class="text-4xl font-black text-slate-900 tabular-nums">00:00</p>
                    <div class="flex gap-2 justify-center">
                        <button type="button" id="dynTimerStart" class="px-5 py-2 rounded-xl bg-indigo-600 text-white font-bold text-sm">Başlat</button>
                        <button type="button" id="dynTimerStop" class="px-5 py-2 rounded-xl bg-slate-100 font-bold text-sm">Durdur</button>
                        <button type="button" id="dynTimerReset" class="px-5 py-2 rounded-xl bg-slate-50 font-bold text-sm">Sıfırla</button>
                    </div>
                </div>`;
            }
            if (type === 'scratch') {
                return `
                <div class="max-w-lg mx-auto space-y-2">
                    <p class="text-xs text-slate-400 font-semibold">Yazı alanı</p>
                    <textarea id="dynScratch" rows="10" class="w-full bg-amber-50 rounded-2xl p-4 font-medium outline-none ring-1 ring-amber-100" placeholder="Serbest yazın..."></textarea>
                </div>`;
            }
            // text fallback
            const safe = String(prompt || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `<div class="prose max-w-none"><p class="text-slate-700 font-medium whitespace-pre-wrap leading-relaxed">${safe || 'İçerik yok.'}</p>
                <p class="text-[11px] text-slate-400 mt-6">İpucu: İçeriğe “hesap makinesi”, “yapılacaklar”, “yüzde”, “sayaç”, “kronometre” veya “not” yazarak etkileşimli sayfa oluşturabilirsiniz.</p></div>`;
        }

        function bindWidgetBehaviors(type, tabId) {
            if (type === 'calculator') {
                const display = document.getElementById('dynCalcDisplay');
                const keys = document.getElementById('dynCalcKeys');
                if (!display || !keys) return;
                let expr = '';
                keys.onclick = (e) => {
                    const btn = e.target.closest('button[data-k]');
                    if (!btn) return;
                    const k = btn.getAttribute('data-k');
                    if (k === 'C') { expr = ''; display.value = '0'; return; }
                    if (k === '⌫') { expr = expr.slice(0, -1); display.value = expr || '0'; return; }
                    if (k === '=') {
                        try {
                            const normalized = expr.replace(/÷/g, '/').replace(/×/g, '*').replace(/%/g, '/100');
                            // güvenli basit ifade
                            if (!/^[0-9+\-*/().\s]+$/.test(normalized)) throw new Error('invalid');
                            const val = Function('"use strict"; return (' + normalized + ')')();
                            display.value = String(val);
                            expr = String(val);
                        } catch {
                            display.value = 'Hata';
                            expr = '';
                        }
                        return;
                    }
                    expr += k;
                    display.value = expr;
                };
            }
            if (type === 'fuel') {
                const status = document.getElementById('dynFuelStatus');
                const body = document.getElementById('dynFuelBody');
                const updated = document.getElementById('dynFuelUpdated');
                const citySel = document.getElementById('dynFuelCity');
                const btn = document.getElementById('dynFuelRefresh');
                const load = async () => {
                    const code = (citySel && citySel.value) || '34';
                    if (status) status.textContent = 'Güncel fiyatlar çekiliyor…';
                    if (body) body.innerHTML = '';
                    try {
                        const url = 'https://api.opet.com.tr/api/fuelprices/prices?ProvinceCode=' + encodeURIComponent(code) + '&IncludeAllProducts=true';
                        const res = await fetch(url);
                        if (!res.ok) throw new Error('HTTP ' + res.status);
                        const data = await res.json();
                        const prices = (data[0] && data[0].prices) ? data[0].prices : (Array.isArray(data) ? data : []);
                        if (!prices.length) throw new Error('Veri boş');
                        if (body) {
                            body.innerHTML = prices.map(p => {
                                const name = p.productName || p.name || p.ProductName || 'Ürün';
                                const amount = p.amount != null ? p.amount : (p.price != null ? p.price : p.Price);
                                const num = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(',', '.'));
                                return '<tr><td class="px-4 py-3">' + String(name).replace(/</g,'') + '</td><td class="px-4 py-3 text-right text-indigo-600">' + (isNaN(num) ? amount : num.toLocaleString('tr-TR', {minimumFractionDigits:2, maximumFractionDigits:2})) + '</td></tr>';
                            }).join('');
                        }
                        if (status) status.textContent = 'Güncel';
                        if (updated) updated.textContent = 'Son çekim: ' + new Date().toLocaleString('tr-TR');
                    } catch (err) {
                        console.error(err);
                        if (status) status.textContent = 'Canlı veri alınamadı: ' + (err.message || err) + '. Tarayıcı veya kaynak engeli olabilir.';
                        if (body) body.innerHTML = '<tr><td colspan="2" class="px-4 py-6 text-center text-slate-400 font-medium">Opet API bu ortamdan açılamadı. VPN/ağ veya CORS nedeniyle engellenmiş olabilir.<br>Yine de şehir değiştirip Yenile deneyin.</td></tr>';
                    }
                };
                if (btn) btn.onclick = load;
                if (citySel) citySel.onchange = load;
                load();
            }
                        if (type === 'percentage') {
                const btn = document.getElementById('dynPercBtn');
                if (!btn) return;
                btn.onclick = () => {
                    const a = parseFloat(document.getElementById('dynPercA').value);
                    const b = parseFloat(document.getElementById('dynPercB').value);
                    const out = document.getElementById('dynPercOut');
                    if (isNaN(a) || isNaN(b)) { out.textContent = '—'; return; }
                    out.textContent = ((a * b) / 100).toLocaleString('tr-TR');
                };
            }
            if (type === 'todo') {
                // Widget devre dışı — Görevler sekmesi kullanılıyor
                return;
                const key = 'yuvam_todo_' + tabId;
                const list = document.getElementById('dynTodoList');
                const input = document.getElementById('dynTodoInput');
                const add = document.getElementById('dynTodoAdd');
                let items = [];
                try { items = JSON.parse(localStorage.getItem(key) || '[]'); } catch { items = []; }

                const persist = async () => {
                    localStorage.setItem(key, JSON.stringify(items));
                    try {
                        await db.collection('tabTodos').doc(String(tabId)).set({
                            items: items,
                            updatedAt: new Date().toISOString(),
                            updatedBy: (currentUser && currentUser.name) || ''
                        }, { merge: true });
                    } catch (err) {
                        console.warn('Todo Firebase kayıt hatası:', err);
                    }
                };

                const render = () => {
                    if (!list) return;
                    if (!items.length) {
                        list.innerHTML = '<li class="text-sm text-slate-400 font-medium px-1">Henüz görev yok</li>';
                        return;
                    }
                    list.innerHTML = items.map((it, i) => {
                        const due = it.due ? String(it.due).slice(0, 10) : '';
                        const dueLabel = due
                            ? ('<span class="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg shrink-0">' + escapeHtml(formatDateTR(due)) + '</span>')
                            : '';
                        return '<li class="flex items-center gap-2 bg-slate-50 p-3 rounded-xl">' +
                            '<input type="checkbox" ' + (it.done ? 'checked' : '') + ' data-i="' + i + '" class="dyn-todo-check rounded">' +
                            '<span class="flex-1 text-sm font-bold ' + (it.done ? 'line-through text-slate-400' : 'text-slate-800') + '">' + escapeHtml(it.text) + '</span>' +
                            dueLabel +
                            '<button type="button" data-del="' + i + '" class="text-rose-500 text-xs font-bold">Sil</button>' +
                            '</li>';
                    }).join('');
                };

                // Firebase'den yükle (varsa)
                db.collection('tabTodos').doc(String(tabId)).get().then(doc => {
                    if (doc.exists && doc.data() && Array.isArray(doc.data().items)) {
                        items = doc.data().items;
                        localStorage.setItem(key, JSON.stringify(items));
                    }
                    render();
                }).catch(() => render());

                render();
                if (add) add.onclick = () => {
                    const t = input.value.trim();
                    if (!t) return;
                    const dueEl = document.getElementById('dynTodoDue');
                    const due = dueEl && dueEl.value ? String(dueEl.value).slice(0, 10) : '';
                    items.push({ text: t, done: false, at: new Date().toISOString(), due: due || null });
                    input.value = '';
                    if (dueEl) dueEl.value = '';
                    render();
                    persist();
                    if (typeof refreshAppNotifications === 'function') refreshAppNotifications();
                };
                if (list) list.onclick = (e) => {
                    if (e.target.matches('.dyn-todo-check')) {
                        const i = +e.target.dataset.i;
                        if (items[i]) items[i].done = e.target.checked;
                        render();
                        persist();
                    }
                    if (e.target.dataset.del != null) {
                        items.splice(+e.target.dataset.del, 1);
                        render();
                        persist();
                    }
                };
            }
            if (type === 'notes') {
                const key = 'yuvam_note_' + tabId;
                const area = document.getElementById('dynNoteArea');
                const save = document.getElementById('dynNoteSave');
                if (!area) return;
                area.value = localStorage.getItem(key) || '';
                save.onclick = () => {
                    localStorage.setItem(key, area.value);
                    const msg = document.getElementById('dynNoteMsg');
                    msg.classList.remove('hidden');
                    setTimeout(() => msg.classList.add('hidden'), 1500);
                };
            }
            if (type === 'counter') {
                const key = 'yuvam_cnt_' + tabId;
                let val = parseInt(localStorage.getItem(key) || '0', 10) || 0;
                const el = document.getElementById('dynCounterVal');
                const sync = () => { el.textContent = val; localStorage.setItem(key, String(val)); };
                document.getElementById('dynCounterPlus').onclick = () => { val++; sync(); };
                document.getElementById('dynCounterMinus').onclick = () => { val--; sync(); };
                document.getElementById('dynCounterReset').onclick = () => { val = 0; sync(); };
                sync();
            }
            if (type === 'timer') {
                let sec = 0, timer = null;
                const el = document.getElementById('dynTimerVal');
                const fmt = () => {
                    const m = String(Math.floor(sec / 60)).padStart(2, '0');
                    const s = String(sec % 60).padStart(2, '0');
                    el.textContent = m + ':' + s;
                };
                document.getElementById('dynTimerStart').onclick = () => {
                    if (timer) return;
                    timer = setInterval(() => { sec++; fmt(); }, 1000);
                };
                document.getElementById('dynTimerStop').onclick = () => { clearInterval(timer); timer = null; };
                document.getElementById('dynTimerReset').onclick = () => { clearInterval(timer); timer = null; sec = 0; fmt(); };
                fmt();
            }
        }

        // Kalıcı widget türleri (yenilemede veri kaybolmaz)
        const PERSISTENT_WIDGETS = new Set(['notes', 'counter', 'calculator', 'percentage', 'timer', 'scratch', 'fuel']);


        async function callOpenRouter(userPrompt, systemPrompt, maxTokens) {
            if (!openrouterApiKey) throw new Error('OpenRouter anahtarı yok (Firebase settings/apiKeys → openrouter)');
            const models = [
                'openrouter/free',
                'meta-llama/llama-3.3-70b-instruct:free',
                'openai/gpt-oss-20b:free',
                'meta-llama/llama-3.2-3b-instruct:free',
                'qwen/qwen-2.5-7b-instruct',
                'google/gemma-2-9b-it:free'
            ];
            let lastErr = '';
            for (let i = 0; i < models.length; i++) {
                try {
                    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Authorization': 'Bearer ' + openrouterApiKey,
                            'Content-Type': 'application/json',
                            'HTTP-Referer': (typeof location !== 'undefined' ? location.origin : 'https://yuvam.app'),
                            'X-Title': 'YUVAM'
                        },
                        body: JSON.stringify({
                            model: models[i],
                            messages: [
                                { role: 'system', content: systemPrompt || 'You are a helpful assistant.' },
                                { role: 'user', content: userPrompt }
                            ],
                            temperature: 0.4,
                            max_tokens: maxTokens || 2000
                        })
                    });
                    const data = await res.json();
                    if (!res.ok) {
                        lastErr = String((data && data.error && (data.error.message || data.error)) || ('HTTP ' + res.status));
                        continue;
                    }
                    const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
                    if (text && String(text).trim()) return String(text).trim();
                } catch (e) {
                    lastErr = e.message || String(e);
                }
            }
            throw new Error(lastErr || 'OpenRouter yanıt vermedi');
        }

        function sanitizeAiHtml(html) {
            if (!html) return '';
            let s = String(html);
            // code fences
            s = s.replace(/^```(?:html|HTML)?\s*/i, '').replace(/```\s*$/i, '');
            s = s.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
            s = s.replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '');
            s = s.replace(/<object[\s\S]*?>[\s\S]*?<\/object>/gi, '');
            s = s.replace(/<embed[\s\S]*?>/gi, '');
            s = s.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
            s = s.replace(/javascript:/gi, '');
            // only body fragment if full document
            const bodyMatch = s.match(/<body[^>]*>([\s\S]*)<\/body>/i);
            if (bodyMatch) s = bodyMatch[1];
            return s.trim();
        }

        async function generateTabHtmlWithAI(description, tabLabel) {
            const system = 'Sen bir UI üreticisisin. Sadece HTML parçası döndür (Tailwind CSS class kullanabilirsin). Script, iframe, onclick, javascript: YASAK. Form, tablo, kart, liste, sayaç görseli, not alanı gibi statik/interaktif görünümlü arayüz üret. Türkçe etiket kullan. Markdown ve açıklama yazma, yalnızca HTML.';
            const user = 'Sekme adı: ' + (tabLabel || 'Özel') + '\nİstek: ' + description + '\n\nMobil uyumlu, temiz, modern bir sayfa içeriği HTML olarak üret.';
            const raw = await callOpenRouter(user, system, 2500);
            return sanitizeAiHtml(raw);
        }

        window.renderCustomTabPage = function(tab) {
            const body = document.getElementById('customTabBody');
            const title = document.getElementById('customTabTitle');
            if (!body || !tab) return;
            title.textContent = (tab.emoji || '') + ' ' + (tab.label || '');

            // AI ile üretilmiş HTML
            if (tab.aiHtml && String(tab.aiHtml).trim()) {
                body.innerHTML = sanitizeAiHtml(tab.aiHtml);
                const hint = document.createElement('p');
                hint.className = 'text-[11px] text-slate-400 text-center mt-6 font-medium';
                hint.textContent = tab.content ? ('İstek: "' + tab.content + '"') : 'AI ile oluşturuldu';
                body.appendChild(hint);
                return;
            }

            const detected = detectWidgetType(tab.content || tab.label || '');
            const type = (tab.widgetType && tab.widgetType !== 'ai' && tab.widgetType !== 'text')
                ? tab.widgetType
                : detected;
            body.innerHTML = buildWidgetHtml(type, tab.content);
            if (tab.content && type !== 'text') {
                const hint = document.createElement('p');
                hint.className = 'text-[11px] text-slate-400 text-center mt-6 font-medium';
                hint.textContent = 'İstek: "' + tab.content + '"';
                body.appendChild(hint);
            }
            setTimeout(function() { bindWidgetBehaviors(type, tab.id); }, 0);
        };


        window.toggleTabsPanel = () => {
            const panel = document.getElementById('tabsPanel');
            const icon = document.getElementById('tabsToggleIcon');
            if (!panel) return;
            const opening = panel.classList.contains('hidden');
            panel.classList.toggle('hidden');
            if (icon) icon.style.transform = opening ? 'rotate(180deg)' : 'rotate(0deg)';
            if (opening) renderTabsList();
        };

        window.renderTabsList = () => {
            const container = document.getElementById('tabsList');
            if (!container) return;
            if (!isAdmin()) {
                container.innerHTML = '<p class="text-sm text-slate-400">Sadece admin düzenleyebilir.</p>';
                return;
            }
            container.innerHTML = tabsConfig.map((t, idx) => `
                <div class="bg-slate-50 p-3.5 rounded-xl border border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div class="flex items-center gap-3 flex-1 min-w-0">
                        <span class="text-lg">${escapeHtml(t.emoji || '📌')}</span>
                        <div class="min-w-0">
                            <p class="font-bold text-slate-800 text-sm truncate">${escapeHtml(t.label)}</p>
                            <p class="text-[10px] text-slate-400 font-semibold">${t.core ? 'Sistem sekmesi' : 'Özel sekme'}${t.adminOnly ? ' · Sadece admin' : ''}${t.widgetType ? ' · ' + t.widgetType : ''}</p>
                        </div>
                    </div>
                    <div class="flex flex-wrap gap-1">
                        <button type="button" onclick="toggleTabVisible(${idx})" class="text-[11px] font-bold px-2.5 py-1.5 rounded-lg ${t.visible ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-500'}">${t.visible ? 'Görünür' : 'Gizli'}</button>
                        <button type="button" onclick="editTabMeta(${idx})" class="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:border-indigo-300">Düzenle</button>
                        <button type="button" onclick="moveTabUp(${idx})" class="text-[11px] px-2 py-1.5 rounded-lg bg-white border border-slate-200" ${idx===0?'disabled style="opacity:0.3"':''}>⬆️</button>
                        <button type="button" onclick="moveTabDown(${idx})" class="text-[11px] px-2 py-1.5 rounded-lg bg-white border border-slate-200" ${idx===tabsConfig.length-1?'disabled style="opacity:0.3"':''}>⬇️</button>
                        <button type="button" onclick="removeTab(${idx})" class="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-600">Sil</button>
                    </div>
                </div>
            `).join('') + `
                <button type="button" onclick="restoreDefaultTabs()" class="w-full mt-2 text-xs font-bold text-indigo-600 py-2 hover:underline">Silinen sistem sekmelerini geri yükle</button>
            `;
        };

        window.toggleTabVisible = async (index) => {
            if (!isAdmin()) return;
            tabsConfig[index].visible = !tabsConfig[index].visible;
            await saveTabsConfig();
            applyRoleAndTabs();
            renderTabsList();
        };

        window.editTabMeta = (index) => {
            try {
                if (!isAdmin()) {
                    alert('Sadece admin sekmeleri düzenleyebilir');
                    return;
                }
                const t = tabsConfig[index];
                if (!t) {
                    alert('Sekme bulunamadı');
                    return;
                }
                const modal = document.getElementById('tabEditModal');
                if (!modal) {
                    alert('Düzenleme penceresi yüklenemedi. Ctrl+F5 ile yenileyin.');
                    return;
                }
                const set = (id, val) => {
                    const el = document.getElementById(id);
                    if (el) el.value = val;
                };
                set('editTabIndex', String(index));
                set('editTabEmoji', t.emoji || '📌');
                set('editTabLabel', t.label || '');
                set('editTabContent', t.content || '');
                set('editTabVisibleTo', selectFromVisibility(t));
                const st = document.getElementById('editTabStatus');
                if (st) st.classList.add('hidden');
                modal.classList.remove('hidden');
                modal.classList.add('flex');
            } catch (err) {
                console.error(err);
                alert('Düzenle açılamadı: ' + (err.message || err));
            }
        };

        window.closeTabEditModal = () => {
            const modal = document.getElementById('tabEditModal');
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        };

        window.saveTabEdit = async (e) => {
            e.preventDefault();
            if (!isAdmin()) return;
            const index = parseInt(document.getElementById('editTabIndex').value, 10);
            if (isNaN(index) || !tabsConfig[index]) return;
            const emoji = document.getElementById('editTabEmoji').value.trim() || '📌';
            const label = document.getElementById('editTabLabel').value.trim();
            if (!label) {
                alert('Sekme adı gerekli');
                return;
            }
            const content = document.getElementById('editTabContent').value.trim();
            const vis = visibilityFromSelect(document.getElementById('editTabVisibleTo').value);

            tabsConfig[index].emoji = emoji;
            tabsConfig[index].label = label;
            tabsConfig[index].content = content;
            tabsConfig[index].visibleTo = vis.visibleTo;
            if (!tabsConfig[index].core || (tabsConfig[index].id !== 'settings' && tabsConfig[index].id !== 'trash')) {
                tabsConfig[index].adminOnly = vis.adminOnly;
            }
            if (content) tabsConfig[index].widgetType = detectWidgetType(content);
            else tabsConfig[index].widgetType = tabsConfig[index].widgetType || null;

            await saveTabsConfig();
            applyRoleAndTabs();
            renderTabsList();
            closeTabEditModal();
        };

        window.moveTabUp = async (index) => {
            if (!isAdmin()) {
                showToast('Sekme sırası için admin girişi gerekli', 'error');
                return;
            }
            if (index <= 0) return;
            // Ana sayfa her zaman en üstte kalsın
            if (tabsConfig[index - 1] && tabsConfig[index - 1].id === 'home') return;
            [tabsConfig[index], tabsConfig[index - 1]] = [tabsConfig[index - 1], tabsConfig[index]];
            try {
                await saveTabsConfig();
                applyRoleAndTabs();
                renderTabsList();
                try { if (typeof saveMobileNavOrderFromTabs === 'function') saveMobileNavOrderFromTabs(); } catch (_) {}
                showToast('Sıra güncellendi' + (window.matchMedia && window.matchMedia('(max-width: 640px)').matches ? ' · mobil menü de güncellendi' : ''), 'success');
            } catch (err) {
                showToast(friendlyFirebaseError(err), 'error');
            }
        };

        window.moveTabDown = async (index) => {
            if (!isAdmin()) {
                showToast('Sekme sırası için admin girişi gerekli', 'error');
                return;
            }
            if (index < 0 || index >= tabsConfig.length - 1) return;
            if (tabsConfig[index] && tabsConfig[index].id === 'home') return;
            [tabsConfig[index], tabsConfig[index + 1]] = [tabsConfig[index + 1], tabsConfig[index]];
            try {
                await saveTabsConfig();
                applyRoleAndTabs();
                renderTabsList();
                try { if (typeof saveMobileNavOrderFromTabs === 'function') saveMobileNavOrderFromTabs(); } catch (_) {}
                showToast('Sıra güncellendi' + (window.matchMedia && window.matchMedia('(max-width: 640px)').matches ? ' · mobil menü de güncellendi' : ''), 'success');
            } catch (err) {
                showToast(friendlyFirebaseError(err), 'error');
            }
        };

        window.removeTab = async (index) => {
            if (!isAdmin()) return;
            const t = tabsConfig[index];
            const msg = t.core
                ? `"${t.label}" sistem sekmesi menüden kaldırılacak. Devam?`
                : `"${t.label}" sekmesi silinsin mi?`;
            if (!confirm(msg)) return;
            if (t.core && !removedTabIds.includes(t.id)) {
                removedTabIds.push(t.id);
            }
            // İlgili içerik alanını gizle (sistem)
            if (t.core) {
                const el = document.getElementById('tabContent' + capitalizeTab(t.id));
                if (el) el.classList.add('hidden');
            }
            const removedLabel = t.label;
            tabsConfig.splice(index, 1);
            await saveTabsConfig();
            applyRoleAndTabs();
            renderTabsList();
            logActivity('Sekme', 'Sekme silindi', removedLabel);
        };

        window.restoreDefaultTabs = async () => {
            if (!isAdmin()) return;
            if (!confirm('Silinen tüm sistem sekmeleri geri yüklensin mi?')) return;
            removedTabIds = [];
            // Mevcut özel sekmeleri koru
            const customs = tabsConfig.filter(t => !t.core);
            tabsConfig = DEFAULT_TABS.map(t => ({ ...t, content: '', widgetType: null })).concat(customs);
            await saveTabsConfig();
            applyRoleAndTabs();
            renderTabsList();
        };

        window.addCustomTab = async () => {
            if (!isAdmin()) {
                alert('Sadece admin yeni sekme ekleyebilir');
                return;
            }
            const emoji = (document.getElementById('newTabEmoji').value || '📌').trim();
            const label = (document.getElementById('newTabLabel').value || '').trim();
            const content = (document.getElementById('newTabContent').value || '').trim();
            const vis = visibilityFromSelect(document.getElementById('newTabVisibleTo').value);
            const useAi = !!(document.getElementById('newTabUseAI') && document.getElementById('newTabUseAI').checked);
            const btn = document.getElementById('addTabBtn');
            const status = document.getElementById('newTabAiStatus');
            if (!label) {
                alert('Sekme adı gerekli');
                return;
            }
            const id = 'custom_' + Date.now();
            let widgetType = detectWidgetType(content || label);
            let aiHtml = null;

            if (btn) { btn.disabled = true; btn.textContent = useAi && content ? 'AI üretiyor...' : 'Ekleniyor...'; }
            if (status) {
                status.classList.remove('hidden');
                status.textContent = useAi && content ? 'Yapay zeka sayfa içeriğini oluşturuyor…' : '';
            }

            try {
                // Bilinen widget (todo, hesap makinesi vb.) varsa onu kullan; yoksa ve AI açıksa üret
                const knownWidget = widgetType && widgetType !== 'text';
                if (content && useAi && !knownWidget) {
                    try {
                        aiHtml = await generateTabHtmlWithAI(content, label);
                        if (aiHtml && aiHtml.length > 20) {
                            widgetType = 'ai';
                        } else {
                            aiHtml = null;
                            if (status) status.textContent = 'AI boş döndü, metin sekmesi olarak kaydedildi.';
                        }
                    } catch (aiErr) {
                        console.warn(aiErr);
                        if (status) status.textContent = 'AI kullanılamadı: ' + (aiErr.message || aiErr) + ' — basit sekme kaydedildi.';
                        aiHtml = null;
                    }
                }

                tabsConfig.push({
                    id,
                    emoji: emoji || '📌',
                    label,
                    visible: true,
                    core: false,
                    adminOnly: vis.adminOnly,
                    visibleTo: vis.visibleTo,
                    content,
                    widgetType: widgetType || 'text',
                    aiHtml: aiHtml || null
                });
                document.getElementById('newTabEmoji').value = '';
                document.getElementById('newTabLabel').value = '';
                document.getElementById('newTabContent').value = '';
                await saveTabsConfig();
                applyRoleAndTabs();
                renderTabsList();
                if (status && aiHtml) status.textContent = 'AI içerik eklendi. Sekmeye tıklayarak açın.';
                logActivity('Sekme', 'Özel sekme eklendi', label + (aiHtml ? ' (AI)' : ''));
            } catch (err) {
                alert('Kayıt hatası: ' + (err.message || err));
            }
            if (btn) { btn.disabled = false; btn.textContent = 'Sekme Ekle'; }
            if (status && !status.textContent) status.classList.add('hidden');
        };


        let activityLogUnsub = null;
        let activityLogLoading = false;

        function stopActivityLogListener() {
            if (typeof activityLogUnsub === 'function') {
                try { activityLogUnsub(); } catch (_) {}
            }
            activityLogUnsub = null;
            activityLogLoading = false;
        }

        /** Kullanıcı hareketleri paneli açılınca dinlemeye başla */
        window.ensureActivityLogListener = function() {
            if (!db) return;
            if (activityLogUnsub) return;
            if (activityLogLoading) return;
            activityLogLoading = true;
            const tbody = document.getElementById('activityTableBody');
            if (tbody && !(activityLog || []).length) {
                tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-8 text-center text-slate-400 text-sm">Yükleniyor…</td></tr>';
            }
            const loadActivity = function(snap) {
                activityLog = snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
                activityLog.sort(function(a, b) { return String(b.at || '').localeCompare(String(a.at || '')); });
                activityLogLoading = false;
                const panel = document.getElementById('activityPanel');
                if (panel && !panel.classList.contains('hidden') && typeof renderActivityTable === 'function') {
                    renderActivityTable();
                }
            };
            const onErr = function(err) {
                console.warn('activityLog', err && err.message ? err.message : err);
                activityLogLoading = false;
            };
            try {
                activityLogUnsub = db.collection('activityLog').orderBy('at', 'desc').limit(100).onSnapshot(
                    loadActivity,
                    function(err) {
                        console.warn('activityLog orderBy:', err && err.message ? err.message : err);
                        try {
                            activityLogUnsub = db.collection('activityLog').limit(100).onSnapshot(loadActivity, onErr);
                        } catch (e2) {
                            onErr(e2);
                        }
                    }
                );
            } catch (e) {
                try {
                    activityLogUnsub = db.collection('activityLog').limit(100).onSnapshot(loadActivity, onErr);
                } catch (e2) {
                    onErr(e2);
                }
            }
        };

        window.toggleActivityPanel = function() {
            const panel = document.getElementById('activityPanel');
            const icon = document.getElementById('activityToggleIcon');
            if (!panel) return;
            const opening = panel.classList.contains('hidden');
            panel.classList.toggle('hidden');
            if (icon) icon.style.transform = opening ? 'rotate(180deg)' : 'rotate(0deg)';
            if (opening) {
                ensureActivityLogListener();
                renderActivityTable();
            }
        };

        window.applyActivityFilters = () => {
            activityFilter.user = document.getElementById('activityFilterUser').value;
            activityFilter.action = document.getElementById('activityFilterAction').value;
            activityFilter.start = document.getElementById('activityFilterStart').value;
            activityFilter.end = document.getElementById('activityFilterEnd').value;
            renderActivityTable();
        };

        window.resetActivityFilters = () => {
            activityFilter = { user: 'Tümü', action: 'Tümü', start: '', end: '' };
            document.getElementById('activityFilterUser').value = 'Tümü';
            document.getElementById('activityFilterAction').value = 'Tümü';
            document.getElementById('activityFilterStart').value = '';
            document.getElementById('activityFilterEnd').value = '';
            renderActivityTable();
        };

        window.clearActivityLog = async () => {
            if (!isAdmin()) return;
            if (!confirm('Tüm kullanıcı hareket kayıtları silinsin mi? Bu işlem geri alınamaz.')) return;
            try {
                const snap = await db.collection('activityLog').limit(400).get();
                const batchSize = snap.docs.length;
                for (const d of snap.docs) {
                    await d.ref.delete();
                }
                logActivity('Diğer', 'Aktivite kaydı temizlendi', batchSize + ' kayıt silindi');
                alert('Kayıtlar temizlendi' + (batchSize >= 400 ? ' (ilk 400; gerekirse tekrar çalıştırın)' : ''));
            } catch (err) {
                alert('Temizlenemedi: ' + (err.message || err));
            }
        };

        function formatActivityTime(iso) {
            if (!iso) return '-';
            try {
                return new Date(iso).toLocaleString('tr-TR', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit', second: '2-digit'
                });
            } catch { return iso; }
        }

        window.renderActivityTable = () => {
            const tbody = document.getElementById('activityTableBody');
            const countLabel = document.getElementById('activityCountLabel');
            if (!tbody) return;

            let rows = [...activityLog];
            if (activityFilter.user && activityFilter.user !== 'Tümü') {
                rows = rows.filter(r => r.user === activityFilter.user);
            }
            if (activityFilter.action && activityFilter.action !== 'Tümü') {
                rows = rows.filter(r => r.actionType === activityFilter.action);
            }
            if (activityFilter.start) {
                rows = rows.filter(r => (r.at || '').slice(0, 10) >= activityFilter.start);
            }
            if (activityFilter.end) {
                rows = rows.filter(r => (r.at || '').slice(0, 10) <= activityFilter.end);
            }
            rows.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));

            if (countLabel) countLabel.textContent = rows.length + ' kayıt gösteriliyor';

            if (!rows.length) {
                tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-8 text-center text-slate-400 text-sm">Kayıt yok</td></tr>';
                return;
            }

            const typeColor = {
                'Giriş': 'bg-emerald-50 text-emerald-700',
                'Çıkış': 'bg-slate-100 text-slate-600',
                'Harcama': 'bg-rose-50 text-rose-700',
                'Gelir': 'bg-green-50 text-green-700',
                'Kategori': 'bg-amber-50 text-amber-700',
                'Sekme': 'bg-violet-50 text-violet-700',
                'Not': 'bg-blue-50 text-blue-700',
                'Diğer': 'bg-slate-50 text-slate-600'
            };

            tbody.innerHTML = rows.map(r => `
                <tr class="hover:bg-slate-50/80">
                    <td class="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">${escapeHtml(formatActivityTime(r.at))}</td>
                    <td class="px-4 py-3">
                        <span class="text-[10px] font-black uppercase px-2 py-1 rounded-lg ${r.user === 'Bekir' ? 'bg-blue-50 text-blue-600' : (r.user === 'Duygu' ? 'bg-pink-50 text-pink-600' : 'bg-slate-100 text-slate-500')}">${escapeHtml(r.user || '-')}</span>
                    </td>
                    <td class="px-4 py-3">
                        <span class="text-[10px] font-black uppercase px-2 py-1 rounded-lg ${typeColor[r.actionType] || typeColor['Diğer']}">${escapeHtml(r.actionType || 'Diğer')}</span>
                    </td>
                    <td class="px-4 py-3 text-xs font-bold text-slate-800">${escapeHtml(r.action || '-')}</td>
                    <td class="px-4 py-3 text-xs text-slate-500 max-w-xs truncate" title="${escapeHtml(r.detail || '')}">${escapeHtml(r.detail || '-')}</td>
                </tr>
            `).join('');
        };

        window.toggleCategoryPanel = () => {
            const panel = document.getElementById('categoryPanel');
            const icon = document.getElementById('categoryToggleIcon');
            if (!panel) return;
            const opening = panel.classList.contains('hidden');
            panel.classList.toggle('hidden');
            if (icon) {
                icon.style.transform = opening ? 'rotate(180deg)' : 'rotate(0deg)';
            }
            if (opening) {
                renderCategoriesList();
            }
        };

        window.saveCategoryOrder = async () => {
            try {
                // Tam listeyi yaz (merge ile sadece list alanı güncellenir)
                await db.collection("settings").doc("categories").set({ list: categories }, { merge: true });
            } catch (err) {
                console.error("Kategori kayıt hatası:", err);
                alert("Kategoriler kaydedilemedi: " + (err.message || err) + "\n\nFirebase güvenlik kurallarını kontrol edin (settings koleksiyonuna yazma izni).");
                throw err;
            }
        };


        async function saveCategorySubtypes() {
            // Firebase: settings/categorySubtypes { map: { Kategori: [alt...] } }
            const map = {};
            Object.keys(categorySubtypes || {}).forEach(function(k) {
                if (Array.isArray(categorySubtypes[k]) && categorySubtypes[k].length) {
                    map[k] = categorySubtypes[k].slice();
                }
            });
            await db.collection('settings').doc('categorySubtypes').set({ map: map });
        }

        function getSubtypesForCategory(cat) {
            const c = cat === 'Ulaşım' ? 'Araç' : cat;
            const list = (categorySubtypes && categorySubtypes[c]) || (DEFAULT_CATEGORY_SUBTYPES && DEFAULT_CATEGORY_SUBTYPES[c]) || [];
            return Array.isArray(list) ? list.slice() : [];
        }

        function fillSubtypeSelects() {
            const bill = document.getElementById('billSubtype');
            const veh = document.getElementById('vehicleSubtype');
            const shop = document.getElementById('shopSubtype');
            if (bill) {
                const opts = getSubtypesForCategory('Faturalar');
                const cur = bill.value;
                bill.innerHTML = opts.map(function(o) {
                    return '<option value="' + o.replace(/"/g, '&quot;') + '">' + o + '</option>';
                }).join('') || '<option value="">—</option>';
                if (cur && opts.indexOf(cur) >= 0) bill.value = cur;
            }
            if (veh) {
                const opts = getSubtypesForCategory('Araç');
                const cur = veh.value;
                veh.innerHTML = opts.map(function(o) {
                    return '<option value="' + o.replace(/"/g, '&quot;') + '">' + o + '</option>';
                }).join('') || '<option value="">—</option>';
                if (cur && opts.indexOf(cur) >= 0) veh.value = cur;
            }
            if (shop) {
                const opts = getSubtypesForCategory('Alışveriş');
                const cur = shop.value;
                shop.innerHTML = '<option value="">Seçin…</option>' + opts.map(function(o) {
                    return '<option value="' + o.replace(/"/g, '&quot;') + '">' + o + '</option>';
                }).join('');
                if (cur && opts.indexOf(cur) >= 0) shop.value = cur;
            }
        }

        window.toggleCategorySubtypes = function(index) {
            const el = document.getElementById('catSubPanel_' + index);
            if (el) el.classList.toggle('hidden');
        };

        window.addCategorySubtype = async function(catIndex) {
            const cat = categories[catIndex];
            if (!cat) return;
            const name = prompt('Yeni alt seçenek adı (ör. Elektrik):');
            if (!name || !name.trim()) return;
            const n = name.trim();
            if (!categorySubtypes[cat]) categorySubtypes[cat] = [];
            if (categorySubtypes[cat].indexOf(n) >= 0) {
                alert('Bu alt seçenek zaten var');
                return;
            }
            categorySubtypes[cat].push(n);
            await saveCategorySubtypes();
            fillSubtypeSelects();
            renderCategoriesList();
            logActivity('Kategori', 'Alt seçenek eklendi', cat + ' → ' + n);
        };

        window.renameCategorySubtype = async function(catIndex, subIndex) {
            const cat = categories[catIndex];
            const list = getSubtypesForCategory(cat);
            if (!list[subIndex]) return;
            const old = list[subIndex];
            const name = prompt('Yeni ad:', old);
            if (!name || !name.trim() || name.trim() === old) return;
            const n = name.trim();
            if (!categorySubtypes[cat]) categorySubtypes[cat] = list;
            if (categorySubtypes[cat].indexOf(n) >= 0) {
                alert('Bu ad zaten kullanılıyor');
                return;
            }
            categorySubtypes[cat][subIndex] = n;
            await saveCategorySubtypes();
            fillSubtypeSelects();
            renderCategoriesList();
            logActivity('Kategori', 'Alt seçenek yeniden adlandırıldı', cat + ': ' + old + ' → ' + n);
        };

        window.removeCategorySubtype = async function(catIndex, subIndex) {
            const cat = categories[catIndex];
            const list = getSubtypesForCategory(cat);
            if (!list[subIndex]) return;
            const old = list[subIndex];
            if (!confirm('"' + old + '" alt seçeneği silinsin mi?')) return;
            if (!categorySubtypes[cat]) categorySubtypes[cat] = list;
            categorySubtypes[cat].splice(subIndex, 1);
            if (!categorySubtypes[cat].length) delete categorySubtypes[cat];
            await saveCategorySubtypes();
            fillSubtypeSelects();
            renderCategoriesList();
            logActivity('Kategori', 'Alt seçenek silindi', cat + ' → ' + old);
        };


        // ========== ADMIN PANEL ==========
        window.toggleAdminPanel = function(id) {
            const el = document.getElementById('adminPanel_' + id);
            if (el) el.classList.toggle('hidden');
        };

        window.savePasswordChange = async function() {
            if (!isAdmin() && !(currentUser && currentUser.name)) {
                showToast('Giriş gerekli', 'error');
                return;
            }
            const user = (document.getElementById('pwdUser') || {}).value;
            const p1 = (document.getElementById('pwdNew') || {}).value || '';
            const p2 = (document.getElementById('pwdNew2') || {}).value || '';
            if (!user || !p1) { showToast('Kullanıcı ve şifre gerekli', 'error'); return; }
            if (p1 !== p2) { showToast('Şifreler eşleşmiyor', 'error'); return; }
            if (p1.length < 6) { showToast('Firebase şifresi en az 6 karakter olmalı', 'error'); return; }

            // Sadece kendi şifresi Auth üzerinden değiştirilebilir (güvenlik)
            if (!currentUser || currentUser.name !== user) {
                alert(
                    'Başka kullanıcının Firebase şifresi siteden değiştirilemez.\n\n' +
                    'Firebase Console → Authentication → Users → kullanıcıyı seçin → Reset password / şifre değiştir.'
                );
                return;
            }
            const fbUser = auth.currentUser;
            if (!fbUser) {
                showToast('Oturum bulunamadı, tekrar giriş yapın', 'error');
                return;
            }
            try {
                await fbUser.updatePassword(p1);
                document.getElementById('pwdNew').value = '';
                document.getElementById('pwdNew2').value = '';
                showToast('Şifreniz güncellendi. Bir sonraki girişte yeni şifreyi kullanın.', 'success');
                logActivity('Diğer', 'Şifre değiştirildi', user);
            } catch (err) {
                const code = (err && err.code) || '';
                if (code === 'auth/requires-recent-login') {
                    alert('Güvenlik için çıkış yapıp tekrar giriş yaptıktan sonra şifre değiştirin.');
                    return;
                }
                showToast(err.message || String(err), 'error');
            }
        };

        window.savePeriodConfig = async function() {
            if (!isAdmin()) return;
            let startDay = parseInt((document.getElementById('periodStartDay') || {}).value, 10);
            let endDay = parseInt((document.getElementById('periodEndDay') || {}).value, 10);
            if (isNaN(startDay) || isNaN(endDay)) { showToast('Geçerli gün girin', 'error'); return; }
            startDay = Math.min(31, Math.max(1, startDay));
            endDay = Math.min(31, Math.max(1, endDay));
            periodConfig = { startDay: startDay, endDay: endDay };
            try {
                await db.collection('settings').doc('periodConfig').set(periodConfig);
                showToast('Dönem kaydedildi: ' + startDay + '–' + endDay, 'success');
                scheduleRenderApp();
                logActivity('Diğer', 'Ekstre dönemi güncellendi', startDay + '–' + endDay);
            } catch (err) {
                showToast(friendlyFirebaseError(err), 'error');
            }
        };

        function applyPeriodConfigToForm() {
            const s = document.getElementById('periodStartDay');
            const e = document.getElementById('periodEndDay');
            if (s) s.value = (periodConfig && periodConfig.startDay) || 29;
            if (e) e.value = (periodConfig && periodConfig.endDay) || 28;
        }

        function getThemeDeviceKind() {
            try {
                return window.matchMedia('(max-width: 768px)').matches ? 'mobile' : 'desktop';
            } catch (_) {
                return 'desktop';
            }
        }

        function themeStorageKey() {
            const user = (currentUser && currentUser.name) ? currentUser.name : 'guest';
            return 'yuvam_theme_' + user + '_' + getThemeDeviceKind();
        }

        let themePalette = 'ocean';

        window.setThemePalette = function(palette, opts) {
            opts = opts || {};
            const p = (palette === 'warm' || palette === 'forest') ? palette : 'ocean';
            themePalette = p;
            document.documentElement.classList.remove('theme-ocean', 'theme-warm', 'theme-forest');
            document.documentElement.classList.add('theme-' + p);
            try { localStorage.setItem('yuvam_palette', p); } catch (_) {}
            const map = {
                ocean: 'paletteBtnOcean',
                warm: 'paletteBtnWarm',
                forest: 'paletteBtnForest'
            };
            Object.keys(map).forEach(function(k) {
                const el = document.getElementById(map[k]);
                if (!el) return;
                const on = k === p;
                el.className = on
                    ? 'py-3 rounded-xl font-bold text-xs border-2 border-sky-500 bg-sky-50 text-sky-800'
                    : 'py-3 rounded-xl font-bold text-xs border-2 border-transparent bg-slate-50 text-slate-600';
            });
            try {
                const meta = document.querySelector('meta[name="theme-color"]');
                if (meta) {
                    meta.setAttribute('content', p === 'warm' ? '#ea580c' : (p === 'forest' ? '#059669' : '#0284c7'));
                }
            } catch (_) {}
        };

        window.setAppTheme = function(theme, opts) {
            opts = opts || {};
            appTheme = theme === 'dark' ? 'dark' : 'light';
            document.documentElement.classList.toggle('theme-dark', appTheme === 'dark');
            if (!document.documentElement.classList.contains('theme-warm') &&
                !document.documentElement.classList.contains('theme-forest') &&
                !document.documentElement.classList.contains('theme-ocean')) {
                document.documentElement.classList.add('theme-' + (themePalette || 'ocean'));
            }
            try {
                localStorage.setItem(themeStorageKey(), appTheme);
            } catch (_) {}
            const bl = document.getElementById('themeBtnLight');
            const bd = document.getElementById('themeBtnDark');
            const device = getThemeDeviceKind();
            if (bl) {
                bl.className = appTheme === 'light'
                    ? 'flex-1 py-3 rounded-xl font-bold border-2 border-sky-500 bg-sky-50 text-sky-800'
                    : 'flex-1 py-3 rounded-xl font-bold border-2 border-transparent bg-slate-100 text-slate-600';
            }
            if (bd) {
                bd.className = appTheme === 'dark'
                    ? 'flex-1 py-3 rounded-xl font-bold border-2 border-sky-500 bg-sky-50 text-sky-800'
                    : 'flex-1 py-3 rounded-xl font-bold border-2 border-transparent bg-slate-100 text-slate-600';
            }
            const hint = document.getElementById('themeDeviceHint');
            if (hint) {
                const uname = (currentUser && currentUser.name) || 'bu hesap';
                hint.textContent = uname + ' · ' + (device === 'mobile' ? 'mobil' : 'web') + ' · ' + (themePalette || 'ocean');
            }
            if (!opts.skipRemote && currentUser && currentUser.uid && typeof db !== 'undefined') {
                const patch = {};
                if (device === 'mobile') patch.themeMobile = appTheme;
                else patch.themeDesktop = appTheme;
                patch.themePalette = themePalette || 'ocean';
                db.collection('users').doc(currentUser.uid).set(patch, { merge: true }).catch(function() {});
            }
            try {
                const icon = document.getElementById('userThemeBtnIcon');
                if (icon) icon.textContent = (appTheme === 'dark') ? '☀️' : '🌙';
            } catch (_) {}
        };

        function loadThemeFromStorage() {
            try {
                let pal = localStorage.getItem('yuvam_palette');
                if (pal === 'warm' || pal === 'forest' || pal === 'ocean') setThemePalette(pal, { skipRemote: true });
                else setThemePalette('ocean', { skipRemote: true });
                let t = localStorage.getItem(themeStorageKey());
                if (!t) {
                    const legacy = localStorage.getItem('yuvam_theme');
                    if (legacy === 'dark' || legacy === 'light') t = legacy;
                }
                if (t === 'dark' || t === 'light') setAppTheme(t, { skipRemote: true });
                else {
                    appTheme = 'light';
                    document.documentElement.classList.remove('theme-dark');
                }
            } catch (_) {
                setThemePalette('ocean', { skipRemote: true });
            }
        }

        // Ekran boyutu değişince (telefon yatay / masaüstü) o cihazın kaydını yükle
        (function bindThemeMedia() {
            try {
                const mq = window.matchMedia('(max-width: 768px)');
                const onChange = function() { loadThemeFromStorage(); };
                if (mq.addEventListener) mq.addEventListener('change', onChange);
                else if (mq.addListener) mq.addListener(onChange);
            } catch (_) {}
        })();

        window.saveDashboardCards = async function() {
            dashboardCards = {
                total: !!(document.getElementById('cardVis_total') || {}).checked,
                bekir: !!(document.getElementById('cardVis_bekir') || {}).checked,
                duygu: !!(document.getElementById('cardVis_duygu') || {}).checked,
                debt: !!(document.getElementById('cardVis_debt') || {}).checked
            };
            applyDashboardCards();
            try { localStorage.setItem('yuvam_dash_cards', JSON.stringify(dashboardCards)); } catch (_) {}
            if (isAdmin()) {
                try {
                    await db.collection('settings').doc('uiPrefs').set({ dashboardCards: dashboardCards }, { merge: true });
                    showToast('Kart görünürlüğü kaydedildi', 'success');
                } catch (err) {
                    showToast(friendlyFirebaseError(err), 'error');
                }
            }
        };

        function applyDashboardCards() {
            ['total', 'bekir', 'duygu', 'debt'].forEach(function(k) {
                const el = document.querySelector('[data-dash-card="' + k + '"]');
                if (el) el.classList.toggle('hidden', !dashboardCards[k]);
                const cb = document.getElementById('cardVis_' + k);
                if (cb) cb.checked = !!dashboardCards[k];
            });
        }

        function loadDashboardCardsLocal() {
            try {
                const raw = localStorage.getItem('yuvam_dash_cards');
                if (raw) dashboardCards = Object.assign(dashboardCards, JSON.parse(raw));
            } catch (_) {}
            applyDashboardCards();
        }

        function parseCsvLine(line) {
            const out = [];
            let cur = '', inQ = false;
            for (let i = 0; i < line.length; i++) {
                const c = line[i];
                if (inQ) {
                    if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
                    else if (c === '"') inQ = false;
                    else cur += c;
                } else {
                    if (c === '"') inQ = true;
                    else if (c === ';') { out.push(cur); cur = ''; }
                    else cur += c;
                }
            }
            out.push(cur);
            return out;
        }

        window.restoreFromCsvBackup = async function() {
            if (!isAdmin()) { showToast('Sadece admin', 'error'); return; }
            const input = document.getElementById('backupFileInput');
            const status = document.getElementById('backupStatus');
            if (!input || !input.files || !input.files[0]) {
                showToast('CSV dosyası seçin', 'error');
                return;
            }
            const replaceAll = !!(document.getElementById('backupReplaceAll') || {}).checked;
            if (replaceAll && !confirm('TÜM mevcut harcamalar silinip CSV yüklenecek. Emin misiniz?')) return;
            if (!replaceAll && !confirm('CSV satırları mevcut harcamalara EKLANSİN mi?')) return;

            const text = await input.files[0].text();
            const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(function(l) { return l.trim(); });
            if (lines.length < 2) {
                showToast('CSV boş veya geçersiz', 'error');
                return;
            }
            const header = parseCsvLine(lines[0]).map(function(h) { return h.trim().toLowerCase(); });
            const idx = function(name) {
                const i = header.indexOf(name);
                return i;
            };
            // Beklenen: Tip;Tarih;Kişi;Kategori;Ödeme;Açıklama;Tutar;Taksit;Dönem
            const iDate = idx('tarih') >= 0 ? idx('tarih') : 1;
            const iPerson = idx('kişi') >= 0 ? idx('kişi') : (idx('kisi') >= 0 ? idx('kisi') : 2);
            const iCat = idx('kategori') >= 0 ? idx('kategori') : 3;
            const iPay = idx('ödeme') >= 0 ? idx('ödeme') : (idx('odeme') >= 0 ? idx('odeme') : 4);
            const iDesc = idx('açıklama') >= 0 ? idx('açıklama') : (idx('aciklama') >= 0 ? idx('aciklama') : 5);
            const iAmt = idx('tutar') >= 0 ? idx('tutar') : 6;

            const rows = [];
            for (let li = 1; li < lines.length; li++) {
                const cols = parseCsvLine(lines[li]);
                if (cols.length < 5) continue;
                const tip = (cols[0] || '').toLowerCase();
                if (tip && tip.indexOf('harcama') < 0 && tip !== '') continue;
                let amount = String(cols[iAmt] || '0').replace(/\s/g, '').replace(',', '.');
                amount = parseFloat(amount);
                if (!amount || isNaN(amount)) continue;
                const date = String(cols[iDate] || '').slice(0, 10);
                if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
                rows.push({
                    date: date,
                    person: cols[iPerson] || 'Bekir',
                    category: cols[iCat] || 'Diğer',
                    paymentType: cols[iPay] || 'Nakit',
                    description: cols[iDesc] || '',
                    amount: amount,
                    installmentCount: 1,
                    createdAt: new Date().toISOString()
                });
            }
            if (!rows.length) {
                showToast('İçe aktarılacak satır bulunamadı', 'error');
                if (status) status.textContent = '0 satır';
                return;
            }
            if (status) status.textContent = rows.length + ' satır işleniyor…';
            try {
                if (replaceAll) {
                    const snap = await db.collection('expenses').get();
                    const batchSize = 400;
                    let batch = db.batch();
                    let n = 0;
                    for (const d of snap.docs) {
                        batch.delete(d.ref);
                        n++;
                        if (n % batchSize === 0) {
                            await batch.commit();
                            batch = db.batch();
                        }
                    }
                    if (n % batchSize !== 0) await batch.commit();
                }
                let batch = db.batch();
                let n = 0;
                for (const row of rows) {
                    const ref = db.collection('expenses').doc();
                    batch.set(ref, row);
                    n++;
                    if (n % 400 === 0) {
                        await batch.commit();
                        batch = db.batch();
                    }
                }
                if (n % 400 !== 0) await batch.commit();
                if (status) status.textContent = n + ' harcama içe aktarıldı';
                showToast(n + ' harcama yüklendi', 'success');
                logActivity('Diğer', 'CSV geri yükleme', n + ' kayıt');
            } catch (err) {
                console.error(err);
                showToast(friendlyFirebaseError(err), 'error');
                if (status) status.textContent = 'Hata: ' + (err.message || err);
            }
        };


        window.addCategory = async () => {
            const input = document.getElementById('newCategoryInput');
            const newCat = input.value.trim();
            if (!newCat) {
                alert('Kategori adı boş olamaz');
                return;
            }
            if (categories.includes(newCat)) {
                alert('Bu kategori zaten var');
                return;
            }
            categories.push(newCat);
            input.value = '';
            await saveCategoryOrder();
            updateCategorySelects();
            renderCategoriesList();
            logActivity('Kategori', 'Kategori eklendi', newCat);
        };

        window.removeCategory = async (index) => {
            const catName = categories[index];
            if (!confirm(`"${catName}" kategorisini silmek istediğinize emin misiniz?`)) return;
            categories.splice(index, 1);
            if (categorySubtypes && categorySubtypes[catName]) {
                delete categorySubtypes[catName];
                await saveCategorySubtypes();
            }
            await saveCategoryOrder();
            updateCategorySelects();
            renderCategoriesList();
            logActivity('Kategori', 'Kategori silindi', catName);
        };

        window.moveCategoryUp = async (index) => {
            if (index === 0) return;
            [categories[index], categories[index - 1]] = [categories[index - 1], categories[index]];
            await saveCategoryOrder();
            updateCategorySelects();
            renderCategoriesList();
        };

        window.moveCategoryDown = async (index) => {
            if (index === categories.length - 1) return;
            [categories[index], categories[index + 1]] = [categories[index + 1], categories[index]];
            await saveCategoryOrder();
            updateCategorySelects();
            renderCategoriesList();
        };

        window.renderCategoriesList = () => {
            const container = document.getElementById('categoriesList');
            if (!container) return;
            if (!categories || categories.length === 0) {
                container.innerHTML = '<div class="text-center text-slate-400 py-8"><p class="text-sm">Henüz kategori yok. Yukarıdan ekleyebilirsiniz.</p></div>';
                return;
            }
            container.innerHTML = categories.map((cat, idx) => {
                const subs = getSubtypesForCategory(cat);
                const subHtml = subs.map((s, si) =>
                    '<div class="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg bg-white border border-slate-100">' +
                      '<span class="text-xs font-bold text-slate-700 truncate">' + escapeHtml(s) + '</span>' +
                      '<span class="flex gap-0.5 shrink-0">' +
                        '<button type="button" onclick="renameCategorySubtype(' + idx + ',' + si + ')" class="text-[11px] text-slate-400 hover:text-indigo-600 p-1" title="Adı değiştir">✏️</button>' +
                        '<button type="button" onclick="removeCategorySubtype(' + idx + ',' + si + ')" class="text-[11px] text-slate-400 hover:text-rose-600 p-1" title="Sil">🗑️</button>' +
                      '</span>' +
                    '</div>'
                ).join('');
                return (
                    '<div class="bg-slate-50 rounded-xl border border-slate-100 overflow-hidden hover:border-indigo-200 transition">' +
                      '<div class="p-3.5 flex justify-between items-center group">' +
                        '<div class="flex items-center gap-3 flex-1 min-w-0">' +
                          '<span class="w-8 h-8 rounded-lg bg-white border border-slate-100 flex items-center justify-center text-sm shrink-0 shadow-sm">' + (idx + 1) + '</span>' +
                          '<div class="min-w-0">' +
                            '<span class="font-bold text-slate-800 truncate text-sm block">' + escapeHtml(cat) + '</span>' +
                            (subs.length ? '<span class="text-[10px] text-slate-400 font-semibold">' + subs.length + ' alt seçenek</span>' : '<span class="text-[10px] text-slate-300 font-semibold">Alt seçenek yok</span>') +
                          '</div>' +
                        '</div>' +
                        '<div class="flex gap-0.5 shrink-0">' +
                          '<button type="button" onclick="toggleCategorySubtypes(' + idx + ')" class="text-slate-400 hover:text-violet-600 transition p-2 rounded-lg hover:bg-violet-50" title="Alt seçenekler">⋮</button>' +
                          '<button type="button" onclick="renameCategory(' + idx + ')" class="text-slate-400 hover:text-indigo-600 transition p-2 rounded-lg hover:bg-indigo-50" title="Yeniden Adlandır">✏️</button>' +
                          '<button type="button" onclick="moveCategoryUp(' + idx + ')" class="text-slate-400 hover:text-indigo-600 transition p-2 rounded-lg hover:bg-indigo-50" title="Yukarı" ' + (idx === 0 ? 'disabled style="opacity:0.3"' : '') + '>⬆️</button>' +
                          '<button type="button" onclick="moveCategoryDown(' + idx + ')" class="text-slate-400 hover:text-indigo-600 transition p-2 rounded-lg hover:bg-indigo-50" title="Aşağı" ' + (idx === categories.length - 1 ? 'disabled style="opacity:0.3"' : '') + '>⬇️</button>' +
                          '<button type="button" onclick="removeCategory(' + idx + ')" class="text-slate-400 hover:text-rose-600 transition p-2 rounded-lg hover:bg-rose-50" title="Sil">🗑️</button>' +
                        '</div>' +
                      '</div>' +
                      '<div id="catSubPanel_' + idx + '" class="hidden border-t border-slate-100 bg-white/80 px-3.5 py-3 space-y-2">' +
                        '<p class="text-[10px] font-black text-slate-400 uppercase tracking-wider">Alt seçenekler (harcama formunda çıkar)</p>' +
                        (subHtml || '<p class="text-[11px] text-slate-400">Henüz alt seçenek yok</p>') +
                        '<button type="button" onclick="addCategorySubtype(' + idx + ')" class="w-full mt-1 text-xs font-bold text-violet-600 bg-violet-50 hover:bg-violet-100 py-2 rounded-xl transition">+ Alt seçenek ekle</button>' +
                      '</div>' +
                    '</div>'
                );
            }).join('');
        };

        window.renameCategory = async (index) => {
            const oldName = categories[index];
            const name = prompt('Yeni kategori adı:', oldName);
            if (!name || !name.trim() || name.trim() === oldName) return;
            const newName = name.trim();
            if (categories.includes(newName)) {
                alert('Bu kategori adı zaten var');
                return;
            }
            categories[index] = newName;
            if (categorySubtypes && categorySubtypes[oldName]) {
                categorySubtypes[newName] = categorySubtypes[oldName];
                delete categorySubtypes[oldName];
                await saveCategorySubtypes();
            }
            await saveCategoryOrder();
            updateCategorySelects();
            fillSubtypeSelects();
            renderCategoriesList();
            logActivity('Kategori', 'Kategori yeniden adlandırıldı', oldName + ' → ' + newName);
        };

        // IBAN İŞLEMLERİ
        window.copyIban = function(ibanNumber) {
            const text = String(ibanNumber || '').replace(/\s/g, '').toUpperCase();
            if (!text) {
                if (typeof showToast === 'function') showToast('Kopyalanacak IBAN yok', 'error');
                else alert('Kopyalanacak IBAN yok');
                return;
            }
            const done = function() {
                if (typeof showToast === 'function') showToast('IBAN kopyalandı', 'success');
                else alert('IBAN kopyalandı!');
            };
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(done).catch(function() {
                    try {
                        const ta = document.createElement('textarea');
                        ta.value = text;
                        document.body.appendChild(ta);
                        ta.select();
                        document.execCommand('copy');
                        document.body.removeChild(ta);
                        done();
                    } catch (_) {
                        if (typeof showToast === 'function') showToast('Kopyalama başarısız', 'error');
                        else alert('Kopyalama başarısız oldu');
                    }
                });
            } else {
                try {
                    const ta = document.createElement('textarea');
                    ta.value = text;
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                    done();
                } catch (_) {
                    if (typeof showToast === 'function') showToast('Kopyalama başarısız', 'error');
                    else alert('Kopyalama başarısız oldu');
                }
            }
        };

        window.copyIbanById = function(id) {
            const full = (window._ibanSecrets && window._ibanSecrets[id]) || '';
            if (full) {
                copyIban(full);
                return;
            }
            const item = (ibans || []).find(function(i) { return i && i.id === id; });
            if (!item) {
                if (typeof showToast === 'function') showToast('IBAN bulunamadı', 'error');
                return;
            }
            copyIban(typeof getIbanFull === 'function' ? getIbanFull(item) : (item.ibanNumber || ''));
        };

        window.editIban = function(id) {
            const iban = (ibans || []).find(function(i) { return i && i.id === id; });
            if (!iban) return;
            const eid = document.getElementById('editIbanId');
            if (eid) eid.value = id;
            const owner = document.getElementById('ibanOwnerName');
            if (owner) owner.value = iban.ownerName || iban.name || '';
            const num = document.getElementById('ibanNumber');
            if (num) num.value = (typeof getIbanFull === 'function' ? getIbanFull(iban) : (iban.ibanNumber || '')) || '';
            const bank = document.getElementById('ibanBank');
            if (bank) bank.value = iban.bank || iban.bankName || '';
            const modal = document.getElementById('ibanModal');
            if (modal) {
                modal.classList.remove('hidden');
                modal.classList.add('flex');
            }
        };

        // renderIbans yukarıda tanımlı (kişi gruplu)

        // NOT YÖNETIMI
        window.handleNoteSubmit = async (e) => {
            e.preventDefault();
            const id = document.getElementById('editNoteId').value;
            const person = document.getElementById('notePerson').value;
            const content = document.getElementById('noteContent').value;
            const data = { person, content, date: new Date().toISOString() };
            if (id) {
                await db.collection("notes").doc(id).update(data);
            } else {
                await db.collection("notes").add(data);
            }
            document.getElementById('editNoteId').value = '';
            document.getElementById('noteContent').value = '';
            document.getElementById('noteSubmitBtn').innerText = 'Kaydet';
            const nt = document.getElementById('noteFormTitle');
            if (nt) nt.textContent = 'Not Paylaş';
            logActivity('Not', id ? 'Not güncellendi' : 'Not eklendi', person);
        };

        window.deleteNote = async (id) => {
            if (confirm("Notu silmek istediğinize emin misiniz?")) {
                await db.collection("notes").doc(id).delete();
            }
        };

        function formatNoteDateTime(iso) {
            if (!iso) return '';
            try {
                const d = new Date(iso);
                if (isNaN(d.getTime())) return '';
                return d.toLocaleString('tr-TR', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                });
            } catch { return ''; }
        }

        window.renderNotesList = () => {
            const container = document.getElementById('notesContainer');
            if (!container) return;
            const sorted = [...notes].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
            container.innerHTML = sorted.map(n => `
                <div class="bg-white p-6 rounded-3xl card-shadow border border-slate-100 relative">
                    <div class="flex justify-between items-center mb-2 gap-2">
                        <span class="text-xs font-black uppercase tracking-wider px-3 py-1 rounded-full ${n.person === 'Bekir' ? 'bg-blue-50 text-blue-600' : 'bg-pink-50 text-pink-600'}">${escapeHtml(n.person)}</span>
                        <div class="flex gap-2 shrink-0">
                            <button type="button" onclick="editNote('${escapeHtml(n.id)}')" class="text-xs text-sky-600 font-bold">Düzenle</button>
                            <button type="button" onclick="deleteNote('${escapeHtml(n.id)}')" class="text-xs text-rose-500 font-bold">Sil</button>
                        </div>
                    </div>
                    <p class="text-[11px] text-slate-400 font-semibold mb-3">${escapeHtml(formatNoteDateTime(n.date))}</p>
                    <p class="text-sm font-medium text-slate-700 whitespace-pre-wrap">${escapeHtml(n.content)}</p>
                </div>
            `).join('');
        };

        window.editNote = function(id) {
            const n = (notes || []).find(function(x) { return x.id === id; });
            if (!n) return;
            const eid = document.getElementById('editNoteId');
            if (eid) eid.value = id;
            const person = document.getElementById('notePerson');
            if (person) person.value = n.person || 'Bekir';
            const content = document.getElementById('noteContent');
            if (content) content.value = n.content || '';
            const btn = document.getElementById('noteSubmitBtn');
            if (btn) btn.innerText = 'Güncelle';
            const title = document.getElementById('noteFormTitle');
            if (title) title.textContent = 'Notu düzenle';
            if (content) {
                content.focus();
                try { content.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
            }
        };

        // HESAPLAMA TAB

        // Filtreler & Sıralama
        window.toggleFilterPanel = () => document.getElementById('filterPanel').classList.toggle('hidden');
        window.resetFilters = () => {
            currentPersonFilter = 'Tümü'; currentCategoryFilter = 'Tümü'; currentPaymentFilter = 'Tümü';
            currentShopSubtypeFilter = 'Tümü'; currentEcommerceFilter = 'Tümü';
            currentStartDateFilter = ''; currentEndDateFilter = ''; currentShowInstallments = false;
            currentSearchFilter = '';
            document.getElementById('filterPerson').value = 'Tümü';
            document.getElementById('filterCategory').value = 'Tümü';
            document.getElementById('filterPayment').value = 'Tümü';
            const fss = document.getElementById('filterShopSubtype');
            if (fss) fss.value = 'Tümü';
            const fec = document.getElementById('filterEcommerce');
            if (fec) fec.value = 'Tümü';
            const fs = document.getElementById('filterSearch');
            if (fs) fs.value = '';
            document.getElementById('filterStartDate').value = '';
            document.getElementById('filterEndDate').value = '';
            document.getElementById('filterShowInstallments').checked = false;
            renderTable();
        };
        window.applyFilters = () => {
            currentPersonFilter = document.getElementById('filterPerson').value;
            currentCategoryFilter = document.getElementById('filterCategory').value;
            const fse = document.getElementById('filterSearch');
            currentSearchFilter = fse ? fse.value.trim() : '';
            currentPaymentFilter = document.getElementById('filterPayment').value;
            const fss = document.getElementById('filterShopSubtype');
            currentShopSubtypeFilter = fss ? fss.value : 'Tümü';
            const fec = document.getElementById('filterEcommerce');
            currentEcommerceFilter = fec ? fec.value : 'Tümü';
            currentStartDateFilter = document.getElementById('filterStartDate').value;
            currentEndDateFilter = document.getElementById('filterEndDate').value;
            currentShowInstallments = document.getElementById('filterShowInstallments').checked;
            renderTable();
        };
        window.sortTable = (col) => {
            if (sortColumn === col) sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            else { sortColumn = col; sortDirection = (col === 'date' || col === 'amount') ? 'desc' : 'asc'; }
            renderTable();
        };

        window.openInstallmentsModal = () => {
            const modal = document.getElementById('installmentsModal');
            if (!modal) {
                alert('Taksit penceresi yüklenemedi. Ctrl+F5 ile yenileyin.');
                return;
            }
            const processed = getProcessedExpenses().filter(e => e.installmentLabel !== 'Peşin');
            const total = processed.reduce((s, e) => s + e.displayAmount, 0);
            const totalEl = document.getElementById('totalInstallmentAmount');
            if (totalEl) totalEl.innerText = total.toLocaleString('tr-TR') + ' TL';
            
            const currentPeriod = getCurrentPeriod();
            const currentTotal = processed.filter(e => e.effectiveMonth === currentPeriod).reduce((s, e) => s + e.displayAmount, 0);
            const selEl = document.getElementById('selectedMonthAmount');
            if (selEl) selEl.innerText = currentTotal.toLocaleString('tr-TR') + ' TL';

            const container = document.getElementById('installmentsContainer');
            if (!container) return;
            const grouped = {};
            processed.forEach(e => {
                grouped[e.effectiveMonth] = grouped[e.effectiveMonth] || [];
                grouped[e.effectiveMonth].push(e);
            });

            container.innerHTML = Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0])).map(([m, items]) => `
                <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                    <div class="flex justify-between items-center mb-2">
                        <span class="font-black text-slate-700">${formatPeriodLabel(m)} <span class="text-[10px] text-slate-400 font-bold">(${m})</span></span>
                        <span class="font-bold text-indigo-600">${items.reduce((s, i) => s + i.displayAmount, 0).toLocaleString('tr-TR')} TL</span>
                    </div>
                    <div class="space-y-1">
                        ${items.map(i => `<div class="flex justify-between text-xs text-slate-500"><span>${escapeHtml(i.description)} (${escapeHtml(i.person)})</span><span>${i.displayAmount.toLocaleString('tr-TR')} TL</span></div>`).join('')}
                    </div>
                </div>
            `).join('');

            document.getElementById('installmentsModal').classList.remove('hidden');
            document.getElementById('installmentsModal').classList.add('flex');
        };
        window.closeInstallmentsModal = () => {
            document.getElementById('installmentsModal').classList.add('hidden');
            document.getElementById('installmentsModal').classList.remove('flex');
        };

        function buildExpenseCsvRows(items) {
            const rows = [];
            rows.push([
                'Tip', 'Tarih', 'Kişi', 'Kategori', 'Alışveriş Türü', 'E-ticaret',
                'Ödeme', 'Açıklama', 'Tutar', 'Taksit', 'Dönem',
                'Fatura Türü', 'Yakıt KM', 'Litre', 'LT Fiyat'
            ]);
            (items || []).forEach(function(e) {
                if (!e) return;
                let cat = e.category || '';
                if (typeof isLegacyShopCategory === 'function' && isLegacyShopCategory(cat)) cat = 'Alışveriş';
                const shopSub = e.shopSubtype || '';
                const ecom = e.isEcommerce ? 'Evet' : 'Hayır';
                const amt = e.displayAmount != null ? e.displayAmount : (e.amount || 0);
                rows.push([
                    'Harcama',
                    e.date || '',
                    e.person || '',
                    cat,
                    shopSub,
                    ecom,
                    e.paymentType || '',
                    e.description || '',
                    String(amt).replace('.', ','),
                    e.installmentLabel || '',
                    e.effectiveMonth || '',
                    e.billSubtype || '',
                    e.fuelKm != null ? e.fuelKm : (e.km != null ? e.km : ''),
                    e.fuelLiters != null ? e.fuelLiters : (e.liters != null ? e.liters : ''),
                    e.fuelPricePerLiter != null ? e.fuelPricePerLiter : (e.literPrice != null ? e.literPrice : '')
                ]);
            });
            return rows;
        }

        function downloadCsvRows(rows, filenamePrefix, toastMsg) {
            const escapeCsv = function(v) {
                const s = String(v == null ? '' : v);
                if (/[;"\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
                return s;
            };
            const csv = '\uFEFF' + rows.map(function(r) { return r.map(escapeCsv).join(';'); }).join('\r\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const d = new Date();
            const stamp = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
            a.href = url;
            a.download = (filenamePrefix || 'yuvam-yedek') + '-' + stamp + '.csv';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            if (typeof showToast === 'function') showToast(toastMsg || 'Yedek indirildi (CSV)', 'success');
            try {
                if (typeof logActivity === 'function') logActivity('Diğer', 'CSV yedek indirildi', (rows.length - 1) + ' satır');
            } catch (_) {}
        }

        /**
         * İşlem geçmişi filtreleri.
         * opts.skipDates: true → başlangıç/bitiş tarihi uygulanmaz (Bu dönem indirmesi için)
         */
        function applyHistoryFiltersToList(list, opts) {
            opts = opts || {};
            let out = (list || []).slice();
            try {
                const person = (typeof currentPersonFilter !== 'undefined') ? currentPersonFilter : 'Tümü';
                const cat = (typeof currentCategoryFilter !== 'undefined') ? currentCategoryFilter : 'Tümü';
                const pay = (typeof currentPaymentFilter !== 'undefined') ? currentPaymentFilter : 'Tümü';
                const shop = (typeof currentShopSubtypeFilter !== 'undefined') ? currentShopSubtypeFilter : 'Tümü';
                const ecom = (typeof currentEcommerceFilter !== 'undefined') ? currentEcommerceFilter : 'Tümü';
                const search = (typeof currentSearchFilter !== 'undefined') ? String(currentSearchFilter || '').trim().toLowerCase() : '';
                const startD = opts.skipDates ? '' : ((typeof currentStartDateFilter !== 'undefined') ? currentStartDateFilter : '');
                const endD = opts.skipDates ? '' : ((typeof currentEndDateFilter !== 'undefined') ? currentEndDateFilter : '');

                out = out.filter(function(e) {
                    if (person && person !== 'Tümü' && e.person !== person) return false;
                    if (cat && cat !== 'Tümü') {
                        let c = e.category || '';
                        if (typeof isLegacyShopCategory === 'function' && isLegacyShopCategory(c)) c = 'Alışveriş';
                        if (cat === 'E-ticaret') {
                            if (!e.isEcommerce) return false;
                        } else if (c !== cat && !(cat === 'Alışveriş' && (c === 'Alışveriş' || e.isEcommerce))) {
                            return false;
                        }
                    }
                    if (pay && pay !== 'Tümü' && e.paymentType !== pay) return false;
                    if (shop && shop !== 'Tümü') {
                        const st = String(e.shopSubtype || '').trim();
                        if (shop === '__empty__') {
                            if (st) return false;
                        } else if (st !== shop) return false;
                    }
                    if (ecom && ecom !== 'Tümü') {
                        if (ecom === 'Evet' && !e.isEcommerce) return false;
                        if (ecom === 'Hayır' && e.isEcommerce) return false;
                    }
                    if (startD && String(e.date || '') < startD) return false;
                    if (endD && String(e.date || '') > endD) return false;
                    if (search) {
                        const blob = [e.category, e.description, e.person, e.paymentType, e.shopSubtype, e.billSubtype]
                            .map(function(x) { return String(x || '').toLowerCase(); }).join(' ');
                        if (blob.indexOf(search) < 0) return false;
                    }
                    return true;
                });
            } catch (err) {
                console.warn('applyHistoryFiltersToList', err);
            }
            return out;
        }

        window.downloadExcel = function() {
            try {
                let processed = (typeof getProcessedExpenses === 'function') ? getProcessedExpenses() : (expenses || []);
                if (!processed || !processed.length) {
                    processed = (typeof expenses !== 'undefined' && expenses) ? expenses.slice() : [];
                }
                // Tüm yedekte aktif filtreler (alışveriş türü + e-ticaret dahil) uygulanır
                processed = applyHistoryFiltersToList(processed, { skipDates: false });
                const rows = buildExpenseCsvRows(processed);
                if (rows.length <= 1) {
                    if (typeof showToast === 'function') showToast('İndirilecek kayıt yok (filtreleri kontrol edin)', 'error');
                    return;
                }
                downloadCsvRows(rows, 'yuvam-yedek', 'Yedek indirildi · ' + (rows.length - 1) + ' satır (Alışveriş türü + E-ticaret sütunları var)');
            } catch (err) {
                console.error(err);
                if (typeof showToast === 'function') showToast('Yedek indirilemedi: ' + (err.message || err), 'error');
                else alert('Yedek indirilemedi: ' + (err.message || err));
            }
        };

        window.downloadPeriodExcel = function() {
            try {
                const period = (typeof getCurrentPeriod === 'function') ? getCurrentPeriod() : '';
                if (!period) {
                    if (typeof showToast === 'function') showToast('Aktif dönem hesaplanamadı', 'error');
                    else alert('Aktif dönem hesaplanamadı');
                    return;
                }
                let processed = (typeof getProcessedExpenses === 'function') ? getProcessedExpenses() : [];
                if (!processed || !processed.length) {
                    // yedek yol: ham expenses + period key
                    const raw = (typeof expenses !== 'undefined' && expenses) ? expenses : [];
                    processed = raw.map(function(item) {
                        const pk = (typeof getPeriodKeyForDateStr === 'function')
                            ? getPeriodKeyForDateStr(item.date)
                            : String(item.date || '').slice(0, 7);
                        return Object.assign({}, item, {
                            effectiveMonth: item.effectiveMonth || pk,
                            displayAmount: item.displayAmount != null ? item.displayAmount : item.amount
                        });
                    });
                }
                // Sadece bu dönem (tarih aralığı filtresi YOK — yoksa buton boş döner)
                let periodItems = processed.filter(function(e) {
                    if (!e) return false;
                    const em = e.effectiveMonth || (typeof getPeriodKeyForDateStr === 'function' ? getPeriodKeyForDateStr(e.date) : '');
                    return em === period;
                });
                // Alışveriş türü / e-ticaret / kişi vb. filtreler uygulanır; tarih aralığı atlanır
                periodItems = applyHistoryFiltersToList(periodItems, { skipDates: true });
                if (!periodItems.length) {
                    if (typeof showToast === 'function') showToast('Bu dönemde kayıt yok (veya filtreler hepsini eledi). Filtreleri Temizle deyip tekrar deneyin.', 'error');
                    else alert('Bu dönemde kayıt yok');
                    return;
                }
                const rows = buildExpenseCsvRows(periodItems);
                const lab = (typeof formatPeriodLabel === 'function') ? formatPeriodLabel(period) : period;
                const safe = String(period).replace(/[^\w\-]+/g, '_');
                downloadCsvRows(rows, 'yuvam-donem-' + safe, 'Bu dönem indirildi · ' + (lab || period) + ' · ' + (rows.length - 1) + ' satır');
            } catch (err) {
                console.error('downloadPeriodExcel', err);
                if (typeof showToast === 'function') showToast('Dönem yedeği indirilemedi: ' + (err.message || err), 'error');
                else alert('Dönem yedeği indirilemedi: ' + (err.message || err));
            }
        };

        window.maybeShowOnboarding = function() {
            try {
                if (localStorage.getItem('yuvam_onboarded_v1') === '1') return;
            } catch (_) {}
            const modal = document.getElementById('onboardingModal');
            if (!modal) return;
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        };

        window.closeOnboarding = function(permanent) {
            const modal = document.getElementById('onboardingModal');
            if (modal) {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }
            if (permanent) {
                try { localStorage.setItem('yuvam_onboarded_v1', '1'); } catch (_) {}
            }
        };

        window.showHelp = function() {
            try { localStorage.removeItem('yuvam_onboarded_v1'); } catch (_) {}
            maybeShowOnboarding();
        };


        // Sayfa açılışında oturum varsa geri yükle ve veriyi çek
        // Firebase Auth oturum dinleyicisi (sayfa yenilenince de giriş kalır)
        let authBootDone = false;
        // Mobil hizli giris: oturum varsa login'i aninda gizle + iskelet uygulamayi goster
        try {
            if (auth.currentUser) {
                const loginEl = document.getElementById('errorContainer') || document.getElementById('loginScreen');
                const appEl = document.getElementById('appContainer') || document.getElementById('app');
                if (loginEl) { loginEl.classList.add('hidden'); loginEl.style.display = 'none'; }
                if (appEl) { appEl.classList.remove('hidden'); appEl.style.display = ''; }
                // Profili senkron beklemeden hizli yaz
                try {
                    currentUser = loadUserProfileFast(auth.currentUser);
                    const label = document.getElementById('loggedInUserLabel') || document.getElementById('currentUserLabel');
                    if (label && currentUser) {
                        label.textContent = currentUser.role === 'admin' ? (currentUser.name + ' · Admin') : currentUser.name;
                    }
                } catch (_) {}
            }
        } catch (_) {}
        auth.onAuthStateChanged(async function(fbUser) {
            if (authBootDone && !fbUser) return;
            try {
                if (fbUser) {
                    if (currentUser && currentUser.uid === fbUser.uid) return;
                    const profile = await loadUserProfile(fbUser);
                    await enterAppAsUser(profile, { silent: true });
                } else if (!authBootDone) {
                    // ilk yüklemede oturum yok → login ekranı
                    currentUser = null;
                }
            } catch (err) {
                console.warn('onAuthStateChanged', err);
            } finally {
                authBootDone = true;
            }
        });

