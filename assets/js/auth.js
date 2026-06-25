// ==========================================
// AUTH & VOTING LOGIC
// File ini berisi logika autentikasi login, voting wizard,
// pengiriman suara, dan logout.
// Bergantung pada: db (supabase.js), UI, AppStorage,
//   DEFAULT_SYSTEM_SETTINGS, resolveImage, showModal,
//   showAlert, setLoginStatus, resetBtn, switchView
// ==========================================

// ==========================================
// UTILITY: CHECK VOTING SCHEDULE
// ==========================================
async function isVotingActive() {
    try {
        const { data, error } = await db.from('pengaturan').select('*').eq('id', 'jadwal_pemilihan').single();
        if (error || !data) return false;
        if (data.mode === 'manual') {
            return true;
        } else if (data.mode === 'auto') {
            const now = new Date();
            const start = new Date(data.mulai);
            const end = new Date(data.selesai);
            return now >= start && now <= end;
        }
        return false;
    } catch (e) {
        console.error("Error checking voting schedule:", e);
        return false;
    }
}

// ==========================================
// LOGIN FORM HANDLER
// ==========================================
UI.form.onsubmit = async (e) => {
    e.preventDefault();
    UI.loginStatus.classList.add('hidden');
    UI.btnSub.disabled = true;
    UI.btnSub.classList.add('opacity-80', 'cursor-not-allowed');
    UI.btnTxt.textContent = "Mengautentikasi...";
    UI.btnIco.classList.add('hidden');
    UI.spin.classList.remove('hidden');
    try {
        // Check admin credentials
        const { data: adminData, error: adminErr } = await db.from('pengaturan').select('*').eq('id', 'konfigurasi_admin').single();

        // Fallback: jika belum ada data di database, gunakan credential default
        const DEFAULT_ADMIN_USER = 'admin';
        const DEFAULT_ADMIN_PASS = 'admin123';

        let isLoginValid = false;
        let isAdmin = false;
        let loggedInUser = "";
        let voterData = null;
        let voterType = null;
        const inputUser = UI.userInput.value.trim();
        const inputPass = UI.passInput.value.trim();

        if (adminData && !adminErr) {
            // Coba credential dari database
            if (adminData.admin_username === inputUser && adminData.admin_password === inputPass) {
                isLoginValid = true;
                isAdmin = true;
                loggedInUser = adminData.admin_username;
            }
        } else {
            // Fallback ke credential default jika tabel belum diisi
            if (inputUser === DEFAULT_ADMIN_USER && inputPass === DEFAULT_ADMIN_PASS) {
                isLoginValid = true;
                isAdmin = true;
                loggedInUser = DEFAULT_ADMIN_USER;
            }
        }

        if (!isLoginValid) {
            const types = ['siswa', 'guru', 'staf'];
            for (const type of types) {
                const { data: vd } = await db.from('pemilih_' + type).select('*').eq('id', inputUser).single();
                if (vd && vd.password === inputPass) {
                    isLoginValid = true;
                    voterData = vd;
                    voterType = type;
                    loggedInUser = vd.nama;
                    break;
                }
            }
        }

        if (isLoginValid) {
            if (isAdmin) {
                setLoginStatus("Login Admin berhasil! Mengalihkan ke dashboard...", true);
                UI.btnTxt.textContent = "Mengalihkan...";
                // Simpan sesi admin ke localStorage
                try {
                    localStorage.setItem('adminSession', JSON.stringify({ user: loggedInUser, ts: Date.now() }));
                } catch (e) { }
                setTimeout(() => {
                    window.location.href = 'admin.html';
                }, 1000);
            } else {
                // Verify schedule is active for voters
                const active = await isVotingActive();
                if (!active) {
                    setLoginStatus("Akses ditolak: Jadwal pemilihan belum mulai atau sudah ditutup!", false);
                    resetBtn();
                    return;
                }

                if (voterData.sudah_memilih === 1 || voterData.sudah_memilih === true) {
                    setLoginStatus("Akses ditolak: Anda sudah memberikan suara!", false);
                    resetBtn();
                    return;
                }

                setLoginStatus("Login berhasil! Memuat antarmuka pemilihan...", true);
                UI.btnTxt.textContent = "Mengalihkan...";

                window.currentVoter = {
                    id: inputUser,
                    type: voterType,
                    name: loggedInUser,
                    kelas: voterData ? (voterData.kelas || "") : ""
                };

                setTimeout(() => {
                    UI.viewLogin.classList.add('hidden');
                    startVotingWizard();
                    UI.form.reset();
                    UI.loginStatus.classList.add('hidden');
                    resetBtn();
                }, 1000);
            }
        } else {
            setLoginStatus("ID atau Password salah!", false);
            resetBtn();
        }
    } catch (err) {
        setLoginStatus("Database Error: " + err.message, false);
        console.error("Login Error:", err);
        resetBtn();
    }
};

// ==========================================
// VOTING LOGIC — STATE
// ==========================================
let voterConfigPositions = [];
let voterAllCandidates = [];
let voterCurrentStep = 0;
let voterDraftSelections = {};

// ==========================================
// VOTING WIZARD
// ==========================================
function updateVoterHeaderResponsive() {
    if (!window.currentVoter) return;
    const schoolEl = document.getElementById('voterHeaderSchool');
    const nameEl = document.getElementById('voterActiveName');
    
    const isMobilePortrait = window.matchMedia("(max-width: 640px) and (orientation: portrait)").matches;
    
    if (isMobilePortrait) {
        if (schoolEl) schoolEl.textContent = "SMANDA";
        const firstName = window.currentVoter.name.trim().split(/\s+/)[0];
        const kelas = window.currentVoter.kelas ? ` (${window.currentVoter.kelas})` : "";
        if (nameEl) nameEl.textContent = firstName + kelas;
    } else {
        const currentName = AppStorage.get('ep_sh_name') || DEFAULT_SYSTEM_SETTINGS.schoolName;
        if (schoolEl) schoolEl.textContent = currentName;
        const kelas = window.currentVoter.kelas ? ` (${window.currentVoter.kelas})` : "";
        if (nameEl) nameEl.textContent = window.currentVoter.name + kelas;
    }
}

window.addEventListener('resize', updateVoterHeaderResponsive);
window.addEventListener('orientationchange', updateVoterHeaderResponsive);

async function startVotingWizard() {
    const voterView = document.getElementById('voterView');
    if (voterView) {
        voterView.classList.remove('hidden');
    }
    updateVoterHeaderResponsive();
    const currentLogoId = AppStorage.get('ep_sh_logo') || DEFAULT_SYSTEM_SETTINGS.schoolLogo;
    resolveImage(currentLogoId).then(src => {
        if (src) document.getElementById('voterHeaderLogo').src = src;
    });

    try {
        const { data: candRows, error } = await db.from('kandidat').select('*');
        if (error) throw error;
        voterAllCandidates = (candRows || []);

        // Derive unique positions from candidate data
        const posisiSet = new Map();
        voterAllCandidates.forEach(c => {
            if (c.posisi && !posisiSet.has(c.posisi)) {
                posisiSet.set(c.posisi, { id: c.posisi, nama_posisi: c.posisi, urutan: posisiSet.size });
            }
        });
        voterConfigPositions = Array.from(posisiSet.values()).sort((a, b) => {
            const orderMap = { "Ketua Umum OSIS": 1, "Ketua 2 OSIS": 2, "Ketua Umum DPK": 3, "Ketua 2 DPK": 4 };
            const wa = orderMap[a.id] || 99;
            const wb = orderMap[b.id] || 99;
            if (wa !== wb) return wa - wb;
            return a.id.localeCompare(b.id);
        });

        // Reset draft selections to ensure no candidate is selected by default
        voterDraftSelections = {};
        localStorage.removeItem('pemilos_draft_pilihan');

        // Guard: tidak ada kandidat
        if (voterAllCandidates.length === 0) {
            alert('Belum ada kandidat yang terdaftar. Hubungi panitia.');
            logoutVoter();
            return;
        }

        voterCurrentStep = 0;
        renderWizardStep();
    } catch (err) {
        console.error("Error loading voting data:", err);
        alert("Gagal memuat data pemilihan. Periksa koneksi.");
    }
}

async function renderWizardStep() {
    // Deteksi apakah kita di index.html (voter-facing) atau admin.html
    const isVoterPage = !!document.getElementById('wizardContent');

    if (isVoterPage) {
        return await renderWizardStepVoterPage();
    }
    // admin.html wizard (dipanggil oleh fungsi-fungsi di admin.js)
    const summaryView = document.getElementById('wizardSummaryView');
    const candidatesGrid = document.getElementById('wizardCandidatesGrid');
    const titleEl = document.getElementById('wizardPositionTitle');
    const descEl = document.getElementById('wizardPositionDesc');
    const progText = document.getElementById('wizardProgressText');
    const progBar = document.getElementById('wizardProgressBar');
    const btnPrev = document.getElementById('btnWizardPrev');
    const btnNext = document.getElementById('btnWizardNext');
    if (!summaryView) return;

    if (voterCurrentStep >= voterConfigPositions.length) {
        summaryView.classList.remove('hidden');
        summaryView.classList.add('flex');
        candidatesGrid.style.display = 'none';
        titleEl.textContent = 'Konfirmasi Pilihan';
        descEl.textContent = '';
        progText.innerHTML = `<span>Selesai</span><span id="wizardCurrentPositionName">Ringkasan</span>`;
        progBar.style.width = '100%';
        btnPrev.classList.remove('invisible');
        btnNext.classList.add('invisible');

        const summaryList = document.getElementById('wizardSummaryList');
        let summaryHtml = '';
        for (const pos of voterConfigPositions) {
            const selectedCandId = voterDraftSelections[pos.id];
            const candidate = voterAllCandidates.find(c => c.id === selectedCandId);

            let imgSrcHtml = '<div class="w-full h-full flex items-center justify-center text-slate-500"><i class="fas fa-user text-xl"></i></div>';
            if (candidate && candidate.foto) {
                let imgSrc = candidate.foto;
                if (!imgSrc.startsWith('http') && !imgSrc.startsWith('data:')) {
                    imgSrc = await resolveImage(imgSrc) || 'https://via.placeholder.com/300x400.png?text=No+Photo';
                }
                imgSrcHtml = `<img src="${imgSrc}" alt="${candidate.nama}" class="w-full h-full object-cover">`;
            }

            summaryHtml += `
                <div class="flex items-center p-3 sm:p-4 rounded-xl bg-white/5 border border-white/10 w-full">
                    <div class="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 bg-slate-800 border border-slate-600 mr-4">
                        ${imgSrcHtml}
                    </div>
                    <div class="flex-1">
                        <p class="text-xs text-sky-300 font-semibold mb-0.5">${pos.nama_posisi}</p>
                        <p class="text-sm sm:text-base text-white font-bold">${candidate ? candidate.nama : '<span class="text-rose-400">Belum ada pilihan</span>'}</p>
                    </div>
                    ${!candidate ? '<i class="fas fa-exclamation-triangle text-rose-500 text-lg"></i>' : '<i class="fas fa-check-circle text-emerald-500 text-lg"></i>'}
                </div>
            `;
        }
        summaryList.innerHTML = summaryHtml;

        const btnSubmit = document.getElementById('btnSubmitVote');
        const allSelected = voterConfigPositions.every(p => voterDraftSelections[p.id]);
        if (allSelected) {
            btnSubmit.classList.remove('opacity-50', 'cursor-not-allowed');
            btnSubmit.disabled = false;
        } else {
            btnSubmit.classList.add('opacity-50', 'cursor-not-allowed');
            btnSubmit.disabled = true;
        }
    } else {
        summaryView.classList.add('hidden');
        summaryView.classList.remove('flex');
        candidatesGrid.style.display = 'flex';

        const pos = voterConfigPositions[voterCurrentStep];
        titleEl.textContent = `Pilih ${pos.nama_posisi}`;
        descEl.textContent = 'Silakan pilih kandidat terbaik menurut Anda. Anda tidak dapat mengubah pilihan setelah konfirmasi akhir.';

        progText.innerHTML = `<span>${voterCurrentStep + 1} dari ${voterConfigPositions.length}</span><span id="wizardCurrentPositionName">${pos.nama_posisi}</span>`;
        progBar.style.width = `${((voterCurrentStep) / voterConfigPositions.length) * 100}%`;

        if (voterCurrentStep > 0) btnPrev.classList.remove('invisible');
        else btnPrev.classList.add('invisible');

        const hasSelected = !!voterDraftSelections[pos.id];
        if (hasSelected) btnNext.classList.remove('invisible');
        else btnNext.classList.add('invisible');

        const candidates = voterAllCandidates.filter(c => c.posisi === pos.id).sort((a, b) => parseInt(a.nomor_urut) - parseInt(b.nomor_urut));
        let cardsHtml = '';

        for (const cand of candidates) {
            const isSelected = voterDraftSelections[pos.id] === cand.id;
            let imgSrc = cand.foto || '';
            if (imgSrc && !imgSrc.startsWith('http') && !imgSrc.startsWith('data:')) {
                imgSrc = await resolveImage(imgSrc) || 'https://placehold.co/300x400/1e293b/94a3b8?text=No+Photo';
            } else if (!imgSrc) {
                imgSrc = 'https://placehold.co/300x400/1e293b/94a3b8?text=No+Photo';
            }
            cardsHtml += `
                <div onclick="selectCandidate('${pos.id}', '${cand.id}')" class="w-full sm:w-[280px] md:w-[320px] flex flex-col relative group cursor-pointer bg-white/5 backdrop-blur-sm border-2 ${isSelected ? 'border-sky-500 bg-sky-900/30' : 'border-white/10 hover:border-white/30'} rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${isSelected ? 'shadow-sky-500/20' : ''}">
                    ${isSelected ? '<div class="absolute top-3 right-3 bg-sky-500 text-white w-8 h-8 rounded-full flex items-center justify-center z-20 shadow-lg"><i class="fas fa-check"></i></div>' : ''}
                    <div class="flex-1 min-h-[120px] w-full overflow-hidden bg-slate-800 relative">
                        <div class="absolute top-0 left-0 bg-gradient-to-br from-indigo-600 to-blue-700 text-white font-black text-2xl w-12 h-12 flex items-center justify-center rounded-br-2xl shadow-lg z-10">${cand.nomor_urut}</div>
                        <img src="${imgSrc}" alt="${cand.nama}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105">
                    </div>
                    <div class="p-4 sm:p-5 flex-none">
                        <h3 class="text-white font-bold text-lg leading-tight mb-1 line-clamp-2">${cand.nama}</h3>
                        <p class="text-sky-300 text-xs font-semibold mb-4">Kelas : ${cand.kelas || '-'}</p>
                        <button onclick="event.stopPropagation(); showCandidateVisiMisi('${cand.id}')" class="w-full py-2 border border-white/20 rounded-lg text-slate-300 text-xs font-semibold hover:bg-white/10 hover:text-white transition-colors">
                            Lihat Visi &amp; Misi
                        </button>
                    </div>
                </div>
            `;
        }
        candidatesGrid.innerHTML = cardsHtml;
    }
}

// ==========================================
// WIZARD UNTUK index.html (VOTER PAGE)
// Menggunakan elemen: #wizardContent, #wizardProgress, #wizardBackBtn, #wizardNextBtn, #wizardStepInfo
// ==========================================
async function renderWizardStepVoterPage() {
    const contentEl = document.getElementById('wizardContent');
    const progressBar = document.getElementById('wizardProgress');
    const backBtn = document.getElementById('wizardBackBtn');
    const nextBtn = document.getElementById('wizardNextBtn');
    const stepInfo = document.getElementById('wizardStepInfo');
    if (!contentEl) return;

    const total = voterConfigPositions.length;
    const isSummary = voterCurrentStep >= total;

    // Update progress bar
    const pct = isSummary ? 100 : Math.round((voterCurrentStep / total) * 100);
    if (progressBar) progressBar.style.width = pct + '%';

    // Update step info
    if (stepInfo) {
        stepInfo.textContent = isSummary
            ? 'Ringkasan Pilihan'
            : `${voterCurrentStep + 1} dari ${total} — ${voterConfigPositions[voterCurrentStep].nama_posisi}`;
    }

    // Back button visibility
    if (backBtn) {
        backBtn.classList.toggle('invisible', voterCurrentStep === 0);
    }

    if (isSummary) {
        // Render summary
        if (nextBtn) { nextBtn.textContent = ''; nextBtn.classList.add('hidden'); }

        let summaryHtml = `
            <div class="p-4 sm:p-6 max-w-2xl mx-auto w-full">
                <h2 class="text-2xl font-black text-white text-center mb-2">Konfirmasi Pilihan</h2>
                <div class="space-y-3 mb-8">
        `;
        for (const pos of voterConfigPositions) {
            const selectedCandId = voterDraftSelections[pos.id];
            const candidate = voterAllCandidates.find(c => c.id === selectedCandId);
            let imgSrc = '';
            if (candidate && candidate.foto) {
                imgSrc = candidate.foto;
                if (imgSrc && !imgSrc.startsWith('http') && !imgSrc.startsWith('data:')) {
                    imgSrc = await resolveImage(imgSrc) || '';
                }
            }
            const imgHtml = imgSrc
                ? `<img src="${imgSrc}" alt="" class="w-full h-full object-cover">`
                : `<div class="w-full h-full flex items-center justify-center text-slate-500"><i class="fas fa-user text-xl"></i></div>`;
            summaryHtml += `
                <div class="flex items-center gap-4 p-3 sm:p-4 rounded-xl bg-white/5 border border-white/10">
                    <div class="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 bg-slate-800 border border-slate-600">${imgHtml}</div>
                    <div class="flex-1 min-w-0">
                        <p class="text-xs text-sky-300 font-semibold">${pos.nama_posisi}</p>
                        <p class="text-sm font-bold text-white truncate">${candidate ? candidate.nama : '<span class="text-rose-400">Belum dipilih</span>'}</p>
                    </div>
                    <i class="${candidate ? 'fas fa-check-circle text-emerald-500' : 'fas fa-exclamation-triangle text-rose-500'} text-lg flex-shrink-0"></i>
                </div>
            `;
        }
        const allSelected = voterConfigPositions.every(p => voterDraftSelections[p.id]);
        summaryHtml += `
                </div>
                <button id="btnSubmitVote" onclick="submitFinalVote()" ${!allSelected ? 'disabled' : ''}
                    class="w-full py-3.5 rounded-xl font-bold text-sm text-white transition-all flex items-center justify-center gap-2 ${
                        allSelected
                        ? 'bg-gradient-to-r from-emerald-500 to-green-600 hover:shadow-lg hover:shadow-emerald-500/30'
                        : 'bg-slate-700 opacity-50 cursor-not-allowed'
                    }">
                    <i class="fas fa-paper-plane"></i> Kirim Suara Sekarang
                </button>
                ${!allSelected ? '<p class="text-rose-400 text-xs text-center mt-2">Harap pilih semua kandidat sebelum mengirim suara.</p>' : ''}
            </div>
        `;
        contentEl.innerHTML = summaryHtml;
    } else {
        // Render kandidat untuk posisi saat ini
        const pos = voterConfigPositions[voterCurrentStep];
        const hasSelected = !!voterDraftSelections[pos.id];
        if (nextBtn) {
            nextBtn.innerHTML = 'Lanjut <i class="fas fa-arrow-right text-xs"></i>';
            if (hasSelected) {
                nextBtn.classList.remove('invisible');
                nextBtn.classList.remove('hidden');
                nextBtn.disabled = false;
            } else {
                nextBtn.classList.add('invisible');
                nextBtn.disabled = true;
            }
        }

        const candidates = voterAllCandidates
            .filter(c => c.posisi === pos.id)
            .sort((a, b) => parseInt(a.nomor_urut) - parseInt(b.nomor_urut));

        let html = `
            <div class="w-full h-full flex flex-col p-2 sm:p-4">
                <h2 class="text-xl sm:text-2xl font-black text-white text-center mb-0.5">Pilih ${pos.nama_posisi}</h2>
                <p class="text-slate-400 text-xs text-center mb-3">Silakan pilih kandidat terbaik menurut Anda.</p>
                <div class="flex flex-wrap lg:flex-nowrap gap-4 sm:gap-6 justify-center items-stretch w-full max-w-7xl mx-auto flex-1 min-h-0">
        `;
        for (const cand of candidates) {
            const isSelected = voterDraftSelections[pos.id] === cand.id;
            let imgSrc = cand.foto || '';
            if (imgSrc && !imgSrc.startsWith('http') && !imgSrc.startsWith('data:')) {
                imgSrc = await resolveImage(imgSrc) || 'https://placehold.co/300x400/1e293b/94a3b8?text=No+Photo';
            } else if (!imgSrc) {
                imgSrc = 'https://placehold.co/300x400/1e293b/94a3b8?text=No+Photo';
            }
            html += `
                <div onclick="selectCandidate('${pos.id}', '${cand.id}')"
                    class="w-full sm:w-[240px] md:w-[260px] lg:w-0 lg:flex-1 lg:min-w-[200px] lg:max-w-[280px] flex flex-col relative group cursor-pointer
                        bg-white/5 border-2 ${ isSelected ? 'border-sky-500 bg-sky-900/30' : 'border-white/10 hover:border-white/30'}
                        rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
                    ${isSelected ? '<div class="absolute top-3 right-3 bg-sky-500 text-white w-8 h-8 rounded-full flex items-center justify-center z-20 shadow-lg"><i class="fas fa-check"></i></div>' : ''}
                    <div class="flex-1 min-h-[180px] w-full overflow-hidden bg-slate-800 relative">
                        <div class="absolute top-0 left-0 bg-gradient-to-br from-indigo-600 to-blue-700 text-white font-black text-2xl w-12 h-12 flex items-center justify-center rounded-br-2xl shadow-lg z-10">${cand.nomor_urut}</div>
                        <img src="${imgSrc}" alt="${cand.nama}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105">
                    </div>
                    <div class="p-4 flex-none">
                        <h3 class="text-white font-bold text-base leading-tight mb-1 truncate">${cand.nama}</h3>
                        <p class="text-sky-300 text-xs font-semibold mb-3">Kelas: ${cand.kelas || '-'}</p>
                        <button onclick="event.stopPropagation(); showCandidateVisiMisi('${cand.id}')"
                            class="w-full py-2 border border-white/20 rounded-lg text-slate-300 text-xs font-semibold hover:bg-white/10 hover:text-white transition-colors">
                            Lihat Visi &amp; Misi
                        </button>
                    </div>
                </div>
            `;
        }
        html += `</div></div>`;
        contentEl.innerHTML = html;
    }
}

function selectCandidate(posId, candId) {
    voterDraftSelections[posId] = candId;
    localStorage.setItem('pemilos_draft_pilihan', JSON.stringify(voterDraftSelections));
    renderWizardStep();
}

function wizardNextStep() {
    if (voterCurrentStep < voterConfigPositions.length) {
        const pos = voterConfigPositions[voterCurrentStep];
        if (!voterDraftSelections[pos.id]) {
            alert('Silakan pilih salah satu kandidat terlebih dahulu.');
            return;
        }
        voterCurrentStep++;
        renderWizardStep();
    }
}

function wizardPrevStep() {
    if (voterCurrentStep > 0) {
        voterCurrentStep--;
        renderWizardStep();
    }
}

function wizardGoToStep(stepIndex) {
    voterCurrentStep = stepIndex;
    renderWizardStep();
}

// Alias untuk tombol di index.html (wizardNext / wizardBack)
function wizardNext() { wizardNextStep(); }
function wizardBack() { wizardPrevStep(); }

function showCandidateVisiMisi(candId) {
    const cand = voterAllCandidates.find(c => c.id === candId);
    if (!cand) return;

    let misiHtml = '<p class="text-sm text-slate-300">-</p>';
    if (cand.misi && cand.misi.trim() !== '') {
        const misiLines = cand.misi.split('\n').filter(line => line.trim() !== '');
        if (misiLines.length > 0) {
            misiHtml = '<ol class="list-decimal list-outside ml-5 space-y-2 text-sm text-slate-200">';
            misiLines.forEach(line => {
                let cleanLine = line.trim().replace(/^[\d\.\-\)]+\s*/, '');
                if (cleanLine) misiHtml += `<li>${cleanLine}</li>`;
            });
            misiHtml += '</ol>';
        }
    }

    // Gunakan visiMisiModal jika tersedia (admin.html), atau customModal sebagai fallback (index.html)
    const visiMisiModal = document.getElementById('visiMisiModal');
    if (visiMisiModal) {
        document.getElementById('visiMisiModalTitle').innerHTML = `Visi &amp; Misi:<br><span class="text-sky-400">${cand.nama}</span>`;
        document.getElementById('visiMisiModalBody').innerHTML = `
            <div class="mb-5">
                <h4 class="text-sky-400 font-bold text-sm uppercase tracking-wider mb-2 flex items-center gap-2"><i class="fas fa-eye"></i>Visi</h4>
                <p class="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">${cand.visi || '-'}</p>
            </div>
            <div>
                <h4 class="text-emerald-400 font-bold text-sm uppercase tracking-wider mb-2 flex items-center gap-2"><i class="fas fa-bullseye"></i>Misi</h4>
                ${misiHtml}
            </div>
        `;
        visiMisiModal.classList.add('active');
    } else {
        // Fallback: gunakan customModal yang ada di index.html
        const bodyHtml = `
            <div class="mb-4">
                <p class="text-sky-400 font-bold text-xs uppercase tracking-wider mb-1 flex items-center gap-1"><i class="fas fa-eye"></i> Visi</p>
                <p class="text-slate-200 text-sm whitespace-pre-wrap leading-relaxed">${cand.visi || '-'}</p>
            </div>
            <div>
                <p class="text-emerald-400 font-bold text-xs uppercase tracking-wider mb-1 flex items-center gap-1"><i class="fas fa-bullseye"></i> Misi</p>
                ${misiHtml}
            </div>
        `;
        if (typeof showModal === 'function') {
            showModal(`Visi & Misi: ${cand.nama}`, bodyHtml, false, 'Tutup', null);
        } else {
            alert(`VISI:\n${cand.visi || '-'}\n\nMISI:\n${cand.misi || '-'}`);
        }
    }
}

// ==========================================
// SUBMIT SUARA FINAL
// ==========================================
async function submitFinalVote() {
    const btnSubmit = document.getElementById('btnSubmitVote');
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Mengirim...';

    const voterType = window.currentVoter.type || 'siswa';
    const voterId = window.currentVoter.id;
    const tableName = 'pemilih_' + voterType;

    try {
        // 1. Cek ulang status voter (race-condition guard)
        const { data: voterCheck, error: checkErr } = await db
            .from(tableName).select('sudah_memilih').eq('id', voterId).single();
        if (checkErr) throw new Error('Gagal memverifikasi data pemilih.');
        if (!voterCheck) throw new Error('Akun pemilih tidak ditemukan!');
        if (voterCheck.sudah_memilih === 1 || voterCheck.sudah_memilih === true) {
            throw new Error('Anda sudah pernah memberikan suara!');
        }

        // 2. Tandai voter sudah memilih
        const { error: updateErr } = await db
            .from(tableName)
            .update({ sudah_memilih: 1, updated_at: new Date().toISOString() })
            .eq('id', voterId)
            .eq('sudah_memilih', 0); // Optimistic lock
        if (updateErr) throw updateErr;

        // 3. Increment suara untuk setiap kandidat yang dipilih
        const suaraField = `suara_${voterType}`;
        for (const posId in voterDraftSelections) {
            const candId = voterDraftSelections[posId];
            // Gunakan RPC untuk atomic increment
            const { error: rpcErr } = await db.rpc('increment_suara', {
                p_kandidat_id: candId,
                p_field: suaraField
            });
            if (rpcErr) {
                // Fallback: manual increment jika RPC belum ada
                const { data: candCurrent } = await db.from('kandidat').select(suaraField).eq('id', candId).single();
                const currentVal = (candCurrent && candCurrent[suaraField]) || 0;
                await db.from('kandidat').update({ [suaraField]: currentVal + 1, updated_at: new Date().toISOString() }).eq('id', candId);
            }
        }

        localStorage.removeItem('pemilos_draft_pilihan');
        showModal('Voting Berhasil!', '<div class="text-center py-4"><i class="fas fa-check-circle text-emerald-500 text-5xl mb-4"></i><p class="text-white text-lg font-bold mt-2">Terima kasih atas partisipasi Anda!</p><p class="text-slate-300 text-sm">Suara Anda telah direkam dengan aman.</p></div>', false, 'Keluar', () => {
            logoutVoter();
        });

    } catch (error) {
        console.error("Voting Failed:", error);
        alert("Gagal mengirim suara: " + error.message);
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = '<i class="fas fa-paper-plane mr-2"></i>Kirim Suara Sekarang';
    }
}

// ==========================================
// LOGOUT
// ==========================================
function logoutVoter() {
    const voterView = document.getElementById('voterView');
    if (voterView) {
        voterView.classList.add('hidden');
    }
    window.currentVoter = null;
    UI.viewLogin.classList.remove('hidden');
    UI.form.reset();
}

document.querySelectorAll('.btnLogout').forEach(btn => btn.onclick = (e) => {
    e.preventDefault();
    if (window.dbSimInterval) {
        clearInterval(window.dbSimInterval);
        window.dbSimInterval = null;
    }
    // Hapus sesi admin dan kembali ke halaman login
    try { localStorage.removeItem('adminSession'); } catch (e) { }
    window.location.href = 'index.html';
});

// Password Visibility Toggle untuk index.html
const togglePasswordBtn = document.getElementById('togglePasswordBtn');
if (togglePasswordBtn) {
    togglePasswordBtn.onclick = () => {
        const passInput = document.getElementById('password');
        const toggleIcon = document.getElementById('toggleIcon');
        if (passInput && toggleIcon) {
            const isPassword = passInput.type === 'password';
            passInput.type = isPassword ? 'text' : 'password';
            toggleIcon.className = isPassword ? 'fas fa-eye-slash' : 'fas fa-eye';
        }
    };
}