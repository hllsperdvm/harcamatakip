/* YUVAM modül parçası — sırayla yüklenir (ES module değil, ortak global scope)
 * Aile, altın, fikstür, tatil, takvim, sayfa düzeni, Firestore sync başlangıç
 * GitHub: js/ klasörünün tamamını yükleyin.
 */
        // ——— Aile: Takvim / Görev / Alışveriş ———
        function familyRow(main, sub, actionsHtml) {
            return '<div class="flex justify-between gap-3 items-start p-3 rounded-xl bg-slate-50 border border-slate-100">' +
                '<div class="min-w-0 flex-1">' +
                '<p class="text-sm font-bold text-slate-800">' + main + '</p>' +
                (sub ? '<p class="text-[11px] text-slate-500 font-semibold mt-0.5">' + sub + '</p>' : '') +
                '</div><div class="flex gap-1 shrink-0">' + (actionsHtml || '') + '</div></div>';
        }

        window.yuvamEmptyState = function(icon, title, sub, btnLabel, btnOnclick) {
            let html = '<div class="yuvam-empty">' +
                '<span class="yuvam-empty-ico">' + (icon || '📭') + '</span>' +
                '<p class="yuvam-empty-title">' + escapeHtml(title || 'Henüz kayıt yok') + '</p>' +
                (sub ? '<p class="yuvam-empty-sub">' + escapeHtml(sub) + '</p>' : '');
            if (btnLabel && btnOnclick) {
                html += '<button type="button" class="yuvam-empty-btn" onclick="' + btnOnclick + '">' + escapeHtml(btnLabel) + '</button>';
            }
            html += '</div>';
            return html;
        };

        function calTypeLabel(type) {
            const m = { event: 'Etkinlik', birthday: 'Doğum günü', anniversary: 'Yıldönümü', appointment: 'Randevu', match: 'Maç', other: 'Diğer' };
            return m[type] || 'Etkinlik';
        }
        function calTypeIcon(type) {
            const m = { event: '📅', birthday: '🎂', anniversary: '💍', appointment: '🩺', match: '⚽', other: '📌' };
            return m[type] || '📅';
        }
        function taskRepeatLabel(r) {
            if (r === 'weekly') return 'Her hafta';
            if (r === 'monthly') return 'Her ay';
            return '';
        }
        function addDaysYMD(ymd, days) {
            const p = parseYMD(ymd) || new Date();
            p.setDate(p.getDate() + days);
            return formatYMD(p);
        }
        function addMonthsYMD(ymd, months) {
            const p = parseYMD(ymd) || new Date();
            const d = p.getDate();
            p.setMonth(p.getMonth() + months);
            if (p.getDate() < d) p.setDate(0);
            return formatYMD(p);
        }
        /** Yıllık tekrar: bugünden sonraki ilk gün (MM-DD) */
        function nextYearlyOccurrence(baseYmd) {
            const base = String(baseYmd || '').slice(0, 10);
            if (base.length < 10) return base;
            const md = base.slice(5); // MM-DD
            const today = todayDateStr();
            const y = parseInt(today.slice(0, 4), 10);
            let cand = y + '-' + md;
            if (cand < today) cand = (y + 1) + '-' + md;
            return cand;
        }
        function eventEffectiveDate(ev) {
            if (!ev || !ev.date) return '';
            if (ev.repeat === 'yearly' || ev.type === 'birthday' || ev.type === 'anniversary') {
                return nextYearlyOccurrence(ev.date);
            }
            return String(ev.date).slice(0, 10);
        }

        // ——— Altın yatırımları (goldprice.dev · 24 ayar TRY/gram) ———
        function formatGoldTL(n) {
            const v = Number(n);
            if (!isFinite(v)) return '—';
            return v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
        }

        function currentGoldPriceForKarat(karat) {
            const k = Number(karat) || 24;
            if (k === 22) {
                if (goldQuotes.sell22 != null) return goldQuotes.sell22;
                if (goldPricePerGram22 != null) return goldPricePerGram22;
                if (goldQuotes.sell24 != null) return goldQuotes.sell24 * (22 / 24);
                if (goldPricePerGram != null) return goldPricePerGram * (22 / 24);
                return null;
            }
            if (goldQuotes.sell24 != null) return goldQuotes.sell24;
            return goldPricePerGram;
        }

        function updateGoldPriceUI() {
            

            const fmt = function(v) { return v != null && isFinite(v) ? formatGoldTL(v) : '—'; };
            const elB24 = document.getElementById('goldBuy24');
            const elS24 = document.getElementById('goldSell24');
            const elB22 = document.getElementById('goldBuy22');
            const elS22 = document.getElementById('goldSell22');
            if (elB24) elB24.textContent = fmt(goldQuotes.buy24);
            if (elS24) elS24.textContent = fmt(goldQuotes.sell24);
            if (elB22) elB22.textContent = fmt(goldQuotes.buy22);
            if (elS22) elS22.textContent = fmt(goldQuotes.sell22);
        }

        function computeGoldPortfolio() {
            let totalCost = 0, totalValue = 0, totalGrams = 0, hasPriced = false;
            (goldHoldings || []).forEach(function(h) {
                const g = Number(h.grams) || 0;
                const bp = Number(h.buyPrice) || 0;
                const karat = Number(h.karat) || 24;
                const price = currentGoldPriceForKarat(karat);
                totalCost += g * bp;
                totalGrams += g;
                if (price != null) {
                    totalValue += g * price;
                    hasPriced = true;
                }
            });
            return {
                totalCost: totalCost,
                totalValue: totalValue,
                totalGrams: totalGrams,
                pnl: hasPriced ? (totalValue - totalCost) : null,
                hasPriced: hasPriced
            };
        }

        function updateHomeGoldCard() {
            const el = document.getElementById('homeGoldPnL');
            const netEl = document.getElementById('homeGoldNet');
            const sub = document.getElementById('homeGoldSub');
            if (!el) return;
            const p = computeGoldPortfolio();
            if (!(goldHoldings || []).length) {
                el.textContent = 'Kayıt yok';
                el.className = 'text-xl font-black text-slate-400';
                if (netEl) { netEl.textContent = ''; netEl.className = 'text-lg font-black text-slate-400'; }
                if (sub) sub.textContent = 'Bütçe Takip · altın ekle';
                return;
            }
            if (!p.hasPriced) {
                el.textContent = 'Fiyat bekleniyor';
                el.className = 'text-xl font-black text-slate-500';
                if (netEl) {
                    netEl.textContent = 'Net ' + formatGoldTL(p.totalCost);
                    netEl.className = 'text-lg font-black text-slate-600';
                }
                if (sub) sub.textContent = 'Bütçe Takip';
                return;
            }
            const pnl = p.pnl;
            const pct = p.totalCost > 0 ? (pnl / p.totalCost * 100) : 0;
            el.textContent = (pnl >= 0 ? '+' : '') + Math.round(pnl).toLocaleString('tr-TR') + ' TL';
            el.className = 'text-xl font-black ' + (pnl >= 0 ? 'text-emerald-600' : 'text-rose-600');
            if (netEl) {
                netEl.textContent = 'Net ' + Math.round(p.totalValue).toLocaleString('tr-TR') + ' TL';
                netEl.className = 'text-lg font-black text-slate-800';
            }
            if (sub) {
                sub.textContent = (pnl >= 0 ? '+' : '') + pct.toFixed(1) + '%';
            }
        }

        window.renderGoldHoldings = function() {
            const list = document.getElementById('goldHoldingsList');
            if (!list) {
                updateHomeGoldCard();
                return;
            }
            const port = computeGoldPortfolio();
            if (!(goldHoldings || []).length) {
                list.innerHTML = '<p class="text-center text-xs text-slate-400 font-semibold py-3">Henüz altın kaydı yok</p>';
            } else {
                const sorted = goldHoldings.slice().sort(function(a, b) {
                    return String(b.buyDate || '').localeCompare(String(a.buyDate || ''));
                });
                list.innerHTML = sorted.map(function(h) {
                    const g = Number(h.grams) || 0;
                    const bp = Number(h.buyPrice) || 0;
                    const karat = Number(h.karat) || 24;
                    const price = currentGoldPriceForKarat(karat);
                    const cost = g * bp;
                    const val = (price != null) ? g * price : null;
                    const pnl = (val != null) ? val - cost : null;
                    const pnlCls = pnl == null ? 'text-slate-500' : (pnl >= 0 ? 'text-emerald-600' : 'text-rose-600');
                    const pnlTxt = pnl == null ? 'Fiyat bekleniyor' : ((pnl >= 0 ? '+' : '') + formatGoldTL(pnl));
                    const karatBadge = '<span class="inline-block text-[10px] font-black px-1.5 py-0.5 rounded-md ' +
                        (karat === 22 ? 'bg-orange-100 text-orange-800' : 'bg-amber-100 text-amber-900') + '">' + karat + ' ayar</span>';
                    return '<div class="p-2.5 rounded-xl border border-slate-100 bg-slate-50/80">' +
                        '<div class="flex justify-between gap-2 items-start">' +
                        '<div class="min-w-0">' +
                        '<p class="text-xs font-black text-slate-800 flex flex-wrap items-center gap-1.5">' + karatBadge + ' ' + g + ' g · alış ' + formatGoldTL(bp) + '/g</p>' +
                        '<p class="text-[10px] text-slate-500 font-semibold">' + escapeHtml(h.buyDate || '') +
                        (h.note ? (' · ' + escapeHtml(h.note)) : '') + '</p>' +
                        '<p class="text-[10px] font-bold text-slate-600 mt-0.5">Maliyet ' + formatGoldTL(cost) +
                        (val != null ? (' · Değer ' + formatGoldTL(val)) : '') + '</p>' +
                        '<p class="text-xs font-black ' + pnlCls + '">' + pnlTxt + '</p>' +
                        '</div>' +
                        '<button type="button" onclick="deleteGoldHolding(\'' + escapeHtml(h.id) + '\')" class="text-[10px] font-bold text-rose-600 px-2 py-1 rounded-lg hover:bg-rose-50 shrink-0">Sil</button>' +
                        '</div></div>';
                }).join('');
            }
            const elCost = document.getElementById('goldSumCost');
            const elVal = document.getElementById('goldSumValue');
            const elPnL = document.getElementById('goldSumPnL');
            if (elCost) elCost.textContent = formatGoldTL(port.totalCost) + (port.totalGrams ? (' · ' + port.totalGrams + ' g') : '');
            if (elVal) elVal.textContent = port.hasPriced ? formatGoldTL(port.totalValue) : '—';
            if (elPnL) {
                if (!port.hasPriced) {
                    elPnL.textContent = '—';
                    elPnL.className = 'font-black text-slate-500';
                } else {
                    const pnl = port.pnl;
                    const pct = port.totalCost > 0 ? (pnl / port.totalCost * 100) : 0;
                    elPnL.textContent = (pnl >= 0 ? '+' : '') + formatGoldTL(pnl) + ' (' + (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%)';
                    elPnL.className = 'font-black ' + (pnl >= 0 ? 'text-emerald-600' : 'text-rose-600');
                }
            }
            const prev = document.getElementById('goldSumPnLPreview');
            if (prev) {
                if (!(goldHoldings || []).length) prev.textContent = 'Kayıt yok';
                else if (!port.hasPriced) prev.textContent = 'Fiyat bekleniyor';
                else {
                    const pnl = port.pnl;
                    prev.textContent = (pnl >= 0 ? '+' : '') + Math.round(pnl).toLocaleString('tr-TR') + ' TL';
                    prev.className = 'font-bold ' + (pnl >= 0 ? 'text-emerald-600' : 'text-rose-600');
                }
            }
            updateHomeGoldCard();
        };


        function saveGoldPriceSnapshot() { /* kaldırıldı */ }
        window.refreshGoldPrice = async function(force) {
            const elMeta = document.getElementById('goldPriceMeta');
            try {
                if (!force && goldQuotes.sell24 != null) {
                    updateGoldPriceUI(); 
                    renderGoldHoldings();
                    return;
                }
                if (elMeta) elMeta.textContent = 'Fiyat çekiliyor…';

                let buy24 = null, sell24 = null, buy22 = null, sell22 = null;
                let source = '';
                let change = null;

                try {
                    const res = await fetch('https://finans.truncgil.com/v4/today.json', { cache: 'no-store' });
                    if (!res.ok) throw new Error('truncgil ' + res.status);
                    const data = await res.json();
                    const has = data.HAS || data.GRAMHASALTIN || data.GramAltin || data['Gram Altın'];
                    if (has) {
                        buy24 = parseFloat(has.Buying);
                        sell24 = parseFloat(has.Selling);
                        if (!(buy24 > 0)) buy24 = sell24;
                        if (!(sell24 > 0)) sell24 = buy24;
                        if (has.Change != null && has.Change !== '') change = has.Change;
                        source = 'Truncgil' + (data.Update_Date ? (' · ' + data.Update_Date) : '');
                    }
                    const a22 = data['22AYARALTIN'] || data['22AYAR'] || data.AYAR22;
                    if (a22) {
                        buy22 = parseFloat(a22.Buying);
                        sell22 = parseFloat(a22.Selling);
                        if (!(buy22 > 0)) buy22 = sell22;
                        if (!(sell22 > 0)) sell22 = buy22;
                    }
                } catch (_) {}

                if (!(sell24 > 0)) {
                    try {
                        const res2 = await fetch('https://api.goldprice.dev/v1/carat?currency=TRY', { cache: 'no-store' });
                        if (res2.ok) {
                            const data2 = await res2.json();
                            const g24 = parseFloat(data2.price_gram_24k);
                            const g22 = parseFloat(data2.price_gram_22k);
                            if (g24 > 0) { sell24 = g24; buy24 = g24; source = source || 'goldprice.dev'; }
                            if (g22 > 0) { sell22 = g22; buy22 = g22; }
                        }
                    } catch (_) {}
                }

                if (!(sell24 > 0)) throw new Error('Fiyat alınamadı');
                if (!(buy24 > 0)) buy24 = sell24;
                if (!(sell22 > 0)) sell22 = sell24 * (22 / 24);
                if (!(buy22 > 0)) buy22 = buy24 * (22 / 24);

                goldQuotes = { buy24: buy24, sell24: sell24, buy22: buy22, sell22: sell22 };
                goldPricePerGram = sell24;
                goldPricePerGram22 = sell22;
                
                updateGoldPriceUI();
                if (elMeta) {
                    let meta = source || 'Güncel';
                    if (change != null && change !== '') meta += ' · ' + change + '%';
                    elMeta.textContent = meta;
                }
                try {
                    localStorage.setItem('yuvam_gold_price', JSON.stringify({
                        quotes: goldQuotes, p: sell24, p22: sell22, at: Date.now(), source: source
                    }));
                } catch (_) {}
                renderGoldHoldings();
            } catch (e) {
                try {
                    const raw = localStorage.getItem('yuvam_gold_price');
                    if (raw) {
                        const o = JSON.parse(raw);
                        if (o.quotes && o.quotes.sell24 > 0) {
                            goldQuotes = o.quotes;
                            goldPricePerGram = o.quotes.sell24;
                            goldPricePerGram22 = o.quotes.sell22;
                        } else if (o.p > 0) {
                            goldPricePerGram = o.p;
                            goldPricePerGram22 = o.p22 > 0 ? o.p22 : o.p * (22 / 24);
                            goldQuotes = {
                                buy24: o.p, sell24: o.p,
                                buy22: goldPricePerGram22, sell22: goldPricePerGram22
                            };
                        }
                        updateGoldPriceUI();
                        if (elMeta) elMeta.textContent = 'Önbellek · elle de girebilirsiniz';
                        renderGoldHoldings();
                        return;
                    }
                } catch (_) {}
                if (elMeta) elMeta.textContent = 'API yok — elle 24A satış ₺/g girin';
            }
        };


        window.toggleGoldPanel = function() {
            const body = document.getElementById('goldPanelBody');
            const chev = document.getElementById('goldToggleChevron');
            if (!body) return;
            const open = body.classList.contains('hidden');
            body.classList.toggle('hidden', !open);
            if (chev) chev.style.transform = open ? 'rotate(180deg)' : '';
            if (open) {
                try {
                    if (typeof refreshGoldPrice === 'function') refreshGoldPrice(false);
                    if (typeof renderGoldHoldings === 'function') renderGoldHoldings();
                } catch (_) {}
            }
        };

        window.applyManualGoldPrice = function() {
            const inp = document.getElementById('goldManualPrice');
            const p = parseFloat(inp && inp.value);
            if (!isFinite(p) || p <= 0) {
                if (typeof showToast === 'function') showToast('Geçerli bir 24 ayar satış fiyatı girin', 'error');
                return;
            }
            const p22 = p * (22 / 24);
            goldQuotes = { buy24: p, sell24: p, buy22: p22, sell22: p22 };
            goldPricePerGram = p;
            goldPricePerGram22 = p22;
            try {
                localStorage.setItem('yuvam_gold_price', JSON.stringify({
                    quotes: goldQuotes, p: p, p22: p22, at: Date.now()
                }));
            } catch (_) {}
            updateGoldPriceUI();
            const elMeta = document.getElementById('goldPriceMeta');
            if (elMeta) elMeta.textContent = 'Elle girildi';
            renderGoldHoldings();
            if (typeof showToast === 'function') showToast('Fiyat güncellendi', 'success');
        };

        const GOLD_LS_KEY = 'yuvam_gold_holdings_v1';

        function loadGoldHoldingsLocal() {
            try {
                const raw = localStorage.getItem(GOLD_LS_KEY);
                if (!raw) return [];
                const arr = JSON.parse(raw);
                return Array.isArray(arr) ? arr : [];
            } catch (_) { return []; }
        }

        function saveGoldHoldingsLocal(list) {
            try { localStorage.setItem(GOLD_LS_KEY, JSON.stringify(list || [])); } catch (_) {}
        }

        async function persistGoldHoldings(list) {
            goldHoldings = list || [];
            saveGoldHoldingsLocal(goldHoldings);
            // settings koleksiyonu zaten izinli — tek doküman
            try {
                await db.collection('settings').doc('goldHoldings').set({
                    list: goldHoldings,
                    updatedAt: new Date().toISOString()
                }, { merge: true });
            } catch (e) {
                console.warn('gold settings write', e);
                // local yeterli
            }
            renderGoldHoldings();
        }

        window.addGoldHolding = async function(e) {
            e.preventDefault();
            if (!currentUser) {
                if (typeof showToast === 'function') showToast('Önce giriş yapın', 'error');
                return;
            }
            const karat = parseInt((document.getElementById('goldKarat') || {}).value, 10) || 24;
            const grams = parseFloat((document.getElementById('goldGrams') || {}).value);
            const buyPrice = parseFloat((document.getElementById('goldBuyPrice') || {}).value);
            const buyDate = ((document.getElementById('goldBuyDate') || {}).value || '').trim();
            const note = ((document.getElementById('goldNote') || {}).value || '').trim();
            if (!isFinite(grams) || grams <= 0 || !isFinite(buyPrice) || buyPrice <= 0 || !buyDate) {
                if (typeof showToast === 'function') showToast('Gram, alış fiyatı ve tarih zorunlu', 'error');
                return;
            }
            try {
                const row = {
                    id: 'g_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                    karat: (karat === 22 ? 22 : 24),
                    grams: grams,
                    buyPrice: buyPrice,
                    buyDate: buyDate,
                    note: note,
                    createdAt: new Date().toISOString(),
                    createdBy: currentUser.name || currentUser.uid || ''
                };
                const next = (goldHoldings || []).concat([row]);
                await persistGoldHoldings(next);
                const g = document.getElementById('goldGrams');
                const bp = document.getElementById('goldBuyPrice');
                const n = document.getElementById('goldNote');
                if (g) g.value = '';
                if (bp) bp.value = '';
                if (n) n.value = '';
                if (typeof showToast === 'function') showToast('Altın kaydı eklendi', 'success');
            } catch (err) {
                console.error(err);
                if (typeof showToast === 'function') showToast('Kayıt eklenemedi: ' + (err.message || err), 'error');
            }
        };

        window.deleteGoldHolding = async function(id) {
            if (!id || !confirm('Bu altın kaydı silinsin mi?')) return;
            try {
                const next = (goldHoldings || []).filter(function(h) { return h.id !== id; });
                await persistGoldHoldings(next);
                if (typeof showToast === 'function') showToast('Silindi', 'success');
            } catch (err) {
                if (typeof showToast === 'function') showToast('Silinemedi', 'error');
            }
        };

        // Altın fiyatı: girişte force yenileme yok (enterAppAsUser gecikmeli çağırır)

        function isGalatasarayName(name) {
            const s = String(name || '').toLowerCase()
                .replace(/ı/g, 'i').replace(/İ/g, 'i')
                .replace(/ş/g, 's').replace(/ğ/g, 'g')
                .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');
            return s.indexOf('galatasaray') >= 0 || s === 'gs' || /(^|\s)gala(\s|$)/.test(s);
        }
        function normTeamName(name) {
            let s = String(name || '').toLowerCase()
                .replace(/ı/g, 'i').replace(/İ/g, 'i')
                .replace(/ş/g, 's').replace(/ğ/g, 'g')
                .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');
            s = s.replace(/\b(fk|sk|bb|sfk|as|spor|kulubu|kulübü)\b/g, ' ');
            s = s.replace(/[^a-z0-9]+/g, '');
            return s;
        }
        function matchDedupeKey(date, home, away) {
            const a = normTeamName(home);
            const b = normTeamName(away);
            const pair = [a, b].sort().join('|');
            return String(date || '').slice(0, 10) + '|' + pair;
        }

        function parseCollectApiDate(raw) {
            if (!raw) return '';
            const s = String(raw).trim();
            // YYYY-MM-DD or ISO
            const iso = s.match(/(\d{4}-\d{2}-\d{2})/);
            if (iso) return iso[1];
            // DD.MM.YYYY or DD/MM/YYYY
            const tr = s.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
            if (tr) {
                return tr[3] + '-' + String(tr[2]).padStart(2, '0') + '-' + String(tr[1]).padStart(2, '0');
            }
            try {
                const d = new Date(s);
                if (!isNaN(d.getTime())) return formatYMD(d);
            } catch (_) {}
            return '';
        }

        function normalizeFixtureRow(row) {
            if (!row || typeof row !== 'object') return null;
            const home = row.home || row.homeTeam || row.home_team || row.team1 || row.localTeam || (row.teams && (row.teams.home || row.teams[0])) || '';
            const away = row.away || row.awayTeam || row.away_team || row.team2 || row.visitorTeam || (row.teams && (row.teams.away || row.teams[1])) || '';
            const date = parseCollectApiDate(row.date || row.matchDate || row.match_date || row.utcDate || row.time || row.datetime || '');
            const score = row.score || row.result || row.ft || ((row.homeScore != null && row.awayScore != null) ? (row.homeScore + ' - ' + row.awayScore) : '') || '';
            const status = row.status || row.state || row.matchStatus || '';
            const time = row.matchTime || row.hour || row.kickoff || '';
            const homeName = typeof home === 'object' ? (home.name || home.team || '') : String(home);
            const awayName = typeof away === 'object' ? (away.name || away.team || '') : String(away);
            if (!homeName && !awayName) return null;
            const gs = isGalatasarayName(homeName) || isGalatasarayName(awayName);
            const key = 'gs-' + date + '-' + homeName + '-' + awayName;
            return {
                home: homeName,
                away: awayName,
                date: date,
                score: String(score || '').trim(),
                status: String(status || '').trim(),
                time: String(time || '').trim(),
                isGs: gs,
                key: key
            };
        }

        function extractFixtureArray(data) {
            if (!data) return [];
            if (Array.isArray(data)) return data;
            if (Array.isArray(data.result)) return data.result;
            if (Array.isArray(data.results)) return data.results;
            if (Array.isArray(data.data)) return data.data;
            if (data.result && Array.isArray(data.result.matches)) return data.result.matches;
            if (data.result && Array.isArray(data.result.fixtures)) return data.result.fixtures;
            if (data.result && typeof data.result === 'object') {
                // bazen hafta -> maç listesi map
                const out = [];
                Object.keys(data.result).forEach(function(k) {
                    const v = data.result[k];
                    if (Array.isArray(v)) out.push.apply(out, v);
                    else if (v && typeof v === 'object' && (v.home || v.away || v.homeTeam)) out.push(v);
                });
                return out;
            }
            return [];
        }

        async function fetchCollectApiJson(url) {
            const res = await fetch(url, {
                method: 'GET',
                headers: {
                    'content-type': 'application/json',
                    'authorization': 'apikey ' + collectApiKey
                }
            });
            const text = await res.text();
            let data = null;
            try { data = JSON.parse(text); } catch (_) { data = null; }
            if (!res.ok) {
                const msg = (data && (data.message || data.error)) || ('HTTP ' + res.status);
                throw new Error(String(msg));
            }
            return data;
        }




        async function fetchEspnScoreboardRange(dates) {
            const url = 'https://site.api.espn.com/apis/site/v2/sports/soccer/tur.1/scoreboard?dates=' + dates;
            const res = await fetch(url);
            if (!res.ok) return [];
            const data = await res.json();
            return (data && data.events) ? data.events : [];
        }

        function parseEspnEvent(ev, leagueLabel) {
            if (!ev) return null;
            const comps = (ev.competitions && ev.competitions[0]) ? ev.competitions[0] : null;
            const competitors = (comps && comps.competitors) ? comps.competitors : [];
            let home = '', away = '', homeScore = '', awayScore = '';
            competitors.forEach(function(c) {
                const n = (c.team && (c.team.displayName || c.team.shortDisplayName)) || c.name || '';
                const sc = (c.score != null && c.score !== '') ? String(c.score) : '';
                if (c.homeAway === 'home') { home = n; homeScore = sc; }
                else if (c.homeAway === 'away') { away = n; awayScore = sc; }
            });
            if (!home && !away && ev.name) {
                const m = String(ev.name).split(' at ');
                if (m.length === 2) { away = m[0].trim(); home = m[1].trim(); }
            }
            const iso = String(ev.date || '');
            const date = iso.slice(0, 10);
            if (!home || !away || !date) return null;
            let score = '';
            if (homeScore !== '' && awayScore !== '') score = homeScore + ' - ' + awayScore;
            let time = '';
            try {
                const d = new Date(iso);
                if (!isNaN(d.getTime())) time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
            } catch (_) {}
            const status = (ev.status && ev.status.type && (ev.status.type.description || ev.status.type.name)) || '';
            let league = leagueLabel || '';
            if (!league && comps && comps.league) league = comps.league.name || comps.league.abbreviation || '';
            if (!league && ev.league) league = ev.league.name || ev.league.abbreviation || '';
            const isGs = isGalatasarayName(home) || isGalatasarayName(away);
            return {
                home: home,
                away: away,
                date: date,
                score: score,
                status: status,
                time: time,
                league: league || 'Süper Lig',
                isGs: isGs,
                key: matchDedupeKey(date, home, away),
                source: 'espn'
            };
        }

        async function loadSuperLigFixtures(force) {
            const CACHE_MS = 3 * 60 * 60 * 1000;
            if (!force && superLigFixturesCache.length && (Date.now() - superLigLastFetch) < CACHE_MS) {
                return superLigFixturesCache;
            }
            if (!force) {
                try {
                    const raw = localStorage.getItem('yuvam_superlig_fx');
                    if (raw) {
                        const parsed = JSON.parse(raw);
                        // sadece GS odaklı önbellek (v2)
                        if (parsed && parsed.v === 2 && parsed.at && (Date.now() - parsed.at) < CACHE_MS && Array.isArray(parsed.list) && parsed.list.length) {
                            superLigFixturesCache = parsed.list;
                            superLigLastFetch = parsed.at;
                            if (parsed.source) superLigFixturesCache._source = parsed.source;
                            return superLigFixturesCache;
                        }
                    }
                } catch (_) {}
            }

            let fixtures = [];
            const seen = {};

            function pushFx(f) {
                if (!f || !f.isGs || !f.date) return;
                const k = f.key || matchDedupeKey(f.date, f.home, f.away);
                if (seen[k]) return;
                seen[k] = true;
                f.key = k;
                fixtures.push(f);
            }

            // Süper Lig skorboard
            try {
                const ranges = ['20260801-20270531', '20250801-20260731'];
                for (let i = 0; i < ranges.length; i++) {
                    const events = await fetchEspnScoreboardRange(ranges[i]);
                    events.forEach(function(ev) {
                        pushFx(parseEspnEvent(ev, 'Süper Lig'));
                    });
                }
            } catch (e) {
                console.warn('ESPN SL', e);
            }

            // Avrupa + diğer kulvarlar (GS takım fikstürü)
            const schedulePaths = [
                { path: 'uefa.champions', label: 'Şampiyonlar Ligi' },
                { path: 'uefa.europa', label: 'Avrupa Ligi' },
                { path: 'uefa.europa.conf', label: 'Konferans Ligi' }
            ];
            for (let i = 0; i < schedulePaths.length; i++) {
                try {
                    const url = 'https://site.api.espn.com/apis/site/v2/sports/soccer/' + schedulePaths[i].path + '/teams/432/schedule';
                    const res = await fetch(url);
                    if (!res.ok) continue;
                    const data = await res.json();
                    (data.events || []).forEach(function(ev) {
                        pushFx(parseEspnEvent(ev, schedulePaths[i].label));
                    });
                } catch (_) {}
            }

            // TheSportsDB GS next/last yedek
            if (fixtures.length < 3) {
                try {
                    const urls = [
                        'https://www.thesportsdb.com/api/v1/json/3/eventsnext.php?id=133804',
                        'https://www.thesportsdb.com/api/v1/json/3/eventslast.php?id=133804'
                    ];
                    for (let i = 0; i < urls.length; i++) {
                        const res = await fetch(urls[i]);
                        if (!res.ok) continue;
                        const data = await res.json();
                        (data.events || []).forEach(function(ev) {
                            const home = ev.strHomeTeam || '';
                            const away = ev.strAwayTeam || '';
                            const date = String(ev.dateEvent || '').slice(0, 10);
                            if (!home || !away || !date) return;
                            const score = (ev.intHomeScore != null && ev.intAwayScore != null)
                                ? (ev.intHomeScore + ' - ' + ev.intAwayScore) : '';
                            pushFx({
                                home: home, away: away, date: date, score: score,
                                status: ev.strStatus || '',
                                time: (ev.strTimeLocal || ev.strTime || '').toString().slice(0, 5),
                                league: ev.strLeague || '',
                                isGs: true,
                                key: matchDedupeKey(date, home, away),
                                source: 'thesportsdb'
                            });
                        });
                    }
                } catch (_) {}
            }

            if (!fixtures.length) throw new Error('Galatasaray fikstürü alınamadı. Yenile ile tekrar deneyin.');

            fixtures.sort(function(a, b) {
                return String(a.date || '').localeCompare(String(b.date || ''));
            });
            superLigFixturesCache = fixtures;
            superLigLastFetch = Date.now();
            try {
                localStorage.setItem('yuvam_superlig_fx', JSON.stringify({ v: 2, at: superLigLastFetch, list: fixtures, source: 'ESPN' }));
            } catch (_) {}
            superLigFixturesCache._source = 'ESPN';
            return fixtures;
        }


        /** GS maçları 0–7 gün içindeyse aile takvimine ekle; çift kayıtları temizle */
        async function syncGsMatchesToCalendar(fixtures) {
            if (!currentUser || !db) return;
            const today = todayDateStr();

            // Mevcut sistem maç kayıtlarını grupla
            const byKey = {};
            const systemMatches = [];
            (familyCalendar || []).forEach(function(ev) {
                if (!ev) return;
                const isSys = ev.gsMatchKey || ev.source === 'collectapi-superlig' || ev.source === 'espn-gs' ||
                    (ev.type === 'match' && ev.by === 'Sistem');
                if (!isSys) return;
                systemMatches.push(ev);
                const k = ev.gsMatchKey || matchDedupeKey(ev.date, '', '') || (String(ev.date).slice(0, 10) + '|' + normTeamName(ev.title || ''));
                // title'dan da çıkar
                let key = ev.gsMatchKey;
                if (!key && ev.title) {
                    const t = String(ev.title).replace(/^🦁\\s*/, '');
                    const parts = t.split(/\\s*[–—-]\\s*/);
                    if (parts.length >= 2) key = matchDedupeKey(ev.date, parts[0], parts[1]);
                }
                if (!key) key = 'id-' + ev.id;
                if (!byKey[key]) byKey[key] = [];
                byKey[key].push(ev);
            });

            // Aynı maçın birden fazla kaydı varsa fazlaları sil
            for (const key of Object.keys(byKey)) {
                const group = byKey[key];
                if (group.length <= 1) continue;
                // en eski kaydı tut
                group.sort(function(a, b) {
                    return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
                });
                for (let i = 1; i < group.length; i++) {
                    try {
                        await db.collection('familyCalendar').doc(group[i].id).delete();
                    } catch (err) {
                        console.warn('dedupe delete', err);
                    }
                }
            }

            const existingKeys = new Set(Object.keys(byKey));
            // title tabanlı da ekle
            (familyCalendar || []).forEach(function(ev) {
                if (!ev || !ev.date) return;
                if (ev.title) {
                    const t = String(ev.title).replace(/^🦁\\s*/, '');
                    const parts = t.split(/\\s*[–—-]\\s*/);
                    if (parts.length >= 2) existingKeys.add(matchDedupeKey(ev.date, parts[0], parts[1]));
                }
            });

            const toAdd = (fixtures || []).filter(function(f) {
                if (!f || !f.isGs || !f.date) return false;
                const days = daysUntilYMD(f.date);
                if (days == null || days < 0 || days > 7) return false;
                const k = f.key || matchDedupeKey(f.date, f.home, f.away);
                if (existingKeys.has(k)) return false;
                return true;
            });

            for (let i = 0; i < toAdd.length; i++) {
                const f = toAdd[i];
                const title = '🦁 ' + f.home + ' – ' + f.away;
                const k = f.key || matchDedupeKey(f.date, f.home, f.away);
                try {
                    await db.collection('familyCalendar').add({
                        title: title,
                        date: f.date,
                        type: 'match',
                        repeat: 'none',
                        by: 'Sistem',
                        gsMatchKey: k,
                        source: 'espn-gs',
                        league: f.league || '',
                        createdAt: new Date().toISOString()
                    });
                    existingKeys.add(k);
                    showToast('GS maçı takvime eklendi: ' + formatDateTR(f.date), 'success');
                } catch (err) {
                    console.warn('gs cal add', err);
                }
            }
        }

        window.loadSuperLigFixtures = loadSuperLigFixtures;
        window.refreshSuperLigFixtures = async function(force) {
            try {
                const list = await loadSuperLigFixtures(!!force);
                try { await syncGsMatchesToCalendar(list); } catch (_) {}
                try {
                    if (typeof refreshAppNotifications === 'function') refreshAppNotifications();
                    const home = document.getElementById('tabContentHome');
                    if (home && !home.classList.contains('hidden') && typeof renderHomeTab === 'function') {
                        renderHomeTab();
                    }
                } catch (_) {}
                try {
                    if (document.getElementById('familyPlanList') && typeof renderPlanTab === 'function') {
                        const plan = document.getElementById('tabContentPlan');
                        if (plan && !plan.classList.contains('hidden')) renderPlanTab();
                    }
                } catch (_) {}
            } catch (err) {
                console.warn('GS fikstür', err && err.message ? err.message : err);
            }
        };


        // ——— Resmi tatiller (Nager.Date · Türkiye) ———
        async function loadPublicHolidays(force) {
            const CACHE_MS = 24 * 60 * 60 * 1000;
            if (!force && publicHolidaysCache.length && (Date.now() - publicHolidaysAt) < CACHE_MS) {
                return publicHolidaysCache;
            }
            if (!force) {
                try {
                    const raw = localStorage.getItem('yuvam_tr_holidays');
                    if (raw) {
                        const parsed = JSON.parse(raw);
                        if (parsed && parsed.at && (Date.now() - parsed.at) < CACHE_MS && Array.isArray(parsed.list)) {
                            publicHolidaysCache = parsed.list;
                            publicHolidaysAt = parsed.at;
                            return publicHolidaysCache;
                        }
                    }
                } catch (_) {}
            }
            const y = new Date().getFullYear();
            const years = [y, y + 1];
            let all = [];
            for (let i = 0; i < years.length; i++) {
                try {
                    const res = await fetch('https://date.nager.at/api/v3/PublicHolidays/' + years[i] + '/TR');
                    if (!res.ok) continue;
                    const data = await res.json();
                    if (Array.isArray(data)) all = all.concat(data);
                } catch (_) {}
            }
            // tekilleştir
            const seen = {};
            all = all.filter(function(h) {
                if (!h || !h.date) return false;
                if (seen[h.date]) return false;
                seen[h.date] = true;
                return true;
            }).sort(function(a, b) { return String(a.date).localeCompare(String(b.date)); });
            publicHolidaysCache = all;
            publicHolidaysAt = Date.now();
            try { localStorage.setItem('yuvam_tr_holidays', JSON.stringify({ at: publicHolidaysAt, list: all })); } catch (_) {}
            return all;
        }

        function renderPublicHolidaysList() {
            const box = document.getElementById('publicHolidaysList');
            if (!box) return;
            const today = todayDateStr();
            const upcoming = (publicHolidaysCache || []).filter(function(h) { return h.date && h.date >= today; }).slice(0, 12);
            const past = (publicHolidaysCache || []).filter(function(h) { return h.date && h.date < today; }).slice(-3);
            const show = upcoming.length ? upcoming : past.reverse();
            if (!show.length) {
                box.innerHTML = '<p class="text-xs text-slate-400 font-semibold text-center py-3">Tatil listesi yok</p>';
                return;
            }
            box.innerHTML = show.map(function(h) {
                const days = daysUntilYMD(h.date);
                const dayLab = days == null ? '' : (days < 0 ? 'geçti' : (days === 0 ? 'bugün' : days + ' gün'));
                const name = h.localName || h.name || 'Tatil';
                const cls = (days != null && days >= 0 && days <= 7) ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-100';
                return '<div class="flex gap-2 items-start p-2.5 rounded-xl border ' + cls + '">' +
                    '<span class="text-base shrink-0">🇹🇷</span>' +
                    '<div class="min-w-0 flex-1">' +
                    '<p class="text-sm font-bold text-slate-800">' + escapeHtml(name) + '</p>' +
                    '<p class="text-[11px] text-slate-500 font-semibold">' + formatDateTR(h.date) + (dayLab ? ' · ' + dayLab : '') + '</p>' +
                    '</div></div>';
            }).join('');
        }

        window.refreshPublicHolidays = async function(force) {
            const box = document.getElementById('publicHolidaysList');
            if (box) box.innerHTML = '<p class="text-xs text-slate-400 font-semibold text-center py-3">Yükleniyor…</p>';
            try {
                await loadPublicHolidays(!!force);
                renderPublicHolidaysList();
                try { if (typeof refreshAppNotifications === 'function') refreshAppNotifications(); } catch (_) {}
            } catch (err) {
                if (box) box.innerHTML = '<p class="text-xs text-rose-600 font-semibold p-2">' + escapeHtml(err.message || String(err)) + '</p>';
            }
        };


        window._familyCalPanelOpen = false;

        window.toggleFamilyCalPanel = function(forceOpen) {
            if (forceOpen === true) window._familyCalPanelOpen = true;
            else if (forceOpen === false) window._familyCalPanelOpen = false;
            else window._familyCalPanelOpen = !window._familyCalPanelOpen;
            const body = document.getElementById('familyCalPanelBody');
            const chev = document.getElementById('familyCalPanelChevron');
            const open = !!window._familyCalPanelOpen;
            if (body) body.classList.toggle('hidden', !open);
            if (chev) chev.textContent = open ? '▾' : '▸';
            if (open) {
                try { renderFamilyCalendarList(); } catch (_) {}
            }
        };

        window._familyCalOpen = window._familyCalOpen || {};

        window.toggleFamilyCalItem = function(id) {
            if (!id) return;
            window._familyCalOpen[id] = !window._familyCalOpen[id];
            // Listeyi yeniden çiz (buton metni Detayları gör / Gizle güncellensin)
            try { renderFamilyCalendarList(); } catch (_) {}
        };

        function renderFamilyCalendarList() {
            // Eski liste DOM'u gizli; Plan sekmesi kullanılıyor
            const list = document.getElementById('familyCalendarList');
            if (list) list.innerHTML = '';
        }

        window.renderCalendarTab = function() {
            try { if (typeof renderPlanTab === 'function') renderPlanTab(); } catch (_) {}
        };


        window.familyEditCalendar = function(id) {
            if (typeof familyEditPlan === 'function') familyEditPlan('cal', id);
        };


        window.familyCancelCalEdit = function() {
            if (typeof familyCancelPlanEdit === 'function') familyCancelPlanEdit();
        };


        window.familyAddCalendar = async function(e) {
            if (e && e.preventDefault) e.preventDefault();
            if (typeof showToast === 'function') showToast('Etkinlik eklemek için Plan formunu kullanın', 'info');
            try { if (typeof switchTab === 'function') switchTab('plan'); } catch (_) {}
        };


        window.renderTasksTab = function() {
            try { if (typeof renderPlanTab === 'function') renderPlanTab(); } catch (_) {}
        };

        window.familyEditTask = function(id) {
            if (typeof familyEditPlan === 'function') familyEditPlan('task', id);
        };


        window.familyCancelTaskEdit = function() {
            const eid = document.getElementById('famTaskEditId');
            if (eid) eid.value = '';
            const tx = document.getElementById('famTaskText');
            if (tx) tx.value = '';
            const due = document.getElementById('famTaskDue');
            if (due) due.value = '';
            const btn = document.getElementById('famTaskSubmitBtn');
            if (btn) btn.textContent = 'Ekle';
            const c = document.getElementById('famTaskCancelEdit');
            if (c) c.classList.add('hidden');
        };

        window.familyAddTask = async function(e) {
            if (e && e.preventDefault) e.preventDefault();
            if (typeof showToast === 'function') showToast('Görev eklemek için Plan formunu kullanın', 'info');
            try { if (typeof switchTab === 'function') switchTab('plan'); } catch (_) {}
        };


        window.familyToggleTask = async function(id, done) {
            if (!id) return;
            try {
                const t = (familyTasks || []).find(function(x) { return x.id === id; });
                if (done && t && (t.repeat === 'weekly' || t.repeat === 'monthly')) {
                    const base = t.due || todayDateStr();
                    const next = t.repeat === 'weekly' ? addDaysYMD(base, 7) : addMonthsYMD(base, 1);
                    await db.collection('familyTasks').doc(id).update({
                        done: false,
                        due: next,
                        lastCompletedAt: new Date().toISOString()
                    });
                    showToast('Tamam · sonraki: ' + formatDateTR(next), 'success');
                } else {
                    await db.collection('familyTasks').doc(id).update({ done: !!done });
                }
            } catch (err) { showToast(friendlyFirebaseError(err), 'error'); }
        };


        // ===== Birleşik Plan (görev + takvim) =====
        window._planFilter = 'all';

        window.onPlanKindChange = function() {
            const kind = (document.getElementById('famPlanKind') || {}).value || 'task';
            const asg = document.getElementById('famPlanAssignee');
            if (asg) {
                asg.disabled = (kind !== 'task');
                asg.style.opacity = kind === 'task' ? '1' : '0.5';
            }
            const rep = document.getElementById('famPlanRepeat');
            if (rep && (kind === 'birthday' || kind === 'anniversary')) {
                rep.value = 'yearly';
            }
        };

        window.setPlanFilter = function(f) {
            window._planFilter = f || 'all';
            ['all', 'task', 'cal'].forEach(function(k) {
                const el = document.getElementById('planFilter' + (k === 'all' ? 'All' : (k === 'task' ? 'Task' : 'Cal')));
                if (!el) return;
                const on = window._planFilter === k;
                el.className = 'text-[11px] font-bold px-3 py-1.5 rounded-full ' + (on ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600');
            });
            try { renderPlanTab(); } catch (_) {}
        };

        window.familyCancelPlanEdit = function() {
            const eid = document.getElementById('famPlanEditId');
            if (eid) eid.value = '';
            const src = document.getElementById('famPlanEditSource');
            if (src) src.value = '';
            const tx = document.getElementById('famPlanText');
            if (tx) tx.value = '';
            const btn = document.getElementById('famPlanSubmitBtn');
            if (btn) btn.textContent = 'Ekle';
            const c = document.getElementById('famPlanCancelEdit');
            if (c) c.classList.add('hidden');
        };

        window.familyEditPlan = function(source, id) {
            if (source === 'task') {
                const t = (familyTasks || []).find(function(x) { return x.id === id; });
                if (!t) return;
                document.getElementById('famPlanEditId').value = id;
                document.getElementById('famPlanEditSource').value = 'task';
                document.getElementById('famPlanText').value = t.text || '';
                document.getElementById('famPlanKind').value = 'task';
                document.getElementById('famPlanDate').value = t.due ? String(t.due).slice(0, 10) : '';
                document.getElementById('famPlanAssignee').value = t.assignee || 'Herkes';
                document.getElementById('famPlanRepeat').value = t.repeat || 'none';
            } else {
                const ev = (familyCalendar || []).find(function(x) { return x.id === id; });
                if (!ev) return;
                document.getElementById('famPlanEditId').value = id;
                document.getElementById('famPlanEditSource').value = 'cal';
                document.getElementById('famPlanText').value = ev.title || '';
                const kind = ['event', 'appointment', 'birthday', 'anniversary', 'other', 'match'].indexOf(ev.type) >= 0 ? (ev.type === 'match' ? 'event' : ev.type) : 'event';
                document.getElementById('famPlanKind').value = kind;
                document.getElementById('famPlanDate').value = String(ev.date || '').slice(0, 10);
                document.getElementById('famPlanRepeat').value = ev.repeat || 'none';
            }
            onPlanKindChange();
            const btn = document.getElementById('famPlanSubmitBtn');
            if (btn) btn.textContent = 'Güncelle';
            const c = document.getElementById('famPlanCancelEdit');
            if (c) c.classList.remove('hidden');
            const tx = document.getElementById('famPlanText');
            if (tx) tx.focus();
        };

        window._planSaving = false;
        window.familyAddPlan = async function(e) {
            if (e && e.preventDefault) e.preventDefault();
            if (window._planSaving) return;
            const text = ((document.getElementById('famPlanText') || {}).value || '').trim();
            if (!text) return;
            const kind = (document.getElementById('famPlanKind') || {}).value || 'task';
            const date = (document.getElementById('famPlanDate') || {}).value || '';
            const assignee = (document.getElementById('famPlanAssignee') || {}).value || 'Herkes';
            let repeat = (document.getElementById('famPlanRepeat') || {}).value || 'none';
            if (kind === 'birthday' || kind === 'anniversary') repeat = 'yearly';
            const editId = ((document.getElementById('famPlanEditId') || {}).value || '').trim();
            const editSrc = ((document.getElementById('famPlanEditSource') || {}).value || '').trim();
            const btn = document.getElementById('famPlanSubmitBtn');
            window._planSaving = true;
            if (btn) { btn.disabled = true; btn.textContent = 'Kaydediliyor…'; }
            try {
                // Tek kayıt: görev → familyTasks, diğerleri → familyCalendar (bir kez)
                if (kind === 'task') {
                    if (editId && editSrc === 'task') {
                        await db.collection('familyTasks').doc(editId).update({
                            text: text, due: date, assignee: assignee, repeat: repeat === 'yearly' ? 'none' : repeat,
                            updatedAt: new Date().toISOString(), updatedBy: (currentUser && currentUser.name) || ''
                        });
                        showToast('Görev güncellendi', 'success');
                    } else {
                        if (editId && editSrc === 'cal') {
                            try { await db.collection('familyCalendar').doc(editId).delete(); } catch (_) {}
                        }
                        await db.collection('familyTasks').add({
                            text: text, due: date, assignee: assignee, repeat: (repeat === 'yearly' ? 'none' : repeat),
                            done: false, by: (currentUser && currentUser.name) || '', createdAt: new Date().toISOString()
                        });
                        showToast('Görev eklendi', 'success');
                    }
                } else {
                    const type = kind === 'event' ? 'event' : kind;
                    if (editId && editSrc === 'cal') {
                        await db.collection('familyCalendar').doc(editId).update({
                            title: text, date: date || todayDateStr(), type: type, repeat: repeat,
                            updatedAt: new Date().toISOString(), updatedBy: (currentUser && currentUser.name) || ''
                        });
                        showToast('Güncellendi', 'success');
                    } else {
                        if (editId && editSrc === 'task') {
                            try { await db.collection('familyTasks').doc(editId).delete(); } catch (_) {}
                        }
                        await db.collection('familyCalendar').add({
                            title: text, date: date || todayDateStr(), type: type, repeat: repeat,
                            by: (currentUser && currentUser.name) || '', createdAt: new Date().toISOString()
                        });
                        showToast('Eklendi', 'success');
                    }
                }
                familyCancelPlanEdit();
                const tx = document.getElementById('famPlanText');
                if (tx) tx.value = '';
                // Anında listeyi yenile (snapshot beklemeden)
                try { renderPlanTab(); } catch (_) {}
            } catch (err) { showToast(friendlyFirebaseError(err), 'error'); }
            finally {
                window._planSaving = false;
                if (btn) { btn.disabled = false; btn.textContent = 'Ekle'; }
            }
        };

        window.renderPlanTab = function() {
            const list = document.getElementById('familyPlanList');
            if (!list) {
                try { if (typeof renderTasksTab === 'function') renderTasksTab(); } catch (_) {}
                try { if (typeof renderCalendarTab === 'function') renderCalendarTab(); } catch (_) {}
                return;
            }
            const f = window._planFilter || 'all';

            const items = [];
            if (f === 'all' || f === 'task') {
                (familyTasks || []).forEach(function(t) {
                    items.push({
                        source: 'task',
                        id: t.id,
                        title: t.text || '-',
                        date: t.due || '',
                        done: !!t.done,
                        meta: (t.assignee && t.assignee !== 'Herkes' ? t.assignee : 'Herkes') +
                            (t.repeat && t.repeat !== 'none' ? ' · 🔁 ' + taskRepeatLabel(t.repeat) : ''),
                        sort: t.due || '9999-12-31'
                    });
                });
            }
            if (f === 'all' || f === 'cal') {
                // Fikstür/maç kayıtları Super Lig kutusunda — listede tekrarlama
                const seenCal = new Set();
                (familyCalendar || []).forEach(function(ev) {
                    if (!ev) return;
                    if (ev.type === 'match' || ev.source === 'espn-gs' || ev.gsMatchKey) return;
                    const tit = String(ev.title || '');
                    if (/^🦁/.test(tit) || (/\b(galatasaray|gs)\b/i.test(tit) && /[–—-]/.test(tit))) return;
                    const dedupe = String(ev.date || '') + '|' + tit.toLowerCase();
                    if (seenCal.has(dedupe)) return;
                    seenCal.add(dedupe);
                    const eff = (typeof eventEffectiveDate === 'function') ? eventEffectiveDate(ev) : String(ev.date || '');
                    items.push({
                        source: 'cal',
                        id: ev.id,
                        title: ev.title || '-',
                        date: eff,
                        done: false,
                        meta: (typeof calTypeIcon === 'function' ? calTypeIcon(ev.type) + ' ' : '') +
                            (typeof calTypeLabel === 'function' ? calTypeLabel(ev.type) : (ev.type || 'Etkinlik')) +
                            (ev.repeat === 'yearly' ? ' · her yıl' : ''),
                        sort: eff || '9999-12-31'
                    });
                });
            }
            items.sort(function(a, b) {
                if (a.done !== b.done) return a.done ? 1 : -1;
                return String(a.sort).localeCompare(String(b.sort));
            });
            if (!items.length) {
                list.innerHTML = f === 'task'
                    ? yuvamEmptyState('✅', 'Görev yok', 'Yeni görev ekleyin', null, null)
                    : (f === 'cal'
                        ? yuvamEmptyState('📅', 'Takvim boş', 'Etkinlik veya randevu ekleyin', null, null)
                        : yuvamEmptyState('📋', 'Plan boş', 'Görev veya etkinlik ekleyin', null, null));
            } else {
                list.innerHTML = items.map(function(it) {
                    const due = it.date ? formatDateTR(it.date) : 'Tarihsiz';
                    const days = it.date && typeof daysUntilYMD === 'function' ? daysUntilYMD(it.date) : null;
                    const badge = days == null ? '' : (days < 0 ? ' · geçti' : (days === 0 ? ' · bugün' : ' · ' + days + ' gün'));
                    const title = (it.done ? '<span class="line-through opacity-60">' : '') + escapeHtml(it.title) + (it.done ? '</span>' : '');
                    const sub = (it.source === 'task' ? '✅ Görev' : '📅 Takvim') + ' · ' + due + badge + (it.meta ? ' · ' + escapeHtml(it.meta) : '');
                    const editB = '<button type="button" onclick="familyEditPlan(\'' + it.source + '\',\'' + escapeHtml(it.id) + '\')" class="text-xs font-bold text-sky-600 px-2 py-1 rounded-lg hover:bg-sky-50">Düzenle</button>';
                    const tog = it.source === 'task'
                        ? '<button type="button" onclick="familyToggleTask(\'' + escapeHtml(it.id) + '\',' + (it.done ? 'false' : 'true') + ')" class="text-xs font-bold px-2 py-1 rounded-lg ' +
                          (it.done ? 'text-slate-500 bg-slate-100' : 'text-emerald-700 bg-emerald-50') + '">' + (it.done ? 'Geri al' : 'Tamam') + '</button>'
                        : '';
                    const col = it.source === 'task' ? 'familyTasks' : 'familyCalendar';
                    const del = '<button type="button" onclick="familyDelete(\'' + col + '\',\'' + escapeHtml(it.id) + '\')" class="text-xs font-bold text-rose-600 px-2 py-1 rounded-lg hover:bg-rose-50">Sil</button>';
                    return familyRow(title, sub, editB + tog + del);
                }).join('');
            }
            const dInp = document.getElementById('famPlanDate');
            if (dInp && !dInp.value) dInp.value = todayDateStr();
            try { onPlanKindChange(); } catch (_) {}
            // Notlar + IBAN (plan altında)
            try { if (typeof ensureLazyCollection === 'function') { ensureLazyCollection('notes'); ensureLazyCollection('ibans'); } } catch (_) {}
            try { if (typeof renderNotesList === 'function') renderNotesList(); } catch (_) {}
            try { if (typeof renderIbans === 'function') renderIbans(); } catch (_) {}
        };

        // Eski isimler → plan
        window.renderTasksTab = function() {
            try { if (typeof renderPlanTab === 'function') renderPlanTab(); } catch (_) {}
        };

        window.renderCalendarTab = function() {
            try { if (typeof renderPlanTab === 'function') renderPlanTab(); } catch (_) {}
        };

        window.renderShoppingTab = function() {
            const list = document.getElementById('familyShopList');
            if (!list) return;
            const open = (familyShopping || []).filter(function(x) { return !x.bought; });
            const bought = (familyShopping || []).filter(function(x) { return x.bought; });
            const sorted = open.concat(bought);
            const openN = open.length;
            const sumEl = document.getElementById('familyShopSummary');
            if (sumEl) sumEl.textContent = openN + ' ürün alınacak' + (bought.length ? ' · ' + bought.length + ' alındı' : '');
            if (!sorted.length) {
                list.innerHTML = yuvamEmptyState('🛒', 'Alışveriş listesi boş', 'Market veya ev ihtiyaçlarını ekleyin', null, null);
                return;
            }
            list.innerHTML = sorted.map(function(x) {
                const main = (x.bought ? '<span class="line-through opacity-50">' : '') + escapeHtml(x.name || '-') + (x.bought ? '</span>' : '');
                const qty = x.qty ? String(x.qty) : '';
                const sub = [qty, x.category, x.by].filter(Boolean).join(' · ');
                const tog = '<button type="button" onclick="familyToggleShop(\'' + escapeHtml(x.id) + '\',' + (x.bought ? 'false' : 'true') + ')" class="text-xs font-bold px-2 py-1 rounded-lg ' +
                    (x.bought ? 'text-slate-500 bg-slate-100' : 'text-sky-700 bg-sky-50') + '">' + (x.bought ? 'Geri' : 'Alındı') + '</button>';
                const del = '<button type="button" onclick="familyDelete(\'familyShopping\',\'' + escapeHtml(x.id) + '\')" class="text-xs font-bold text-rose-600 px-2 py-1 rounded-lg hover:bg-rose-50">Sil</button>';
                return familyRow(main, escapeHtml(sub || '—'), tog + del);
            }).join('');
        };

        window.familyAddShop = async function(e) {
            e.preventDefault();
            const name = ((document.getElementById('famShopName') || {}).value || '').trim();
            if (!name) return;
            const qty = ((document.getElementById('famShopQty') || {}).value || '').trim();
            const category = (document.getElementById('famShopCat') || {}).value || 'Market';
            try {
                await db.collection('familyShopping').add({
                    name: name,
                    qty: qty,
                    category: category,
                    bought: false,
                    by: (currentUser && currentUser.name) || '',
                    createdAt: new Date().toISOString()
                });
                document.getElementById('famShopName').value = '';
                document.getElementById('famShopQty').value = '';
                showToast('Listeye eklendi', 'success');
            } catch (err) { showToast(friendlyFirebaseError(err), 'error'); }
        };

        window.familyToggleShop = async function(id, bought) {
            if (!id) return;
            try {
                await db.collection('familyShopping').doc(id).update({ bought: !!bought });
            } catch (err) { showToast(friendlyFirebaseError(err), 'error'); }
        };

        window.familyDelete = async function(col, id) {
            if (!col || !id) return;
            if (!confirm('Silinsin mi?')) return;
            try {
                // Önce yerel listeden çıkar → UI anında güncellenir
                if (col === 'familyTasks') {
                    familyTasks = (familyTasks || []).filter(function(t) { return t && t.id !== id; });
                } else if (col === 'familyCalendar') {
                    familyCalendar = (familyCalendar || []).filter(function(t) { return t && t.id !== id; });
                } else if (col === 'familyShopping') {
                    familyShopping = (familyShopping || []).filter(function(t) { return t && t.id !== id; });
                }
                try {
                    if (col === 'familyTasks' || col === 'familyCalendar') {
                        if (typeof renderPlanTab === 'function') renderPlanTab();
                    }
                    if (col === 'familyShopping' && typeof renderShoppingTab === 'function') renderShoppingTab();
                    if (typeof renderHomeTab === 'function') {
                        const home = document.getElementById('tabContentHome');
                        if (home && !home.classList.contains('hidden')) renderHomeTab();
                    }
                } catch (_) {}
                await db.collection(col).doc(id).delete();
                showToast('Silindi', 'info');
            } catch (err) {
                showToast(friendlyFirebaseError(err), 'error');
                // Hata olursa snapshot zaten eski hali getirir
            }
        };

        window.familyClearBoughtShop = async function() {
            const bought = (familyShopping || []).filter(function(x) { return x.bought; });
            if (!bought.length) { showToast('Alınan ürün yok', 'info'); return; }
            if (!confirm(bought.length + ' alınan ürün listeden silinsin mi?')) return;
            try {
                await Promise.all(bought.map(function(x) { return db.collection('familyShopping').doc(x.id).delete(); }));
                showToast('Temizlendi', 'success');
            } catch (err) { showToast(friendlyFirebaseError(err), 'error'); }
        };

        window.openMobileMoreSheet = function() {
            const sheet = document.getElementById('mobileMoreSheet');
            if (!sheet) return;
            sheet.classList.remove('hidden');
            sheet.style.display = 'flex';
        };

        window.closeMobileMoreSheet = function() {
            const sheet = document.getElementById('mobileMoreSheet');
            if (!sheet) return;
            sheet.classList.add('hidden');
            sheet.style.display = 'none';
        };

        window.mobileNavGo = function(tabId) {
            if (tabId === 'more') {
                const sheet = document.getElementById('mobileMoreSheet');
                if (sheet && !sheet.classList.contains('hidden')) {
                    closeMobileMoreSheet();
                } else {
                    openMobileMoreSheet();
                }
                return;
            }
            closeMobileMoreSheet();
            switchTab(tabId);
        };

        // Ana sayfa + finans kart görünürlüğü (Ayarlar)
        const DASH_CARD_KEYS = [
            'total', 'bekir', 'duygu', 'debt',
            'homeToday', 'homePeriod', 'homeGold', 'homeQuickAdd', 'homeBudget', 'homeAgenda'
        ];



        // ——— Sayfa düzeni (kalıcı: localStorage + Firebase) ———
        let layoutEditPage = null;
        let pageLayoutsCloud = {}; // settings/pageLayouts

        function currentLayoutPageId() {
            const tabs = document.querySelectorAll('[id^="tabContent"]');
            for (let i = 0; i < tabs.length; i++) {
                const el = tabs[i];
                if (el.classList && !el.classList.contains('hidden')) {
                    return el.id.replace(/^tabContent/, '').toLowerCase();
                }
            }
            if (typeof currentTab !== 'undefined' && currentTab) return String(currentTab).toLowerCase();
            return 'home';
        }

        function layoutContainer(page) {
            if (!page) return null;
            const id = 'tabContent' + page.charAt(0).toUpperCase() + page.slice(1);
            let el = document.getElementById(id);
            if (el) return el;
            const all = document.querySelectorAll('[id^="tabContent"]');
            for (let i = 0; i < all.length; i++) {
                if (all[i].id.toLowerCase() === ('tabcontent' + page).toLowerCase()) return all[i];
            }
            return null;
        }

        function hashStr(s) {
            let h = 0;
            for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0;
            return h;
        }

        function ensureLayoutBlocks(root, page) {
            if (!root) return;
            let n = 0;
            Array.prototype.forEach.call(root.children, function(ch) {
                if (!ch || ch.nodeType !== 1) return;
                if (ch.getAttribute('data-layout-fixed') === '1') return;
                if (ch.classList && ch.classList.contains('home-hero')) {
                    ch.setAttribute('data-layout-fixed', '1');
                    return;
                }
                if (ch.id === 'homeHeroBanner') {
                    ch.setAttribute('data-layout-fixed', '1');
                    return;
                }
                const text = (ch.textContent || '').trim();
                if (!text || text.length < 2) return;
                if (ch.getAttribute('data-layout-block')) return;
                // stabil kimlik: mevcut sabit id varsa onu kullan
                const stable = ch.getAttribute('data-home-card') || ch.id || '';
                n += 1;
                const id = stable
                    ? String(stable)
                    : (page + '_b' + n + '_' + Math.abs(hashStr((ch.className || '') + text.slice(0, 32))).toString(36).slice(0, 6));
                ch.setAttribute('data-layout-block', id);
            });
        }

        function getLayoutOrder(page) {
            // Önce bulut, sonra local
            if (pageLayoutsCloud && Array.isArray(pageLayoutsCloud[page]) && pageLayoutsCloud[page].length) {
                return pageLayoutsCloud[page].slice();
            }
            try {
                const raw = localStorage.getItem('yuvam_layout_' + page);
                if (raw) {
                    const arr = JSON.parse(raw);
                    if (Array.isArray(arr) && arr.length) return arr;
                }
            } catch (_) {}
            return [];
        }

        function saveLayoutOrder(page, order) {
            try { localStorage.setItem('yuvam_layout_' + page, JSON.stringify(order)); } catch (_) {}
            pageLayoutsCloud[page] = order.slice();
            try {
                if (typeof db !== 'undefined' && db) {
                    const payload = {};
                    payload[page] = order;
                    payload.updatedAt = new Date().toISOString();
                    db.collection('settings').doc('pageLayouts').set(payload, { merge: true }).catch(function() {});
                }
            } catch (_) {}
        }

        function collectLayoutBlocks(root) {
            const list = [];
            Array.prototype.forEach.call(root.children, function(ch) {
                if (!ch.getAttribute) return;
                if (ch.getAttribute('data-layout-fixed') === '1') return;
                const id = ch.getAttribute('data-layout-block');
                if (id) list.push({ id: id, el: ch });
            });
            return list;
        }

        window.applyPageLayout = function(page) {
            page = (page || currentLayoutPageId() || 'home').toLowerCase();
            const root = layoutContainer(page);
            if (!root) return;

            // Hero / sabitler her zaman EN ÜSTE
            const fixedNodes = [];
            Array.prototype.forEach.call(root.children, function(ch) {
                if (!ch.getAttribute) return;
                if (ch.getAttribute('data-layout-fixed') === '1' || (ch.classList && ch.classList.contains('home-hero')) || ch.id === 'homeHeroBanner') {
                    ch.setAttribute('data-layout-fixed', '1');
                    // asla layout-block olmasın
                    ch.removeAttribute('data-layout-block');
                    fixedNodes.push(ch);
                }
            });

            ensureLayoutBlocks(root, page);
            const blocks = collectLayoutBlocks(root);
            const byId = {};
            blocks.forEach(function(b) { byId[b.id] = b.el; });

            let order = getLayoutOrder(page).filter(function(id) { return !!byId[id]; });
            blocks.forEach(function(b) {
                if (order.indexOf(b.id) < 0) order.push(b.id);
            });
            // Plan sayfası sabit sıra: Plan → Not yaz → Notlar → IBAN
            if (page === 'plan') {
                const forced = ['planMain', 'planNotesForm', 'planNotesList', 'planIban'];
                order = forced.filter(function(id) { return !!byId[id]; });
                blocks.forEach(function(b) {
                    if (order.indexOf(b.id) < 0) order.push(b.id);
                });
            }

            // DOM: önce sabitler, sonra sıra
            fixedNodes.forEach(function(ch) { root.appendChild(ch); });
            order.forEach(function(id) {
                if (byId[id]) root.appendChild(byId[id]);
            });
            // order'ı local+cloud'a yazma her apply'da şişmesin; sadece move'da kaydet
            // ama ilk keşfedilen eksik id'leri de kalıcı yap
            if (order.length) {
                try { localStorage.setItem('yuvam_layout_' + page, JSON.stringify(order)); } catch (_) {}
            }

            blocks.forEach(function(b) {
                const el = b.el;
                let bar = null;
                for (let i = 0; i < el.children.length; i++) {
                    if (el.children[i].classList && el.children[i].classList.contains('layout-edit-bar')) {
                        bar = el.children[i];
                        break;
                    }
                }
                if (layoutEditPage === page) {
                    if (!bar) {
                        bar = document.createElement('div');
                        bar.className = 'layout-edit-bar';
                        bar.innerHTML = '<span class="layout-edit-label">Taşı</span>' +
                            '<button type="button" class="layout-btn" data-dir="up">↑</button>' +
                            '<button type="button" class="layout-btn" data-dir="down">↓</button>';
                        el.insertBefore(bar, el.firstChild);
                        bar.addEventListener('click', function(ev) {
                            ev.preventDefault();
                            ev.stopPropagation();
                            const btn = ev.target.closest('[data-dir]');
                            if (!btn) return;
                            moveLayoutBlock(page, b.id, btn.getAttribute('data-dir'));
                        });
                    }
                    bar.style.display = 'flex';
                    el.classList.add('layout-edit-on');
                    const pos = window.getComputedStyle(el).position;
                    if (!pos || pos === 'static') el.style.position = 'relative';
                } else {
                    if (bar) bar.style.display = 'none';
                    el.classList.remove('layout-edit-on');
                }
            });
        };

        function moveLayoutBlock(page, id, dir) {
            const root = layoutContainer(page);
            if (!root) return;
            ensureLayoutBlocks(root, page);
            const blocks = collectLayoutBlocks(root);
            let order = getLayoutOrder(page).filter(function(x) {
                return blocks.some(function(b) { return b.id === x; });
            });
            blocks.forEach(function(b) {
                if (order.indexOf(b.id) < 0) order.push(b.id);
            });
            const i = order.indexOf(id);
            if (i < 0) return;
            const j = dir === 'up' ? i - 1 : i + 1;
            if (j < 0 || j >= order.length) return;
            const t = order[i];
            order[i] = order[j];
            order[j] = t;
            saveLayoutOrder(page, order);
            applyPageLayout(page);
            if (typeof showToast === 'function') showToast('Sıra kaydedildi (cihaz + bulut)', 'success');
        }


        // Duygu: açık/koyu + ocean/warm/forest döngüsü
        const USER_THEME_CYCLE = [
            { theme: 'light', palette: 'ocean', icon: '🌊', label: 'Ocean · Açık' },
            { theme: 'dark', palette: 'ocean', icon: '🌊', label: 'Ocean · Koyu' },
            { theme: 'light', palette: 'warm', icon: '🏠', label: 'Warm · Açık' },
            { theme: 'dark', palette: 'warm', icon: '🏠', label: 'Warm · Koyu' },
            { theme: 'light', palette: 'forest', icon: '🌲', label: 'Forest · Açık' },
            { theme: 'dark', palette: 'forest', icon: '🌲', label: 'Forest · Koyu' }
        ];

        function currentUserThemeIndex() {
            const t = (typeof appTheme !== 'undefined' && appTheme === 'dark') ? 'dark' : 'light';
            const p = (typeof themePalette !== 'undefined' && themePalette) ? themePalette : 'ocean';
            for (let i = 0; i < USER_THEME_CYCLE.length; i++) {
                if (USER_THEME_CYCLE[i].theme === t && USER_THEME_CYCLE[i].palette === p) return i;
            }
            return 0;
        }

        window.toggleUserTheme = function() {
            try {
                const i = currentUserThemeIndex();
                const next = USER_THEME_CYCLE[(i + 1) % USER_THEME_CYCLE.length];
                if (typeof setThemePalette === 'function') setThemePalette(next.palette);
                if (typeof setAppTheme === 'function') setAppTheme(next.theme);
                const icon = document.getElementById('userThemeBtnIcon');
                if (icon) icon.textContent = next.icon;
                if (typeof showToast === 'function') showToast(next.label, 'info');
            } catch (e) { console.warn(e); }
        };

        window.updateUserThemeBtn = function() {
            const btn = document.getElementById('userThemeBtn');
            if (!btn) return;
            const show = currentUser && typeof isAdmin === 'function' && !isAdmin();
            btn.classList.toggle('hidden', !show);
            const icon = document.getElementById('userThemeBtnIcon');
            if (icon) {
                const cur = USER_THEME_CYCLE[currentUserThemeIndex()];
                icon.textContent = cur ? cur.icon : '🌊';
            }
        };

        window.updateAdminLayoutButtons = function() {
            const admin = typeof isAdmin === 'function' && isAdmin();
            ['layoutEditBtn'].forEach(function(id) {
                const b = document.getElementById(id);
                if (!b) return;
                if (admin) b.classList.remove('hidden');
                else {
                    b.classList.add('hidden');
                    if (layoutEditPage) layoutEditPage = null;
                }
            });
            try { if (typeof updateUserThemeBtn === 'function') updateUserThemeBtn(); } catch (_) {}
        };

        window.toggleLayoutEdit = function(page) {
            try {
                if (typeof isAdmin === 'function' && !isAdmin()) {
                    if (typeof showToast === 'function') showToast('Sayfa düzeni sadece admin için', 'error');
                    return;
                }
                page = (page || currentLayoutPageId() || 'home').toLowerCase();
                layoutEditPage = (layoutEditPage === page) ? null : page;
                applyPageLayout(page);
                const on = layoutEditPage === page;
                if (typeof showToast === 'function') {
                    showToast(on ? 'Düzen açık — ↑ ↓ ile taşıyın (kalıcı kaydedilir)' : 'Düzen kapandı', 'info');
                }
                const btn = document.getElementById('layoutEditBtn');
                if (btn) {
                    btn.classList.toggle('ring-2', on);
                    btn.classList.toggle('ring-indigo-400', on);
                    btn.textContent = on ? '✓ Düzen' : '📐 Düzen';
                }
            } catch (err) {
                console.error(err);
                alert('Düzen hatası: ' + (err.message || err));
            }
        };

        window.toggleLayoutEditCurrent = function() {
            toggleLayoutEdit(currentLayoutPageId());
        };

        window.applyDashboardCards = function() {
            const dc = dashboardCards || {};
            document.querySelectorAll('[data-dash-card]').forEach(function(el) {
                const k = el.getAttribute('data-dash-card');
                const on = dc[k] !== false;
                el.classList.toggle('hidden', !on);
            });
            document.querySelectorAll('[data-home-card]').forEach(function(el) {
                const k = el.getAttribute('data-home-card');
                const on = dc[k] !== false;
                el.classList.toggle('hidden', !on);
            });
            DASH_CARD_KEYS.forEach(function(k) {
                const cb = document.getElementById('cardVis_' + k);
                if (cb) cb.checked = dc[k] !== false;
            });
        };

        window.saveDashboardCards = async function() {
            if (!isAdmin()) { showToast('Sadece admin', 'error'); return; }
            const next = Object.assign({}, dashboardCards);
            DASH_CARD_KEYS.forEach(function(k) {
                const cb = document.getElementById('cardVis_' + k);
                if (cb) next[k] = !!cb.checked;
            });
            dashboardCards = next;
            try {
                await db.collection('settings').doc('uiPrefs').set({ dashboardCards: next }, { merge: true });
                applyDashboardCards();
                showToast('Kart görünürlüğü kaydedildi', 'success');
            } catch (err) {
                showToast(friendlyFirebaseError(err), 'error');
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
        function getAutoCardDueDate() {
            const p = (typeof getCurrentStatementPeriod === 'function') ? getCurrentStatementPeriod() : null;
            if (p && p.endDate) return formatYMD(p.endDate);
            // yedek: ayın 28'i
            const d = new Date();
            const end = new Date(d.getFullYear(), d.getMonth(), 28);
            if (d.getDate() > 28) end.setMonth(end.getMonth() + 1);
            return formatYMD(end);
        }

        window.openCardDebtModal = (person) => {
            const modal = document.getElementById('cardDebtModal');
            if (!modal) {
                alert('Borç penceresi yüklenemedi. Ctrl+F5 ile yenileyin.');
                return;
            }
            const key = (person === 'bekir' || person === 'Bekir') ? 'bekir'
                : (person === 'duygu' || person === 'Duygu') ? 'duygu' : '';
            const sel = document.getElementById('cardDebtPerson');
            if (sel && key) sel.value = key;
            else if (sel && !sel.value) sel.value = 'bekir';

            const who = (sel && sel.value) ? sel.value : 'bekir';
            const title = document.getElementById('cardDebtModalTitle');
            if (title) title.innerText = (who === 'bekir' ? 'Bekir' : 'Duygu') + ' — Kart borcu';

            const amt = document.getElementById('cardDebtAmount');
            if (amt) amt.value = '';

            const due = getAutoCardDueDate();
            const hint = document.getElementById('cardDebtDueHint');
            if (hint) {
                const p = getCurrentStatementPeriod();
                hint.textContent = 'Son ödeme: ' + formatDateTR(due) + (p && p.label ? ' · Dönem: ' + p.label : '');
            }

            modal.classList.remove('hidden');
            modal.classList.add('flex');
        };
        window.closeCardDebtModal = () => {
            const modal = document.getElementById('cardDebtModal');
            if (!modal) return;
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        };

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
                const prev = select.value;
                select.innerHTML = categories.map(c => `<option value="${c}">${c}</option>`).join('');
                if (prev && categories.indexOf(prev) >= 0) select.value = prev;
            }
            if(filterSelect) {
                filterSelect.innerHTML = `<option value="Tümü">Tümü</option>` + categories.map(c => `<option value="${c}">${c}</option>`).join('');
            }
            try { if (typeof refreshExpensePaymentOptions === 'function') refreshExpensePaymentOptions(); } catch (_) {}
        }

        function normCatKey(cat) {
            return String(cat || '').toLocaleLowerCase('tr-TR')
                .replace(/ı/g, 'i').replace(/İ/g, 'i')
                .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
                .replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/\s+/g, '');
        }

        function isAlisverisCategory(cat) {
            const s = normCatKey(cat);
            return s.indexOf('alisveris') >= 0 || s === 'market' || s === 'shopping';
        }

        function isLegacyShopCategory(cat) {
            const s = normCatKey(cat);
            return s === 'gida' || s.indexOf('gida') === 0 || s === 'giyim' || s.indexOf('eticaret') >= 0 || s === 'e-ticaret';
        }

        window.isLegacyShopCategory = isLegacyShopCategory;

        /** Harcama formu ödeme tipi: Alışveriş seçiliyken Multinet eklenir */
        window.refreshExpensePaymentOptions = function() {
            const select = document.getElementById('paymentType');
            if (!select) return;
            const catEl = document.getElementById('category');
            const cat = catEl ? catEl.value : '';
            let opts = Array.isArray(paymentTypes) && paymentTypes.length
                ? paymentTypes.slice()
                : ['Nakit', 'Kredi Kartı'];
            // Multinet yalnızca Alışveriş'te
            opts = opts.filter(function(p) {
                const s = String(p || '').toLocaleLowerCase('tr-TR');
                return s.indexOf('multinet') < 0;
            });
            if (isAlisverisCategory(cat)) opts.push('Multinet');
            const prev = select.value;
            select.innerHTML = opts.map(function(p) {
                return '<option value="' + String(p).replace(/"/g, '&quot;') + '">' + String(p) + '</option>';
            }).join('');
            if (opts.indexOf(prev) >= 0) select.value = prev;
            else if (opts.length) select.value = opts[0];
        };

        function updatePaymentSelects() {
            const filterSelect = document.getElementById('filterPayment');
            let base = Array.isArray(paymentTypes) && paymentTypes.length
                ? paymentTypes.slice()
                : ['Nakit', 'Kredi Kartı'];
            // Filtrede Multinet her zaman görünsün
            const hasMn = base.some(function(p) {
                return String(p || '').toLocaleLowerCase('tr-TR').indexOf('multinet') >= 0;
            });
            if (!hasMn) base = base.concat(['Multinet']);
            if (filterSelect) {
                filterSelect.innerHTML = '<option value="Tümü">Tümü</option>' + base.map(function(p) {
                    return '<option value="' + String(p).replace(/"/g, '&quot;') + '">' + String(p) + '</option>';
                }).join('');
            }
            try { refreshExpensePaymentOptions(); } catch (_) {}
        }

        // Realtime Sync (Firebase)
        function initRealtimeSync() {
            if (syncInitialized) return;
            syncInitialized = true;
            loadDeletedExpenses();

            db.collection("expenses").onSnapshot(snap => {
                expenses = snap.docs.map(function(d) {
                    const row = Object.assign({ id: d.id }, d.data());
                    if (row.billSubtype === 'Platform') row.billSubtype = 'Abonelik';
                    // Eski Gıda/Giyim/E-ticaret → Alışveriş (alt tür boş; kullanıcı düzeltir)
                    if (typeof isLegacyShopCategory === 'function' && isLegacyShopCategory(row.category)) {
                        if (normCatKey(row.category).indexOf('eticaret') >= 0 || row.category === 'E-ticaret') {
                            row.isEcommerce = true;
                        }
                        row.category = 'Alışveriş';
                        if (row.shopSubtype == null) row.shopSubtype = '';
                    }
                    return row;
                });
                scheduleRenderApp();
                try { migrateLegacyShopCategoriesToFirestore(); } catch (_) {}
            });
            // notes / ibans / familyShopping: lazy (ensureLazyCollection)
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
                    categories = d.data().list.map(function(c) { return c === 'Ulaşım' ? 'Araç' : c; });
                    // Gıda / Giyim / E-ticaret üst kategoriden kaldır → Alışveriş
                    categories = categories.filter(function(c) { return !isLegacyShopCategory(c); });
                    categories = [...new Set(categories)];
                    if (!categories.includes('Araç')) categories.splice(Math.min(1, categories.length), 0, 'Araç');
                    if (!categories.some(function(c) { return isAlisverisCategory(c); })) {
                        categories.unshift('Alışveriş');
                    }
                    // Alışveriş alt türlerini garanti et
                    if (!categorySubtypes['Alışveriş'] || !categorySubtypes['Alışveriş'].length) {
                        categorySubtypes['Alışveriş'] = (DEFAULT_CATEGORY_SUBTYPES['Alışveriş'] || []).slice();
                    }
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
                // Platform → Abonelik
                Object.keys(categorySubtypes || {}).forEach(function(cat) {
                    if (!Array.isArray(categorySubtypes[cat])) return;
                    categorySubtypes[cat] = categorySubtypes[cat].map(function(s) {
                        return s === 'Platform' ? 'Abonelik' : s;
                    });
                    categorySubtypes[cat] = [...new Set(categorySubtypes[cat])];
                });
                if (!categorySubtypes['Faturalar']) categorySubtypes['Faturalar'] = DEFAULT_CATEGORY_SUBTYPES['Faturalar'].slice();
                if (categorySubtypes['Faturalar'].indexOf('Abonelik') < 0) categorySubtypes['Faturalar'].push('Abonelik');
                updateCategorySelects();
                if (typeof fillSubtypeSelects === 'function') fillSubtypeSelects();
                renderCategoriesList();
            }, err => console.warn('categorySubtypes:', err));
            
            // period + budget — hafif, erken
            db.collection("settings").doc("periodConfig").onSnapshot(d => {
                if (d.exists && d.data()) {
                    const p = d.data();
                    periodConfig = {
                        startDay: Number(p.startDay) || 29,
                        endDay: Number(p.endDay) || 28
                    };
                    try { applyPeriodConfigToForm(); } catch (_) {}
                    scheduleRenderApp();
                }
            }, err => console.warn('periodConfig', err));
            db.collection("settings").doc("budgetTarget").onSnapshot(d => {
                if (d.exists && d.data()) {
                    monthlyBudgetTarget = Number(d.data().amount) || 0;
                    const inp = document.getElementById('budgetTargetInput');
                    if (inp && document.activeElement !== inp) inp.value = monthlyBudgetTarget > 0 ? String(monthlyBudgetTarget) : '';
                } else {
                    monthlyBudgetTarget = 0;
                }
                if (typeof renderBudgetInfo === 'function') renderBudgetInfo();
            }, err => console.warn('budgetTarget', err));
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
                try { renderTabsList(); } catch (_) {}
            }, err => console.error("Sekme yükleme hatası:", err));
            db.collection("settings").doc("paymentTypes").onSnapshot(d => {
                if (d.exists) paymentTypes = d.data().list;
                updatePaymentSelects();
            });

            // İkincil / seyrek: gecikmeli + lazy koleksiyonlar
            setTimeout(function() {
                if (!currentUser) return;
                try {
                    goldHoldings = loadGoldHoldingsLocal();
                    if (typeof renderGoldHoldings === 'function') renderGoldHoldings();
                } catch (_) {}
                // Anasayfa için aile verisi + araç profili (bildirimler)
                try { ensureLazyCollection('familyTasks'); } catch (_) {}
                try { ensureLazyCollection('familyCalendar'); } catch (_) {}
                try { ensureLazyCollection('vehicleProfile'); } catch (_) {}
                try { ensureLazyCollection('goldHoldings'); } catch (_) {}
                db.collection("settings").doc("uiPrefs").onSnapshot(d => {
                    if (d.exists && d.data()) {
                        const u = d.data();
                        if (u.dashboardCards && typeof u.dashboardCards === 'object') {
                            dashboardCards = Object.assign(dashboardCards, u.dashboardCards);
                            applyDashboardCards();
                        }
                    }
                }, err => console.warn('uiPrefs', err));
                db.collection("settings").doc("apiKeys").onSnapshot(d => {
                    if (!auth.currentUser) {
                        openrouterApiKey = '';
                        collectApiKey = '';
                        return;
                    }
                    if (d.exists && d.data()) {
                        const k = d.data() || {};
                        if (k.openrouter) openrouterApiKey = String(k.openrouter).trim();
                        else if (k.gemini) openrouterApiKey = String(k.gemini).trim();
                        else openrouterApiKey = '';
                        collectApiKey = String(k.collectapi || k.collectApi || '').trim();
                    } else {
                        openrouterApiKey = '';
                        collectApiKey = '';
                    }
                }, err => {
                    openrouterApiKey = '';
                    collectApiKey = '';
                    console.warn('apiKeys okunamadı (rules?)');
                });
            }, 600);

            // activityLog: lazy — sadece panel açılınca (ensureActivityLogListener)

            updateCategorySelects();
            updatePaymentSelects();
            renderCategoriesList();
        }

        // İkincil koleksiyonlar — ilgili sekme açılınca dinle
        window._lazyUnsub = window._lazyUnsub || {};
        function refreshFamilyViewsLazy() {
            try {
                if (typeof refreshAppNotifications === 'function') refreshAppNotifications();
                if (typeof updateTaskNavBadges === 'function') updateTaskNavBadges();
                if (typeof renderTabBar === 'function' && currentUser) renderTabBar();
                const home = document.getElementById('tabContentHome');
                if (home && !home.classList.contains('hidden') && typeof renderHomeTab === 'function') renderHomeTab();
                const plan = document.getElementById('tabContentPlan');
                if (plan && !plan.classList.contains('hidden') && typeof renderPlanTab === 'function') renderPlanTab();
                const sh = document.getElementById('tabContentShopping');
                if (sh && !sh.classList.contains('hidden') && typeof renderShoppingTab === 'function') renderShoppingTab();
            } catch (_) {}
        }

        window.ensureLazyCollection = function(name) {
            if (!db || !currentUser) return;
            if (window._lazyUnsub[name]) return;
            try {
                if (name === 'notes') {
                    window._lazyUnsub.notes = db.collection('notes').onSnapshot(function(snap) {
                        notes = snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
                        if (typeof renderNotesList === 'function') renderNotesList();
                    }, function(e) { console.warn('notes', e); });
                } else if (name === 'ibans') {
                    window._lazyUnsub.ibans = db.collection('ibans').onSnapshot(function(snap) {
                        ibans = snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
                        if (typeof renderIbans === 'function') renderIbans();
                    }, function(e) { console.warn('ibans', e); });
                } else if (name === 'familyShopping') {
                    window._lazyUnsub.familyShopping = db.collection('familyShopping').onSnapshot(function(snap) {
                        familyShopping = snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
                        if (typeof renderShoppingTab === 'function') {
                            const sh = document.getElementById('tabContentShopping');
                            if (sh && !sh.classList.contains('hidden')) renderShoppingTab();
                        }
                        if (typeof refreshAppNotifications === 'function') refreshAppNotifications();
                    }, function(e) { console.warn('familyShopping', e); });
                } else if (name === 'familyTasks') {
                    window._lazyUnsub.familyTasks = db.collection('familyTasks').onSnapshot(function(snap) {
                        familyTasks = snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
                        refreshFamilyViewsLazy();
                    }, function(e) { console.warn('familyTasks', e); });
                } else if (name === 'familyCalendar') {
                    window._lazyUnsub.familyCalendar = db.collection('familyCalendar').onSnapshot(function(snap) {
                        familyCalendar = snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
                        refreshFamilyViewsLazy();
                    }, function(e) { console.warn('familyCalendar', e); });
                } else if (name === 'goldHoldings') {
                    window._lazyUnsub.goldHoldings = db.collection('settings').doc('goldHoldings').onSnapshot(function(d) {
                        if (d.exists && d.data() && Array.isArray(d.data().list)) {
                            goldHoldings = d.data().list;
                            try { saveGoldHoldingsLocal(goldHoldings); } catch (_) {}
                            if (typeof renderGoldHoldings === 'function') renderGoldHoldings();
                        }
                    }, function(e) { console.warn('goldHoldings', e); });
                } else if (name === 'vehicleProfile') {
                    window._lazyUnsub.vehicleProfile = db.collection('settings').doc('vehicleProfile').onSnapshot(function(d) {
                        if (d.exists && d.data()) {
                            vehicleProfile = Object.assign({}, vehicleProfile, d.data());
                            try { renderVehicleProfileUI(); } catch (_) {}
                            try { if (typeof refreshAppNotifications === 'function') refreshAppNotifications(); } catch (_) {}
                        }
                    }, function(e) { console.warn('vehicleProfile', e); });
                } else if (name === 'cardStatements') {
                    window._lazyUnsub.cardStatements = db.collection('cardStatements').onSnapshot(function(snap) {
                        cardStatements = snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
                        const statsTab = document.getElementById('tabContentStats');
                        if (statsTab && !statsTab.classList.contains('hidden')) {
                            try { if (typeof renderCardStatements === 'function') { renderCardStatements('bekir'); renderCardStatements('duygu'); } } catch (_) {}
                            try { if (typeof renderCurrentStatements === 'function') renderCurrentStatements(); } catch (_) {}
                        }
                    }, function(e) { console.warn('cardStatements', e); });
                }
            } catch (err) {
                console.warn('ensureLazyCollection', name, err);
            }
        };

