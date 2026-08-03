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
        // Varsayılan giriş (Firebase settings/appUsers yoksa). Mümkünse şifreleri Firestore'a taşıyın.
        let USERS = {
            Bekir: { password: '3652', role: 'admin' },
            Duygu: { password: '7536', role: 'user' }
        };

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
            { id: 'calculator', emoji: '🧮', label: 'Hesaplama', visible: true, core: true, adminOnly: false },
            { id: 'settings', emoji: '⚙️', label: 'Ayarlar', visible: true, core: true, adminOnly: true },
            { id: 'trash', emoji: '🗑️', label: 'Çöp Kutusu', visible: true, core: true, adminOnly: true }
        ];

        let tabsConfig = DEFAULT_TABS.map(t => ({ ...t }));

        window.handlePasswordKeyPress = function(event) {
            if (event.key === 'Enter') checkPassword();
        };

        window.checkPassword = function() {
            try {
                const userName = document.getElementById('loginUser').value;
                const input = document.getElementById('sifreInput').value;
                if (!userName) {
                    showToast('Lütfen kullanıcı seçin', 'error');
                    return;
                }
                const account = USERS[userName];
                if (!account || input !== account.password) {
                    showToast('Kullanıcı veya şifre hatalı', 'error');
                    document.getElementById('sifreInput').value = '';
                    return;
                }
                currentUser = { name: userName, role: account.role };
                try { sessionStorage.setItem('yuvam_session', JSON.stringify({ name: userName, role: account.role, t: Date.now() })); } catch (_) {}
                document.getElementById('errorContainer').classList.add('hidden');
                document.getElementById('appContainer').classList.remove('hidden');
                const label = document.getElementById('loggedInUserLabel');
                if (label) {
                    label.textContent = currentUser.role === 'admin'
                        ? `${currentUser.name} · Admin`
                        : `${currentUser.name}`;
                }
                initRealtimeSync();
                applyRoleAndTabs();
                logActivity('Giriş', 'Oturum açıldı', currentUser.role === 'admin' ? 'Admin girişi' : 'Kullanıcı girişi');
                maybeShowOnboarding();
            } catch (err) {
                console.error(err);
                showToast('Giriş sırasında hata: ' + (err && err.message ? err.message : err), 'error');
            }
        };

        window.logout = function() {
            const name = currentUser ? currentUser.name : 'Sistem';
            logActivity('Çıkış', 'Oturum kapatıldı', name + ' çıkış yaptı', name);
            currentUser = null;
            try { sessionStorage.removeItem('yuvam_session'); } catch (_) {}
            document.getElementById('appContainer').classList.add('hidden');
            document.getElementById('errorContainer').classList.remove('hidden');
            document.getElementById('sifreInput').value = '';
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
        let expenses = [], incomes = [], notes = [], deletedExpenses = [];
        let categories = ["Gıda", "Araç", "Faturalar", "Eğlence", "Sağlık", "Eğitim", "Diğer", "Kredi Kartı Borcu"];
        let paymentTypes = ["Nakit", "Kredi Kartı"];
        let bekirDebt = { amount: 0, paid: false, dueDate: '' };
        let duyguDebt = { amount: 0, paid: false, dueDate: '' };
        let cardStatements = [];
        let activityLog = [];
        let activityFilter = { user: "Tümü", action: "Tümü", start: "", end: "" };
        let ibans = [];
        
        let sortColumn = 'date', sortDirection = 'desc';
        let currentPersonFilter = 'Tümü', currentCategoryFilter = 'Tümü', currentPaymentFilter = 'Tümü';
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
            const coreIds = ["expense", "vehicle", "stats", "notes", "calculator", "settings", "trash"];
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
        window.openIncomeModal = () => {
            document.getElementById('incomeDate').valueAsDate = new Date();
            document.getElementById('incomeModal').classList.remove('hidden');
            document.getElementById('incomeModal').classList.add('flex');
        };
        window.closeIncomeModal = () => document.getElementById('incomeModal').classList.add('hidden');
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
            db.collection("incomes").onSnapshot(snap => {
                incomes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
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
                    // Tekilleştir
                    categories = [...new Set(categories)];
                    if (!categories.includes('Araç')) categories.splice(1, 0, 'Araç');
                }
                updateCategorySelects();
                renderCategoriesList();
            }, err => console.error("Kategori yükleme hatası:", err));
            db.collection("settings").doc("appUsers").onSnapshot(d => {
                if (d.exists && d.data() && d.data().users && typeof d.data().users === 'object') {
                    const u = d.data().users;
                    // Örnek yapı: { Bekir: { password: '...', role: 'admin' }, Duygu: { ... } }
                    Object.keys(u).forEach(name => {
                        if (u[name] && u[name].password) {
                            USERS[name] = {
                                password: String(u[name].password),
                                role: u[name].role === 'admin' ? 'admin' : 'user'
                            };
                        }
                    });
                }
            }, err => console.warn('appUsers:', err));
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

        window.toggleCardDebt = async (person) => {
            let debt = person === 'bekir' ? bekirDebt : duyguDebt;
            if (!debt.paid && debt.amount > 0 && debt.dueDate) {
                if (!confirm(`${person.toUpperCase()} borcu ödendi olarak işaretlensin mi? Bu tutar bütçeden düşülecektir.`)) return;
                
                const dueDate = new Date(debt.dueDate);
                const previousMonth = new Date(dueDate.getFullYear(), dueDate.getMonth() - 1);
                const statementMonth = `${previousMonth.getFullYear()}-${String(previousMonth.getMonth() + 1).padStart(2, '0')}`;
                
                const statementData = {
                    person: person,
                    month: statementMonth,
                    amount: debt.amount,
                    dueDate: debt.dueDate,
                    paidDate: new Date().toISOString().split('T')[0],
                    status: 'paid'
                };
                
                await db.collection("cardStatements").doc(`${person}_${statementMonth}`).set(statementData);
            } else if (debt.paid) {
                const dueDate = new Date(debt.dueDate);
                const previousMonth = new Date(dueDate.getFullYear(), dueDate.getMonth() - 1);
                const statementMonth = `${previousMonth.getFullYear()}-${String(previousMonth.getMonth() + 1).padStart(2, '0')}`;
                
                const docRef = db.collection("cardStatements").doc(`${person}_${statementMonth}`);
                const docSnap = await docRef.get();
                if (docSnap.exists) {
                    await docRef.delete();
                }
            }
            
            debt.paid = !debt.paid;
            await db.collection("settings").doc(person + "Debt").set(debt);
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

        window.onCategoryChange = function() {
            const cat = document.getElementById('category');
            const wrap = document.getElementById('vehicleSubtypeWrap');
            if (!cat || !wrap) return;
            const isVehicle = cat.value === 'Araç' || cat.value === 'Ulaşım';
            wrap.classList.toggle('hidden', !isVehicle);
            const sel = document.getElementById('vehicleSubtype');
            if (sel && isVehicle && !sel.value) sel.value = 'Yakıt';
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

        let vehicleFuelChart = null, vehicleMaintChart = null;
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

            // Aylık grafikler (son 6 takvim ayı)
            const buildMonthly = (items) => {
                const keys = [];
                const now = new Date();
                for (let i = 5; i >= 0; i--) {
                    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    keys.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
                }
                const labels = keys.map(k => {
                    const [y,m] = k.split('-').map(Number);
                    const months = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
                    return months[m-1] + ' ' + y;
                });
                const data = keys.map(k => items.filter(e => String(e.date||'').startsWith(k)).reduce((s,e)=>s+(e.displayAmount||0),0));
                return { labels, data };
            };

            const fuelM = buildMonthly(fuelItems);
            const maintM = buildMonthly(maintItems.filter(e => vehicleKind(e) === 'maint'));

            const ctxF = document.getElementById('vehicleFuelChart');
            if (ctxF) {
                if (vehicleFuelChart) vehicleFuelChart.destroy();
                vehicleFuelChart = new Chart(ctxF, {
                    type: 'bar',
                    data: {
                        labels: fuelM.labels,
                        datasets: [{ label: 'Yakıt (TL)', data: fuelM.data, backgroundColor: '#4f46e5', borderRadius: 8 }]
                    },
                    options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
                });
            }
            const ctxM = document.getElementById('vehicleMaintChart');
            if (ctxM) {
                if (vehicleMaintChart) vehicleMaintChart.destroy();
                vehicleMaintChart = new Chart(ctxM, {
                    type: 'bar',
                    data: {
                        labels: maintM.labels,
                        datasets: [{ label: 'Vergi & Bakım (TL)', data: maintM.data, backgroundColor: '#f59e0b', borderRadius: 8 }]
                    },
                    options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
                });
            }
        };

        window.handleFormSubmit = async (e) => {
            e.preventDefault();
            const id = document.getElementById('editId').value;
            const amount = parseFloat(document.getElementById('amount').value);
            const installment = parseInt(document.getElementById('installmentCount').value) || 1;
            const person = document.getElementById('person').value;
            const paymentType = document.getElementById('paymentType').value;
            const date = document.getElementById('date').value;
            const description = document.getElementById('description').value || '-';
            const category = document.getElementById('category').value;
            let vehicleSubtype = '';
            let fuelKm = null, fuelLiters = null, fuelPricePerLt = null;
            let fuelNote = '';
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
                amount, 
                installmentCount: installment,
                amountPerInstallment: amount / installment,
                person: person,
                category: category === 'Ulaşım' ? 'Araç' : category,
                paymentType: paymentType,
                date: date,
                description: description,
                expenseMonth: date.substring(0, 7),
                statementPeriod: getPeriodKeyForDateStr(date),
                vehicleSubtype: (category === 'Araç' || category === 'Ulaşım') ? vehicleSubtype : '',
                fuelKm: fuelKm,
                fuelLiters: fuelLiters,
                fuelPricePerLt: fuelPricePerLt,
                fuelNote: fuelNote || ''
            };
            
            try {
                if (id) {
                    await db.collection("expenses").doc(id).update(data);
                } else {
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
            document.getElementById('installmentCount').value = e.installmentCount || 1;
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
            if (typeof onVehicleSubtypeChange === 'function') onVehicleSubtypeChange();
            const fk = document.getElementById('fuelKm');
            const fl = document.getElementById('fuelLiters');
            const fp = document.getElementById('fuelPricePerLt');
            if (fk) fk.value = e.fuelKm != null ? e.fuelKm : '';
            if (fl) fl.value = e.fuelLiters != null ? e.fuelLiters : '';
            if (fp) fp.value = e.fuelPricePerLt != null ? e.fuelPricePerLt : '';
            openExpenseModal();
        };

        // Gelir Yönetimi
        window.handleIncomeSubmit = async (e) => {
            e.preventDefault();
            const data = {
                type: document.getElementById('incomeType').value,
                amount: parseFloat(document.getElementById('incomeAmount').value),
                date: document.getElementById('incomeDate').value,
                description: document.getElementById('incomeDescription').value || '-',
                incomeMonth: document.getElementById('incomeDate').value.substring(0, 7)
            };
            await db.collection("incomes").add(data);
            closeIncomeModal();
            logActivity('Gelir', 'Gelir eklendi', (data.type || '') + ' · ' + data.amount + ' TL');
        };

        window.deleteIncome = async (id) => {
            if (!confirm("Geliri silmek istediğinize emin misiniz?")) return;
            await db.collection("incomes").doc(id).delete();
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
                const perAmount = item.amountPerInstallment || (item.amount / count);
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
                        installmentEntries.push({
                            ...item,
                            id: item.id + '_ins_' + i,
                            displayAmount: perAmount,
                            installmentLabel: `Taksit ${i + 1}/${count}`,
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

                return true;
            });

            filtered.sort((a, b) => {
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
                    <td class="px-6 py-5"><span class="bg-slate-100 px-2 py-1 rounded text-[10px]">${escapeHtml(item.category)}</span></td>
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
                        maintainAspectRatio: true,
                        onClick: (evt, elements) => {
                            if (!elements || !elements.length) return;
                            const idx = elements[0].index;
                            const cat = catLabels[idx];
                            if (cat) showCategoryExpenses(cat);
                        },
                        plugins: {
                            legend: {
                                position: 'bottom',
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
                weeklyTrendChart = new Chart(ctx2, {
                    type: 'line',
                    data: {
                        labels: Object.keys(weekData),
                        datasets: [{
                            label: 'Harcama',
                            data: Object.values(weekData),
                            borderColor: '#4f46e5',
                            backgroundColor: 'rgba(79, 70, 229, 0.1)',
                            borderWidth: 3,
                            fill: true,
                            tension: 0.4
                        }]
                    },
                    options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: true } } }
                });
            }

            const periodKeys = getPreviousPeriodKeys(12);
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
                            label: 'Dönem Harcaması',
                            data: Object.values(monthData),
                            backgroundColor: '#4f46e5',
                            borderRadius: 10
                        }]
                    },
                    options: { responsive: true, maintainAspectRatio: true }
                });
            }
        }

        // Raporlar
        function renderMonthlyReports() {
            const period = getCurrentPeriod();
            const processedExpenses = getProcessedExpenses().filter(e => e.effectiveMonth === period);
            
            const monthlySummary = document.getElementById('monthlySummaryReport');
            const total = processedExpenses.reduce((s, e) => s + e.displayAmount, 0);
            const periodInfo = getCurrentStatementPeriod();
            if (!monthlySummary) return;
            monthlySummary.innerHTML = `
                <h3 class="text-xl font-black mb-4">Aktif Ekstre Dönemi</h3>
                <p class="text-xs font-bold text-indigo-500 mb-3">${periodInfo.label}</p>
                <div class="text-4xl font-black text-rose-600 mb-2">${total.toLocaleString('tr-TR')} TL</div>
                <p class="text-sm text-slate-500">Toplam Harcama (29–28)</p>
            `;

            const personSummary = document.getElementById('personSummaryReport');
            const bekirSum = processedExpenses.filter(e => e.person === 'Bekir').reduce((s, e) => s + e.displayAmount, 0);
            const duyguSum = processedExpenses.filter(e => e.person === 'Duygu').reduce((s, e) => s + e.displayAmount, 0);
            personSummary.innerHTML = `
                <h3 class="text-xl font-black mb-4">Kişi Bazında</h3>
                <div class="space-y-3">
                    <div class="flex justify-between"><span>Bekir</span><span class="font-black text-blue-600">${bekirSum.toLocaleString('tr-TR')} TL</span></div>
                    <div class="flex justify-between"><span>Duygu</span><span class="font-black text-pink-600">${duyguSum.toLocaleString('tr-TR')} TL</span></div>
                </div>
            `;

            const categoryData = {};
            processedExpenses.forEach(e => {
                categoryData[e.category] = (categoryData[e.category] || 0) + e.displayAmount;
            });
            const detailedReport = document.getElementById('detailedMonthlyReport');
            detailedReport.innerHTML = Object.entries(categoryData).map(([cat, amt]) => `
                <button type="button" onclick="showCategoryExpenses('${String(cat).replace(/'/g, "\\'")}')" class="bg-slate-50 p-4 rounded-2xl text-left w-full hover:bg-indigo-50 hover:border-indigo-200 border border-transparent transition">
                    <div class="font-bold text-sm">${cat}</div>
                    <div class="text-2xl font-black text-indigo-600">${amt.toLocaleString('tr-TR')} TL</div>
                    <div class="text-[10px] text-slate-400 font-bold mt-1">Detay için tıkla</div>
                </button>
            `).join('');

            renderCardStatements('bekir');
            renderCardStatements('duygu');
            renderCurrentStatements();
        }

        function renderCardStatements(person) {
            const sortedStatements = cardStatements
                .filter(s => s.person === person)
                .sort((a, b) => new Date(b.month) - new Date(a.month));
            
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
                const perAmount = item.amountPerInstallment || (item.amount / count);
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

            (saved || []).forEach(s => {
                if (!s || !s.id) return;
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

        window.renderCustomTabPage = function(tab) {
            const body = document.getElementById('customTabBody');
            const title = document.getElementById('customTabTitle');
            if (!body || !tab) return;
            title.textContent = `${tab.emoji || ''} ${tab.label}`;
            const detected = detectWidgetType(tab.content || tab.label || '');
            const type = (tab.widgetType && tab.widgetType !== 'ai' && tab.widgetType !== 'text')
                ? tab.widgetType
                : detected;
            body.innerHTML = buildWidgetHtml(type, tab.content);
            if (tab.content && type !== 'text') {
                const hint = document.createElement('p');
                hint.className = 'text-[11px] text-slate-400 text-center mt-6 font-medium';
                hint.textContent = 'İstek: “' + tab.content + '”';
                body.appendChild(hint);
            }
            setTimeout(() => bindWidgetBehaviors(type, tab.id), 0);
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
            const btn = document.getElementById('addTabBtn');
            if (!label) {
                alert('Sekme adı gerekli');
                return;
            }
            const id = 'custom_' + Date.now();
            const widgetType = detectWidgetType(content || label);
            if (btn) { btn.disabled = true; btn.textContent = 'Ekleniyor...'; }
            tabsConfig.push({
                id, emoji: emoji || '📌', label, visible: true, core: false,
                adminOnly: vis.adminOnly,
                visibleTo: vis.visibleTo,
                content, widgetType
            });
            document.getElementById('newTabEmoji').value = '';
            document.getElementById('newTabLabel').value = '';
            document.getElementById('newTabContent').value = '';
            try {
                await saveTabsConfig();
                applyRoleAndTabs();
                renderTabsList();
            } catch (err) {
                alert('Kayıt hatası: ' + (err.message || err));
            }
            if (btn) { btn.disabled = false; btn.textContent = 'Sekme Ekle'; }
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
                container.innerHTML = `<div class="text-center text-slate-400 py-8"><p class="text-sm">Henüz kategori yok. Yukarıdan ekleyebilirsiniz.</p></div>`;
                return;
            }
            container.innerHTML = categories.map((cat, idx) => `
                <div class="bg-slate-50 p-3.5 rounded-xl border border-slate-100 flex justify-between items-center hover:border-indigo-200 hover:bg-white transition group">
                    <div class="flex items-center gap-3 flex-1 min-w-0">
                        <span class="w-8 h-8 rounded-lg bg-white border border-slate-100 flex items-center justify-center text-sm shrink-0 shadow-sm">${idx + 1}</span>
                        <span class="font-bold text-slate-800 truncate text-sm">${escapeHtml(cat)}</span>
                    </div>
                    <div class="flex gap-0.5 shrink-0 opacity-70 group-hover:opacity-100 transition">
                        <button onclick="renameCategory(${idx})" class="text-slate-400 hover:text-indigo-600 transition p-2 rounded-lg hover:bg-indigo-50" title="Yeniden Adlandır">✏️</button>
                        <button onclick="moveCategoryUp(${idx})" class="text-slate-400 hover:text-indigo-600 transition p-2 rounded-lg hover:bg-indigo-50" title="Yukarı Taşı" ${idx === 0 ? 'disabled style="opacity:0.3"' : ''}>⬆️</button>
                        <button onclick="moveCategoryDown(${idx})" class="text-slate-400 hover:text-indigo-600 transition p-2 rounded-lg hover:bg-indigo-50" title="Aşağı Taşı" ${idx === categories.length - 1 ? 'disabled style="opacity:0.3"' : ''}>⬇️</button>
                        <button onclick="removeCategory(${idx})" class="text-slate-400 hover:text-rose-600 transition p-2 rounded-lg hover:bg-rose-50" title="Sil">🗑️</button>
                    </div>
                </div>
            `).join('');
        };

        window.renameCategory = async (index) => {
            const oldName = categories[index];
            const newName = prompt('Yeni kategori adı:', oldName);
            if (newName === null) return;
            const trimmed = newName.trim();
            if (!trimmed) {
                alert('Kategori adı boş olamaz');
                return;
            }
            if (trimmed !== oldName && categories.includes(trimmed)) {
                alert('Bu kategori zaten var');
                return;
            }
            categories[index] = trimmed;
            await saveCategoryOrder();
            updateCategorySelects();
            renderCategoriesList();
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
        window.showCalculatorTab = (type) => {
            const fuelArea = document.getElementById('fuelCalculatorArea');
            const percArea = document.getElementById('percentageCalculatorArea');
            const fuelBtn = document.getElementById('fuelBtn');
            const percBtn = document.getElementById('percentageBtn');

            if (type === 'fuel') {
                fuelArea.classList.remove('hidden');
                percArea.classList.add('hidden');
                fuelBtn.classList.add('border-indigo-600');
                fuelBtn.classList.remove('border-slate-200');
                percBtn.classList.remove('border-indigo-600');
                percBtn.classList.add('border-slate-200');
            } else {
                fuelArea.classList.add('hidden');
                percArea.classList.remove('hidden');
                percBtn.classList.add('border-indigo-600');
                percBtn.classList.remove('border-slate-200');
                fuelBtn.classList.remove('border-indigo-600');
                fuelBtn.classList.add('border-slate-200');
            }
        };

        window.calculateFuel = () => {
            const amount = parseFloat(document.getElementById('paidAmount').value);
            const price = parseFloat(document.getElementById('fuelPrice').value);
            const dist = parseFloat(document.getElementById('distance').value);

            if (!amount || !price || !dist) return;

            const liters = amount / price;
            const lPer100 = (liters / dist) * 100;
            const costPer100 = lPer100 * price;
            const costPerKm = amount / dist;

            document.getElementById('consumptionLiter').innerText = lPer100.toFixed(2) + " L";
            document.getElementById('consumptionCost').innerText = costPer100.toFixed(2) + " TL";
            document.getElementById('costPerKm').innerText = costPerKm.toFixed(2) + " TL";
            document.getElementById('fuelResults').classList.remove('hidden');
        };

        window.calculatePercentage = () => {
            const a = parseFloat(document.getElementById('numberA').value);
            const b = parseFloat(document.getElementById('numberB').value);
            const op = document.getElementById('operationType').value;

            if (isNaN(a) || isNaN(b) || !op) return;

            let res = 0;
            if (op === 'percentOfNumber') res = (a * b) / 100;
            else if (op === 'percentageOfTotal') res = (a / b) * 100;
            else if (op === 'changePercent') res = ((b - a) / a) * 100;
            else if (op === 'increaseByPercent') res = a * (1 + b / 100);
            else if (op === 'decreaseByPercent') res = a * (1 - b / 100);

            document.getElementById('percentageResult').innerText = res.toFixed(2);
            document.getElementById('percentageResults').classList.remove('hidden');
        };

        // Filtreler & Sıralama
        window.toggleFilterPanel = () => document.getElementById('filterPanel').classList.toggle('hidden');
        window.resetFilters = () => {
            currentPersonFilter = 'Tümü'; currentCategoryFilter = 'Tümü'; currentPaymentFilter = 'Tümü';
            currentStartDateFilter = ''; currentEndDateFilter = ''; currentShowInstallments = false;
            document.getElementById('filterPerson').value = 'Tümü';
            document.getElementById('filterCategory').value = 'Tümü';
            document.getElementById('filterPayment').value = 'Tümü';
            document.getElementById('filterStartDate').value = '';
            document.getElementById('filterEndDate').value = '';
            document.getElementById('filterShowInstallments').checked = false;
            renderTable();
        };
        window.applyFilters = () => {
            currentPersonFilter = document.getElementById('filterPerson').value;
            currentCategoryFilter = document.getElementById('filterCategory').value;
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

