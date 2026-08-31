
        /** Rapor/grafik kategori etiketi: E-ticaret ayrı, eski Gıda/Giyim → Alışveriş */
        function expenseReportCategory(e) {
            if (!e) return 'Diğer';
            if (e.isEcommerce || e.category === 'E-ticaret') return 'E-ticaret';
            if (typeof isLegacyShopCategory === 'function' && isLegacyShopCategory(e.category)) return 'Alışveriş';
            if ((typeof isAlisverisCategory === 'function' && isAlisverisCategory(e.category)) || e.category === 'Alışveriş') {
                if (e.shopSubtype) return 'Alışveriş · ' + e.shopSubtype;
                return 'Alışveriş';
            }
            return e.category || 'Diğer';
        }

/* YUVAM modül parçası — sırayla yüklenir (ES module değil, ortak global scope)
 * Harcama işleme, grafikler, Yuvam AI, istatistik
 * GitHub: js/ klasörünün tamamını yükleyin.
 */
        
        window.yuvamChartPalette = function() {
            // Ocean / warm / forest uyumlu marka paleti
            return ['#0284c7', '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#f43f5e', '#06b6d4', '#eab308', '#6366f1', '#ec4899', '#14b8a6', '#f97316'];
        };
function getProcessedExpenses() {
            // Harcamaları 29–28 ekstre dönemine göre işler.
            // Taksit/tekrar: TÜM dilimler (grafik + dönem özeti doğru olsun diye)
            let processed = [];
            const list = (typeof expenses !== 'undefined' && expenses) ? expenses : [];

            list.forEach(function(item) {
                if (!item) return;
                const count = Number(item.installmentCount) || 1;
                const isRec = !!item.isRecurring;
                const originalDate = item.date;
                const totalAmt = Number(item.amount) || 0;
                const perAmount = isRec
                    ? (item.amountPerInstallment != null ? Number(item.amountPerInstallment) : totalAmt)
                    : (item.amountPerInstallment != null ? Number(item.amountPerInstallment) : (totalAmt / Math.max(1, count)));

                if (count <= 1 && !isRec) {
                    const periodKey = (typeof getPeriodKeyForDateStr === 'function')
                        ? getPeriodKeyForDateStr(originalDate)
                        : String(originalDate || '').slice(0, 7);
                    processed.push(Object.assign({}, item, {
                        displayAmount: totalAmt,
                        installmentLabel: 'Peşin',
                        effectiveMonth: periodKey,
                        date: originalDate
                    }));
                    return;
                }

                const n = Math.max(1, count);
                for (let i = 0; i < n; i++) {
                    const dateStr = (typeof shiftDateByMonths === 'function')
                        ? shiftDateByMonths(originalDate, i)
                        : originalDate;
                    const periodKey = (typeof getPeriodKeyForDateStr === 'function')
                        ? getPeriodKeyForDateStr(dateStr)
                        : String(dateStr || '').slice(0, 7);
                    const label = isRec
                        ? ('Tekrar ' + (i + 1) + '/' + n)
                        : (n > 1 ? ('Taksit ' + (i + 1) + '/' + n) : 'Peşin');
                    processed.push(Object.assign({}, item, {
                        id: String(item.id || '') + '_ins_' + i,
                        _baseId: item.id,
                        displayAmount: perAmount,
                        installmentLabel: label,
                        effectiveMonth: periodKey,
                        date: dateStr,
                        installmentIndex: i
                    }));
                }
            });
            return (typeof dedupePeriodExpenseRows === 'function')
                ? dedupePeriodExpenseRows(processed)
                : processed;
        }

        /** Tüm taksit/tekrar satırları (bu dönem + gelecek + geçmiş) — modal için */
        function getInstallmentScheduleRows() {
            const rows = [];
            const list = (typeof expenses !== 'undefined' && expenses) ? expenses : [];
            list.forEach(function(item) {
                if (!item) return;
                if (item.installmentLabel === 'Gelir') return;
                const count = item.installmentCount || 1;
                const isMulti = count > 1 || !!item.isRecurring;
                if (!isMulti) return;
                const originalDate = item.date;
                const perAmount = item.isRecurring
                    ? (Number(item.amount) || 0)
                    : ((Number(item.amount) || 0) / count);
                for (let i = 0; i < count; i++) {
                    const dateStr = typeof shiftDateByMonths === 'function'
                        ? shiftDateByMonths(originalDate, i)
                        : originalDate;
                    const periodKey = typeof getPeriodKeyForDateStr === 'function'
                        ? getPeriodKeyForDateStr(dateStr)
                        : String(dateStr || '').slice(0, 7);
                    const label = item.isRecurring
                        ? ('Tekrar ' + (i + 1) + '/' + count)
                        : ('Taksit ' + (i + 1) + '/' + count);
                    rows.push(Object.assign({}, item, {
                        id: item.id + '_ins_' + i,
                        displayAmount: perAmount,
                        installmentLabel: label,
                        effectiveMonth: periodKey,
                        date: dateStr,
                        installmentIndex: i
                    }));
                }
            });
            return rows;
        }

        function formatDateTR(ymd) {
            const s = String(ymd || '').slice(0, 10);
            const p = s.split('-');
            if (p.length !== 3) return s || '-';
            return p[2] + '.' + p[1] + '.' + p[0];
        }

        window.toggleExpenseCard = function(el, ev) {
            if (ev && ev.target && ev.target.closest && ev.target.closest('button')) return;
            if (!el) return;
            const wasOpen = el.classList.contains('is-open');
            // tek açık kart
            document.querySelectorAll('.expense-m-card.is-open').forEach(function(c) {
                if (c !== el) c.classList.remove('is-open');
            });
            el.classList.toggle('is-open', !wasOpen);
        };


        function expenseTimeKey(item) {
            if (!item) return '';
            const c = item.createdAt;
            if (c != null && c !== '') {
                if (typeof c === 'string') {
                    // ISO veya benzeri
                    return c;
                }
                if (typeof c.toDate === 'function') {
                    try { return c.toDate().toISOString(); } catch (_) {}
                }
                if (typeof c === 'object' && c.seconds != null) {
                    return new Date(Number(c.seconds) * 1000 + Math.floor(Number(c.nanoseconds || 0) / 1e6)).toISOString();
                }
                if (c instanceof Date && !isNaN(c.getTime())) return c.toISOString();
            }
            // updatedAt yedek
            const u = item.updatedAt;
            if (typeof u === 'string' && u) return u;
            if (u && typeof u.toDate === 'function') {
                try { return u.toDate().toISOString(); } catch (_) {}
            }
            // Firestore auto-id kabaca zaman sıralı
            return String(item.id || '');
        }


        /** Bu satır/ay için alacak geri alınmış mı? Harita varsa ay bazlı; yoksa global bayrak */
        function isOnBehalfMonthReimbursed(item) {
            if (!item || !(item.isOnBehalf || item.onBehalf)) return false;
            const map = item.onBehalfReimbursedByMonth || {};
            const keys = Object.keys(map);
            const d = String(item.date || item.effectiveDate || '').slice(0, 10);
            const mk = d.slice(0, 7);
            if (keys.length) {
                if (mk && map[mk]) return true;
                try {
                    if (typeof getPeriodKeyForDateStr === 'function' && d) {
                        const pk = getPeriodKeyForDateStr(d);
                        if (pk && map[pk]) return true;
                    }
                } catch (_) {}
                return false; // harita var ama bu ay işaretli değil → Alacak
            }
            return !!item.onBehalfReimbursed;
        }

        function onBehalfBadgeHtml(item) {
            if (!item || !(item.isOnBehalf || item.onBehalf)) return '';
            const who = escapeHtml(item.onBehalfOf || 'Başkası');
            if (isOnBehalfMonthReimbursed(item)) {
                return '<span class="inline-block text-[9px] font-black px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500">Alındı · ' + who + '</span>';
            }
            return '<span class="inline-block text-[9px] font-black px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800">Alacak · ' + who + '</span>';
        }


        function expenseMatchesTextQuery(item, qRaw) {
            const q = String(qRaw || '').trim();
            if (!q) return true;
            const qLower = q.toLocaleLowerCase('tr-TR');
            const qNumStr = q.replace(/\s/g, '').replace(',', '.');
            const isNum = /^\d+(\.\d+)?$/.test(qNumStr);
            if (isNum) {
                const n = Number(qNumStr);
                if (isFinite(n)) {
                    const amounts = [item.displayAmount, item.amount, item.totalAmount]
                        .map(function(x) { return Number(x); })
                        .filter(function(x) { return isFinite(x); });
                    for (let i = 0; i < amounts.length; i++) {
                        const a = amounts[i];
                        if (Math.abs(a - n) < 0.009) return true;
                        if (Math.round(a) === Math.round(n)) return true;
                    }
                }
            }
            const amt = Math.round(Number(item.displayAmount != null ? item.displayAmount : item.amount) || 0);
            const blob = [
                item.category, item.description, item.person, item.paymentType,
                item.vehicleSubtype, item.billSubtype, item.shopSubtype,
                item.isEcommerce ? 'e-ticaret' : '', item.installmentLabel, item.fuelNote,
                String(amt), String(amt).replace(/\B(?=(\d{3})+(?!\d))/g, '.'),
                String(Number(item.displayAmount != null ? item.displayAmount : item.amount) || '')
            ].map(function(x) { return String(x || ''); }).join(' ').toLocaleLowerCase('tr-TR');
            return blob.indexOf(qLower) >= 0;
        }

        function renderTable() {
            const tbody = document.getElementById('expenseTableBody');
            const cardsHost = document.getElementById('expenseCardsMobile');
            if (tbody) tbody.innerHTML = '';
            if (cardsHost) cardsHost.innerHTML = '';

            let filtered = [];

            filtered = getProcessedExpenses().map(function(e) { return Object.assign({}, e); });

            filtered = filtered.filter(item => {
                if (currentPersonFilter !== 'Tümü' && item.person !== currentPersonFilter) return false;
                if (currentCategoryFilter !== 'Tümü' && item.category !== currentCategoryFilter) return false;
                if (currentPaymentFilter !== 'Tümü' && item.paymentType !== currentPaymentFilter) return false;

                // Alışveriş alt türü
                if (typeof currentShopSubtypeFilter !== 'undefined' && currentShopSubtypeFilter && currentShopSubtypeFilter !== 'Tümü') {
                    const st = String(item.shopSubtype || '').trim();
                    if (currentShopSubtypeFilter === '__empty__') {
                        if (st) return false;
                    } else if (st !== currentShopSubtypeFilter) {
                        return false;
                    }
                }
                // E-ticaret
                if (typeof currentEcommerceFilter !== 'undefined' && currentEcommerceFilter && currentEcommerceFilter !== 'Tümü') {
                    const isEc = !!(item.isEcommerce);
                    if (currentEcommerceFilter === 'Evet' && !isEc) return false;
                    if (currentEcommerceFilter === 'Hayır' && isEc) return false;
                }

                if (currentStartDateFilter && item.date < currentStartDateFilter) return false;
                if (currentEndDateFilter && item.date > currentEndDateFilter) return false;

                if (currentSearchFilter) {
                    if (!expenseMatchesTextQuery(item, currentSearchFilter)) return false;
                }

                return true;
            });

            // Kelime araması sonucu toplamı
            try {
                const sumEl = document.getElementById('expenseSearchSum');
                if (sumEl) {
                    const q = String(currentSearchFilter || '').trim();
                    if (q) {
                        let sum = 0;
                        filtered.forEach(function(e) {
                            if (!e || e.installmentLabel === 'Gelir') return;
                            sum += Number(e.displayAmount) || 0;
                        });
                        sumEl.textContent = '"' + q + '" · ' + filtered.length + ' kayıt · toplam ' +
                            Math.round(sum).toLocaleString('tr-TR') + ' TL';
                        sumEl.classList.remove('hidden');
                    } else {
                        sumEl.textContent = '';
                        sumEl.classList.add('hidden');
                    }
                }
            } catch (_) {}

            filtered.sort((a, b) => {
                if (sortColumn === 'date') {
                    const dA = String(a.date || '');
                    const dB = String(b.date || '');
                    if (dA !== dB) {
                        return sortDirection === 'asc' ? (dA > dB ? 1 : -1) : (dA < dB ? 1 : -1);
                    }
                    // Aynı gün: her zaman en son eklenen üstte (saat / createdAt)
                    const tA = expenseTimeKey(a);
                    const tB = expenseTimeKey(b);
                    if (tA !== tB) return tA < tB ? 1 : -1;
                    return String(b.id || '').localeCompare(String(a.id || ''));
                }
                let vA = a[sortColumn], vB = b[sortColumn];
                if (sortColumn === 'amount') { vA = a.displayAmount; vB = b.displayAmount; }
                if (vA === vB) {
                    const tA = expenseTimeKey(a);
                    const tB = expenseTimeKey(b);
                    if (tA !== tB) return tA < tB ? 1 : -1;
                }
                return sortDirection === 'asc' ? (vA > vB ? 1 : -1) : (vA < vB ? 1 : -1);
            });

            const isInc = function(item) { return item && item.installmentLabel === 'Gelir'; };
            const curPeriodKey = (typeof getCurrentPeriod === 'function') ? getCurrentPeriod() : '';
            const isCurrentPeriodItem = function(item) {
                if (!item || !curPeriodKey) return true;
                if (item.effectiveMonth) return String(item.effectiveMonth) === String(curPeriodKey);
                if (typeof getPeriodKeyForDateStr === 'function') {
                    return getPeriodKeyForDateStr(item.date) === curPeriodKey;
                }
                return true;
            };
            // İleri tarihli: sadece aktif ekstre döneminde yapılacaklar
            const futuresAll = filtered.filter(function(item) {
                return !isInc(item) && isFutureDateStr(item.date) && isCurrentPeriodItem(item);
            });
            const normalsAll = filtered.filter(function(item) {
                return isInc(item) || !isFutureDateStr(item.date);
            });
            const limit = Math.max(5, Number(displayLimit) || 5);
            const normals = normalsAll.slice(0, limit);
            const totalRecords = normalsAll.length;
            const displayedRecords = normals.length;

            // --- Web tablo ---
            if (tbody) {
                tbody.innerHTML = '';
                const futures = futuresAll;

                function appendExpenseRow(item, extraClass) {
                    const tr = document.createElement('tr');
                    const isIncome = isInc(item);
                    const isFuture = !isIncome && isFutureDateStr(item.date);
                    tr.className = (extraClass || '') + (isFuture ? ' row-future-expense' : '');
                    tr.className = tr.className.trim();
                    if (isFuture) tr.title = 'İleri tarihli kayıt';
                    const safeId = escapeHtml(item.id);
                    const dateCell = isFuture
                        ? '<td class="px-4 sm:px-8 py-4 sm:py-5"><span class="inline-flex items-center gap-1.5 flex-wrap"><span>' + escapeHtml(item.date || '-') + '</span><span class="text-[9px] font-black uppercase tracking-wide future-badge px-1.5 py-0.5 rounded">İleri</span></span></td>'
                        : '<td class="px-4 sm:px-8 py-4 sm:py-5 opacity-60">' + escapeHtml(item.date || '-') + '</td>';
                    let catLabel = escapeHtml(item.category || '-');
                    if (item.shopSubtype) catLabel += ' · ' + escapeHtml(item.shopSubtype);
                    if (item.isEcommerce) catLabel += ' · E-ticaret';
                    if (item.billSubtype) catLabel += ' · ' + escapeHtml(item.billSubtype);
                    const personBadge = item.person === 'Bekir'
                        ? 'bg-blue-50 text-blue-600'
                        : (item.person === 'Duygu' ? 'bg-pink-50 text-pink-600' : 'bg-emerald-50 text-emerald-600');
                    tr.innerHTML =
                        dateCell +
                        '<td class="px-4 sm:px-6 py-4 sm:py-5"><span class="px-2.5 py-1 rounded-lg text-[10px] font-black ' + personBadge + '">' + escapeHtml(item.person || '-') + '</span></td>' +
                        '<td class="px-4 sm:px-6 py-4 sm:py-5 font-bold text-slate-800">' + catLabel + '</td>' +
                        '<td class="px-4 sm:px-6 py-4 sm:py-5 text-slate-600">' + escapeHtml(item.paymentType || '-') + '</td>' +
                        '<td class="px-4 sm:px-6 py-4 sm:py-5 text-slate-600">' + escapeHtml(item.description || '-') +
                          (item.installmentLabel && item.installmentLabel !== 'Peşin' ? ' <span class="text-[10px] text-slate-400">(' + escapeHtml(item.installmentLabel) + ')</span>' : '') + '</td>' +
                        '<td class="px-4 sm:px-6 py-4 sm:py-5 font-black text-right ' + (isIncome ? 'text-emerald-600' : 'text-rose-600') + '">' +
                          (isIncome ? '+' : '-') + (Number(item.displayAmount) || 0).toLocaleString('tr-TR') + ' TL</td>' +
                        '<td class="px-4 sm:px-8 py-4 sm:py-5 text-center whitespace-nowrap">' +
                          (isIncome ? '' : ('<button type="button" onclick="editExpense(\'' + safeId + '\')" class="text-sky-600 hover:scale-110 mx-0.5">✏️</button>')) +
                          '<button type="button" onclick="deleteExpense(\'' + safeId + '\')" class="text-rose-600 hover:scale-110 mx-0.5">🗑️</button>' +
                        '</td>';
                    tbody.appendChild(tr);
                }

                if (futures.length) {
                    const trToggle = document.createElement('tr');
                    trToggle.className = 'row-future-toggle';
                    trToggle.innerHTML = '<td colspan="7" class="px-4 sm:px-6 py-2">' +
                        '<button type="button" id="webFutureToggleBtn" class="expense-future-toggle" onclick="toggleWebFutureRows()">' +
                        '<span>📅 İleri tarihli harcamalar <b>(' + futures.length + ')</b></span>' +
                        '<span class="chev">▸</span></button></td>';
                    tbody.appendChild(trToggle);
                    futures.forEach(function(item) {
                        appendExpenseRow(item, 'web-future-row hidden');
                    });
                }
                function periodKeyOf(item) {
                    if (!item) return '';
                    if (item.effectiveMonth) return String(item.effectiveMonth);
                    if (typeof getPeriodKeyForDateStr === 'function') {
                        return getPeriodKeyForDateStr(item.date) || '';
                    }
                    return String(item.date || '').slice(0, 7);
                }
                function appendPeriodBoundary(newerPk, olderPk) {
                    const lab = (typeof formatPeriodLabel === 'function' && newerPk)
                        ? formatPeriodLabel(newerPk)
                        : (newerPk || '');
                    const tr = document.createElement('tr');
                    tr.className = 'row-period-boundary';
                    tr.innerHTML = '<td colspan="7">' +
                        '<div class="period-boundary-banner">' +
                        '<span class="period-boundary-line"></span>' +
                        '<span class="period-boundary-text">Yeni dönem başlangıcı' +
                        (lab ? ' · ' + lab : '') +
                        '</span>' +
                        '<span class="period-boundary-line"></span>' +
                        '</div></td>';
                    tbody.appendChild(tr);
                }
                let _prevPk = null;
                normals.forEach(function(item) {
                    const pk = periodKeyOf(item);
                    if (_prevPk && pk && _prevPk !== pk) {
                        // Sıra genelde yeni→eski: _prevPk daha yeni dönem
                        const newer = (_prevPk > pk) ? _prevPk : pk;
                        appendPeriodBoundary(newer, pk);
                    }
                    appendExpenseRow(item, '');
                    _prevPk = pk || _prevPk;
                });

                if (totalRecords > displayedRecords) {
                    const tr = document.createElement('tr');
                    tr.innerHTML = '<td colspan="7" class="px-8 py-6 text-center">' +
                        '<button type="button" onclick="loadMoreRecords()" class="px-6 py-3 rounded-xl bg-indigo-50 text-indigo-700 font-black text-sm hover:bg-indigo-100">' +
                        'Daha fazla göster (' + (totalRecords - displayedRecords) + ' kayıt kaldı)</button></td>';
                    tbody.appendChild(tr);
                }
            }

            window.toggleWebFutureRows = function() {
                const rows = document.querySelectorAll('#expenseTableBody tr.web-future-row');
                const btn = document.getElementById('webFutureToggleBtn');
                let open = false;
                rows.forEach(function(r) {
                    r.classList.toggle('hidden');
                    if (!r.classList.contains('hidden')) open = true;
                });
                if (btn) btn.classList.toggle('is-open', open);
            };

            
// --- Mobil kartlar: ileri tarihli (açılır) + normal (max displayLimit) ---
            if (cardsHost) {
                const isIncomeItem = function(item) { return item.installmentLabel === 'Gelir'; };
                const curPkM = (typeof getCurrentPeriod === 'function') ? getCurrentPeriod() : '';
                const isCurPeriodM = function(item) {
                    if (!item || !curPkM) return true;
                    if (item.effectiveMonth) return String(item.effectiveMonth) === String(curPkM);
                    if (typeof getPeriodKeyForDateStr === 'function') {
                        return getPeriodKeyForDateStr(item.date) === curPkM;
                    }
                    return true;
                };
                // İleri tarihli: sadece bu dönem
                const futures = filtered.filter(function(item) {
                    return !isIncomeItem(item) && isFutureDateStr(item.date) && isCurPeriodM(item);
                });
                // Normal listeden ileri tarihlileri ayır; limit normal kayıtlara uygulanır
                const normalsAll = filtered.filter(function(item) {
                    return isIncomeItem(item) || !isFutureDateStr(item.date);
                });
                const normalDisplayed = Math.min(displayLimit, normalsAll.length);
                const normals = normalsAll.slice(0, normalDisplayed);

                function buildMobileCard(item) {
                    const isIncome = isIncomeItem(item);
                    const isFuture = !isIncome && isFutureDateStr(item.date);
                    const safeId = escapeHtml(String(item.id || ''));
                    const desc = escapeHtml(item.description || item.category || 'Harcama');
                    const amt = (isIncome ? '+' : '-') + (Number(item.displayAmount) || 0).toLocaleString('tr-TR') + ' TL';
                    const personCls = item.person === 'Bekir' ? 'person-bekir' : (item.person === 'Duygu' ? 'person-duygu' : '');
                    const catLine = escapeHtml(item.category || '-')
                        + (item.billSubtype ? ' · ' + escapeHtml(item.billSubtype) : '')
                        + (item.vehicleSubtype ? ' · ' + escapeHtml(item.vehicleSubtype) : '')
                        + ((item.isOnBehalf || item.onBehalf)
                            ? ((isOnBehalfMonthReimbursed(item) ? ' · Alındı' : ' · Alacak')
                                + (item.onBehalfOf ? ' (' + escapeHtml(item.onBehalfOf) + ')' : ''))
                            : '');
                    const canEdit = !isIncome && !String(item.id).includes('_ins_');
                    const delFn = isIncome ? "deleteIncome('" + safeId + "')" : "deleteExpense('" + safeId + "')";

                    const card = document.createElement('div');
                    card.className = 'expense-m-card' + (isFuture ? ' is-future' : '');
                    card.setAttribute('role', 'button');
                    card.onclick = function(ev) { toggleExpenseCard(card, ev); };
                    card.innerHTML =
                        '<div class="expense-m-main">' +
                          '<div class="expense-m-left">' +
                            '<p class="expense-m-desc">' + desc + '</p>' +
                            '<p class="expense-m-date">' + escapeHtml(formatDateTR(item.date)) + '</p>' +
                          '</div>' +
                          '<div class="expense-m-right">' +
                            (isFuture ? '<span class="expense-m-badge-future">İleri tarihli</span>' : '') +
                            '<span class="expense-m-amount' + (isIncome ? ' is-income' : '') + '">' + amt + '</span>' +
                          '</div>' +
                        '</div>' +
                        '<div class="expense-m-detail">' +
                          '<div class="expense-m-chips">' +
                            '<span class="expense-m-chip ' + personCls + '">' + escapeHtml(item.person || '-') + '</span>' +
                            '<span class="expense-m-chip">' + catLine + '</span>' +
                            '<span class="expense-m-chip">' + escapeHtml(item.paymentType || '-') + '</span>' +
                            (item.installmentLabel && item.installmentLabel !== 'Peşin'
                              ? '<span class="expense-m-chip">' + escapeHtml(item.installmentLabel) + '</span>' : '') +
                          '</div>' +
                          (item.fuelNote ? '<p class="expense-m-meta">' + escapeHtml(item.fuelNote) + '</p>' : '') +
                          '<div class="expense-m-actions">' +
                            (canEdit
                              ? '<button type="button" class="expense-m-btn-edit" onclick="event.stopPropagation();editExpense(\'' + safeId + '\')">Düzenle</button>'
                              : '') +
                            '<button type="button" class="expense-m-btn-del" onclick="event.stopPropagation();' + delFn + '">Sil</button>' +
                          '</div>' +
                        '</div>';
                    return card;
                }

                cardsHost.innerHTML = '';

                // İleri tarihli bölüm (üstte, kapalı)
                if (futures.length) {
                    // futures: yakın tarihe göre sırala (artan tarih)
                    futures.sort(function(a, b) {
                        const d = String(a.date || '').localeCompare(String(b.date || ''));
                        if (d !== 0) return d;
                        return expenseTimeKey(b).localeCompare(expenseTimeKey(a));
                    });
                    const wrap = document.createElement('div');
                    wrap.className = 'expense-future-section';
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'expense-future-toggle';
                    btn.innerHTML = '<span>İleri tarihli (' + futures.length + ')</span><span class="chev">▼</span>';
                    const list = document.createElement('div');
                    list.className = 'expense-future-list';
                    list.id = 'expenseFutureList';
                    futures.forEach(function(item) { list.appendChild(buildMobileCard(item)); });
                    btn.onclick = function(ev) {
                        ev.stopPropagation();
                        const open = list.classList.toggle('is-open');
                        btn.classList.toggle('is-open', open);
                    };
                    wrap.appendChild(btn);
                    wrap.appendChild(list);
                    cardsHost.appendChild(wrap);
                }

                if (!normals.length && !futures.length) {
                    cardsHost.innerHTML = '<p class="expense-m-empty">Kayıt yok</p>';
                } else {
                    function periodKeyOfM(item) {
                        if (!item) return '';
                        if (item.effectiveMonth) return String(item.effectiveMonth);
                        if (typeof getPeriodKeyForDateStr === 'function') {
                            return getPeriodKeyForDateStr(item.date) || '';
                        }
                        return String(item.date || '').slice(0, 7);
                    }
                    let _prevPkM = null;
                    normals.forEach(function(item) {
                        const pk = periodKeyOfM(item);
                        if (_prevPkM && pk && _prevPkM !== pk) {
                            const newer = (_prevPkM > pk) ? _prevPkM : pk;
                            const lab = (typeof formatPeriodLabel === 'function' && newer)
                                ? formatPeriodLabel(newer)
                                : (newer || '');
                            const sep = document.createElement('div');
                            sep.className = 'period-boundary-banner period-boundary-m';
                            sep.innerHTML = '<span class="period-boundary-line"></span>' +
                                '<span class="period-boundary-text">Yeni dönem başlangıcı' +
                                (lab ? ' · ' + lab : '') +
                                '</span>' +
                                '<span class="period-boundary-line"></span>';
                            cardsHost.appendChild(sep);
                        }
                        cardsHost.appendChild(buildMobileCard(item));
                        _prevPkM = pk || _prevPkM;
                    });
                    if (normalsAll.length > normalDisplayed) {
                        const more = document.createElement('div');
                        more.className = 'expense-m-more';
                        more.innerHTML = '<button type="button" onclick="loadMoreRecords()">Daha fazla göster (' + (normalsAll.length - normalDisplayed) + ')</button>';
                        cardsHost.appendChild(more);
                    }
                }
            }
        }

        window.loadMoreRecords = () => {
            displayLimit += 10;
            renderTable();
        };
        window.loadMoreExpenses = window.loadMoreRecords;



        // Raporlar paneli
        window.showTodayExpenses = function() {
            try {
                const today = (typeof todayDateStr === 'function') ? todayDateStr() : new Date().toISOString().slice(0, 10);
                const list = (typeof getProcessedExpenses === 'function') ? getProcessedExpenses() : [];
                const items = list.filter(function(e) {
                    return String(e.date || '').slice(0, 10) === today;
                }).sort(function(a, b) {
                    return String(b.date || '').localeCompare(String(a.date || '')) || String(b.id || '').localeCompare(String(a.id || ''));
                });
                const modal = document.getElementById('categoryDetailModal');
                const title = document.getElementById('categoryDetailTitle');
                const body = document.getElementById('categoryDetailBody');
                const totalEl = document.getElementById('categoryDetailTotal');
                if (!modal || !body) return;
                if (title) title.textContent = 'Bugün Harcama';
                const total = items.reduce(function(s, e) { return s + (Number(e.displayAmount != null ? e.displayAmount : e.amount) || 0); }, 0);
                if (totalEl) totalEl.textContent = Math.round(total).toLocaleString('tr-TR') + ' TL · ' + items.length + ' kayıt';
                if (!items.length) {
                    body.innerHTML = '<p class="text-sm text-slate-400 font-medium text-center py-6">Bugün harcama yok</p>';
                } else {
                    body.innerHTML = items.map(function(e) {
                        const amt = Math.round(Number(e.displayAmount != null ? e.displayAmount : e.amount) || 0).toLocaleString('tr-TR');
                        const sub = [
                            e.person || '',
                            e.category || '',
                            e.shopSubtype || '',
                            e.isEcommerce ? 'E-ticaret' : '',
                            e.paymentType || '',
                            e.installmentLabel || ''
                        ].filter(Boolean).join(' · ');
                        return '<div class="flex justify-between gap-3 items-start py-3 border-b border-slate-100 last:border-0">' +
                            '<div class="min-w-0">' +
                            '<p class="text-sm font-bold text-slate-800 truncate">' + escapeHtml(e.description || e.category || '-') + '</p>' +
                            '<p class="text-[11px] text-slate-400 font-semibold mt-0.5">' + escapeHtml(sub) + '</p>' +
                            '</div>' +
                            '<p class="text-sm font-black text-rose-600 whitespace-nowrap">' + amt + ' TL</p>' +
                            '</div>';
                    }).join('');
                }
                modal.classList.remove('hidden');
                modal.classList.add('flex');
            } catch (err) {
                console.warn('showTodayExpenses', err);
            }
        };

                window.showCategoryExpenses = function(category) {
            const period = (typeof getStatsCategoryPeriod === 'function') ? getStatsCategoryPeriod() : getCurrentPeriod();
            const cat = String(category || '');
            const isShop = (typeof isAlisverisCategory === 'function' && isAlisverisCategory(cat)) || cat === 'Alışveriş' || cat === 'E-ticaret' || cat === 'Eticaret';
            const pool = (typeof getExpensesForPeriodKey === 'function')
                ? getExpensesForPeriodKey(period, '')
                : getProcessedExpenses().filter(function(e) { return e && e.effectiveMonth === period; });
            const items = pool.filter(function(e) {
                if (!e) return false;
                if (typeof countsInPeriodTotals === 'function' && !countsInPeriodTotals(e)) return false;
                if (isShop) {
                    let c = e.category || '';
                    if (typeof isLegacyShopCategory === 'function' && isLegacyShopCategory(c)) c = 'Alışveriş';
                    if (c === 'E-ticaret') c = 'Alışveriş';
                    if (e.isEcommerce) return true;
                    return (typeof isAlisverisCategory === 'function' && isAlisverisCategory(c)) || c === 'Alışveriş';
                }
                return e.category === cat;
            });
            const modal = document.getElementById('categoryDetailModal');
            const title = document.getElementById('categoryDetailTitle');
            const body = document.getElementById('categoryDetailBody');
            const totalEl = document.getElementById('categoryDetailTotal');
            if (!modal || !body) return;
            if (title) {
                const plab = (typeof formatPeriodLabel === 'function') ? formatPeriodLabel(period) : period;
                title.textContent = (isShop ? 'Alışveriş' : cat) + ' — ' + (plab || period || 'dönem');
            }
            const total = items.reduce(function(s, e) { return s + (e.displayAmount || 0); }, 0);
            if (totalEl) totalEl.textContent = total.toLocaleString('tr-TR') + ' TL';
            if (!items.length) {
                body.innerHTML = '<p class="text-sm text-slate-400 font-medium text-center py-6">Bu kategoride dönem harcaması yok</p>';
            } else if (isShop) {
                // Alt türe göre grupla (Market, Giyim, Sigara…) + E-ticaret notu
                const groups = {};
                items.forEach(function(e) {
                    let st = String(e.shopSubtype || '').trim() || 'Belirtilmedi';
                    if (e.isEcommerce) st = st + (st === 'Belirtilmedi' ? '' : '') ;
                    const key = st + (e.isEcommerce ? ' · E-ticaret' : '');
                    if (!groups[key]) groups[key] = [];
                    groups[key].push(e);
                });
                // Önce tanımlı alt tür sırası, sonra diğerleri
                const order = (typeof getSubtypesForCategory === 'function')
                    ? getSubtypesForCategory('Alışveriş')
                    : [];
                const keys = Object.keys(groups).sort(function(a, b) {
                    const baseA = a.replace(' · E-ticaret', '');
                    const baseB = b.replace(' · E-ticaret', '');
                    const ia = order.indexOf(baseA);
                    const ib = order.indexOf(baseB);
                    if (ia >= 0 && ib >= 0) return ia - ib;
                    if (ia >= 0) return -1;
                    if (ib >= 0) return 1;
                    return a.localeCompare(b, 'tr');
                });
                let html = '';
                keys.forEach(function(key) {
                    const list = groups[key].slice().sort(function(a, b) {
                        return String(b.date).localeCompare(String(a.date));
                    });
                    const gSum = list.reduce(function(s, e) { return s + (e.displayAmount || 0); }, 0);
                    html += '<div class="mb-4 last:mb-0">' +
                        '<div class="flex justify-between items-center mb-1.5 gap-2">' +
                        '<span class="text-sm font-black text-indigo-800">' + escapeHtml(key) + '</span>' +
                        '<span class="text-sm font-black text-indigo-700">' + Math.round(gSum).toLocaleString('tr-TR') + ' TL</span></div>' +
                        '<div class="space-y-0 rounded-xl bg-slate-50 border border-slate-100 px-3">';
                    list.forEach(function(e) {
                        html += '<div class="flex justify-between gap-3 items-start py-2.5 border-b border-slate-100 last:border-0">' +
                            '<div class="min-w-0">' +
                            '<p class="text-sm font-bold text-slate-800 truncate">' + escapeHtml(e.description || '-') + '</p>' +
                            '<p class="text-[11px] text-slate-400 font-semibold mt-0.5">' + escapeHtml(e.date || '') + ' · ' +
                            escapeHtml(e.person || '') + ' · ' + escapeHtml(e.installmentLabel || '') + '</p>' +
                            '</div>' +
                            '<p class="text-sm font-black text-rose-600 whitespace-nowrap">' + (e.displayAmount || 0).toLocaleString('tr-TR') + ' TL</p>' +
                            '</div>';
                    });
                    html += '</div></div>';
                });
                body.innerHTML = html;
            } else {
                body.innerHTML = items
                    .slice()
                    .sort(function(a, b) { return String(b.date).localeCompare(String(a.date)); })
                    .map(function(e) {
                        const sub = e.shopSubtype ? (' · ' + e.shopSubtype) : '';
                        const ec = e.isEcommerce ? ' · E-ticaret' : '';
                        return '<div class="flex justify-between gap-3 items-start py-3 border-b border-slate-100 last:border-0">' +
                            '<div class="min-w-0">' +
                            '<p class="text-sm font-bold text-slate-800 truncate">' + escapeHtml(e.description || '-') + '</p>' +
                            '<p class="text-[11px] text-slate-400 font-semibold mt-0.5">' + escapeHtml(e.date || '') + ' · ' +
                            escapeHtml(e.person || '') + escapeHtml(sub) + escapeHtml(ec) + ' · ' + escapeHtml(e.installmentLabel || '') + '</p>' +
                            '</div>' +
                            '<p class="text-sm font-black text-rose-600 whitespace-nowrap">' + (e.displayAmount || 0).toLocaleString('tr-TR') + ' TL</p>' +
                            '</div>';
                    }).join('');
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
                const cat = (typeof expenseReportCategory === 'function') ? expenseReportCategory(e) : (e.category || 'Diğer');
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
                months: periodKeys, // dönem anahtarları
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
            const curItems = processed.filter(function(e) { return e.effectiveMonth === cur && (typeof countsInCharts === 'function' ? countsInCharts(e) : (typeof countsInPeriodTotals !== 'function' || countsInPeriodTotals(e))); });
            const curTotal = (summary.period === cur && summary.currentTotal != null)
                ? summary.currentTotal
                : Object.values(curCats).reduce(function(a, b) { return a + b; }, 0);
            const prevTotal = Object.values(prevCats).reduce(function(a, b) { return a + b; }, 0);

            tips.push('Aktif dönem (' + curLabel + '): ' + Math.round(curTotal).toLocaleString('tr-TR') + ' TL · ' + curItems.length + ' kalem.');
            // Gelire göre dönem analizi (110.000 TL sabit)
            (function() {
                const income = HOUSEHOLD_MONTHLY_INCOME;
                const ratio = income > 0 ? (curTotal / income) * 100 : 0;
                const remain = income - curTotal;
                tips.push('Gelir çerçevesi: aylık ' + income.toLocaleString('tr-TR') + ' TL varsayımıyla bu dönem harcama gelire oranı %' + ratio.toFixed(1) + ' · kalan ~' + Math.round(remain).toLocaleString('tr-TR') + ' TL.');
                if (ratio > 90) {
                    tips.push('Kritik: Harcama gelire çok yakın/üstü. Zorunlu olmayan (eğlence, giyim, online) kalemleri dondurun; kart ekstre ödemesini geciktirmeyin.');
                } else if (ratio > 75) {
                    tips.push('Yüksek baskı: Gelirin %' + ratio.toFixed(0) + '\'i harcanmış. Bu dönemde yeni abonelik/taksit açmayın; market ve yeme-içmeyi haftalık limitleyin.');
                } else if (ratio > 55) {
                    tips.push('Orta seviye: Gelirin %' + ratio.toFixed(0) + '\'i kullanılmış. Hedef: bir sonraki dönemde oranı %50 altına çekmek için en yüksek 2 kategoride %10 kısıt.');
                } else if (ratio > 0) {
                    tips.push('Rahat bant: Gelirin %' + ratio.toFixed(0) + '\'i harcanmış; ~' + Math.round(remain).toLocaleString('tr-TR') + ' TL nefes payı var. Fazlayı acil fon veya kart borcuna yönlendirin.');
                }
                // Kategori / gelir
                const cats = {};
                curItems.forEach(function(e) {
                    const c = (typeof expenseReportCategory === 'function') ? expenseReportCategory(e) : (e.category || 'Diğer');
                    cats[c] = (cats[c] || 0) + (e.displayAmount || 0);
                });
                Object.entries(cats).sort(function(a,b){return b[1]-a[1];}).slice(0, 4).forEach(function(kv) {
                    const pInc = income > 0 ? (kv[1] / income * 100) : 0;
                    if (pInc >= 8) {
                        tips.push(kv[0] + ': ' + Math.round(kv[1]).toLocaleString('tr-TR') + ' TL = gelirin %' + pInc.toFixed(1) + '\'i. ' + (pInc >= 20 ? 'Bu kategori hane bütçesini domine ediyor; kalem kalem inceleme şart.' : 'İzleyin; bir üst limite yaklaşırsa kısıtlayın.'));
                    }
                });
                // Tasarruf önerisi
                const saveTarget = Math.round(income * 0.15);
                if (remain > saveTarget) {
                    tips.push('Tasarruf fırsatı: Gelirin %15\'i (~' + saveTarget.toLocaleString('tr-TR') + ' TL) ayrılabilir görünüyor; otomatik transfer veya kart borcu erken ödemesi düşünün.');
                } else if (remain > 0 && remain < saveTarget) {
                    tips.push('Tasarruf hedefi (~' + saveTarget.toLocaleString('tr-TR') + ' TL / gelirin %15\'i) şu an tam dolmuyor; en az ' + Math.round(saveTarget - remain).toLocaleString('tr-TR') + ' TL kısma alanı bulun.');
                }
            })();


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



        window.askYuvamPreset = function(q) {
            const inp = document.getElementById('yuvamAskInput');
            if (inp) inp.value = q;
            askYuvam();
        };

        /** Sorudan istenen ay sayısı (varsayılan yok = null) */
        function parseAskedMonths(q) {
            const s = String(q || '').toLowerCase();
            const m = s.match(/(?:son\s*)?(\d+)\s*ay/);
            if (m) return Math.min(24, Math.max(1, parseInt(m[1], 10)));
            if (/üç ay|3 ay/.test(s)) return 3;
            if (/iki ay|2 ay/.test(s)) return 2;
            if (/bir ay|1 ay|bu ay|geçen ay/.test(s) && !/son\s*\d/.test(s)) {
                if (/geçen ay/.test(s)) return 1;
                if (/bu ay/.test(s)) return 1;
            }
            return null;
        }

        function lastNMonthKeys(n) {
            n = Math.max(1, n || 1);
            const now = new Date();
            const keys = [];
            for (let i = 0; i < n; i++) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                keys.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
            }
            return keys;
        }

        function monthOfExpense(e) {
            return String(e.effectiveMonth || e.expenseMonth || (e.date || '').slice(0, 7));
        }

        function expenseAmount(e) {
            return Number(e.displayAmount != null ? e.displayAmount : e.amount) || 0;
        }


        /** AI için kapsamlı harcama/fatura veri özeti */
        function buildYuvamDataContext(question) {
            const q = String(question || '').toLowerCase();
            const list = (typeof getProcessedExpenses === 'function') ? getProcessedExpenses() : (expenses || []);
            const period = (typeof getCurrentStatementPeriod === 'function') ? getCurrentStatementPeriod() : null;
            const periodStart = period && period.startDate ? formatYMD(period.startDate) : '';
            const periodEnd = period && period.endDate ? formatYMD(period.endDate) : '';
            const askedMonths = parseAskedMonths(q);
            const nMonths = askedMonths != null ? askedMonths : 3;
            const monthKeys = lastNMonthKeys(nMonths);
            const lines = [];
            const today = (typeof todayDateStr === 'function') ? todayDateStr() : '';
            const income = (typeof HOUSEHOLD_MONTHLY_INCOME === 'number') ? HOUSEHOLD_MONTHLY_INCOME : 110000;

            lines.push('BUGUN: ' + today);
            lines.push('SABIT_AYLIK_GELIR_TL: ' + income);
            if (periodStart) lines.push('AKTIF_EKSTRE_DONEMI: ' + periodStart + ' .. ' + periodEnd + ' (29-28)');
            lines.push('ISTENEN_AY_SAYISI: ' + (askedMonths != null ? askedMonths : 'belirtilmedi(varsayilan_baglam=' + nMonths + ')'));
            lines.push('AY_ANAHTARLARI: ' + monthKeys.join(', '));

            const inPeriod = list.filter(function(e) {
                if (!periodStart) return true;
                const d = String(e.date || '').slice(0, 10);
                return d >= periodStart && d <= periodEnd;
            });
            const periodTotal = inPeriod.reduce(function(s, e) { return s + expenseAmount(e); }, 0);
            lines.push('DONEM_TOPLAM_HARCAMA_TL: ' + Math.round(periodTotal));
            lines.push('DONEM_KAYIT_SAYISI: ' + inPeriod.length);

            // Dönem kategori sıralaması (en çok → en az)
            const byCat = {};
            inPeriod.forEach(function(e) {
                const c = (typeof expenseReportCategory === 'function') ? expenseReportCategory(e) : (e.category || 'Diğer');
                byCat[c] = (byCat[c] || 0) + expenseAmount(e);
            });
            const catRank = Object.keys(byCat).sort(function(a, b) { return byCat[b] - byCat[a]; });
            lines.push('DONEM_KATEGORI_SIRALAMA (en cokdan):');
            catRank.forEach(function(c, i) {
                lines.push('  ' + (i + 1) + '. ' + c + ' = ' + Math.round(byCat[c]) + ' TL');
            });
            if (catRank.length) {
                lines.push('DONEM_EN_COK_KATEGORI: ' + catRank[0] + ' (' + Math.round(byCat[catRank[0]]) + ' TL)');
            }

            // Kişi kırılımı (dönem)
            const byPerson = {};
            inPeriod.forEach(function(e) {
                const p = e.person || 'Belirsiz';
                byPerson[p] = (byPerson[p] || 0) + expenseAmount(e);
            });
            lines.push('DONEM_KISI: ' + Object.keys(byPerson).map(function(p) {
                return p + '=' + Math.round(byPerson[p]);
            }).join('; '));

            // Ödeme tipi
            const byPay = {};
            inPeriod.forEach(function(e) {
                const p = e.paymentType || e.payment || 'Belirsiz';
                byPay[p] = (byPay[p] || 0) + expenseAmount(e);
            });
            lines.push('DONEM_ODEME_TIPI: ' + Object.keys(byPay).map(function(p) {
                return p + '=' + Math.round(byPay[p]);
            }).join('; '));

            // --- FATURALAR: her zaman alt tür sıralaması (dönem + son N ay) ---
            const billSubtypes = ['Elektrik', 'Su', 'Doğalgaz', 'Telefon', 'İnternet', 'Abonelik'];
            function isBillType(e, subtype) {
                if (e.category !== 'Faturalar') return false;
                const st = (e.billSubtype || '').toLowerCase();
                const desc = (e.description || '').toLowerCase();
                const sub = subtype.toLowerCase();
                return st === sub || desc.indexOf(sub) >= 0;
            }
            // Dönem fatura alt tür
            const periodBillByType = {};
            billSubtypes.forEach(function(t) { periodBillByType[t] = 0; });
            inPeriod.forEach(function(e) {
                if (e.category !== 'Faturalar') return;
                const st = e.billSubtype || 'Diğer';
                periodBillByType[st] = (periodBillByType[st] || 0) + expenseAmount(e);
            });
            const billRankPeriod = Object.keys(periodBillByType).filter(function(t) {
                return periodBillByType[t] > 0;
            }).sort(function(a, b) { return periodBillByType[b] - periodBillByType[a]; });
            lines.push('DONEM_FATURA_TUR_SIRALAMA (en cokdan):');
            billRankPeriod.forEach(function(t, i) {
                lines.push('  ' + (i + 1) + '. ' + t + ' = ' + Math.round(periodBillByType[t]) + ' TL');
            });
            if (billRankPeriod.length) {
                lines.push('DONEM_EN_COK_FATURA_TURU: ' + billRankPeriod[0] + ' (' + Math.round(periodBillByType[billRankPeriod[0]]) + ' TL)');
            } else {
                lines.push('DONEM_EN_COK_FATURA_TURU: kayit yok');
            }
            const periodBillTotal = billRankPeriod.reduce(function(s, t) { return s + periodBillByType[t]; }, 0);
            lines.push('DONEM_FATURA_TOPLAM_TL: ' + Math.round(periodBillTotal));

            // Son N ay — her fatura türü aylık + toplam + ortalama
            lines.push('SON_' + nMonths + '_AY_FATURA_DETAY:');
            const nMonthBillTotals = {};
            billSubtypes.forEach(function(t) { nMonthBillTotals[t] = 0; });
            monthKeys.forEach(function(mk) {
                billSubtypes.forEach(function(t) {
                    const tSum = list.filter(function(e) {
                        return monthOfExpense(e) === mk && isBillType(e, t);
                    }).reduce(function(s, e) { return s + expenseAmount(e); }, 0);
                    nMonthBillTotals[t] += tSum;
                    if (tSum > 0) lines.push('  ' + mk + ' ' + t + ' = ' + Math.round(tSum) + ' TL');
                });
                const monthAllBills = list.filter(function(e) {
                    return e.category === 'Faturalar' && monthOfExpense(e) === mk;
                }).reduce(function(s, e) { return s + expenseAmount(e); }, 0);
                lines.push('  ' + mk + ' FATURA_TOPLAM = ' + Math.round(monthAllBills) + ' TL');
            });
            lines.push('SON_' + nMonths + '_AY_FATURA_TUR_TOPLAM_VE_ORTALAMA:');
            const billRankN = billSubtypes.slice().sort(function(a, b) {
                return nMonthBillTotals[b] - nMonthBillTotals[a];
            });
            billRankN.forEach(function(t) {
                if (nMonthBillTotals[t] <= 0) return;
                lines.push('  ' + t + ' toplam=' + Math.round(nMonthBillTotals[t]) +
                    ' TL ortalama=' + Math.round(nMonthBillTotals[t] / nMonths) + ' TL');
            });
            if (billRankN.length && nMonthBillTotals[billRankN[0]] > 0) {
                lines.push('SON_' + nMonths + '_AY_EN_COK_FATURA_TURU: ' + billRankN[0] +
                    ' (toplam ' + Math.round(nMonthBillTotals[billRankN[0]]) + ' TL)');
            }

            // Aylık genel toplamlar
            monthKeys.forEach(function(mk) {
                const monthItems = list.filter(function(e) { return monthOfExpense(e) === mk; });
                const total = monthItems.reduce(function(s, e) { return s + expenseAmount(e); }, 0);
                lines.push('AY_' + mk + '_TOPLAM_TL: ' + Math.round(total));
            });

            // Yakıt / araç (her zaman kısa özet)
            monthKeys.forEach(function(mk) {
                const fuel = list.filter(function(e) {
                    return isVehicleExpense(e) && monthOfExpense(e) === mk
                        && (e.vehicleSubtype === 'Yakıt' || e.vehicleSubtype === 'Yakit');
                });
                const fuelSum = fuel.reduce(function(s, e) { return s + expenseAmount(e); }, 0);
                if (fuelSum > 0) lines.push('AY_' + mk + '_YAKIT_TL: ' + Math.round(fuelSum));
            });
            try {
                const v = vehicleProfile || {};
                lines.push('ARAC: ' + (v.name || '') + ' | km=' + (v.totalKm || 0));
            } catch (_) {}

            // En yüksek tekil harcamalar (dönem)
            const topExp = inPeriod.slice().sort(function(a, b) {
                return expenseAmount(b) - expenseAmount(a);
            }).slice(0, 8);
            lines.push('DONEM_EN_YUKSEK_HARCAMA:');
            topExp.forEach(function(e, i) {
                lines.push('  ' + (i + 1) + '. ' + Math.round(expenseAmount(e)) + ' TL | ' +
                    (e.category || '') + (e.billSubtype ? ('/' + e.billSubtype) : '') +
                    (e.vehicleSubtype ? ('/' + e.vehicleSubtype) : '') +
                    ' | ' + (e.description || '-') + ' | ' + String(e.date || '').slice(0, 10));
            });

            // Gıda kıyas
            const m0 = lastNMonthKeys(1)[0];
            const m1 = lastNMonthKeys(2)[1];
            const food = function(m) {
                return list.filter(function(e) {
                    return monthOfExpense(e) === m && (e.category === 'Gıda' || /market/i.test(e.description || ''));
                }).reduce(function(s, e) { return s + expenseAmount(e); }, 0);
            };
            lines.push('GIDA_BU_AY_TL: ' + Math.round(food(m0)));
            lines.push('GIDA_GECEN_AY_TL: ' + Math.round(food(m1)));

            // Yaklaşan ödemeler
            const week = list.filter(function(e) {
                const days = daysUntilYMD(String(e.date || '').slice(0, 10));
                return days != null && days >= 0 && days <= 14;
            }).sort(function(a, b) { return String(a.date).localeCompare(String(b.date)); }).slice(0, 12);
            if (week.length) {
                lines.push('YAKLASAN_14_GUN:');
                week.forEach(function(e) {
                    lines.push(' - ' + String(e.date).slice(0, 10) + ' | ' + (e.description || e.category) + ' | ' + Math.round(expenseAmount(e)) + ' TL');
                });
            }

            lines.push('KURALLAR: En cok / en az sorularinda SIRALAMA satirlarni kullan. Ortalama = ilgili toplam / ay sayisi. Uydurma rakam yazma.');
            lines.push('KULLANICI_SORUSU: ' + String(question || ''));
            return lines.join('\n');
        }

        /** Yerel yedek cevap — sadece AI yoksa veya hata olursa */

        function answerYuvamLocal(question) {
            const q = String(question || '').toLowerCase().trim();
            const list = (typeof getProcessedExpenses === 'function') ? getProcessedExpenses() : (expenses || []);
            const lines = [];
            const askedMonths = parseAskedMonths(q);
            const nMonths = askedMonths != null ? askedMonths : 1;
            const monthKeys = lastNMonthKeys(nMonths);
            const sum = function(arr) { return arr.reduce(function(s, e) { return s + expenseAmount(e); }, 0); };
            const period = (typeof getCurrentStatementPeriod === 'function') ? getCurrentStatementPeriod() : null;
            const periodStart = period && period.startDate ? formatYMD(period.startDate) : '';
            const periodEnd = period && period.endDate ? formatYMD(period.endDate) : '';
            const inPeriod = list.filter(function(e) {
                if (!periodStart) return true;
                const d = String(e.date || '').slice(0, 10);
                return d >= periodStart && d <= periodEnd;
            });

            // En çok fatura türü
            if (/en çok|en cok|hangi fatura|fatura tür|fatura tur/.test(q) && /fatura/.test(q)) {
                const by = {};
                const pool = (/son\s*\d|ay/.test(q) ? list.filter(function(e) {
                    return e.category === 'Faturalar' && monthKeys.indexOf(monthOfExpense(e)) >= 0;
                }) : inPeriod.filter(function(e) { return e.category === 'Faturalar'; }));
                pool.forEach(function(e) {
                    const t = e.billSubtype || 'Diğer';
                    by[t] = (by[t] || 0) + expenseAmount(e);
                });
                const rank = Object.keys(by).sort(function(a, b) { return by[b] - by[a]; });
                if (!rank.length) {
                    lines.push('Bu aralıkta fatura kaydı yok.');
                    return lines;
                }
                lines.push('En yüksek fatura türü: **' + rank[0] + '** → ' + Math.round(by[rank[0]]).toLocaleString('tr-TR') + ' TL');
                rank.forEach(function(t, i) {
                    lines.push((i + 1) + '. ' + t + ': ' + Math.round(by[t]).toLocaleString('tr-TR') + ' TL');
                });
                return lines;
            }

            // En çok kategori
            if (/en çok|en cok|hangi kategori/.test(q)) {
                const by = {};
                inPeriod.forEach(function(e) {
                    const c = (typeof expenseReportCategory === 'function') ? expenseReportCategory(e) : (e.category || 'Diğer');
                    by[c] = (by[c] || 0) + expenseAmount(e);
                });
                const rank = Object.keys(by).sort(function(a, b) { return by[b] - by[a]; });
                if (!rank.length) { lines.push('Kayıt yok.'); return lines; }
                lines.push('Dönemde en çok: **' + rank[0] + '** → ' + Math.round(by[rank[0]]).toLocaleString('tr-TR') + ' TL');
                rank.slice(0, 6).forEach(function(c, i) {
                    lines.push((i + 1) + '. ' + c + ': ' + Math.round(by[c]).toLocaleString('tr-TR') + ' TL');
                });
                return lines;
            }

            if (/yakıt|yakit/.test(q)) {
                const fuel = list.filter(function(e) {
                    return isVehicleExpense(e) && monthKeys.indexOf(monthOfExpense(e)) >= 0
                        && (e.vehicleSubtype === 'Yakıt' || e.vehicleSubtype === 'Yakit');
                });
                const total = sum(fuel);
                lines.push('Son ' + nMonths + ' ay yakıt toplamı: **' + Math.round(total).toLocaleString('tr-TR') + ' TL**');
                lines.push('Aylık ortalama: **' + Math.round(total / nMonths).toLocaleString('tr-TR') + ' TL**');
                monthKeys.forEach(function(mk) {
                    lines.push('· ' + mk + ': ' + Math.round(sum(fuel.filter(function(e) { return monthOfExpense(e) === mk; }))).toLocaleString('tr-TR') + ' TL');
                });
                return lines;
            }

            if (/fatura|elektrik|su|do[ğg]algaz|telefon|internet|abonelik/.test(q)) {
                let wantSubtype = null;
                if (/elektrik/.test(q)) wantSubtype = 'Elektrik';
                else if (/\bsu\b/.test(q)) wantSubtype = 'Su';
                else if (/do[ğg]algaz/.test(q)) wantSubtype = 'Doğalgaz';
                else if (/telefon/.test(q)) wantSubtype = 'Telefon';
                else if (/internet/.test(q)) wantSubtype = 'İnternet';
                else if (/abonelik/.test(q)) wantSubtype = 'Abonelik';
                const bills = list.filter(function(e) {
                    if (e.category !== 'Faturalar') return false;
                    if (monthKeys.indexOf(monthOfExpense(e)) < 0) return false;
                    if (!wantSubtype) return true;
                    const st = (e.billSubtype || '').toLowerCase();
                    return st === wantSubtype.toLowerCase() || (e.description || '').toLowerCase().indexOf(wantSubtype.toLowerCase()) >= 0;
                });
                const total = sum(bills);
                const label = wantSubtype || 'Fatura';
                lines.push('Son ' + nMonths + ' ay ' + label + ' toplamı: **' + Math.round(total).toLocaleString('tr-TR') + ' TL**');
                if (/ortalama/.test(q)) {
                    lines.push('Aylık ortalama: **' + Math.round(total / nMonths).toLocaleString('tr-TR') + ' TL**');
                }
                monthKeys.forEach(function(mk) {
                    lines.push('· ' + mk + ': ' + Math.round(sum(bills.filter(function(e) { return monthOfExpense(e) === mk; }))).toLocaleString('tr-TR') + ' TL');
                });
                return lines;
            }

            if (/ne kadar harcad|bu ay.*harca|dönem.*harca|toplam harcama/.test(q)) {
                lines.push('Bu ekstre döneminde toplam: **' + Math.round(sum(inPeriod)).toLocaleString('tr-TR') + ' TL** (' + inPeriod.length + ' kayıt)');
                return lines;
            }

            if (/araç|corolla|bakım|masraf/.test(q)) {
                const veh = list.filter(function(e) {
                    return isVehicleExpense(e) && monthKeys.indexOf(monthOfExpense(e)) >= 0;
                });
                lines.push('Son ' + nMonths + ' ay araç toplamı: **' + Math.round(sum(veh)).toLocaleString('tr-TR') + ' TL**');
                return lines;
            }

            lines.push('Yerel özet sınırlı. AI için OpenRouter anahtarını kontrol edin.');
            return lines;
        }

        window.askYuvam = async function() {
            const inp = document.getElementById('yuvamAskInput');
            const box = document.getElementById('yuvamAskResult');
            const btn = document.getElementById('yuvamAskBtn');
            const q = inp ? String(inp.value || '').trim() : '';
            if (!q) {
                showToast('Bir soru yazın', 'info');
                return;
            }
            if (btn) btn.disabled = true;
            const wrap = document.getElementById('aiAdvisorProgressWrap');
            const bar = document.getElementById('aiAdvisorProgressBar');
            const pct = document.getElementById('aiAdvisorProgressPct');
            if (wrap) wrap.classList.remove('hidden');
            if (box) box.innerHTML = '<p class="text-sm text-slate-500 font-semibold">Yanıt hazırlanıyor…</p>';
            let p = 8;
            const timer = setInterval(function() {
                p = Math.min(88, p + 6);
                if (bar) bar.style.width = p + '%';
                if (pct) pct.textContent = p + '%';
            }, 180);

            try {
                try {
                    if (typeof ensureApiKeysLoaded === 'function') await ensureApiKeysLoaded();
                } catch (_) {}
                var keyNow = (typeof openrouterApiKey !== 'undefined' && openrouterApiKey)
                    ? openrouterApiKey
                    : (typeof window !== 'undefined' ? window.openrouterApiKey : '');
                if (!keyNow || !String(keyNow).trim()) {
                    throw new Error('NO_KEY');
                }
                openrouterApiKey = String(keyNow).trim();
                const dataCtx = buildYuvamDataContext(q);
                const system = [
                    'Sen YUVAM aile bütçe asistanısın. Sadece VERİ bloğunu kullan; uydurma.',
                    '"En çok / en az / hangi" sorularında SIRALAMA satırlarını oku; 1. sıradakini söyle.',
                    'DONEM_EN_COK_FATURA_TURU ve DONEM_FATURA_TUR_SIRALAMA satırları fatura türü sıralamasıdır.',
                    'Ortalama = ilgili toplam / ay sayısı. Tek ayı bölme.',
                    'Son N ay istendiyse N aya uy. Kısa Türkçe cevap (2-8 madde). TL kullan.'
                ].join(' ');
                const user = 'VERİ:\n' + dataCtx + '\n\nSORU: ' + q + '\n\nYanıt:';
                const text = await callOpenRouter(user, system, 900);
                clearInterval(timer);
                if (bar) bar.style.width = '100%';
                if (pct) pct.textContent = '100%';
                if (box) {
                    box.innerHTML = '<p class="text-[10px] font-black text-violet-600 uppercase mb-2">Yuvam yanıtı</p>' +
                        '<div class="text-sm text-slate-800 font-medium leading-relaxed whitespace-pre-wrap">' +
                        escapeHtml(String(text || '').trim()) + '</div>';
                }
            } catch (err) {
                clearInterval(timer);
                console.warn('askYuvam', err);
                const localLines = answerYuvamLocal(q);
                const errMsg = (err && err.message === 'NO_KEY')
                    ? 'AI anahtarı yok — yerel özet gösteriliyor. Firebase settings/apiKeys → openrouter alanına anahtar ekleyin.'
                    : ('AI yanıt veremedi (' + (err.message || err) + ') — yerel özet:');
                if (box) {
                    box.innerHTML = '<p class="text-[10px] font-black text-amber-600 uppercase mb-2">' + escapeHtml(errMsg) + '</p>' +
                        localLines.map(function(l) {
                            return '<p class="text-sm text-slate-700 font-medium leading-relaxed mb-1">' +
                                String(l).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') + '</p>';
                        }).join('');
                }
            } finally {
                if (wrap) setTimeout(function() { wrap.classList.add('hidden'); }, 350);
                if (btn) btn.disabled = false;
            }
        };

        window.openSiteSearch = function() {
            const m = document.getElementById('siteSearchModal');
            if (!m) return;
            m.classList.remove('hidden');
            m.classList.add('flex');
            const inp = document.getElementById('siteSearchInput');
            if (inp) { inp.value = ''; inp.focus(); }
            runSiteSearch('');
        };
        window.closeSiteSearch = function() {
            const m = document.getElementById('siteSearchModal');
            if (!m) return;
            m.classList.add('hidden');
            m.classList.remove('flex');
        };
        window.runSiteSearch = function(q) {
            const box = document.getElementById('siteSearchResults');
            if (!box) return;
            q = String(q || '').trim().toLowerCase();
            if (!q) {
                box.innerHTML = '<p class="text-xs text-slate-400 font-semibold text-center py-6">Kelime yazın…</p>';
                return;
            }
            const hits = [];
            const v = vehicleProfile || {};
            const vblob = [v.name, 'araç', 'corolla', 'yakıt', 'bakım', 'muayene', 'sigorta', 'kasko', 'mtv', 'km'].join(' ').toLowerCase();
            if (vblob.indexOf(q) >= 0 || (v.name || '').toLowerCase().indexOf(q) >= 0) {
                hits.push({ cat: 'Araç', title: v.name || 'Araç', sub: (Number(v.totalKm) || 0).toLocaleString('tr-TR') + ' km', tab: 'vehicle' });
            }
            if (/yakıt|yakit|fuel|benzin/.test(q) || q === 'corolla') {
                hits.push({ cat: 'Yakıt', title: 'Yakıt raporları', sub: 'Raporlar · Araç', tab: 'stats' });
            }
            if (/bakım|bakim|servis/.test(q)) {
                hits.push({ cat: 'Bakım', title: 'Bakım bilgisi', sub: (v.maintDate ? formatDateTR(v.maintDate) : '') + ' · ' + (Number(v.maintKm) || 0).toLocaleString('tr-TR') + ' km', tab: 'vehicle' });
            }
            if (/sigorta|kasko/.test(q)) {
                hits.push({ cat: 'Sigorta', title: 'Sigorta / Kasko', sub: v.insuranceDate ? formatDateTR(v.insuranceDate) : 'Tarih girilmemiş', tab: 'vehicle' });
            }
            if (/muayene/.test(q)) {
                hits.push({ cat: 'Muayene', title: 'Araç muayenesi', sub: v.inspectionDate ? formatDateTR(v.inspectionDate) : '—', tab: 'vehicle' });
            }
            try {
                getProcessedExpenses().filter(function(e) {
                    return expenseMatchesTextQuery(e, q);
                }).slice(0, 25).forEach(function(e) {
                    hits.push({
                        cat: 'Harcama',
                        title: e.description || e.category || 'Harcama',
                        sub: formatDateTR(e.date) + ' · ' + (Number(e.displayAmount != null ? e.displayAmount : e.amount) || 0).toLocaleString('tr-TR') + ' TL · ' + (e.category || ''),
                        tab: 'expense'
                    });
                });
            } catch (_) {}
            if (!hits.length) {
                box.innerHTML = '<p class="text-xs text-slate-400 font-semibold text-center py-6">Sonuç yok</p>';
                return;
            }
            box.innerHTML = hits.map(function(h) {
                return '<button type="button" onclick="closeSiteSearch(); switchTab(\'' + h.tab + '\')" class="w-full text-left p-3 rounded-xl bg-slate-50 hover:bg-sky-50 border border-slate-100">' +
                    '<span class="text-[10px] font-black text-sky-600 uppercase">' + escapeHtml(h.cat) + '</span>' +
                    '<p class="text-sm font-bold text-slate-800">' + escapeHtml(h.title) + '</p>' +
                    '<p class="text-[11px] text-slate-500 font-semibold">' + escapeHtml(h.sub) + '</p></button>';
            }).join('');
        };

        window.toggleQuickAddMenu = function() {
            const m = document.getElementById('quickAddMenu');
            if (!m) return;
            m.classList.toggle('hidden');
        };
        window.quickAddAction = function(kind) {
            const m = document.getElementById('quickAddMenu');
            if (m) m.classList.add('hidden');
            if (kind === 'expense' || kind === 'bill') {
                switchTab('expense');
                setTimeout(function() {
                    openExpenseModal();
                    if (kind === 'bill') {
                        const cat = document.getElementById('category');
                        if (cat) {
                            cat.value = 'Faturalar';
                            if (typeof onCategoryChange === 'function') onCategoryChange();
                        }
                    }
                }, 100);
            } else if (kind === 'task') {
                switchTab('tasks');
            } else if (kind === 'calendar') {
                switchTab('calendar');
            } else if (kind === 'shopping') {
                switchTab('shopping');
            } else if (kind === 'note') {
                switchTab('notes');
            }
        };



        window.renderBillsChart = async function() {
            const canvas = document.getElementById('billsChart');
            if (!canvas) return;
            try { if (typeof ensureChartJs === 'function') await ensureChartJs(); } catch (_) {}
            if (typeof Chart === 'undefined') return;

            const subtypes = ['Elektrik', 'Su', 'Doğalgaz', 'Telefon', 'İnternet', 'Abonelik'];
            const colors = {
                'Elektrik': '#f59e0b',
                'Su': '#0ea5e9',
                'Doğalgaz': '#f97316',
                'Telefon': '#8b5cf6',
                'İnternet': '#6366f1',
                'Abonelik': '#ec4899',
                'Diğer': '#94a3b8'
            };

            // Son 6 ekstre dönemi (29–28)
            const periods = [];
            try {
                const cur = (typeof getCurrentPeriod === 'function') ? getCurrentPeriod() : '';
                if (cur && cur.indexOf('-') > 0) {
                    let y = parseInt(cur.slice(0, 4), 10);
                    let m = parseInt(cur.slice(5, 7), 10);
                    for (let i = 5; i >= 0; i--) {
                        let mm = m - i;
                        let yy = y;
                        while (mm <= 0) { mm += 12; yy -= 1; }
                        periods.push(yy + '-' + String(mm).padStart(2, '0'));
                    }
                }
            } catch (_) {}
            if (!periods.length) {
                const now = new Date();
                for (let i = 5; i >= 0; i--) {
                    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    periods.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
                }
            }

            const byPeriodSub = {};
            periods.forEach(function(p) { byPeriodSub[p] = {}; });

            periods.forEach(function(pk) {
                let rows = [];
                try {
                    if (typeof getExpensesForPeriodKey === 'function') {
                        rows = getExpensesForPeriodKey(pk, '') || [];
                    } else if (typeof getProcessedExpenses === 'function') {
                        rows = getProcessedExpenses().filter(function(e) { return e && e.effectiveMonth === pk; });
                    }
                } catch (_) { rows = []; }
                rows.forEach(function(e) {
                    if (!e) return;
                    if (String(e.category || '') !== 'Faturalar') return;
                    if (typeof countsInCharts === 'function') {
                        if (!countsInCharts(e)) return;
                    } else if (e.isOnBehalf || e.onBehalf) {
                        return;
                    }
                    let st = String(e.billSubtype || '').trim();
                    if (st === 'Platform') st = 'Abonelik';
                    if (!st || (subtypes.indexOf(st) < 0 && st !== 'Diğer')) st = 'Diğer';
                    byPeriodSub[pk][st] = (byPeriodSub[pk][st] || 0) + (Number(e.displayAmount) || 0);
                });
            });

            // Sadece fatura olan dönemler (boş aylar eksende yer kaplamasın)
            const activePeriods = periods.filter(function(p) {
                const o = byPeriodSub[p] || {};
                return Object.keys(o).some(function(k) { return (o[k] || 0) > 0; });
            });

            const labels = activePeriods.map(function(p) {
                return (typeof formatPeriodLabel === 'function') ? formatPeriodLabel(p) : p;
            });

            // Yalnızca en az bir dönemde tutarı > 0 olan türler
            const seriesKeys = [];
            subtypes.forEach(function(st) {
                const any = activePeriods.some(function(p) { return (byPeriodSub[p][st] || 0) > 0; });
                if (any) seriesKeys.push(st);
            });
            if (activePeriods.some(function(p) { return (byPeriodSub[p]['Diğer'] || 0) > 0; })) {
                seriesKeys.push('Diğer');
            }

            // 0 değerler null → skipNull ile boş çubuk/yer yok
            const datasets = seriesKeys.map(function(st) {
                return {
                    label: st,
                    data: activePeriods.map(function(p) {
                        const v = byPeriodSub[p][st] || 0;
                        return v > 0 ? Math.round(v * 100) / 100 : null;
                    }),
                    backgroundColor: colors[st] || '#94a3b8',
                    borderRadius: 4,
                    maxBarThickness: 22,
                    skipNull: true
                };
            });

            const hasAny = datasets.length > 0 && activePeriods.length > 0;

            if (billsChart) {
                try { billsChart.destroy(); } catch (_) {}
                billsChart = null;
            }

            billsChart = new Chart(canvas, {
                type: 'bar',
                data: { labels: labels.length ? labels : ['Veri yok'], datasets: datasets.length ? datasets : [{ label: '—', data: [0], backgroundColor: '#e2e8f0' }] },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { boxWidth: 10, font: { size: 10 }, padding: 8 }
                        },
                        tooltip: {
                            filter: function(item) {
                                const v = item.parsed && item.parsed.y;
                                return v != null && v > 0;
                            },
                            callbacks: {
                                label: function(ctx) {
                                    const v = ctx.parsed && ctx.parsed.y != null ? ctx.parsed.y : 0;
                                    if (!(v > 0)) return null;
                                    return ctx.dataset.label + ': ' + Math.round(v).toLocaleString('tr-TR') + ' TL';
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            stacked: false,
                            ticks: { font: { size: 10 }, maxRotation: 45, minRotation: 0 }
                        },
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: function(v) { return Number(v).toLocaleString('tr-TR'); }
                            }
                        }
                    }
                }
            });

            // Boşsa alt başlığa not
            try {
                const sub = canvas.closest('.chart-block');
                if (sub) {
                    let note = sub.querySelector('.bills-chart-empty');
                    if (!hasAny) {
                        if (!note) {
                            note = document.createElement('p');
                            note.className = 'bills-chart-empty text-xs text-slate-400 font-semibold text-center mt-2';
                            canvas.parentNode.appendChild(note);
                        }
                        note.textContent = 'Son 6 dönemde Faturalar kaydı yok (veya hepsi başkası adına / hariç tutulan)';
                    } else if (note) {
                        note.remove();
                    }
                }
            } catch (_) {}
        };

        window.toggleStatsExtraCharts = function() {
            window._statsExtraOpen = !window._statsExtraOpen;
            const box = document.getElementById('statsExtraCharts');
            const ch = document.getElementById('statsExtraChevron');
            if (box) box.classList.toggle('hidden', !window._statsExtraOpen);
            if (ch) ch.textContent = window._statsExtraOpen ? '▾' : '▸';
            if (window._statsExtraOpen) {
                try { updateStatsPanel(); } catch (_) {}
            }
        };

        // Kategori pastası / özet için seçili dönem (null = aktif)
        window.statsCategoryPeriodKey = window.statsCategoryPeriodKey || null;

        window.fillStatsCategoryPeriodSelect = function() {
            const sel = document.getElementById('statsCategoryPeriodSelect');
            if (!sel) return;
            const current = (typeof getCurrentPeriod === 'function') ? getCurrentPeriod() : '';
            const keys = (typeof getPreviousPeriodKeys === 'function') ? getPreviousPeriodKeys(8) : [];
            const uniq = [];
            (keys || []).forEach(function(k) {
                if (k && uniq.indexOf(k) < 0) uniq.push(k);
            });
            if (current && uniq.indexOf(current) < 0) uniq.push(current);
            uniq.sort().reverse();
            const prev = window.statsCategoryPeriodKey || current;
            sel.innerHTML = uniq.map(function(k) {
                const lab = (typeof formatPeriodLabel === 'function') ? formatPeriodLabel(k) : k;
                const tag = (k === current) ? ' (aktif)' : '';
                return '<option value="' + k + '">' + lab + tag + '</option>';
            }).join('');
            if (prev && uniq.indexOf(prev) >= 0) sel.value = prev;
            else if (current) sel.value = current;
            window.statsCategoryPeriodKey = sel.value || current;
        };

        window.onStatsCategoryPeriodChange = function() {
            const sel = document.getElementById('statsCategoryPeriodSelect');
            if (sel && sel.value) window.statsCategoryPeriodKey = sel.value;
            try { updateStatsPanel(); } catch (_) {}
        };

        window.getStatsCategoryPeriod = function() {
            if (window.statsCategoryPeriodKey) return window.statsCategoryPeriodKey;
            return (typeof getCurrentPeriod === 'function') ? getCurrentPeriod() : '';
        };

        
        /** Grafiklerde: multinet + başkası adına hariç */
        function countsInCharts(e) {
            if (!e) return false;
            if (e.installmentLabel === 'Gelir') return false;
            if (typeof isMultinetPayment === 'function' && isMultinetPayment(e.paymentType)) return false;
            if (e.isOnBehalf || e.onBehalf) return false;
            if (typeof isOnBehalfExpense === 'function' && isOnBehalfExpense(e)) return false;
            return true;
        }

function updateStatsPanel() {
            try { fillStatsCategoryPeriodSelect(); } catch (_) {}
            const period = (typeof getStatsCategoryPeriod === 'function') ? getStatsCategoryPeriod() : getCurrentPeriod();
            // Geçmiş dönem taksit dilimleri için getExpensesForPeriodKey
            let processedExpenses = [];
            if (typeof getExpensesForPeriodKey === 'function') {
                processedExpenses = getExpensesForPeriodKey(period, '').filter(function(e) {
                    return typeof countsInCharts === 'function' ? countsInCharts(e) : !(e && (e.isOnBehalf || e.onBehalf));
                });
            } else {
                processedExpenses = getProcessedExpenses().filter(function(e) {
                    return e.effectiveMonth === period && (typeof countsInCharts === 'function' ? countsInCharts(e) : (typeof countsInPeriodTotals !== 'function' || countsInPeriodTotals(e)));
                });
            }
            const total = processedExpenses.reduce(function(s, e) { return s + (e.displayAmount || 0); }, 0);
            // Başlık: seçili dönem
            try {
                const title = document.getElementById('chartTitle');
                const lab = (typeof formatPeriodLabel === 'function') ? formatPeriodLabel(period) : period;
                if (title) title.textContent = 'Kategori Dağılımı';
                const sub = title && title.parentElement ? title.parentElement.querySelector('.chart-sub') : null;
                // sub zaten HTML'de
                const sel = document.getElementById('statsCategoryPeriodSelect');
                if (sel && period) sel.value = period;
            } catch (_) {}

            // --- Kategori pasta ---
            const categoryData = {};
            const shopSubTotals = {};
            let shopEcommerceTotal = 0;
            processedExpenses.forEach(function(e) {
                let cat = e.category || 'Diğer';
                if (typeof isLegacyShopCategory === 'function' && isLegacyShopCategory(cat)) cat = 'Alışveriş';
                if (cat === 'E-ticaret') cat = 'Alışveriş';
                // E-ticaret de Alışveriş diliminde birleşir
                if (e.isEcommerce || (typeof isAlisverisCategory === 'function' && isAlisverisCategory(cat))) {
                    cat = 'Alışveriş';
                }
                categoryData[cat] = (categoryData[cat] || 0) + (e.displayAmount || 0);
                const isShop = (typeof isAlisverisCategory === 'function' && isAlisverisCategory(cat)) || cat === 'Alışveriş';
                if (isShop || e.isEcommerce) {
                    const st = String(e.shopSubtype || '').trim() || 'Belirtilmedi';
                    shopSubTotals[st] = (shopSubTotals[st] || 0) + (e.displayAmount || 0);
                    if (e.isEcommerce) shopEcommerceTotal += (e.displayAmount || 0);
                }
            });

            const ctx1 = document.getElementById('expenseChart');
            if (ctx1) {
                if (expenseChart) { try { expenseChart.destroy(); } catch (_) {} }
                const labels = Object.keys(categoryData);
                const data = labels.map(function(k) { return categoryData[k]; });
                const colors = (typeof yuvamChartPalette === 'function') ? yuvamChartPalette() : ['#0284c7','#0ea5e9','#10b981','#f59e0b','#8b5cf6','#f43f5e','#06b6d4'];
                expenseChart = new Chart(ctx1, {
                    type: 'doughnut',
                    data: {
                        labels: labels,
                        datasets: [{ data: data, backgroundColor: labels.map(function(_, i) { return colors[i % colors.length]; }), borderWidth: 0 }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 }, padding: 10 } }
                        },
                        onClick: function(evt, els) {
                            if (!els || !els.length) return;
                            const i = els[0].index;
                            const lab = labels[i];
                            if (lab && typeof showCategoryExpenses === 'function') showCategoryExpenses(lab);
                        }
                    }
                });
            }

            // --- Kategori özeti (Alışveriş alt kırılım) ---
            const detailedReport = document.getElementById('detailedMonthlyReport');
            if (detailedReport) {
                // Özet için E-ticaret'i Alışveriş altında göster
                const summaryCats = {};
                processedExpenses.forEach(function(e) {
                    let cat = e.category || 'Diğer';
                    if (typeof isLegacyShopCategory === 'function' && isLegacyShopCategory(cat)) cat = 'Alışveriş';
                    if (cat === 'E-ticaret') cat = 'Alışveriş';
                    summaryCats[cat] = (summaryCats[cat] || 0) + (e.displayAmount || 0);
                });
                const entries = Object.entries(summaryCats).sort(function(a, b) { return b[1] - a[1]; });
                if (!entries.length) {
                    detailedReport.innerHTML = '<p class="text-sm text-slate-400 col-span-full text-center py-2">Bu dönemde kategori yok</p>';
                } else {
                    detailedReport.innerHTML = entries.map(function(pair) {
                        const cat = pair[0];
                        const amt = pair[1];
                        const share = total > 0 ? Math.round(amt / total * 100) : 0;
                        const safe = String(cat).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                        let html = '<div class="rounded-xl bg-slate-50 border border-transparent hover:border-indigo-100 transition overflow-hidden">' +
                            '<button type="button" onclick="showCategoryExpenses(\'' + safe + '\')" class="flex items-center justify-between gap-2 px-3 py-2 text-left w-full hover:bg-indigo-50">' +
                            '<span class="text-xs font-bold text-slate-700 truncate">' + escapeHtml(cat) + '</span>' +
                            '<span class="text-xs font-black text-slate-800 whitespace-nowrap">' + amt.toLocaleString('tr-TR') + ' TL <span class="text-slate-400 font-bold">%' + share + '</span></span>' +
                            '</button>';
                        const isShop = (typeof isAlisverisCategory === 'function' && isAlisverisCategory(cat)) || cat === 'Alışveriş';
                        if (isShop && Object.keys(shopSubTotals).length) {
                            const subEntries = Object.entries(shopSubTotals).sort(function(a, b) { return b[1] - a[1]; });
                            html += '<div class="px-3 pb-2 space-y-0.5 border-t border-slate-100/80">';
                            subEntries.forEach(function(sp) {
                                const sn = sp[0], sa = sp[1];
                                const ss = amt > 0 ? Math.round(sa / amt * 100) : 0;
                                html += '<div class="flex items-center justify-between gap-2 pl-2 py-0.5">' +
                                    '<span class="text-[10px] font-semibold text-slate-500">↳ ' + escapeHtml(sn) + '</span>' +
                                    '<span class="text-[10px] font-bold text-slate-600 whitespace-nowrap">' + sa.toLocaleString('tr-TR') + ' TL <span class="text-slate-400">%' + ss + '</span></span></div>';
                            });
                            if (shopEcommerceTotal > 0) {
                                const es = amt > 0 ? Math.round(shopEcommerceTotal / amt * 100) : 0;
                                html += '<div class="flex items-center justify-between gap-2 pl-2 py-0.5 mt-0.5 border-t border-dashed border-slate-200">' +
                                    '<span class="text-[10px] font-semibold text-violet-600">↳ E-ticaret (toplam)</span>' +
                                    '<span class="text-[10px] font-bold text-violet-700 whitespace-nowrap">' + shopEcommerceTotal.toLocaleString('tr-TR') + ' TL <span class="text-violet-400">%' + es + '</span></span></div>';
                            }
                            html += '</div>';
                        }
                        html += '</div>';
                        return html;
                    }).join('');
                }
            }

            // --- Haftalık trend (güne tıkla → detay) ---
            try {
                const ctxW = document.getElementById('weeklyTrendChart');
                if (ctxW) {
                    const days = [];
                    const dayYm = [];
                    const daySums = [];
                    const today = new Date();
                    for (let i = 6; i >= 0; i--) {
                        const d = new Date(today);
                        d.setDate(today.getDate() - i);
                        const ymd = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                        const lab = String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0');
                        days.push(lab);
                        dayYm.push(ymd);
                        const sum = getProcessedExpenses().filter(function(e) {
                            if (typeof countsInCharts === 'function') { if (!countsInCharts(e)) return false; }
                            else if (typeof countsInPeriodTotals === 'function' && !countsInPeriodTotals(e)) return false;
                            return String(e.date || '').slice(0, 10) === ymd;
                        }).reduce(function(s, e) { return s + (e.displayAmount || 0); }, 0);
                        daySums.push(sum);
                    }
                    if (weeklyTrendChart) { try { weeklyTrendChart.destroy(); } catch (_) {} }
                    weeklyTrendChart = new Chart(ctxW, {
                        type: 'bar',
                        data: { labels: days, datasets: [{ label: 'Harcama', data: daySums, backgroundColor: ((typeof yuvamChartPalette === 'function') ? yuvamChartPalette()[0] : '#0284c7'), borderRadius: 6, maxBarThickness: 28 }] },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { legend: { display: false } },
                            scales: { y: { beginAtZero: true } },
                            onClick: function(evt, els) {
                                if (!els || !els.length) return;
                                const i = els[0].index;
                                const ymd = dayYm[i];
                                const lab = days[i];
                                if (ymd && typeof showDayExpenses === 'function') {
                                    showDayExpenses(ymd, lab);
                                }
                            }
                        }
                    });
                }
            } catch (errW) { console.warn('weeklyTrend', errW); }

            try { renderPeriodLiveSummary(); } catch (_) {}

            // İkincil grafikler yalnızca açılır panel açıkken
            if (!window._statsExtraOpen) {
                return;
            }
            try { if (typeof renderBillsChart === 'function') renderBillsChart(); } catch (_) {}

            // --- Dönem trendi: Bekir+Duygu KK borcu (ödenmiş ekstre + aktif borç) ---
            try {
                const ctxM = document.getElementById('monthlyTrendChart');
                if (ctxM) {
                    const curPk = (typeof getCurrentPeriod === 'function') ? getCurrentPeriod() : '';
                    // person|periodKey -> amount (kişi+dönem tek hücre)
                    const perCell = {};
                    const cellTs = {};

                    function setCell(person, pk, amount, ts, force) {
                        if (!person || !pk) return;
                        const k = person + '|' + pk;
                        const amt = Number(amount) || 0;
                        const tsv = String(ts || '');
                        if (force) {
                            perCell[k] = amt;
                            cellTs[k] = tsv;
                            return;
                        }
                        if (perCell[k] == null || (tsv && tsv >= String(cellTs[k] || ''))) {
                            perCell[k] = amt;
                            cellTs[k] = tsv;
                        }
                    }

                    // 1) Ödenmiş ekstreler — UI ile aynı dönem anahtarı
                    (cardStatements || []).forEach(function(s) {
                        if (!s) return;
                        const person = String(s.person || '').toLowerCase();
                        if (person !== 'bekir' && person !== 'duygu') return;
                        let pk = '';
                        try {
                            if (typeof resolveStatementPeriodKey === 'function') {
                                pk = resolveStatementPeriodKey(s) || '';
                            }
                        } catch (_) {}
                        if (!pk) {
                            pk = String(s.periodKey || s.month || '');
                        }
                        if (!pk || !/^\d{4}-\d{2}$/.test(pk)) return;
                        setCell(person, pk, s.amount, s.paidDate || s.createdAt || '', false);
                    });

                    // 2) Aktif (ödenmemiş) borç → GÜNCEL ekstre dönemi (29 Ağu–28 Eyl vb.)
                    function applyActiveDebt(person, debt) {
                        if (!debt || debt.paid || !(Number(debt.amount) > 0)) return;
                        let pk = '';
                        if (debt.periodKey && /^\d{4}-\d{2}$/.test(String(debt.periodKey))) {
                            pk = String(debt.periodKey);
                        } else if (debt.spendPeriodKey && /^\d{4}-\d{2}$/.test(String(debt.spendPeriodKey))) {
                            pk = String(debt.spendPeriodKey);
                        } else {
                            pk = curPk;
                        }
                        if (!pk) return;
                        setCell(person, pk, debt.amount, '9999-active', true);
                    }
                    try { applyActiveDebt('bekir', typeof bekirDebt !== 'undefined' ? bekirDebt : null); } catch (_) {}
                    try { applyActiveDebt('duygu', typeof duyguDebt !== 'undefined' ? duyguDebt : null); } catch (_) {}

                    const byP = {};
                    Object.keys(perCell).forEach(function(k) {
                        const pk = k.split('|')[1];
                        byP[pk] = (byP[pk] || 0) + (Number(perCell[k]) || 0);
                    });

                    let keys = [];
                    try {
                        if (typeof getPreviousPeriodKeys === 'function') {
                            keys = getPreviousPeriodKeys(8).slice();
                        }
                    } catch (_) {}
                    Object.keys(byP).forEach(function(pk) {
                        if (pk && keys.indexOf(pk) < 0) keys.push(pk);
                    });
                    keys = keys.filter(Boolean).sort().slice(-8);

                    const labels = keys.map(function(k) {
                        return (typeof formatPeriodLabel === 'function') ? formatPeriodLabel(k) : k;
                    });
                    const dataVals = keys.map(function(k) {
                        return Math.round((Number(byP[k]) || 0) * 100) / 100;
                    });

                    if (monthlyTrendChart) { try { monthlyTrendChart.destroy(); } catch (_) {} }
                    monthlyTrendChart = new Chart(ctxM, {
                        type: 'line',
                        data: {
                            labels: labels,
                            datasets: [{
                                label: 'KK borcu (Bekir+Duygu)',
                                data: dataVals,
                                borderColor: '#0ea5e9',
                                backgroundColor: 'rgba(14,165,233,0.12)',
                                fill: true,
                                tension: 0.3,
                                pointRadius: 5,
                                pointHoverRadius: 8
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: { display: false },
                                tooltip: {
                                    callbacks: {
                                        title: function(items) {
                                            if (!items || !items.length) return '';
                                            return labels[items[0].dataIndex] || '';
                                        },
                                        label: function(ctx) {
                                            const v = ctx.parsed && ctx.parsed.y != null ? ctx.parsed.y : 0;
                                            return 'KK borcu: ' + Number(v).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' });
                                        }
                                    }
                                }
                            },
                            scales: { y: { beginAtZero: true } }
                        }
                    });
                }
            } catch (errM) { console.warn('monthlyTrend', errM); }




            // --- Bu dönem vs önceki ---
            // Bu Dönem vs Önceki grafiği kaldırıldı


            // --- Kategori trendi (3 dönem, en yüksek 5) ---
            try {
                const ctxT = document.getElementById('categoryTrendChart');
                if (ctxT) {
                    const pkeys = (typeof getPreviousPeriodKeys === 'function') ? getPreviousPeriodKeys(3) : [period];

                    function trendCat(e) {
                        if (!e) return 'Diğer';
                        if (e.isEcommerce || e.category === 'E-ticaret') return 'E-ticaret';
                        const c = e.category || 'Diğer';
                        if (typeof isLegacyShopCategory === 'function' && isLegacyShopCategory(c)) return 'Alışveriş';
                        if (typeof isAlisverisCategory === 'function' && isAlisverisCategory(c)) return 'Alışveriş';
                        if (c === 'Alışveriş') return 'Alışveriş';
                        return c;
                    }

                    // Dönem başına satırlar: getExpensesForPeriodKey (taksit dilimleri dahil)
                    const byPeriod = {};
                    const catGrand = {};
                    pkeys.forEach(function(pk) {
                        let rows = [];
                        try {
                            if (typeof getExpensesForPeriodKey === 'function') {
                                rows = getExpensesForPeriodKey(pk, '') || [];
                            } else {
                                rows = (typeof getProcessedExpenses === 'function' ? getProcessedExpenses() : [])
                                    .filter(function(e) { return e && e.effectiveMonth === pk; });
                            }
                        } catch (_) { rows = []; }
                        rows = rows.filter(function(e) {
                            if (typeof countsInCharts === 'function') return countsInCharts(e);
                            if (e && (e.isOnBehalf || e.onBehalf)) return false;
                            return typeof countsInPeriodTotals !== 'function' || countsInPeriodTotals(e);
                        });
                        byPeriod[pk] = rows;
                        rows.forEach(function(e) {
                            const cat = trendCat(e);
                            catGrand[cat] = (catGrand[cat] || 0) + (Number(e.displayAmount) || 0);
                        });
                    });

                    const top5 = Object.entries(catGrand).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 5).map(function(x) { return x[0]; });
                    const palette = (typeof yuvamChartPalette === 'function') ? yuvamChartPalette() : ['#0284c7', '#f59e0b', '#10b981', '#f43f5e', '#8b5cf6'];
                    const datasets = top5.map(function(cat, i) {
                        return {
                            label: cat,
                            data: pkeys.map(function(pk) {
                                return (byPeriod[pk] || []).filter(function(e) { return trendCat(e) === cat; })
                                    .reduce(function(s, e) { return s + (Number(e.displayAmount) || 0); }, 0);
                            }),
                            backgroundColor: palette[i % palette.length],
                            borderRadius: 4,
                            maxBarThickness: 18
                        };
                    });
                    const labelsT = pkeys.map(function(pk) {
                        return (typeof formatPeriodLabel === 'function') ? formatPeriodLabel(pk) : pk;
                    });
                    if (categoryTrendChart) { try { categoryTrendChart.destroy(); } catch (_) {} }
                    categoryTrendChart = new Chart(ctxT, {
                        type: 'bar',
                        data: { labels: labelsT, datasets: datasets },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 }, padding: 8 } },
                                tooltip: {
                                    callbacks: {
                                        label: function(ctx) {
                                            const v = ctx.parsed && ctx.parsed.y != null ? ctx.parsed.y : 0;
                                            return (ctx.dataset.label || '') + ': ' + Number(v).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' });
                                        }
                                    }
                                }
                            },
                            scales: {
                                x: { stacked: false },
                                y: { beginAtZero: true }
                            }
                        }
                    });
                }
            } catch (errT) { console.warn('categoryTrend', errT); }
        }


        window.renderPeriodLiveSummary = function() {
            const body = document.getElementById('periodLiveBody');
            const adviceEl = document.getElementById('periodLiveAdvice');
            const rangeEl = document.getElementById('periodLiveRange');
            if (!body) return;
            try {
                const period = (typeof getCurrentPeriod === 'function') ? getCurrentPeriod() : '';
                const lab = (typeof formatPeriodLabel === 'function') ? formatPeriodLabel(period) : period;
                if (rangeEl) rangeEl.textContent = (lab || period || 'Güncel dönem') + ' · canlı';

                const all = (typeof getProcessedExpenses === 'function') ? getProcessedExpenses() : [];
                const list = all.filter(function(e) {
                    return e.effectiveMonth === period && (typeof countsInPeriodTotals !== 'function' || countsInPeriodTotals(e));
                });
                const sum = function(arr, pred) {
                    return arr.filter(pred).reduce(function(s, e) { return s + (Number(e.displayAmount) || 0); }, 0);
                };
                const isCard = function(e) {
                    return typeof isCreditPayment === 'function' ? isCreditPayment(e.paymentType) : /kredi/i.test(String(e.paymentType || ''));
                };
                const isCash = function(e) {
                    return typeof isCashPayment === 'function' ? isCashPayment(e.paymentType) : /nakit/i.test(String(e.paymentType || ''));
                };
                const total = list.reduce(function(s, e) { return s + (Number(e.displayAmount) || 0); }, 0);
                const card = sum(list, isCard);
                const cash = sum(list, isCash);

                // Multinet (ayın 1'i kuralı — dönem toplamına dahil değil)
                let multi = 0;
                try {
                    if (typeof getMultinetMonthRange === 'function') {
                        const r = getMultinetMonthRange();
                        multi = all.filter(function(e) {
                            return (typeof isMultinetPayment === 'function' && isMultinetPayment(e.paymentType))
                                && e.date >= r.start && e.date < r.end;
                        }).reduce(function(s, e) { return s + (Number(e.displayAmount) || e.amount || 0); }, 0);
                    } else {
                        multi = all.filter(function(e) {
                            return typeof isMultinetPayment === 'function' && isMultinetPayment(e.paymentType)
                                && e.effectiveMonth === period;
                        }).reduce(function(s, e) { return s + (Number(e.displayAmount) || 0); }, 0);
                    }
                } catch (_) {}

                // Kişi
                const byPerson = {};
                list.forEach(function(e) {
                    const p = e.person || 'Diğer';
                    byPerson[p] = (byPerson[p] || 0) + (Number(e.displayAmount) || 0);
                });

                // Kategori top 3
                const byCat = {};
                list.forEach(function(e) {
                    let c = e.category || 'Diğer';
                    if (typeof isLegacyShopCategory === 'function' && isLegacyShopCategory(c)) c = 'Alışveriş';
                    if (c === 'E-ticaret') c = 'Alışveriş';
                    byCat[c] = (byCat[c] || 0) + (Number(e.displayAmount) || 0);
                });
                const topCats = Object.entries(byCat).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 3);

                // Önceki dönem
                let prevSum = 0, prevKey = '';
                try {
                    const keys = (typeof getPreviousPeriodKeys === 'function') ? getPreviousPeriodKeys(2) : [];
                    if (keys.length >= 2) {
                        prevKey = keys[0];
                        prevSum = all.filter(function(e) {
                            return e.effectiveMonth === prevKey && (typeof countsInPeriodTotals !== 'function' || countsInPeriodTotals(e));
                        }).reduce(function(s, e) { return s + (Number(e.displayAmount) || 0); }, 0);
                    }
                } catch (_) {}
                const delta = total - prevSum;
                const deltaPct = prevSum > 0 ? Math.round((delta / prevSum) * 100) : (total > 0 ? 100 : 0);

                // KK hedefi
                const target = Number(monthlyBudgetTarget) || 0;
                const targetPct = target > 0 ? Math.round((card / target) * 100) : null;

                const fmt = function(n) { return Math.round(n).toLocaleString('tr-TR') + ' TL'; };
                let html = '';
                html += '<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">';
                html += '<div class="rounded-xl bg-slate-50 p-3"><p class="text-[10px] font-bold text-slate-400 uppercase">Toplam</p><p class="text-base font-black text-slate-900">' + fmt(total) + '</p></div>';
                html += '<div class="rounded-xl bg-indigo-50 p-3"><p class="text-[10px] font-bold text-indigo-400 uppercase">Kredi kartı</p><p class="text-base font-black text-indigo-900">' + fmt(card) + '</p></div>';
                html += '<div class="rounded-xl bg-emerald-50 p-3"><p class="text-[10px] font-bold text-emerald-500 uppercase">Nakit</p><p class="text-base font-black text-emerald-900">' + fmt(cash) + '</p></div>';
                html += '<div class="rounded-xl bg-amber-50 p-3"><p class="text-[10px] font-bold text-amber-600 uppercase">Multinet*</p><p class="text-base font-black text-amber-900">' + fmt(multi) + '</p></div>';
                html += '</div>';
                html += '<p class="text-[10px] text-slate-400 font-semibold">* Multinet dönem toplamına dahil edilmez</p>';

                if (target > 0) {
                    const barPct = Math.min(100, targetPct);
                    const barCol = targetPct >= 100 ? 'bg-rose-500' : (targetPct >= 80 ? 'bg-amber-500' : 'bg-sky-500');
                    html += '<div class="mt-1"><div class="flex justify-between text-[11px] font-bold mb-1"><span class="text-slate-500">KK hedefi</span><span class="text-slate-800">' + fmt(card) + ' / ' + fmt(target) + ' · %' + targetPct + '</span></div>';
                    html += '<div class="h-2 rounded-full bg-slate-100 overflow-hidden"><div class="h-full rounded-full ' + barCol + '" style="width:' + barPct + '%"></div></div></div>';
                }

                if (topCats.length) {
                    html += '<div><p class="text-[10px] font-black text-slate-400 uppercase mb-1.5">En yüksek kategoriler</p><div class="space-y-1">';
                    topCats.forEach(function(pair) {
                        const share = total > 0 ? Math.round(pair[1] / total * 100) : 0;
                        html += '<div class="flex justify-between gap-2 text-xs"><span class="font-bold text-slate-700">' + escapeHtml(pair[0]) + '</span><span class="font-black text-slate-800">' + fmt(pair[1]) + ' <span class="text-slate-400">%' + share + '</span></span></div>';
                    });
                    html += '</div></div>';
                }

                const persons = Object.entries(byPerson).sort(function(a, b) { return b[1] - a[1]; });
                if (persons.length) {
                    html += '<div class="flex flex-wrap gap-2">';
                    persons.forEach(function(pair) {
                        html += '<span class="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">' + escapeHtml(pair[0]) + ': ' + fmt(pair[1]) + '</span>';
                    });
                    html += '</div>';
                }

                if (prevKey) {
                    const arrow = delta > 0 ? '▲' : (delta < 0 ? '▼' : '●');
                    const col = delta > 0 ? 'text-rose-600' : (delta < 0 ? 'text-emerald-600' : 'text-slate-500');
                    const prevLab = (typeof formatPeriodLabel === 'function') ? formatPeriodLabel(prevKey) : prevKey;
                    html += '<p class="text-xs font-semibold ' + col + '">' + arrow + ' Önceki döneme göre (' + escapeHtml(prevLab || prevKey) + '): ' +
                        (delta >= 0 ? '+' : '') + fmt(delta).replace(' TL', '') + ' TL (%' + deltaPct + ')</p>';
                }

                body.innerHTML = html;

                // Yerel uyarı / öneri
                const tips = [];
                if (target > 0) {
                    if (targetPct >= 100) tips.push('Kredi kartı harcaması aylık hedefini aştı (%' + targetPct + '). Kalan günlerde KK kullanımını sınırlamak iyi olur.');
                    else if (targetPct >= 85) tips.push('KK hedefinin %' + targetPct + 'ine ulaşıldı. Dönem bitmeden dikkatli ilerleyin.');
                    else if (targetPct <= 50 && total > 0) tips.push('KK hedefinin henüz yarısındasınız; bu tempoyu korumak mümkün.');
                }
                if (prevSum > 0 && deltaPct >= 15) tips.push('Bu dönem önceki döneme göre belirgin arttı (%' + deltaPct + '). En şişkin kategoriyi aşağıdan kontrol edin.');
                if (prevSum > 0 && deltaPct <= -10) tips.push('Önceki döneme göre harcama geriledi (%' + deltaPct + '). İyi bir tempo.');
                if (topCats.length && total > 0 && topCats[0][1] / total >= 0.4) {
                    tips.push('“' + topCats[0][0] + '” tek başına dönemin %' + Math.round(topCats[0][1] / total * 100) + 'ini oluşturuyor; kırılımı incelemeye değer.');
                }
                if (cash > 0 && card > 0 && cash / Math.max(total, 1) >= 0.25) {
                    tips.push('Nakit payı görece yüksek; nakit fişlerini de düzenli işlediğinizden emin olun.');
                }
                if (!list.length) tips.push('Bu dönemde henüz dönem toplamına giren harcama yok.');
                if (!tips.length) tips.push('Dönem dengeli görünüyor. Büyük sapma yok; mevcut tempoyu sürdürebilirsiniz.');

                if (adviceEl) {
                    adviceEl.innerHTML = '<p class="text-[10px] font-black text-indigo-500 uppercase tracking-wider mb-1">Yerel uyarı</p><p>' + escapeHtml(tips[0]) + '</p>' +
                        (tips[1] ? '<p class="mt-1.5 text-slate-500">' + escapeHtml(tips[1]) + '</p>' : '');
                }
            } catch (err) {
                console.warn('periodLiveSummary', err);
                body.innerHTML = '<p class="text-slate-400 font-semibold text-center py-3">Özet hesaplanamadı</p>';
                if (adviceEl) adviceEl.textContent = '';
            }
        };


        /** Belirli dönem anahtarı için işlenmiş harcamalar (taksit dilimleri dahil). asOfYmd verilirse o güne kadar (dahil). */
        function getExpensesForPeriodKey(periodKey, asOfYmd) {
            const out = [];
            if (!periodKey) return out;
            const asOf = asOfYmd ? String(asOfYmd).slice(0, 10) : '';
            const list = (typeof expenses !== 'undefined' && expenses) ? expenses : [];
            list.forEach(function(item) {
                if (!item || item.installmentLabel === 'Gelir') return;
                const count = Math.max(1, parseInt(item.installmentCount, 10) || 1);
                const isRec = !!item.isRecurring;
                const perAmount = isRec
                    ? (item.amountPerInstallment != null ? Number(item.amountPerInstallment) : Number(item.amount) || 0)
                    : (item.amountPerInstallment != null
                        ? Number(item.amountPerInstallment)
                        : ((Number(item.amount) || 0) / count));
                const originalDate = item.date;
                if (count <= 1 && !isRec) {
                    const pk = (typeof getPeriodKeyForDateStr === 'function')
                        ? getPeriodKeyForDateStr(originalDate)
                        : String(originalDate || '').slice(0, 7);
                    if (pk !== periodKey) return;
                    const d0 = String(originalDate || '').slice(0, 10);
                    if (asOf && d0 && d0 > asOf) return;
                    out.push(Object.assign({}, item, {
                        displayAmount: Number(item.amount) || 0,
                        installmentLabel: 'Peşin',
                        effectiveMonth: pk,
                        date: originalDate
                    }));
                    return;
                }
                const n = count;
                for (let i = 0; i < n; i++) {
                    const dateStr = (typeof shiftDateByMonths === 'function')
                        ? shiftDateByMonths(originalDate, i)
                        : originalDate;
                    const pk = (typeof getPeriodKeyForDateStr === 'function')
                        ? getPeriodKeyForDateStr(dateStr)
                        : String(dateStr || '').slice(0, 7);
                    if (pk !== periodKey) continue;
                    const d0 = String(dateStr || '').slice(0, 10);
                    if (asOf && d0 && d0 > asOf) continue;
                    const label = isRec
                        ? ('Tekrar ' + (i + 1) + '/' + n)
                        : ('Taksit ' + (i + 1) + '/' + n);
                    out.push(Object.assign({}, item, {
                        id: item.id + '_ins_' + i,
                        displayAmount: perAmount,
                        installmentLabel: label,
                        effectiveMonth: pk,
                        date: dateStr,
                        installmentIndex: i
                    }));
                }
            });
            const filtered = out.filter(function(e) {
                return typeof countsInPeriodTotals !== 'function' || countsInPeriodTotals(e);
            });
            return dedupePeriodExpenseRows(filtered);
        }

        /**
         * Aynı dönem içinde peşin + taksit / CSV çift kayıtlarını tekilleştirir.
         * Anahtar: kişi + tutar + normalize açıklama. Taksit/Tekrar satırı peşine tercih edilir.
         */
        function dedupePeriodExpenseRows(list) {
            if (!list || !list.length) return list || [];
            function normDesc(s) {
                s = String(s || '').toLocaleLowerCase('tr-TR')
                    .replace(/ı/g, 'i').replace(/İ/g, 'i')
                    .replace(/ş/g, 's').replace(/ğ/g, 'g')
                    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');
                s = s.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
                return s.slice(0, 36);
            }
            function isInstallmentLike(e) {
                const lab = String(e.installmentLabel || '');
                if (/taksit|tekrar/i.test(lab)) return true;
                if (e.id && String(e.id).indexOf('_ins_') >= 0) return true;
                return false;
            }
            function isPesinLike(e) {
                if (isInstallmentLike(e)) return false;
                return true;
            }
            function score(e) {
                let s = 0;
                if (isInstallmentLike(e)) s += 100;
                return s;
            }
            const groups = {};
            list.forEach(function(e, idx) {
                const amt = Math.round((Number(e.displayAmount) || 0) * 100);
                const person = String(e.person || '');
                const key = person + '|' + amt + '|' + normDesc(e.description || e.category || '');
                if (!groups[key]) groups[key] = [];
                groups[key].push({ e: e, idx: idx });
            });
            const keep = [];
            Object.keys(groups).forEach(function(key) {
                const arr = groups[key];
                if (arr.length === 1) {
                    keep.push(arr[0]);
                    return;
                }
                const hasInst = arr.some(function(x) { return isInstallmentLike(x.e); });
                const hasPesin = arr.some(function(x) { return isPesinLike(x.e); });
                // Sadece peşin + taksit çifti: taksiti tut
                if (hasInst && hasPesin) {
                    arr.sort(function(a, b) { return score(b.e) - score(a.e); });
                    keep.push(arr[0]);
                    return;
                }
                // Hepsi peşin veya hepsi taksit: gerçek tekrarlar, hepsini koru
                arr.forEach(function(x) { keep.push(x); });
            });
            keep.sort(function(a, b) { return a.idx - b.idx; });
            return keep.map(function(x) { return x.e; });
        }

        function buildClosedPeriodReportData(periodKey, opts) {
            opts = opts || {};
            const interim = !!opts.interim;
            const asOf = opts.asOfYmd ? String(opts.asOfYmd).slice(0, 10) : (interim ? ((typeof todayDateStr === 'function') ? todayDateStr() : new Date().toISOString().slice(0, 10)) : '');
            const label = (typeof formatPeriodLabel === 'function') ? formatPeriodLabel(periodKey) : periodKey;
            const list = getExpensesForPeriodKey(periodKey, interim ? asOf : '');
            const sum = function(arr, pred) {
                return (arr || []).filter(pred || function() { return true; })
                    .reduce(function(s, e) { return s + (Number(e.displayAmount) || 0); }, 0);
            };
            const isCard = function(e) {
                return typeof isCreditPayment === 'function' ? isCreditPayment(e.paymentType) : /kredi/i.test(String(e.paymentType || ''));
            };
            const isCash = function(e) {
                return typeof isCashPayment === 'function' ? isCashPayment(e.paymentType) : /nakit/i.test(String(e.paymentType || ''));
            };
            // Multinet: takvim ayı değil, bu ekstre döneminin tarih aralığındaki Multinet
            try {
                const allRaw = (typeof expenses !== 'undefined' && expenses) ? expenses : [];
                let pStart = '', pEnd = '';
                if (typeof getStatementPeriodForDate === 'function' && periodKey) {
                    const [yy, mm] = String(periodKey).split('-').map(Number);
                    const probe = yy + '-' + String(mm).padStart(2, '0') + '-15';
                    const pinfo = getStatementPeriodForDate(probe);
                    if (pinfo && pinfo.startDate && pinfo.endDate) {
                        const f = function(d) {
                            if (typeof formatYMD === 'function') return formatYMD(d);
                            return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
                        };
                        pStart = f(pinfo.startDate);
                        pEnd = f(pinfo.endDate);
                    }
                }
                allRaw.forEach(function(e) {
                    if (!e) return;
                    const pt = String(e.paymentType || '').toLocaleLowerCase('tr-TR');
                    if (pt.indexOf('multinet') < 0) return;
                    const d = String(e.date || '').slice(0, 10);
                    if (pStart && pEnd && (d < pStart || d > pEnd)) return;
                    if (!pStart && e.effectiveMonth && e.effectiveMonth !== periodKey) return;
                    multinetSum += Number(e.amount) || 0;
                    multinetN++;
                });
            } catch (_) {}
            const total = sum(list);
            const card = sum(list, isCard);
            const cash = sum(list, isCash);
            const bekir = sum(list, function(e) { return e.person === 'Bekir'; });
            const duygu = sum(list, function(e) { return e.person === 'Duygu'; });
            const bekirCard = sum(list, function(e) { return e.person === 'Bekir' && isCard(e); });
            const duyguCard = sum(list, function(e) { return e.person === 'Duygu' && isCard(e); });
            const bekirN = list.filter(function(e) { return e.person === 'Bekir'; }).length;
            const duyguN = list.filter(function(e) { return e.person === 'Duygu'; }).length;

            const byCat = {};
            const shopSubs = {};
            const billSubs = {};
            const vehicleSubs = {};
            let installSum = 0, recurSum = 0, cashCount = 0, cardCount = 0, multiSum = 0, multiN = 0;
            let onBehalfSum = 0, onBehalfN = 0;
            let multinetSum = 0, multinetN = 0;
            list.forEach(function(e) {
                let cat = e.category || 'Diğer';
                if (typeof isLegacyShopCategory === 'function' && isLegacyShopCategory(cat)) cat = 'Alışveriş';
                if (cat === 'E-ticaret' || e.isEcommerce) cat = 'Alışveriş';
                if (typeof isAlisverisCategory === 'function' && isAlisverisCategory(cat)) cat = 'Alışveriş';
                byCat[cat] = (byCat[cat] || 0) + (Number(e.displayAmount) || 0);
                if (cat === 'Alışveriş') {
                    const st = String(e.shopSubtype || '').trim() || 'Belirtilmedi';
                    const key = st + (e.isEcommerce ? ' · E-ticaret' : '');
                    shopSubs[key] = (shopSubs[key] || 0) + (Number(e.displayAmount) || 0);
                }
                if (cat === 'Faturalar') {
                    const bs = String(e.billSubtype || '').trim() || 'Belirtilmedi';
                    billSubs[bs] = (billSubs[bs] || 0) + (Number(e.displayAmount) || 0);
                }
                if (cat === 'Araç' || cat === 'Ulaşım') {
                    const vs = String(e.vehicleSubtype || '').trim() || 'Belirtilmedi';
                    vehicleSubs[vs] = (vehicleSubs[vs] || 0) + (Number(e.displayAmount) || 0);
                }
                const lab = String(e.installmentLabel || '');
                if (lab.indexOf('Tekrar') >= 0 || e.isRecurring) recurSum += Number(e.displayAmount) || 0;
                else if (lab.indexOf('Taksit') >= 0) installSum += Number(e.displayAmount) || 0;
                if (isCard(e)) cardCount++;
                if (isCash(e)) cashCount++;
                if (/multinet/i.test(String(e.paymentType || ''))) {
                    multiSum += Number(e.displayAmount) || 0;
                    multiN++;
                }
                if (e.isOnBehalf || e.onBehalf) {
                    onBehalfSum += Number(e.displayAmount) || 0;
                    onBehalfN++;
                }
            });
            const topCats = Object.keys(byCat).map(function(k) { return [k, byCat[k]]; })
                .sort(function(a, b) { return b[1] - a[1]; });

            const topItems = list.slice().sort(function(a, b) {
                return (Number(b.displayAmount) || 0) - (Number(a.displayAmount) || 0);
            }).slice(0, 15).map(function(e) {
                return {
                    desc: e.description || e.category || '-',
                    amount: Number(e.displayAmount) || 0,
                    date: String(e.date || '').slice(0, 10),
                    person: e.person || '',
                    cat: e.category || '',
                    pay: e.paymentType || ''
                };
            });

            // --- İşyeri / açıklama tekrarı ---
            function normMerchant(s) {
                s = String(s || '').toLocaleLowerCase('tr-TR')
                    .replace(/ı/g, 'i').replace(/İ/g, 'i')
                    .replace(/ş/g, 's').replace(/ğ/g, 'g')
                    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');
                s = s.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
                // kısa gürültü kelimeleri at
                s = s.replace(/\b(tr|as|san|tic|ltd|sti|a\.?s\.?|www|com|istanbul|ankara)\b/g, ' ').replace(/\s+/g, ' ').trim();
                return s.slice(0, 40) || 'diger';
            }
            const merchantMap = {};
            list.forEach(function(e) {
                const amt = Number(e.displayAmount) || 0;
                if (amt <= 0) return; // iadeleri frekansta sayma
                const key = normMerchant(e.description || e.category || '');
                if (!merchantMap[key]) merchantMap[key] = { key: key, count: 0, total: 0, sample: e.description || key };
                merchantMap[key].count++;
                merchantMap[key].total += amt;
            });
            const topMerchants = Object.keys(merchantMap).map(function(k) { return merchantMap[k]; })
                .filter(function(m) { return m.count >= 1; })
                .sort(function(a, b) {
                    if (b.count !== a.count) return b.count - a.count;
                    return b.total - a.total;
                });
            const repeatMerchants = topMerchants.filter(function(m) { return m.count >= 2; }).slice(0, 20);

            // --- Alışkanlık anahtar kelimeleri ---
            const HABITS = [
                { id: 'dondurma', label: 'dondurma / tatlı', re: /dondurm|mado|mara[sş].*dondur|algida|magnum|cornetto/i },
                { id: 'sigara', label: 'sigara / tütün', re: /sigara|tobacco|marlboro|parliament|winston|camel|lm\b|tekel/i },
                { id: 'kahve', label: 'kahve / kafe', re: /kahve|starbucks|coffee|gloria|espresso|cafe|kafe/i },
                { id: 'yemek', label: 'yemek / restoran', re: /pide|kebap|kebap|restoran|yemek|kofte|k[oö]fte|burger|pizza|doner|d[oö]ner|lahmacun|cigkofte/i },
                { id: 'market', label: 'market / migros', re: /migros|a101|bim\b|sok\b|şok|carrefour|macro|gim at|gimat|market/i },
                { id: 'akaryakit', label: 'akaryakıt / petrol', re: /shell|opet|bp\b|petrol|akaryakit|akaryakıt|total|po\b|aytemiz|demsa/i },
                { id: 'online', label: 'online alışveriş', re: /trendyol|hepsiburada|n11|amazon|pazarama|ciceksepeti|[cç]ilek/i },
                { id: 'ulasim', label: 'ulaşım / otopark', re: /otopark|uber|bitaksi|obi?let|bubilet|tav\b|telefer/i },
                { id: 'saglik', label: 'sağlık / eczane', re: /eczane|medical|hastane|lab\b|freestyle|abbott/i },
                { id: 'abone', label: 'dijital abonelik', re: /youtube|netflix|spotify|apple\.com|tod\s?tv|disney|prime/i }
            ];
            const habits = HABITS.map(function(h) {
                let count = 0, total = 0;
                list.forEach(function(e) {
                    const blob = (e.description || '') + ' ' + (e.category || '') + ' ' + (e.shopSubtype || '');
                    if (!h.re.test(blob)) return;
                    const a = Number(e.displayAmount) || 0;
                    if (a <= 0) return;
                    count++;
                    total += a;
                });
                return { id: h.id, label: h.label, count: count, total: total };
            }).filter(function(h) { return h.count > 0; })
              .sort(function(a, b) { return b.count - a.count || b.total - a.total; });

            // --- Haftanın günü ---
            const dayNames = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
            const byDow = {};
            list.forEach(function(e) {
                const ds = String(e.date || '').slice(0, 10);
                if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) return;
                const dt = new Date(ds + 'T12:00:00');
                if (isNaN(dt.getTime())) return;
                const dn = dayNames[dt.getDay()];
                if (!byDow[dn]) byDow[dn] = { count: 0, total: 0 };
                byDow[dn].count++;
                byDow[dn].total += Number(e.displayAmount) || 0;
            });
            const topDow = Object.keys(byDow).map(function(k) {
                return { day: k, count: byDow[k].count, total: byDow[k].total };
            }).sort(function(a, b) { return b.total - a.total; });

            // --- Tutar dilimleri ---
            let nSmall = 0, nMid = 0, nBig = 0, sSmall = 0, sMid = 0, sBig = 0;
            list.forEach(function(e) {
                const a = Math.abs(Number(e.displayAmount) || 0);
                if (a < 200) { nSmall++; sSmall += a; }
                else if (a < 1000) { nMid++; sMid += a; }
                else { nBig++; sBig += a; }
            });

            // Önceki dönem
            let prevKey = '';
            try {
                const parts = String(periodKey).split('-').map(Number);
                if (parts.length === 2) {
                    let y = parts[0], m = parts[1] - 1;
                    if (m < 1) { m = 12; y -= 1; }
                    prevKey = y + '-' + String(m).padStart(2, '0');
                }
            } catch (_) {}
            const prevList = prevKey ? getExpensesForPeriodKey(prevKey, '') : [];
            const prevTotal = sum(prevList);
            const prevCard = sum(prevList, isCard);
            const delta = total - prevTotal;
            const deltaPct = prevTotal > 0 ? Math.round(delta / prevTotal * 100) : null;
            const deltaCard = card - prevCard;
            const deltaCardPct = prevCard > 0 ? Math.round(deltaCard / prevCard * 100) : null;

            const target = Number(typeof monthlyBudgetTarget !== 'undefined' ? monthlyBudgetTarget : 0) || 0;
            const targetPct = target > 0 ? Math.round(card / target * 100) : null;

            let daysInScope = 30;
            try {
                if (typeof getStatementPeriodForDate === 'function') {
                    const [yy, mm] = String(periodKey).split('-').map(Number);
                    const endProbe = new Date(yy, mm - 1, 15);
                    const p = getStatementPeriodForDate(endProbe);
                    if (p && p.startDate && p.endDate) {
                        const start = p.startDate;
                        const end = interim && asOf ? (typeof parseYMD === 'function' ? parseYMD(asOf) : new Date(asOf)) : p.endDate;
                        if (start && end) {
                            daysInScope = Math.max(1, Math.round((end - start) / 86400000) + 1);
                        }
                    }
                }
            } catch (_) {}
            const dailyAvg = total / daysInScope;
            const projected = interim ? Math.round(dailyAvg * 30) : total;
            const avgTx = list.length ? total / list.length : 0;

            const payload = {
                periodKey: periodKey,
                label: label,
                interim: interim,
                asOfYmd: interim ? asOf : '',
                generatedAt: new Date().toISOString(),
                source: 'local',
                totals: {
                    total: total, card: card, cash: cash,
                    bekir: bekir, duygu: duygu, bekirCard: bekirCard, duyguCard: duyguCard,
                    bekirN: bekirN, duyguN: duyguN,
                    count: list.length, installSum: installSum, recurSum: recurSum,
                    cardCount: cardCount, cashCount: cashCount,
                    multiSum: multiSum, multiN: multiN,
                    onBehalfSum: onBehalfSum, onBehalfN: onBehalfN,
                    multinetSum: multinetSum, multinetN: multinetN,
                    avgTx: avgTx
                },
                topCategories: topCats,
                shopBreakdown: shopSubs,
                billBreakdown: billSubs,
                vehicleBreakdown: vehicleSubs,
                topItems: topItems,
                topMerchants: topMerchants.slice(0, 25),
                repeatMerchants: repeatMerchants,
                habits: habits,
                byDow: topDow,
                buckets: { nSmall: nSmall, nMid: nMid, nBig: nBig, sSmall: sSmall, sMid: sMid, sBig: sBig },
                compare: { prevKey: prevKey, prevTotal: prevTotal, prevCard: prevCard, delta: delta, deltaPct: deltaPct, deltaCard: deltaCard, deltaCardPct: deltaCardPct },
                budget: { target: target, cardSpent: card, pct: targetPct },
                pace: { daysInScope: daysInScope, dailyAvg: dailyAvg, projected: projected }
            };
            payload.text = buildClosedPeriodReportText(payload);
            return payload;
        }

        function buildClosedPeriodReportText(d) {
            const fmt = function(n) { return Math.round(Number(n) || 0).toLocaleString('tr-TR'); };
            const lines = [];
            const t = d.totals || {};
            const c = d.compare || {};
            const b = d.budget || {};
            const p = d.pace || {};
            const buckets = d.buckets || {};

            lines.push('YUVAM DÖNEM ANALİZ RAPORU');
            if ((d.multinetSum || 0) > 0) {
                lines.push('Multinet: ' + Math.round(d.multinetSum).toLocaleString('tr-TR') + ' TL (' + (d.multinetN || 0) + ' kayıt · dönem toplamına dahil değil)');
            } else {
                lines.push('Multinet: 0 TL');
            }

            lines.push(d.interim ? 'Tür: ARA RAPOR (dönem henüz kapanmadı)' : 'Tür: KAPANIŞ RAPORU');
            lines.push('Dönem: ' + (d.label || d.periodKey || ''));
            if (d.interim && d.asOfYmd) lines.push('Veri kesim tarihi: ' + d.asOfYmd);
            if (d.generatedAt) lines.push('Rapor oluşturulma: ' + String(d.generatedAt).slice(0, 16).replace('T', ' '));
            lines.push('');
            lines.push('────────────────────────────────');
            lines.push('1) YÖNETİCİ ÖZETİ');
            lines.push('────────────────────────────────');
            lines.push('Toplam harcama: ' + fmt(t.total) + ' TL');
            lines.push('İşlem adedi: ' + (t.count || 0) + ' · Ortalama işlem: ' + fmt(t.avgTx) + ' TL');
            lines.push('Kredi kartı: ' + fmt(t.card) + ' TL (' + (t.cardCount || 0) + ' işlem)');
            lines.push('Nakit: ' + fmt(t.cash) + ' TL (' + (t.cashCount || 0) + ' işlem)');
            if (t.total > 0) {
                lines.push('KK payı %' + Math.round((t.card / t.total) * 100) + ' · Nakit payı %' + Math.round((t.cash / t.total) * 100));
            }
            lines.push('Bekir: ' + fmt(t.bekir) + ' TL / ' + (t.bekirN || 0) + ' işlem (KK ' + fmt(t.bekirCard) + ' TL)');
            lines.push('Duygu: ' + fmt(t.duygu) + ' TL / ' + (t.duyguN || 0) + ' işlem (KK ' + fmt(t.duyguCard) + ' TL)');
            if (t.installSum) lines.push('Bu dilimdeki taksit payı: ' + fmt(t.installSum) + ' TL');
            if (t.recurSum) lines.push('Tekrarlı ödeme payı: ' + fmt(t.recurSum) + ' TL');
            if (t.multiN) lines.push('Multinet: ' + (t.multiN) + ' işlem · ' + fmt(t.multiSum) + ' TL (dönem toplamına dahil değilse ayrıca izlenir)');
            if (t.onBehalfN) lines.push('Başkası adına: ' + t.onBehalfN + ' işlem · ' + fmt(t.onBehalfSum) + ' TL');
            if (p.daysInScope) {
                lines.push('Kapsamdaki gün: ~' + p.daysInScope + ' · Günlük ortalama: ' + fmt(p.dailyAvg) + ' TL');
                if (d.interim && p.projected) {
                    lines.push('Aynı tempoyla dönem sonu tahmini: ~' + fmt(p.projected) + ' TL');
                }
            }
            lines.push('');
            lines.push('────────────────────────────────');
            lines.push('2) TEKRARLAYAN HARCAMALAR (alışkanlık)');
            lines.push('────────────────────────────────');
            lines.push('Aynı veya benzer açıklamayla birden fazla kez yapılan işlemler:');
            if (d.repeatMerchants && d.repeatMerchants.length) {
                d.repeatMerchants.forEach(function(m, i) {
                    lines.push((i + 1) + ') "' + (m.sample || m.key) + '" → ' + m.count + ' kez · toplam ' + fmt(m.total) + ' TL · ort. ' + fmt(m.total / m.count) + ' TL');
                });
            } else {
                lines.push('Bu dönemde 2+ kez tekrarlayan belirgin işyeri bulunamadı (az veri veya her açıklama tekil).');
            }
            lines.push('');
            lines.push('Tema bazlı özet (açıklama metninden):');
            if (d.habits && d.habits.length) {
                d.habits.forEach(function(h) {
                    lines.push('• ' + h.label + ': ' + h.count + ' kez · ' + fmt(h.total) + ' TL');
                });
            } else {
                lines.push('Tanımlı tema (dondurma, sigara, kahve, market…) eşleşmedi. Açıklamalara anahtar kelime ekledikçe burası zenginleşir.');
            }
            lines.push('');
            lines.push('────────────────────────────────');
            lines.push('3) KATEGORİ VE ALT KIRILIM');
            lines.push('────────────────────────────────');
            if (d.topCategories && d.topCategories.length) {
                d.topCategories.forEach(function(pair, i) {
                    const share = t.total > 0 ? Math.round(pair[1] / t.total * 100) : 0;
                    lines.push((i + 1) + '. ' + pair[0] + ': ' + fmt(pair[1]) + ' TL (%' + share + ')');
                });
            } else {
                lines.push('Kategori verisi yok.');
            }
            const shopKeys = Object.keys(d.shopBreakdown || {});
            if (shopKeys.length) {
                lines.push('');
                lines.push('Alışveriş alt türleri:');
                shopKeys.sort(function(a, b) { return (d.shopBreakdown[b] || 0) - (d.shopBreakdown[a] || 0); }).forEach(function(k) {
                    lines.push('  • ' + k + ': ' + fmt(d.shopBreakdown[k]) + ' TL');
                });
            }
            const billKeys = Object.keys(d.billBreakdown || {});
            if (billKeys.length) {
                lines.push('');
                lines.push('Fatura türleri:');
                billKeys.sort(function(a, b) { return (d.billBreakdown[b] || 0) - (d.billBreakdown[a] || 0); }).forEach(function(k) {
                    lines.push('  • ' + k + ': ' + fmt(d.billBreakdown[k]) + ' TL');
                });
            }
            const vehKeys = Object.keys(d.vehicleBreakdown || {});
            if (vehKeys.length) {
                lines.push('');
                lines.push('Araç alt türleri:');
                vehKeys.sort(function(a, b) { return (d.vehicleBreakdown[b] || 0) - (d.vehicleBreakdown[a] || 0); }).forEach(function(k) {
                    lines.push('  • ' + k + ': ' + fmt(d.vehicleBreakdown[k]) + ' TL');
                });
            }
            lines.push('');
            lines.push('────────────────────────────────');
            lines.push('4) EN YÜKSEK KALEMLER');
            lines.push('────────────────────────────────');
            if (d.topItems && d.topItems.length) {
                d.topItems.forEach(function(it, i) {
                    lines.push((i + 1) + '. ' + it.desc + ' — ' + fmt(it.amount) + ' TL');
                    lines.push('    ' + (it.date || '') + (it.person ? ' · ' + it.person : '') + (it.cat ? ' · ' + it.cat : '') + (it.pay ? ' · ' + it.pay : ''));
                });
            } else {
                lines.push('Kayıt yok.');
            }
            lines.push('');
            lines.push('────────────────────────────────');
            lines.push('5) SIKLIK SIRASI (tüm işyerleri)');
            lines.push('────────────────────────────────');
            if (d.topMerchants && d.topMerchants.length) {
                d.topMerchants.slice(0, 20).forEach(function(m, i) {
                    lines.push((i + 1) + ') ' + (m.sample || m.key) + ' — ' + m.count + ' adet · ' + fmt(m.total) + ' TL');
                });
            } else {
                lines.push('Veri yok.');
            }
            lines.push('');
            lines.push('────────────────────────────────');
            lines.push('6) ZAMAN VE TUTAR DAĞILIMI');
            lines.push('────────────────────────────────');
            if (d.byDow && d.byDow.length) {
                lines.push('Haftanın gününe göre harcama:');
                d.byDow.forEach(function(x) {
                    lines.push('• ' + x.day + ': ' + fmt(x.total) + ' TL (' + x.count + ' işlem)');
                });
                if (d.byDow[0]) {
                    lines.push('En yoğun gün: ' + d.byDow[0].day + ' (' + fmt(d.byDow[0].total) + ' TL).');
                }
            }
            lines.push('');
            lines.push('Tutar dilimleri:');
            lines.push('• 0–200 TL: ' + (buckets.nSmall || 0) + ' işlem · ' + fmt(buckets.sSmall) + ' TL');
            lines.push('• 200–1000 TL: ' + (buckets.nMid || 0) + ' işlem · ' + fmt(buckets.sMid) + ' TL');
            lines.push('• 1000+ TL: ' + (buckets.nBig || 0) + ' işlem · ' + fmt(buckets.sBig) + ' TL');
            lines.push('');
            lines.push('────────────────────────────────');
            lines.push('7) ÖNCEKİ DÖNEM KARŞILAŞTIRMASI');
            lines.push('────────────────────────────────');
            if (c.prevTotal > 0 && c.deltaPct != null) {
                lines.push('Önceki dönem toplamı: ' + fmt(c.prevTotal) + ' TL');
                lines.push('Fark: ' + fmt(Math.abs(c.delta)) + ' TL ' + (c.delta >= 0 ? 'artış' : 'azalış') + ' (%' + Math.abs(c.deltaPct) + ')');
                if (c.prevCard > 0 && c.deltaCardPct != null) {
                    lines.push('KK farkı: ' + fmt(Math.abs(c.deltaCard)) + ' TL (%' + Math.abs(c.deltaCardPct) + ')');
                }
                if (c.deltaPct >= 15) lines.push('Yorum: Harcama temposu belirgin yükselmiş.');
                else if (c.deltaPct <= -10) lines.push('Yorum: Harcama gerilemiş; disiplin korunmuş.');
                else lines.push('Yorum: Değişim ılımlı.');
            } else {
                lines.push('Karşılaştırma için yeterli önceki dönem verisi yok (ilk dönemler normal).');
            }
            lines.push('');
            lines.push('────────────────────────────────');
            lines.push('8) BÜTÇE HEDEFİ (KK)');
            lines.push('────────────────────────────────');
            if (b.target > 0) {
                lines.push('Hedef: ' + fmt(b.target) + ' TL');
                lines.push('Gerçekleşen KK: ' + fmt(b.cardSpent) + ' TL (%' + (b.pct != null ? b.pct : 0) + ')');
                if (b.pct != null && b.pct > 100) lines.push('Durum: Hedef aşılmış.');
                else if (b.pct != null && b.pct >= 90) lines.push('Durum: Hedefe çok yakın.');
                else lines.push('Durum: Hedef bandı içinde.');
            } else {
                lines.push('Tanımlı KK hedefi yok. Ayarlar’dan hedef koymak bu bölümü anlamlı kılar.');
            }
            lines.push('');
            lines.push('────────────────────────────────');
            lines.push('9) DANIŞMAN NOTLARI VE ÖNERİLER');
            lines.push('────────────────────────────────');
            const tips = [];
            if (d.habits && d.habits.length) {
                d.habits.slice(0, 4).forEach(function(h) {
                    if (h.count >= 3) {
                        tips.push(h.label + ' için bu dönemde ' + h.count + ' işlem ve ' + fmt(h.total) + ' TL görünüyor; sıklığı bilinçli tutmak tasarruf alanı açabilir.');
                    } else if (h.count >= 1) {
                        tips.push(h.label + ': ' + h.count + ' kez · ' + fmt(h.total) + ' TL.');
                    }
                });
            }
            if (d.repeatMerchants && d.repeatMerchants[0] && d.repeatMerchants[0].count >= 3) {
                const m = d.repeatMerchants[0];
                tips.push('En sık tekrar: "' + (m.sample || m.key) + '" (' + m.count + ' kez). Bu kalemi aylık limit ile sınırlamayı deneyin.');
            }
            if (d.topCategories && d.topCategories[0] && t.total > 0 && d.topCategories[0][1] / t.total >= 0.35) {
                tips.push('“' + d.topCategories[0][0] + '” tek başına dönemin %' + Math.round(d.topCategories[0][1] / t.total * 100) + 'ini oluşturuyor.');
            }
            if (t.installSum + t.recurSum > 0 && t.total > 0 && (t.installSum + t.recurSum) / t.total >= 0.25) {
                tips.push('Taksit + tekrarlı yük toplamın dörtte birinden fazla; yeni taksit öncesi sabit yükü kontrol edin.');
            }
            if (d.interim && p.projected && b.target > 0 && p.projected > b.target) {
                tips.push('Mevcut tempo dönem sonunda KK hedefini aşabilir.');
            }
            if (c.deltaPct != null && c.deltaPct >= 20) {
                tips.push('Önceki döneme göre %' + c.deltaPct + ' artış var; tek seferlik mi yapısal mı ayırın.');
            }
            if (d.byDow && d.byDow[0] && t.total > 0 && d.byDow[0].total / t.total >= 0.25) {
                tips.push('Harcamanın büyük kısmı ' + d.byDow[0].day + ' gününe yığılmış.');
            }
            if (!tips.length) {
                tips.push('Olağandışı sapma yok. Açıklamalara “sigara”, “dondurma” gibi net kelimeler yazdıkça tema analizi güçlenir.');
            }
            tips.forEach(function(x, i) { lines.push((i + 1) + ') ' + x); });
            lines.push('');
            lines.push('────────────────────────────────');
            lines.push(d.interim
                ? 'Not: Ara rapordur; dönem kapanınca nihai kapanış raporu ayrıca üretilir. Yenile ile güncellenir.'
                : 'Not: Bilgilendirme amaçlıdır; kesin banka ekstresi yerine geçmez.');
            return lines.join('\n');
        }

        window._closedPeriodReportsCache = window._closedPeriodReportsCache || {};

        window.ensureClosedPeriodReports = async function(force) {
            const listEl = document.getElementById('periodCloseReportsList');
            try {
                const current = (typeof getCurrentPeriod === 'function') ? getCurrentPeriod() : '';
                const today = (typeof todayDateStr === 'function') ? todayDateStr() : new Date().toISOString().slice(0, 10);
                const keys = (typeof getPreviousPeriodKeys === 'function') ? getPreviousPeriodKeys(6) : [];
                const closed = [];
                (keys || []).forEach(function(k) {
                    if (k && k !== current && closed.indexOf(k) < 0) closed.push(k);
                });
                closed.sort().reverse();

                // Kapanmış dönemler: otomatik (yoksa üret); force ile yeniden
                for (let i = 0; i < closed.length; i++) {
                    const pk = closed[i];
                    if (!force && window._closedPeriodReportsCache[pk] && !window._closedPeriodReportsCache[pk].interim) continue;
                    let loaded = null;
                    try {
                        if (typeof db !== 'undefined' && db) {
                            const snap = await db.collection('settings').doc('periodReport_' + pk).get();
                            if (snap.exists) loaded = snap.data();
                        }
                    } catch (_) {}
                    if (!loaded || force) {
                        const data = buildClosedPeriodReportData(pk, { interim: false });
                        window._closedPeriodReportsCache[pk] = data;
                        try {
                            if (typeof db !== 'undefined' && db) {
                                await db.collection('settings').doc('periodReport_' + pk).set(data, { merge: true });
                            }
                        } catch (err) { console.warn('period report save', err); }
                    } else {
                        window._closedPeriodReportsCache[pk] = loaded;
                    }
                }

                // Aktif dönem: Yenile (force) veya ilk açılışta ara rapor
                if (current) {
                    if (force || !window._closedPeriodReportsCache[current]) {
                        const data = buildClosedPeriodReportData(current, { interim: true, asOfYmd: today });
                        window._closedPeriodReportsCache[current] = data;
                        try {
                            if (typeof db !== 'undefined' && db && force) {
                                await db.collection('settings').doc('periodReport_' + current + '_interim').set(data, { merge: true });
                            }
                        } catch (_) {}
                    }
                }

                renderClosedPeriodReportsList();
                if (force && typeof showToast === 'function') showToast('Dönem raporları güncellendi', 'success');
            } catch (err) {
                console.warn('ensureClosedPeriodReports', err);
                if (listEl) listEl.innerHTML = '<p class="text-sm text-slate-400 font-semibold text-center py-3">Raporlar yüklenemedi</p>';
            }
        };

        window.renderClosedPeriodReportsList = function() {
            const listEl = document.getElementById('periodCloseReportsList');
            if (!listEl) return;
            const cache = window._closedPeriodReportsCache || {};
            const keys = Object.keys(cache).sort().reverse();
            if (!keys.length) {
                listEl.innerHTML = '<p class="text-sm text-slate-400 font-semibold text-center py-4">Henüz rapor yok. Yenile ile aktif dönem ara raporu oluşturabilirsiniz.</p>';
                return;
            }
            listEl.innerHTML = keys.map(function(pk) {
                const r = cache[pk] || {};
                const tot = r.totals && r.totals.total != null ? Math.round(r.totals.total).toLocaleString('tr-TR') + ' TL' : '—';
                const lab = r.label || pk;
                const badge = r.interim
                    ? '<span class="text-[9px] font-black text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded-md">ARA</span>'
                    : '<span class="text-[9px] font-black text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded-md">KAPANIŞ</span>';
                const sub = r.interim
                    ? ('Ara rapor · ' + (r.asOfYmd || '') + ' tarihine kadar')
                    : 'Kapanış raporu · yerel analiz';
                return '<button type="button" onclick="openPeriodCloseReportModal(\'' + String(pk).replace(/'/g, "\\'") + '\')" class="w-full text-left p-3 rounded-xl bg-slate-50 hover:bg-indigo-50 border border-slate-100 flex justify-between items-center gap-3">' +
                    '<div class="min-w-0">' +
                    '<p class="text-sm font-black text-slate-800 truncate flex items-center gap-2 flex-wrap">' + (typeof escapeHtml === 'function' ? escapeHtml(lab) : lab) + ' ' + badge + '</p>' +
                    '<p class="text-[11px] text-slate-400 font-semibold">' + (typeof escapeHtml === 'function' ? escapeHtml(sub) : sub) + '</p></div>' +
                    '<span class="text-sm font-black text-indigo-700 whitespace-nowrap">' + tot + '</span></button>';
            }).join('');
        };

        window.openPeriodCloseReportModal = function(periodKey) {
            const modal = document.getElementById('periodCloseReportModal');
            const title = document.getElementById('periodCloseReportTitle');
            const sub = document.getElementById('periodCloseReportSub');
            const body = document.getElementById('periodCloseReportBody');
            if (!modal || !body) return;
            let r = (window._closedPeriodReportsCache || {})[periodKey];
            if (!r) {
                const current = (typeof getCurrentPeriod === 'function') ? getCurrentPeriod() : '';
                r = buildClosedPeriodReportData(periodKey, { interim: periodKey === current });
                window._closedPeriodReportsCache[periodKey] = r;
            }
            if (title) title.textContent = r.interim ? 'Ara Dönem Raporu' : 'Dönem Kapanış Raporu';
            if (sub) {
                sub.textContent = (r.label || periodKey) + (r.interim && r.asOfYmd ? ' · ' + r.asOfYmd + ' tarihine kadar' : '') +
                    (r.generatedAt ? ' · ' + String(r.generatedAt).slice(0, 16).replace('T', ' ') : '');
            }
            const text = r.text || '';
            body.innerHTML = text.split(/\n/).map(function(line) {
                const t = line.trim();
                if (!t) return '<div class="h-2"></div>';
                if (/^[1-6]\)/.test(t) || t.indexOf('Sayın') === 0) {
                    return '<p class="font-black text-slate-900 mt-2">' + escapeHtml(line) + '</p>';
                }
                if (/^\d+\./.test(t) || t.charAt(0) === '•') {
                    return '<p class="font-semibold text-slate-800 pl-1">' + escapeHtml(line) + '</p>';
                }
                return '<p class="text-slate-700">' + escapeHtml(line) + '</p>';
            }).join('');
            body.scrollTop = 0;
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            try { if (typeof wireAllModalBackdropClose === 'function') wireAllModalBackdropClose(); } catch (_) {}
        };

        window.closePeriodCloseReportModal = function() {
            const modal = document.getElementById('periodCloseReportModal');
            if (!modal) return;
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        };


        window.renderMonthlyReports = function() {
            try { updateStatsPanel(); } catch (_) {}
            try { renderPeriodLiveSummary(); } catch (_) {}
            try {
                if (typeof ensureClosedPeriodReports === 'function') ensureClosedPeriodReports(false);
            } catch (_) {}
        };

        window.markCardStatementUnpaid = async function(statementId) {
            const stmt = (cardStatements || []).find(s => s.id === statementId);
            if (!stmt) {
                showToast('Ekstre kaydı bulunamadı', 'error');
                return;
            }
            const key = String(stmt.person || '').toLowerCase() === 'bekir' ? 'bekir' : 'duygu';
            const label = key === 'bekir' ? 'Bekir' : 'Duygu';
            if (!confirm(label + ' ekstre kaydı ödenmedi yapılsın mı?\nBorç ana sayfada tekrar görünecek.')) return;
            try {
                const dueDate = stmt.dueDate || (typeof getAutoCardDueDate === 'function' ? getAutoCardDueDate() : '');
                const debt = {
                    amount: Number(stmt.amount) || 0,
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
                await db.collection('cardStatements').doc(statementId).delete();
                renderCardDebtUI(key);
                if (typeof renderBudgetInfo === 'function') renderBudgetInfo();
                renderCardStatements('bekir');
                renderCardStatements('duygu');
                showToast(label + ' borcu ödenmedi · ana sayfada', 'success');
                logActivity('Diğer', 'Ekstre ödenmedi yapıldı', label + ' · ' + debt.amount + ' TL');
            } catch (err) {
                console.error(err);
                showToast(friendlyFirebaseError(err), 'error');
            }
        };

        window.deleteCardStatement = async function(statementId) {
            const stmt = (cardStatements || []).find(s => s.id === statementId);
            if (!stmt) {
                showToast('Ekstre kaydı bulunamadı', 'error');
                return;
            }
            const label = String(stmt.person || '').toLowerCase() === 'bekir' ? 'Bekir' : 'Duygu';
            if (!confirm(label + ' ekstre kaydı silinsin mi?\n(Borç ana sayfaya dönmez, sadece kayıt silinir)')) return;
            try {
                await db.collection('cardStatements').doc(statementId).delete();
                renderCardStatements('bekir');
                renderCardStatements('duygu');
                showToast('Ekstre kaydı silindi', 'info');
                logActivity('Diğer', 'Ekstre kaydı silindi', label + ' · ' + (stmt.amount || 0) + ' TL');
            } catch (err) {
                console.error(err);
                showToast(friendlyFirebaseError(err), 'error');
            }
        };

        /** Multinet dönemi: ayın 1'i → sonraki ayın 1'i (takvim ayı) */
        function getMultinetMonthRange(refDate) {
            const d = refDate ? new Date(refDate) : new Date();
            const y = d.getFullYear();
            const m = d.getMonth(); // 0-based
            const start = y + '-' + String(m + 1).padStart(2, '0') + '-01';
            let ny = y, nm = m + 1;
            if (nm > 11) { nm = 0; ny += 1; }
            const end = ny + '-' + String(nm + 1).padStart(2, '0') + '-01';
            const monthNames = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
            return {
                start: start,
                end: end, // exclusive
                label: monthNames[m] + ' ' + y,
                key: y + '-' + String(m + 1).padStart(2, '0')
            };
        }

        function isInMultinetMonth(dateStr, range) {
            const d = String(dateStr || '').slice(0, 10);
            if (!d || !range) return false;
            return d >= range.start && d < range.end;
        }


        window.openOnBehalfHistoryModal = function() {
            const modal = document.getElementById('onBehalfHistoryModal');
            const body = document.getElementById('onBehalfHistoryBody');
            const totalEl = document.getElementById('onBehalfHistoryTotal');
            if (!modal || !body) return;
            const rows = [];
            try {
                const list = (typeof expenses !== 'undefined' && expenses) ? expenses : [];
                list.forEach(function(item) {
                    if (!item || !(item.isOnBehalf || item.onBehalf)) return;
                    let schedule = [];
                    try {
                        if (typeof expandOnBehalfSchedule === 'function') {
                            schedule = expandOnBehalfSchedule(item) || [];
                        }
                    } catch (_) { schedule = []; }
                    if (!schedule.length) {
                        const map = item.onBehalfReimbursedByMonth || {};
                        const mk = String(item.date || '').slice(0, 7);
                        const done = !!(item.onBehalfReimbursed || map[mk]);
                        if (done) {
                            schedule = [{
                                expenseId: item.id,
                                date: String(item.date || '').slice(0, 10),
                                monthKey: mk,
                                displayAmount: Number(item.amount) || 0,
                                description: item.description,
                                person: item.person,
                                category: item.category,
                                onBehalfOf: item.onBehalfOf,
                                reimbursed: true
                            }];
                        }
                    }
                    schedule.forEach(function(r) {
                        if (r && r.reimbursed) rows.push(r);
                    });
                });
            } catch (err) {
                console.warn('onBehalf history', err);
            }
            rows.sort(function(a, b) {
                return String(b.date || '').localeCompare(String(a.date || ''));
            });
            const sum = rows.reduce(function(s, e) { return s + (Number(e.displayAmount) || 0); }, 0);
            if (totalEl) totalEl.textContent = Math.round(sum).toLocaleString('tr-TR') + ' TL · ' + rows.length + ' kayıt';
            if (!rows.length) {
                body.innerHTML = '<p class="text-sm text-slate-400 font-medium text-center py-8">Henüz geri alınmış borç yok</p>';
            } else {
                body.innerHTML = rows.map(function(e) {
                    const amt = Math.round(Number(e.displayAmount) || 0).toLocaleString('tr-TR');
                    const d = (typeof formatDateTR === 'function') ? formatDateTR(String(e.date || '').slice(0, 10)) : String(e.date || '').slice(0, 10);
                    const who = escapeHtml(e.onBehalfOf || 'Başkası');
                    const sub = [
                        d,
                        e.monthKey || '',
                        who,
                        e.person ? ('ödeyen ' + e.person) : '',
                        e.category || ''
                    ].filter(Boolean).join(' · ');
                    return '<div class="report-row report-multinet">' +
                        '<div class="min-w-0">' +
                        '<p class="report-title truncate">' + escapeHtml(e.description || e.category || 'Ödeme') + '</p>' +
                        '<p class="report-sub">' + escapeHtml(sub) + '</p>' +
                        '</div>' +
                        '<div class="shrink-0 text-right">' +
                        '<p class="report-amt text-emerald-700">' + amt + ' TL</p>' +
                        '<p class="text-[10px] font-bold text-emerald-600 mt-0.5">Alındı</p>' +
                        '</div></div>';
                }).join('');
            }
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            try { if (typeof wireAllModalBackdropClose === 'function') wireAllModalBackdropClose(); } catch (_) {}
        };

        window.closeOnBehalfHistoryModal = function() {
            const modal = document.getElementById('onBehalfHistoryModal');
            if (!modal) return;
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        };

        window.renderMultinetReport = function() {
            const box = document.getElementById('multinetStatements');
            const totalEl = document.getElementById('multinetPeriodTotal');
            if (!box) return;
            if (totalEl) totalEl.textContent = '0 TL';
            box.innerHTML = '';
            const range = getMultinetMonthRange(new Date());
            let list = [];
            try {
                list = (typeof getProcessedExpenses === 'function') ? getProcessedExpenses() : [];
            } catch (_) { list = []; }
            const rows = list.filter(function(e) {
                if (!e) return false;
                if (typeof isMultinetPayment === 'function') {
                    if (!isMultinetPayment(e.paymentType)) return false;
                } else if (String(e.paymentType || '').toLocaleLowerCase('tr-TR').indexOf('multinet') < 0) {
                    return false;
                }
                return isInMultinetMonth(e.date, range);
            }).sort(function(a, b) {
                return String(b.date || '').localeCompare(String(a.date || ''));
            });
            const sum = rows.reduce(function(s, e) { return s + (Number(e.displayAmount) || 0); }, 0);
            if (totalEl) totalEl.textContent = Math.round(sum).toLocaleString('tr-TR') + ' TL';
            if (!rows.length) {
                box.innerHTML = '<p class="text-xs text-slate-400 font-semibold text-center py-4">' +
                    escapeHtml(range.label) + ' (1\'i–sonraki 1) Multinet harcaması yok</p>';
                return;
            }
            let html = '<p class="text-[10px] text-slate-400 font-semibold mb-2">' + escapeHtml(range.label) +
                ' · ' + formatDateTR(range.start) + ' – ' + formatDateTR(range.end) + ' (hariç)</p>';
            html += rows.map(function(e) {
                const amt = (Number(e.displayAmount) || 0).toLocaleString('tr-TR');
                const d = (typeof formatDateTR === 'function') ? formatDateTR(String(e.date || '').slice(0, 10)) : String(e.date || '').slice(0, 10);
                return '<div class="report-row report-multinet">' +
                    '<div class="min-w-0">' +
                    '<p class="report-title truncate">' + escapeHtml(e.description || e.category || 'Alışveriş') + '</p>' +
                    '<p class="report-sub">' + escapeHtml(d) +
                    (e.person ? (' · ' + escapeHtml(e.person)) : '') +
                    (e.category ? (' · ' + escapeHtml(e.category)) : '') + '</p>' +
                    '</div>' +
                    '<p class="report-amt text-emerald-700 shrink-0">' + amt + ' TL</p>' +
                    '</div>';
            }).join('');
            box.innerHTML = html;
        };

                window.renderOnBehalfReport = function() {
            const box = document.getElementById('onBehalfStatements');
            const totalEl = document.getElementById('onBehalfPendingTotal');
            if (!box) return;
            let pending = [];
            try {
                const fn = (typeof getDueOnBehalfReceivables === 'function')
                    ? getDueOnBehalfReceivables
                    : (window.getDueOnBehalfReceivables);
                if (typeof fn === 'function') pending = fn() || [];
            } catch (err) {
                console.warn('getDueOnBehalfReceivables', err);
                pending = [];
            }
            // Yedek: expenses içinde isOnBehalf olup listede yoksa düz ekle
            if (!pending.length && typeof expenses !== 'undefined' && Array.isArray(expenses)) {
                const today = (typeof todayDateStr === 'function') ? todayDateStr() : new Date().toISOString().slice(0, 10);
                expenses.forEach(function(item) {
                    if (!item || !(item.isOnBehalf || item.onBehalf)) return;
                    if (item.onBehalfReimbursed) return;
                    const d = String(item.date || '').slice(0, 10);
                    if (!d || d > today) return;
                    // Ay map kontrolü
                    const mk = d.slice(0, 7);
                    const map = item.onBehalfReimbursedByMonth || {};
                    if (map[mk]) return;
                    pending.push({
                        expenseId: item.id,
                        date: d,
                        monthKey: mk,
                        displayAmount: Number(item.amount) || 0,
                        description: item.description || '',
                        category: item.category || '',
                        billSubtype: item.billSubtype || '',
                        onBehalfOf: item.onBehalfOf || '',
                        person: item.person || '',
                        isRecurring: !!item.isRecurring,
                        reimbursed: false
                    });
                });
            }
            const sum = pending.reduce(function(s, e) {
                return s + (Number(e.displayAmount) || 0);
            }, 0);
            if (totalEl) totalEl.textContent = Math.round(sum).toLocaleString('tr-TR') + ' TL';
            if (!pending.length) {
                box.innerHTML = '<p class="text-xs text-slate-400 font-semibold text-center py-4">Ödeme günü gelmiş bekleyen alacak yok</p>';
                return;
            }
            box.innerHTML = pending.map(function(e) {
                const amt = Math.round(Number(e.displayAmount) || 0).toLocaleString('tr-TR');
                const d = (typeof formatDateTR === 'function') ? formatDateTR(String(e.date || '').slice(0, 10)) : String(e.date || '').slice(0, 10);
                const who = escapeHtml(e.onBehalfOf || 'Başkası');
                const eid = escapeHtml(e.expenseId || '');
                const mk = escapeHtml(e.monthKey || String(e.date || '').slice(0, 7));
                const monthLabel = e.monthKey || '';
                return '<div class="report-row report-alacak">' +
                    '<div class="min-w-0">' +
                    '<p class="report-title truncate">' + escapeHtml(e.description || e.category || 'Ödeme') + '</p>' +
                    '<p class="report-sub">' + d +
                    (monthLabel ? (' · ' + escapeHtml(monthLabel)) : '') +
                    ' · ' + who +
                    (e.person ? (' · ödeyen ' + escapeHtml(e.person)) : '') +
                    (e.billSubtype ? (' · ' + escapeHtml(e.billSubtype)) : '') +
                    (e.isRecurring ? ' · tekrarlı' : '') + '</p></div>' +
                    '<div class="shrink-0 text-right">' +
                    '<p class="report-amt text-amber-800">' + amt + ' TL</p>' +
                    '<button type="button" onclick="markOnBehalfReimbursed(\'' + eid + '\',\'' + mk + '\', true)" class="text-[10px] font-bold text-emerald-700 mt-1">Geri alındı</button>' +
                    '</div></div>';
            }).join('');
        };



        /** Ödenmiş ekstre etiket dönemi: periodKey varsa onu kullan; yoksa ödeme tarihinden geriye hesapla */
        function resolveStatementPeriodKey(stmt) {
            if (!stmt) return '';
            // Önce kayıtlı harcama dönemi (ödeme tarihi değil)
            const direct = stmt.periodKey || stmt.month || stmt.spendPeriodKey || '';
            if (direct && /^\d{4}-\d{2}$/.test(String(direct))) return String(direct);
            if (direct) return String(direct);
            const paid = String(stmt.paidDate || '').slice(0, 10);
            if (paid && typeof getPeriodKeyForDateStr === 'function') {
                try {
                    const d = (typeof parseYMD === 'function') ? parseYMD(paid) : new Date(paid + 'T12:00:00');
                    if (d && !isNaN(d.getTime())) {
                        d.setDate(d.getDate() - 12);
                        const ymd = (typeof formatYMD === 'function')
                            ? formatYMD(d)
                            : (d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'));
                        return getPeriodKeyForDateStr(ymd) || '';
                    }
                } catch (_) {}
            }
            return '';
        }

function renderCardStatements(person) {
            const key = (person || '').toLowerCase();
            const sortedStatements = (cardStatements || [])
                .filter(function(s) { return String(s.person || '').toLowerCase() === key; })
                .sort(function(a, b) { return String(b.month || '').localeCompare(String(a.month || '')); });

            const container = document.getElementById(key === 'bekir' ? 'bekirCardStatements' : 'duyguCardStatements');
            if (!container) return;
            try { if (typeof renderMultinetReport === 'function') renderMultinetReport(); } catch (_) {}
            try { if (typeof renderOnBehalfReport === 'function') renderOnBehalfReport(); } catch (_) {}
            if (!sortedStatements.length) {
                container.innerHTML = '<p class="text-[11px] text-slate-400 font-medium py-3 text-center">Kayıt yok</p>';
                return;
            }

            const kind = key === 'bekir' ? 'stmt-bekir' : 'stmt-duygu';

            container.innerHTML = sortedStatements.map(function(stmt) {
                const pKey = (typeof resolveStatementPeriodKey === 'function')
                    ? resolveStatementPeriodKey(stmt)
                    : String(stmt.periodKey || stmt.month || '');
                const periodLab = (typeof formatPeriodLabel === 'function')
                    ? formatPeriodLabel(pKey)
                    : pKey;
                const safeId = escapeHtml(String(stmt.id || ''));
                const amt = (Number(stmt.amount) || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
                const paid = stmt.paidDate ? String(stmt.paidDate).slice(0, 10) : '';
                const paidShort = paid ? paid.split('-').reverse().join('.') : '';

                return (
                    '<div class="stmt-row ' + kind + '">' +
                      '<div class="stmt-row-main">' +
                        '<span class="stmt-row-month">' + escapeHtml(periodLab) + '</span>' +
                        '<span class="stmt-row-amt">' + amt + ' <span class="stmt-row-tl">TL</span></span>' +
                      '</div>' +
                      '<div class="stmt-row-side">' +
                        (paidShort ? '<span class="stmt-row-paid" title="Ödeme tarihi">' + escapeHtml(paidShort) + '</span>' : '') +
                        '<button type="button" class="stmt-row-btn" title="Ödenmedi yap" onclick="event.stopPropagation();markCardStatementUnpaid(\'' + safeId + '\')">↩</button>' +
                        '<button type="button" class="stmt-row-btn stmt-row-btn-del" title="Sil" onclick="event.stopPropagation();deleteCardStatement(\'' + safeId + '\')">×</button>' +
                      '</div>' +
                    '</div>'
                );
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
        
        /** Tek kaynak: güncel ekstre dönemi KK harcamaları (Bekir / Duygu) */
        function calculateCurrentCardStatements() {
            const period = (typeof getCardStatementPeriod === 'function')
                ? getCardStatementPeriod()
                : { periodKey: (typeof getCurrentPeriod === 'function' ? getCurrentPeriod() : ''), label: '' };
            const periodKey = period.periodKey || ((typeof getCurrentPeriod === 'function') ? getCurrentPeriod() : '');

            let allWithInstallments = [];
            const list = (typeof expenses !== 'undefined' && expenses) ? expenses : [];
            list.forEach(function(item) {
                if (!item) return;
                if (item.installmentLabel === 'Gelir') return;
                const count = Number(item.installmentCount) || 1;
                const isRec = !!item.isRecurring;
                const originalDate = item.date;
                const totalAmt = Number(item.amount) || 0;
                const perAmount = isRec
                    ? (item.amountPerInstallment != null ? Number(item.amountPerInstallment) : totalAmt)
                    : (item.amountPerInstallment != null ? Number(item.amountPerInstallment) : (totalAmt / Math.max(1, count)));

                if (count <= 1 && !isRec) {
                    allWithInstallments.push(Object.assign({}, item, {
                        displayAmount: totalAmt,
                        installmentLabel: 'Peşin',
                        effectiveMonth: (typeof getPeriodKeyForDateStr === 'function')
                            ? getPeriodKeyForDateStr(originalDate)
                            : String(originalDate || '').slice(0, 7),
                        date: originalDate
                    }));
                    return;
                }
                const n = Math.max(1, count);
                for (let i = 0; i < n; i++) {
                    const dateStr = (typeof shiftDateByMonths === 'function')
                        ? shiftDateByMonths(originalDate, i)
                        : originalDate;
                    const pk = (typeof getPeriodKeyForDateStr === 'function')
                        ? getPeriodKeyForDateStr(dateStr)
                        : String(dateStr || '').slice(0, 7);
                    const label = isRec
                        ? ('Tekrar ' + (i + 1) + '/' + n)
                        : ('Taksit ' + (i + 1) + '/' + n);
                    allWithInstallments.push(Object.assign({}, item, {
                        id: String(item.id || '') + '_ins_' + i,
                        displayAmount: perAmount,
                        installmentLabel: label,
                        effectiveMonth: pk,
                        date: dateStr,
                        installmentIndex: i
                    }));
                }
            });

            const isCc = function(exp) {
                if (typeof isCreditPayment === 'function') return isCreditPayment(exp.paymentType);
                const p = String(exp.paymentType || '').toLocaleLowerCase('tr-TR');
                return p.indexOf('kredi') >= 0 || p.indexOf('kart') >= 0;
            };
            const inPeriodCc = function(exp) {
                if (!exp || exp.effectiveMonth !== periodKey) return false;
                if (!isCc(exp)) return false;
                // Multinet zaten isCreditPayment dışı; gelir zaten elendi
                return true;
            };
            let bekirCreditExpenses = allWithInstallments.filter(function(exp) {
                return exp.person === 'Bekir' && inPeriodCc(exp);
            });
            let duyguCreditExpenses = allWithInstallments.filter(function(exp) {
                return exp.person === 'Duygu' && inPeriodCc(exp);
            });

            if (typeof dedupePeriodExpenseRows === 'function') {
                bekirCreditExpenses = dedupePeriodExpenseRows(bekirCreditExpenses);
                duyguCreditExpenses = dedupePeriodExpenseRows(duyguCreditExpenses);
            }

            const sumAmt = function(arr) {
                return (arr || []).reduce(function(sum, exp) { return sum + (Number(exp.displayAmount) || 0); }, 0);
            };

            currentStatements = [
                {
                    person: 'Bekir',
                    amount: sumAmt(bekirCreditExpenses),
                    expenses: bekirCreditExpenses,
                    period: period,
                    color: 'blue'
                },
                {
                    person: 'Duygu',
                    amount: sumAmt(duyguCreditExpenses),
                    expenses: duyguCreditExpenses,
                    period: period,
                    color: 'pink'
                }
            ];

            return currentStatements;
        }

        /** Bütçe kartları için: dönem KK tutarları (ekstre ile aynı kaynak) */
        window.getPeriodCardBreakdown = function() {
            const stmts = (typeof calculateCurrentCardStatements === 'function')
                ? calculateCurrentCardStatements()
                : (currentStatements || []);
            const by = { bekir: 0, duygu: 0, total: 0 };
            (stmts || []).forEach(function(s) {
                const a = Number(s.amount) || 0;
                if (s.person === 'Bekir') by.bekir = a;
                else if (s.person === 'Duygu') by.duygu = a;
            });
            by.total = by.bekir + by.duygu;
            return by;
        };

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
            try { calculateCurrentCardStatements(); } catch (err) { console.warn('calc statements', err); }
            const container = document.getElementById('currentStatementsContainer');
            if (!container) return;

            const list = (currentStatements && currentStatements.length)
                ? currentStatements
                : [
                    { person: 'Bekir', amount: 0, expenses: [], period: { label: '-' }, color: 'blue' },
                    { person: 'Duygu', amount: 0, expenses: [], period: { label: '-' }, color: 'pink' }
                ];

            container.innerHTML = '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' + list.map(function(stmt) {
                const amt = Number(stmt.amount) || 0;
                const blue = stmt.color === 'blue' || stmt.person === 'Bekir';
                const kind = blue ? 'current-stmt-bekir' : 'current-stmt-duygu';
                const periodLab = (stmt.period && stmt.period.label) ? stmt.period.label : '-';
                const n = (stmt.expenses && stmt.expenses.length) ? stmt.expenses.length : 0;
                const clickable = amt > 0 ? 'is-clickable' : '';
                const onclick = amt > 0
                    ? 'onclick="openStatementDetails(\'' + String(stmt.person || '').replace(/'/g, "\\'") + '\')"'
                    : '';
                return (
                    '<div class="current-stmt ' + kind + ' ' + clickable + '" ' + onclick + '>' +
                      '<div class="current-stmt-top">' +
                        '<div class="min-w-0">' +
                          '<p class="current-stmt-person">' + escapeHtml(stmt.person || '') + '</p>' +
                          '<p class="current-stmt-amt">' + amt.toLocaleString('tr-TR') + ' <span style="font-size:0.65rem;font-weight:700;opacity:0.55">TL</span></p>' +
                        '</div>' +
                        '<p class="current-stmt-period">' + escapeHtml(periodLab) + '</p>' +
                      '</div>' +
                      '<div class="current-stmt-foot">' +
                        '<span class="current-stmt-count">' + n + ' harcama</span>' +
                        (amt > 0
                          ? '<button type="button" class="current-stmt-btn" onclick="event.stopPropagation();openStatementDetails(\'' + String(stmt.person || '').replace(/'/g, "\\'") + '\')">Detay</button>'
                          : '<span class="current-stmt-count">Borç yok</span>') +
                      '</div>' +
                    '</div>'
                );
            }).join('') + '</div>';
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




        window.wireAllModalBackdropClose = function() {
            const closeMap = {
                categoryDetailModal: 'closeCategoryDetailModal',
                statementDetailModal: 'closeStatementDetail',
                installmentsModal: 'closeInstallmentsModal',
                siteSearchModal: 'closeSiteSearch',
                expenseModal: 'closeExpenseModal',
                ibanModal: 'closeIbanModal',
                tabEditModal: 'closeTabEditModal',
                notifAllModal: 'closeNotifAllModal',
                cardDebtModal: 'closeCardDebtModal',
                weatherModal: 'closeWeatherModal',
                fuelPriceModal: 'closeFuelPriceModal',
                surahModal: 'closeSurahModal',
                onBehalfHistoryModal: 'closeOnBehalfHistoryModal',
                periodCloseReportModal: 'closePeriodCloseReportModal',
                            };
            document.querySelectorAll('.fixed.inset-0').forEach(function(overlay) {
                if (overlay.dataset.backdropWired === '1') return;
                overlay.dataset.backdropWired = '1';
                overlay.addEventListener('click', function(e) {
                    if (e.target !== overlay) return;
                    const id = overlay.id || '';
                    const fn = closeMap[id];
                    if (fn && typeof window[fn] === 'function') {
                        try { window[fn](); } catch (_) {}
                        return;
                    }
                    // generic fallback
                    overlay.classList.add('hidden');
                    overlay.classList.remove('flex');
                });
            });
            // filter sheet
            const fb = document.getElementById('filterSheetBackdrop');
            if (fb && fb.dataset.backdropWired !== '1') {
                fb.dataset.backdropWired = '1';
                fb.addEventListener('click', function() {
                    if (typeof closeFilterPanel === 'function') closeFilterPanel();
                });
            }
        };
