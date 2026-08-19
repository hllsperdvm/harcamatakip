/* YUVAM modül parçası — sırayla yüklenir (ES module değil, ortak global scope)
 * Firebase init, auth, bildirimler, dönem, anasayfa, ayet
 * GitHub: js/ klasörünün tamamını yükleyin.
 */
        // Firebase Compat (yerel file:// ile çalışır; modül gerekmez)
        if (typeof firebase === 'undefined') {
            console.error('Firebase SDK henüz yok — bootstrap beklenmeli');
            throw new Error('Firebase SDK yüklenmedi');
        }
        // Firebase web apiKey kasıtlı olarak istemcidedir; koruma Firestore Rules + Auth ile sağlanır.
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
        const auth = firebase.auth();
        try { auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL); } catch (_) {}
        // Çevrimdışı önbellek: veri ekle/düzenle internet yokken de çalışır, sonra senkron
        try {
            db.enablePersistence({ synchronizeTabs: true }).catch(function(err) {
                if (err && err.code === 'failed-precondition') {
                    console.warn('Firestore persistence: birden fazla sekme açık');
                } else if (err && err.code === 'unimplemented') {
                    console.warn('Firestore persistence bu tarayıcıda yok');
                } else {
                    console.warn('Firestore persistence', err);
                }
            });
        } catch (e) { console.warn('enablePersistence', e); }

        window._yuvamOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
        window.updateOnlineStatus = function() {
            const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
            window._yuvamOnline = online;
            const ban = document.getElementById('offlineBanner');
            if (ban) {
                if (online) ban.classList.add('hidden');
                else ban.classList.remove('hidden');
            }
            try {
                document.body.classList.toggle('yuvam-offline', !online);
                
            } catch (_) {}
            return online;
        };
        window.addEventListener('online', function() {
            
            updateOnlineStatus();
            try { showToast('İnternet geldi — veriler senkronlanıyor', 'success'); } catch (_) {}
            try { if (typeof refreshAppNotifications === 'function') refreshAppNotifications(); } catch (_) {}
        });
        window.addEventListener('offline', function() {
            updateOnlineStatus();
            try { showToast('Çevrimdışısınız — kayıtlar cihazda saklanır', 'info'); } catch (_) {}
        });
        try { updateOnlineStatus(); } catch (_) {}



        // PWA / offline kabuk
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
                navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(function(reg) { try { reg.update(); } catch(_){} }).catch(function(e) {
                    console.warn('SW kayıt', e);
                });
            });
        }


        // Auth e-posta eşlemesi (Console'da oluşturulan kullanıcılar)
        // Sabit aylık gelir — UI'da gösterilmez; AI/yerel öneride kullanılır
        const HOUSEHOLD_MONTHLY_INCOME = 110000;

        const AUTH_EMAIL_BY_NAME = {
            Bekir: 'bekir@yuvam.app',
            Duygu: 'duygu@yuvam.app'
        };
        const NAME_BY_AUTH_EMAIL = {
            'bekir@yuvam.app': 'Bekir',
            'duygu@yuvam.app': 'Duygu'
        };

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
            if (code.indexOf('auth/') === 0) {
                return 'Kimlik doğrulama: ' + msg;
            }
            return 'İşlem başarısız: ' + msg;
        }



        // Kullanıcı hesapları: Bekir = admin, Duygu = normal
        // Kimlik: Firebase Auth. Rol: Firestore users/{uid}
        let openrouterApiKey = ''; // Firestore settings/apiKeys.openrouter — koda yazılmaz
        let collectApiKey = ''; // Firestore settings/apiKeys.collectapi — CollectAPI spor
        try { window.openrouterApiKey = ''; window.collectApiKey = ''; } catch (_) {}
        let superLigFixturesCache = []; // bellek önbelleği
        let publicHolidaysCache = [];
        let publicHolidaysAt = 0;
        let _weatherDailyCache = null;
        let _weatherDailyAt = 0;

        let superLigLastFetch = 0;

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
            { id: 'home', emoji: '🏠', label: 'Ana Sayfa', visible: true, core: true, adminOnly: false },
            { id: 'expense', emoji: '💰', label: 'Bütçe Takip', visible: true, core: true, adminOnly: false },
            { id: 'shopping', emoji: '🛒', label: 'Alışveriş', visible: true, core: true, adminOnly: false },
            { id: 'vehicle', emoji: '🚗', label: 'Araç', visible: true, core: true, adminOnly: false },
            { id: 'stats', emoji: '📊', label: 'Raporlar', visible: true, core: true, adminOnly: false },
            { id: 'plan', emoji: '📋', label: 'Plan', visible: true, core: true, adminOnly: false },
            { id: 'settings', emoji: '⚙️', label: 'Ayarlar', visible: true, core: true, adminOnly: true },
            { id: 'trash', emoji: '🗑️', label: 'Çöp Kutusu', visible: true, core: true, adminOnly: true }
        ];

        // Mobil: Ana · Bütçe · Raporlar · Plan · Daha
        const MOBILE_NAV_PRIMARY_DEFAULT = ['home', 'expense', 'stats', 'plan'];

        let familyCalendar = [];
        let familyTasks = [];
        let familyShopping = [];
        let goldHoldings = [];
        let goldPricePerGram = null; // 24 satış (değerleme)
        let goldPricePerGram22 = null; // 22 satış
        let goldQuotes = { buy24: null, sell24: null, buy22: null, sell22: null };

        let tabsConfig = DEFAULT_TABS.map(t => ({ ...t }));

        try {
            if (typeof Chart !== 'undefined' && Chart.defaults && Chart.defaults.elements && Chart.defaults.elements.point) {
                Chart.defaults.elements.point.radius = 8;
                Chart.defaults.elements.point.hoverRadius = 12;
                Chart.defaults.elements.point.hitRadius = 28;
            }
        } catch (_) {}

        window.handlePasswordKeyPress = function(event) {
            if (event.key === 'Enter') checkPassword();
        };

        window.checkPassword = async function() {
            const btn = document.getElementById('loginBtn');
            const setBusy = function(busy) {
                if (!btn) return;
                btn.disabled = !!busy;
                btn.textContent = busy ? 'Giriş yapılıyor…' : 'Giriş Yap';
                btn.style.opacity = busy ? '0.7' : '';
            };
            try {
                if (typeof firebase === 'undefined' || !auth) {
                    alert('Firebase henüz yüklenmedi. Birkaç saniye bekleyip tekrar deneyin veya Ctrl+F5 yapın.');
                    return;
                }
                const userName = (document.getElementById('loginUser') || {}).value;
                const input = (document.getElementById('sifreInput') || {}).value;
                if (!userName) {
                    alert('Lütfen kullanıcı seçin.');
                    return;
                }
                if (!input) {
                    alert('Lütfen şifre girin.');
                    return;
                }
                const email = AUTH_EMAIL_BY_NAME[userName];
                if (!email) {
                    alert('Geçersiz kullanıcı.');
                    return;
                }

                setBusy(true);
                let cred;
                try {
                    const signInPromise = auth.signInWithEmailAndPassword(email, input);
                    const timeoutPromise = new Promise(function(_, reject) {
                        setTimeout(function() {
                            reject(Object.assign(new Error('Zaman aşımı: Firebase yanıt vermedi. İnternet bağlantınızı kontrol edin.'), { code: 'timeout' }));
                        }, 20000);
                    });
                    cred = await Promise.race([signInPromise, timeoutPromise]);
                } catch (authErr) {
                    const code = (authErr && authErr.code) || '';
                    if (code === 'timeout') {
                        alert(authErr.message || 'Giriş zaman aşımına uğradı.');
                        return;
                    }
                    if (code === 'auth/wrong-password' || code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials') {
                        alert('Şifre hatalı. Firebase Console → Authentication → Users içindeki şifreyi kullanın.');
                        return;
                    }
                    if (code === 'auth/user-not-found') {
                        alert('Kullanıcı bulunamadı. Console → Authentication → Users kontrol edin.');
                        return;
                    }
                    if (code === 'auth/too-many-requests') {
                        alert('Çok fazla deneme. Bir süre sonra tekrar deneyin.');
                        return;
                    }
                    if (code === 'auth/network-request-failed') {
                        alert('Ağ hatası. İnternet bağlantınızı kontrol edin.');
                        return;
                    }
                    alert('Giriş hatası: ' + ((authErr && authErr.message) || authErr));
                    return;
                }

                const fbUser = cred.user;
                const profile = await loadUserProfile(fbUser);
                await enterAppAsUser(profile);
            } catch (err) {
                console.error(err);
                alert('Giriş hatası: ' + (err && err.message ? err.message : err));
            } finally {
                setBusy(false);
            }
        };

        function loadUserProfileFast(fbUser) {
            const email = ((fbUser && fbUser.email) || '').toLowerCase();
            let name = NAME_BY_AUTH_EMAIL[email] || NAME_BY_AUTH_EMAIL[(fbUser && fbUser.email) || ''] || '';
            if (!name) {
                name = email.indexOf('bekir') >= 0 ? 'Bekir' : (email.indexOf('duygu') >= 0 ? 'Duygu' : ((fbUser && fbUser.email) || 'Kullanıcı'));
            }
            const role = name === 'Bekir' ? 'admin' : 'user';
            return {
                name: name,
                role: role,
                uid: fbUser.uid,
                email: fbUser.email || email
            };
        }

        async function loadUserProfile(fbUser) {
            // Hızlı yol: e-posta eşlemesi (Firestore beklemeden)
            const profile = loadUserProfileFast(fbUser);
            // Arka planda Firestore rol/ad güncelle (UI'yı bloklamaz)
            try {
                db.collection('users').doc(fbUser.uid).get().then(function(snap) {
                    if (!snap.exists) return;
                    const d = snap.data() || {};
                    if (currentUser && currentUser.uid === fbUser.uid) {
                        if (d.name) currentUser.name = d.name;
                        if (d.role) currentUser.role = d.role;
                        const label = document.getElementById('loggedInUserLabel') || document.getElementById('currentUserLabel');
                        if (label && currentUser) {
                            label.textContent = currentUser.role === 'admin'
                                ? (currentUser.name + ' · Admin')
                                : currentUser.name;
                        }
                        if (typeof applyRoleAndTabs === 'function') applyRoleAndTabs();
                    }
                }).catch(function() {});
            } catch (e) {
                console.warn('users profil:', e);
            }
            return profile;
        }

        async function enterAppAsUser(profile, opts) {
            opts = opts || {};
            currentUser = profile;
            try { sessionStorage.setItem('yuvam_user', JSON.stringify(currentUser)); } catch (_) {}
            // Kullanıcıya özel tema
            try { if (typeof loadThemeFromStorage === 'function') loadThemeFromStorage(); } catch (_) {}
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
            try {
                document.body.classList.add('yuvam-app-open');
                document.documentElement.classList.add('yuvam-app-open');
            } catch (_) {}
            try { if (typeof showAppSkeleton === 'function') showAppSkeleton(); } catch (_) {}
            const label = document.getElementById('loggedInUserLabel') || document.getElementById('currentUserLabel');
            if (label) {
                label.textContent = currentUser.role === 'admin'
                    ? (currentUser.name + ' · Admin')
                    : currentUser.name;
            }
            applyRoleAndTabs();
            if (typeof applyDashboardCards === 'function') applyDashboardCards();
            try { if (typeof updateAdminLayoutButtons === 'function') updateAdminLayoutButtons(); } catch (_) {}
            // Once UI acilsin; senkron ve loglari ertele (mobil otomatik girisi hizlandirir)
            var uidEnter = currentUser && currentUser.uid;
            setTimeout(function() {
                if (!currentUser || currentUser.uid !== uidEnter) return;
                try { _bootRenderQuietUntil = Date.now() + 1500; } catch (_) {}
                try { initRealtimeSync(); } catch (e) { console.error('sync', e); showToast('Veri bağlantısı kurulamadı', 'error'); }
                try {
                    if (!opts.silent) {
                        logActivity('Giriş', 'Oturum açıldı', currentUser.role === 'admin' ? 'Admin girişi' : 'Kullanıcı girişi');
                    }
                } catch (_) {}
                // Bildirim / onboarding: biraz sonra (ilk boyamayı engellemesin)
                setTimeout(function() {
                    if (!currentUser || currentUser.uid !== uidEnter) return;
                                        try { if (typeof refreshAppNotifications === 'function') refreshAppNotifications(); } catch (_) {}
                }, 1200);
                // Fikstür / tatil / altın: girişte ASLA — ilgili sekme veya boşta çok geç
            }, 0);
            if (!opts || !opts.silent) {
                showToast('Hoş geldin, ' + currentUser.name, 'success');
            }
        }


        // ========== BİLDİRİMLER (site içi) ==========
        function daysUntilYMD(ymd) {
            const d = parseYMD(ymd);
            if (!d) return null;
            const t = parseYMD(todayDateStr());
            if (!t) return null;
            const ms = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
            return Math.round(ms / 86400000);
        }

        function getNotifSeenKeys() {
            try {
                return new Set(JSON.parse(localStorage.getItem('yuvam_notif_seen') || '[]'));
            } catch (_) {
                return new Set();
            }
        }

        function markNotifsSeen(items) {
            try {
                const seen = getNotifSeenKeys();
                (items || []).forEach(function(n) {
                    if (n && n.key) seen.add(n.key);
                });
                // Listeyi şişirmemek için son 300 anahtar
                const arr = Array.from(seen);
                const trimmed = arr.length > 300 ? arr.slice(arr.length - 300) : arr;
                localStorage.setItem('yuvam_notif_seen', JSON.stringify(trimmed));
            } catch (_) {}
        }

        function collectAppNotifications() {
            const items = [];
            const today = todayDateStr();
            const seen = new Set();
            const startDay = Number((periodConfig && periodConfig.startDay) || 29);

            function pushNotif(key, sev, icon, title, msg, category) {
                if (seen.has(key)) return;
                seen.add(key);
                items.push({ key: key, severity: sev, icon: icon, title: title, message: msg, category: category || 'general' });
            }

            // Dönem başlangıç günü (varsayılan 29): kart borcu girilmediyse
            try {
                const now = new Date();
                if (now.getDate() === startDay) {
                    [['Bekir', bekirDebt], ['Duygu', duyguDebt]].forEach(function(pair) {
                        const name = pair[0];
                        const debt = pair[1];
                        const hasActive = debt && !debt.paid && Number(debt.amount) > 0;
                        if (!hasActive) {
                            pushNotif('kk-enter-' + name + '-' + today, 'warning', '💳', 'Kart borcunu gir', name + ' için bu dönem kart borcu henüz girilmedi');
                        }
                    });
                }
            } catch (_) {}

            [['Bekir', bekirDebt], ['Duygu', duyguDebt]].forEach(function(pair) {
                const name = pair[0];
                const debt = pair[1];
                if (!debt || debt.paid || !(Number(debt.amount) > 0)) return;
                const due = debt.dueDate ? String(debt.dueDate).slice(0, 10) : '';
                const amt = (Number(debt.amount) || 0).toLocaleString('tr-TR') + ' TL';
                if (!due) {
                    pushNotif('kk-nodue-' + name, 'warning', '💳', name + ' kredi kartı borcu', amt + ' · son ödeme tarihi yok');
                    return;
                }
                const days = daysUntilYMD(due);
                if (days == null) return;
                if (days < 0) {
                    pushNotif('kk-over-' + name, 'critical', '💳', name + ' kart ödemesi gecikti', Math.abs(days) + ' gün gecikme · ' + amt);
                } else if (days === 0) {
                    pushNotif('kk-today-' + name, 'critical', '💳', name + ' kart son ödeme günü', 'Bugün · ' + amt);
                } else if (days <= 3) {
                    pushNotif('kk-soon-' + name, 'warning', '💳', name + ' kart son ödemesine ' + days + ' gün', amt + ' · ' + formatDateTR(due));
                } else if (days <= 7) {
                    pushNotif('kk-week-' + name, 'info', '💳', name + ' kart ödemesine ' + days + ' gün', amt + ' · ' + formatDateTR(due));
                }
            });

            const list = (typeof getProcessedExpenses === 'function') ? getProcessedExpenses() : (expenses || []);
            list.forEach(function(e) {
                if (!e || e.installmentLabel === 'Gelir') return;
                const d = String(e.date || '').slice(0, 10);
                if (!d) return;
                const days = daysUntilYMD(d);
                if (days == null || days < 0 || days > 7) return;
                const desc = (e.description && e.description !== '-') ? e.description : (e.category || 'Harcama');
                const sub = (e.billSubtype ? e.billSubtype + ' · ' : '') + (e.category || '');
                const amt = (Number(e.displayAmount) || Number(e.amount) || 0).toLocaleString('tr-TR') + ' TL';
                const key = 'exp-' + d + '-' + (e.id || desc);
                if (days === 0) {
                    pushNotif(key, 'critical', '📌', 'Bugün: ' + desc, sub + ' · ' + amt + (e.person ? ' · ' + e.person : ''));
                } else if (days <= 3) {
                    pushNotif(key, 'warning', '📅', days + ' gün sonra: ' + desc, formatDateTR(d) + ' · ' + amt);
                } else {
                    pushNotif(key, 'info', '🗓️', days + ' gün sonra: ' + desc, formatDateTR(d) + ' · ' + amt);
                }
            });

            try {
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (!k || k.indexOf('yuvam_todo_') !== 0) continue;
                    let arr = [];
                    try { arr = JSON.parse(localStorage.getItem(k) || '[]'); } catch (_) { continue; }
                    (arr || []).forEach(function(it, idx) {
                        if (!it || it.done || !it.due) return;
                        const d = String(it.due).slice(0, 10);
                        const days = daysUntilYMD(d);
                        if (days == null || days < 0 || days > 7) return;
                        const text = it.text || 'Görev';
                        const key = 'todo-' + k + '-' + idx + '-' + d;
                        if (days === 0) pushNotif(key, 'critical', '✅', 'Bugün görev: ' + text, formatDateTR(d));
                        else if (days <= 3) pushNotif(key, 'warning', '✅', days + ' gün sonra görev: ' + text, formatDateTR(d));
                        else pushNotif(key, 'info', '✅', days + ' gün sonra görev: ' + text, formatDateTR(d));
                    });
                }
            } catch (_) {}

            try {
                (window._todoNotifCache || []).forEach(function(it) {
                    if (!it || !it.due) return;
                    const d = String(it.due).slice(0, 10);
                    const days = daysUntilYMD(d);
                    if (days == null || days < 0 || days > 7) return;
                    const text = it.text || 'Görev';
                    const key = 'todo-fb-' + (it.id || d + text);
                    if (days === 0) pushNotif(key, 'critical', '✅', 'Bugün görev: ' + text, formatDateTR(d));
                    else if (days <= 3) pushNotif(key, 'warning', '✅', days + ' gün sonra görev: ' + text, formatDateTR(d));
                    else pushNotif(key, 'info', '✅', days + ' gün sonra görev: ' + text, formatDateTR(d));
                });
            } catch (_) {}

            // Araç hatırlatmaları (bakım 2bin km / diğerleri 1 ay)
            try {
                if (typeof getVehicleUpcomingItems === 'function') {
                    getVehicleUpcomingItems().forEach(function(it) {
                        if (it.type === 'maint' && it.sort > 2000) return;
                        if ((it.type === 'inspection' || it.type === 'insurance' || it.type === 'mtv') && it.sort > 30) return;
                        pushNotif(it.key, it.severity, it.icon, 'Araç: ' + it.title, it.detail + ((vehicleProfile && vehicleProfile.name) ? (' · ' + vehicleProfile.name) : ''));
                    });
                }
            } catch (_) {}

            // Aile takvimi (sistem GS maçları hariç — onlar aşağıda tek kaynaktan)
            try {
                (familyCalendar || []).forEach(function(ev) {
                    if (!ev || !ev.date) return;
                    if (ev.gsMatchKey || ev.source === 'espn-gs' || ev.source === 'collectapi-superlig') return;
                    if (ev.type === 'match' && ev.by === 'Sistem') return;
                    const d = (typeof eventEffectiveDate === 'function') ? eventEffectiveDate(ev) : String(ev.date).slice(0, 10);
                    const days = daysUntilYMD(d);
                    if (days == null || days < 0 || days > 14) return;
                    const title = ev.title || 'Etkinlik';
                    const icon = (typeof calTypeIcon === 'function') ? calTypeIcon(ev.type) : '📅';
                    const typeLab = (typeof calTypeLabel === 'function') ? calTypeLabel(ev.type) : '';
                    const key = 'fcal-' + (ev.id || d + title) + '-' + d;
                    if (days === 0) pushNotif(key, 'critical', icon, 'Bugün: ' + title, typeLab + ' · ' + formatDateTR(d));
                    else if (days <= 3) pushNotif(key, 'warning', icon, days + ' gün: ' + title, typeLab + ' · ' + formatDateTR(d));
                    else pushNotif(key, 'info', icon, days + ' gün: ' + title, typeLab + ' · ' + formatDateTR(d));
                });
            } catch (_) {}

            // Galatasaray — tüm kulvarlar, SADECE en yakın 1 maç
            try {
                const today = (typeof todayDateStr === 'function') ? todayDateStr() : '';
                const candidates = (superLigFixturesCache || [])
                    .filter(function(f) {
                        if (!f || !f.isGs || !f.date) return false;
                        const days = daysUntilYMD(f.date);
                        return days != null && days >= 0;
                    })
                    .sort(function(a, b) {
                        const dd = String(a.date).localeCompare(String(b.date));
                        if (dd !== 0) return dd;
                        return String(a.time || '').localeCompare(String(b.time || ''));
                    });
                if (candidates.length) {
                    const f = candidates[0];
                    const days = daysUntilYMD(f.date);
                    const k = f.key || (typeof matchDedupeKey === 'function' ? matchDedupeKey(f.date, f.home, f.away) : (f.date + f.home + f.away));
                    const title = '🦁 ' + f.home + ' – ' + f.away;
                    const key = 'gsfx-next';
                    const msg = formatDateTR(f.date) + (f.time ? ' · ' + f.time : '') + (f.league ? ' · ' + f.league : '');
                    if (days === 0) pushNotif(key, 'critical', '⚽', 'Bugün: ' + title, msg);
                    else if (days <= 3) pushNotif(key, 'warning', '⚽', days + ' gün: ' + title, msg);
                    else pushNotif(key, 'info', '⚽', days + ' gün: ' + title, msg);
                }
            } catch (_) {}



            // Resmi tatiller (14 gün)
            try {
                (publicHolidaysCache || []).forEach(function(h) {
                    if (!h || !h.date) return;
                    const days = daysUntilYMD(h.date);
                    if (days == null || days < 0 || days > 14) return;
                    const title = h.localName || h.name || 'Resmi tatil';
                    const key = 'hol-' + h.date;
                    if (days === 0) pushNotif(key, 'info', '🇹🇷', 'Bugün resmi tatil: ' + title, formatDateTR(h.date));
                    else if (days <= 3) pushNotif(key, 'info', '🇹🇷', days + ' gün: ' + title, formatDateTR(h.date));
                    else pushNotif(key, 'info', '🇹🇷', days + ' gün: ' + title, formatDateTR(h.date));
                });
            } catch (_) {}

            // Aile görevleri
            try {
                (familyTasks || []).forEach(function(t) {
                    if (!t || t.done || !t.due) return;
                    const d = String(t.due).slice(0, 10);
                    const days = daysUntilYMD(d);
                    if (days == null || days < 0 || days > 7) return;
                    const text = t.text || 'Görev';
                    const key = 'ftask-' + (t.id || d + text);
                    if (days === 0) pushNotif(key, 'critical', '✅', 'Bugün görev: ' + text, formatDateTR(d));
                    else if (days <= 3) pushNotif(key, 'warning', '✅', days + ' gün görev: ' + text, formatDateTR(d));
                    else pushNotif(key, 'info', '✅', days + ' gün görev: ' + text, formatDateTR(d));
                });
            } catch (_) {}

            try {
                (activityLog || []).slice(0, 30).forEach(function(row) {
                    if (!row) return;
                    const action = String(row.action || '');
                    // Sadece harcama eklendi / silindi
                    if (action !== 'Harcama eklendi' && action !== 'Harcama silindi') return;
                    const who = row.user || row.userName || 'Birisi';
                    const detail = row.detail ? String(row.detail) : '';
                    const at = row.at ? String(row.at).slice(0, 16).replace('T', ' ') : '';
                    const key = 'act-' + (row.id || (who + action + at));
                    pushNotif(key, 'info', '👤', who + ' kişisi · ' + action, (detail || '') + (at ? (detail ? ' · ' : '') + at : ''), 'activity');
                });
            } catch (_) {}

            const rank = { critical: 0, warning: 1, info: 2 };
            items.sort(function(a, b) { return (rank[a.severity] || 9) - (rank[b.severity] || 9); });
            return items;
        }

        function renderNotifItemsHtml(items) {
            return (items || []).map(function(n) {
                return '<div class="notif-item sev-' + n.severity + '">' +
                    '<span class="notif-icon">' + n.icon + '</span>' +
                    '<div><p class="notif-title">' + escapeHtml(n.title) + '</p>' +
                    '<p class="notif-msg">' + escapeHtml(n.message) + '</p></div></div>';
            }).join('');
        }

        window.refreshAppNotifications = function() {
            const badge = document.getElementById('notifBadge');
            const body = document.getElementById('notifPanelBody');
            let items = [];
            try { items = collectAppNotifications(); } catch (e) { console.warn('notif', e); }
            window._lastNotifItems = items;
            const seen = getNotifSeenKeys();
            const unread = items.filter(function(n) { return !seen.has(n.key); });
            if (badge) {
                if (unread.length) {
                    badge.textContent = unread.length > 9 ? '9+' : String(unread.length);
                    badge.classList.remove('hidden');
                } else {
                    badge.classList.add('hidden');
                }
            }
            if (!body) return;
            if (!items.length) {
                body.innerHTML = yuvamEmptyState('👍', 'Bildirim yok', 'Yakın vadede uyarı bulunmuyor', null, null);
                return;
            }
            const top = items.slice(0, 5);
            let html = renderNotifItemsHtml(top);
            if (items.length > 5) {
                html += '<button type="button" onclick="openNotifAllModal()" class="w-full mt-1 py-2.5 rounded-xl text-xs font-black text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-100">Daha fazla göster</button>';
            }
            body.innerHTML = html;
        };

        window.openNotifAllModal = function() {
            try {
                if (typeof refreshAppNotifications === 'function') refreshAppNotifications();
            } catch (_) {}
            const modal = document.getElementById('notifAllModal');
            const body = document.getElementById('notifAllBody');
            let items = [];
            try {
                items = (window._lastNotifItems && window._lastNotifItems.length)
                    ? window._lastNotifItems
                    : (typeof collectAppNotifications === 'function' ? collectAppNotifications() : []);
            } catch (_) { items = []; }
            items = (items || []).slice(0, 20);
            if (body) {
                body.innerHTML = items.length
                    ? renderNotifItemsHtml(items)
                    : '<p class="text-xs text-slate-400 font-semibold p-4 text-center">Bildirim yok</p>';
            }
            if (modal) {
                modal.classList.remove('hidden');
                modal.classList.add('flex');
                modal.style.display = 'flex';
            }
            try { closeNotifPanel(true); } catch (_) {}
        };


        window.closeNotifAllModal = function() {
            const modal = document.getElementById('notifAllModal');
            if (modal) {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
                modal.style.display = 'none';
            }
            markNotifsSeen(window._lastNotifItems || []);
            refreshAppNotifications();
        };

        window.toggleNotifPanel = function(ev) {
            if (ev) ev.stopPropagation();
            const panel = document.getElementById('notifPanel');
            if (!panel) return;
            if (panel.classList.contains('hidden')) {
                panel.classList.remove('hidden');
                refreshAppNotifications();
            } else {
                closeNotifPanel();
            }
        };

        window.closeNotifPanel = function(skipSeen) {
            const panel = document.getElementById('notifPanel');
            if (panel) panel.classList.add('hidden');
            if (!skipSeen) {
                markNotifsSeen(window._lastNotifItems || []);
                refreshAppNotifications();
            }
        };

        document.addEventListener('click', function(e) {
            const panel = document.getElementById('notifPanel');
            const btn = document.getElementById('notifBtn');
            if (!panel || panel.classList.contains('hidden')) return;
            if (panel.contains(e.target) || (btn && btn.contains(e.target))) return;
            closeNotifPanel();
        });

        window.toggleMobilePreview = function() {
            const on = document.documentElement.classList.toggle('force-mobile-preview');
            try { localStorage.setItem('yuvam_force_mobile', on ? '1' : '0'); } catch (_) {}
            const lab = document.getElementById('mobilePreviewBtnLabel');
            if (lab) lab.textContent = on ? '💻 Web' : '📱 Mobil';
            // kart/tabloyu yenile
            try { renderTable(); } catch (_) {}
            showToast(on ? 'Mobil önizleme açık' : 'Web görünümü', 'info');
        };

        (function restoreMobilePreviewFlag() {
            try {
                if (localStorage.getItem('yuvam_force_mobile') === '1') {
                    document.documentElement.classList.add('force-mobile-preview');
                    const lab = document.getElementById('mobilePreviewBtnLabel');
                    if (lab) lab.textContent = '💻 Web';
                }
            } catch (_) {}
        })();

        window.logout = function() {
            const name = currentUser ? currentUser.name : 'Sistem';
            try { logActivity('Çıkış', 'Oturum kapatıldı', name + ' çıkış yaptı', name); } catch (_) {}
            currentUser = null;
            try { sessionStorage.removeItem('yuvam_user'); } catch (_) {}
            try { auth.signOut(); } catch (_) {}
            try { openrouterApiKey = ''; } catch (_) {}
            try { collectApiKey = ''; } catch (_) {}
            try { stopActivityLogListener(); } catch (_) {}
            try { activityLog = []; } catch (_) {}
            // realtime flag
            try { syncInitialized = false; } catch (_) {}
            const appEl = document.getElementById('appContainer') || document.getElementById('app');
            const loginEl = document.getElementById('errorContainer') || document.getElementById('loginScreen');
            if (appEl) {
                appEl.classList.add('hidden');
                appEl.style.display = 'none';
            }
            try {
                document.body.classList.remove('yuvam-app-open');
                document.documentElement.classList.remove('yuvam-app-open');
                try { hideAppSkeleton(); } catch (_) {}
                _skeletonHiddenOnce = false;
                closeMobileMoreSheet();
            } catch (_) {}
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
                // Admin kilitlenmesin: Ayarlar her zaman admin menüsünde (gizli olsa bile)
                if (t && t.id === 'settings' && typeof isAdmin === 'function' && isAdmin()) {
                    return true;
                }
                if (!t.visible) return false;
                if (t.adminOnly && !isAdmin()) return false;
                if (Array.isArray(t.visibleTo) && t.visibleTo.length) {
                    if (!currentUser || !t.visibleTo.includes(currentUser.name)) return false;
                }
                return true;
            });
        }

        function applyRoleAndTabs() {
            document.querySelectorAll('.admin-only-btn').forEach(function(el) {
                el.classList.toggle('hidden', !isAdmin());
            });
            const visible = getVisibleTabs();
            const homeTab = visible.find(function(t) { return t.id === 'home'; });
            renderTabBar();
            try { if (typeof rebuildMobileNav === 'function') rebuildMobileNav(); } catch (_) {}
            if (lastActiveTabId && visible.some(function(t) { return t.id === lastActiveTabId; })) {
                if (typeof updateMobileBottomNav === 'function') updateMobileBottomNav(lastActiveTabId);
                return;
            }
            if (homeTab) switchTab('home');
            else if (visible.length) switchTab(visible[0].id);
        }

        let lastActiveTabId = null;

        window.renderTabBar = function() {
            const bar = document.getElementById('tabBar');
            if (!bar) return;
            let visible = getVisibleTabs();
            // Ana Sayfa görsel sırada en başta
            const hi = visible.findIndex(t => t.id === 'home');
            if (hi > 0) {
                const h = visible.splice(hi, 1)[0];
                visible.unshift(h);
            }
            const activeId = lastActiveTabId && visible.some(t => t.id === lastActiveTabId)
                ? lastActiveTabId
                : ((visible.find(t => t.id === 'home') || visible[0] || {}).id);
            const openTaskN = (typeof countOpenFamilyTasks === 'function') ? countOpenFamilyTasks() : 0;
            bar.innerHTML = visible.map((t) => {
                const active = t.id === activeId;
                const cls = active
                    ? 'tab-active yuvam-tab-btn'
                    : 'tab-inactive yuvam-tab-btn hover:bg-white/80';
                const lab = t.label || t.id;
                let badge = '';
                if ((t.id === 'tasks' || t.id === 'plan') && openTaskN > 0) {
                    badge = '<span class="tab-count-badge">' + (openTaskN > 9 ? '9+' : openTaskN) + '</span>';
                }
                return `<button type="button" data-tab-id="${escapeHtml(t.id)}" title="${escapeHtml(lab)}" onclick="switchTab('${escapeHtml(t.id)}')" class="${cls}"><span class="yuvam-tab-emoji relative">${escapeHtml(t.emoji || '📌')}${badge}</span><span class="yuvam-tab-text">${escapeHtml(lab)}</span></button>`;
            }).join('');
            if (typeof updateTaskNavBadges === 'function') updateTaskNavBadges();
        };

        window.countOpenFamilyTasks = function() {
            return (familyTasks || []).filter(function(t) { return t && !t.done; }).length;
        };

        window.updateTaskNavBadges = function() {
            const n = countOpenFamilyTasks();
            const m = document.getElementById('mnavPlanBadge');
            if (m) {
                if (n > 0) {
                    m.textContent = n > 9 ? '9+' : String(n);
                    m.classList.remove('hidden');
                } else {
                    m.classList.add('hidden');
                }
            }
            // Üst menü rozeti renderTabBar ile gelir; burada sadece mobil
        };

        function capitalizeTab(name) {
            if (!name) return '';
            return name.charAt(0).toUpperCase() + name.slice(1);
        }


        // State ve Değişkenler
        let expenses = [], notes = [], deletedExpenses = [];
        let categories = ["Alışveriş", "Araç", "Faturalar", "Eğlence", "Sağlık", "Eğitim", "Diğer", "Kredi Kartı Borcu"];
        let categorySubtypes = {
            'Alışveriş': ['Market', 'Gıda/Yemek', 'Giyim', 'Elektronik', 'Ev & Yaşam', 'Kişisel Bakım'],
            'Faturalar': ['Elektrik', 'Su', 'Doğalgaz', 'Telefon', 'İnternet', 'Abonelik'],
            'Araç': ['Yakıt', 'Vergi', 'Bakım']
        };
        const DEFAULT_CATEGORY_SUBTYPES = {
            'Alışveriş': ['Market', 'Gıda/Yemek', 'Giyim', 'Elektronik', 'Ev & Yaşam', 'Kişisel Bakım'],
            'Faturalar': ['Elektrik', 'Su', 'Doğalgaz', 'Telefon', 'İnternet', 'Abonelik'],
            'Araç': ['Yakıt', 'Vergi', 'Bakım']
        };
        const LEGACY_SHOP_CATEGORIES = ['Gıda', 'Gida', 'Giyim', 'E-ticaret', 'Eticaret', 'E-Ticaret'];
        let paymentTypes = ["Nakit", "Kredi Kartı"];
        let bekirDebt = { amount: 0, paid: false, dueDate: '' };
        let vehicleProfile = {
            name: 'Toyota Corolla',
            totalKm: 184900,
            maintDate: '2026-07-11',
            maintKm: 183000,
            maintNotes: '',
            maintIntervalKm: 10000,
            inspectionDate: '2024-11-23',
            insuranceDate: '',
            mtvDate: '',
            mtvAmount: 0
        };

        let duyguDebt = { amount: 0, paid: false, dueDate: '' };
        let cardStatements = [];
        let activityLog = [];
        let activityFilter = { user: "Tümü", action: "Tümü", start: "", end: "" };
        let ibans = [];
        
        let sortColumn = 'date', sortDirection = 'desc';
        let currentPersonFilter = 'Tümü', currentCategoryFilter = 'Tümü', currentPaymentFilter = 'Tümü';
        let currentShopSubtypeFilter = 'Tümü', currentEcommerceFilter = 'Tümü';
        let currentSearchFilter = '';
        let currentStartDateFilter = '', currentEndDateFilter = '';
        let currentShowInstallments = false;

        let expenseChart = null, weeklyTrendChart = null, monthlyTrendChart = null;
        let syncInitialized = false;
        let periodConfig = { startDay: 29, endDay: 28 };
        let monthlyBudgetTarget = 0; // TL, 0 = kapalı
        // Ana sayfa / özet kart görünürlüğü
        let dashboardCards = {
            total: true, bekir: true, duygu: true, debt: true,
            homeToday: true, homePeriod: true, homeGold: true, homeQuickAdd: true,
            homeBudget: true, homeAgenda: true
        };
        let appTheme = 'light';
        let monthCompareChart = null, categoryTrendChart = null;
        const AMOUNT_MIN = 0.01;
        const AMOUNT_MAX = 999999;

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

            const startDay = Math.min(31, Math.max(1, Number((periodConfig && periodConfig.startDay) || 29)));
            const endDay = Math.min(31, Math.max(1, Number((periodConfig && periodConfig.endDay) || 28)));
            // startDay > endDay olmalı (klasik 29–28). startDay 1 ve endDay 31 benzeri için: ay başı–ayı sonu yaklaşımı
            const year = date.getFullYear();
            const month = date.getMonth();
            const day = date.getDate();

            let startDate, endDate;
            if (startDay > endDay) {
                // örn. 29 → sonraki ay 28
                if (day >= startDay) {
                    startDate = new Date(year, month, startDay);
                    endDate = new Date(year, month + 1, endDay, 23, 59, 59);
                } else {
                    startDate = new Date(year, month - 1, startDay);
                    endDate = new Date(year, month, endDay, 23, 59, 59);
                }
            } else {
                // aynı ay içinde (nadir): startDay..endDay
                if (day >= startDay && day <= endDay) {
                    startDate = new Date(year, month, startDay);
                    endDate = new Date(year, month, endDay, 23, 59, 59);
                } else if (day < startDay) {
                    startDate = new Date(year, month - 1, startDay);
                    endDate = new Date(year, month - 1, endDay, 23, 59, 59);
                } else {
                    startDate = new Date(year, month, startDay);
                    endDate = new Date(year, month, endDay, 23, 59, 59);
                }
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

        let _skeletonHiddenOnce = false;
        let _gateProgress = 0;
        let _gateTickTimer = null;
        let _gateHideTimer = null;

        function setGateProgress(p) {
            _gateProgress = Math.max(0, Math.min(100, Number(p) || 0));
            const stage = document.getElementById('gateLoaderStage');
            if (stage) stage.style.setProperty('--p', _gateProgress + '%');
        }

        function bumpGateProgress(toAtLeast, step) {
            if (_skeletonHiddenOnce) return;
            const target = Math.min(92, Math.max(_gateProgress + (step || 8), toAtLeast || 0));
            if (target > _gateProgress) setGateProgress(target);
        }

        window.showAppSkeleton = function() {
            const el = document.getElementById('appSkeleton');
            if (!el) return;
            _skeletonHiddenOnce = false;
            if (_gateHideTimer) { clearTimeout(_gateHideTimer); _gateHideTimer = null; }
            setGateProgress(0);
            el.classList.remove('hidden');
            el.style.display = 'flex';
            el.setAttribute('aria-hidden', 'false');
            if (_gateTickTimer) clearInterval(_gateTickTimer);
            // Yükleme süresince yavaş ilerleme (gerçek veri gelince bump + hide 100 yapar)
            _gateTickTimer = setInterval(function() {
                if (_skeletonHiddenOnce) {
                    clearInterval(_gateTickTimer);
                    _gateTickTimer = null;
                    return;
                }
                if (_gateProgress < 88) {
                    // yavaşlayan artış
                    const add = _gateProgress < 40 ? 2.2 : (_gateProgress < 70 ? 1.1 : 0.45);
                    setGateProgress(_gateProgress + add);
                }
            }, 120);
        };

        window.hideAppSkeleton = function() {
            const el = document.getElementById('appSkeleton');
            if (_gateTickTimer) { clearInterval(_gateTickTimer); _gateTickTimer = null; }
            setGateProgress(100);
            _skeletonHiddenOnce = true;
            if (!el) return;
            if (_gateHideTimer) clearTimeout(_gateHideTimer);
            // ışıltı %100 görünsün diye kısa bekleme
            _gateHideTimer = setTimeout(function() {
                el.classList.add('hidden');
                el.style.display = 'none';
                el.setAttribute('aria-hidden', 'true');
                setGateProgress(0);
            }, 280);
        };

        let _bootRenderQuietUntil = 0;
        function scheduleRenderApp() {
            clearTimeout(renderTimeout);
            try { bumpGateProgress(_gateProgress + 12, 10); } catch (_) {}
            // İlk Firestore dalgasında tek render (mobil CPU)
            const delay = (Date.now() < _bootRenderQuietUntil) ? 280 : 120;
            renderTimeout = setTimeout(function() {
                renderApp();
                try { hideAppSkeleton(); } catch (_) {}
            }, delay);
        }

        function renderApp() {
            try { renderBudgetInfo(); } catch (_) {}
            // İşlem geçmişi sadece Bütçe sekmesi açıksa
            try {
                const exp = document.getElementById('tabContentExpense');
                if (exp && !exp.classList.contains('hidden') && typeof renderTable === 'function') renderTable();
            } catch (_) {}
            try {
                const exp2 = document.getElementById('tabContentExpense');
                if (exp2 && !exp2.classList.contains('hidden') && typeof renderCurrentStatements === 'function') renderCurrentStatements();
            } catch (_) {}
            try {
                const vt = document.getElementById('tabContentVehicle');
                if (vt && !vt.classList.contains('hidden') && typeof renderVehicleTab === 'function') renderVehicleTab();
            } catch (_) {}
            try {
                const home = document.getElementById('tabContentHome');
                if (home && !home.classList.contains('hidden') && typeof renderHomeTab === 'function') renderHomeTab();
            } catch (_) {}
        }

        /** Chart.js yalnızca Raporlar / Araç açılınca */
        window.ensureChartJs = function() {
            return new Promise(function(resolve) {
                if (typeof Chart !== 'undefined') { resolve(); return; }
                if (window._chartJsLoading) {
                    window._chartJsLoading.then(resolve);
                    return;
                }
                window._chartJsLoading = new Promise(function(res) {
                    const s = document.createElement('script');
                    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
                    s.async = true;
                    s.onload = function() { res(); };
                    s.onerror = function() { console.warn('Chart.js yüklenemedi'); res(); };
                    document.head.appendChild(s);
                });
                window._chartJsLoading.then(resolve);
            });
        };

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
            if (tabName === 'tasks' || tabName === 'calendar' || tabName === 'notes') tabName = 'plan';
            lastActiveTabId = tabName;
            const coreIds = ["home", "plan", "calendar", "tasks", "shopping", "expense", "vehicle", "stats", "settings", "trash"];
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
                    btn.classList.toggle('tab-inactive', !active);
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
            // Sekme erişimi: adminOnly / visibleTo config'e göre (Ayarlar artık sadece admin kilidi değil)
            if (tabName === 'settings' || tabName === 'trash') {
                const tabCfg = (typeof tabsConfig !== 'undefined' && tabsConfig)
                    ? tabsConfig.find(function(x) { return x && x.id === tabName; })
                    : null;
                let allowed = true;
                if (tabCfg) {
                    if (tabCfg.adminOnly && !isAdmin()) allowed = false;
                    if (Array.isArray(tabCfg.visibleTo) && tabCfg.visibleTo.length) {
                        if (!currentUser || tabCfg.visibleTo.indexOf(currentUser.name) < 0) {
                            // Admin Ayarlar'a her zaman girebilsin
                            if (!(tabName === 'settings' && isAdmin())) allowed = false;
                        }
                    }
                    if (tabCfg.visible === false && !(tabName === 'settings' && isAdmin())) {
                        allowed = false;
                    }
                } else if (!isAdmin()) {
                    allowed = false;
                }
                if (!allowed) {
                    if (typeof showToast === 'function') {
                        showToast((tabName === 'settings' ? 'Ayarlar' : 'Çöp Kutusu') + ' bu kullanıcı için kapalı', 'error');
                    }
                    switchTab('expense');
                    return;
                }
            }

            const content = document.getElementById(`tabContent${capitalizeTab(tabName)}`);
            if (content) content.classList.remove('hidden');
            try { if (typeof applyPageLayout === 'function') applyPageLayout(String(tabName || '').toLowerCase()); } catch (_l) {}

            if (tabName === 'expense') {
                try { if (typeof renderGoldHoldings === 'function') renderGoldHoldings(); } catch (_) {}
                try { if (typeof renderTable === 'function') renderTable(); } catch (_) {}
                if (typeof applyPageLayout === 'function') applyPageLayout('expense');
            }
            if (tabName === 'stats') {
                try { if (typeof ensureLazyCollection === 'function') ensureLazyCollection('cardStatements'); } catch (_) {}
                try { if (typeof renderCurrentStatements === 'function') renderCurrentStatements(); } catch (_) {}
                if (typeof renderCardStatements === 'function') {
                    renderCardStatements('bekir');
                    renderCardStatements('duygu');
                }
                Promise.resolve(typeof ensureChartJs === 'function' ? ensureChartJs() : null).then(function() {
                    try { updateStatsPanel(); } catch (_) {}
                    try { if (typeof renderMonthlyReports === 'function') renderMonthlyReports(); } catch (_) {}
                    try { if (typeof renderBillsChart === 'function') renderBillsChart(); } catch (_) {}
                });
            } else if (tabName === 'vehicle') {
                Promise.resolve(typeof ensureChartJs === 'function' ? ensureChartJs() : null).then(function() {
                    try { try { if (typeof ensureLazyCollection === 'function') ensureLazyCollection('vehicleProfile'); } catch (_) {}
                if (typeof renderVehicleTab === 'function') renderVehicleTab(); } catch (_) {}
                });
            } else if (tabName === 'home') {
                if (typeof renderHomeTab === 'function') renderHomeTab();
            } else if (tabName === 'plan' || tabName === 'calendar' || tabName === 'tasks' || tabName === 'notes') {
                try { if (typeof ensureLazyCollection === 'function') {
                    ensureLazyCollection('familyTasks');
                    ensureLazyCollection('familyCalendar');
                    ensureLazyCollection('notes');
                    ensureLazyCollection('ibans');
                } } catch (_) {}
                if (typeof renderPlanTab === 'function') renderPlanTab();
                try { if (typeof renderNotesList === 'function') renderNotesList(); } catch (_) {}
                try { if (typeof renderIbans === 'function') renderIbans(); } catch (_) {}
            } else if (tabName === 'shopping') {
                try { if (typeof ensureLazyCollection === 'function') ensureLazyCollection('familyShopping'); } catch (_) {}
                if (typeof renderShoppingTab === 'function') renderShoppingTab();
            } else if (tabName === 'trash') {
                renderTrash();
            } else if (tabName === 'settings') {
                renderCategoriesList();
                renderTabsList();
                applyPeriodConfigToForm();
                applyDashboardCards();
                if (typeof setAppTheme === 'function') setAppTheme(appTheme);
            }
            if (typeof updateMobileBottomNav === 'function') updateMobileBottomNav(tabName);
        };


        window._gsHomeLoading = false;
        window.ensureGsFixturesForHome = async function() {
            if (window._gsHomeLoading) return;
            if (superLigFixturesCache && superLigFixturesCache.length) return;
            // Başarısız denemeyi 2 dk tekrarlama (sonsuz döngü engeli)
            if (window._gsHomeTriedAt && (Date.now() - window._gsHomeTriedAt) < 120000) return;
            window._gsHomeLoading = true;
            window._gsHomeTriedAt = Date.now();
            try {
                if (typeof refreshSuperLigFixtures === 'function') {
                    await refreshSuperLigFixtures(false);
                }
            } catch (e) {
                console.warn('GS fikstür (anasayfa)', e);
            } finally {
                window._gsHomeLoading = false;
            }
        };

        window.renderHomeTab = function() {
            try {
                // Fikstür boşsa arka planda yükle → yaklaşan maçlar gelsin
                try {
                    if (typeof ensureLazyCollection === 'function') {
                        ensureLazyCollection('familyTasks');
                        ensureLazyCollection('familyCalendar');
                        ensureLazyCollection('vehicleProfile');
                        ensureLazyCollection('goldHoldings');
                    }
                } catch (_) {}
                try {
                    if (!(superLigFixturesCache && superLigFixturesCache.length)) {
                        if (typeof ensureGsFixturesForHome === 'function') ensureGsFixturesForHome();
                    }
                } catch (_) {}
                const greet = document.getElementById('homeGreeting');
                const name = (currentUser && currentUser.name) ? currentUser.name : '';
                const hour = new Date().getHours();
                const hi = hour < 12 ? 'Günaydın' : (hour < 18 ? 'İyi günler' : 'İyi akşamlar');
                if (greet) greet.textContent = hi + (name ? ', ' + name : '');

                try { if (typeof loadDailyAyah === 'function') loadDailyAyah(true); } catch (_) {}

                const dateEl = document.getElementById('homeTodayDate');
                if (dateEl) {
                    dateEl.textContent = new Date().toLocaleDateString('tr-TR', {
                        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                    });
                }
                setTimeout(function() {
                    try { if (typeof loadHomeWeather === 'function') loadHomeWeather(false); } catch (_) {}
                }, 2000);

                const period = (typeof getCurrentPeriod === 'function') ? getCurrentPeriod() : '';
                const badge = document.getElementById('homePeriodBadge');
                if (badge) badge.textContent = period ? ('Dönem: ' + period) : 'Dönem: —';

                let periodSum = 0, todaySum = 0, todayCount = 0, periodCash = 0, periodCard = 0;
                const today = (typeof todayDateStr === 'function') ? todayDateStr() : '';
                try {
                    const list = (typeof getProcessedExpenses === 'function') ? getProcessedExpenses() : [];
                    list.forEach(function(e) {
                        if (!e || e.installmentLabel === 'Gelir') return;
                        // Multinet dönem toplamlarına dahil değil
                        if (typeof isMultinetPayment === 'function' && isMultinetPayment(e.paymentType)) return;
                        const amt = Number(e.displayAmount) || 0;
                        if (e.effectiveMonth === period) {
                            periodSum += amt;
                            if (typeof isCashPayment === 'function' && isCashPayment(e.paymentType)) periodCash += amt;
                            else if (typeof isCreditPayment === 'function' && isCreditPayment(e.paymentType)) periodCard += amt;
                            else {
                                const pt = String(e.paymentType || '').toLowerCase();
                                if (pt.indexOf('nakit') >= 0) periodCash += amt;
                                else periodCard += amt;
                            }
                        }
                        if (String(e.date || '').slice(0, 10) === today) {
                            todaySum += amt;
                            todayCount += 1;
                        }
                    });
                } catch (_) {}

                const elPeriod = document.getElementById('homePeriodSpend');
                if (elPeriod) elPeriod.textContent = Math.round(periodSum).toLocaleString('tr-TR') + ' TL';
                const elPC = document.getElementById('homePeriodCash');
                const elPK = document.getElementById('homePeriodCard');
                if (elPC) elPC.textContent = Math.round(periodCash).toLocaleString('tr-TR') + ' TL';
                if (elPK) elPK.textContent = Math.round(periodCard).toLocaleString('tr-TR') + ' TL';
                const elToday = document.getElementById('homeTodaySpend');
                if (elToday) elToday.textContent = Math.round(todaySum).toLocaleString('tr-TR') + ' TL';
                const elTodayN = document.getElementById('homeTodayCount');
                if (elTodayN) elTodayN.textContent = todayCount + ' kayıt';

                // Bütçe hedefi kartı — yalnızca kredi kartı
                try {
                    const target = Number(monthlyBudgetTarget) || 0;
                    const lab = document.getElementById('homeBudgetLabel');
                    const bar = document.getElementById('homeBudgetBar');
                    if (lab) {
                        if (target > 0) {
                            const pct = Math.min(999, Math.round(periodCard / target * 100));
                            lab.textContent = 'KK ' + Math.round(periodCard).toLocaleString('tr-TR') + ' / ' + target.toLocaleString('tr-TR') + ' TL · %' + pct;
                        } else {
                            lab.textContent = 'Hedef tanımlı değil (Ayarlar)';
                        }
                    }
                    if (bar) {
                        const pctW = target > 0 ? Math.min(100, (periodCard / target) * 100) : 0;
                        bar.style.width = pctW + '%';
                        bar.className = 'h-full rounded-full transition-all ' + (pctW >= 100 ? 'bg-rose-500' : pctW >= 80 ? 'bg-amber-500' : 'bg-sky-500');
                    }
                } catch (_) {}

                // Görevler + Yaklaşanlar (tek kutu)
                try {
                    const agendaEl = document.getElementById('homeAgendaList');
                    if (agendaEl) {
                        const allT = familyTasks || [];
                        const openTasks = allT.filter(function(t) { return !t.done; });
                        const openN = openTasks.length;
                        const doneN = allT.filter(function(t) { return t.done; }).length;
                        const totalN = openN + doneN;
                        const progWrap = document.getElementById('homeTasksProgress');
                        const progArc = document.getElementById('homeTasksProgressArc');
                        const progLbl = document.getElementById('homeTasksProgressLabel');
                        if (progWrap && totalN > 0) {
                            progWrap.classList.remove('hidden');
                            const pct = Math.round((doneN / totalN) * 100);
                            if (progArc) progArc.setAttribute('stroke-dasharray', pct + ', 100');
                            if (progLbl) progLbl.textContent = doneN + '/' + totalN;
                        } else if (progWrap) {
                            progWrap.classList.add('hidden');
                        }

                        let html = '';
                        const taskShow = openTasks.slice(0, 5);
                        if (taskShow.length) {
                            html += '<p class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Görevler</p>';
                            html += taskShow.map(function(t) {
                                const due = t.due ? formatDateTR(t.due) : '';
                                const who = t.assignee && t.assignee !== 'Herkes' ? t.assignee : '';
                                const days = t.due && typeof daysUntilYMD === 'function' ? daysUntilYMD(t.due) : null;
                                const overdue = days != null && days < 0;
                                const sub = [due, who].filter(Boolean).join(' · ');
                                const badge = overdue
                                    ? ' <span class="inline-flex items-center gap-0.5 text-[10px] font-black text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded-md">❗ GEÇTİ</span>'
                                    : '';
                                return '<div class="flex gap-2 items-start p-2.5 rounded-xl ' +
                                    (overdue ? 'bg-rose-50 border border-rose-200' : 'bg-slate-50 border border-slate-100') + '">' +
                                    '<span class="text-sm shrink-0">' + (overdue ? '❗' : '⬜') + '</span>' +
                                    '<div class="min-w-0"><p class="text-sm font-bold text-slate-800">' + escapeHtml(t.text || '-') + badge + '</p>' +
                                    (sub ? '<p class="text-[10px] text-slate-400 font-semibold">' + escapeHtml(sub) + '</p>' : '') +
                                    '</div></div>';
                            }).join('');
                        }

                        let upcoming = [];
                        try {
                            const allN = (typeof collectAppNotifications === 'function')
                                ? collectAppNotifications().filter(function(n) { return n && n.category !== 'activity'; })
                                : [];
                            // GS maçı her zaman ilk; diğerleri önem sırası
                            function isGsMatch(n) {
                                if (!n) return false;
                                if (n.key === 'gsfx-next' || (n.key && String(n.key).indexOf('gsfx-') === 0)) return true;
                                if (n.icon === '⚽' && String(n.title || '').indexOf('🦁') >= 0) return true;
                                return false;
                            }
                            const gs = allN.filter(isGsMatch).slice(0, 1);
                            const rest = allN.filter(function(n) { return !isGsMatch(n); });
                            rest.sort(function(a, b) {
                                const sev = { critical: 0, warning: 1, info: 2 };
                                return (sev[a.severity] != null ? sev[a.severity] : 3) - (sev[b.severity] != null ? sev[b.severity] : 3);
                            });
                            upcoming = gs.concat(rest).slice(0, 5);
                        } catch (_) {}
                        if (upcoming.length) {
                            html += '<p class="text-[10px] font-black text-slate-400 uppercase tracking-wider mt-3 mb-1.5">Yaklaşanlar</p>';
                            html += upcoming.map(function(n) {
                                return '<div class="flex gap-2 items-start p-2.5 rounded-xl bg-amber-50/80 border border-amber-100">' +
                                    '<span class="text-base shrink-0">' + (n.icon || '🔔') + '</span>' +
                                    '<div class="min-w-0"><p class="text-sm font-bold text-slate-800 truncate">' + escapeHtml(n.title || '') + '</p>' +
                                    '<p class="text-[11px] text-slate-500 font-semibold">' + escapeHtml(n.message || '') + '</p></div></div>';
                            }).join('');
                        }

                        if (!html) {
                            agendaEl.innerHTML = yuvamEmptyState('✅', 'Görev veya yaklaşan yok', 'Görev eklemek için Görevler sekmesine gidin', 'Görevler', "switchTab('tasks')");
                        } else {
                            agendaEl.innerHTML = html;
                        }
                    }
                } catch (_) {}

                if (typeof applyDashboardCards === 'function') applyDashboardCards();
                try { if (typeof updateAdminLayoutButtons === 'function') updateAdminLayoutButtons(); } catch (_) {}
                try {
                    // Yerel altın + lazy dinleyici
                    try {
                        if (typeof loadGoldHoldingsLocal === 'function' && (!(goldHoldings || []).length)) {
                            goldHoldings = loadGoldHoldingsLocal() || [];
                        }
                    } catch (_) {}
                    try { if (typeof ensureLazyCollection === 'function') ensureLazyCollection('goldHoldings'); } catch (_) {}
                    try { if (typeof updateHomeGoldCard === 'function') updateHomeGoldCard(); } catch (_) {}
                    Promise.resolve(typeof refreshGoldPrice === 'function' ? refreshGoldPrice(true) : null).then(function() {
                        try { if (typeof updateHomeGoldCard === 'function') updateHomeGoldCard(); } catch (_) {}
                    }).catch(function() {
                        try { if (typeof updateHomeGoldCard === 'function') updateHomeGoldCard(); } catch (_) {}
                    });
                } catch (_) {}
                try { if (typeof applyPageLayout === 'function') applyPageLayout('home'); } catch (_) {}

            } catch (err) {
                console.warn('renderHomeTab', err);
            }
        };

        function mobileNavStorageKey() {
            const n = (currentUser && currentUser.name) ? currentUser.name : 'anon';
            return 'yuvam_mnav_order_' + n;
        }

        function getDefaultMobileNavOrder() {
            const fromTabs = (tabsConfig || [])
                .filter(function(t) { return t && t.visible !== false && t.id !== 'trash'; })
                .map(function(t) { return t.id; });
            const base = (typeof MOBILE_NAV_PRIMARY_DEFAULT !== 'undefined' ? MOBILE_NAV_PRIMARY_DEFAULT.slice() : ['home', 'expense', 'stats', 'plan']);
            const ordered = [];
            base.forEach(function(id) {
                if (fromTabs.indexOf(id) >= 0 && ordered.indexOf(id) < 0) ordered.push(id);
            });
            fromTabs.forEach(function(id) {
                if (ordered.indexOf(id) < 0) ordered.push(id);
            });
            if (ordered.indexOf('home') < 0) ordered.unshift('home');
            return ordered;
        }

        window.getMobileNavOrder = function() {
            try {
                const raw = localStorage.getItem(mobileNavStorageKey());
                if (raw) {
                    const arr = JSON.parse(raw);
                    if (Array.isArray(arr) && arr.length) {
                        // notes → plan
                        return arr.map(function(id) {
                            return (id === 'notes' || id === 'tasks' || id === 'calendar') ? 'plan' : id;
                        }).filter(function(id, i, a) { return a.indexOf(id) === i; });
                    }
                }
            } catch (_) {}
            return getDefaultMobileNavOrder();
        };

        /** Kullanıcıya özel mobil sıra — sadece localStorage (cihaz + kullanıcı) */
        window.saveMobileNavOrderFromTabs = function() {
            if (!currentUser) return;
            const order = (tabsConfig || [])
                .filter(function(t) { return t && t.visible !== false && t.id !== 'trash'; })
                .map(function(t) { return t.id; });
            if (!order.length) return;
            if (order.indexOf('home') < 0) order.unshift('home');
            try { localStorage.setItem(mobileNavStorageKey(), JSON.stringify(order)); } catch (_) {}
            try { rebuildMobileNav(); } catch (_) {}
        };

        function tabMeta(id) {
            const t = (tabsConfig || []).find(function(x) { return x && x.id === id; });
            if (t) return { id: t.id, emoji: t.emoji || '📌', label: t.label || id, adminOnly: !!t.adminOnly };
            const fallback = {
                home: { emoji: '🏠', label: 'Ana' },
                expense: { emoji: '💰', label: 'Bütçe' },
                stats: { emoji: '📊', label: 'Raporlar' },
                plan: { emoji: '📋', label: 'Plan' },
                shopping: { emoji: '🛒', label: 'Alışveriş' },
                vehicle: { emoji: '🚗', label: 'Araç' },
                settings: { emoji: '⚙️', label: 'Ayarlar', adminOnly: true },
                trash: { emoji: '🗑️', label: 'Çöp', adminOnly: true }
            };
            const f = fallback[id] || { emoji: '📌', label: id };
            return { id: id, emoji: f.emoji, label: f.label, adminOnly: !!f.adminOnly };
        }

        window.rebuildMobileNav = function() {
            const nav = document.getElementById('mobileBottomNav');
            const moreBody = document.getElementById('mobileMoreSheetBody');
            if (!nav) return;
            let order = getMobileNavOrder();
            // Görünür + yetkili sekmeler
            order = order.filter(function(id) {
                if (id === 'more') return false;
                const meta = tabMeta(id);
                if (meta.adminOnly && typeof isAdmin === 'function' && !isAdmin()) return false;
                const cfg = (tabsConfig || []).find(function(t) { return t && t.id === id; });
                if (cfg && cfg.visible === false) return false;
                return true;
            });
            // primary: en fazla 4 (more hariç)
            const primary = order.slice(0, 4);
            const rest = order.slice(4);
            // settings/trash always reachable in more for admin
            ['settings', 'trash'].forEach(function(id) {
                if (typeof isAdmin === 'function' && isAdmin() && rest.indexOf(id) < 0 && primary.indexOf(id) < 0) rest.push(id);
            });

            function primaryBtn(id) {
                const m = tabMeta(id);
                const badge = (id === 'plan')
                    ? '<span id="mnavPlanBadge" class="tab-count-badge hidden">0</span>'
                    : '';
                const accentMap = {
                    home: 'mnav-c-home', expense: 'mnav-c-expense', stats: 'mnav-c-stats',
                    plan: 'mnav-c-plan', shopping: 'mnav-c-shop', vehicle: 'mnav-c-vehicle',
                    settings: 'mnav-c-settings', trash: 'mnav-c-trash'
                };
                const accent = accentMap[m.id] || '';
                return '<button type="button" data-mnav="' + m.id + '" onclick="mobileNavGo(\'' + m.id + '\')" class="mnav-item relative ' + accent + '">' +
                    '<span class="mnav-ico relative inline-block">' + m.emoji + badge + '</span>' +
                    '<span class="mnav-lbl">' + m.label + '</span></button>';
            }
            let html = primary.map(primaryBtn).join('');
            html += '<button type="button" data-mnav="more" onclick="mobileNavGo(\'more\')" class="mnav-item">' +
                '<span class="mnav-ico">☰</span><span class="mnav-lbl">Daha</span></button>';
            nav.innerHTML = html;

            if (moreBody) {
                moreBody.innerHTML = rest.map(function(id) {
                    const m = tabMeta(id);
                    const adminCls = m.adminOnly ? ' admin-only-btn' : '';
                    return '<button type="button" onclick="mobileNavGo(\'' + m.id + '\')" class="w-full text-left px-4 py-3.5 rounded-xl bg-slate-50 font-bold text-slate-800' + adminCls + '">' +
                        m.emoji + ' ' + m.label + '</button>';
                }).join('');
            }
            try { updateMobileBottomNav(lastActiveTabId || 'home'); } catch (_) {}
            try { if (typeof updateTaskNavBadges === 'function') updateTaskNavBadges(); } catch (_) {}
        };

        window.updateMobileBottomNav = function(activeId) {
            const nav = document.getElementById('mobileBottomNav');
            if (!nav) return;
            if (!nav.querySelector('[data-mnav]')) {
                try { rebuildMobileNav(); } catch (_) {}
            }
            const moreBody = document.getElementById('mobileMoreSheetBody');
            const moreIds = moreBody
                ? Array.prototype.map.call(moreBody.querySelectorAll('button[onclick]'), function(b) {
                    const m = String(b.getAttribute('onclick') || '').match(/mobileNavGo\('([^']+)'\)/);
                    return m ? m[1] : '';
                }).filter(Boolean)
                : [];
            nav.querySelectorAll('[data-mnav]').forEach(function(btn) {
                const id = btn.getAttribute('data-mnav');
                const on = id === activeId || (id === 'more' && moreIds.indexOf(activeId) >= 0);
                btn.classList.toggle('mnav-active', !!on);
            });
            if (typeof updateTaskNavBadges === 'function') updateTaskNavBadges();
        };

        // ——— Günün ayeti (ücretsiz API, her seferinde değişir) ———
        let _ayahTimer = null;
        let _lastAyahText = '';

        const SURAH_NAMES_TR = [
            '', 'Fatiha', 'Bakara', 'Al-i Imran', 'Nisa', 'Maide', 'Enam', 'Araf', 'Enfal', 'Tevbe',
            'Yunus', 'Hud', 'Yusuf', 'Rad', 'Ibrahim', 'Hicr', 'Nahl', 'Isra', 'Kehf', 'Meryem',
            'Taha', 'Enbiya', 'Hac', 'Muminun', 'Nur', 'Furkan', 'Suara', 'Neml', 'Kasas', 'Ankebut',
            'Rum', 'Lokman', 'Secde', 'Ahzab', 'Sebe', 'Fatir', 'Yasin', 'Saffat', 'Sad', 'Zumer',
            'Mumin', 'Fussilet', 'Sura', 'Zuhruf', 'Duhan', 'Casiye', 'Ahkaf', 'Muhammed', 'Fetih', 'Hucurat',
            'Kaf', 'Zariyat', 'Tur', 'Necm', 'Kamer', 'Rahman', 'Vakia', 'Hadid', 'Mucadele', 'Hasr',
            'Mumtahine', 'Saff', 'Cuma', 'Munafikun', 'Tegabun', 'Talak', 'Tahrim', 'Mulk', 'Kalem', 'Hakka',
            'Mearic', 'Nuh', 'Cin', 'Muzzemmil', 'Muddessir', 'Kiyame', 'Insan', 'Murselat', 'Nebe', 'Naziat',
            'Abese', 'Tekvir', 'Infitar', 'Mutaffifin', 'Insikak', 'Buruc', 'Tarik', 'Ala', 'Gasiye', 'Fecr',
            'Beled', 'Sems', 'Leyl', 'Duha', 'Insirah', 'Tin', 'Alak', 'Kadr', 'Beyyine', 'Zilzal',
            'Adiyat', 'Karia', 'Tekasur', 'Asr', 'Humeze', 'Fil', 'Kureys', 'Maun', 'Kevser', 'Kafirun',
            'Nasr', 'Tebbet', 'Ihlas', 'Felak', 'Nas'
        ];

        async function fetchDailyAyah() {
            // 1–6236 arası rastgele ayet, Diyanet Türkçe meal
            const n = 1 + Math.floor(Math.random() * 6236);
            const r = await fetch('https://api.alquran.cloud/v1/ayah/' + n + '/tr.diyanet', { cache: 'no-store' });
            if (!r.ok) throw new Error('ayah http');
            const j = await r.json();
            if (!j || j.code !== 200 || !j.data) throw new Error('ayah data');
            const d = j.data;
            const text = String(d.text || '').trim();
            if (!text) throw new Error('empty ayah');
            const surahNo = (d.surah && d.surah.number) ? Number(d.surah.number) : 0;
            const surahTr = (SURAH_NAMES_TR[surahNo]) ? SURAH_NAMES_TR[surahNo] : (d.surah && d.surah.englishName ? d.surah.englishName : '');
            const num = d.numberInSurah || '';
            const ref = surahTr
                ? (surahTr + (num ? (', ' + num) : ''))
                : ('Ayet ' + n);
            return { text: text, ref: ref, surahNo: surahNo, ayahNo: num, globalN: n };
        }

        window._currentAyah = null;

        window.loadDailyAyah = async function(force) {
            const el = document.getElementById('homeDailyAyah');
            if (!el) return;
            // force=false ve zaten yüklüyse dokunma ile değişmesin; sadece sekme yenilemede force veya ilk yükleme
            if (!force && el.dataset.loaded === '1' && window._currentAyah) {
                return;
            }
            el.textContent = 'Günün ayeti yükleniyor…';
            try {
                let item = null;
                let tries = 0;
                while (tries < 4) {
                    tries++;
                    item = await fetchDailyAyah();
                    if (item && item.text && item.text !== _lastAyahText) break;
                }
                if (!item || !item.text) throw new Error('no ayah');
                _lastAyahText = item.text;
                let body = item.text.replace(/\s+/g, ' ').trim();
                if (body.length > 300) body = body.slice(0, 297) + '…';
                el.textContent = 'Günün ayeti (' + item.ref + '): ' + body;
                el.dataset.loaded = '1';
                window._currentAyah = {
                    surahNo: item.surahNo || 0,
                    ayahNo: item.ayahNo || '',
                    ref: item.ref || '',
                    text: item.text
                };
                try {
                    sessionStorage.setItem('yuvam_ayah_cache', JSON.stringify({
                        t: Date.now(),
                        ref: item.ref,
                        text: body,
                        surahNo: item.surahNo || 0,
                        full: item.text
                    }));
                } catch (_) {}
            } catch (e) {
                try {
                    const raw = sessionStorage.getItem('yuvam_ayah_cache');
                    if (raw) {
                        const o = JSON.parse(raw);
                        if (o && o.text) {
                            el.textContent = 'Günün ayeti' + (o.ref ? (' (' + o.ref + ')') : '') + ': ' + o.text;
                            window._currentAyah = { surahNo: o.surahNo || 0, ref: o.ref || '', text: o.full || o.text };
                            el.dataset.loaded = '1';
                            return;
                        }
                    }
                } catch (_) {}
                el.textContent = 'Günün ayeti yüklenemedi';
            }
            // Otomatik periyodik değişim yok — sadece ana sayfa yenilenince
            if (_ayahTimer) { clearInterval(_ayahTimer); _ayahTimer = null; }
        };

        window.closeSurahModal = function() {
            const m = document.getElementById('surahModal');
            if (!m) return;
            m.classList.add('hidden');
            m.classList.remove('flex');
        };

        window.openSurahFromAyah = async function() {
            const m = document.getElementById('surahModal');
            const title = document.getElementById('surahModalTitle');
            const body = document.getElementById('surahModalBody');
            if (!m || !body) return;
            let surahNo = window._currentAyah && window._currentAyah.surahNo;
            if (!surahNo) {
                try {
                    const o = JSON.parse(sessionStorage.getItem('yuvam_ayah_cache') || '{}');
                    surahNo = o.surahNo;
                } catch (_) {}
            }
            if (!surahNo) {
                if (typeof showToast === 'function') showToast('Önce ayet yüklensin', 'info');
                return;
            }
            const nameTr = (SURAH_NAMES_TR[surahNo]) ? SURAH_NAMES_TR[surahNo] : ('Sure ' + surahNo);
            if (title) title.textContent = nameTr + ' suresi';
            body.innerHTML = '<p class="text-slate-400 font-semibold text-center py-6">Sure yükleniyor…</p>';
            m.classList.remove('hidden');
            m.classList.add('flex');
            try {
                const r = await fetch('https://api.alquran.cloud/v1/surah/' + surahNo + '/tr.diyanet', { cache: 'force-cache' });
                if (!r.ok) throw new Error('http');
                const j = await r.json();
                const ayas = (j && j.data && j.data.ayahs) ? j.data.ayahs : [];
                if (!ayas.length) throw new Error('empty');
                body.innerHTML = ayas.map(function(a) {
                    const n = a.numberInSurah || '';
                    const tx = String(a.text || '').trim();
                    return '<p class="leading-relaxed"><span class="text-[11px] font-black text-indigo-500 mr-1">' + n + '.</span>' +
                        escapeHtml(tx) + '</p>';
                }).join('');
            } catch (err) {
                body.innerHTML = '<p class="text-rose-600 font-semibold text-center py-4">Sure yüklenemedi. İnterneti kontrol edin.</p>';
            }
        };

