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

        const DOGRU_SIFRE = "7536";

        // ENTER TUŞU İÇİN GLOBAL FONKSIYON
        window.handlePasswordKeyPress = function(event) {
            if (event.key === 'Enter') {
                checkPassword();
            }
        };

        // Global Fonksiyonlar
        window.checkPassword = function() {
            try {
                const input = document.getElementById('sifreInput').value;
                if (input === DOGRU_SIFRE) {
                    document.getElementById('errorContainer').classList.add('hidden');
                    document.getElementById('appContainer').classList.remove('hidden');
                    initRealtimeSync();
                } else {
                    alert("Hatalı Şifre!");
                    document.getElementById('sifreInput').value = "";
                }
            } catch (err) {
                console.error(err);
                alert("Giriş sırasında hata: " + (err && err.message ? err.message : err));
            }
        };

        // State ve Değişkenler
        let expenses = [], incomes = [], shoppingItems = [], notes = [], deletedExpenses = [];
        let categories = ["Gıda", "Ulaşım", "Faturalar", "Eğlence", "Sağlık", "Eğitim", "Diğer", "Kredi Kartı Borcu"];
        let paymentTypes = ["Nakit", "Kredi Kartı"];
        let bekirDebt = { amount: 0, paid: false, dueDate: '' };
        let duyguDebt = { amount: 0, paid: false, dueDate: '' };
        let cardStatements = [];
        let ibans = [];
        
        let sortColumn = 'date', sortDirection = 'desc';
        let currentPersonFilter = 'Tümü', currentCategoryFilter = 'Tümü', currentPaymentFilter = 'Tümü';
        let currentStartDateFilter = '', currentEndDateFilter = '';
        let currentShowInstallments = false;
        let activeShoppingId = null, activeShoppingAction = 'complete';

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
            const contents = ["expense", "stats", "reports", "notes", "shopping", "calculator", "settings", "trash"];
            contents.forEach(name => {
                document.getElementById(`tabContent${name.charAt(0).toUpperCase() + name.slice(1)}`).classList.add('hidden');
                document.getElementById(`tabBtn${name.charAt(0).toUpperCase() + name.slice(1)}`).classList.remove('tab-active');
                document.getElementById(`tabBtn${name.charAt(0).toUpperCase() + name.slice(1)}`).classList.add('text-slate-500');
            });

            document.getElementById(`tabContent${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`).classList.remove('hidden');
            const activeBtn = document.getElementById(`tabBtn${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
            activeBtn.classList.add('tab-active');
            activeBtn.classList.remove('text-slate-500');

            if (tabName === 'stats') {
                updateStatsPanel();
                if (expenseChart) expenseChart.resize();
            } else if (tabName === 'reports') {
                renderMonthlyReports();
            } else if (tabName === 'trash') {
                renderTrash();
            } else if (tabName === 'notes') {
                renderIbans();
            } else if (tabName === 'settings') {
                renderCategoriesList();
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
        window.closeShoppingPriceModal = () => document.getElementById('shoppingPriceModal').classList.add('hidden');

        function resetForm() {
            document.getElementById('editId').value = '';
            document.getElementById('amount').value = '';
            document.getElementById('installmentCount').value = '1';
            document.getElementById('person').value = 'Bekir';
            document.getElementById('description').value = '';
            document.getElementById('date').valueAsDate = new Date();
            document.getElementById('formTitle').innerText = "Harcama Kaydı";
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
            db.collection("shoppingList").onSnapshot(snap => {
                shoppingItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                renderShoppingList();
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
                    categories = d.data().list;
                }
                updateCategorySelects();
                renderCategoriesList();
            }, err => console.error("Kategori yükleme hatası:", err));
            db.collection("settings").doc("paymentTypes").onSnapshot(d => {
                if (d.exists) paymentTypes = d.data().list;
                updatePaymentSelects();
            });
            db.collection("cardStatements").onSnapshot(snap => {
                cardStatements = snap.docs.map(d => ({ ...d.data(), id: d.id }));
                const reportsTab = document.getElementById('tabContentReports');
                if (reportsTab && !reportsTab.classList.contains('hidden')) {
                    renderCardStatements('bekir');
                    renderCardStatements('duygu');
                }
            }, err => console.error("Cardstatements yüklemesinde hata:", err));
            db.collection("ibans").onSnapshot(snap => {
                ibans = snap.docs.map(d => ({ ...d.data(), id: d.id }));
                renderIbans();
            }, err => console.error("IBAN yüklemesinde hata:", err));

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
                category: category,
                paymentType: paymentType,
                date: date,
                description: description,
                expenseMonth: date.substring(0, 7),
                statementPeriod: getPeriodKeyForDateStr(date)
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
            } catch (err) {
                console.error("Harcama kayıt hatası:", err);
                alert("Hata: " + err.message);
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
            document.getElementById('category').value = e.category;
            document.getElementById('paymentType').value = e.paymentType;
            document.getElementById('date').value = e.date;
            document.getElementById('description').value = e.description === '-' ? '' : e.description;
            document.getElementById('formTitle').innerText = "Harcamayı Düzenle";
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
        };

        window.deleteIncome = async (id) => {
            if (!confirm("Geliri silmek istediğinize emin misiniz?")) return;
            await db.collection("incomes").doc(id).delete();
        };

        // Tablo Render
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
                filtered = [...getProcessedExpenses(), ...incomes.map(i => ({...i, type: 'income', displayAmount: i.amount, person: 'Gelir', category: i.type, installmentLabel: 'Gelir', effectiveMonth: getPeriodKeyForDateStr(i.date) || i.incomeMonth}))];
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
                const safeId = escapeHtml(item.id);
                tr.innerHTML = `
                    <td class="px-8 py-5 opacity-60">${escapeHtml(item.date || '-')}</td>
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
                expenseChart = new Chart(ctx1, {
                    type: 'doughnut',
                    data: {
                        labels: Object.keys(categoryData),
                        datasets: [{
                            data: Object.values(categoryData),
                            backgroundColor: ['#3b82f6', '#ec4899', '#f59e0b', '#10b981', '#f87171', '#8b5cf6', '#06b6d4', '#6366f1'],
                            borderColor: '#ffffff',
                            borderWidth: 3
                        }]
                    },
                    options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom' } } }
                });
            }

            const weekData = {};
            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const key = d.toLocaleDateString('tr-TR', { weekday: 'short' });
                weekData[key] = 0;
            }
            processedExpenses.forEach(e => {
                const d = new Date(e.date);
                const key = d.toLocaleDateString('tr-TR', { weekday: 'short' });
                if (key in weekData) weekData[key] += e.displayAmount;
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
                <div class="bg-slate-50 p-4 rounded-2xl"><div class="font-bold text-sm">${cat}</div><div class="text-2xl font-black text-indigo-600">${amt.toLocaleString('tr-TR')} TL</div></div>
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

                window.openStatementDetails = (person) => {
            const statement = currentStatements.find(s => s.person === person);
            if (!statement || statement.amount === 0) {
                alert(`${person} için bu dönemde kredi kartı harcaması yok`);
                return;
            }
            
            const startDate = statement.period.startDate.toLocaleDateString('tr-TR');
            const endDate = statement.period.endDate.toLocaleDateString('tr-TR');
            
            document.getElementById('statementTitle').innerText = `${person} - Kredi Kartı Ekstresi`;
            document.getElementById('statementDateRange').innerText = `${startDate} - ${endDate}`;
            document.getElementById('statementAmount').innerText = statement.amount.toLocaleString('tr-TR') + ' TL';
            
            const itemsContainer = document.getElementById('statementItems');
            if (statement.expenses.length === 0) {
                itemsContainer.innerHTML = '<p class="text-center text-slate-400 py-8">Bu dönem kredi kartı ile harcama yapılmamış</p>';
            } else {
                itemsContainer.innerHTML = statement.expenses
                    .sort((a, b) => new Date(b.date) - new Date(a.date))
                    .map(exp => `
                        <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200 hover:border-slate-300 transition group">
                            <div class="flex justify-between items-start mb-2">
                                <div class="flex-1">
                                    <p class="font-bold text-slate-900">${escapeHtml(exp.category)}</p>
                                    <p class="text-xs text-slate-500 mt-1">${escapeHtml(exp.description)}</p>
                                </div>
                                <div class="flex items-center gap-3 ml-4">
                                    <p class="font-black text-lg text-slate-900">${exp.displayAmount.toLocaleString('tr-TR')} TL</p>
                                    <button onclick="deleteStatementItem('${escapeHtml(exp.id)}')" 
                                            class="opacity-0 group-hover:opacity-100 transition bg-red-600 hover:bg-red-700 text-white p-1.5 rounded-lg"
                                            title="Sil">
                                        🗑️
                                    </button>
                                </div>
                            </div>
                            <div class="flex justify-between text-xs text-slate-400">
                                <span>${exp.date}</span>
                                ${exp.installmentLabel !== 'Peşin' ? `<span class="text-indigo-600 font-semibold">${exp.installmentLabel}</span>` : ''}
                            </div>
                        </div>
                    `).join('');
            }
            
            document.getElementById('statementDetailModal').classList.remove('hidden');
            document.getElementById('statementDetailModal').classList.add('flex');
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
            document.getElementById('statementDetailModal').classList.add('hidden');
            document.getElementById('statementDetailModal').classList.remove('flex');
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

        // Alışveriş Yönetimi
        window.handleShoppingSubmit = async (e) => {
            e.preventDefault();
            const input = document.getElementById('shoppingItemInput');
            if (input.value.trim()) {
                await db.collection("shoppingList").add({ title: input.value.trim(), completed: false, price: 0 });
                input.value = '';
            }
        };

        window.renderShoppingList = () => {
            const todo = document.getElementById('todoListContainer');
            const cart = document.getElementById('cartListContainer');
            todo.innerHTML = ''; cart.innerHTML = '';
            let total = 0;
            shoppingItems.forEach(item => {
                const li = document.createElement('li');
                if (!item.completed) {
                    li.className = "flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100";
                    li.innerHTML = `<span class="font-bold text-slate-700">${escapeHtml(item.title)}</span><button onclick="toggleShoppingItem('${escapeHtml(item.id)}', false)" class="bg-indigo-600 text-white p-2 rounded-lg">🛒</button>`;
                    todo.appendChild(li);
                } else {
                    total += (item.price || 0);
                    li.className = "flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/5";
                    li.innerHTML = `<div class="flex flex-col"><span class="text-white font-bold line-through opacity-40">${escapeHtml(item.title)}</span><span class="text-indigo-400 text-[10px] font-black">${item.price} TL</span></div><div class="flex gap-2"><button onclick="updateItemPrice('${escapeHtml(item.id)}')" class="text-xs">💰</button><button onclick="deleteShoppingItem('${escapeHtml(item.id)}')" class="text-xs">❌</button></div>`;
                    cart.appendChild(li);
                }
            });
            document.getElementById('cartTotalPrice').innerText = total.toLocaleString('tr-TR') + " TL";
        };

        window.toggleShoppingItem = async (id, status) => {
            if (!status) {
                activeShoppingId = id;
                document.getElementById('shoppingModalPriceInput').value = '';
                document.getElementById('shoppingPriceModal').classList.remove('hidden');
                document.getElementById('shoppingPriceModal').classList.add('flex');
            }
        };

        window.updateItemPrice = async (id) => {
            const item = shoppingItems.find(i => i.id === id);
            activeShoppingId = id;
            document.getElementById('shoppingModalPriceInput').value = item.price || '';
            document.getElementById('shoppingPriceModal').classList.remove('hidden');
            document.getElementById('shoppingPriceModal').classList.add('flex');
        };

        window.deleteShoppingItem = async (id) => {
            if (confirm("Öğeyi silmek istediğinize emin misiniz?")) {
                await db.collection("shoppingList").doc(id).delete();
            }
        };

        window.handleShoppingPriceSubmit = async (e) => {
            e.preventDefault();
            const price = parseFloat(document.getElementById('shoppingModalPriceInput').value);
            await db.collection("shoppingList").doc(activeShoppingId).update({ completed: true, price });
            document.getElementById('shoppingPriceModal').classList.add('hidden');
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
        };

        window.removeCategory = async (index) => {
            const catName = categories[index];
            if (!confirm(`"${catName}" kategorisini silmek istediğinize emin misiniz?`)) return;
            categories.splice(index, 1);
            await saveCategoryOrder();
            updateCategorySelects();
            renderCategoriesList();
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
        };

        window.deleteNote = async (id) => {
            if (confirm("Notu silmek istediğinize emin misiniz?")) {
                await db.collection("notes").doc(id).delete();
            }
        };

        window.renderNotesList = () => {
            const container = document.getElementById('notesContainer');
            if (!container) return;
            container.innerHTML = notes.map(n => `
                <div class="bg-white p-6 rounded-3xl card-shadow border border-slate-100 relative">
                    <div class="flex justify-between items-center mb-4">
                        <span class="text-xs font-black uppercase tracking-wider px-3 py-1 rounded-full ${n.person === 'Bekir' ? 'bg-blue-50 text-blue-600' : 'bg-pink-50 text-pink-600'}">${escapeHtml(n.person)}</span>
                        <button onclick="deleteNote('${escapeHtml(n.id)}')" class="text-xs text-rose-500">Sil</button>
                    </div>
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
            const processed = getProcessedExpenses().filter(e => e.installmentLabel !== 'Peşin');
            const total = processed.reduce((s, e) => s + e.displayAmount, 0);
            document.getElementById('totalInstallmentAmount').innerText = total.toLocaleString('tr-TR') + ' TL';
            
            const currentPeriod = getCurrentPeriod();
            const currentTotal = processed.filter(e => e.effectiveMonth === currentPeriod).reduce((s, e) => s + e.displayAmount, 0);
            document.getElementById('selectedMonthAmount').innerText = currentTotal.toLocaleString('tr-TR') + ' TL';

            const container = document.getElementById('installmentsContainer');
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
