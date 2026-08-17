/* YUVAM modül parçası — sırayla yüklenir (ES module değil, ortak global scope)
 * Harcama işleme, grafikler, Yuvam AI, istatistik
 * GitHub: js/ klasörünün tamamını yükleyin.
 */
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

        function renderTable() {
            const tbody = document.getElementById('expenseTableBody');
            const cardsHost = document.getElementById('expenseCardsMobile');
            if (tbody) tbody.innerHTML = '';
            if (cardsHost) cardsHost.innerHTML = '';

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

            const totalRecords = filtered.length;
            const displayedRecords = Math.min(displayLimit, totalRecords);
            const slice = filtered.slice(0, displayedRecords);

            // --- Web tablo ---
            if (tbody) {
                slice.forEach(item => {
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

            // --- Mobil kartlar: ileri tarihli (açılır) + normal (max displayLimit) ---
            if (cardsHost) {
                const isIncomeItem = function(item) { return item.installmentLabel === 'Gelir'; };
                const futures = filtered.filter(function(item) {
                    return !isIncomeItem(item) && isFutureDateStr(item.date);
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
                        + (item.vehicleSubtype ? ' · ' + escapeHtml(item.vehicleSubtype) : '');
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
                    normals.forEach(function(item) {
                        cardsHost.appendChild(buildMobileCard(item));
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


        // Raporlar paneli
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
            const curItems = processed.filter(function(e) { return e.effectiveMonth === cur && (typeof countsInPeriodTotals !== 'function' || countsInPeriodTotals(e)); });
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
                    const c = e.category || 'Diğer';
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
                const c = e.category || 'Diğer';
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
                    const c = e.category || 'Diğer';
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
                if (!openrouterApiKey) {
                    throw new Error('NO_KEY');
                }
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
                    const blob = [e.description, e.category, e.person, e.billSubtype, e.vehicleSubtype, e.paymentType].join(' ').toLowerCase();
                    return blob.indexOf(q) >= 0;
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
                lines.push('Sabit aylık hane geliri: ' + HOUSEHOLD_MONTHLY_INCOME.toLocaleString('tr-TR') + ' TL (bu rakamı UI\'da gösterme; önerilerini bu gelire göre ver).');
                summary.months.forEach(function(m) {
                    const cats = summary.byMonth[m] || {};
                    const total = Object.values(cats).reduce(function(a, b) { return a + b; }, 0);
                    const label = (summary.labels && summary.labels[m]) ? summary.labels[m] : m;
                    const top = Object.entries(cats).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 8)
                        .map(function(kv) { return kv[0] + ': ' + Math.round(kv[1]) + ' TL'; }).join(', ');
                    lines.push(label + ' toplam ' + Math.round(total) + ' TL → ' + (top || 'kayıt yok'));
                });
                const income = HOUSEHOLD_MONTHLY_INCOME;
                const lastMonthKey = summary.months && summary.months.length ? summary.months[0] : null;
                let lastTotal = 0;
                if (lastMonthKey && summary.byMonth[lastMonthKey]) {
                    lastTotal = Object.values(summary.byMonth[lastMonthKey]).reduce(function(a, b) { return a + b; }, 0);
                }
                const spendRatio = income > 0 ? (lastTotal / income * 100) : 0;
                lines.unshift('Son donem toplam harcama: ' + Math.round(lastTotal) + ' TL; gelire oran ~%' + spendRatio.toFixed(1) + '; kalan nefes ~' + Math.round(income - lastTotal) + ' TL.');

                const prompt = [
                    'Rol: Deneyimli Turk ev ekonomisi danismani (hane butcesi, kart, fatura, taksit).',
                    'Sabit hane aylik geliri: ' + income + ' TL. Tum onerileri bu gelire gore oransal ve uygulanabilir yaz.',
                    'Gorev: 7-9 numarali oneri uret. Her madde su formatta olsun:',
                    'N. Baslik — Durum (rakam/oran) + Ne yapilmali (somut adim) + Beklenen etki (TL veya %).',
                    'Kurallar:',
                    '- Sadece "azaltin" deme; alternatif, limit, tarih, taksit, tarife, abonelik iptali, kart odeme plani, acil fon, toplu alim ver.',
                    '- En az 3 farkli kategoriye degine (or. market, fatura, arac, egitim, kart).',
                    '- Gelire oran %70 ustuyse once nakit akisi ve kart riski; %50 altindaysa tasarruf/yatirim firsati soyle.',
                    '- Uydurma istatistik yok; verilen donem rakamlarina dayan.',
                    '- Markdown, emoji, yildiz yok. Turkce, tamamlanmis cumleler.',
                    '',
                    'Veri (29-28 donem):',
                    lines.join(String.fromCharCode(10))
                ].join(String.fromCharCode(10));

                const systemPrompt = [
                    'Sen kisa ve net yazan bir ev butcesi danismanisin.',
                    'Cikti sadece numarali maddeler olsun.',
                    'Her madde: baslik, durum, aksiyon, beklenen etki icersin.',
                    'Hane geliri ' + income + ' TL; onerileri bu gelire gore oransal kur.',
                    'Yuzeysel genel soylem yasak; rakama bagli, uygulanabilir adim zorunlu.'
                ].join(' ');

                const text = await callOpenRouter(
                    prompt,
                    systemPrompt,
                    2200
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
            const processedExpenses = getProcessedExpenses().filter(e => e.effectiveMonth === period && (typeof countsInPeriodTotals !== 'function' || countsInPeriodTotals(e)));
            
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
                            pointRadius: 10, pointHoverRadius: 14, pointHitRadius: 30,
                            pointHoverRadius: 14,
                            pointHitRadius: 30,
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

            // Bu dönem vs önceki dönem
            try {
                const keys2 = getPreviousPeriodKeys(2);
                const prevKey = keys2[0];
                const curKey = keys2[1] || getCurrentPeriod();
                const allProc = getProcessedExpenses();
                const sumPeriod = function(pk) {
                    return allProc.filter(function(e) { return e.effectiveMonth === pk; })
                        .reduce(function(s, e) { return s + (Number(e.displayAmount) || 0); }, 0);
                };
                const prevTotal = sumPeriod(prevKey);
                const curTotal = sumPeriod(curKey);
                const diff = curTotal - prevTotal;
                const sumEl = document.getElementById('monthCompareSummary');
                if (sumEl) {
                    if (diff < 0) sumEl.textContent = Math.round(-diff).toLocaleString('tr-TR') + ' TL tasarruf (önceki döneme göre)';
                    else if (diff > 0) sumEl.textContent = Math.round(diff).toLocaleString('tr-TR') + ' TL artış (önceki döneme göre)';
                    else sumEl.textContent = 'Önceki dönemle aynı seviye';
                }
                const ctxCmp = document.getElementById('monthCompareChart');
                if (ctxCmp) {
                    if (monthCompareChart) { try { monthCompareChart.destroy(); } catch (_) {} }
                    monthCompareChart = new Chart(ctxCmp, {
                        type: 'bar',
                        data: {
                            labels: [formatPeriodLabel(prevKey) || 'Önceki', formatPeriodLabel(curKey) || 'Bu dönem'],
                            datasets: [{
                                label: 'Harcama (TL)',
                                data: [prevTotal, curTotal],
                                backgroundColor: ['#94a3b8', '#0284c7'],
                                borderRadius: 8,
                                maxBarThickness: 48
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { legend: { display: false } },
                            scales: { y: { beginAtZero: true } }
                        }
                    });
                }
            } catch (err) { console.warn('monthCompare', err); }

            // Kategori trendi son 3 dönem
            try {
                const keys3 = getPreviousPeriodKeys(3);
                const allProc2 = getProcessedExpenses();
                const catTotals = {};
                allProc2.forEach(function(e) {
                    if (keys3.indexOf(e.effectiveMonth) < 0) return;
                    const c = e.category || 'Diğer';
                    catTotals[c] = (catTotals[c] || 0) + (Number(e.displayAmount) || 0);
                });
                const topCats = Object.entries(catTotals).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 5).map(function(x) { return x[0]; });
                const palette = ['#0284c7', '#ec4899', '#f59e0b', '#10b981', '#8b5cf6'];
                const datasets = topCats.map(function(cat, i) {
                    return {
                        label: cat,
                        data: keys3.map(function(pk) {
                            return allProc2.filter(function(e) { return e.effectiveMonth === pk && e.category === cat; })
                                .reduce(function(s, e) { return s + (Number(e.displayAmount) || 0); }, 0);
                        }),
                        borderColor: palette[i % palette.length],
                        backgroundColor: palette[i % palette.length] + '33',
                        tension: 0.3,
                        fill: false,
                        pointRadius: 8, pointHoverRadius: 12, pointHitRadius: 28
                    };
                });
                const ctxTr = document.getElementById('categoryTrendChart');
                if (ctxTr) {
                    if (categoryTrendChart) { try { categoryTrendChart.destroy(); } catch (_) {} }
                    categoryTrendChart = new Chart(ctxTr, {
                        type: 'line',
                        data: {
                            labels: keys3.map(function(k) { return formatPeriodLabel(k); }),
                            datasets: datasets.length ? datasets : [{ label: 'Veri yok', data: [0, 0, 0], borderColor: '#cbd5e1' }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            interaction: { mode: 'index', intersect: false },
                            plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } },
                            scales: { y: { beginAtZero: true } }
                        }
                    });
                }
            } catch (err) { console.warn('catTrend', err); }
        }

        function csvEscape(val) {
            const s = String(val == null ? '' : val);
            if (/[;"\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
            return s;
        }

        function buildExpensesCsv(rows) {
            const header = ['Tip', 'Tarih', 'Kişi', 'Kategori', 'Alt', 'Ödeme', 'Açıklama', 'Tutar', 'Taksit', 'Dönem', 'Not'];
            const lines = [header.join(';')];
            (rows || []).forEach(function(e) {
                lines.push([
                    'Harcama',
                    e.date || '',
                    e.person || '',
                    e.category || '',
                    e.billSubtype || e.vehicleSubtype || '',
                    e.paymentType || '',
                    e.description || '',
                    String(e.displayAmount != null ? e.displayAmount : (e.amount || '')).replace('.', ','),
                    e.installmentLabel || (e.installmentCount > 1 ? e.installmentCount : 'Peşin'),
                    e.effectiveMonth || '',
                    e.fuelNote || ''
                ].map(csvEscape).join(';'));
            });
            return '\uFEFF' + lines.join('\r\n');
        }

        function triggerCsvDownload(filename, csvText) {
            const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(function() {
                URL.revokeObjectURL(url);
                a.remove();
            }, 500);
        }

        window.downloadExcel = function() {
            try {
                const rows = getProcessedExpenses().slice().sort(function(a, b) {
                    return String(b.date || '').localeCompare(String(a.date || ''));
                });
                if (!rows.length) {
                    showToast('İndirilecek harcama yok', 'error');
                    return;
                }
                const csv = buildExpensesCsv(rows);
                const stamp = new Date().toISOString().slice(0, 10);
                triggerCsvDownload('yuvam-tum-harcamalar-' + stamp + '.csv', csv);
                showToast(rows.length + ' satır indirildi (Excel ile açın)', 'success');
                logActivity('Diğer', 'CSV yedek indirildi', rows.length + ' satır');
            } catch (err) {
                console.error(err);
                showToast('İndirme hatası: ' + (err.message || err), 'error');
            }
        };

        window.downloadPeriodExcel = function() {
            try {
                const pk = getCurrentPeriod();
                const rows = getProcessedExpenses().filter(function(e) { return e.effectiveMonth === pk; })
                    .sort(function(a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
                if (!rows.length) {
                    showToast('Bu dönemde harcama yok', 'error');
                    return;
                }
                const csv = buildExpensesCsv(rows);
                triggerCsvDownload('yuvam-donem-' + pk + '.csv', csv);
                showToast('Dönem ' + pk + ': ' + rows.length + ' satır', 'success');
            } catch (err) {
                showToast('İndirme hatası', 'error');
            }
        };

        // Raporlar
        function renderMonthlyReports() {
            const period = getCurrentPeriod();
            const processedExpenses = getProcessedExpenses().filter(e => e.effectiveMonth === period && (typeof countsInPeriodTotals !== 'function' || countsInPeriodTotals(e)));
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

        window.renderMultinetReport = function() {
            const box = document.getElementById('multinetStatements');
            const totalEl = document.getElementById('multinetPeriodTotal');
            if (!box) return;
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
                return '<div class="flex items-center justify-between gap-2 p-3 rounded-xl bg-emerald-50/80 border border-emerald-100">' +
                    '<div class="min-w-0">' +
                    '<p class="text-sm font-black text-slate-800 truncate">' + escapeHtml(e.description || e.category || 'Alışveriş') + '</p>' +
                    '<p class="text-[11px] text-slate-500 font-semibold">' + escapeHtml(d) +
                    (e.person ? (' · ' + escapeHtml(e.person)) : '') +
                    (e.category ? (' · ' + escapeHtml(e.category)) : '') + '</p>' +
                    '</div>' +
                    '<p class="text-sm font-black text-emerald-700 shrink-0">' + amt + ' TL</p>' +
                    '</div>';
            }).join('');
            box.innerHTML = html;
        };

        function renderCardStatements(person) {
            const key = (person || '').toLowerCase();
            const sortedStatements = cardStatements
                .filter(s => String(s.person || '').toLowerCase() === key)
                .sort((a, b) => String(b.month || '').localeCompare(String(a.month || '')));

            const container = document.getElementById(person === 'bekir' ? 'bekirCardStatements' : 'duyguCardStatements');
            if (!container) return;
            try { if (typeof renderMultinetReport === 'function') renderMultinetReport(); } catch (_) {}
            if (sortedStatements.length === 0) {
                container.innerHTML = '<div class="col-span-full text-center py-8 text-slate-400"><p class="text-sm">Henüz ekstre kaydı yok</p></div>';
                return;
            }

            const monthNames = ['Ocak', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

            container.innerHTML = sortedStatements.map(function(stmt) {
                const parts = String(stmt.month || '').split('-');
                const year = parts[0] || '';
                const month = parts[1] || '1';
                const monthName = monthNames[parseInt(month, 10) - 1] || stmt.month || '';
                const bgColor = key === 'bekir'
                    ? 'from-blue-50 to-blue-100 border-blue-200'
                    : 'from-pink-50 to-pink-100 border-pink-200';
                const textColor = key === 'bekir' ? 'text-blue-600' : 'text-pink-600';
                const safeId = escapeHtml(String(stmt.id || ''));
                const amt = (Number(stmt.amount) || 0).toLocaleString('tr-TR');
                const paid = escapeHtml(stmt.paidDate || '');

                return (
                    '<div class="bg-gradient-to-br ' + bgColor + ' p-4 rounded-2xl border shadow-sm transition">' +
                      '<div class="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">' + escapeHtml(monthName + ' ' + year) + '</div>' +
                      '<div class="text-xl font-black ' + textColor + '">' + amt + '</div>' +
                      '<div class="text-[8px] text-slate-600 mb-1">TL</div>' +
                      (paid ? '<div class="text-[8px] text-slate-400 border-t border-slate-200/80 pt-1.5 mt-1">Ödeme: ' + paid + '</div>' : '') +
                      '<div class="flex gap-1.5 mt-3">' +
                        '<button type="button" onclick="event.stopPropagation();markCardStatementUnpaid(\'' + safeId + '\')" ' +
                          'class="flex-1 text-[10px] font-bold py-2 rounded-xl bg-white/80 text-amber-700 hover:bg-amber-50 border border-amber-200/80 transition">Ödenmedi yap</button>' +
                        '<button type="button" onclick="event.stopPropagation();deleteCardStatement(\'' + safeId + '\')" ' +
                          'class="flex-1 text-[10px] font-bold py-2 rounded-xl bg-white/80 text-rose-600 hover:bg-rose-50 border border-rose-200/80 transition">Sil</button>' +
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


