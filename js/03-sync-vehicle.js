/* YUVAM modül parçası — sırayla yüklenir (ES module değil, ortak global scope)
 * Bütçe hesap, araç profili, yakıt UI, realtime sync devam
 * GitHub: js/ klasörünün tamamını yükleyin.
 */
        // Bütçe Hesaplama
        function isMultinetPayment(pt) {
            const s = String(pt || '').toLocaleLowerCase('tr-TR');
            return s.indexOf('multinet') >= 0;
        }

        function isCreditPayment(pt) {
            if (isMultinetPayment(pt)) return false;
            const s = String(pt || '').toLocaleLowerCase('tr-TR');
            return s.indexOf('kredi') >= 0 || s.indexOf('kart') >= 0;
        }

        function isCashPayment(pt) {
            if (isMultinetPayment(pt)) return false;
            const s = String(pt || '').toLocaleLowerCase('tr-TR');
            return s.indexOf('nakit') >= 0 || s === 'cash';
        }

        function isOnBehalfExpense(e) {
            if (!e) return false;
            return !!(e.isOnBehalf || e.onBehalf);
        }

        /**
         * Dönem / kişi / KK toplamına dahil mi?
         * Multinet hariç (ayrı takip).
         * Başkası adına KK/nakit HARCAMASI dahil — gerçek kart ekstresinde görünür.
         * "Geri alındı" sadece alacak bayrağını değiştirir; toplamı düşürmez.
         */
        function countsInPeriodTotals(e) {
            if (!e) return false;
            if (e.installmentLabel === 'Gelir') return false;
            if (isMultinetPayment(e.paymentType)) return false;
            return true;
        }

        window.onOnBehalfToggle = function() {
            const chk = document.getElementById('isOnBehalf');
            const wrap = document.getElementById('onBehalfFields');
            if (wrap) wrap.classList.toggle('hidden', !(chk && chk.checked));
        };

        function todayYMD() {
            if (typeof todayDateStr === 'function') return todayDateStr();
            const d = new Date();
            return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        }

        /** Tekrarlı/taksit başkası-adına satırlarını ay ay üretir */
        function expandOnBehalfSchedule(item) {
            if (!item || !isOnBehalfExpense(item)) return [];
            const count = Math.max(1, parseInt(item.installmentCount, 10) || 1);
            const isRec = !!item.isRecurring;
            const isMulti = count > 1 || isRec;
            const baseDate = String(item.date || '').slice(0, 10);
            const perAmt = isRec
                ? (Number(item.amount) || 0)
                : (isMulti ? ((Number(item.amount) || 0) / count) : (Number(item.amount) || 0));
            const map = item.onBehalfReimbursedByMonth || {};
            const rows = [];
            const n = isMulti ? count : 1;
            for (let i = 0; i < n; i++) {
                const dateStr = (isMulti && typeof shiftDateByMonths === 'function')
                    ? shiftDateByMonths(baseDate, i)
                    : baseDate;
                const periodKey = (typeof getPeriodKeyForDateStr === 'function')
                    ? getPeriodKeyForDateStr(dateStr)
                    : String(dateStr || '').slice(0, 7);
                const monthKey = String(dateStr || '').slice(0, 7); // YYYY-MM takvim ayı
                const reimbursed = !!(map[monthKey] || map[periodKey] || (n === 1 && item.onBehalfReimbursed));
                rows.push({
                    expenseId: item.id,
                    installmentIndex: i,
                    date: String(dateStr || '').slice(0, 10),
                    monthKey: monthKey,
                    effectiveMonth: periodKey,
                    displayAmount: perAmt,
                    description: item.description,
                    person: item.person,
                    category: item.category,
                    billSubtype: item.billSubtype,
                    onBehalfOf: item.onBehalfOf,
                    reimbursed: reimbursed,
                    isRecurring: isRec
                });
            }
            return rows;
        }

        /**
         * Alacak listesi: yalnızca ödeme günü gelmiş (tarih <= bugün) ve henüz geri alınmamış aylar.
         * Gelecek aylar gösterilmez.
         */
        function getDueOnBehalfReceivables() {
            const today = todayYMD();
            const list = (typeof expenses !== 'undefined' && Array.isArray(expenses)) ? expenses : [];
            const out = [];
            list.forEach(function(item) {
                if (!item || !(item.isOnBehalf || item.onBehalf)) return;
                const rows = expandOnBehalfSchedule(item);
                // expand boş dönerse (eski kayıt) tek satır üret
                if (!rows.length) {
                    const d0 = String(item.date || '').slice(0, 10);
                    if (d0 && d0 <= today && !item.onBehalfReimbursed) {
                        out.push({
                            expenseId: item.id,
                            date: d0,
                            monthKey: d0.slice(0, 7),
                            displayAmount: Number(item.amount) || 0,
                            description: item.description || '',
                            category: item.category || '',
                            billSubtype: item.billSubtype || '',
                            onBehalfOf: item.onBehalfOf || '',
                            person: item.person || '',
                            isRecurring: !!item.isRecurring,
                            reimbursed: false
                        });
                    }
                    return;
                }
                rows.forEach(function(row) {
                    const d = String(row.date || '').slice(0, 10);
                    if (!d || d > today) return;
                    if (row.reimbursed) return;
                    out.push(row);
                });
            });
            out.sort(function(a, b) {
                return String(b.date || '').localeCompare(String(a.date || ''));
            });
            return out;
        }
        try { window.getDueOnBehalfReceivables = getDueOnBehalfReceivables; } catch (_) {}

        /** Ay bazlı geri alındı — tekrarlıda diğer aylar açık kalır */
        window.markOnBehalfReimbursed = async function(expenseId, monthKey, done) {
            if (!expenseId || !monthKey || !db) return;
            done = (done !== false);
            try {
                const ref = db.collection('expenses').doc(expenseId);
                const snap = await ref.get();
                if (!snap.exists) throw new Error('Kayıt yok');
                const data = snap.data() || {};
                const map = Object.assign({}, data.onBehalfReimbursedByMonth || {});
                if (done) map[monthKey] = true;
                else delete map[monthKey];
                const patch = {
                    onBehalfReimbursedByMonth: map,
                    updatedAt: new Date().toISOString()
                };
                // Tek satır veya tüm vadesi gelmiş aylar kapandıysa global bayrak
                const cnt = Math.max(1, parseInt(data.installmentCount, 10) || 1);
                const isRec = !!data.isRecurring;
                if (cnt <= 1 && !isRec) {
                    patch.onBehalfReimbursed = !!done;
                } else if (done) {
                    // Vadesi gelmiş tüm aylar map'te mi?
                    try {
                        const today = (typeof todayDateStr === 'function') ? todayDateStr() : new Date().toISOString().slice(0, 10);
                        const base = String(data.date || '').slice(0, 10);
                        const n = (cnt > 1 || isRec) ? cnt : 1;
                        let allDueDone = true;
                        for (let i = 0; i < n; i++) {
                            const ds = (typeof shiftDateByMonths === 'function') ? shiftDateByMonths(base, i) : base;
                            if (!ds || String(ds).slice(0, 10) > today) continue;
                            const mk = String(ds).slice(0, 7);
                            if (!map[mk]) { allDueDone = false; break; }
                        }
                        if (allDueDone) patch.onBehalfReimbursed = true;
                    } catch (_) {}
                } else {
                    patch.onBehalfReimbursed = false;
                }
                await ref.update(patch);

                // Yerel dizi anında güncelle (snapshot gecikmesin)
                try {
                    if (typeof expenses !== 'undefined' && Array.isArray(expenses)) {
                        const ix = expenses.findIndex(function(e) { return e && e.id === expenseId; });
                        if (ix >= 0) {
                            expenses[ix] = Object.assign({}, expenses[ix], {
                                onBehalfReimbursedByMonth: map,
                                onBehalfReimbursed: patch.onBehalfReimbursed != null
                                    ? patch.onBehalfReimbursed
                                    : expenses[ix].onBehalfReimbursed
                            });
                        }
                    }
                } catch (_) {}

                if (typeof showToast === 'function') {
                    showToast(done ? (monthKey + ' alacağı kapatıldı') : 'Alacak yeniden açıldı', 'success');
                }
                try { if (typeof renderOnBehalfReport === 'function') renderOnBehalfReport(); } catch (_) {}
                try { if (typeof renderTable === 'function') renderTable(); } catch (_) {}
                try { if (typeof updateDashboard === 'function') updateDashboard(); } catch (_) {}
            } catch (err) {
                if (typeof showToast === 'function') showToast((err && err.message) || 'Güncellenemedi', 'error');
            }
        };

        function sumByPay(list, pred) {
            return list.filter(pred).reduce(function(s, e) { return s + (Number(e.displayAmount) || 0); }, 0);
        }

        function fmtShortTL(n) {
            return (Number(n) || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 }) + ' TL';
        }

        function renderBudgetInfo() {
            const period = getCurrentPeriod();
            const periodInfo = getCurrentStatementPeriod();

            const processedExpenses = getProcessedExpenses().filter(function(e) {
                return e.effectiveMonth === period && countsInPeriodTotals(e);
            });
            const totalSpent = processedExpenses.reduce((sum, e) => sum + e.displayAmount, 0);
            const cardSpent = sumByPay(processedExpenses, function(e) { return isCreditPayment(e.paymentType); });

            const elTotal = document.getElementById('totalExpense');
            if (elTotal) elTotal.innerText = totalSpent.toLocaleString('tr-TR', {style:'currency', currency:'TRY'});

            const bekirList = processedExpenses.filter(e => e.person === 'Bekir');
            const duyguList = processedExpenses.filter(e => e.person === 'Duygu');
            const bekirSum = bekirList.reduce((s, e) => s + e.displayAmount, 0);
            const duyguSum = duyguList.reduce((s, e) => s + e.displayAmount, 0);
            const elBekir = document.getElementById('bekirExpense');
            const elDuygu = document.getElementById('duyguExpense');
            if (elBekir) elBekir.innerText = bekirSum.toLocaleString('tr-TR', {style:'currency', currency:'TRY'});
            if (elDuygu) elDuygu.innerText = duyguSum.toLocaleString('tr-TR', {style:'currency', currency:'TRY'});

            // Nakit / Kredi kartı kırılımı
            const setPair = function(cashId, cardId, list) {
                const cash = sumByPay(list, function(e) { return isCashPayment(e.paymentType); });
                const card = sumByPay(list, function(e) { return isCreditPayment(e.paymentType); });
                // diğer ödeme tipleri varsa kalanı kart+nakit dışında bırak; gösterimde sadece nakit+kk
                const cEl = document.getElementById(cashId);
                const kEl = document.getElementById(cardId);
                if (cEl) cEl.textContent = fmtShortTL(cash);
                if (kEl) kEl.textContent = fmtShortTL(card);
            };
            setPair('totalCashAmt', 'totalCardAmt', processedExpenses);
            setPair('bekirCashAmt', 'bekirCardAmt', bekirList);
            setPair('duyguCashAmt', 'duyguCardAmt', duyguList);

            const totalActiveDebt = (!bekirDebt.paid ? bekirDebt.amount : 0) + (!duyguDebt.paid ? duyguDebt.amount : 0);
            const elDebt = document.getElementById('totalCardDebtDisplay');
            if (elDebt) elDebt.innerText = totalActiveDebt.toLocaleString('tr-TR', {style:'currency', currency:'TRY'});

            const badge = document.getElementById('activePeriodBadge');
            if (badge && periodInfo) badge.textContent = 'Aktif dönem: ' + periodInfo.label;
            // Bütçe hedefi yalnızca kredi kartı harcamasına endeksli
            renderBudgetTargetUI(cardSpent, periodInfo);
            if (typeof renderMultinetReport === 'function') renderMultinetReport();
            if (typeof renderOnBehalfReport === 'function') renderOnBehalfReport();
            if (typeof refreshAppNotifications === 'function') refreshAppNotifications();
        }

        function renderBudgetTargetUI(totalSpent, periodInfo) {
            const card = document.getElementById('budgetTargetCard');
            const label = document.getElementById('budgetTargetLabel');
            const pctEl = document.getElementById('budgetTargetPct');
            const bar = document.getElementById('budgetTargetBar');
            const detail = document.getElementById('budgetTargetDetail');
            const target = Number(monthlyBudgetTarget) || 0;
            if (!card) return;
            if (!(target > 0)) {
                if (label) label.textContent = 'Hedef belirlenmedi';
                if (pctEl) pctEl.textContent = '—';
                if (bar) { bar.style.width = '0%'; bar.className = 'h-full rounded-full transition-all duration-700 bg-slate-300'; }
                if (detail) detail.textContent = 'Ayarlar → Bütçe hedefi (kredi kartı limiti)';
                return;
            }
            const spent = Number(totalSpent) || 0;
            const pct = Math.min(999, (spent / target) * 100);
            const remain = target - spent;
            if (label) label.textContent = 'KK hedef ' + target.toLocaleString('tr-TR') + ' TL';
            if (pctEl) {
                pctEl.textContent = '%' + pct.toFixed(0);
                pctEl.className = 'text-lg font-black ' + (pct >= 100 ? 'text-rose-600' : pct >= 80 ? 'text-amber-600' : 'text-emerald-600');
            }
            if (bar) {
                bar.style.width = Math.min(100, pct) + '%';
                bar.className = 'h-full rounded-full transition-all duration-700 ' + (pct >= 100 ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500');
            }
            if (detail) {
                const pl = periodInfo && periodInfo.label ? periodInfo.label + ' · ' : '';
                detail.textContent = pl + 'Kredi kartı ' + Math.round(spent).toLocaleString('tr-TR') + ' TL · ' +
                    (remain >= 0 ? ('kalan ' + Math.round(remain).toLocaleString('tr-TR') + ' TL') : ('aşım ' + Math.round(-remain).toLocaleString('tr-TR') + ' TL'));
            }
        }

        window.saveBudgetTarget = async function() {
            if (!isAdmin()) { showToast('Sadece admin', 'error'); return; }
            const raw = (document.getElementById('budgetTargetInput') || {}).value;
            const n = parseFloat(String(raw).replace(',', '.'));
            if (raw !== '' && raw != null && (isNaN(n) || n < 0 || n > 9999999)) {
                showToast('Geçerli bir hedef girin (0 = kapalı)', 'error');
                return;
            }
            const val = (!raw && raw !== 0) || isNaN(n) ? 0 : Math.round(n);
            try {
                await db.collection('settings').doc('budgetTarget').set({ amount: val, updatedAt: new Date().toISOString() }, { merge: true });
                monthlyBudgetTarget = val;
                showToast(val > 0 ? ('Hedef: ' + val.toLocaleString('tr-TR') + ' TL') : 'Bütçe hedefi kapatıldı', 'success');
                if (typeof renderBudgetInfo === 'function') renderBudgetInfo();
                logActivity('Diğer', 'Bütçe hedefi güncellendi', val > 0 ? (val + ' TL') : 'kapalı');
            } catch (err) {
                showToast(friendlyFirebaseError(err), 'error');
            }
        };

        // Kart Borcu İşlemleri
        window.setCardDebt = (person) => openCardDebtModal(person);
        window.handleCardDebtSubmit = async (e) => {
            e.preventDefault();
            try {
                const person = (document.getElementById('cardDebtPerson') || {}).value || 'bekir';
                const key = person === 'bekir' || person === 'Bekir' ? 'bekir' : 'duygu';
                const amountCheck = validateExpenseAmount((document.getElementById('cardDebtAmount') || {}).value);
                if (!amountCheck.ok) {
                    showToast(amountCheck.message, 'error');
                    return;
                }
                const amount = amountCheck.amount;
                const dueDate = getAutoCardDueDate();
                const debt = {
                    amount: amount,
                    paid: false,
                    dueDate: dueDate,
                    lastStatementId: null,
                    lastStatementMonth: null
                };
                if (key === 'bekir') {
                    bekirDebt = debt;
                    await db.collection('settings').doc('bekirDebt').set(debt);
                } else {
                    duyguDebt = debt;
                    await db.collection('settings').doc('duyguDebt').set(debt);
                }
                closeCardDebtModal();
                renderCardDebtUI(key);
                if (typeof renderBudgetInfo === 'function') renderBudgetInfo();
                showToast((key === 'bekir' ? 'Bekir' : 'Duygu') + ' kart borcu kaydedildi', 'success');
                logActivity('Diğer', 'Kart borcu girildi', (key === 'bekir' ? 'Bekir' : 'Duygu') + ' · ' + amount + ' TL');
            } catch (err) {
                console.error(err);
                showToast(friendlyFirebaseError(err), 'error');
            }
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

                    // Ekstre dönemi = harcama dönemi (29–28), son ödeme tarihinin dönemi değil
                    let statementMonth = debt.periodKey || null;
                    if (!statementMonth && debt.dueDate && typeof getPeriodKeyForDateStr === 'function') {
                        // Son ödeme genelde dönem bitiminden ~7–10 gün sonra → 12 gün geriye git
                        try {
                            const d = (typeof parseYMD === 'function') ? parseYMD(debt.dueDate) : new Date(debt.dueDate);
                            if (d && !isNaN(d.getTime())) {
                                d.setDate(d.getDate() - 12);
                                const ymd = (typeof formatYMD === 'function')
                                    ? formatYMD(d)
                                    : (d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'));
                                statementMonth = getPeriodKeyForDateStr(ymd);
                            }
                        } catch (_) {}
                    }
                    if (!statementMonth && typeof getPreviousPeriodKeys === 'function') {
                        const keys = getPreviousPeriodKeys(2);
                        // keys sorted oldest..? getPreviousPeriodKeys returns relative to current
                        statementMonth = (keys && keys.length >= 2) ? keys[keys.length - 2] : (keys && keys[0]);
                    }
                    if (!statementMonth && typeof getCurrentPeriod === 'function') statementMonth = getCurrentPeriod();
                    if (!statementMonth) statementMonth = new Date().toISOString().slice(0, 7);

                    const docId = key + '_' + statementMonth + '_' + Date.now();
                    const statementData = {
                        person: key,
                        month: statementMonth,
                        periodKey: statementMonth,
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

        window.updateCardDueDate = async (person, date) => {
            let debt = person === 'bekir' ? bekirDebt : duyguDebt;
            debt.dueDate = date;
            await db.collection("settings").doc(person + "Debt").set(debt);
        };

        function isActiveCardDebt(debt) {
            return debt && !debt.paid && Number(debt.amount) > 0;
        }

        function renderCardDebtUI(person) {
            const key = person === 'bekir' || person === 'Bekir' ? 'bekir' : 'duygu';
            const debt = key === 'bekir' ? bekirDebt : duyguDebt;
            const card = document.getElementById(key + 'DebtCard');
            const visible = isActiveCardDebt(debt);
            if (card) card.classList.toggle('hidden', !visible);

            const disp = document.getElementById(key + 'DebtDisplay');
            const dueDisp = document.getElementById(key + 'DueDateDisplay');
            if (disp) disp.innerText = (debt && debt.amount ? debt.amount : 0).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' });
            if (dueDisp) dueDisp.innerText = (debt && debt.dueDate) ? formatDateTR(debt.dueDate) : '-';

            const badge = document.getElementById(key + 'DebtStatusBadge');
            const btn = document.getElementById(key + 'DebtToggleBtn');
            if (badge && btn) {
                if (debt && debt.paid) {
                    badge.innerText = 'ÖDENDİ';
                    badge.className = 'inline-block mt-2 text-[10px] px-2.5 py-1 rounded-full font-bold uppercase bg-emerald-100 text-emerald-700';
                    btn.innerText = 'Borçlu Yap';
                    btn.className = 'text-[11px] font-bold px-3 py-2 rounded-xl shadow-sm transition bg-slate-100 text-slate-500';
                } else {
                    badge.innerText = 'ÖDENMEDİ';
                    badge.className = 'inline-block mt-2 text-[10px] px-2.5 py-1 rounded-full font-bold uppercase bg-rose-100 text-rose-700';
                    btn.innerText = 'Ödendi Yap';
                    btn.className = 'text-[11px] font-bold px-3 py-2 rounded-xl shadow-sm transition bg-rose-600 text-white';
                }
            }
            updateProgressBar(key, debt && debt.dueDate);
            if (typeof refreshAppNotifications === 'function') refreshAppNotifications();
        }

        function updateProgressBar(person, dueDateStr) {
            const bar = document.getElementById(person + 'ProgressBar');
            const percText = document.getElementById(person + 'ProgressPercentage');
            if (!bar || !percText) return;

            let period = null;
            try { period = getCurrentStatementPeriod(); } catch (_) {}
            const start = period && period.startDate ? period.startDate : null;
            let due = dueDateStr ? parseYMD(dueDateStr) : (period && period.endDate ? period.endDate : null);
            if (!due) {
                bar.style.width = '0%';
                percText.innerText = '0%';
                return;
            }
            const today = new Date();
            today.setHours(12, 0, 0, 0);
            const dueMid = new Date(due.getFullYear(), due.getMonth(), due.getDate(), 12, 0, 0);
            const startMid = start
                ? new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12, 0, 0)
                : new Date(dueMid.getFullYear(), dueMid.getMonth(), dueMid.getDate() - 30, 12, 0, 0);

            const totalMs = Math.max(1, dueMid - startMid);
            const elapsedMs = today - startMid;
            let percentage = Math.round(Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100)));
            const diffDays = Math.ceil((dueMid - today) / (1000 * 60 * 60 * 24));

            bar.style.width = percentage + '%';
            if (diffDays < 0) percText.innerText = 'Günü geçti';
            else if (diffDays === 0) percText.innerText = 'Bugün son gün';
            else percText.innerText = diffDays + ' gün';
            bar.className = 'h-full rounded-full transition-all duration-1000 ' + (diffDays <= 3 ? 'bg-rose-500' : 'bg-indigo-500');
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
            const shopWrap = document.getElementById('shopSubtypeWrap');
            if (!cat) return;
            const isVehicle = cat.value === 'Araç' || cat.value === 'Ulaşım';
            const isBill = cat.value === 'Faturalar';
            const isShop = (typeof isAlisverisCategory === 'function') ? isAlisverisCategory(cat.value) : (cat.value === 'Alışveriş');
            if (wrap) {
                wrap.classList.toggle('hidden', !isVehicle);
                const sel = document.getElementById('vehicleSubtype');
                if (sel && isVehicle && !sel.value) sel.value = 'Yakıt';
            }
            if (billWrap) {
                billWrap.classList.toggle('hidden', !isBill);
                if (isBill && typeof fillSubtypeSelects === 'function') fillSubtypeSelects();
            }
            if (shopWrap) {
                shopWrap.classList.toggle('hidden', !isShop);
                if (isShop && typeof fillSubtypeSelects === 'function') fillSubtypeSelects();
            }
            if (typeof onVehicleSubtypeChange === 'function') onVehicleSubtypeChange();
            // Alışveriş → Multinet ödeme seçeneği
            try { if (typeof refreshExpensePaymentOptions === 'function') refreshExpensePaymentOptions(); } catch (_) {}
        };

        window.onVehicleSubtypeChange = function() {
            const wrap = document.getElementById('fuelDetailWrap');
            const sel = document.getElementById('vehicleSubtype');
            const cat = document.getElementById('category');
            if (!wrap) return;
            const isFuel = cat && (cat.value === 'Araç' || cat.value === 'Ulaşım') && sel && sel.value === 'Yakıt';
            wrap.classList.toggle('hidden', !isFuel);
        };

        let vehicleFuelChart = null, vehicleMaintChart = null, vehicleFuelConsChart = null, vehicleFuelCostChart = null, vehicleFuelLitersChart = null, vehicleFuelPriceChart = null;
        let vehicleSubTab = 'fuel'; // fuel | maint


        window.toggleVehicleEdit = function() {
            const p = document.getElementById('vehicleEditPanel');
            if (!p) return;
            const open = p.classList.toggle('hidden') === false;
            if (open) fillVehicleEditForm();
        };

        function fillVehicleEditForm() {
            const v = vehicleProfile || {};
            const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val != null ? val : ''; };
            set('vehicleNameInput', v.name || 'Toyota Corolla');
            set('vehicleKmInput', v.totalKm != null ? v.totalKm : 184900);
            set('vehicleMaintDate', v.maintDate || '');
            set('vehicleMaintKm', v.maintKm != null ? v.maintKm : '');
            set('vehicleMaintNotes', v.maintNotes || '');
            set('vehicleInspectionDate', v.inspectionDate || '');
            set('vehicleInsuranceDate', v.insuranceDate || '');
            // MTV kaldırıldı
        }

        window.saveVehicleProfile = async function() {
            const num = (id) => {
                const el = document.getElementById(id);
                const n = el ? parseFloat(el.value) : NaN;
                return isFinite(n) ? n : 0;
            };
            const str = (id) => {
                const el = document.getElementById(id);
                return el ? String(el.value || '').trim() : '';
            };
            vehicleProfile = Object.assign({}, vehicleProfile, {
                name: str('vehicleNameInput') || 'Toyota Corolla',
                totalKm: num('vehicleKmInput') || 0,
                maintDate: str('vehicleMaintDate'),
                maintKm: num('vehicleMaintKm') || 0,
                maintNotes: str('vehicleMaintNotes'),
                inspectionDate: str('vehicleInspectionDate'),
                insuranceDate: str('vehicleInsuranceDate'),
                mtvDate: '',
                mtvAmount: 0,
                maintIntervalKm: vehicleProfile.maintIntervalKm || 10000,
                updatedAt: new Date().toISOString()
            });
            try {
                await db.collection('settings').doc('vehicleProfile').set(vehicleProfile, { merge: true });
                showToast('Araç bilgileri kaydedildi', 'success');
            } catch (err) {
                console.error(err);
                showToast('Kaydedilemedi: ' + (err.message || err), 'error');
            }
            renderVehicleProfileUI();
            try { refreshAppNotifications(); } catch (_) {}
            const p = document.getElementById('vehicleEditPanel');
            if (p) p.classList.add('hidden');
        };

        async function addVehicleKmFromFuel(km) {
            km = parseFloat(km);
            if (!isFinite(km) || km === 0) return;
            vehicleProfile.totalKm = Math.max(0, (Number(vehicleProfile.totalKm) || 0) + km);
            try {
                await db.collection('settings').doc('vehicleProfile').set({
                    totalKm: vehicleProfile.totalKm,
                    updatedAt: new Date().toISOString()
                }, { merge: true });
            } catch (err) {
                console.warn('KM güncellenemedi', err);
            }
            try { renderVehicleProfileUI(); } catch (_) {}
            try { refreshAppNotifications(); } catch (_) {}
        }

        function addMonthsYMD(ymd, months) {
            if (!ymd) return '';
            const p = String(ymd).slice(0, 10).split('-');
            if (p.length < 3) return '';
            const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
            d.setMonth(d.getMonth() + months);
            return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        }


        function getVehicleUpcomingItems() {
            const v = vehicleProfile || {};
            const items = [];
            const km = Number(v.totalKm) || 0;
            const mKm = Number(v.maintKm) || 0;
            const interval = Number(v.maintIntervalKm) || 10000;
            const nextMaintKm = mKm + interval;
            const kmLeft = nextMaintKm - km;
            if (isFinite(kmLeft)) {
                items.push({
                    key: 'veh-maint-km',
                    icon: '🔧',
                    title: 'Bakım',
                    detail: kmLeft <= 0 ? ('Geçti · ' + Math.abs(Math.round(kmLeft)) + ' km aşım') : (Math.round(kmLeft).toLocaleString('tr-TR') + ' km'),
                    severity: kmLeft <= 0 ? 'critical' : (kmLeft <= 2000 ? 'warning' : 'info'),
                    sort: kmLeft,
                    type: 'maint'
                });
            }
            if (v.inspectionDate) {
                const next = addMonthsYMD(v.inspectionDate, 24);
                const days = typeof daysUntilYMD === 'function' ? daysUntilYMD(next) : null;
                if (days != null) {
                    items.push({
                        key: 'veh-insp',
                        icon: '📄',
                        title: 'Muayene',
                        detail: days < 0 ? (Math.abs(days) + ' gün geçti') : (days + ' gün'),
                        severity: days <= 0 ? 'critical' : (days <= 30 ? 'warning' : 'info'),
                        sort: days,
                        type: 'inspection',
                        date: next
                    });
                }
            }
            if (v.insuranceDate) {
                const next = addMonthsYMD(v.insuranceDate, 12);
                const days = typeof daysUntilYMD === 'function' ? daysUntilYMD(next) : null;
                if (days != null) {
                    items.push({
                        key: 'veh-ins',
                        icon: '🛡️',
                        title: 'Sigorta-Kasko',
                        detail: days < 0 ? (Math.abs(days) + ' gün geçti') : (days + ' gün'),
                        severity: days <= 0 ? 'critical' : (days <= 30 ? 'warning' : 'info'),
                        sort: days,
                        type: 'insurance',
                        date: next
                    });
                }
            }
            return items;
        }

        function getMaintExpenseTotal() {
            try {
                return getProcessedExpenses().filter(function(e) {
                    return isVehicleExpense(e) && (e.vehicleSubtype === 'Bakım' || e.vehicleSubtype === 'Bakim');
                }).reduce(function(s, e) {
                    return s + (Number(e.displayAmount != null ? e.displayAmount : e.amount) || 0);
                }, 0);
            } catch (_) { return 0; }
        }

        function renderVehicleProfileUI() {
            const v = vehicleProfile || {};
            const nameEl = document.getElementById('vehicleNameDisplay');
            const kmEl = document.getElementById('vehicleKmDisplay');
            if (nameEl) nameEl.textContent = v.name || 'Toyota Corolla';
            if (kmEl) kmEl.textContent = (Number(v.totalKm) || 0).toLocaleString('tr-TR');

            const up = document.getElementById('vehicleUpcomingBox');
            if (up) {
                const items = getVehicleUpcomingItems();
                if (!items.length) {
                    up.innerHTML = '<p class="text-xs text-slate-400 font-semibold">Yaklaşan araç hatırlatması yok</p>';
                } else {
                    up.innerHTML = '<p class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Yaklaşanlar</p>' +
                        items.map(function(it) {
                            const col = it.severity === 'critical' ? 'text-rose-600' : (it.severity === 'warning' ? 'text-amber-600' : 'text-slate-700');
                            return '<div class="flex items-center justify-between gap-2 py-1.5 px-2 rounded-xl bg-slate-50 border border-slate-100">' +
                                '<span class="text-sm font-bold text-slate-800">' + it.icon + ' ' + it.title + '</span>' +
                                '<span class="text-sm font-black ' + col + '">' + it.detail + '</span></div>';
                        }).join('');
                }
            }

            const cards = document.getElementById('vehicleDetailCards');
            if (cards) {
                const maintTotal = getMaintExpenseTotal();
                const nextInsp = v.inspectionDate ? addMonthsYMD(v.inspectionDate, 24) : '—';
                const nextIns = v.insuranceDate ? addMonthsYMD(v.insuranceDate, 12) : '—';
                cards.innerHTML =
                    '<div class="bg-slate-50 rounded-2xl p-3 border border-slate-100">' +
                    '<p class="text-[10px] font-black text-slate-400 uppercase">Son bakım</p>' +
                    '<p class="text-sm font-bold text-slate-800 mt-1">' + (v.maintDate ? formatDateTR(v.maintDate) : '—') +
                    ' · ' + (Number(v.maintKm) || 0).toLocaleString('tr-TR') + ' km</p>' +
                    (v.maintNotes ? '<p class="text-[11px] text-slate-500 mt-1">' + escapeHtml(v.maintNotes) + '</p>' : '') +
                    '<p class="text-[11px] font-bold text-indigo-600 mt-1">Bakım harcamaları: ' + maintTotal.toLocaleString('tr-TR') + ' TL</p></div>' +
                    '<div class="bg-slate-50 rounded-2xl p-3 border border-slate-100">' +
                    '<p class="text-[10px] font-black text-slate-400 uppercase">Muayene — sonraki tarih</p>' +
                    '<p class="text-lg font-black text-slate-900 mt-1">' + (nextInsp !== '—' ? formatDateTR(nextInsp) : '—') + '</p>' +
                    '<p class="text-[11px] text-slate-400 mt-0.5">Son: ' + (v.inspectionDate ? formatDateTR(v.inspectionDate) : '—') + '</p></div>' +
                    '<div class="bg-slate-50 rounded-2xl p-3 border border-slate-100">' +
                    '<p class="text-[10px] font-black text-slate-400 uppercase">Sigorta / Kasko — sonraki tarih</p>' +
                    '<p class="text-lg font-black text-slate-900 mt-1">' + (nextIns !== '—' ? formatDateTR(nextIns) : '—') + '</p>' +
                    '<p class="text-[11px] text-slate-400 mt-0.5">Son: ' + (v.insuranceDate ? formatDateTR(v.insuranceDate) : '—') + '</p></div>';
            }
        }


        window.showVehicleSubTab = function(which) {
            window.toggleVehicleAccordion(which === 'maint' ? 'maint' : 'fuel');
        };

        window.toggleVehicleAccordion = function(which) {
            which = which === 'maint' ? 'maint' : 'fuel';
            const fuelPanel = document.getElementById('vehicleFuelPanel');
            const maintPanel = document.getElementById('vehicleMaintPanel');
            const fuelChev = document.getElementById('vehicleAccFuelChevron');
            const maintChev = document.getElementById('vehicleAccMaintChevron');
            if (which === 'fuel') {
                const open = fuelPanel && fuelPanel.classList.contains('hidden');
                if (fuelPanel) fuelPanel.classList.toggle('hidden', !open);
                if (maintPanel) maintPanel.classList.add('hidden');
                if (fuelChev) fuelChev.textContent = open ? '▲' : '▼';
                if (maintChev) maintChev.textContent = '▼';
                if (open) vehicleSubTab = 'fuel';
            } else {
                const open = maintPanel && maintPanel.classList.contains('hidden');
                if (maintPanel) maintPanel.classList.toggle('hidden', !open);
                if (fuelPanel) fuelPanel.classList.add('hidden');
                if (maintChev) maintChev.textContent = open ? '▲' : '▼';
                if (fuelChev) fuelChev.textContent = '▼';
                if (open) vehicleSubTab = 'maint';
            }
            try { renderVehicleTab(); } catch (_) {}
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



        // ——— Akaryakıt fiyatları (kendi dolum kayıtları) ———
        window.openFuelPriceModal = function() {
            const modal = document.getElementById('fuelPriceModal');
            const body = document.getElementById('fuelPriceModalBody');
            if (!modal || !body) return;
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            try {
                const list = (typeof getProcessedExpenses === 'function') ? getProcessedExpenses() : (expenses || []);
                const fuelRows = list.filter(function(e) {
                    if (!e) return false;
                    const st = String(e.vehicleSubtype || '').toLowerCase();
                    const hasPrice = Number(e.fuelPricePerLt) > 0;
                    return hasPrice && (st === 'yakıt' || st === 'yakit' || st.indexOf('yak') >= 0 ||
                        String(e.category || '').toLowerCase().indexOf('araç') >= 0 ||
                        String(e.category || '').toLowerCase().indexOf('arac') >= 0);
                });
                fuelRows.sort(function(a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
                if (!fuelRows.length) {
                    body.innerHTML = '<p class="text-slate-500 font-semibold text-center py-6 text-xs leading-relaxed">Henüz litre fiyatı girilmiş yakıt kaydı yok.<br><br>Harcama eklerken Araç → Yakıt seçip LT fiyatı girin; burada listelenir.</p>';
                    return;
                }
                // İstatistik
                const prices = fuelRows.map(function(e) { return Number(e.fuelPricePerLt); }).filter(function(n) { return n > 0; });
                const avg = prices.reduce(function(a, b) { return a + b; }, 0) / prices.length;
                const min = Math.min.apply(null, prices);
                const max = Math.max.apply(null, prices);
                const last = prices[0];
                let html = '<div class="grid grid-cols-3 gap-2 mb-3">' +
                    '<div class="rounded-xl bg-amber-50 border border-amber-100 p-2 text-center"><p class="text-[9px] font-bold text-amber-700 uppercase">Son</p><p class="text-sm font-black text-amber-900">' + last.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + '</p></div>' +
                    '<div class="rounded-xl bg-slate-50 border border-slate-100 p-2 text-center"><p class="text-[9px] font-bold text-slate-500 uppercase">Ort</p><p class="text-sm font-black text-slate-800">' + avg.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + '</p></div>' +
                    '<div class="rounded-xl bg-slate-50 border border-slate-100 p-2 text-center"><p class="text-[9px] font-bold text-slate-500 uppercase">Min–Max</p><p class="text-[11px] font-black text-slate-800">' + min.toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + '–' + max.toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + '</p></div>' +
                    '</div>';
                html += '<p class="text-[10px] text-slate-400 font-semibold mb-2">Son ' + Math.min(fuelRows.length, 20) + ' dolum</p>';
                html += fuelRows.slice(0, 20).map(function(e) {
                    const px = Number(e.fuelPricePerLt);
                    const lt = e.fuelLiters != null ? Number(e.fuelLiters) : null;
                    const km = e.fuelKm != null ? Number(e.fuelKm) : null;
                    const extra = [
                        lt ? (lt + ' L') : '',
                        km ? (km + ' km') : ''
                    ].filter(Boolean).join(' · ');
                    return '<div class="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100">' +
                        '<span class="text-base">⛽</span>' +
                        '<div class="min-w-0 flex-1">' +
                        '<p class="text-sm font-black text-slate-800">' + escapeHtml(e.description || e.note || 'Yakıt') + '</p>' +
                        '<p class="text-[11px] text-slate-500 font-semibold">' + formatDateTR(String(e.date || '').slice(0, 10)) +
                        (extra ? (' · ' + extra) : '') + '</p>' +
                        '</div>' +
                        '<p class="text-sm font-black text-amber-700 shrink-0">' + px.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL</p>' +
                        '</div>';
                }).join('');
                body.innerHTML = html;
            } catch (err) {
                body.innerHTML = '<p class="text-rose-600 font-semibold text-center py-4">' + escapeHtml(err.message || String(err)) + '</p>';
            }
        };

        window.closeFuelPriceModal = function() {
            const modal = document.getElementById('fuelPriceModal');
            if (!modal) return;
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        };


        window.renderVehicleTab = function() {
            try { renderVehicleProfileUI(); } catch (_) {}
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
                        maintainAspectRatio: false,
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
                            pointRadius: 8, pointHoverRadius: 12, pointHitRadius: 28,
                            pointBackgroundColor: color
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: true, position: 'bottom' } },
                        scales: { y: { beginAtZero: true } }
                    }
                });
            };

            if (vehicleFuelChart) { try { vehicleFuelChart.destroy(); } catch (_) {} }
            if (vehicleFuelLitersChart) { try { vehicleFuelLitersChart.destroy(); } catch (_) {} }
            if (vehicleFuelConsChart) { try { vehicleFuelConsChart.destroy(); } catch (_) {} }
            if (vehicleFuelCostChart) { try { vehicleFuelCostChart.destroy(); } catch (_) {} }
            if (vehicleFuelPriceChart) { try { vehicleFuelPriceChart.destroy(); } catch (_) {} }
            if (vehicleMaintChart) { try { vehicleMaintChart.destroy(); } catch (_) {} }

            // Dolum bazlı litre fiyatı
            const fillPrice = sortedFuel.map(function(e) {
                const p = parseFloat(e.fuelPricePerLt);
                if (p > 0) return +p.toFixed(2);
                const lt = parseFloat(e.fuelLiters);
                if (lt > 0 && e.displayAmount > 0) return +(e.displayAmount / lt).toFixed(2);
                return null;
            });

            // 1) Aylık harcama (TL) + litre — iki çubuk; web yan yana, mobil yatay (aylar alt alta)
            const ctxF = document.getElementById('vehicleFuelChart');
            if (ctxF) {
                const fuelMobile = typeof window !== 'undefined' && window.innerWidth < 640;
                // Mobilde boş ayları gizle → çubuklar daha büyük
                let mLabels = monthLabels.slice();
                let mSpend = fuelSpend.slice();
                let mLiters = fuelLitersM.slice();
                if (fuelMobile) {
                    const keep = [];
                    for (let i = 0; i < mLabels.length; i++) {
                        if ((mSpend[i] || 0) > 0 || (mLiters[i] || 0) > 0) keep.push(i);
                    }
                    if (keep.length) {
                        mLabels = keep.map(function(i) { return mLabels[i]; });
                        mSpend = keep.map(function(i) { return mSpend[i]; });
                        mLiters = keep.map(function(i) { return mLiters[i]; });
                    }
                    // Yüksek kutu: ay başına ~56px + eksen/legend
                    const box = ctxF.parentElement;
                    if (box) {
                        const h = Math.max(320, 72 + mLabels.length * 56);
                        box.style.height = h + 'px';
                    }
                }
                const fuelDatasets = fuelMobile ? [
                    {
                        label: 'Harcama (TL)',
                        data: mSpend,
                        backgroundColor: 'rgba(79, 70, 229, 0.85)',
                        borderRadius: 8,
                        maxBarThickness: 22,
                        barPercentage: 0.92,
                        categoryPercentage: 0.72,
                        xAxisID: 'x'
                    },
                    {
                        label: 'Litre (L)',
                        data: mLiters,
                        backgroundColor: 'rgba(6, 182, 212, 0.85)',
                        borderRadius: 8,
                        maxBarThickness: 22,
                        barPercentage: 0.92,
                        categoryPercentage: 0.72,
                        xAxisID: 'x1'
                    }
                ] : [
                    {
                        label: 'Harcama (TL)',
                        data: fuelSpend,
                        backgroundColor: 'rgba(79, 70, 229, 0.85)',
                        borderRadius: 6,
                        maxBarThickness: 32,
                        barPercentage: 0.85,
                        categoryPercentage: 0.75,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Litre (L)',
                        data: fuelLitersM,
                        backgroundColor: 'rgba(6, 182, 212, 0.85)',
                        borderRadius: 6,
                        maxBarThickness: 32,
                        barPercentage: 0.85,
                        categoryPercentage: 0.75,
                        yAxisID: 'y1'
                    }
                ];
                vehicleFuelChart = new Chart(ctxF, {
                    type: 'bar',
                    data: {
                        labels: fuelMobile ? mLabels : monthLabels,
                        datasets: fuelDatasets
                    },
                    options: {
                        indexAxis: fuelMobile ? 'y' : 'x',
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: { mode: 'index', intersect: false },
                        layout: {
                            padding: fuelMobile ? { top: 4, bottom: 4, left: 2, right: 8 } : { top: 4, bottom: 0 }
                        },
                        plugins: {
                            legend: {
                                display: true,
                                position: 'bottom',
                                labels: { boxWidth: 12, font: { size: fuelMobile ? 12 : 11 }, padding: fuelMobile ? 12 : 10 }
                            }
                        },
                        scales: fuelMobile ? {
                            x: {
                                beginAtZero: true,
                                position: 'bottom',
                                title: { display: true, text: 'TL', font: { size: 12, weight: '700' }, color: '#4f46e5' },
                                ticks: { color: '#4f46e5', font: { size: 11 } }
                            },
                            x1: {
                                beginAtZero: true,
                                position: 'top',
                                grid: { drawOnChartArea: false },
                                title: { display: true, text: 'Litre', font: { size: 12, weight: '700' }, color: '#06b6d4' },
                                ticks: { color: '#06b6d4', font: { size: 11 } }
                            },
                            y: {
                                ticks: { font: { size: 12, weight: '600' }, color: '#334155' }
                            }
                        } : {
                            x: {
                                stacked: false,
                                ticks: { maxRotation: 40, font: { size: 10 } }
                            },
                            y: {
                                beginAtZero: true,
                                position: 'left',
                                stacked: false,
                                title: { display: true, text: 'TL', font: { size: 11, weight: '600' }, color: '#4f46e5' },
                                ticks: { color: '#4f46e5' }
                            },
                            y1: {
                                beginAtZero: true,
                                position: 'right',
                                stacked: false,
                                grid: { drawOnChartArea: false },
                                title: { display: true, text: 'Litre', font: { size: 11, weight: '600' }, color: '#06b6d4' },
                                ticks: { color: '#06b6d4' }
                            }
                        }
                    }
                });
            }

            // 2) Tüketim (L/100km) + Km maliyeti (TL/km) — tek grafik
            const ctxC = document.getElementById('vehicleFuelConsChart');
            if (ctxC) {
                vehicleFuelConsChart = new Chart(ctxC, {
                    type: 'line',
                    data: {
                        labels: fillLabels.length ? fillLabels : ['Veri yok'],
                        datasets: [
                            {
                                label: 'L / 100 km',
                                data: fillCons.length ? fillCons : [0],
                                borderColor: '#10b981',
                                backgroundColor: 'rgba(16,185,129,0.12)',
                                fill: false,
                                tension: 0.3,
                                pointRadius: 8, pointHoverRadius: 12, pointHitRadius: 28,
                                pointBackgroundColor: '#10b981',
                                yAxisID: 'y'
                            },
                            {
                                label: 'TL / km',
                                data: fillCost.length ? fillCost : [0],
                                borderColor: '#f59e0b',
                                backgroundColor: 'rgba(245,158,11,0.12)',
                                fill: false,
                                tension: 0.3,
                                pointRadius: 8, pointHoverRadius: 12, pointHitRadius: 28,
                                pointBackgroundColor: '#f59e0b',
                                yAxisID: 'y1'
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: { mode: 'index', intersect: false },
                        plugins: { legend: { display: true, position: 'bottom' } },
                        scales: {
                            y: {
                                beginAtZero: true,
                                position: 'left',
                                title: { display: true, text: 'L/100 km', font: { size: 11, weight: '600' }, color: '#10b981' },
                                ticks: { color: '#10b981' }
                            },
                            y1: {
                                beginAtZero: true,
                                position: 'right',
                                grid: { drawOnChartArea: false },
                                title: { display: true, text: 'TL/km', font: { size: 11, weight: '600' }, color: '#f59e0b' },
                                ticks: { color: '#f59e0b' }
                            }
                        }
                    }
                });
            }

            // 3) Yakıt LT fiyatı (TL)
            const ctxP = document.getElementById('vehicleFuelPriceChart');
            if (ctxP) {
                vehicleFuelPriceChart = new Chart(ctxP, {
                    type: 'line',
                    data: {
                        labels: fillLabels.length ? fillLabels : ['Veri yok'],
                        datasets: [{
                            label: 'LT fiyatı (TL)',
                            data: fillPrice.length ? fillPrice : [null],
                            borderColor: '#8b5cf6',
                            backgroundColor: 'rgba(139, 92, 246, 0.12)',
                            fill: true,
                            tension: 0.3,
                            pointRadius: 8, pointHoverRadius: 12, pointHitRadius: 28,
                            pointBackgroundColor: '#8b5cf6',
                            spanGaps: true
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: true, position: 'bottom' } },
                        scales: {
                            y: {
                                beginAtZero: false,
                                title: { display: true, text: 'TL / L', font: { size: 11, weight: '600' }, color: '#8b5cf6' }
                            }
                        }
                    }
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
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
                });
            }
        };

        function validateExpenseAmount(raw) {
            const amount = parseFloat(String(raw).replace(',', '.'));
            if (isNaN(amount) || !isFinite(amount)) {
                return { ok: false, message: 'Geçerli bir tutar girin.' };
            }
            if (amount < AMOUNT_MIN) {
                return { ok: false, message: 'Tutar en az ' + AMOUNT_MIN + ' TL olmalı.' };
            }
            if (amount > AMOUNT_MAX) {
                return { ok: false, message: 'Tutar en fazla ' + AMOUNT_MAX.toLocaleString('tr-TR') + ' TL olabilir.\n(Çok büyük değer yanlışlıkla girilmiş olabilir.)' };
            }
            return { ok: true, amount: amount };
        }

        window.handleFormSubmit = async (e) => {
            e.preventDefault();
            const id = document.getElementById('editId').value;
            const amountCheck = validateExpenseAmount(document.getElementById('amount').value);
            if (!amountCheck.ok) {
                alert(amountCheck.message);
                const amtEl = document.getElementById('amount');
                if (amtEl) amtEl.focus();
                return;
            }
            const amount = amountCheck.amount;
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
            let shopSubtype = '';
            let isEcommerce = false;
            let fuelKm = null, fuelLiters = null, fuelPricePerLt = null;
            let fuelNote = '';
            const isShopCat = (typeof isAlisverisCategory === 'function') ? isAlisverisCategory(category) : (category === 'Alışveriş');
            if (category === 'Faturalar') {
                const bs = document.getElementById('billSubtype');
                billSubtype = bs ? bs.value : '';
                if (!billSubtype) {
                    alert('Fatura türü seçin: Elektrik, Su, Doğalgaz, Telefon, İnternet veya Abonelik');
                    return;
                }
            }
            if (isShopCat) {
                const ss = document.getElementById('shopSubtype');
                shopSubtype = ss ? String(ss.value || '').trim() : '';
                const ec = document.getElementById('isEcommerce');
                isEcommerce = !!(ec && ec.checked);
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
            const onBehalfChk = document.getElementById('isOnBehalf');
            if (onBehalfChk && onBehalfChk.checked) {
                const who = document.getElementById('onBehalfOf');
                if (!who || !String(who.value || '').trim()) {
                    alert('Başkası adına ödeme için "Kimin adına?" alanını doldurun');
                    if (who) who.focus();
                    return;
                }
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
                shopSubtype: isShopCat ? shopSubtype : '',
                isEcommerce: isShopCat ? !!isEcommerce : false,
                fuelKm: fuelKm,
                fuelLiters: fuelLiters,
                fuelPricePerLt: fuelPricePerLt,
                fuelNote: fuelNote || '',
                isOnBehalf: !!(document.getElementById('isOnBehalf') && document.getElementById('isOnBehalf').checked),
                onBehalfOf: (function() {
                    const el = document.getElementById('onBehalfOf');
                    return el ? String(el.value || '').trim() : '';
                })(),
                onBehalfReimbursed: !!(document.getElementById('onBehalfReimbursed') && document.getElementById('onBehalfReimbursed').checked)
            };
            // Ay bazlı alacak haritası — kutucuk bu kaydın tarih ayını aç/kapatır
            (function() {
                const onB = !!(document.getElementById('isOnBehalf') && document.getElementById('isOnBehalf').checked);
                if (!onB) {
                    data.onBehalfOf = '';
                    data.onBehalfReimbursed = false;
                    data.onBehalfReimbursedByMonth = {};
                    return;
                }
                const mk = String(data.date || '').slice(0, 7);
                let map = {};
                if (id) {
                    try {
                        const prev = (expenses || []).find(function(x) { return x.id === id; });
                        if (prev && prev.onBehalfReimbursedByMonth) {
                            map = Object.assign({}, prev.onBehalfReimbursedByMonth);
                        }
                    } catch (_) {}
                }
                const cnt = Math.max(1, parseInt(data.installmentCount, 10) || 1);
                const isRec = !!data.isRecurring;
                if (data.onBehalfReimbursed) {
                    if (mk) map[mk] = true;
                    // Tek seferlik: tümünü kapatılmış say
                    if (cnt <= 1 && !isRec) {
                        data.onBehalfReimbursed = true;
                    } else {
                        // Tekrarlı: sadece bu ay; global yalnızca tüm vadesi gelenler doluysa
                        data.onBehalfReimbursed = false;
                        try {
                            const today = (typeof todayDateStr === 'function') ? todayDateStr() : new Date().toISOString().slice(0, 10);
                            const base = String(data.date || '').slice(0, 10);
                            const n = cnt;
                            let allDue = true;
                            for (let i = 0; i < n; i++) {
                                const ds = (typeof shiftDateByMonths === 'function') ? shiftDateByMonths(base, i) : base;
                                if (!ds || String(ds).slice(0, 10) > today) continue;
                                const mki = String(ds).slice(0, 7);
                                if (!map[mki]) { allDue = false; break; }
                            }
                            if (allDue) data.onBehalfReimbursed = true;
                        } catch (_) {}
                    }
                } else {
                    // Kutu kapalı → bu ayı alacak yap (haritadan sil)
                    if (mk) delete map[mk];
                    try {
                        if (typeof getPeriodKeyForDateStr === 'function') {
                            const pk = getPeriodKeyForDateStr(String(data.date || '').slice(0, 10));
                            if (pk) delete map[pk];
                        }
                    } catch (_) {}
                    data.onBehalfReimbursed = false;
                }
                data.onBehalfReimbursedByMonth = map;
            })();
            
            try {
                if (id) {
                    data.updatedAt = new Date().toISOString();
                    await db.collection("expenses").doc(id).update(data);
                } else {
                    data.createdAt = new Date().toISOString();
                    data.updatedAt = data.createdAt;
                    await db.collection("expenses").add(data);
                }
                
                resetForm();
                closeExpenseModal();
                await new Promise(resolve => setTimeout(resolve, 300));
                try { renderApp(); } catch (_) {}
                try {
                    if (typeof ensureChartJs === 'function') {
                        /* stats açık değilse chart yükleme */
                    } else if (typeof updateStatsPanel === 'function' && typeof isStatsTabActive === 'function' && isStatsTabActive()) {
                        updateStatsPanel();
                    }
                } catch (_) {}
                logActivity('Harcama', id ? 'Harcama güncellendi' : 'Harcama eklendi',
                    (person || '') + ' · ' + (category || '') + ' · ' + amount + ' TL' + (description && description !== '-' ? ' · ' + description : ''));
                if (typeof window._yuvamOnline !== 'undefined' && !window._yuvamOnline) {
                    showToast('Çevrimdışı kaydedildi — internet gelince senkronlanır', 'info');
                } else {
                    showToast(id ? 'Harcama güncellendi' : 'Harcama eklendi', 'success');
                }
                if (!id) {
                    setTimeout(function() {
                        try { if (typeof showEyvahPopup === 'function') showEyvahPopup(); } catch (_) {}
                        try {
                            if (data && data.vehicleSubtype === 'Yakıt' && data.fuelKm) {
                                addVehicleKmFromFuel(data.fuelKm);
                            }
                        } catch (_) {}
                    }, 350);
                }
            } catch (err) {
                console.error("Harcama kayıt hatası:", err);
                showToast(friendlyFirebaseError(err), 'error');
            }
        };

        let _eyvahTimer = null;
        window.showEyvahPopup = function() {
            try {
                const ov = document.getElementById('eyvahOverlay');
                if (!ov) {
                    console.warn('eyvahOverlay yok');
                    return;
                }
                ov.classList.remove('hidden');
                ov.style.display = 'flex';
                ov.setAttribute('aria-hidden', 'false');
                if (_eyvahTimer) clearTimeout(_eyvahTimer);
                _eyvahTimer = setTimeout(function() {
                    ov.classList.add('hidden');
                    ov.style.display = '';
                    ov.setAttribute('aria-hidden', 'true');
                }, 5000);
                ov.onclick = function() {
                    ov.classList.add('hidden');
                    ov.style.display = '';
                    ov.setAttribute('aria-hidden', 'true');
                    if (_eyvahTimer) clearTimeout(_eyvahTimer);
                };
            } catch (err) {
                console.error('showEyvahPopup', err);
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

            // Yakıt km geri al
            try {
                const isFuel = (item.category === 'Araç' || item.category === 'Ulaşım')
                    && (item.vehicleSubtype === 'Yakıt' || item.vehicleSubtype === 'Yakit');
                const km = parseFloat(item.fuelKm);
                if (isFuel && isFinite(km) && km > 0 && typeof addVehicleKmFromFuel === 'function') {
                    await addVehicleKmFromFuel(-km);
                }
            } catch (e) { console.warn('KM geri alma', e); }
            
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
            let catVal = e.category === 'Ulaşım' ? 'Araç' : e.category;
            // Eski Gıda/Giyim/E-ticaret → Alışveriş
            if (typeof isLegacyShopCategory === 'function' && isLegacyShopCategory(catVal)) catVal = 'Alışveriş';
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
            const ss = document.getElementById('shopSubtype');
            if (ss) ss.value = e.shopSubtype || '';
            const ec = document.getElementById('isEcommerce');
            if (ec) ec.checked = !!(e.isEcommerce || e.category === 'E-ticaret');
            if (typeof onVehicleSubtypeChange === 'function') onVehicleSubtypeChange();
            const fk = document.getElementById('fuelKm');
            const fl = document.getElementById('fuelLiters');
            const fp = document.getElementById('fuelPricePerLt');
            if (fk) fk.value = e.fuelKm != null ? e.fuelKm : '';
            if (fl) fl.value = e.fuelLiters != null ? e.fuelLiters : '';
            if (fp) fp.value = e.fuelPricePerLt != null ? e.fuelPricePerLt : '';
            const ob = document.getElementById('isOnBehalf');
            if (ob) ob.checked = !!(e.isOnBehalf || e.onBehalf);
            const obOf = document.getElementById('onBehalfOf');
            if (obOf) obOf.value = e.onBehalfOf || '';
            const obR = document.getElementById('onBehalfReimbursed');
            if (obR) {
                // Bu kaydın tarih ayı geri alınmış mı? (tekrarlıda global bayrak yanıltıcı olabilir)
                const mk = String(e.date || '').slice(0, 7);
                const map = e.onBehalfReimbursedByMonth || {};
                const mapKeys = Object.keys(map);
                let paid = false;
                if (mapKeys.length) {
                    paid = !!(mk && map[mk]);
                    try {
                        if (!paid && typeof getPeriodKeyForDateStr === 'function') {
                            const pk = getPeriodKeyForDateStr(String(e.date || '').slice(0, 10));
                            if (pk && map[pk]) paid = true;
                        }
                    } catch (_) {}
                } else {
                    paid = !!e.onBehalfReimbursed;
                }
                obR.checked = paid;
            }
            if (typeof onOnBehalfToggle === 'function') onOnBehalfToggle();
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

