        // Firebase Compat (yerel file:// ile çalışır; modül gerekmez)
        if (typeof firebase === 'undefined') {
            alert('Firebase yüklenemedi. İnternet bağlantınızı kontrol edin ve sayfayı yenileyin.');
            throw new Error('Firebase SDK yüklenmedi');
        }
        const firebaseConfig = {
            apiKey: "AIzaSyDFTQa5FV8kKBqICWAg_vst8AnLdIrfBVw",
            authDomain: "harcama-takibi-1c48b.firebaseapp.com",
            projectId: "harcama-takibi-1c48b",
            storageBucket: "harcama-takibi-1c48b.firebasestorage.app",
            messagingSenderId: "1051789650081",
            appId: "1:1051789650081:web:3c7d4bc099eb7b5f0f68e0"
        };

        firebase.initializeApp(firebaseConfig);
        const db = firebase.firestore();

        // --- Genel UI yardımcıları ---
        function showToast(message, type) {
            type = type || 'info';
            let host = document.getElementById('toastHost');
            if (!host) {
                host = document.createElement('div');
                host.id = 'toastHost';
                host.className = 'toast-host';
                document.body.appendChild(host);
            }
            const el = document.createElement('div');
            el.className = 'toast-item toast-' + type;
            el.textContent = message;
            host.appendChild(el);
            setTimeout(() => {
                el.classList.add('toast-out');
                setTimeout(() => el.remove(), 300);
            }, type === 'error' ? 5000 : 3200);
        }

        function friendlyFirebaseError(err) {
            const code = (err && err.code) ? String(err.code) : '';
            const msg = (err && err.message) ? String(err.message) : String(err || 'Bilinmeyen hata');
            if (code.includes('permission-denied') || /permission|insufficient/i.test(msg)) {
                return 'Firebase izin hatası: Bu işlem için güvenlik kurallarında (Rules) yazma/okuma izni yok. Console → Firestore → Rules bölümünü kontrol edin.';
            }
            if (code.includes('unavailable') || /network|offline|Failed to fetch/i.test(msg)) {
                return 'Bağlantı hatası: İnterneti kontrol edip sayfayı yenileyin.';
            }
            if (code.includes('not-found')) {
                return 'Kayıt bulunamadı veya silinmiş olabilir.';
            }
            return 'İşlem başarısız: ' + msg;
        }

        async function withErrorHandling(actionLabel, fn) {
            try {
                return await fn();
            } catch (err) {
                console.error(actionLabel, err);
                const text = friendlyFirebaseError(err);
                showToast((actionLabel ? actionLabel + ': ' : '') + text, 'error');
                throw err;
            }
        }


        // Kullanıcı hesapları: Bekir = admin, Duygu = normal
        // Şifreler kodda tutulmaz. Firestore: settings/appUsers
        // { Bekir: { password: '...', role: 'admin' }, Duygu: { password: '...', role: 'user' } }
        let USERS = {};
        let usersLoaded = false;
        let openrouterApiKey = ''; // Firestore settings/apiKeys.openrouter — koda yazılmaz

        let currentUser = null; // { name, role }
        let onboardingPending = false;


        function visibilityFromSelect(val) {
            if (val === 'Bekir') return { visibleTo: ['Bekir'], adminOnly: false };
            if (val === 'Duygu') return { visibleTo: ['Duygu'], adminOnly: false };
            if (val === 'admin') return { visibleTo: ['Bekir'], adminOnly: true };
            return { visibleTo: ['Bekir', 'Duygu'], adminOnly: false };
        }

        function selectFromVisibility(tab) {
            if (tab.adminOnly) return 'admin';
            const v = tab.visibleTo;
            if (Array.isArray(v) && v.length === 1 && v[0] === 'Bekir') return 'Bekir';
            if (Array.isArray(v) && v.length === 1 && v[0] === 'Duygu') return 'Duygu';
            return 'both';
        }

        const DEFAULT_TABS = [
            { id: 'expense', emoji: '💰', label: 'Bütçe Takip', visible: true, core: true, adminOnly: false },
            { id: 'vehicle', emoji: '🚗', label: 'Araç', visible: true, core: true, adminOnly: false },
            { id: 'stats', emoji: '📊', label: 'İstatistik & Rapor', visible: true, core: true, adminOnly: false },
            { id: 'notes', emoji: '📝', label: 'Notlar', visible: true, core: true, adminOnly: false },
            { id: 'settings', emoji: '⚙️', label: 'Ayarlar', visible: true, core: true, adminOnly: true },
            { id: 'trash', emoji: '🗑️', label: 'Çöp Kutusu', visible: true, core: true, adminOnly: true }
        ];

        let tabsConfig = DEFAULT_TABS.map(t => ({ ...t }));

        window.handlePasswordKeyPress = function(event) {
            if (event.key === 'Enter') checkPassword();
        };

        window.checkPassword = async function() {
            try {
                const userName = document.getElementById('loginUser').value;
                const input = document.getElementById('sifreInput').value;
                if (!userName) {
                    showToast('Lütfen kullanıcı seçin', 'error');
                    return;
                }
                if (!input) {
                    showToast('Şifre girin', 'error');
                    return;
                }
                if (typeof db === 'undefined' || !db) {
                    showToast('Bağlantı yok. İnterneti kontrol edip yenileyin.', 'error');
                    return;
                }
                // Her girişte Firestore'dan güncel kullanıcıları al (şifreler yalnızca sunucuda)
                try {
                    const snap = await db.collection('settings').doc('appUsers').get();
                    if (snap.exists && snap.data()) {
                        const u = snap.data();
                        const next = {};
                        Object.keys(u).forEach(name => {
                            if (u[name] && u[name].password) {
                                next[name] = {
                                    password: String(u[name].password),
                                    role: u[name].role === 'admin' ? 'admin' : 'user'
                                };
                            }
                        });
                        USERS = next;
                        usersLoaded = true;
                    }
                } catch (err) {
                    console.warn('appUsers get:', err);
                    showToast(friendlyFirebaseError(err), 'error');
                    return;
                }
                if (!Object.keys(USERS).length) {
                    alert('Kullanıcı kaydı bulunamadı.\n\nFirebase Console → Firestore → settings koleksiyonu → appUsers dokümanı oluşturun.\n\nAlanlar (map):\nBekir → password, role: admin\nDuygu → password, role: user');
                    return;
                }
                const account = USERS[userName];
                if (!account || input !== account.password) {
                    showToast('Kullanıcı veya şifre hatalı', 'error');
                    return;
                }
                currentUser = { name: userName, role: account.role };
                sessionStorage.setItem('yuvam_user', JSON.stringify(currentUser));
                const loginEl = document.getElementById('errorContainer') || document.getElementById('loginScreen');
                const appEl = document.getElementById('appContainer') || document.getElementById('app');
                if (loginEl) {
                    loginEl.classList.add('hidden');
                    loginEl.style.display = 'none';
                }
                if (appEl) {
                    appEl.classList.remove('hidden');
                    appEl.style.display = '';
                }
                const label = document.getElementById('loggedInUserLabel') || document.getElementById('currentUserLabel');
                if (label) {
                    label.textContent = currentUser.role === 'admin'
                        ? (currentUser.name + ' · Admin')
                        : currentUser.name;
                }
                applyRoleAndTabs();
                try { initRealtimeSync(); } catch (e) { console.error('sync', e); showToast('Veri bağlantısı kurulamadı', 'error'); }
                logActivity('Giriş', 'Oturum açıldı', currentUser.role === 'admin' ? 'Admin girişi' : 'Kullanıcı girişi');
                if (typeof maybeShowOnboarding === 'function') maybeShowOnboarding();
            } catch (err) {
                console.error(err);
                alert('Giriş hatası: ' + (err && err.message ? err.message : err));
            }
        };

        window.logout = function() {
            const name = currentUser ? currentUser.name : 'Sistem';
            logActivity('Çıkış', 'Oturum kapatıldı', name + ' çıkış yaptı', name);
            currentUser = null;
            try { sessionStorage.removeItem('yuvam_user'); } catch (_) {}
            const appEl = document.getElementById('appContainer') || document.getElementById('app');
            const loginEl = document.getElementById('errorContainer') || document.getElementById('loginScreen');
            if (appEl) {
                appEl.classList.add('hidden');
                appEl.style.display = 'none';
            }
            if (loginEl) {
                loginEl.classList.remove('hidden');
                loginEl.style.display = '';
            }
            const sifre = document.getElementById('sifreInput');
            if (sifre) sifre.value = '';
            const lu = document.getElementById('loginUser');
            if (lu) lu.value = '';
            showToast('Çıkış yapıldı', 'info');
        };

        function isAdmin() {
            return currentUser && currentUser.role === 'admin';
        }

        async function logActivity(actionType, action, detail, userOverride) {
            try {
                const entry = {
                    user: userOverride || ((currentUser && currentUser.name) ? currentUser.name : 'Sistem'),
                    role: (currentUser && currentUser.role) ? currentUser.role : '-',
                    actionType: actionType || 'Diğer',
                    action: action || '-',
                    detail: detail || '',
                    at: new Date().toISOString()
                };
                await db.collection('activityLog').add(entry);
            } catch (err) {
                console.warn('Aktivite kaydı yazılamadı:', err);
            }
        }


        function getVisibleTabs() {
            return tabsConfig.filter(t => {
                if (!t.visible) return false;
                if (t.adminOnly && !isAdmin()) return false;
                if (Array.isArray(t.visibleTo) && t.visibleTo.length) {
                    if (!currentUser || !t.visibleTo.includes(currentUser.name)) return false;
                }
                return true;
            });
        }

        function applyRoleAndTabs() {
            const visible = getVisibleTabs();
            if (lastActiveTabId && visible.some(t => t.id === lastActiveTabId)) {
                renderTabBar();
                return;
            }
            renderTabBar();
            if (visible.length) switchTab(visible[0].id);
        }

        let lastActiveTabId = null;

        window.renderTabBar = function() {
            const bar = document.getElementById('tabBar');
            if (!bar) return;
            const visible = getVisibleTabs();
            const activeId = lastActiveTabId && visible.some(t => t.id === lastActiveTabId)
                ? lastActiveTabId
                : (visible[0] && visible[0].id);
            bar.innerHTML = visible.map((t) => {
                const active = t.id === activeId;
                const cls = active
                    ? 'tab-active'
                    : 'text-slate-500 hover:bg-white hover:text-slate-900';
                return `<button type="button" data-tab-id="${escapeHtml(t.id)}" title="${escapeHtml(t.label)}" onclick="switchTab('${escapeHtml(t.id)}')" class="${cls} flex items-center gap-1.5 font-bold rounded-xl transition"><span class="shrink-0">${escapeHtml(t.emoji || '📌')}</span><span class="truncate">${escapeHtml(t.label)}</span></button>`;
            }).join('');
        };

        function capitalizeTab(name) {
            if (!name) return '';
            return name.charAt(0).toUpperCase() + name.slice(1);
        }


        // State ve Değişkenler
        let expenses = [], notes = [], deletedExpenses = [];
        let categories = ["Gıda", "Araç", "Faturalar", "Eğlence", "Sağlık", "Eğitim", "Diğer", "Kredi Kartı Borcu"];
        let categorySubtypes = {
            'Faturalar': ['Elektrik', 'Su', 'Doğalgaz', 'Telefon', 'İnternet', 'Platform'],
            'Araç': ['Yakıt', 'Vergi', 'Bakım']
        };
        const DEFAULT_CATEGORY_SUBTYPES = {
            'Faturalar': ['Elektrik', 'Su', 'Doğalgaz', 'Telefon', 'İnternet', 'Platform'],
            'Araç': ['Yakıt', 'Vergi', 'Bakım']
        };
        let paymentTypes = ["Nakit", "Kredi Kartı"];
        let bekirDebt = { amount: 0, paid: false, dueDate: '' };
        let duyguDebt = { amount: 0, paid: false, dueDate: '' };
        let cardStatements = [];
        let activityLog = [];
        let activityFilter = { user: "Tümü", action: "Tümü", start: "", end: "" };
        let ibans = [];
        
        let sortColumn = 'date', sortDirection = 'desc';
        let currentPersonFilter = 'Tümü', currentCategoryFilter = 'Tümü', currentPaymentFilter = 'Tümü';
        let currentSearchFilter = '';
        let currentStartDateFilter = '', currentEndDateFilter = '';
        let currentShowInstallments = false;

        let expenseChart = null, weeklyTrendChart = null, monthlyTrendChart = null;
        let syncInitialized = false;
        let displayLimit = 10;
        let renderTimeout = null;

        function escapeHtml(str) {
            if (str == null) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function isStatsTabActive() {
            const el = document.getElementById('tabContentStats');
            return el && !el.classList.contains('hidden');
        }

        // ========== 29–28 EKSTRE DÖNEMİ ==========
        // Dönem: ayın 29'undan sonraki ayın 28'ine.
        // periodKey = kapanış ayı (YYYY-MM), örn. 29 Tem–28 Ağu → "2026-08"

        function parseYMD(dateStr) {
            if (!dateStr) return null;
            const parts = String(dateStr).split('-').map(Number);
            if (parts.length < 3 || parts.some(isNaN)) return null;
            return new Date(parts[0], parts[1] - 1, parts[2]);
        }

        function formatYMD(d) {
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }

        function getStatementPeriodForDate(dateInput) {
            const date = dateInput instanceof Date
                ? new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate())
                : parseYMD(dateInput);
            if (!date || isNaN(date.getTime())) return null;

            const year = date.getFullYear();
            const month = date.getMonth();
            const day = date.getDate();

            let startDate, endDate;
            if (day >= 29) {
                startDate = new Date(year, month, 29);
                endDate = new Date(year, month + 1, 28, 23, 59, 59);
            } else {
                startDate = new Date(year, month - 1, 29);
                endDate = new Date(year, month, 28, 23, 59, 59);
            }

            const periodKey = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}`;
            const label = `${String(startDate.getDate()).padStart(2, '0')}.${String(startDate.getMonth() + 1).padStart(2, '0')}.${startDate.getFullYear()} – ${String(endDate.getDate()).padStart(2, '0')}.${String(endDate.getMonth() + 1).padStart(2, '0')}.${endDate.getFullYear()}`;
            return { startDate, endDate, periodKey, label };
        }

        function getCurrentPeriod() {
            return getStatementPeriodForDate(new Date()).periodKey;
        }

        function getCurrentStatementPeriod() {
            return getStatementPeriodForDate(new Date());
        }

        function getPeriodKeyForDateStr(dateStr) {
            const p = getStatementPeriodForDate(dateStr);
            return p ? p.periodKey : (dateStr ? String(dateStr).substring(0, 7) : '');
        }

        function shiftDateByMonths(dateStr, monthsToAdd) {
            const d = parseYMD(dateStr);
            if (!d) return dateStr;
            const day = d.getDate();
            const target = new Date(d.getFullYear(), d.getMonth() + monthsToAdd, 1);
            const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
            target.setDate(Math.min(day, lastDay));
            return formatYMD(target);
        }

        function formatPeriodLabel(periodKey) {
            if (!periodKey) return '-';
            const [y, m] = periodKey.split('-').map(Number);
            const end = new Date(y, m - 1, 28);
            const start = new Date(y, m - 2, 29);
            const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
            return `${String(start.getDate()).padStart(2, '0')} ${months[start.getMonth()]} – ${String(end.getDate()).padStart(2, '0')} ${months[end.getMonth()]} ${end.getFullYear()}`;
        }

        function getPreviousPeriodKeys(count) {
            const current = getCurrentPeriod();
            const [y, m] = current.split('-').map(Number);
            const keys = [];
            for (let i = count - 1; i >= 0; i--) {
                const d = new Date(y, m - 1 - i, 1);
                keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
            }
            return keys;
        }

        function scheduleRenderApp() {
            clearTimeout(renderTimeout);
            renderTimeout = setTimeout(() => {
                renderApp();
                if (isStatsTabActive()) updateStatsPanel();
            }, 80);
        }

        function renderApp() {
            renderBudgetInfo();
            renderTable();
            renderCurrentStatements();
            const vt = document.getElementById('tabContentVehicle');
            if (vt && !vt.classList.contains('hidden') && typeof renderVehicleTab === 'function') {
                renderVehicleTab();
            }
        }

        function loadDeletedExpenses() {
            try {
                const stored = localStorage.getItem('deletedExpenses');
                deletedExpenses = stored ? JSON.parse(stored) : [];
            } catch {
                deletedExpenses = [];
            }
        }

        // Sekme Değiştirme
        window.switchTab = function(tabName) {
            lastActiveTabId = tabName;
            const coreIds = ["expense", "vehicle", "stats", "notes", "settings", "trash"];
            const isCustom = String(tabName).startsWith('custom_');

            // Hide all core contents + custom
            coreIds.forEach(name => {
                const el = document.getElementById(`tabContent${capitalizeTab(name)}`);
                if (el) el.classList.add('hidden');
            });
            const customEl = document.getElementById('tabContentCustom');
            if (customEl) customEl.classList.add('hidden');

            // Update tab button styles
            const bar = document.getElementById('tabBar');
            if (bar) {
                bar.querySelectorAll('button[data-tab-id]').forEach(btn => {
                    const active = btn.getAttribute('data-tab-id') === tabName;
                    btn.classList.toggle('tab-active', active);
                    btn.classList.toggle('text-slate-500', !active);
                    btn.classList.toggle('hover:bg-white', !active);
                    btn.classList.toggle('hover:text-slate-900', !active);
                });
            }

            if (isCustom) {
                const tab = tabsConfig.find(t => t.id === tabName);
                if (customEl) {
                    customEl.classList.remove('hidden');
                    if (tab) renderCustomTabPage(tab);
                }
                return;
            }

            if (tabName === 'reports') {
                switchTab('stats');
                return;
            }
            if (tabName === 'calculator') {
                switchTab('expense');
                return;
            }
            if (tabName === 'settings' && !isAdmin()) {
                switchTab('expense');
                return;
            }
            if (tabName === 'trash' && !isAdmin()) {
                switchTab('expense');
                return;
            }

            const content = document.getElementById(`tabContent${capitalizeTab(tabName)}`);
            if (content) content.classList.remove('hidden');

            if (tabName === 'stats') {
                updateStatsPanel();
                renderMonthlyReports();
                if (typeof renderBillsChart === 'function') renderBillsChart();
                if (typeof renderCardStatements === 'function') {
                    renderCardStatements('bekir');
                    renderCardStatements('duygu');
                }
                if (expenseChart) expenseChart.resize();
            } else if (tabName === 'vehicle') {
                renderVehicleTab();
            } else if (tabName === 'trash') {
                renderTrash();
            } else if (tabName === 'notes') {
                renderIbans();
            } else if (tabName === 'settings') {
                renderCategoriesList();
                renderTabsList();
            }
        };

        // Modal Yönetimi
        window.openExpenseModal = () => {
            const editId = document.getElementById('editId').value;
            if (!editId) {
                resetForm();
            }
            document.getElementById('expenseModal').classList.remove('hidden');
            document.getElementById('expenseModal').classList.add('flex');
        };
        window.closeExpenseModal = () => {
            document.getElementById('expenseModal').classList.add('hidden');
            document.getElementById('expenseModal').classList.remove('flex');
        };
        window.openCardDebtModal = (person) => {
            const currentDebt = person === 'bekir' ? bekirDebt : duyguDebt;
            document.getElementById('cardDebtPerson').value = person;
            document.getElementById('cardDebtModalTitle').innerText = `${person.charAt(0).toUpperCase() + person.slice(1)} Borç Girişi`;
            document.getElementById('cardDebtAmount').value = currentDebt.amount || '';
            document.getElementById('cardDebtModal').classList.remove('hidden');
            document.getElementById('cardDebtModal').classList.add('flex');
        };
        window.closeCardDebtModal = () => document.getElementById('cardDebtModal').classList.add('hidden');

        function resetForm() {
            document.getElementById('editId').value = '';
            document.getElementById('amount').value = '';
            document.getElementById('installmentCount').value = '1';
            document.getElementById('installmentCount').disabled = false;
            const rec = document.getElementById('isRecurring');
            if (rec) rec.checked = false;
            const rmw = document.getElementById('recurringMonthsWrap');
            if (rmw) rmw.classList.add('hidden');
            const rms = document.getElementById('recurringMonths');
            if (rms) rms.value = '12';
            document.getElementById('person').value = 'Bekir';
            document.getElementById('description').value = '';
            document.getElementById('date').valueAsDate = new Date();
            document.getElementById('formTitle').innerText = "Harcama Kaydı";
            const vs = document.getElementById('vehicleSubtype');
            if (vs) vs.value = 'Yakıt';
            ['fuelKm','fuelLiters','fuelPricePerLt'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            if (typeof onCategoryChange === 'function') onCategoryChange();
        }

        function updateCategorySelects() {
            const select = document.getElementById('category');
            const filterSelect = document.getElementById('filterCategory');
            if(select) {
                select.innerHTML = categories.map(c => `<option value="${c}">${c}</option>`).join('');
            }
            if(filterSelect) {
                filterSelect.innerHTML = `<option value="Tümü">Tümü</option>` + categories.map(c => `<option value="${c}">${c}</option>`).join('');
            }
        }

        function updatePaymentSelects() {
            const select = document.getElementById('paymentType');
            const filterSelect = document.getElementById('filterPayment');
            if(select) {
                select.innerHTML = paymentTypes.map(p => `<option value="${p}">${p}</option>`).join('');
            }
            if(filterSelect) {
                filterSelect.innerHTML = `<option value="Tümü">Tümü</option>` + paymentTypes.map(p => `<option value="${p}">${p}</option>`).join('');
            }
        }

        // Realtime Sync (Firebase)
        function initRealtimeSync() {
            if (syncInitialized) return;
            syncInitialized = true;
            loadDeletedExpenses();

            db.collection("expenses").onSnapshot(snap => {
                expenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                scheduleRenderApp();
            });
            db.collection("notes").onSnapshot(snap => {
                notes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                renderNotesList();
            });
            db.collection("settings").doc("bekirDebt").onSnapshot(d => {
                if (d.exists) bekirDebt = d.data();
                renderCardDebtUI('bekir');
                renderBudgetInfo();
            });
            db.collection("settings").doc("duyguDebt").onSnapshot(d => {
                if (d.exists) duyguDebt = d.data();
                renderCardDebtUI('duygu');
                renderBudgetInfo();
            });
            db.collection("settings").doc("categories").onSnapshot(d => {
                if (d.exists && d.data() && Array.isArray(d.data().list)) {
                    categories = d.data().list.map(c => c === 'Ulaşım' ? 'Araç' : c);
                    categories = [...new Set(categories)];
                    if (!categories.includes('Araç')) categories.splice(1, 0, 'Araç');
                }
                updateCategorySelects();
                renderCategoriesList();
            }, err => console.error("Kategori yükleme hatası:", err));
            db.collection("settings").doc("categorySubtypes").onSnapshot(d => {
                if (d.exists && d.data() && d.data().map && typeof d.data().map === 'object') {
                    categorySubtypes = Object.assign({}, DEFAULT_CATEGORY_SUBTYPES, d.data().map);
                } else if (d.exists && d.data()) {
                    // düz map dokümanı
                    const raw = d.data();
                    const map = raw.map || raw;
                    if (map && typeof map === 'object' && !Array.isArray(map)) {
                        categorySubtypes = Object.assign({}, DEFAULT_CATEGORY_SUBTYPES, map);
                    }
                }
                updateCategorySelects();
                if (typeof fillSubtypeSelects === 'function') fillSubtypeSelects();
                renderCategoriesList();
            }, err => console.warn('categorySubtypes:', err));
            db.collection("settings").doc("appUsers").onSnapshot(d => {
                if (d.exists && d.data()) {
                    const u = d.data();
                    const next = {};
                    Object.keys(u).forEach(name => {
                        if (u[name] && u[name].password) {
                            next[name] = {
                                password: String(u[name].password),
                                role: u[name].role === 'admin' ? 'admin' : 'user'
                            };
                        }
                    });
                    USERS = next;
                    usersLoaded = true;
                }
            }, err => console.warn('appUsers:', err));
            db.collection("settings").doc("apiKeys").onSnapshot(d => {
                if (d.exists && d.data()) {
                    const k = d.data();
                    // openrouter öncelikli; eski gemini alanı yok sayılır
                    if (k.openrouter) openrouterApiKey = String(k.openrouter).trim();
                    else if (k.gemini) openrouterApiKey = String(k.gemini).trim(); // yanlışlıkla eski alan
                }
            }, err => console.warn('apiKeys:', err));
            db.collection("settings").doc("tabs").onSnapshot(d => {
                if (d.exists && d.data()) {
                    const data = d.data();
                    removedTabIds = Array.isArray(data.removed) ? data.removed : [];
                    if (Array.isArray(data.list) && data.list.length) {
                        tabsConfig = mergeTabsConfig(data.list, removedTabIds);
                    } else {
                        tabsConfig = mergeTabsConfig([], removedTabIds);
                    }
                } else {
                    removedTabIds = [];
                    tabsConfig = DEFAULT_TABS.map(t => ({ ...t }));
                }
                if (currentUser) applyRoleAndTabs();
                renderTabsList();
            }, err => console.error("Sekme yükleme hatası:", err));
            db.collection("settings").doc("paymentTypes").onSnapshot(d => {
                if (d.exists) paymentTypes = d.data().list;
                updatePaymentSelects();
            });
            db.collection("cardStatements").onSnapshot(snap => {
                cardStatements = snap.docs.map(d => ({ ...d.data(), id: d.id }));
                const statsTab = document.getElementById('tabContentStats');
                if (statsTab && !statsTab.classList.contains('hidden')) {
                    renderCardStatements('bekir');
                    renderCardStatements('duygu');
                }
            }, err => console.error("Cardstatements yüklemesinde hata:", err));
            db.collection("ibans").onSnapshot(snap => {
                ibans = snap.docs.map(d => ({ ...d.data(), id: d.id }));
                renderIbans();
            }, err => console.error("IBAN yüklemesinde hata:", err));

            // Aktivite logu (index yoksa orderBy hata verir → yedek yol)
            const loadActivity = (snap) => {
                activityLog = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                activityLog.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
                const panel = document.getElementById('activityPanel');
                if (panel && !panel.classList.contains('hidden')) renderActivityTable();
            };
            try {
                db.collection("activityLog").orderBy("at", "desc").limit(500).onSnapshot(
                    loadActivity,
                    err => {
                        console.warn("activityLog orderBy:", err.message);
                        db.collection("activityLog").limit(500).onSnapshot(loadActivity, e2 => console.error(e2));
                    }
                );
            } catch (e) {
                db.collection("activityLog").limit(500).onSnapshot(loadActivity, e2 => console.error(e2));
            }

            updateCategorySelects();
            updatePaymentSelects();
            renderCategoriesList();
        }

        // Bütçe Hesaplama
        function renderBudgetInfo() {
            const period = getCurrentPeriod();
            const periodInfo = getCurrentStatementPeriod();

            const processedExpenses = getProcessedExpenses().filter(e => e.effectiveMonth === period);
            const totalSpent = processedExpenses.reduce((sum, e) => sum + e.displayAmount, 0);

            document.getElementById('totalExpense').innerText = totalSpent.toLocaleString('tr-TR', {style:'currency', currency:'TRY'});

            const bekirSum = processedExpenses.filter(e => e.person === 'Bekir').reduce((s, e) => s + e.displayAmount, 0);
            const duyguSum = processedExpenses.filter(e => e.person === 'Duygu').reduce((s, e) => s + e.displayAmount, 0);
            document.getElementById('bekirExpense').innerText = bekirSum.toLocaleString('tr-TR', {style:'currency', currency:'TRY'});
            document.getElementById('duyguExpense').innerText = duyguSum.toLocaleString('tr-TR', {style:'currency', currency:'TRY'});

            const totalActiveDebt = (!bekirDebt.paid ? bekirDebt.amount : 0) + (!duyguDebt.paid ? duyguDebt.amount : 0);
            document.getElementById('totalCardDebtDisplay').innerText = totalActiveDebt.toLocaleString('tr-TR', {style:'currency', currency:'TRY'});

            const badge = document.getElementById('activePeriodBadge');
            if (badge) badge.textContent = `Aktif dönem: ${periodInfo.label}`;
        }

        // Kart Borcu İşlemleri
        window.setCardDebt = (person) => openCardDebtModal(person);
        window.handleCardDebtSubmit = async (e) => {
            e.preventDefault();
            const person = document.getElementById('cardDebtPerson').value;
            const amount = parseFloat(document.getElementById('cardDebtAmount').value);
            if (person === 'bekir') {
                bekirDebt.amount = amount;
                await db.collection("settings").doc("bekirDebt").set(bekirDebt);
            } else {
                duyguDebt.amount = amount;
                await db.collection("settings").doc("duyguDebt").set(duyguDebt);
            }
            closeCardDebtModal();
        };

        async function deleteCardStatementsOnUnpay(key, debt) {
            const ids = new Set();
            if (debt && debt.lastStatementId) ids.add(debt.lastStatementId);

            const list = (cardStatements || []).filter(s => String(s.person || '').toLowerCase() === key);
            // Aynı dönemdeki (lastStatementMonth) kayıtlar
            if (debt && debt.lastStatementMonth) {
                list.filter(s => s.month === debt.lastStatementMonth).forEach(s => { if (s.id) ids.add(s.id); });
            }
            // En son ödeme gününe ait tüm kayıtlar (eski hatadan kalanlar)
            if (list.length) {
                const sorted = list.slice().sort((a, b) =>
                    String(b.createdAt || b.paidDate || b.month || '').localeCompare(String(a.createdAt || a.paidDate || a.month || ''))
                );
                const latest = sorted[0];
                const day = String(latest.paidDate || (latest.createdAt || '')).slice(0, 10);
                sorted.forEach(s => {
                    const d = String(s.paidDate || (s.createdAt || '')).slice(0, 10);
                    if (day && d === day && s.id) ids.add(s.id);
                    // lastStatementId yoksa en azından en yeni tek kaydı sil
                    if (!debt || !debt.lastStatementId) {
                        if (s === latest && s.id) ids.add(s.id);
                    }
                });
            }

            let n = 0;
            for (const id of ids) {
                try {
                    await db.collection('cardStatements').doc(id).delete();
                    n++;
                } catch (e) {
                    console.warn('ekstre silinemedi', id, e);
                }
            }
            return n;
        }

        window.toggleCardDebt = async (person) => {
            const key = person === 'bekir' || person === 'Bekir' ? 'bekir' : 'duygu';
            let debt = key === 'bekir' ? bekirDebt : duyguDebt;
            if (!debt || typeof debt !== 'object') debt = { amount: 0, paid: false, dueDate: '' };

            try {
                if (!debt.paid) {
                    if (!(debt.amount > 0)) {
                        showToast('Önce borç tutarı girin', 'error');
                        return;
                    }
                    if (!confirm((key === 'bekir' ? 'Bekir' : 'Duygu') + ' kart borcu ödendi olarak işaretlensin mi? Ekstre kaydı oluşturulacak.')) return;

                    let statementMonth;
                    if (debt.dueDate) {
                        statementMonth = getPeriodKeyForDateStr(debt.dueDate);
                    } else {
                        statementMonth = getCurrentPeriod();
                    }
                    if (!statementMonth) statementMonth = new Date().toISOString().slice(0, 7);

                    const docId = key + '_' + statementMonth + '_' + Date.now();
                    const statementData = {
                        person: key,
                        month: statementMonth,
                        amount: Number(debt.amount) || 0,
                        dueDate: debt.dueDate || '',
                        paidDate: new Date().toISOString().split('T')[0],
                        status: 'paid',
                        createdAt: new Date().toISOString()
                    };

                    await db.collection('cardStatements').doc(docId).set(statementData);
                    debt.paid = true;
                    debt.lastStatementId = docId;
                    debt.lastStatementMonth = statementMonth;
                    await db.collection('settings').doc(key + 'Debt').set(debt);
                    if (key === 'bekir') bekirDebt = debt; else duyguDebt = debt;
                    showToast('Borç ödendi · ekstre kaydı eklendi', 'success');
                    logActivity('Diğer', 'Kart borcu ödendi', (key === 'bekir' ? 'Bekir' : 'Duygu') + ' · ' + statementData.amount + ' TL · ' + statementMonth);
                } else {
                    if (!confirm((key === 'bekir' ? 'Bekir' : 'Duygu') + ' tekrar borçlu yapılsın mı? İlgili ekstre kaydı silinecek.')) return;
                    const deleted = await deleteCardStatementsOnUnpay(key, debt);
                    debt.paid = false;
                    debt.lastStatementId = null;
                    debt.lastStatementMonth = null;
                    await db.collection('settings').doc(key + 'Debt').set(debt);
                    if (key === 'bekir') bekirDebt = debt; else duyguDebt = debt;
                    showToast(deleted ? ('Borçlu yapıldı · ' + deleted + ' ekstre silindi') : 'Borçlu olarak işaretlendi', 'info');
                    logActivity('Diğer', 'Kart borcu geri alındı', (key === 'bekir' ? 'Bekir' : 'Duygu') + (deleted ? (' · ' + deleted + ' ekstre silindi') : ''));
                }
                renderCardDebtUI(key);
                if (typeof renderCardStatements === 'function') {
                    renderCardStatements('bekir');
                    renderCardStatements('duygu');
                }
                if (typeof renderBudgetInfo === 'function') renderBudgetInfo();
            } catch (err) {
                console.error(err);
                showToast('Kart borcu güncellenemedi: ' + (err.message || err), 'error');
                alert('Kart borcu / ekstre kaydı hatası: ' + (err.message || err));
            }
        };

        /** Borç ödenmemişken kalan hatalı ekstreleri temizle */
        window.cleanupOrphanCardStatements = async function(person) {
            const key = !person ? null : ((person === 'bekir' || person === 'Bekir') ? 'bekir' : 'duygu');
            const keys = key ? [key] : ['bekir', 'duygu'];
            const today = new Date().toISOString().slice(0, 10);
            let total = 0;
            for (const k of keys) {
                const debt = k === 'bekir' ? bekirDebt : duyguDebt;
                if (debt && debt.paid) continue;
                const list = (cardStatements || []).filter(s => String(s.person || '').toLowerCase() === k);
                const ids = new Set();
                if (debt && debt.lastStatementId) ids.add(debt.lastStatementId);
                // Bugün oluşmuş hatalı kayıtlar (önceki bug)
                list.forEach(s => {
                    const d = String(s.paidDate || s.createdAt || '').slice(0, 10);
                    if (d === today && s.id) ids.add(s.id);
                });
                // lastStatementId yoksa en yeni tek kayıt
                if (!ids.size && list.length) {
                    const sorted = list.slice().sort((a, b) =>
                        String(b.createdAt || b.paidDate || '').localeCompare(String(a.createdAt || a.paidDate || ''))
                    );
                    if (sorted[0] && sorted[0].id) ids.add(sorted[0].id);
                }
                for (const id of ids) {
                    try {
                        await db.collection('cardStatements').doc(id).delete();
                        total++;
                    } catch (e) { console.warn(e); }
                }
                if (debt) {
                    debt.lastStatementId = null;
                    debt.lastStatementMonth = null;
                    try { await db.collection('settings').doc(k + 'Debt').set(debt); } catch (_) {}
                }
            }
            renderCardStatements('bekir');
            renderCardStatements('duygu');
            if (total) showToast(total + ' hatalı ekstre silindi', 'success');
            return total;
        };

        window.updateCardDueDate = async (person, date) => {
            let debt = person === 'bekir' ? bekirDebt : duyguDebt;
            debt.dueDate = date;
            await db.collection("settings").doc(person + "Debt").set(debt);
        };

        function renderCardDebtUI(person) {
            const debt = person === 'bekir' ? bekirDebt : duyguDebt;
            document.getElementById(`${person}DebtDisplay`).innerText = (debt.amount || 0).toLocaleString('tr-TR', {style:'currency', currency:'TRY'});
            document.getElementById(`${person}DueDateDisplay`).innerText = debt.dueDate || '-';
            
            const badge = document.getElementById(`${person}DebtStatusBadge`);
            const btn = document.getElementById(`${person}DebtToggleBtn`);
            
            if (debt.paid) {
                badge.innerText = "ÖDENDİ";
                badge.className = "inline-block mt-2 text-[10px] px-2.5 py-1 rounded-full font-bold uppercase bg-emerald-100 text-emerald-700";
                btn.innerText = "Borçlu Yap";
                btn.className = "text-[11px] font-bold px-3 py-2 rounded-xl shadow-sm transition bg-slate-100 text-slate-500";
            } else {
                badge.innerText = "ÖDENMEDİ";
                badge.className = "inline-block mt-2 text-[10px] px-2.5 py-1 rounded-full font-bold uppercase bg-rose-100 text-rose-700";
                btn.innerText = "Ödendi Yap";
                btn.className = "text-[11px] font-bold px-3 py-2 rounded-xl shadow-sm transition bg-rose-600 text-white";
            }
            updateProgressBar(person, debt.dueDate);
        }

        function updateProgressBar(person, dueDateStr) {
            const bar = document.getElementById(`${person}ProgressBar`);
            const percText = document.getElementById(`${person}ProgressPercentage`);
            if (!dueDateStr) {
                bar.style.width = "0%";
                percText.innerText = "0%";
                return;
            }
            const today = new Date();
            const due = new Date(dueDateStr);
            const diff = Math.ceil((due - today) / (1000*60*60*24));
            
            let percentage = 0;
            if (diff <= 0) percentage = 100;
            else if (diff > 30) percentage = 10;
            else percentage = Math.max(10, 100 - (diff * 3));

            bar.style.width = percentage + "%";
            percText.innerText = diff <= 0 ? "Günü Geçti" : diff + " Gün";
            bar.className = `h-full rounded-full transition-all duration-1000 ${diff <= 3 ? 'bg-rose-500' : 'bg-indigo-500'}`;
        }

        // Harcama İşlemleri

        window.onRecurringToggle = function() {
            const chk = document.getElementById('isRecurring');
            const wrap = document.getElementById('recurringMonthsWrap');
            const inst = document.getElementById('installmentCount');
            const on = chk && chk.checked;
            if (wrap) wrap.classList.toggle('hidden', !on);
            if (inst) {
                inst.disabled = !!on;
                if (on) inst.value = '1';
            }
        };

        window.onCategoryChange = function() {
            const cat = document.getElementById('category');
            const wrap = document.getElementById('vehicleSubtypeWrap');
            const billWrap = document.getElementById('billSubtypeWrap');
            if (!cat) return;
            const isVehicle = cat.value === 'Araç' || cat.value === 'Ulaşım';
            const isBill = cat.value === 'Faturalar';
            if (wrap) {
                wrap.classList.toggle('hidden', !isVehicle);
                const sel = document.getElementById('vehicleSubtype');
                if (sel && isVehicle && !sel.value) sel.value = 'Yakıt';
            }
            if (billWrap) {
                billWrap.classList.toggle('hidden', !isBill);
                if (isBill && typeof fillSubtypeSelects === 'function') fillSubtypeSelects();
            }
            if (typeof onVehicleSubtypeChange === 'function') onVehicleSubtypeChange();
        };

        window.onVehicleSubtypeChange = function() {
            const wrap = document.getElementById('fuelDetailWrap');
            const sel = document.getElementById('vehicleSubtype');
            const cat = document.getElementById('category');
            if (!wrap) return;
            const isFuel = cat && (cat.value === 'Araç' || cat.value === 'Ulaşım') && sel && sel.value === 'Yakıt';
            wrap.classList.toggle('hidden', !isFuel);
        };

        let vehicleFuelChart = null, vehicleMaintChart = null, vehicleFuelConsChart = null, vehicleFuelCostChart = null, vehicleFuelLitersChart = null;
        let vehicleSubTab = 'fuel'; // fuel | maint

        window.showVehicleSubTab = function(which) {
            vehicleSubTab = which === 'maint' ? 'maint' : 'fuel';
            const fuelPanel = document.getElementById('vehicleFuelPanel');
            const maintPanel = document.getElementById('vehicleMaintPanel');
            const fuelBtn = document.getElementById('vehicleTabFuelBtn');
            const maintBtn = document.getElementById('vehicleTabMaintBtn');
            if (fuelPanel) fuelPanel.classList.toggle('hidden', vehicleSubTab !== 'fuel');
            if (maintPanel) maintPanel.classList.toggle('hidden', vehicleSubTab !== 'maint');
            if (fuelBtn) {
                fuelBtn.classList.toggle('border-indigo-600', vehicleSubTab === 'fuel');
                fuelBtn.classList.toggle('border-slate-200', vehicleSubTab !== 'fuel');
            }
            if (maintBtn) {
                maintBtn.classList.toggle('border-indigo-600', vehicleSubTab === 'maint');
                maintBtn.classList.toggle('border-slate-200', vehicleSubTab !== 'maint');
            }
            renderVehicleTab();
        };

        function isVehicleExpense(e) {
            const cat = e.category || '';
            return cat === 'Araç' || cat === 'Ulaşım';
        }

        function vehicleKind(e) {
            const t = (e.vehicleSubtype || '').trim();
            if (t === 'Yakıt' || t === 'Yakit') return 'fuel';
            if (t === 'Vergi' || t === 'Bakım' || t === 'Bakim' || t === 'Vergi&Bakım') return 'maint';
            // Eski kayıtlarda subtype yoksa açıklamadan tahmin etme — genel araç
            return 'other';
        }

        window.renderVehicleTab = function() {
            const processed = getProcessedExpenses().filter(isVehicleExpense);
            const fuelItems = processed.filter(e => vehicleKind(e) === 'fuel');
            const maintItems = processed.filter(e => vehicleKind(e) === 'maint' || vehicleKind(e) === 'other');

            const fillList = (elId, items) => {
                const el = document.getElementById(elId);
                if (!el) return;
                if (!items.length) {
                    el.innerHTML = '<p class="text-sm text-slate-400 font-medium py-4 text-center">Kayıt yok</p>';
                    return;
                }
                const total = items.reduce((s, e) => s + (e.displayAmount || 0), 0);
                el.innerHTML = `
                    <p class="text-xs font-bold text-slate-500 mb-3">Toplam: <span class="text-rose-600 font-black">${total.toLocaleString('tr-TR')} TL</span> · ${items.length} kayıt</p>
                    <div class="space-y-2 max-h-64 overflow-y-auto">
                        ${items.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,40).map(e => `
                            <div class="flex justify-between gap-2 bg-slate-50 rounded-xl p-3 border border-slate-100">
                                <div class="min-w-0">
                                    <p class="text-sm font-bold text-slate-800 truncate">${escapeHtml(e.description || '-')}</p>
                                    <p class="text-[11px] text-slate-400 font-semibold">${escapeHtml(e.date||'')} · ${escapeHtml(e.person||'')} · ${escapeHtml(e.vehicleSubtype||'Araç')}</p>
                                    ${e.fuelNote ? '<p class="text-[11px] text-indigo-600 font-bold mt-1">' + escapeHtml(e.fuelNote) + '</p>' : ''}
                                    ${e.fuelKm || e.fuelLiters ? '<p class="text-[10px] text-slate-400 mt-0.5">' +
                                        (e.fuelKm ? escapeHtml(String(e.fuelKm)) + ' km' : '') +
                                        (e.fuelLiters ? ' · ' + escapeHtml(String(e.fuelLiters)) + ' L' : '') +
                                        (e.fuelPricePerLt ? ' · ' + escapeHtml(String(e.fuelPricePerLt)) + ' TL/L' : '') +
                                    '</p>' : ''}
                                </div>
                                <p class="text-sm font-black text-rose-600 shrink-0">${(e.displayAmount||0).toLocaleString('tr-TR')} TL</p>
                            </div>
                        `).join('')}
                    </div>`;
            };
            fillList('vehicleFuelList', fuelItems);
            fillList('vehicleMaintList', maintItems);

            // --- Yakıt özet kartları ---
            const withCons = fuelItems.filter(e => e.fuelKm > 0 && e.fuelLiters > 0);
            const consValues = withCons.map(e => (e.fuelLiters / e.fuelKm) * 100);
            const costValues = withCons.map(e => {
                if (e.fuelPricePerLt > 0) return (e.fuelLiters * e.fuelPricePerLt) / e.fuelKm;
                if (e.displayAmount > 0) return e.displayAmount / e.fuelKm;
                return null;
            }).filter(v => v != null && !isNaN(v));
            const totalFuelTl = fuelItems.reduce((s, e) => s + (e.displayAmount || 0), 0);
            const totalLiters = fuelItems.reduce((s, e) => s + (parseFloat(e.fuelLiters) || 0), 0);
            const totalKm = fuelItems.reduce((s, e) => s + (parseFloat(e.fuelKm) || 0), 0);
            const avgCons = consValues.length ? consValues.reduce((a, b) => a + b, 0) / consValues.length : null;
            const avgCost = costValues.length ? costValues.reduce((a, b) => a + b, 0) / costValues.length : null;

            const setTxt = (id, text) => {
                const el = document.getElementById(id);
                if (el) el.textContent = text;
            };
            setTxt('fuelStatTotal', totalFuelTl.toLocaleString('tr-TR') + ' TL');
            setTxt('fuelStatLiters', totalLiters > 0 ? totalLiters.toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' L' : '—');
            setTxt('fuelStatKm', totalKm > 0 ? totalKm.toLocaleString('tr-TR', { maximumFractionDigits: 0 }) + ' km' : '—');
            setTxt('fuelStatCons', avgCons != null ? avgCons.toFixed(2) + ' L/100km' : '—');
            setTxt('fuelStatCost', avgCost != null ? avgCost.toFixed(2) + ' TL/km' : '—');

            // Aylık yardımcılar
            const monthKeys = [];
            const now = new Date();
            for (let i = 5; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
            }
            const monthLabels = monthKeys.map(k => {
                const [y, m] = k.split('-').map(Number);
                const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
                return months[m - 1] + ' ' + y;
            });
            const monthlySum = (items, field) => monthKeys.map(k =>
                items.filter(e => String(e.date || '').startsWith(k))
                    .reduce((s, e) => s + (field === 'amount' ? (e.displayAmount || 0) : (parseFloat(e[field]) || 0)), 0)
            );

            const fuelSpend = monthlySum(fuelItems, 'amount');
            const fuelLitersM = monthlySum(fuelItems, 'fuelLiters');
            const maintSpend = monthlySum(maintItems.filter(e => vehicleKind(e) === 'maint'), 'amount');

            // Dolum bazlı (tarihe göre) tüketim / maliyet
            const sortedFuel = withCons.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(-12);
            const fillLabels = sortedFuel.map(e => {
                const s = String(e.date || '').slice(0, 10);
                const parts = s.split('-');
                return parts.length === 3 ? (parts[2] + '.' + parts[1]) : s;
            });
            const fillCons = sortedFuel.map(e => +((e.fuelLiters / e.fuelKm) * 100).toFixed(2));
            const fillCost = sortedFuel.map(e => {
                if (e.fuelPricePerLt > 0) return +(((e.fuelLiters * e.fuelPricePerLt) / e.fuelKm).toFixed(2));
                return +((e.displayAmount / e.fuelKm).toFixed(2));
            });

            const mkBar = (canvasId, chartRefName, labels, data, color, label) => {
                const ctx = document.getElementById(canvasId);
                if (!ctx || typeof Chart === 'undefined') return null;
                if (window[chartRefName]) {
                    try { window[chartRefName].destroy(); } catch (_) {}
                }
                // use outer vars
                return new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels,
                        datasets: [{ label, data, backgroundColor: color, borderRadius: 8, maxBarThickness: 36 }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        plugins: { legend: { display: false } },
                        scales: { y: { beginAtZero: true } }
                    }
                });
            };
            const mkLine = (canvasId, labels, data, color, label) => {
                const ctx = document.getElementById(canvasId);
                if (!ctx || typeof Chart === 'undefined') return null;
                return new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels,
                        datasets: [{
                            label,
                            data,
                            borderColor: color,
                            backgroundColor: color + '22',
                            fill: true,
                            tension: 0.3,
                            pointRadius: 4,
                            pointBackgroundColor: color
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        plugins: { legend: { display: true, position: 'bottom' } },
                        scales: { y: { beginAtZero: true } }
                    }
                });
            };

            if (vehicleFuelChart) { try { vehicleFuelChart.destroy(); } catch (_) {} }
            if (vehicleFuelLitersChart) { try { vehicleFuelLitersChart.destroy(); } catch (_) {} }
            if (vehicleFuelConsChart) { try { vehicleFuelConsChart.destroy(); } catch (_) {} }
            if (vehicleFuelCostChart) { try { vehicleFuelCostChart.destroy(); } catch (_) {} }
            if (vehicleMaintChart) { try { vehicleMaintChart.destroy(); } catch (_) {} }

            const ctxF = document.getElementById('vehicleFuelChart');
            if (ctxF) {
                vehicleFuelChart = new Chart(ctxF, {
                    type: 'bar',
                    data: {
                        labels: monthLabels,
                        datasets: [{ label: 'Harcama (TL)', data: fuelSpend, backgroundColor: '#4f46e5', borderRadius: 8, maxBarThickness: 36 }]
                    },
                    options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
                });
            }
            const ctxL = document.getElementById('vehicleFuelLitersChart');
            if (ctxL) {
                vehicleFuelLitersChart = new Chart(ctxL, {
                    type: 'bar',
                    data: {
                        labels: monthLabels,
                        datasets: [{ label: 'Litre', data: fuelLitersM, backgroundColor: '#06b6d4', borderRadius: 8, maxBarThickness: 36 }]
                    },
                    options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
                });
            }
            const ctxC = document.getElementById('vehicleFuelConsChart');
            if (ctxC) {
                vehicleFuelConsChart = new Chart(ctxC, {
                    type: 'line',
                    data: {
                        labels: fillLabels.length ? fillLabels : ['Veri yok'],
                        datasets: [{
                            label: 'L / 100 km',
                            data: fillCons.length ? fillCons : [0],
                            borderColor: '#10b981',
                            backgroundColor: 'rgba(16,185,129,0.12)',
                            fill: true,
                            tension: 0.3,
                            pointRadius: 4,
                            pointBackgroundColor: '#10b981'
                        }]
                    },
                    options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: true, position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
                });
            }
            const ctxK = document.getElementById('vehicleFuelCostChart');
            if (ctxK) {
                vehicleFuelCostChart = new Chart(ctxK, {
                    type: 'line',
                    data: {
                        labels: fillLabels.length ? fillLabels : ['Veri yok'],
                        datasets: [{
                            label: 'TL / km',
                            data: fillCost.length ? fillCost : [0],
                            borderColor: '#f59e0b',
                            backgroundColor: 'rgba(245,158,11,0.12)',
                            fill: true,
                            tension: 0.3,
                            pointRadius: 4,
                            pointBackgroundColor: '#f59e0b'
                        }]
                    },
                    options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: true, position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
                });
            }
            const ctxM = document.getElementById('vehicleMaintChart');
            if (ctxM) {
                vehicleMaintChart = new Chart(ctxM, {
                    type: 'bar',
                    data: {
                        labels: monthLabels,
                        datasets: [{ label: 'Vergi & Bakım (TL)', data: maintSpend, backgroundColor: '#f59e0b', borderRadius: 8, maxBarThickness: 36 }]
                    },
                    options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
                });
            }
        };

        window.handleFormSubmit = async (e) => {
            e.preventDefault();
            const id = document.getElementById('editId').value;
            const amount = parseFloat(document.getElementById('amount').value);
            const isRecurring = !!(document.getElementById('isRecurring') && document.getElementById('isRecurring').checked);
            let installment = parseInt(document.getElementById('installmentCount').value) || 1;
            let amountPerInstallment;
            if (isRecurring) {
                const rm = parseInt((document.getElementById('recurringMonths') || {}).value, 10) || 1;
                installment = Math.min(12, Math.max(1, rm));
                amountPerInstallment = amount; // her ay aynı tutar
            } else {
                amountPerInstallment = amount / installment;
            }
            const person = document.getElementById('person').value;
            const paymentType = document.getElementById('paymentType').value;
            const date = document.getElementById('date').value;
            const description = document.getElementById('description').value || '-';
            const category = document.getElementById('category').value;
            let vehicleSubtype = '';
            let billSubtype = '';
            let fuelKm = null, fuelLiters = null, fuelPricePerLt = null;
            let fuelNote = '';
            if (category === 'Faturalar') {
                const bs = document.getElementById('billSubtype');
                billSubtype = bs ? bs.value : '';
                if (!billSubtype) {
                    alert('Fatura türü seçin: Elektrik, Su, Doğalgaz, Telefon, İnternet veya Platform');
                    return;
                }
            }
            if (category === 'Araç' || category === 'Ulaşım') {
                const vs = document.getElementById('vehicleSubtype');
                vehicleSubtype = vs ? vs.value : '';
                if (!vehicleSubtype) {
                    alert('Araç kategorisi için Yakıt, Vergi veya Bakım seçin');
                    return;
                }
                if (vehicleSubtype === 'Yakıt') {
                    const kmEl = document.getElementById('fuelKm');
                    const ltEl = document.getElementById('fuelLiters');
                    const prEl = document.getElementById('fuelPricePerLt');
                    fuelKm = kmEl && kmEl.value !== '' ? parseFloat(kmEl.value) : null;
                    fuelLiters = ltEl && ltEl.value !== '' ? parseFloat(ltEl.value) : null;
                    fuelPricePerLt = prEl && prEl.value !== '' ? parseFloat(prEl.value) : null;
                    if (fuelKm && fuelKm > 0 && fuelLiters && fuelLiters > 0) {
                        const per100 = (fuelLiters / fuelKm) * 100;
                        let costPerKm = null;
                        if (fuelPricePerLt && fuelPricePerLt > 0) {
                            costPerKm = (fuelLiters * fuelPricePerLt) / fuelKm;
                        } else if (amount && amount > 0) {
                            costPerKm = amount / fuelKm;
                        }
                        fuelNote = '100 km\'de ' + per100.toFixed(2) + ' L';
                        if (costPerKm != null && !isNaN(costPerKm)) {
                            fuelNote += ' · 1 km ' + costPerKm.toFixed(2) + ' TL';
                        }
                    }
                }
            }
            
            if (!amount || amount <= 0) {
                alert('Lütfen geçerli bir tutar giriniz');
                return;
            }
            if (!date) {
                alert('Lütfen tarih seçiniz');
                return;
            }
            
            const data = {
                amount: isRecurring ? amount : amount,
                installmentCount: installment,
                amountPerInstallment: amountPerInstallment,
                isRecurring: !!isRecurring,
                person: person,
                category: category === 'Ulaşım' ? 'Araç' : category,
                paymentType: paymentType,
                date: date,
                description: description,
                expenseMonth: date.substring(0, 7),
                statementPeriod: getPeriodKeyForDateStr(date),
                vehicleSubtype: (category === 'Araç' || category === 'Ulaşım') ? vehicleSubtype : '',
                billSubtype: category === 'Faturalar' ? billSubtype : '',
                fuelKm: fuelKm,
                fuelLiters: fuelLiters,
                fuelPricePerLt: fuelPricePerLt,
                fuelNote: fuelNote || ''
            };
            
            try {
                if (id) {
                    await db.collection("expenses").doc(id).update(data);
                } else {
                    data.createdAt = new Date().toISOString();
                    await db.collection("expenses").add(data);
                }
                
                resetForm();
                closeExpenseModal();
                await new Promise(resolve => setTimeout(resolve, 300));
                renderApp();
                updateStatsPanel();
                logActivity('Harcama', id ? 'Harcama güncellendi' : 'Harcama eklendi',
                    (person || '') + ' · ' + (category || '') + ' · ' + amount + ' TL' + (description && description !== '-' ? ' · ' + description : ''));
            } catch (err) {
                console.error("Harcama kayıt hatası:", err);
                showToast(friendlyFirebaseError(err), 'error');
            }
        };

        window.deleteExpense = async (id) => {
            if (!confirm("Silmek istediğinize emin misiniz?")) return;
            
            let actualId = id;
            if (typeof id === 'string' && id.includes('_ins_')) {
                actualId = id.split('_ins_')[0];
            }
            
            const item = expenses.find(e => e.id === actualId);
            
            if (!item) {
                alert('Harcama bulunamadı');
                return;
            }
            
            deletedExpenses.push({...item, deletedAt: new Date().toISOString()});
            localStorage.setItem('deletedExpenses', JSON.stringify(deletedExpenses));
            await db.collection("expenses").doc(actualId).delete();
            logActivity('Harcama', 'Harcama silindi', (item.person || '') + ' · ' + (item.amount || '') + ' TL · ' + (item.description || ''));
        };

        window.editExpense = (id) => {
            let actualId = id;
            if (typeof id === 'string' && id.includes('_ins_')) {
                actualId = id.split('_ins_')[0];
            }
            
            const e = expenses.find(i => i.id === actualId);
            if (!e) {
                alert('Harcama bulunamadı');
                return;
            }
            
            document.getElementById('editId').value = e.id;
            document.getElementById('amount').value = e.amount;
            const isRec = !!e.isRecurring;
            const recChk = document.getElementById('isRecurring');
            if (recChk) recChk.checked = isRec;
            if (typeof onRecurringToggle === 'function') onRecurringToggle();
            if (isRec) {
                const rms = document.getElementById('recurringMonths');
                if (rms) rms.value = String(Math.min(12, e.installmentCount || 1));
                document.getElementById('installmentCount').value = '1';
            } else {
                document.getElementById('installmentCount').value = e.installmentCount || 1;
            }
            document.getElementById('person').value = e.person;
            const catVal = e.category === 'Ulaşım' ? 'Araç' : e.category;
            document.getElementById('category').value = catVal;
            document.getElementById('paymentType').value = e.paymentType;
            document.getElementById('date').value = e.date;
            document.getElementById('description').value = e.description === '-' ? '' : e.description;
            document.getElementById('formTitle').innerText = "Harcamayı Düzenle";
            if (typeof onCategoryChange === 'function') onCategoryChange();
            const vs = document.getElementById('vehicleSubtype');
            if (vs && e.vehicleSubtype) vs.value = e.vehicleSubtype;
            const bs = document.getElementById('billSubtype');
            if (bs && e.billSubtype) bs.value = e.billSubtype;
            if (typeof onVehicleSubtypeChange === 'function') onVehicleSubtypeChange();
            const fk = document.getElementById('fuelKm');
            const fl = document.getElementById('fuelLiters');
            const fp = document.getElementById('fuelPricePerLt');
            if (fk) fk.value = e.fuelKm != null ? e.fuelKm : '';
            if (fl) fl.value = e.fuelLiters != null ? e.fuelLiters : '';
            if (fp) fp.value = e.fuelPricePerLt != null ? e.fuelPricePerLt : '';
            openExpenseModal();
        };

        // Tablo Render
        function todayDateStr() {
            const d = new Date();
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        }

        function isFutureDateStr(dateStr) {
            if (!dateStr) return false;
            const s = String(dateStr).slice(0, 10);
            return s > todayDateStr();
        }

        function getProcessedExpenses() {
            // Harcamaları 29–28 ekstre dönemine göre işler. effectiveMonth = periodKey
            const currentPeriod = getCurrentPeriod();
            let processed = [];

            expenses.forEach(item => {
                const count = item.installmentCount || 1;
                const perAmount = item.isRecurring
                    ? (item.amountPerInstallment != null ? item.amountPerInstallment : item.amount)
                    : (item.amountPerInstallment != null ? item.amountPerInstallment : (item.amount / count));
                const originalDate = item.date;

                if (count <= 1) {
                    const periodKey = getPeriodKeyForDateStr(originalDate);
                    processed.push({
                        ...item,
                        displayAmount: item.amount,
                        installmentLabel: 'Peşin',
                        effectiveMonth: periodKey,
                        date: originalDate
                    });
                } else {
                    const installmentEntries = [];
                    for (let i = 0; i < count; i++) {
                        const dateStr = shiftDateByMonths(originalDate, i);
                        const periodKey = getPeriodKeyForDateStr(dateStr);
                        const label = item.isRecurring
                            ? (`Tekrar ${i + 1}/${count}`)
                            : (`Taksit ${i + 1}/${count}`);
                        installmentEntries.push({
                            ...item,
                            id: item.id + '_ins_' + i,
                            displayAmount: perAmount,
                            installmentLabel: label,
                            effectiveMonth: periodKey,
                            date: dateStr,
                            installmentIndex: i
                        });
                    }

                    if (currentShowInstallments) {
                        installmentEntries.forEach(entry => {
                            if (entry.effectiveMonth >= currentPeriod) {
                                processed.push(entry);
                            }
                        });
                    } else {
                        const inCurrent = installmentEntries.find(e => e.effectiveMonth === currentPeriod);
                        if (inCurrent) {
                            processed.push({
                                ...inCurrent,
                                id: item.id
                            });
                        }
                    }
                }
            });
            return processed;
        }

        function renderTable() {
            const tbody = document.getElementById('expenseTableBody');
            tbody.innerHTML = '';
            
            let filtered = [];
            
            if (currentShowInstallments) {
                filtered = getProcessedExpenses().filter(item => item.installmentLabel !== 'Peşin');
            } else {
                filtered = getProcessedExpenses().map(e => ({ ...e }));
            }
            
            filtered = filtered.filter(item => {
                if (currentPersonFilter !== 'Tümü' && item.person !== currentPersonFilter) return false;
                if (currentCategoryFilter !== 'Tümü' && item.category !== currentCategoryFilter) return false;
                if (currentPaymentFilter !== 'Tümü' && item.paymentType !== currentPaymentFilter) return false;
                
                if (currentStartDateFilter && item.date < currentStartDateFilter) return false;
                if (currentEndDateFilter && item.date > currentEndDateFilter) return false;

                if (currentSearchFilter) {
                    const q = currentSearchFilter.toLocaleLowerCase('tr-TR');
                    const blob = [
                        item.category, item.description, item.person, item.paymentType,
                        item.vehicleSubtype, item.billSubtype, item.installmentLabel, item.fuelNote
                    ].map(x => String(x || '')).join(' ').toLocaleLowerCase('tr-TR');
                    if (!blob.includes(q)) return false;
                }

                return true;
            });

            filtered.sort((a, b) => {
                if (sortColumn === 'date') {
                    const dA = String(a.date || '');
                    const dB = String(b.date || '');
                    if (dA !== dB) {
                        return sortDirection === 'asc' ? (dA > dB ? 1 : -1) : (dA < dB ? 1 : -1);
                    }
                    const tA = String(a.createdAt || a.id || '');
                    const tB = String(b.createdAt || b.id || '');
                    return sortDirection === 'asc' ? (tA > tB ? 1 : -1) : (tA < tB ? 1 : -1);
                }
                let vA = a[sortColumn], vB = b[sortColumn];
                if (sortColumn === 'amount') { vA = a.displayAmount; vB = b.displayAmount; }
                return sortDirection === 'asc' ? (vA > vB ? 1 : -1) : (vA < vB ? 1 : -1);
            });

            const totalRecords = filtered.length;
            const displayedRecords = Math.min(displayLimit, totalRecords);

            filtered.slice(0, displayedRecords).forEach(item => {
                const tr = document.createElement('tr');
                const isIncome = item.installmentLabel === 'Gelir';
                const isFuture = !isIncome && isFutureDateStr(item.date);
                if (isFuture) {
                    tr.className = 'row-future-expense';
                    tr.title = 'İleri tarihli kayıt';
                }
                const safeId = escapeHtml(item.id);
                const dateCell = isFuture
                    ? `<td class="px-8 py-5"><span class="inline-flex items-center gap-1.5"><span class="opacity-80">${escapeHtml(item.date || '-')}</span><span class="text-[9px] font-black uppercase tracking-wide text-amber-700 bg-amber-100/80 px-1.5 py-0.5 rounded">İleri</span></span></td>`
                    : `<td class="px-8 py-5 opacity-60">${escapeHtml(item.date || '-')}</td>`;
                tr.innerHTML = `
                    ${dateCell}
                    <td class="px-6 py-5">
                        <span class="px-3 py-1 rounded-lg text-[10px] font-black ${item.person === 'Bekir' ? 'bg-blue-50 text-blue-600' : (item.person === 'Duygu' ? 'bg-pink-50 text-pink-600' : 'bg-emerald-50 text-emerald-600')}">
                            ${escapeHtml((item.person || '').toUpperCase())}
                        </span>
                    </td>
                    <td class="px-6 py-5"><span class="bg-slate-100 px-2 py-1 rounded text-[10px]">${escapeHtml(item.category)}${item.billSubtype ? ' · ' + escapeHtml(item.billSubtype) : ''}${item.vehicleSubtype ? ' · ' + escapeHtml(item.vehicleSubtype) : ''}</span></td>
                    <td class="px-6 py-5 opacity-60">${escapeHtml(item.paymentType || '-')}</td>
                    <td class="px-6 py-5">
                        <div class="flex flex-col">
                            <span>${escapeHtml(item.description)}</span>
                            <span class="text-[9px] text-indigo-500 font-black tracking-tighter uppercase">${escapeHtml(item.installmentLabel)}</span>
                        </div>
                    </td>
                    <td class="px-6 py-5 text-right font-black ${isIncome ? 'text-emerald-600' : 'text-rose-600'}">
                        ${isIncome ? '+' : '-'}${item.displayAmount.toLocaleString('tr-TR')} TL
                    </td>
                    <td class="px-8 py-5 text-center space-x-2">
                        ${!isIncome && !String(item.id).includes('_ins_') ? `<button onclick="editExpense('${safeId}')" class="text-indigo-600 hover:scale-110 transition">✏️</button>` : ''}
                        <button onclick="${isIncome ? `deleteIncome('${safeId}')` : `deleteExpense('${safeId}')`}" class="text-rose-500 hover:scale-110 transition">🗑️</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });

            if (totalRecords > displayedRecords) {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td colspan="7" class="p-4 text-center">
                        <button onclick="loadMoreRecords()" class="bg-indigo-600 text-white px-6 py-2 rounded-xl font-bold text-sm hover:bg-indigo-700 transition">
                            Daha Fazla Göster (${totalRecords - displayedRecords} kayıt kaldı)
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            }
        }

        window.loadMoreRecords = () => {
            displayLimit += 10;
            renderTable();
        };

        // İstatistikler Paneli
        window.showCategoryExpenses = function(category) {
            const period = getCurrentPeriod();
            const items = getProcessedExpenses().filter(e =>
                e.effectiveMonth === period && e.category === category
            );
            const modal = document.getElementById('categoryDetailModal');
            const title = document.getElementById('categoryDetailTitle');
            const body = document.getElementById('categoryDetailBody');
            const totalEl = document.getElementById('categoryDetailTotal');
            if (!modal || !body) return;
            if (title) title.textContent = category + ' — dönem harcamaları';
            const total = items.reduce((s, e) => s + (e.displayAmount || 0), 0);
            if (totalEl) totalEl.textContent = total.toLocaleString('tr-TR') + ' TL';
            if (!items.length) {
                body.innerHTML = '<p class="text-sm text-slate-400 font-medium text-center py-6">Bu kategoride dönem harcaması yok</p>';
            } else {
                body.innerHTML = items
                    .slice()
                    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
                    .map(e => `
                    <div class="flex justify-between gap-3 items-start py-3 border-b border-slate-100 last:border-0">
                        <div class="min-w-0">
                            <p class="text-sm font-bold text-slate-800 truncate">${escapeHtml(e.description || '-')}</p>
                            <p class="text-[11px] text-slate-400 font-semibold mt-0.5">${escapeHtml(e.date || '')} · ${escapeHtml(e.person || '')} · ${escapeHtml(e.installmentLabel || '')}</p>
                        </div>
                        <p class="text-sm font-black text-rose-600 whitespace-nowrap">${(e.displayAmount || 0).toLocaleString('tr-TR')} TL</p>
                    </div>`).join('');
            }
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        };

        window.closeCategoryDetailModal = function() {
            const modal = document.getElementById('categoryDetailModal');
            if (!modal) return;
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        };

        window.showDayExpenses = function(ymd, label) {
            const day = String(ymd || '').slice(0, 10);
            // Ham + işlenmiş kayıtlardan güne göre topla
            let items = getProcessedExpenses().filter(function(e) {
                return String(e.date || '').slice(0, 10) === day;
            });
            // İşlenmişte yoksa orijinal expenses
            if (!items.length && Array.isArray(expenses)) {
                items = expenses.filter(function(e) {
                    return String(e.date || '').slice(0, 10) === day;
                }).map(function(e) {
                    return Object.assign({}, e, {
                        displayAmount: e.amount,
                        installmentLabel: (e.installmentCount > 1 ? 'Taksit/Tekrar' : 'Peşin')
                    });
                });
            }
            const modal = document.getElementById('categoryDetailModal');
            const title = document.getElementById('categoryDetailTitle');
            const body = document.getElementById('categoryDetailBody');
            const totalEl = document.getElementById('categoryDetailTotal');
            if (!modal || !body) {
                alert('Detay penceresi bulunamadı. Sayfayı Ctrl+F5 ile yenileyin.');
                return;
            }
            if (title) title.textContent = (label || day) + ' — gün harcamaları';
            const total = items.reduce(function(s, e) { return s + (Number(e.displayAmount != null ? e.displayAmount : e.amount) || 0); }, 0);
            if (totalEl) totalEl.textContent = total.toLocaleString('tr-TR') + ' TL';
            if (!items.length) {
                body.innerHTML = '<p class="text-sm text-slate-400 font-medium text-center py-6">Bu günde harcama yok</p>';
            } else {
                body.innerHTML = items.slice().sort(function(a, b) {
                    return String(b.createdAt || b.id || '').localeCompare(String(a.createdAt || a.id || ''));
                }).map(function(e) {
                    const amt = Number(e.displayAmount != null ? e.displayAmount : e.amount) || 0;
                    return '<div class="flex justify-between gap-3 items-start py-3 border-b border-slate-100 last:border-0">' +
                        '<div class="min-w-0">' +
                          '<p class="text-sm font-bold text-slate-800 truncate">' + escapeHtml(e.description || e.category || '-') + '</p>' +
                          '<p class="text-[11px] text-slate-400 font-semibold mt-0.5">' +
                            escapeHtml(e.category || '') +
                            (e.billSubtype ? ' · ' + escapeHtml(e.billSubtype) : '') +
                            ' · ' + escapeHtml(e.person || '') +
                            (e.installmentLabel ? ' · ' + escapeHtml(e.installmentLabel) : '') +
                          '</p>' +
                        '</div>' +
                        '<p class="text-sm font-black text-rose-600 whitespace-nowrap">' + amt.toLocaleString('tr-TR') + ' TL</p>' +
                      '</div>';
                }).join('');
            }
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        };



        function buildExpenseSummaryForAi() {
            // Site ile aynı mantık: 29–28 dönem + taksit satırları (effectiveMonth / displayAmount)
            const processed = getProcessedExpenses();
            // En yeni dönem başta: [0]=aktif, [1]=önceki, [2]=onunkisi
            const periodKeys = getPreviousPeriodKeys(3).slice().reverse();
            const byPeriod = {};
            periodKeys.forEach(pk => { byPeriod[pk] = {}; });

            processed.forEach(e => {
                const pk = e.effectiveMonth || getPeriodKeyForDateStr(e.date);
                if (!byPeriod[pk]) return;
                const cat = e.category || 'Diğer';
                const sub = e.billSubtype || e.vehicleSubtype || '';
                const label = sub ? (cat + '/' + sub) : cat;
                const amt = Number(e.displayAmount);
                if (!isFinite(amt)) return;
                byPeriod[pk][label] = (byPeriod[pk][label] || 0) + amt;
            });

            // Aktif dönem toplamını bütçe kartıyla aynı formülle doğrula
            const currentPk = getCurrentPeriod();
            const currentTotal = processed
                .filter(e => e.effectiveMonth === currentPk)
                .reduce((s, e) => s + (Number(e.displayAmount) || 0), 0);

            return {
                months: periodKeys, // geriye uyum: runAiAdvisor "months" kullanıyor
                byMonth: byPeriod,
                period: currentPk,
                currentTotal,
                labels: Object.fromEntries(periodKeys.map(pk => [pk, formatPeriodLabel(pk)]))
            };
        }


        function renderAdvisorInto(boxId, lines, sourceLabel, accent) {
            const box = document.getElementById(boxId);
            if (!box) return;
            const color = accent === 'ai' ? 'violet' : 'indigo';
            const head = sourceLabel
                ? '<p class="text-[11px] font-bold text-' + color + '-600 mb-3">' + escapeHtml(sourceLabel) + '</p>'
                : '';
            const cards = (lines || []).filter(Boolean).map(function(line, i) {
                let t = String(line).replace(/\*\*/g, '').replace(/\*/g, '').trim();
                let title = '';
                let body = t;
                const colon = t.indexOf(':');
                if (colon > 0 && colon < 80) {
                    title = t.slice(0, colon).trim();
                    body = t.slice(colon + 1).trim();
                }
                return (
                    '<div class="bg-white rounded-xl border border-' + color + '-100 p-3.5 mb-2.5 shadow-sm">' +
                      '<div class="flex gap-2.5 items-start">' +
                        '<span class="shrink-0 w-6 h-6 rounded-full bg-' + color + '-600 text-white text-[11px] font-black flex items-center justify-center">' + (i + 1) + '</span>' +
                        '<div class="min-w-0">' +
                          (title ? '<p class="text-sm font-black text-slate-900 mb-1">' + escapeHtml(title) + '</p>' : '') +
                          '<p class="text-sm text-slate-600 font-medium leading-relaxed">' + escapeHtml(body || t) + '</p>' +
                        '</div>' +
                      '</div>' +
                    '</div>'
                );
            }).join('');
            box.innerHTML = head + (cards || '<p class="text-sm text-slate-400">Öneri yok</p>');
        }

        function parseAdvisorText(raw) {
            if (!raw) return [];
            let t = String(raw).replace(/\r/g, '').replace(/\*\*/g, '').replace(/__/g, '').trim();
            let parts = t.split(/\n+/).map(function(s) { return s.trim(); }).filter(Boolean);
            if (parts.length <= 2) {
                parts = t.split(/(?=\d+[\.\)]\s)/).map(function(s) { return s.trim(); }).filter(Boolean);
            }
            if (parts.length <= 1) {
                parts = t.split(/(?=•\s)/).map(function(s) { return s.trim(); }).filter(Boolean);
            }
            return parts.map(function(p) {
                return p.replace(/^\d+[\.\)]\s*/, '').replace(/^[-•]\s*/, '').trim();
            }).filter(function(p) { return p.length > 8; }).slice(0, 12);
        }

        function buildDetailedLocalTips() {
            const tips = [];
            const summary = buildExpenseSummaryForAi();
            const processed = getProcessedExpenses();
            const months = summary.months || [];
            if (!months.length) {
                return ['Henüz harcama verisi yok. Kayıt ekledikten sonra tekrar deneyin.'];
            }

            const cur = months[0];
            const prev = months[1];
            const prev2 = months[2];
            const curCats = summary.byMonth[cur] || {};
            const prevCats = prev ? (summary.byMonth[prev] || {}) : {};
            const curLabel = (summary.labels && summary.labels[cur]) || formatPeriodLabel(cur);
            const prevLabel = prev ? ((summary.labels && summary.labels[prev]) || formatPeriodLabel(prev)) : '';
            const curItems = processed.filter(function(e) { return e.effectiveMonth === cur; });
            const curTotal = (summary.period === cur && summary.currentTotal != null)
                ? summary.currentTotal
                : Object.values(curCats).reduce(function(a, b) { return a + b; }, 0);
            const prevTotal = Object.values(prevCats).reduce(function(a, b) { return a + b; }, 0);

            tips.push('Aktif dönem (' + curLabel + '): ' + Math.round(curTotal).toLocaleString('tr-TR') + ' TL · ' + curItems.length + ' kalem.');

            if (prev) {
                const diff = curTotal - prevTotal;
                const pct = prevTotal > 0 ? Math.round((diff / prevTotal) * 100) : 0;
                if (Math.abs(diff) < 50) {
                    tips.push('Önceki dönem (' + prevLabel + ') ile fark az: ' + Math.round(prevTotal).toLocaleString('tr-TR') + ' TL → benzer seviye.');
                } else if (diff > 0) {
                    tips.push('Önceki döneme göre +' + Math.round(diff).toLocaleString('tr-TR') + ' TL (%' + pct + '). Artışın hangi kategoriden geldiğine bakın.');
                } else {
                    tips.push('Önceki döneme göre ' + Math.round(-diff).toLocaleString('tr-TR') + ' TL düşüş (%' + Math.abs(pct) + ').');
                }
            }

            // Kişi dağılımı
            const bekir = curItems.filter(function(e) { return e.person === 'Bekir'; }).reduce(function(s, e) { return s + (e.displayAmount || 0); }, 0);
            const duygu = curItems.filter(function(e) { return e.person === 'Duygu'; }).reduce(function(s, e) { return s + (e.displayAmount || 0); }, 0);
            if (curTotal > 0) {
                tips.push('Kişi payı: Bekir ' + Math.round(bekir).toLocaleString('tr-TR') + ' TL (%' + Math.round(bekir / curTotal * 100) + '), Duygu ' + Math.round(duygu).toLocaleString('tr-TR') + ' TL (%' + Math.round(duygu / curTotal * 100) + ').');
            }

            // Ödeme tipi
            const kk = curItems.filter(function(e) { return e.paymentType === 'Kredi Kartı'; }).reduce(function(s, e) { return s + (e.displayAmount || 0); }, 0);
            const nakit = curItems.filter(function(e) { return e.paymentType === 'Nakit'; }).reduce(function(s, e) { return s + (e.displayAmount || 0); }, 0);
            if (kk + nakit > 0) {
                tips.push('Ödeme: Kredi kartı ' + Math.round(kk).toLocaleString('tr-TR') + ' TL, nakit ' + Math.round(nakit).toLocaleString('tr-TR') + ' TL.');
            }

            // Top kategoriler
            const ranked = Object.entries(curCats).sort(function(a, b) { return b[1] - a[1]; });
            if (ranked.length) {
                const topLines = ranked.slice(0, 5).map(function(kv, i) {
                    const share = curTotal > 0 ? Math.round(kv[1] / curTotal * 100) : 0;
                    return (i + 1) + ') ' + kv[0] + ' ' + Math.round(kv[1]).toLocaleString('tr-TR') + ' TL (%' + share + ')';
                }).join(' · ');
                tips.push('Kategori sıralaması: ' + topLines);
            }

            // Artışlar
            ranked.forEach(function(kv) {
                const cat = kv[0], amt = kv[1];
                const before = prevCats[cat] || 0;
                if (before > 0 && amt > before * 1.2 && amt - before > 80) {
                    tips.push(cat + ' artışı: ' + Math.round(before).toLocaleString('tr-TR') + ' → ' + Math.round(amt).toLocaleString('tr-TR') + ' TL (+' + Math.round(amt - before).toLocaleString('tr-TR') + '). Limit veya alternatif düşünün.');
                } else if (before === 0 && amt > 200) {
                    tips.push(cat + ' bu dönemde yeni/yoğun: ' + Math.round(amt).toLocaleString('tr-TR') + ' TL.');
                }
            });

            // Faturalar detay
            const bills = curItems.filter(function(e) { return e.category === 'Faturalar'; });
            if (bills.length) {
                const by = {};
                bills.forEach(function(e) {
                    const k = e.billSubtype || 'Diğer';
                    by[k] = (by[k] || 0) + (e.displayAmount || 0);
                });
                const billStr = Object.entries(by).map(function(kv) {
                    return kv[0] + ' ' + Math.round(kv[1]).toLocaleString('tr-TR') + ' TL';
                }).join(', ');
                tips.push('Faturalar detay: ' + billStr + '. Tarife/kullanım karşılaştırması yapın.');
            }

            // Araç / yakıt
            const vehicle = curItems.filter(function(e) { return e.category === 'Araç' || e.category === 'Ulaşım'; });
            if (vehicle.length) {
                const fuel = vehicle.filter(function(e) { return e.vehicleSubtype === 'Yakıt'; });
                const fuelSum = fuel.reduce(function(s, e) { return s + (e.displayAmount || 0); }, 0);
                const withCons = fuel.filter(function(e) { return e.fuelKm > 0 && e.fuelLiters > 0; });
                let consNote = '';
                if (withCons.length) {
                    const avg = withCons.reduce(function(s, e) { return s + (e.fuelLiters / e.fuelKm) * 100; }, 0) / withCons.length;
                    consNote = ' Ort. tüketim ~' + avg.toFixed(1) + ' L/100km.';
                }
                tips.push('Araç: ' + vehicle.length + ' kayıt, yakıt ' + Math.round(fuelSum).toLocaleString('tr-TR') + ' TL.' + consNote + ' Araç sekmesindeki grafiklere bakın.');
            }

            // Taksit
            const taksit = curItems.filter(function(e) { return e.installmentLabel && e.installmentLabel !== 'Peşin'; });
            if (taksit.length) {
                const tSum = taksit.reduce(function(s, e) { return s + (e.displayAmount || 0); }, 0);
                tips.push('Bu döneme düşen taksit: ' + taksit.length + ' satır, ' + Math.round(tSum).toLocaleString('tr-TR') + ' TL. Yeni taksit açmadan önce kalan yükü kontrol edin.');
            }

            // 3 dönem trend
            if (prev2 && months.length >= 3) {
                const t0 = Object.values(summary.byMonth[months[2]] || {}).reduce(function(a, b) { return a + b; }, 0);
                const t1 = prevTotal;
                const t2 = curTotal;
                tips.push('Üç dönem trendi: ' + Math.round(t0).toLocaleString('tr-TR') + ' → ' + Math.round(t1).toLocaleString('tr-TR') + ' → ' + Math.round(t2).toLocaleString('tr-TR') + ' TL.');
            }

            tips.push('İpucu: İşlem geçmişinde kelime arama ile tekrarlayan harcamaları (ör. market, sigara) toplayın.');
            tips.push('İpucu: Kredi kartı ekstresini dönem kapanmadan kontrol etmek faiz riskini azaltır.');
            return tips;
        }

        window.runLocalAdvisor = function() {
            const btn = document.getElementById('localAdvisorBtn');
            try {
                if (btn) btn.disabled = true;
                const tips = buildDetailedLocalTips();
                renderAdvisorInto('localAdvisorResult', tips, 'Yerel detaylı analiz', 'local');
                logActivity('Diğer', 'Yerel bütçe analizi', '');
            } catch (err) {
                console.error(err);
                const box = document.getElementById('localAdvisorResult');
                if (box) box.innerHTML = '<p class="text-sm text-rose-600 font-semibold">' + escapeHtml(err.message || String(err)) + '</p>';
            } finally {
                if (btn) btn.disabled = false;
            }
        };

        window.runAiAdvisor = async function() {
            const box = document.getElementById('aiAdvisorResult');
            const btn = document.getElementById('aiAdvisorBtn');
            const bar = document.getElementById('aiAdvisorProgressBar');
            const wrap = document.getElementById('aiAdvisorProgressWrap');
            const pctEl = document.getElementById('aiAdvisorProgressPct');
            if (btn) btn.disabled = true;
            if (wrap) wrap.classList.remove('hidden');
            let pct = 0;
            let timer = setInterval(function() {
                // %95e kadar yavaşça ilerle, yanıt gelince 100
                if (pct < 90) pct += (pct < 40 ? 4 : pct < 70 ? 2 : 1);
                if (bar) bar.style.width = pct + '%';
                if (pctEl) pctEl.textContent = Math.round(pct) + '%';
            }, 200);
            if (box) box.innerHTML = '<p class="text-sm text-slate-500 font-semibold">AI analiz hazırlanıyor…</p>';

            try {
                if (!openrouterApiKey) {
                    throw new Error('OpenRouter anahtarı yok. Firebase: settings/apiKeys → openrouter');
                }
                const summary = buildExpenseSummaryForAi();
                const lines = [];
                summary.months.forEach(function(m) {
                    const cats = summary.byMonth[m] || {};
                    const total = Object.values(cats).reduce(function(a, b) { return a + b; }, 0);
                    const label = (summary.labels && summary.labels[m]) ? summary.labels[m] : m;
                    const top = Object.entries(cats).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 8)
                        .map(function(kv) { return kv[0] + ': ' + Math.round(kv[1]) + ' TL'; }).join(', ');
                    lines.push(label + ' toplam ' + Math.round(total) + ' TL → ' + (top || 'kayıt yok'));
                });
                const prompt = [
                    'Sen deneyimli bir ev butcesi danismanisin. Turkce yaz.',
                    '29-28 ekstre donemi verisine gore 5-7 ozgun oneri yaz.',
                    'Her oneri AYRI SATIRDA: Baslik: somut aciklama (1-2 tam cumle).',
                    'Sadece azaltin deme. Cesitlendir: limit, taksit, fatura tarife, yakit, abonelik, kart odeme, toplu alim, acil fon.',
                    'Rakama dayan; uydurma yuzde verme. Markdown yok. 1. 2. 3. numarala.',
                    '',
                    'Veri:',
                    lines.join(String.fromCharCode(10))
                ].join(String.fromCharCode(10));

                const text = await callOpenRouter(
                    prompt,
                    'Turkce ev butcesi danismani. Madde madde tamamlanmis cumleler. Markdown yok. Pratik cesitli oneriler.',
                    1200
                );
                pct = 100;
                if (bar) bar.style.width = '100%';
                if (pctEl) pctEl.textContent = '100%';
                const gemLines = parseAdvisorText(text);
                renderAdvisorInto('aiAdvisorResult', gemLines.length ? gemLines : [text], 'OpenRouter AI analizi', 'ai');
                logActivity('Diğer', 'AI bütçe danışmanı (OpenRouter)', '');
            } catch (err) {
                console.error(err);
                if (box) {
                    box.innerHTML = '<p class="text-sm text-rose-600 font-semibold">' + escapeHtml(err.message || String(err)) + '</p>' +
                        '<p class="text-[11px] text-slate-400 mt-2">Soldaki yerel analizi kullanabilir veya anahtarı/kotayı kontrol edebilirsiniz.</p>';
                }
            } finally {
                clearInterval(timer);
                if (bar) bar.style.width = '100%';
                if (pctEl) pctEl.textContent = '100%';
                setTimeout(function() {
                    if (wrap) wrap.classList.add('hidden');
                    if (bar) bar.style.width = '0%';
                    if (pctEl) pctEl.textContent = '0%';
                }, 600);
                if (btn) btn.disabled = false;
            }
        };


        let billsChart = null;

        function renderBillsChart() {
            const ctx = document.getElementById('billsChart');
            if (!ctx || typeof Chart === 'undefined') return;
            const processed = getProcessedExpenses().filter(e => e.category === 'Faturalar');
            const isMobile = (typeof window !== 'undefined' && window.innerWidth < 640);
            // Mobilde son 3 dönem + yatay çubuk (dokunması kolay)
            const keys = getPreviousPeriodKeys(isMobile ? 3 : 6);
            const labels = keys.map(function(k) {
                if (isMobile) {
                    const [y, m] = k.split('-').map(Number);
                    return ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'][m - 1] + " '" + String(y).slice(2);
                }
                return formatPeriodLabel(k);
            });
            const types = getSubtypesForCategory('Faturalar');
            const colorPalette = ['#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6', '#a855f7', '#f97316'];
            const colors = types.map(function(_, i) { return colorPalette[i % colorPalette.length]; });
            const datasets = types.map(function(t, i) {
                return {
                    label: t,
                    data: keys.map(function(k) {
                        return processed.filter(function(e) {
                            return e.effectiveMonth === k && (e.billSubtype || '') === t;
                        }).reduce(function(s, e) { return s + (e.displayAmount || 0); }, 0);
                    }),
                    backgroundColor: colors[i],
                    borderRadius: 5,
                    maxBarThickness: isMobile ? 16 : 22,
                    barPercentage: isMobile ? 0.9 : 0.8,
                    categoryPercentage: isMobile ? 0.85 : 0.75
                };
            });
            if (billsChart) { try { billsChart.destroy(); } catch (_) {} }
            billsChart = new Chart(ctx, {
                type: 'bar',
                data: { labels: labels, datasets: datasets },
                options: {
                    indexAxis: isMobile ? 'y' : 'x',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { boxWidth: 12, font: { size: isMobile ? 10 : 11 }, padding: isMobile ? 8 : 12 }
                        }
                    },
                    scales: isMobile ? {
                        x: { stacked: false, beginAtZero: true },
                        y: { stacked: false, ticks: { font: { size: 11 } } }
                    } : {
                        x: { stacked: false, ticks: { maxRotation: 40, font: { size: 10 } } },
                        y: { stacked: false, beginAtZero: true }
                    }
                }
            });
        }

        function updateStatsPanel() {
            const period = getCurrentPeriod();
            const processedExpenses = getProcessedExpenses().filter(e => e.effectiveMonth === period);
            
            const categoryData = {};
            processedExpenses.forEach(e => {
                categoryData[e.category] = (categoryData[e.category] || 0) + e.displayAmount;
            });

            const ctx1 = document.getElementById('expenseChart');
            if (ctx1 && expenseChart) {
                expenseChart.destroy();
            }
            if (ctx1) {
                const catLabels = Object.keys(categoryData);
                expenseChart = new Chart(ctx1, {
                    type: 'doughnut',
                    data: {
                        labels: catLabels,
                        datasets: [{
                            data: Object.values(categoryData),
                            backgroundColor: ['#3b82f6', '#ec4899', '#f59e0b', '#10b981', '#f87171', '#8b5cf6', '#06b6d4', '#6366f1'],
                            borderColor: '#ffffff',
                            borderWidth: 3
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        layout: { padding: { top: 4, bottom: 4 } },
                        onClick: (evt, elements) => {
                            if (!elements || !elements.length) return;
                            const idx = elements[0].index;
                            const cat = catLabels[idx];
                            if (cat) showCategoryExpenses(cat);
                        },
                        plugins: {
                            legend: {
                                position: (typeof window !== 'undefined' && window.innerWidth >= 768) ? 'right' : 'bottom',
                                align: 'center',
                                labels: {
                                    boxWidth: 14,
                                    padding: 14,
                                    font: { size: 12, weight: '600' },
                                    usePointStyle: true,
                                    pointStyle: 'rectRounded'
                                },
                                onClick: (e, legendItem, legend) => {
                                    const cat = legendItem.text;
                                    if (cat) showCategoryExpenses(cat);
                                }
                            },
                            title: {
                                display: true,
                                text: 'Kategoriye tıklayın → harcamaları görün',
                                font: { size: 11, weight: '600' },
                                color: '#94a3b8'
                            }
                        }
                    }
                });
            }

            // Son 7 takvim günü (sadece bu günlere düşen harcamalar)
            const weekData = {};
            const last7Keys = [];
            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setHours(0, 0, 0, 0);
                d.setDate(d.getDate() - i);
                const ymd = formatYMD(d);
                const label = d.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' });
                last7Keys.push({ ymd, label });
                weekData[label] = 0;
            }
            const allForWeek = getProcessedExpenses().filter(e => {
                const s = String(e.date || '').slice(0, 10);
                return last7Keys.some(k => k.ymd === s);
            });
            allForWeek.forEach(e => {
                const s = String(e.date || '').slice(0, 10);
                const hit = last7Keys.find(k => k.ymd === s);
                if (hit) weekData[hit.label] += e.displayAmount;
            });

            const ctx2 = document.getElementById('weeklyTrendChart');
            if (ctx2 && weeklyTrendChart) {
                weeklyTrendChart.destroy();
            }
            if (ctx2) {
                const weekLabels = last7Keys.map(k => k.label);
                const weekValues = last7Keys.map(k => weekData[k.label] || 0);
                weeklyTrendChart = new Chart(ctx2, {
                    type: 'line',
                    data: {
                        labels: weekLabels,
                        datasets: [{
                            label: 'Harcama',
                            data: weekValues,
                            borderColor: '#4f46e5',
                            backgroundColor: 'rgba(79, 70, 229, 0.12)',
                            borderWidth: 2,
                            fill: true,
                            tension: 0.35,
                            pointRadius: 5,
                            pointHoverRadius: 8,
                            pointBackgroundColor: '#4f46e5'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: { mode: 'index', intersect: false },
                        onClick: function(evt, elements, chart) {
                            var idx = null;
                            if (elements && elements.length) idx = elements[0].index;
                            if (idx == null && chart && chart.getElementsAtEventForMode) {
                                var pts = chart.getElementsAtEventForMode(evt, 'index', { intersect: false }, true);
                                if (pts && pts.length) idx = pts[0].index;
                            }
                            if (idx == null) return;
                            var key = last7Keys[idx];
                            if (key && typeof showDayExpenses === 'function') showDayExpenses(key.ymd, key.label);
                        },
                        plugins: {
                            legend: { display: false },
                            title: {
                                display: true,
                                text: 'Güne veya noktaya tıklayın → harcamalar',
                                font: { size: 11, weight: '600' },
                                color: '#94a3b8'
                            }
                        },
                        scales: {
                            x: { ticks: { font: { size: 10 } } },
                            y: { beginAtZero: true, ticks: { font: { size: 10 } } }
                        }
                    }
                });
            }

            const periodKeys = getPreviousPeriodKeys(6);
            const monthData = {};
            const allForTrend = [];
            expenses.forEach(item => {
                const count = item.installmentCount || 1;
                const perAmount = item.amountPerInstallment || (item.amount / count);
                if (count <= 1) {
                    allForTrend.push({ displayAmount: item.amount, effectiveMonth: getPeriodKeyForDateStr(item.date) });
                } else {
                    for (let i = 0; i < count; i++) {
                        const dateStr = shiftDateByMonths(item.date, i);
                        allForTrend.push({ displayAmount: perAmount, effectiveMonth: getPeriodKeyForDateStr(dateStr) });
                    }
                }
            });
            periodKeys.forEach(pk => {
                const label = formatPeriodLabel(pk);
                monthData[label] = allForTrend
                    .filter(e => e.effectiveMonth === pk)
                    .reduce((sum, e) => sum + e.displayAmount, 0);
            });

            const ctx3 = document.getElementById('monthlyTrendChart');
            if (ctx3 && monthlyTrendChart) {
                monthlyTrendChart.destroy();
            }
            if (ctx3) {
                monthlyTrendChart = new Chart(ctx3, {
                    type: 'bar',
                    data: {
                        labels: Object.keys(monthData),
                        datasets: [{
                            label: 'Dönem',
                            data: Object.values(monthData),
                            backgroundColor: '#4f46e5',
                            borderRadius: 6,
                            maxBarThickness: 28
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            x: { ticks: { font: { size: 9 }, maxRotation: 45 } },
                            y: { beginAtZero: true, ticks: { font: { size: 10 } } }
                        }
                    }
                });
            }
        }

        // Raporlar
        function renderMonthlyReports() {
            const period = getCurrentPeriod();
            const processedExpenses = getProcessedExpenses().filter(e => e.effectiveMonth === period);
            const total = processedExpenses.reduce((s, e) => s + (e.displayAmount || 0), 0);

            const monthlySummary = document.getElementById('monthlySummaryReport');
            const personSummary = document.getElementById('personSummaryReport');
            if (monthlySummary) {
                monthlySummary.innerHTML = '';
                monthlySummary.classList.add('hidden');
            }
            if (personSummary) {
                personSummary.innerHTML = '';
                personSummary.classList.add('hidden');
            }

            const categoryData = {};
            processedExpenses.forEach(e => {
                categoryData[e.category] = (categoryData[e.category] || 0) + (e.displayAmount || 0);
            });
            const detailedReport = document.getElementById('detailedMonthlyReport');
            if (!detailedReport) return;
            const entries = Object.entries(categoryData).sort((a, b) => b[1] - a[1]);
            if (!entries.length) {
                detailedReport.innerHTML = '<p class="text-sm text-slate-400 col-span-full text-center py-2">Bu dönemde kategori yok</p>';
            } else {
                detailedReport.innerHTML = entries.map(([cat, amt]) => {
                    const share = total > 0 ? Math.round(amt / total * 100) : 0;
                    const safe = String(cat).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                    return '<button type="button" onclick="showCategoryExpenses(\'' + safe + '\')" class="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 transition text-left w-full">' +
                        '<span class="text-xs font-bold text-slate-700 truncate">' + cat + '</span>' +
                        '<span class="text-xs font-black text-slate-800 whitespace-nowrap">' + amt.toLocaleString('tr-TR') + ' TL <span class="text-slate-400 font-bold">%' + share + '</span></span>' +
                        '</button>';
                }).join('');
            }
        }

        //

        function renderCardStatements(person) {
            const key = (person || '').toLowerCase();
            const sortedStatements = cardStatements
                .filter(s => String(s.person || '').toLowerCase() === key)
                .sort((a, b) => String(b.month || '').localeCompare(String(a.month || '')));
            
            const container = document.getElementById(person === 'bekir' ? 'bekirCardStatements' : 'duyguCardStatements');
            if (!container) return;
            if (sortedStatements.length === 0) {
                container.innerHTML = `<div class="col-span-full text-center py-8 text-slate-400"><p class="text-sm">Henüz ekstre kaydı yok</p></div>`;
                return;
            }

            const monthNames = ['Ocak', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
            
            container.innerHTML = sortedStatements.map(stmt => {
                const [year, month] = stmt.month.split('-');
                const monthName = monthNames[parseInt(month) - 1];
                const bgColor = person === 'bekir' 
                    ? 'from-blue-50 to-blue-100 border-blue-200 hover:shadow-lg hover:shadow-blue-100' 
                    : 'from-pink-50 to-pink-100 border-pink-200 hover:shadow-lg hover:shadow-pink-100';
                const textColor = person === 'bekir' ? 'text-blue-600' : 'text-pink-600';
                
                return `
                    <div class="bg-gradient-to-br ${bgColor} p-5 rounded-2xl border shadow-sm transition hover:shadow-md cursor-default">
                        <div class="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-2">${monthName} ${year}</div>
                        <div class="text-xl font-black ${textColor} mb-2">${stmt.amount.toLocaleString('tr-TR')}</div>
                        <div class="text-[8px] text-slate-600">TL</div>
                        <div class="text-[8px] text-slate-400 mt-2 pt-2 border-t border-slate-200">${stmt.paidDate}</div>
                    </div>
                `;
            }).join('');
        }

        // OTOMATIK EKSTRE HESAPLAMA SISTEMI
        function getCardStatementPeriod(date = new Date()) {
            const p = getStatementPeriodForDate(date);
            return {
                startDate: p.startDate,
                endDate: p.endDate,
                periodKey: p.periodKey,
                label: p.label
            };
        }
        
        let currentStatements = [];
        
        function calculateCurrentCardStatements() {
            const period = getCardStatementPeriod();
            const periodKey = period.periodKey;

            let allWithInstallments = [];
            expenses.forEach(item => {
                const count = item.installmentCount || 1;
                const perAmount = item.isRecurring
                    ? (item.amountPerInstallment != null ? item.amountPerInstallment : item.amount)
                    : (item.amountPerInstallment != null ? item.amountPerInstallment : (item.amount / count));
                const originalDate = item.date;

                if (count <= 1) {
                    allWithInstallments.push({
                        ...item,
                        displayAmount: item.amount,
                        installmentLabel: 'Peşin',
                        effectiveMonth: getPeriodKeyForDateStr(originalDate),
                        date: originalDate
                    });
                } else {
                    for (let i = 0; i < count; i++) {
                        const dateStr = shiftDateByMonths(originalDate, i);
                        allWithInstallments.push({
                            ...item,
                            id: item.id + '_ins_' + i,
                            displayAmount: perAmount,
                            installmentLabel: `Taksit ${i + 1}/${count}`,
                            effectiveMonth: getPeriodKeyForDateStr(dateStr),
                            date: dateStr
                        });
                    }
                }
            });

            const inPeriod = (exp) => exp.effectiveMonth === periodKey && exp.paymentType === 'Kredi Kartı';
            const bekirCreditExpenses = allWithInstallments.filter(exp => exp.person === 'Bekir' && inPeriod(exp));
            const duyguCreditExpenses = allWithInstallments.filter(exp => exp.person === 'Duygu' && inPeriod(exp));

            currentStatements = [
                {
                    person: 'Bekir',
                    amount: bekirCreditExpenses.reduce((sum, exp) => sum + exp.displayAmount, 0),
                    expenses: bekirCreditExpenses,
                    period: period,
                    color: 'blue'
                },
                {
                    person: 'Duygu',
                    amount: duyguCreditExpenses.reduce((sum, exp) => sum + exp.displayAmount, 0),
                    expenses: duyguCreditExpenses,
                    period: period,
                    color: 'pink'
                }
            ];

            return currentStatements;
        }

        window.openStatementDetails = function(person) {
            calculateCurrentCardStatements();
            const statement = currentStatements.find(s => s.person === person);
            if (!statement || statement.amount === 0) {
                alert(person + ' için bu dönemde kredi kartı harcaması yok');
                return;
            }

            const modal = document.getElementById('statementDetailModal');
            const titleEl = document.getElementById('statementTitle');
            const rangeEl = document.getElementById('statementDateRange');
            const amountEl = document.getElementById('statementAmount');
            const itemsContainer = document.getElementById('statementItems');
            if (!modal || !itemsContainer) {
                alert('Ekstre detay penceresi yüklenemedi. Sayfayı Ctrl+F5 ile yenileyin.');
                return;
            }

            const startDate = statement.period.startDate.toLocaleDateString('tr-TR');
            const endDate = statement.period.endDate.toLocaleDateString('tr-TR');
            if (titleEl) titleEl.innerText = person + ' - Kredi Kartı Ekstresi';
            if (rangeEl) rangeEl.innerText = startDate + ' - ' + endDate;
            if (amountEl) amountEl.innerText = statement.amount.toLocaleString('tr-TR') + ' TL';

            if (!statement.expenses.length) {
                itemsContainer.innerHTML = '<p class="text-center text-slate-400 py-8">Bu dönem kredi kartı ile harcama yapılmamış</p>';
            } else {
                itemsContainer.innerHTML = statement.expenses
                    .slice()
                    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
                    .map(exp => `
                        <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200 hover:border-slate-300 transition group">
                            <div class="flex justify-between items-start mb-2 gap-3">
                                <div class="flex-1 min-w-0">
                                    <p class="font-bold text-slate-900">${escapeHtml(exp.category)}</p>
                                    <p class="text-xs text-slate-500 mt-1">${escapeHtml(exp.description || '-')}</p>
                                </div>
                                <div class="flex items-center gap-2 shrink-0">
                                    <p class="font-black text-lg text-slate-900">${exp.displayAmount.toLocaleString('tr-TR')} TL</p>
                                    <button type="button" onclick="deleteStatementItem('${escapeHtml(exp.id)}')"
                                            class="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition bg-red-600 hover:bg-red-700 text-white p-1.5 rounded-lg"
                                            title="Sil">🗑️</button>
                                </div>
                            </div>
                            <div class="flex justify-between text-xs text-slate-400">
                                <span>${escapeHtml(exp.date || '')}</span>
                                ${exp.installmentLabel !== 'Peşin' ? '<span class="text-indigo-600 font-semibold">' + escapeHtml(exp.installmentLabel) + '</span>' : ''}
                            </div>
                        </div>
                    `).join('');
            }

            modal.classList.remove('hidden');
            modal.classList.add('flex');
        };

        window.deleteStatementItem = async (expenseId) => {
            if (!expenseId) {
                alert('Silinecek harcama bulunamadı');
                return;
            }
            
            if (!confirm('Bu harcamayı silmek istediğinize emin misiniz?')) {
                return;
            }
            
            let actualId = expenseId;
            if (typeof expenseId === 'string' && expenseId.includes('_ins_')) {
                actualId = expenseId.split('_ins_')[0];
            }
            
            try {
                const item = expenses.find(e => e.id === actualId);
                if (item) {
                    deletedExpenses.push({...item, deletedAt: new Date().toISOString()});
                    localStorage.setItem('deletedExpenses', JSON.stringify(deletedExpenses));
                }
                
                await db.collection("expenses").doc(actualId).delete();
                closeStatementDetail();
                renderApp();
            } catch (err) {
                console.error("Silme hatası:", err);
                alert("Silinirken hata oluştu: " + err.message);
            }
        };
        
        window.closeStatementDetail = () => {
            const modal = document.getElementById('statementDetailModal');
            if (!modal) return;
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        };

        function renderCurrentStatements() {
            calculateCurrentCardStatements();
            const container = document.getElementById('currentStatementsContainer');
            
            const statementsWithAmount = currentStatements.filter(s => s.amount > 0);
            
            if (statementsWithAmount.length === 0) {
                container.innerHTML = '<div class="text-center text-slate-400 py-8"><p class="text-sm">Bu dönem kredi kartı harcaması yapılmamış</p></div>';
                return;
            }
            
            container.innerHTML = statementsWithAmount.map(stmt => `
                <div class="bg-gradient-to-br ${stmt.color === 'blue' ? 'from-blue-50 to-blue-100 border-blue-200' : 'from-pink-50 to-pink-100 border-pink-200'} p-6 rounded-2xl border cursor-pointer hover:shadow-lg transition"
                     onclick="openStatementDetails('${stmt.person}')">
                    <div class="flex justify-between items-start">
                        <div class="flex-1">
                            <p class="text-sm font-bold text-slate-600 uppercase tracking-wider">${stmt.person}</p>
                            <p class="text-4xl font-black ${stmt.color === 'blue' ? 'text-blue-600' : 'text-pink-600'} mt-2">${stmt.amount.toLocaleString('tr-TR')}</p>
                            <p class="text-[11px] text-slate-500 mt-3">TL</p>
                        </div>
                        <div>
                            <p class="text-xs text-slate-600 mb-3 font-semibold">${stmt.period.label}</p>
                            <p class="text-3xl">💳</p>
                        </div>
                    </div>
                    <div class="mt-4 pt-4 border-t border-opacity-30 ${stmt.color === 'blue' ? 'border-blue-300' : 'border-pink-300'}">
                        <p class="text-xs text-slate-600 mb-2">${stmt.expenses.length} harcama</p>
                        <button onclick="event.stopPropagation(); openStatementDetails('${stmt.person}')" 
                                class="w-full py-2 bg-white/70 hover:bg-white text-slate-700 font-bold text-xs rounded-lg transition">
                            Detayları Gör →
                        </button>
                    </div>
                </div>
            `).join('');
        }

        // Çöp Kutusu
        function renderTrash() {
            loadDeletedExpenses();
            const tbody = document.getElementById('trashTableBody');
            tbody.innerHTML = deletedExpenses.map(item => `
                <tr>
                    <td class="px-6 py-4">${escapeHtml(item.deletedAt?.substring(0, 10) || '-')}</td>
                    <td class="px-6 py-4">${escapeHtml(item.date)}</td>
                    <td class="px-6 py-4">${escapeHtml(item.person)}</td>
                    <td class="px-6 py-4">${escapeHtml(item.description)}</td>
                    <td class="px-6 py-4 text-right">${item.amount} TL</td>
                    <td class="px-6 py-4 text-center"><button onclick="restoreExpense('${escapeHtml(item.id)}')" class="text-indigo-600 hover:scale-110">↩️</button></td>
                </tr>
            `).join('');
        }

        window.restoreExpense = async (id) => {
            loadDeletedExpenses();
            const item = deletedExpenses.find(e => e.id === id);
            if (!item) {
                alert('Kayıt bulunamadı');
                return;
            }
            const { deletedAt, ...data } = item;
            await db.collection("expenses").doc(id).set(data);
            deletedExpenses = deletedExpenses.filter(e => e.id !== id);
            localStorage.setItem('deletedExpenses', JSON.stringify(deletedExpenses));
            renderTrash();
        };

        window.emptyTrash = () => {
            if (confirm("Çöp kutusunu boşaltmak istediğinize emin misiniz?")) {
                deletedExpenses = [];
                localStorage.removeItem('deletedExpenses');
                renderTrash();
            }
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


        // KATEGORİ YÖNETIMI FONKSIYONLARI

        let removedTabIds = [];

        function mergeTabsConfig(saved, removed) {
            removedTabIds = Array.isArray(removed) ? removed.slice() : (removedTabIds || []);
            const byId = {};
            DEFAULT_TABS.forEach(t => { byId[t.id] = { ...t }; });
            const result = [];
            const seen = new Set();

            const LEGACY_TABS = new Set(['calculator', 'reports', 'shopping', 'alisveris', 'alışveriş']);
            (saved || []).forEach(s => {
                if (!s || !s.id) return;
                if (LEGACY_TABS.has(s.id)) return;
                if (removedTabIds.includes(s.id)) return;
                if (byId[s.id]) {
                    result.push({
                        ...byId[s.id],
                        label: s.label || byId[s.id].label,
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
                return `
                <div class="max-w-md mx-auto space-y-4">
                    <div>
                        <p class="text-xs text-slate-400 font-semibold">Yapılacaklar</p>
                        <p class="text-[10px] text-emerald-600 font-bold mt-0.5">Kayıtlar otomatik saklanır (yenilemede silinmez)</p>
                    </div>
                    <div class="flex gap-2">
                        <input type="text" id="dynTodoInput" placeholder="Görev ekle..." class="flex-1 bg-slate-50 rounded-xl p-3 font-bold outline-none ring-1 ring-slate-200">
                        <button type="button" id="dynTodoAdd" class="bg-indigo-600 text-white px-4 rounded-xl font-bold">Ekle</button>
                    </div>
                    <ul id="dynTodoList" class="space-y-2"></ul>
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
                    list.innerHTML = items.map((it, i) => `
                        <li class="flex items-center gap-2 bg-slate-50 p-3 rounded-xl">
                            <input type="checkbox" ${it.done ? 'checked' : ''} data-i="${i}" class="dyn-todo-check rounded">
                            <span class="flex-1 text-sm font-bold ${it.done ? 'line-through text-slate-400' : 'text-slate-800'}">${escapeHtml(it.text)}</span>
                            <button type="button" data-del="${i}" class="text-rose-500 text-xs font-bold">Sil</button>
                        </li>`).join('');
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
                    items.push({ text: t, done: false, at: new Date().toISOString() });
                    input.value = '';
                    render();
                    persist();
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
        const PERSISTENT_WIDGETS = new Set(['todo', 'notes', 'counter', 'calculator', 'percentage', 'timer', 'scratch', 'fuel']);


        async function callOpenRouter(userPrompt, systemPrompt, maxTokens) {
            if (!openrouterApiKey) throw new Error('OpenRouter anahtarı yok (Firebase settings/apiKeys → openrouter)');
            const models = [
                'openrouter/free',
                'meta-llama/llama-3.3-70b-instruct:free',
                'meta-llama/llama-3.2-3b-instruct:free',
                'google/gemma-3-12b-it:free',
                'qwen/qwen-2.5-7b-instruct:free'
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
            if (!isAdmin() || index === 0) return;
            [tabsConfig[index], tabsConfig[index - 1]] = [tabsConfig[index - 1], tabsConfig[index]];
            await saveTabsConfig();
            applyRoleAndTabs();
            renderTabsList();
        };

        window.moveTabDown = async (index) => {
            if (!isAdmin() || index === tabsConfig.length - 1) return;
            [tabsConfig[index], tabsConfig[index + 1]] = [tabsConfig[index + 1], tabsConfig[index]];
            await saveTabsConfig();
            applyRoleAndTabs();
            renderTabsList();
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


        window.toggleActivityPanel = () => {
            const panel = document.getElementById('activityPanel');
            const icon = document.getElementById('activityToggleIcon');
            if (!panel) return;
            const opening = panel.classList.contains('hidden');
            panel.classList.toggle('hidden');
            if (icon) icon.style.transform = opening ? 'rotate(180deg)' : 'rotate(0deg)';
            if (opening) renderActivityTable();
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
        window.copyIban = (ibanNumber) => {
            navigator.clipboard.writeText(ibanNumber).then(() => {
                alert('IBAN kopyalandı!');
            }).catch(() => {
                alert('Kopyalama başarısız oldu');
            });
        };

        window.editIban = (id) => {
            const iban = ibans.find(i => i.id === id);
            if (!iban) return;
            document.getElementById('editIbanId').value = id;
            document.getElementById('ibanOwnerName').value = iban.ownerName;
            document.getElementById('ibanNumber').value = iban.ibanNumber;
            document.getElementById('ibanBank').value = iban.bank;
            document.getElementById('ibanModal').classList.remove('hidden');
            document.getElementById('ibanModal').classList.add('flex');
        };

        window.renderIbans = () => {
            const container = document.getElementById('ibanListContainer');
            if (!container) return;
            if (ibans.length === 0) {
                container.innerHTML = `<div class="text-center text-slate-400 py-8 col-span-full"><p class="text-sm">Henüz IBAN kaydı yok</p></div>`;
                return;
            }
            container.innerHTML = ibans.map(i => `
                <div class="bg-slate-50 p-6 rounded-2xl border border-slate-100 flex justify-between items-center group">
                    <div class="flex-1">
                        <p class="font-black text-slate-900">${escapeHtml(i.ownerName)}</p>
                        <p class="text-xs text-indigo-600 font-bold mt-1">${escapeHtml(i.bank)}</p>
                        <p class="text-xs font-mono text-slate-500 mt-2 break-all">${escapeHtml(i.ibanNumber)}</p>
                    </div>
                    <div class="flex gap-2 ml-4">
                        <button onclick="copyIban('${escapeHtml(i.ibanNumber)}')" class="text-slate-400 hover:text-indigo-600 transition text-lg" title="Kopyala">📋</button>
                        <button onclick="editIban('${escapeHtml(i.id)}')" class="text-slate-400 hover:text-blue-600 transition text-lg" title="Düzenle">✏️</button>
                        <button onclick="deleteIban('${escapeHtml(i.id)}')" class="text-slate-400 hover:text-rose-600 transition text-lg" title="Sil">🗑️</button>
                    </div>
                </div>
            `).join('');
        };

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
                    <div class="flex justify-between items-center mb-2">
                        <span class="text-xs font-black uppercase tracking-wider px-3 py-1 rounded-full ${n.person === 'Bekir' ? 'bg-blue-50 text-blue-600' : 'bg-pink-50 text-pink-600'}">${escapeHtml(n.person)}</span>
                        <button onclick="deleteNote('${escapeHtml(n.id)}')" class="text-xs text-rose-500 font-bold">Sil</button>
                    </div>
                    <p class="text-[11px] text-slate-400 font-semibold mb-3">${escapeHtml(formatNoteDateTime(n.date))}</p>
                    <p class="text-sm font-medium text-slate-700 whitespace-pre-wrap">${escapeHtml(n.content)}</p>
                </div>
            `).join('');
        };

        // HESAPLAMA TAB

        // Filtreler & Sıralama
        window.toggleFilterPanel = () => document.getElementById('filterPanel').classList.toggle('hidden');
        window.resetFilters = () => {
            currentPersonFilter = 'Tümü'; currentCategoryFilter = 'Tümü'; currentPaymentFilter = 'Tümü';
            currentStartDateFilter = ''; currentEndDateFilter = ''; currentShowInstallments = false;
            currentSearchFilter = '';
            document.getElementById('filterPerson').value = 'Tümü';
            document.getElementById('filterCategory').value = 'Tümü';
            document.getElementById('filterPayment').value = 'Tümü';
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
            currentStartDateFilter = document.getElementById('filterStartDate').value;
            currentEndDateFilter = document.getElementById('filterEndDate').value;
            currentShowInstallments = document.getElementById('filterShowInstallments').checked;
            renderTable();
        };
        window.sortTable = (col) => {
            if (sortColumn === col) sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            else { sortColumn = col; sortDirection = 'asc'; }
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

        window.downloadExcel = function() {
            try {
                const rows = [];
                rows.push(['Tip', 'Tarih', 'Kişi', 'Kategori', 'Ödeme', 'Açıklama', 'Tutar', 'Taksit', 'Dönem']);
                const processed = (typeof getProcessedExpenses === 'function') ? getProcessedExpenses() : expenses;
                processed.forEach(e => {
                    rows.push([
                        'Harcama',
                        e.date || '',
                        e.person || '',
                        e.category || '',
                        e.paymentType || '',
                        e.description || '',
                        String(e.displayAmount != null ? e.displayAmount : e.amount || 0).replace('.', ','),
                        e.installmentLabel || '',
                        e.effectiveMonth || ''
                    ]);
                });
                const escapeCsv = (v) => {
                    const s = String(v == null ? '' : v);
                    if (/[;"\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
                    return s;
                };
                const csv = '\uFEFF' + rows.map(r => r.map(escapeCsv).join(';')).join('\r\n');
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                const d = new Date();
                const stamp = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
                a.href = url;
                a.download = 'yuvam-yedek-' + stamp + '.csv';
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                showToast('Yedek indirildi (CSV — Excel ile açılır)', 'success');
                logActivity('Diğer', 'CSV yedek indirildi', rows.length - 1 + ' satır');
            } catch (err) {
                console.error(err);
                showToast('Yedek indirilemedi: ' + (err.message || err), 'error');
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
        (function restoreSessionIfAny() {
            try {
                const raw = sessionStorage.getItem('yuvam_user');
                if (!raw) return;
                const u = JSON.parse(raw);
                if (!u || !u.name) return;
                currentUser = { name: u.name, role: u.role === 'admin' ? 'admin' : 'user' };
                const loginEl = document.getElementById('errorContainer') || document.getElementById('loginScreen');
                const appEl = document.getElementById('appContainer') || document.getElementById('app');
                if (loginEl) {
                    loginEl.classList.add('hidden');
                    loginEl.style.display = 'none';
                }
                if (appEl) {
                    appEl.classList.remove('hidden');
                    appEl.style.display = '';
                }
                const label = document.getElementById('loggedInUserLabel') || document.getElementById('currentUserLabel');
                if (label) {
                    label.textContent = currentUser.role === 'admin'
                        ? (currentUser.name + ' · Admin')
                        : currentUser.name;
                }
                applyRoleAndTabs();
                initRealtimeSync();
            } catch (err) {
                console.warn('restoreSession', err);
            }
        })();
