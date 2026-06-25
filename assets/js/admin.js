// ==========================================
// ADMIN.JS - Logika Dashboard Admin
// E-Pemilos SMAN 2 Kuningan
// ==========================================

'use strict';

let activeVoterType = 'siswa';
let voterSearchKeyword = '';
let voterClassFilter = '';
let voterCurrentPage = 1;
let voterLimitPerPage = 10;
let allVoterRecords = [];
let firestoreVoterListener = null;
let jadwalChannel = null;
let allCandidateRecords = [];
let firestoreCandidateListener = null;
window.dbSimInterval = null;

const DEFAULT_SYSTEM_SETTINGS = {
    schoolName: "SMA Negeri 2 Kuningan",
    examTitle: "E-Pemilos OSIS & DPK 2026",
    schoolLogo: "https://iili.io/B5MMKiX.png",
    loginBg: "https://iili.io/CxZmIkP.jpg"
};

const AppStorage = {
    memoryData: {},
    get: function (key) {
        try { return localStorage.getItem(key) || this.memoryData[key]; }
        catch (e) { return this.memoryData[key]; }
    },
    set: function (key, value) {
        this.memoryData[key] = value;
        try { localStorage.setItem(key, value); } catch (e) { }
    }
};

// Konfigurasi database dikelola di: assets/js/supabase.js
const UI = {
    alert: document.getElementById('loginAlertBox'),
    viewAdmin: document.getElementById('adminView'),
    mod: document.getElementById('customModal'),
    mTitle: document.getElementById('customModalTitle'),
    mBody: document.getElementById('customModalBody'),
    mCancel: document.getElementById('modalBtnCancel'),
    mConfirm: document.getElementById('modalBtnConfirm'),
    inputName: document.getElementById('inputSchoolName'),
    inputExam: document.getElementById('inputExamTitle'),
    logoUploadStatus: document.getElementById('logoUploadStatus'),
    bgUploadStatus: document.getElementById('bgUploadStatus'),
    logoPreview: document.getElementById('settingsLogoPreview'),
    bgPreview: document.getElementById('settingsBgPreview')
};
let modalCb = null;
function showModal(title, body, showCancel, btnText, callback) {
    UI.mTitle.textContent = title; UI.mBody.innerHTML = body; UI.mConfirm.textContent = btnText;
    UI.mCancel.style.display = showCancel ? 'block' : 'none'; modalCb = callback;
    UI.mod.classList.add('active');
}
UI.mCancel.onclick = () => { UI.mod.classList.remove('active'); };
UI.mConfirm.onclick = () => { if (modalCb) modalCb(); UI.mod.classList.remove('active'); };

function showAlert(msg, isOk) {
    const el = UI.alert; if (!el) return;
    el.textContent = msg;
    el.className = 'alert-box ' + (isOk ? 'alert-success' : 'alert-error');
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 4000);
}

// Inisialisasi admin page dipanggil di akhir file setelah semua fungsi siap

async function resolveImage(idOrUrl) {
    if (!idOrUrl) return null;
    if (idOrUrl.startsWith('http') || idOrUrl.startsWith('data:')) return idOrUrl;
    if (/^[a-zA-Z0-9_\.-]{1,30}$/.test(idOrUrl)) {
        let localData = AppStorage.get('img_' + idOrUrl);
        if (localData) return localData;
        const localBgId = AppStorage.get('ep_login_bg');
        const localBgData = AppStorage.get('ep_login_bg_data');
        if (idOrUrl === localBgId && localBgData) {
            AppStorage.set('img_' + idOrUrl, localBgData);
            return localBgData;
        }
        try {
            const { data, error } = await db.from('images').select('data').eq('id', idOrUrl).single();
            if (!error && data) {
                AppStorage.set('img_' + idOrUrl, data.data);
                return data.data;
            }
        } catch (e) { console.error("Error fetching image:", e); }
    }
    return null;
}
async function renderConfiguredSettings() {
    const currentName = AppStorage.get('ep_sh_name') || DEFAULT_SYSTEM_SETTINGS.schoolName;
    const currentExam = AppStorage.get('ep_ex_title') || DEFAULT_SYSTEM_SETTINGS.examTitle;
    const currentLogoId = AppStorage.get('ep_sh_logo') || DEFAULT_SYSTEM_SETTINGS.schoolLogo;
    const currentBgId = AppStorage.get('ep_login_bg') || DEFAULT_SYSTEM_SETTINGS.loginBg;
    document.querySelectorAll('.global-school-name').forEach(el => el.textContent = currentName);
    const headerExamText = document.getElementById('headerExamTitle');
    if (headerExamText) headerExamText.textContent = currentExam;
    if (UI.inputName) UI.inputName.value = currentName;
    if (UI.inputExam) UI.inputExam.value = currentExam;
    const activeLogoText = document.getElementById('activeLogoText');
    const activeBgText = document.getElementById('activeBgText');
    const extractDisplay = (str) => {
        if (!str) return '';
        if (str.startsWith('http')) return str.substring(str.lastIndexOf('/') + 1).substring(0, 15);
        if (str.startsWith('data:')) return 'Base64Data';
        return str;
    };
    if (activeLogoText) activeLogoText.textContent = extractDisplay(currentLogoId);
    if (activeBgText) activeBgText.textContent = extractDisplay(currentBgId);
    const resolvedLogo = await resolveImage(currentLogoId);
    if (resolvedLogo) {
        const logoEl = document.getElementById('headerLogo');
        const loginLogoEl = document.getElementById('loginLogo');
        if (logoEl) logoEl.src = resolvedLogo;
        if (loginLogoEl) loginLogoEl.src = resolvedLogo;
        if (UI.logoPreview) UI.logoPreview.src = resolvedLogo;
    }
    const resolvedBg = await resolveImage(currentBgId);
    if (resolvedBg) {
        if (UI.bgPreview) UI.bgPreview.src = resolvedBg;
        const mainLoginBgEl = document.getElementById('mainLoginBg');
        const voterBgEl = document.getElementById('voterBg');
        if (mainLoginBgEl) {
            mainLoginBgEl.style.backgroundImage = `url('${resolvedBg}')`;
        }
        if (voterBgEl) {
            voterBgEl.style.backgroundImage = `url('${resolvedBg}')`;
        }
    }
}
function compressImageToLimit(file, maxDimension, targetKb, callback) {
    const reader = new FileReader();
    reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
            let currentMaxDimension = maxDimension;
            let compressedBase64 = '';
            let sizeInKb = 999999;
            let quality = 0.90;
            const performCompression = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                if (width > currentMaxDimension || height > currentMaxDimension) {
                    if (width > height) {
                        height *= currentMaxDimension / width;
                        width = currentMaxDimension;
                    } else {
                        width *= currentMaxDimension / height;
                        height = currentMaxDimension;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                // Aktifkan smoothing kualitas tinggi agar foto tidak pecah / buram
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, width, height);
                quality = 0.90;
                compressedBase64 = canvas.toDataURL('image/jpeg', quality);
                sizeInKb = (compressedBase64.length * 3 / 4) / 1024;
                while (sizeInKb > targetKb && quality > 0.50) {
                    quality -= 0.05;
                    compressedBase64 = canvas.toDataURL('image/jpeg', quality);
                    sizeInKb = (compressedBase64.length * 3 / 4) / 1024;
                }
            };
            performCompression();
            while (sizeInKb > targetKb && currentMaxDimension > 300) {
                currentMaxDimension = Math.round(currentMaxDimension * 0.8);
                performCompression();
            }
            const finalSizeKb = Math.round(sizeInKb);
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let shortId = '';
            for (let i = 0; i < 10; i++) shortId += chars.charAt(Math.floor(Math.random() * chars.length));
            callback(compressedBase64, shortId, finalSizeKb);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}
function processLogoFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    UI.logoUploadStatus.textContent = "Sedang memproses logo...";
    UI.logoUploadStatus.className = "font-semibold text-yellow-600";
    // Gunakan dimensi tetap yang ideal untuk logo agar tidak tergantung lebar layar perangkat admin
    const maxDim = 800;
    compressImageToLimit(file, maxDim, 100, function (base64Data, shortId, sizeInKb) {
        const uniqueName = 'app_logo.jpg';
        window.tempUploadedLogo = { id: uniqueName, data: base64Data };
        if (UI.logoPreview) UI.logoPreview.src = base64Data;
        UI.logoUploadStatus.textContent = `Logo siap (Kompresi: ${sizeInKb} KB). Klik Simpan!`;
        UI.logoUploadStatus.className = "font-bold text-emerald-600";
        showAlert(`Berkas logo berhasil diolah & dikompres (${sizeInKb} KB)!`, true);
    });
}
function processLoginBgFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    UI.bgUploadStatus.textContent = "Mengolah & mengkompresi gambar...";
    UI.bgUploadStatus.className = "font-semibold text-yellow-600";
    // Gunakan dimensi tetap yang ideal untuk background agar tidak tergantung lebar layar perangkat admin
    const maxDim = 1920;
    compressImageToLimit(file, maxDim, 100, function (base64Data, shortId, sizeInKb) {
        const uniqueName = `bg_${shortId}.jpg`;
        window.tempUploadedBg = { id: uniqueName, data: base64Data };
        if (UI.bgPreview) UI.bgPreview.src = base64Data;
        UI.bgUploadStatus.textContent = `Background siap: ${uniqueName} (${sizeInKb} KB). Klik Simpan!`;
        UI.bgUploadStatus.className = "font-bold text-emerald-600";
        showAlert(`Latar belakang berhasil diolah & dikompres (${sizeInKb} KB)!`, true);
    });
}
async function commitSettings() {
    const targetName = UI.inputName.value.trim() || DEFAULT_SYSTEM_SETTINGS.schoolName;
    const targetExam = UI.inputExam.value.trim() || DEFAULT_SYSTEM_SETTINGS.examTitle;
    let targetLogo = AppStorage.get('ep_sh_logo') || DEFAULT_SYSTEM_SETTINGS.schoolLogo;
    let targetBg = AppStorage.get('ep_login_bg') || DEFAULT_SYSTEM_SETTINGS.loginBg;
    let targetBgData = AppStorage.get('ep_login_bg_data') || null;
    try {
        if (window.tempUploadedLogo) {
            targetLogo = window.tempUploadedLogo.id;
            AppStorage.set('img_' + targetLogo, window.tempUploadedLogo.data);
            await db.from('images').upsert({
                id: targetLogo,
                data: window.tempUploadedLogo.data,
                updated_at: new Date().toISOString()
            });
        }
        if (window.tempUploadedBg) {
            targetBg = window.tempUploadedBg.id;
            targetBgData = window.tempUploadedBg.data;
            AppStorage.set('img_' + targetBg, targetBgData);
        }
        AppStorage.set('ep_sh_name', targetName);
        AppStorage.set('ep_ex_title', targetExam);
        AppStorage.set('ep_sh_logo', targetLogo);
        AppStorage.set('ep_login_bg', targetBg);
        if (targetBgData) {
            AppStorage.set('ep_login_bg_data', targetBgData);
        }
        await db.from('pengaturan').upsert({
            id: 'konfigurasi_aplikasi',
            school_name: targetName,
            exam_title: targetExam,
            school_logo: targetLogo,
            login_bg: targetBg,
            login_bg_data: targetBgData,
            updated_at: new Date().toISOString()
        });
        await renderConfiguredSettings();
        if (UI.logoUploadStatus) {
            UI.logoUploadStatus.textContent = "Klik untuk mengunggah logo baru...";
            UI.logoUploadStatus.className = "font-medium text-gray-600";
        }
        if (UI.bgUploadStatus) {
            UI.bgUploadStatus.textContent = "Klik untuk mengunggah gambar latar belakang baru...";
            UI.bgUploadStatus.className = "font-medium text-gray-600";
        }
        window.tempUploadedLogo = null;
        window.tempUploadedBg = null;
        showAlert("Konfigurasi aplikasi berhasil disimpan dan disinkronkan ke database!", true);
    } catch (error) {
        console.error("Error saving settings to Supabase:", error);
        showAlert("Gagal menyinkronkan ke database. Periksa koneksi atau izin.", false);
    }
}
async function resetSettingsToDefault() {
    if (!confirm("Apakah Anda yakin ingin mengembalikan semua pengaturan ke default? Tindakan ini akan menghapus logo dan latar belakang kustom.")) return;

    // Set input values to defaults
    UI.inputName.value = DEFAULT_SYSTEM_SETTINGS.schoolName;
    UI.inputExam.value = DEFAULT_SYSTEM_SETTINGS.examTitle;

    // Reset temp uploads
    window.tempUploadedLogo = null;
    window.tempUploadedBg = null;

    // Override local storage with defaults
    AppStorage.set('ep_sh_logo', DEFAULT_SYSTEM_SETTINGS.schoolLogo);
    AppStorage.set('ep_login_bg', DEFAULT_SYSTEM_SETTINGS.loginBg);
    AppStorage.set('ep_login_bg_data', null);

    // Commit to database
    await commitSettings();
}
async function fetchAppConfiguration() {
    try {
        const { data, error } = await db.from('pengaturan').select('*').eq('id', 'konfigurasi_aplikasi').single();
        if (!error && data) {
            if (data.school_name) AppStorage.set('ep_sh_name', data.school_name);
            if (data.exam_title) AppStorage.set('ep_ex_title', data.exam_title);
            if (data.school_logo) AppStorage.set('ep_sh_logo', data.school_logo);
            if (data.login_bg) AppStorage.set('ep_login_bg', data.login_bg);
            if (data.login_bg_data) AppStorage.set('ep_login_bg_data', data.login_bg_data);
            await renderConfiguredSettings();
        }
    } catch (err) {
        console.warn("Gagal menyinkronkan konfigurasi cloud di awal:", err);
    }
}
document.addEventListener('DOMContentLoaded', async () => {
    await renderConfiguredSettings();
    populateDatabaseConfigForm();
    const toggleVoterFormPasswordBtn = document.getElementById('toggleVoterFormPasswordBtn');
    if (toggleVoterFormPasswordBtn) {
        toggleVoterFormPasswordBtn.onclick = () => {
            const input = document.getElementById('voterPasswordInput');
            const icon = document.getElementById('voterFormPasswordIcon');
            input.type = input.type === 'password' ? 'text' : 'password';
            icon.className = input.type === 'password' ? 'fas fa-eye text-xs' : 'fas fa-eye-slash text-xs';
        };
    }
    try {
        await fetchAppConfiguration();
    } catch (err) {
        console.warn("Gagal fetch konfigurasi awal:", err);
    }
});
const VOTER_PASSWORD_MASK = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';
function toggleVoterPasswordVisibility(button, plainPassword) {
    const span = button.previousElementSibling;
    const icon = button.querySelector('i');
    if (span.textContent === VOTER_PASSWORD_MASK) {
        span.textContent = plainPassword;
        icon.className = 'fas fa-eye-slash text-xs';
    } else {
        span.textContent = VOTER_PASSWORD_MASK;
        icon.className = 'fas fa-eye text-xs';
    }
}
let alertTimeout = null;
function showAlert(msg, isSuccess = false) {
    if (alertTimeout) {
        clearTimeout(alertTimeout);
    }
    UI.alert.innerHTML = msg;
    UI.alert.style.display = 'block';
    UI.alert.className = `alert-box ${isSuccess ? 'alert-success' : 'alert-error'}`;
    alertTimeout = setTimeout(() => {
        UI.alert.style.display = 'none';
    }, 2000);
}
function resetBtn() {
    UI.btnSub.disabled = false;
    UI.btnSub.classList.remove('opacity-80', 'cursor-not-allowed');
    UI.btnTxt.textContent = "Masuk";
    UI.btnIco.classList.remove('hidden');
    UI.spin.classList.add('hidden');
}

function initializeAdminInteractions() {
    const sidebarToggle = document.getElementById('sidebarToggle');
    if (sidebarToggle) {
        sidebarToggle.onclick = (e) => {
            e.stopPropagation();
            document.getElementById('sidebar').classList.toggle('collapsed');
        };
    }

    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');

    if (mobileMenuToggle && sidebar && sidebarOverlay) {
        mobileMenuToggle.onclick = (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('open');
            sidebarOverlay.classList.toggle('active');
        };
        sidebarOverlay.onclick = () => {
            sidebar.classList.remove('open');
            sidebarOverlay.classList.remove('active');
        };

        // Otomatis tutup sidebar setelah link di-klik pada tampilan mobile
        sidebar.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                sidebar.classList.remove('open');
                sidebarOverlay.classList.remove('active');
            });
        });
    }

    // Tambahkan event handler untuk semua tombol logout (.btnLogout)
    document.querySelectorAll('.btnLogout').forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault();
            if (window.dbSimInterval) {
                clearInterval(window.dbSimInterval);
                window.dbSimInterval = null;
            }
            try {
                localStorage.removeItem('adminSession');
            } catch (err) {
                console.error(err);
            }
            window.location.replace('index.html');
        };
    });
}

document.addEventListener('DOMContentLoaded', initializeAdminInteractions);

function setLoginStatus(msg, isSuccess) {
    UI.loginStatusTxt.textContent = msg;
    UI.loginStatus.classList.remove('hidden');
    if (isSuccess) {
        UI.loginStatusIco.className = "fas fa-check-circle mt-0.5";
        UI.loginStatus.className = "mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs text-left flex items-start gap-2";
    } else {
        UI.loginStatusIco.className = "fas fa-exclamation-circle mt-0.5";
        UI.loginStatus.className = "mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs text-left flex items-start gap-2";
    }
}
function startSimulateDatabaseUsage() {
    if (window.dbSimInterval) clearInterval(window.dbSimInterval);
    let currentStorageMb = 145;
    let currentReads = 2450;
    let currentWrites = 820;
    function updateUI() {
        const storagePercent = ((currentStorageMb / 1024) * 100).toFixed(1);
        const readsPercent = ((currentReads / 50000) * 100).toFixed(1);
        const writesPercent = ((currentWrites / 20000) * 100).toFixed(1);
        const elStorageUsed = document.getElementById('simStorageUsed');
        const elStoragePercent = document.getElementById('simStoragePercent');
        const elStorageBar = document.getElementById('simStorageBar');
        if (elStorageUsed) {
            elStorageUsed.innerHTML = `${currentStorageMb.toFixed(1)} <span class="text-sm font-semibold text-gray-500">MB</span>`;
            elStoragePercent.textContent = `${storagePercent}%`;
            elStorageBar.style.width = `${storagePercent}%`;
        }
        const elReadsUsed = document.getElementById('simReadsUsed');
        const elReadsPercent = document.getElementById('simReadsPercent');
        const elReadsBar = document.getElementById('simReadsBar');
        if (elReadsUsed) {
            elReadsUsed.innerHTML = `${currentReads.toLocaleString('id-ID')} <span class="text-sm font-semibold text-gray-500">ops</span>`;
            elReadsPercent.textContent = `${readsPercent}%`;
            elReadsBar.style.width = `${readsPercent}%`;
        }
        const elWritesUsed = document.getElementById('simWritesUsed');
        const elWritesPercent = document.getElementById('simWritesPercent');
        const elWritesBar = document.getElementById('simWritesBar');
        if (elWritesUsed) {
            elWritesUsed.innerHTML = `${currentWrites.toLocaleString('id-ID')} <span class="text-sm font-semibold text-gray-500">ops</span>`;
            elWritesPercent.textContent = `${writesPercent}%`;
            elWritesBar.style.width = `${writesPercent}%`;
        }
    }
    updateUI();
    window.dbSimInterval = setInterval(() => {
        currentReads += Math.floor(Math.random() * 5);
        currentWrites += Math.floor(Math.random() * 2);
        currentStorageMb += (Math.random() * 0.05);
        updateUI();
    }, 3000);
}
function populateDatabaseConfigForm() {
    const elConfRaw = document.getElementById('dbConfRaw');
    if (elConfRaw) {
        const confStr = `// Konfigurasi Supabase (dikelola di assets/js/supabase.js)\n// SUPABASE_URL: ${SUPABASE_URL}\n// Database: PostgreSQL via Supabase`;
        elConfRaw.value = confStr;
    }
}
function saveDatabaseConfig() {
    showAlert("Konfigurasi Supabase dikelola langsung di file assets/js/supabase.js.", false);
}
function resetDatabaseConfig() {
    showAlert("Konfigurasi Supabase dikelola langsung di file assets/js/supabase.js.", false);
}
function switchView(viewId) {
    document.querySelectorAll('.view-content').forEach(view => {
        view.classList.add('hidden');
        view.classList.remove('block');
    });
    const targetView = document.getElementById(`view-${viewId}`);
    if (targetView) {
        targetView.classList.remove('hidden');
        targetView.classList.add('block');
    }
    const deskDashboard = document.getElementById('nav-dashboard');
    const deskPemilih = document.getElementById('nav-pemilih');
    const deskKandidat = document.getElementById('nav-kandidat');
    const deskJadwal = document.getElementById('nav-jadwal');
    const deskPengaturan = document.getElementById('nav-pengaturan');
    const resetDesktopStyle = (el, iconClass) => {
        if (!el) return;
        el.className = "sidebar-menu-link group flex items-center px-3 py-2.5 mx-3 mb-1 rounded-md text-[#b5cbdf] hover:text-white transition-all";
        const iEl = el.querySelector('i');
        if (iEl) iEl.className = `fas ${iconClass} w-6 text-center text-[#9db9d8] group-hover:text-white transition-colors`;
    };
    resetDesktopStyle(deskDashboard, 'fa-th-large');
    resetDesktopStyle(deskPemilih, 'fa-users');
    resetDesktopStyle(deskKandidat, 'fa-user-tie');
    resetDesktopStyle(deskJadwal, 'fa-calendar-alt');
    resetDesktopStyle(deskPengaturan, 'fa-cogs');
    if (viewId === 'dashboard' && deskDashboard) {
        deskDashboard.className = "flex items-center px-3 py-2.5 mx-3 mb-1 bg-white/20 text-white rounded-md border border-white/30 shadow-md transition-all";
        const iEl = deskDashboard.querySelector('i');
        if (iEl) iEl.className = "fas fa-th-large w-6 text-center text-[#38bdf8]";
    } else if (viewId === 'pemilih' && deskPemilih) {
        deskPemilih.className = "flex items-center px-3 py-2.5 mx-3 mb-1 bg-white/20 text-white rounded-md border border-white/30 shadow-md transition-all";
        const iEl = deskPemilih.querySelector('i');
        if (iEl) iEl.className = "fas fa-users w-6 text-center text-[#38bdf8]";
    } else if (viewId === 'kandidat' && deskKandidat) {
        deskKandidat.className = "flex items-center px-3 py-2.5 mx-3 mb-1 bg-white/20 text-white rounded-md border border-white/30 shadow-md transition-all";
        const iEl = deskKandidat.querySelector('i');
        if (iEl) iEl.className = "fas fa-user-tie w-6 text-center text-[#38bdf8]";
    } else if (viewId === 'jadwal' && deskJadwal) {
        deskJadwal.className = "flex items-center px-3 py-2.5 mx-3 mb-1 bg-white/20 text-white rounded-md border border-white/30 shadow-md transition-all";
        const iEl = deskJadwal.querySelector('i');
        if (iEl) iEl.className = "fas fa-calendar-alt w-6 text-center text-[#38bdf8]";
    } else if (viewId === 'pengaturan' && deskPengaturan) {
        deskPengaturan.className = "flex items-center px-3 py-2.5 mx-3 mb-1 bg-white/20 text-white rounded-md border border-white/30 shadow-md transition-all";
        const iEl = deskPengaturan.querySelector('i');
        if (iEl) iEl.className = "fas fa-cogs w-6 text-center text-[#38bdf8]";
    }
    const mobDashboard = document.getElementById('bnav-dashboard');
    const mobPemilih = document.getElementById('bnav-pemilih');
    const mobKandidat = document.getElementById('bnav-kandidat');
    const mobJadwal = document.getElementById('bnav-jadwal');
    const mobPengaturan = document.getElementById('bnav-pengaturan');
    const resetMobileStyle = (el) => {
        if (!el) return;
        el.classList.remove('text-[#38bdf8]');
        el.classList.add('text-[#b5cbdf]');
    };
    resetMobileStyle(mobDashboard);
    resetMobileStyle(mobPemilih);
    resetMobileStyle(mobKandidat);
    resetMobileStyle(mobJadwal);
    resetMobileStyle(mobPengaturan);
    if (viewId === 'dashboard' && mobDashboard) {
        mobDashboard.classList.remove('text-[#b5cbdf]');
        mobDashboard.classList.add('text-[#38bdf8]');
    } else if (viewId === 'pemilih' && mobPemilih) {
        mobPemilih.classList.remove('text-[#b5cbdf]');
        mobPemilih.classList.add('text-[#38bdf8]');
    } else if (viewId === 'kandidat' && mobKandidat) {
        mobKandidat.classList.remove('text-[#b5cbdf]');
        mobKandidat.classList.add('text-[#38bdf8]');
    } else if (viewId === 'jadwal' && mobJadwal) {
        mobJadwal.classList.remove('text-[#b5cbdf]');
        mobJadwal.classList.add('text-[#38bdf8]');
    } else if (viewId === 'pengaturan' && mobPengaturan) {
        mobPengaturan.classList.remove('text-[#b5cbdf]');
        mobPengaturan.classList.add('text-[#38bdf8]');
    }
    if (viewId !== 'pemilih') {
        const submenu = document.getElementById('pemilih-submenu-html');
        if (submenu) {
            submenu.classList.remove('flex');
            submenu.classList.add('hidden');
        }
        const arrowIcon = document.querySelector('#nav-pemilih .menu-arrow i');
        if (arrowIcon) {
            arrowIcon.classList.remove('rotate-180');
        }
        const subItems = ['nav-pemilih-siswa', 'nav-pemilih-guru', 'nav-pemilih-staf'];
        subItems.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.className = "group flex items-center pl-8 pr-3 py-2 text-xs text-[#b5cbdf] hover:text-white transition-all";
                const iEl = el.querySelector('i');
                if (iEl) iEl.className = "fas " + getSubmenuIcon(id) + " w-4 text-center text-[#9db9d8] group-hover:text-[#38bdf8] transition-colors";
                const span = el.querySelector('span');
                if (span) span.className = "ml-2 border-b border-transparent group-hover:border-[#38bdf8] pb-0.5 transition-colors menu-text";
            }
        });
    } else {
        const submenu = document.getElementById('pemilih-submenu-html');
        if (submenu && submenu.classList.contains('hidden')) {
            submenu.classList.remove('hidden');
            submenu.classList.add('flex');
            const arrowIcon = document.querySelector('#nav-pemilih .menu-arrow i');
            if (arrowIcon) arrowIcon.classList.add('rotate-180');
            switchViewHtml('pemilih-siswa');
        }
    }
    if (viewId === 'dashboard') {
        updateDashboard();
    } else if (viewId === 'kandidat') {
        loadCandidateData();
    } else {
        if (firestoreCandidateListener) {
            firestoreCandidateListener();
            firestoreCandidateListener = null;
        }
    }
    if (viewId !== 'pemilih') {
        if (firestoreVoterListener) {
            firestoreVoterListener();
            firestoreVoterListener = null;
        }
    }
    if (viewId === 'database') {
        startSimulateDatabaseUsage();
    } else if (window.dbSimInterval) {
        clearInterval(window.dbSimInterval);
        window.dbSimInterval = null;
    }
}
function toggleHtmlDropdown(e) {
    e.preventDefault();
    const submenu = document.getElementById('pemilih-submenu-html');
    const arrowIcon = document.querySelector('#nav-pemilih .menu-arrow i');
    if (submenu.classList.contains('hidden')) {
        submenu.classList.remove('hidden');
        submenu.classList.add('flex');
        if (arrowIcon) arrowIcon.classList.add('rotate-180');
        switchViewHtml('pemilih-siswa');
    } else {
        submenu.classList.remove('flex');
        submenu.classList.add('hidden');
        if (arrowIcon) arrowIcon.classList.remove('rotate-180');
    }
}
function switchViewHtml(subType) {
    document.querySelectorAll('.view-content').forEach(view => {
        view.classList.add('hidden');
        view.classList.remove('block');
    });
    const targetView = document.getElementById('view-pemilih');
    if (targetView) {
        targetView.classList.remove('hidden');
        targetView.classList.add('block');
    }
    const deskDashboard = document.getElementById('nav-dashboard');
    const deskPemilih = document.getElementById('nav-pemilih');
    const deskKandidat = document.getElementById('nav-kandidat');
    const deskJadwal = document.getElementById('nav-jadwal');
    const deskPengaturan = document.getElementById('nav-pengaturan');
    const resetDesktopStyle = (el, iconClass) => {
        if (!el) return;
        el.className = "sidebar-menu-link group flex items-center px-3 py-2.5 mx-3 mb-1 rounded-md text-[#b5cbdf] hover:text-white transition-all";
        const iEl = el.querySelector('i');
        if (iEl) iEl.className = `fas ${iconClass} w-6 text-center text-[#9db9d8] group-hover:text-white transition-colors`;
    };
    resetDesktopStyle(deskDashboard, 'fa-th-large');
    resetDesktopStyle(deskPemilih, 'fa-users');
    resetDesktopStyle(deskKandidat, 'fa-user-tie');
    resetDesktopStyle(deskJadwal, 'fa-calendar-alt');
    resetDesktopStyle(deskPengaturan, 'fa-cogs');
    if (deskPemilih) {
        deskPemilih.className = "flex items-center px-3 py-2.5 mx-3 mb-1 bg-white/20 text-white rounded-md border border-white/30 shadow-md transition-all";
        const iEl = deskPemilih.querySelector('i');
        if (iEl) iEl.className = "fas fa-users w-6 text-center text-[#38bdf8]";
    }
    const mobDashboard = document.getElementById('bnav-dashboard');
    const mobPemilih = document.getElementById('bnav-pemilih');
    const mobKandidat = document.getElementById('bnav-kandidat');
    const mobJadwal = document.getElementById('bnav-jadwal');
    const mobPengaturan = document.getElementById('bnav-pengaturan');
    const resetMobileStyle = (el) => {
        if (!el) return;
        el.classList.remove('text-[#38bdf8]');
        el.classList.add('text-[#b5cbdf]');
    };
    resetMobileStyle(mobDashboard);
    resetMobileStyle(mobPemilih);
    resetMobileStyle(mobKandidat);
    resetMobileStyle(mobJadwal);
    resetMobileStyle(mobPengaturan);
    if (mobPemilih) {
        mobPemilih.classList.remove('text-[#b5cbdf]');
        mobPemilih.classList.add('text-[#38bdf8]');
    }
    activeVoterType = (subType === 'pemilih-siswa') ? 'siswa' : ((subType === 'pemilih-guru') ? 'guru' : 'staf');
    voterSearchKeyword = '';
    voterClassFilter = '';
    voterCurrentPage = 1;
    const searchInput = document.getElementById('voterSearchInput');
    if (searchInput) searchInput.value = '';
    const titleEl = document.querySelector('#view-pemilih h2');
    const descEl = document.querySelector('#view-pemilih p');
    const btnAdd = document.getElementById('btnAddVoter');
    const idHeader = document.getElementById('voterIdHeader');
    const classHeader = document.getElementById('voterClassHeader');
    const typeLabel = activeVoterType === 'siswa' ? 'Siswa' : (activeVoterType === 'guru' ? 'Guru' : 'Staf');
    const idLabel = activeVoterType === 'siswa' ? 'NIS' : (activeVoterType === 'guru' ? 'NIP' : 'Kode Staf');
    if (titleEl) titleEl.innerHTML = `<i class="fas fa-users mr-2 text-sky-600"></i>Data ${typeLabel}`;
    if (descEl) descEl.textContent = `Pengelolaan data ${typeLabel.toLowerCase()} yang berhak memberikan suara.`;
    if (btnAdd) btnAdd.innerHTML = `<i class="fas fa-plus text-xs sm:text-sm"></i> <span class="hidden sm:inline">Tambah ${typeLabel}</span>`;
    if (idHeader) idHeader.textContent = idLabel;
    if (classHeader) classHeader.style.display = activeVoterType === 'siswa' ? 'table-cell' : 'none';
    if (activeVoterType === 'siswa') {
        updateHtmlSubmenuActive('nav-pemilih-siswa');
        updateMobileTabActive('mob-tab-siswa');
    } else if (activeVoterType === 'guru') {
        updateHtmlSubmenuActive('nav-pemilih-guru');
        updateMobileTabActive('mob-tab-guru');
    } else if (activeVoterType === 'staf') {
        updateHtmlSubmenuActive('nav-pemilih-staf');
        updateMobileTabActive('mob-tab-staf');
    }
    loadVoterData();
}
function updateHtmlSubmenuActive(activeId) {
    const items = ['nav-pemilih-siswa', 'nav-pemilih-guru', 'nav-pemilih-staf'];
    items.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const span = el.querySelector('span');
        if (id === activeId) {
            el.className = "group flex items-center pl-8 pr-3 py-2 text-xs text-white transition-all";
            el.querySelector('i').className = "fas " + getSubmenuIcon(id) + " w-4 text-center text-[#38bdf8]";
            if (span) span.className = "ml-2 border-b border-[#38bdf8] pb-0.5 transition-colors menu-text";
        } else {
            el.className = "group flex items-center pl-8 pr-3 py-2 text-xs text-[#b5cbdf] hover:text-white transition-all";
            el.querySelector('i').className = "fas " + getSubmenuIcon(id) + " w-4 text-center text-[#9db9d8] group-hover:text-[#38bdf8] transition-colors";
            if (span) span.className = "ml-2 border-b border-transparent group-hover:border-[#38bdf8] pb-0.5 transition-colors menu-text";
        }
    });
}
function updateMobileTabActive(activeId) {
    const tabs = ['mob-tab-siswa', 'mob-tab-guru', 'mob-tab-staf'];
    tabs.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (id === activeId) {
            el.className = "flex-1 py-3 text-[11px] sm:text-xs font-bold text-center border-b-2 border-[#38bdf8] text-[#38bdf8] transition-colors bg-white";
        } else {
            el.className = "flex-1 py-3 text-[11px] sm:text-xs font-bold text-center border-b-2 border-transparent text-gray-500 hover:text-gray-700 transition-colors bg-white hover:bg-gray-50";
        }
    });
}
function getSubmenuIcon(id) {
    if (id === 'nav-pemilih-siswa') return 'fa-user-graduate';
    if (id === 'nav-pemilih-guru') return 'fa-chalkboard-teacher';
    return 'fa-user-cog';
}
async function loadVoterData(forceRefresh = false) {
    if (firestoreVoterListener) {
        firestoreVoterListener();
        firestoreVoterListener = null;
    }
    const tbody = document.getElementById('voterTableBody');

    if (!forceRefresh) {
        let localData = AppStorage.get('voters_' + activeVoterType);
        if (localData) {
            try {
                allVoterRecords = JSON.parse(localData);
                renderVoterClassFilterOptions();
                voterCurrentPage = 1;
                renderVoterTable();
                return;
            } catch (e) {
                console.error("Local data invalid, fetching from DB");
            }
        }
    }

    if (tbody) {
        tbody.innerHTML = `
                    <tr>
                        <td colspan="8" class="py-10 text-gray-400">
                            <i class="fas fa-spinner animate-spin text-2xl mb-2 block"></i>
                            Memuat data ${activeVoterType}...
                        </td>
                    </tr>
                `;
    }
    try {
        const tableName = 'pemilih_' + activeVoterType;
        const { data: rows, error } = await db.from(tableName).select('*').order('nama');
        if (error) throw error;
        allVoterRecords = (rows || []).map(row => ({ ...row }));
        AppStorage.set('voters_' + activeVoterType, JSON.stringify(allVoterRecords));
        renderVoterClassFilterOptions();
        voterCurrentPage = 1;
        renderVoterTable();
    } catch (error) {
        console.error("Error loading voter data:", error);
        if (tbody) {
            tbody.innerHTML = `
                        <tr>
                            <td colspan="8" class="py-10 text-red-500 font-bold">
                                <i class="fas fa-exclamation-triangle text-2xl mb-2 block"></i>
                                Gagal memuat data. Periksa koneksi atau izin Supabase.
                            </td>
                        </tr>
                    `;
        }
    }
}
function renderVoterClassFilterOptions() {
    const selectEl = document.getElementById('voterFilterKelas');
    if (!selectEl) return;
    const filterContainer = document.getElementById('kelasFilterContainer');
    if (activeVoterType !== 'siswa') {
        if (filterContainer) filterContainer.style.display = 'none';
        return;
    } else {
        if (filterContainer) filterContainer.style.display = 'block';
    }
    const uniqueClasses = [...new Set(allVoterRecords
        .map(v => v.kelas)
        .filter(c => c && c.trim() !== "")
    )];
    uniqueClasses.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    const prevValue = voterClassFilter;
    selectEl.innerHTML = '<option value="">-- Semua Kelas --</option>';
    uniqueClasses.forEach(cls => {
        const opt = document.createElement('option');
        opt.value = cls;
        opt.textContent = cls;
        if (cls === prevValue) opt.selected = true;
        selectEl.appendChild(opt);
    });
}
function renderVoterTable() {
    const tbody = document.getElementById('voterTableBody');
    if (!tbody) return;
    let filteredRecords = allVoterRecords.filter(record => {
        const matchSearch = (record.nama || "").toLowerCase().includes(voterSearchKeyword.toLowerCase()) ||
            (record.id || "").toLowerCase().includes(voterSearchKeyword.toLowerCase());
        let matchClass = true;
        if (activeVoterType === 'siswa' && voterClassFilter) {
            matchClass = record.kelas === voterClassFilter;
        }
        return matchSearch && matchClass;
    });
    const totalRecords = filteredRecords.length;
    const totalPages = Math.ceil(totalRecords / voterLimitPerPage) || 1;
    if (voterCurrentPage > totalPages) voterCurrentPage = totalPages;
    if (voterCurrentPage < 1) voterCurrentPage = 1;
    const startIndex = (voterCurrentPage - 1) * voterLimitPerPage;
    const endIndex = Math.min(startIndex + voterLimitPerPage, totalRecords);
    const paginatedRecords = filteredRecords.slice(startIndex, endIndex);
    const infoEl = document.getElementById('voterTableInfo');
    if (infoEl) {
        if (totalRecords > 0) {
            infoEl.textContent = `Menampilkan ${startIndex + 1}-${endIndex} dari ${totalRecords} data`;
        } else {
            infoEl.textContent = `Menampilkan 0-0 dari 0 data`;
        }
    }
    if (paginatedRecords.length === 0) {
        tbody.innerHTML = `
                    <tr>
                        <td colspan="${activeVoterType === 'siswa' ? 8 : 7}" class="py-10 text-gray-500 text-center">
                            Tidak ada data pemilih ditemukan.
                        </td>
                    </tr>
                `;
    } else {
        let html = '';
        paginatedRecords.forEach((record, index) => {
            const rowNumber = startIndex + index + 1;
            const genderLabel = record.jenis_kelamin === 'L' ? 'Laki-Laki' : (record.jenis_kelamin === 'P' ? 'Perempuan' : record.jenis_kelamin || '-');
            const votingStatusHtml = record.sudah_memilih == 1 || record.sudah_memilih === true ?
                `<span class="text-green-600 font-bold"><i class="fas fa-check-circle mr-1"></i> Sudah Memilih</span>` :
                `<span class="text-red-600 font-semibold"><i class="fas fa-times-circle mr-1"></i> Belum Memilih</span>`;
            const defaultPass = activeVoterType === 'siswa' ? 'siswa123' : (activeVoterType === 'guru' ? 'guru123' : 'staf123');
            const voterPassword = record.password || defaultPass;
            html += `
                        <tr class="hover:bg-slate-50 border-b border-gray-100 transition-colors">
                            <td class="py-3 px-3 border border-gray-150 text-center font-medium text-gray-500">${rowNumber}</td>
                            <td class="py-3 px-3 border border-gray-150 text-center font-mono font-semibold">${record.id}</td>
                            <td class="py-3 px-3 border border-gray-150 text-left font-medium text-gray-800">${record.nama}</td>
                            ${activeVoterType === 'siswa' ? `<td class="py-3 px-3 border border-gray-150 text-center">${record.kelas || '-'}</td>` : ''}
                            <td class="py-3 px-3 border border-gray-150 text-center">${genderLabel}</td>
                            <td class="py-3 px-3 border border-gray-150 text-center font-mono relative">
                                <span class="voter-password-display">${VOTER_PASSWORD_MASK}</span>
                                <button onclick="toggleVoterPasswordVisibility(this, '${voterPassword}')" class="ml-1.5 text-gray-400 hover:text-sky-600 focus:outline-none" title="Tampilkan/Sembunyikan Sandi">
                                    <i class="fas fa-eye text-xs"></i>
                                </button>
                            </td>
                            <td class="py-3 px-3 border border-gray-150 text-center">${votingStatusHtml}</td>
                            <td class="py-3 px-3 border border-gray-150 text-center">
                                <button onclick="openVoterModal('edit', '${record.id}')" class="text-sky-600 hover:text-sky-800 font-semibold mr-3 transition-colors">Edit</button>
                                <button onclick="deleteVoter('${record.id}', '${record.nama}')" class="text-rose-500 hover:text-rose-700 font-semibold transition-colors">Hapus</button>
                            </td>
                        </tr>
                    `;
        });
        tbody.innerHTML = html;
    }
    const classHeader = document.getElementById('voterClassHeader');
    if (classHeader) {
        classHeader.style.display = activeVoterType === 'siswa' ? 'table-cell' : 'none';
    }
    renderVoterPagination(totalPages);
}
function renderVoterPagination(totalPages) {
    const container = document.getElementById('voterPagination');
    if (!container) return;
    let html = '';
    if (voterCurrentPage > 1) {
        html += `<button onclick="changeVoterPage(${voterCurrentPage - 1})" class="px-2.5 py-1 text-xs font-semibold rounded border border-gray-300 bg-white hover:bg-slate-50 transition-colors">&laquo; Prev</button>`;
    } else {
        html += `<button disabled class="px-2.5 py-1 text-xs font-semibold rounded border border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed">&laquo; Prev</button>`;
    }
    const startPage = Math.max(1, voterCurrentPage - 2);
    const endPage = Math.min(totalPages, voterCurrentPage + 2);
    if (startPage > 1) {
        html += `<button onclick="changeVoterPage(1)" class="px-2.5 py-1 text-xs font-semibold rounded border border-gray-300 bg-white hover:bg-slate-50 transition-colors">1</button>`;
        if (startPage > 2) html += `<span class="px-1 text-gray-500">...</span>`;
    }
    for (let i = startPage; i <= endPage; i++) {
        if (i === voterCurrentPage) {
            html += `<button class="px-2.5 py-1 text-xs font-bold rounded border border-sky-600 bg-sky-600 text-white shadow-sm">${i}</button>`;
        } else {
            html += `<button onclick="changeVoterPage(${i})" class="px-2.5 py-1 text-xs font-semibold rounded border border-gray-300 bg-white hover:bg-slate-50 transition-colors">${i}</button>`;
        }
    }
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += `<span class="px-1 text-gray-500">...</span>`;
        html += `<button onclick="changeVoterPage(${totalPages})" class="px-2.5 py-1 text-xs font-semibold rounded border border-gray-300 bg-white hover:bg-slate-50 transition-colors">${totalPages}</button>`;
    }
    if (voterCurrentPage < totalPages) {
        html += `<button onclick="changeVoterPage(${voterCurrentPage + 1})" class="px-2.5 py-1 text-xs font-semibold rounded border border-gray-300 bg-white hover:bg-slate-50 transition-colors">Next &raquo;</button>`;
    } else {
        html += `<button disabled class="px-2.5 py-1 text-xs font-semibold rounded border border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed">Next &raquo;</button>`;
    }
    container.innerHTML = html;
}
function changeVoterPage(page) {
    voterCurrentPage = page;
    renderVoterTable();
}
function changeVoterLimit(val) {
    if (val === 'all') {
        voterLimitPerPage = allVoterRecords.length > 0 ? allVoterRecords.length : 999999;
    } else {
        voterLimitPerPage = parseInt(val, 10);
    }
    voterCurrentPage = 1;
    renderVoterTable();
}
function filterVoterByKelas(cls) {
    voterClassFilter = cls;
    voterCurrentPage = 1;
    renderVoterTable();
}
function searchVoter(val) {
    voterSearchKeyword = val;
    voterCurrentPage = 1;
    renderVoterTable();
}
function openVoterModal(action = 'add', voterId = '') {
    const modal = document.getElementById('voterModal');
    const titleEl = document.getElementById('voterModalTitle');
    const form = document.getElementById('voterForm');
    const idInput = document.getElementById('voterIdInput');
    const nameInput = document.getElementById('voterNameInput');
    const classInput = document.getElementById('voterClassInput');
    const jkInput = document.getElementById('voterJkInput');
    const passwordInput = document.getElementById('voterPasswordInput');
    const statusInput = document.getElementById('voterStatusInput');
    const actionTypeInput = document.getElementById('voterActionType');
    const classContainer = document.getElementById('voterClassInputContainer');
    const lblId = document.getElementById('lblVoterId');
    if (!modal || !form) return;
    if (activeVoterType === 'siswa') {
        lblId.textContent = 'NIS';
        if (classContainer) classContainer.style.display = 'block';
    } else if (activeVoterType === 'guru') {
        lblId.textContent = 'NIP';
        if (classContainer) classContainer.style.display = 'none';
    } else if (activeVoterType === 'staf') {
        lblId.textContent = 'Kode Staf';
        if (classContainer) classContainer.style.display = 'none';
    }
    actionTypeInput.value = action;
    form.reset();
    if (action === 'add') {
        titleEl.textContent = `Tambah Data ${activeVoterType === 'siswa' ? 'Siswa' : (activeVoterType === 'guru' ? 'Guru' : 'Staf')}`;
        idInput.disabled = false;
        idInput.classList.remove('opacity-60', 'cursor-not-allowed');
        statusInput.value = "0";
        if (passwordInput) passwordInput.value = "";
    } else {
        titleEl.textContent = `Edit Data ${activeVoterType === 'siswa' ? 'Siswa' : (activeVoterType === 'guru' ? 'Guru' : 'Staf')}`;
        idInput.disabled = true;
        idInput.classList.add('opacity-60', 'cursor-not-allowed');
        const record = allVoterRecords.find(v => v.id === voterId);
        if (record) {
            idInput.value = record.id;
            nameInput.value = record.nama || "";
            if (activeVoterType === 'siswa') classInput.value = record.kelas || "";
            jkInput.value = record.jenis_kelamin || "L";
            statusInput.value = record.sudah_memilih == 1 || record.sudah_memilih === true ? "1" : "0";
            if (passwordInput) passwordInput.value = record.password || "";
        }
    }
    if (passwordInput) {
        passwordInput.type = "password";
        const formIcon = document.getElementById('voterFormPasswordIcon');
        if (formIcon) formIcon.className = "fas fa-eye text-xs";
    }
    modal.classList.add('active');
}
function closeVoterModal() {
    const modal = document.getElementById('voterModal');
    if (modal) modal.classList.remove('active');
}
async function saveVoter(e) {
    e.preventDefault();
    const action = document.getElementById('voterActionType').value;
    const voterId = document.getElementById('voterIdInput').value.trim();
    const name = document.getElementById('voterNameInput').value.trim();
    const kelas = document.getElementById('voterClassInput').value.trim();
    const jk = document.getElementById('voterJkInput').value;
    const password = document.getElementById('voterPasswordInput') ? document.getElementById('voterPasswordInput').value.trim() : '';
    const status = document.getElementById('voterStatusInput').value === "1" ? 1 : 0;
    if (!voterId || !name) return;
    const tableName = 'pemilih_' + activeVoterType;
    try {
        const saveData = {
            id: voterId,
            nama: name,
            jenis_kelamin: jk,
            sudah_memilih: status,
            password: password,
            updated_at: new Date().toISOString()
        };
        if (activeVoterType === 'siswa') {
            saveData.kelas = kelas;
            saveData.nis = voterId;
        } else if (activeVoterType === 'guru') {
            saveData.nip = voterId;
        } else if (activeVoterType === 'staf') {
            saveData.kode = voterId;
        }
        if (action === 'add') {
            const { data: existing } = await db.from(tableName).select('id').eq('id', voterId).single();
            if (existing) {
                alert(`ID ${voterId} sudah terdaftar! Gunakan ID yang lain.`);
                return;
            }
        }
        const { error } = await db.from(tableName).upsert(saveData);
        if (error) throw error;
        showAlert(`Data berhasil disimpan!`, true);
        closeVoterModal();
        AppStorage.set('voters_' + activeVoterType, null);
        loadVoterData(true);
    } catch (err) {
        console.error("Error saving voter:", err);
        showAlert(`Gagal menyimpan data: ${err.message}`, false);
    }
}
function deleteVoter(voterId, voterName) {
    showModal(
        "Hapus Data",
        `Apakah Anda yakin ingin menghapus data pemilih <strong>${voterName}</strong> (${voterId})?`,
        true,
        "Hapus",
        async () => {
            try {
                const tableName = 'pemilih_' + activeVoterType;
                const { error } = await db.from(tableName).delete().eq('id', voterId);
                if (error) throw error;
                showAlert(`Data ${voterName} berhasil dihapus!`, true);
                AppStorage.set('voters_' + activeVoterType, null);
                loadVoterData(true);
            } catch (err) {
                console.error("Error deleting voter:", err);
                showAlert(`Gagal menghapus data: ${err.message}`, false);
            }
        }
    );
}
function handleExcelImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    showAlert("Sedang mengurai file Excel...", true);
    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);
            if (jsonData.length === 0) {
                showAlert("File Excel kosong atau format tidak sesuai!", false);
                return;
            }
            showAlert(`Menemukan ${jsonData.length} baris data. Sedang mengunggah ke database...`, true);
            const tableName = 'pemilih_' + activeVoterType;
            const records = [];
            for (const row of jsonData) {
                const cleanRow = {};
                Object.keys(row).forEach(key => {
                    const cleanKey = key.trim().toLowerCase().replace(/\s+/g, '_');
                    cleanRow[cleanKey] = row[key];
                });
                const idVal = String(cleanRow.id || cleanRow.nis || cleanRow.nip || cleanRow.kode || "").trim();
                const namaVal = String(cleanRow.nama || cleanRow.name || "").trim();
                const kelasVal = String(cleanRow.kelas || cleanRow.class || "").trim();
                const passwordVal = cleanRow.password !== undefined ? String(cleanRow.password).trim() : (cleanRow.sandi !== undefined ? String(cleanRow.sandi).trim() : "");
                let jkVal = String(cleanRow.jenis_kelamin || cleanRow.jk || cleanRow.gender || "").trim().toUpperCase();
                if (jkVal.startsWith('L') || jkVal === 'LAKI-LAKI') jkVal = 'L';
                else if (jkVal.startsWith('P') || jkVal === 'PEREMPUAN') jkVal = 'P';
                else jkVal = 'L';
                if (!idVal || !namaVal) {
                    console.warn("Melewati baris data karena ID atau Nama kosong:", row);
                    continue;
                }
                const recordData = {
                    id: idVal,
                    nama: namaVal,
                    jenis_kelamin: jkVal,
                    sudah_memilih: 0,
                    password: passwordVal,
                    updated_at: new Date().toISOString()
                };
                if (activeVoterType === 'siswa') {
                    recordData.kelas = kelasVal;
                    recordData.nis = idVal;
                } else if (activeVoterType === 'guru') {
                    recordData.nip = idVal;
                } else if (activeVoterType === 'staf') {
                    recordData.kode = idVal;
                }
                records.push(recordData);
            }
            if (records.length > 0) {
                showAlert(`Mengunggah ${records.length} data ${activeVoterType} secara massal...`, true);
                // Upsert in chunks of 500
                const CHUNK_SIZE = 500;
                for (let i = 0; i < records.length; i += CHUNK_SIZE) {
                    const chunk = records.slice(i, i + CHUNK_SIZE);
                    const { error } = await db.from(tableName).upsert(chunk);
                    if (error) throw error;
                }
                AppStorage.set('voters_' + activeVoterType, null);
                loadVoterData(true);
                showAlert(`Berhasil mengunggah ${records.length} data ${activeVoterType} secara massal!`, true);
            } else {
                showAlert("Tidak ada baris data valid yang diunggah.", false);
            }
        } catch (err) {
            console.error("Error importing excel:", err);
            showAlert(`Gagal mengimpor file Excel: ${err.message}`, false);
        }
        document.getElementById('excelFileInput').value = '';
    };
    reader.readAsArrayBuffer(file);
}
function downloadExcelTemplate() {
    const wb = XLSX.utils.book_new();
    let data = [];
    if (activeVoterType === 'siswa') {
        data = [
            { "NIS": "26270101", "Nama": "Ahmad Budiman", "Kelas": "X IPA 1", "Jenis Kelamin (L/P)": "L", "Password": "siswa123" },
            { "NIS": "26270102", "Nama": "Siti Nurhaliza", "Kelas": "XI IPS 2", "Jenis Kelamin (L/P)": "P", "Password": "siswa123" }
        ];
    } else if (activeVoterType === 'guru') {
        data = [
            { "NIP": "198503112010011002", "Nama": "Drs. H. Mulyono, M.Pd.", "Jenis Kelamin (L/P)": "L", "Password": "guru123" },
            { "NIP": "199008242015022003", "Nama": "Sari Wahyuni, S.Pd.", "Jenis Kelamin (L/P)": "P", "Password": "guru123" }
        ];
    } else if (activeVoterType === 'staf') {
        data = [
            { "Kode Staf": "STF001", "Nama": "Rian Ardiansyah", "Jenis Kelamin (L/P)": "L", "Password": "staf123" },
            { "Kode Staf": "STF002", "Nama": "Diana Lestari", "Jenis Kelamin (L/P)": "P", "Password": "staf123" }
        ];
    }
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Template " + activeVoterType.toUpperCase());
    XLSX.writeFile(wb, `Template_Import_${activeVoterType.toUpperCase()}.xlsx`);
    showAlert("Berhasil mengunduh template Excel!", true);
}
async function downloadVoterCardsPdf() {
    let filteredRecords = allVoterRecords.filter(record => {
        const matchSearch = (record.nama || "").toLowerCase().includes(voterSearchKeyword.toLowerCase()) ||
            (record.id || "").toLowerCase().includes(voterSearchKeyword.toLowerCase());
        let matchClass = true;
        if (activeVoterType === 'siswa' && voterClassFilter) {
            matchClass = record.kelas === voterClassFilter;
        }
        return matchSearch && matchClass;
    });
    if (filteredRecords.length === 0) {
        showAlert("Tidak ada data pemilih untuk dicetak kartu!", false);
        return;
    }
    showAlert("Sedang mempersiapkan kartu PDF...", true);
    const logoEl = document.getElementById('headerLogo');
    let logoDataUrl = null;
    const ballotBoxUrl = 'https://iili.io/Cu7VhhJ.png';
    const preloadImage = (url) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = url;
        });
    };
    const ballotBoxImg = await preloadImage(ballotBoxUrl);
    if (logoEl && logoEl.src && !logoEl.src.includes('base64,R0lGODlhAQABAAD')) {
        logoDataUrl = logoEl.src;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const kartuLebar = 85.6;
    const kartuTinggi = 50;
    const marginX = 8;
    const marginY = 6;
    const posXAwal = 15.4;
    const posYAwal = 10;
    let posX = posXAwal;
    let posY = posYAwal;
    let col = 0;
    let rowCount = 0;
    for (let i = 0; i < filteredRecords.length; i++) {
        const record = filteredRecords[i];
        let qrDataUrl = null;
        try {
            const qr = new QRious({
                value: 'https://arnnon28.github.io/pemilos_smanda/',
                size: 200,
                level: 'M'
            });
            qrDataUrl = qr.toDataURL('image/jpeg');
        } catch (err) {
            console.error("QR Code generation failed for ID:", record.id, err);
        }
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(34, 102, 170);
        doc.setLineWidth(0.3);
        doc.roundedRect(posX, posY, kartuLebar, kartuTinggi, 3, 3, 'FD');
        doc.setFillColor(34, 102, 170);
        doc.roundedRect(posX, posY, kartuLebar, 14, 3, 3, 'F');
        doc.rect(posX, posY + 7, kartuLebar, 7, 'F');
        
        // Add School Logo on the left
        if (logoDataUrl) {
            try {
                doc.addImage(logoDataUrl, 'PNG', posX + 3, posY + 2, 10, 10);
            } catch (e) {
                console.error("Failed to add school logo to PDF card:", e);
            }
        }
        
        // Add Ballot Box (Kotak Suara) on the right
        let addedBallotBox = false;
        if (ballotBoxImg) {
            try {
                // Sized at 11x11 and positioned at posY + 1.5 to visually match the school logo
                doc.addImage(ballotBoxImg, 'PNG', posX + kartuLebar - 14, posY + 1.5, 11, 11);
                addedBallotBox = true;
            } catch (e) {
                console.error("Failed to add ballot box image, falling back to vector:", e);
            }
        }
        if (!addedBallotBox) {
            const boxX = posX + kartuLebar - 14;
            const boxY = posY + 1.5;
            const boxW = 11;
            const boxH = 11;
            doc.setDrawColor(255, 255, 255);
            doc.setFillColor(34, 102, 170);
            doc.setLineWidth(0.4);
            doc.rect(boxX + 1.1, boxY + 4.4, boxW - 2.2, boxH - 5.5, 'FD'); // Box body
            doc.rect(boxX, boxY + 3.3, boxW, 1.3, 'FD'); // Box lid
            doc.setDrawColor(34, 102, 170);
            doc.setLineWidth(0.3);
            doc.line(boxX + 2.2, boxY + 3.9, boxX + boxW - 2.2, boxY + 3.9); // Slot line
            doc.setFillColor(255, 255, 255);
            doc.setDrawColor(255, 255, 255);
            doc.rect(boxX + 3.5, boxY + 0.5, boxW - 7, 2.8, 'FD'); // Ballot paper
            doc.setDrawColor(220, 50, 50);
            doc.setLineWidth(0.3);
            doc.line(boxX + 4.6, boxY + 2.0, boxX + 5.3, boxY + 2.6); // Checkmark part 1
            doc.line(boxX + 5.3, boxY + 2.6, boxX + 6.4, boxY + 1.1); // Checkmark part 2
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(255, 255, 255);
        doc.text('KARTU PEMILIHAN', posX + kartuLebar / 2, posY + 5.5, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.text('SMA Negeri 2 Kuningan', posX + kartuLebar / 2, posY + 10, { align: 'center' });
        const labelX = posX + 5;
        const valX = labelX + 16;
        let textY = posY + 20;
        const drawDataRow = (label, value, valueColor = [10, 10, 10], isBold = true) => {
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 100, 100);
            doc.setFontSize(7.5);
            doc.text(label, labelX, textY);
            doc.text(':', labelX + 13, textY);
            doc.setFont('helvetica', isBold ? 'bold' : 'normal');
            doc.setTextColor(valueColor[0], valueColor[1], valueColor[2]);
            doc.setFontSize(8);
            
            // split value if it's text to prevent overlapping with QR code
            // max width is 36mm (valX is posX + 21, QR is at posX + 61.6, so 40.6mm max width, 36mm is safe)
            const lines = doc.splitTextToSize(String(value), 36);
            for (let i = 0; i < lines.length; i++) {
                doc.text(lines[i], valX, textY);
                if (i < lines.length - 1) {
                    textY += 3.5;
                }
            }
            textY += 4.5;
        };
        let nameStr = record.nama || '-';
        drawDataRow('Nama', nameStr, [10, 10, 10], true);
        const idLabel = activeVoterType === 'siswa' ? 'NIS' : (activeVoterType === 'guru' ? 'NIP' : 'Kode Staf');
        drawDataRow(idLabel, record.id, [10, 10, 10], true);
        if (activeVoterType === 'siswa') {
            drawDataRow('Kelas', record.kelas || '-', [10, 10, 10], true);
        }
        const defaultPass = activeVoterType === 'siswa' ? 'siswa123' : (activeVoterType === 'guru' ? 'guru123' : 'staf123');
        const voterPassword = record.password || defaultPass;
        drawDataRow('Password', voterPassword, [220, 50, 50], true);
        if (qrDataUrl) {
            const qrSize = 20;
            const qrX = posX + kartuLebar - qrSize - 4;
            const qrY = posY + 15;
            doc.addImage(qrDataUrl, 'JPEG', qrX, qrY, qrSize, qrSize);
        }
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(120, 120, 120);
        doc.setFontSize(7.5);
        doc.text('Website: https://arnnon28.github.io/pemilos_smanda', posX + kartuLebar / 2, posY + kartuTinggi - 5.5, { align: 'center' });
        doc.setFillColor(34, 102, 170);
        doc.roundedRect(posX, posY + kartuTinggi - 3, kartuLebar, 3, 3, 3, 'F');
        doc.rect(posX, posY + kartuTinggi - 3, kartuLebar, 1.5, 'F');
        col++;
        if (col === 2) {
            col = 0;
            rowCount++;
            posX = posXAwal;
            posY += kartuTinggi + marginY;
        } else {
            posX += kartuLebar + marginX;
        }
        if (rowCount === 5 && i < filteredRecords.length - 1) {
            doc.addPage();
            posX = posXAwal;
            posY = posYAwal;
            col = 0;
            rowCount = 0;
        }
    }
    doc.save(`Kartu_Pemilih_${activeVoterType.toUpperCase()}.pdf`);
    showAlert("Berhasil mengunduh Kartu Pemilih PDF!", true);
}
async function updateDashboard() {
    const btnRefresh = document.querySelector('button[title="Refresh Data"]');
    if (btnRefresh) {
        btnRefresh.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
        btnRefresh.disabled = true;
    }
    try {
        const { data: candRows, error: candError } = await db.from('kandidat').select('*');
        if (candError) throw candError;
        let candidates = [];
        (candRows || []).forEach(d => {
            const s_siswa = d.suara_siswa || 0;
            const s_guru = d.suara_guru || 0;
            const s_staf = d.suara_staf || 0;
            let total = s_siswa + s_guru + s_staf;
            candidates.push({
                id: d.id,
                nama: d.nama || 'Tanpa Nama',
                posisi: d.posisi || 'Lainnya',
                nomor_urut: d.nomor_urut || '-',
                kelas: d.kelas || '-',
                suara_siswa: s_siswa,
                suara_guru: s_guru,
                suara_staf: s_staf,
                total_suara: total
            });
        });
        const voterTypes = ['siswa', 'guru', 'staf'];
        let stats = {
            total: 0,
            masuk: 0,
            belum: 0,
            partisipasi: {
                siswa: { total: 0, masuk: 0, belum: 0 },
                guru: { total: 0, masuk: 0, belum: 0 },
                staf: { total: 0, masuk: 0, belum: 0 }
            }
        };
        for (const vType of voterTypes) {
            const { data: vRows } = await db.from('pemilih_' + vType).select('sudah_memilih');
            (vRows || []).forEach(row => {
                stats.total++;
                stats.partisipasi[vType].total++;
                if (row.sudah_memilih == 1 || row.sudah_memilih === true) {
                    stats.masuk++;
                    stats.partisipasi[vType].masuk++;
                } else {
                    stats.belum++;
                    stats.partisipasi[vType].belum++;
                }
            });
        }
        const pcn = stats.total > 0 ? ((stats.masuk / stats.total) * 100).toFixed(0) : 0;
        document.getElementById('stat-total').textContent = stats.total;
        document.getElementById('stat-masuk').textContent = stats.masuk;
        document.getElementById('stat-belum').textContent = stats.belum;
        document.getElementById('stat-persen').textContent = pcn + '%';
        const tPartBody = document.getElementById('tabel-partisipasi-body');
        if (tPartBody) {
            tPartBody.innerHTML = '';
            const typesMap = { 'siswa': 'Siswa', 'guru': 'Guru', 'staf': 'Staf' };
            let htmlPart = '';
            for (const vType of voterTypes) {
                const s = stats.partisipasi[vType];
                const pct = s.total > 0 ? ((s.masuk / s.total) * 100).toFixed(0) : 0;
                htmlPart += `
                            <tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                <td class="py-3 px-3 border-x border-gray-100 font-semibold text-center">${typesMap[vType]}</td>
                                <td class="py-3 px-3 border-x border-gray-100 text-center">${s.total}</td>
                                <td class="py-3 px-3 border-x border-gray-100 text-center text-emerald-600 font-bold">${s.masuk}</td>
                                <td class="py-3 px-3 border-x border-gray-100 text-center text-rose-500 font-bold">${s.belum}</td>
                                <td class="py-3 px-3 border-x border-gray-100 text-center font-bold text-sky-600">${pct}%</td>
                            </tr>
                        `;
            }
            htmlPart += `
                        <tr class="border-t-2 border-slate-200">
                            <td class="py-3 px-3 border-x border-[#2980b9] text-center font-bold bg-[#2980b9] text-white">TOTAL</td>
                            <td class="py-3 px-3 border-x border-[#3498db] text-center font-bold bg-[#3498db] text-white">${stats.total}</td>
                            <td class="py-3 px-3 border-x border-[#3498db] text-center font-bold bg-[#3498db] text-white">${stats.masuk}</td>
                            <td class="py-3 px-3 border-x border-[#3498db] text-center font-bold bg-[#3498db] text-white">${stats.belum}</td>
                            <td class="py-3 px-3 border-x border-[#3498db] text-center font-bold bg-[#3498db] text-white">${pcn}%</td>
                        </tr>
                    `;
            tPartBody.innerHTML = htmlPart;
        }
        const tRinciBody = document.getElementById('tabel-rinci-body');
        if (tRinciBody) {
            if (candidates.length === 0) {
                tRinciBody.innerHTML = '<tr><td colspan="7" class="py-10 text-gray-500 text-center">Belum ada data kandidat...</td></tr>';
            } else {
                candidates.sort((a, b) => {
                    const posA = a.posisi || "";
                    const posB = b.posisi || "";
                    if (posA !== posB) {
                        const orderMap = { "Ketua Umum OSIS": 1, "Ketua 2 OSIS": 2, "Ketua Umum DPK": 3, "Ketua 2 DPK": 4 };
                        const wa = orderMap[posA] || 99;
                        const wb2 = orderMap[posB] || 99;
                        if (wa !== wb2) return wa - wb2;
                        return posA.localeCompare(posB);
                    }
                    const numA = parseInt(a.nomor_urut) || 0;
                    const numB = parseInt(b.nomor_urut) || 0;
                    return numA - numB;
                });
                let votesPerPosisi = {};
                candidates.forEach(c => {
                    if (!votesPerPosisi[c.posisi]) votesPerPosisi[c.posisi] = 0;
                    votesPerPosisi[c.posisi] += c.total_suara;
                });
                let htmlRinci = '';
                candidates.forEach(c => {
                    htmlRinci += `
                                <tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                    <td class="py-3 px-3 border-x border-gray-100 text-center font-bold">${c.nomor_urut}</td>
                                    <td class="py-3 px-3 border-x border-gray-100 text-left font-semibold">${c.nama}</td>
                                    <td class="py-3 px-3 border-x border-gray-100 text-left">${c.posisi}</td>
                                    <td class="py-3 px-3 border-x border-gray-100 text-center">${c.suara_siswa}</td>
                                    <td class="py-3 px-3 border-x border-gray-100 text-center">${c.suara_guru}</td>
                                    <td class="py-3 px-3 border-x border-gray-100 text-center">${c.suara_staf}</td>
                                    <td class="py-3 px-3 border-x border-gray-100 text-center font-bold text-emerald-600">${c.total_suara}</td>
                                </tr>
                            `;
                });
                tRinciBody.innerHTML = htmlRinci;
            }
        }
        const tPemenangBody = document.getElementById('tabel-pemenang-body');
        if (tPemenangBody) {
            if (candidates.length === 0) {
                tPemenangBody.innerHTML = '<tr><td colspan="5" class="py-10 text-gray-500 text-center">Belum ada data...</td></tr>';
            } else {
                let maxVotes = {};
                candidates.forEach(c => {
                    if (maxVotes[c.posisi] === undefined || c.total_suara > maxVotes[c.posisi]) {
                        maxVotes[c.posisi] = c.total_suara;
                    }
                });

                let winners = {};
                candidates.forEach(c => {
                    if (c.total_suara === maxVotes[c.posisi]) {
                        if (!winners[c.posisi]) winners[c.posisi] = [];
                        winners[c.posisi].push(c);
                    }
                });

                let htmlPemenang = '';
                const orderMap = { "Ketua Umum OSIS": 1, "Ketua 2 OSIS": 2, "Ketua Umum DPK": 3, "Ketua 2 DPK": 4 };
                Object.keys(winners).sort((a, b) => {
                    const wa = orderMap[a] || 99;
                    const wb = orderMap[b] || 99;
                    if (wa !== wb) return wa - wb;
                    return a.localeCompare(b);
                }).forEach(pos => {
                    const wArr = winners[pos];
                    const total = maxVotes[pos];

                    let names = "";
                    let kelasStr = "";
                    let noUrutStr = "";

                    if (total === 0) {
                        names = "<span class='text-gray-400 font-normal italic'>Belum ada suara</span>";
                        kelasStr = "-";
                        noUrutStr = "-";
                    } else {
                        names = wArr.map(w => w.nama).join(" <span class='text-gray-400 font-normal mx-1'>&</span> ");
                        kelasStr = wArr.map(w => w.kelas).join(" / ");
                        noUrutStr = wArr.map(w => w.nomor_urut).join(" / ");
                    }

                    htmlPemenang += `
                                <tr class="border-b border-gray-100 hover:bg-amber-50 transition-colors">
                                    <td class="py-3 px-3 border-x border-gray-100 font-bold text-slate-700 text-center">${noUrutStr}</td>
                                    <td class="py-3 px-3 border-x border-gray-100 font-bold text-slate-700 text-left">${pos}</td>
                                    <td class="py-3 px-3 border-x border-gray-100 font-bold text-amber-600 text-left">
                                        ${total > 0 ? '<i class="fas fa-medal mr-1"></i>' : ''} ${names}
                                    </td>
                                    <td class="py-3 px-3 border-x border-gray-100 text-center">${kelasStr}</td>
                                    <td class="py-3 px-3 border-x border-gray-100 text-center font-bold text-emerald-600">${total} Suara</td>
                                </tr>
                            `;
                });
                tPemenangBody.innerHTML = htmlPemenang;
            }
        }
    } catch (err) {
        console.error("Error updating dashboard:", err);
        showAlert("Gagal memuat data dashboard: " + err.message, false);
    } finally {
        if (btnRefresh) {
            btnRefresh.innerHTML = '<i class="fas fa-sync-alt"></i> <span class="hidden sm:inline">Refresh</span>';
            btnRefresh.disabled = false;
        }
    }
}
async function loadCandidateData(forceRefresh = false) {
    if (firestoreCandidateListener) {
        firestoreCandidateListener();
        firestoreCandidateListener = null;
    }
    const tbody = document.getElementById('candidateTableBody');

    if (!forceRefresh) {
        let localData = AppStorage.get('candidates_data');
        if (localData) {
            try {
                allCandidateRecords = JSON.parse(localData);
                renderCandidateTable();
                return;
            } catch (e) {
                console.error("Local data invalid, fetching from DB");
            }
        }
    }

    if (tbody) {
        tbody.innerHTML = `
                    <tr>
                        <td colspan="9" class="py-10 text-gray-400 text-center">
                            <i class="fas fa-spinner animate-spin text-2xl mb-2 block"></i>
                            Memuat data kandidat...
                        </td>
                    </tr>
                `;
    }
    try {
        const { data: rows, error } = await db.from('kandidat').select('*');
        if (error) throw error;
        allCandidateRecords = (rows || []);
        allCandidateRecords.sort((a, b) => {
            const kelasA = a.kelas || "";
            const kelasB = b.kelas || "";
            if (kelasA !== kelasB) {
                return kelasA.localeCompare(kelasB, undefined, { numeric: true, sensitivity: 'base' });
            }
            const posA = a.posisi || "";
            const posB = b.posisi || "";
            if (posA !== posB) {
                const orderMap = { "Ketua Umum OSIS": 1, "Ketua 2 OSIS": 2, "Ketua Umum DPK": 3, "Ketua 2 DPK": 4 };
                const wa = orderMap[posA] || 99;
                const wb = orderMap[posB] || 99;
                if (wa !== wb) return wa - wb;
                return posA.localeCompare(posB);
            }
            const numA = parseInt(a.nomor_urut) || 0;
            const numB = parseInt(b.nomor_urut) || 0;
            return numA - numB;
        });
        AppStorage.set('candidates_data', JSON.stringify(allCandidateRecords));
        renderCandidateTable();
    } catch (error) {
        console.error("Error loading candidate data:", error);
        if (tbody) {
            tbody.innerHTML = `
                        <tr>
                            <td colspan="9" class="py-10 text-red-500 font-bold text-center">
                                <i class="fas fa-exclamation-triangle text-2xl mb-2 block"></i>
                                Gagal memuat data kandidat. Periksa koneksi/izin Supabase.
                            </td>
                        </tr>
                    `;
        }
    }
}
async function renderCandidateTable() {
    const tbody = document.getElementById('candidateTableBody');
    if (!tbody) return;
    if (allCandidateRecords.length === 0) {
        tbody.innerHTML = `
                    <tr>
                        <td colspan="9" class="py-10 text-gray-500 text-center">
                            Belum ada data kandidat yang ditambahkan.
                        </td>
                    </tr>
                `;
        return;
    }
    let html = '';
    for (let i = 0; i < allCandidateRecords.length; i++) {
        const record = allCandidateRecords[i];
        let fotoHtml = '<i class="text-gray-400 text-xs">(Belum ada foto)</i>';
        if (record.foto) {
            const resolvedFoto = await resolveImage(record.foto);
            if (resolvedFoto) {
                fotoHtml = `<img src="${resolvedFoto}" alt="${record.nama}" class="w-full max-w-[120px] h-auto object-cover rounded-lg mx-auto shadow-sm">`;
            }
        }

        let formattedMisi = '<i>(Belum diisi)</i>';
        if (record.misi) {
            const lines = record.misi.split('\n').map(line => line.trim()).filter(line => line.length > 0);
            const listItems = lines.map(line => {
                // Hilangkan angka/bullet manual di awal kalimat agar tidak dobel dengan <ol>
                const cleanLine = line.replace(/^(\d+[\.\)]\s*|[\-\â€¢]\s*)/, '');
                return `<li class="mb-1">${cleanLine}</li>`;
            }).join('');
            formattedMisi = `<ol class="list-decimal pl-4 m-0">${listItems}</ol>`;
        }

        const visiHtml = `<div class="text-left leading-relaxed whitespace-pre-wrap break-words">${record.visi ? record.visi : '<i>(Belum diisi)</i>'}</div>`;
        const misiHtml = `<div class="text-left leading-relaxed break-words">${formattedMisi}</div>`;
        html += `
                    <tr class="hover:bg-slate-50 border-b border-gray-100 transition-colors">
                        <td class="py-3 px-3 border border-gray-150 text-center font-semibold text-gray-600 whitespace-nowrap">${i + 1}</td>
                        <td class="py-3 px-3 border border-gray-150 text-center font-bold text-gray-700 whitespace-nowrap">${record.nomor_urut}</td>
                        <td class="py-3 px-3 border border-gray-150 text-left font-medium text-gray-800 whitespace-nowrap">${record.posisi}</td>
                        <td class="py-3 px-3 border border-gray-150 text-left font-semibold text-sky-700 whitespace-nowrap">${record.nama}</td>
                        <td class="py-3 px-3 border border-gray-150 text-center whitespace-nowrap">${record.kelas}</td>
                        <td class="py-3 px-3 border border-gray-150 text-left align-top min-w-[200px]">${visiHtml}</td>
                        <td class="py-3 px-3 border border-gray-150 text-left align-top min-w-[200px]">${misiHtml}</td>
                        <td class="py-3 px-3 border border-gray-150 text-center whitespace-nowrap">${fotoHtml}</td>
                        <td class="py-3 px-3 border border-gray-150 text-center whitespace-nowrap">
                            <button onclick="openCandidateModal('edit', '${record.id}')" class="text-sky-600 hover:text-sky-800 font-semibold mr-3 transition-colors">Edit</button>
                            <button onclick="deleteCandidate('${record.id}', '${record.nama}')" class="text-rose-500 hover:text-rose-700 font-semibold transition-colors">Hapus</button>
                        </td>
                    </tr>
                `;
    }
    tbody.innerHTML = html;
}
function openCandidateModal(action = 'add', id = '') {
    const modal = document.getElementById('candidateModal');
    const titleEl = document.getElementById('candidateModalTitle');
    const form = document.getElementById('candidateForm');
    const idInput = document.getElementById('candidateIdInput');
    const noUrutInput = document.getElementById('candidateNoUrutInput');
    const nameInput = document.getElementById('candidateNameInput');
    const kelasInput = document.getElementById('candidateKelasInput');
    const posisiInput = document.getElementById('candidatePosisiInput');
    const visiInput = document.getElementById('candidateVisiInput');
    const misiInput = document.getElementById('candidateMisiInput');
    const photoPreview = document.getElementById('candidatePhotoPreview');
    const activePhotoText = document.getElementById('activeCandidatePhotoText');
    const statusEl = document.getElementById('candidatePhotoUploadStatus');
    if (!modal || !form) return;
    form.reset();
    window.tempCandidatePhoto = null;
    document.getElementById('candidatePhotoFileInput').value = '';
    if (photoPreview) photoPreview.src = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
    if (statusEl) {
        statusEl.textContent = "Klik untuk mengunggah foto baru...";
        statusEl.className = "font-medium text-slate-300";
    }
    document.getElementById('candidateActionType').value = action;
    if (action === 'add') {
        titleEl.textContent = "Tambah Kandidat Baru";
        idInput.value = "";
        if (visiInput) visiInput.value = "";
        if (misiInput) misiInput.value = "";
        if (activePhotoText) activePhotoText.textContent = "ID_Default";
    } else {
        titleEl.textContent = "Edit Data Kandidat";
        idInput.value = id;
        const record = allCandidateRecords.find(c => c.id === id);
        if (record) {
            noUrutInput.value = record.nomor_urut || "";
            nameInput.value = record.nama || "";
            kelasInput.value = record.kelas || "";
            posisiInput.value = record.posisi || "";
            if (visiInput) visiInput.value = record.visi || "";
            if (misiInput) misiInput.value = record.misi || "";
            if (activePhotoText) activePhotoText.textContent = record.foto || "ID_Default";
            if (record.foto) {
                resolveImage(record.foto).then(resolved => {
                    if (resolved && photoPreview) photoPreview.src = resolved;
                });
            }
        }
    }
    modal.classList.add('active');
}
function closeCandidateModal() {
    const modal = document.getElementById('candidateModal');
    if (modal) modal.classList.remove('active');
}
function processCandidatePhoto(event) {
    const file = event.target.files[0];
    if (!file) return;
    const statusEl = document.getElementById('candidatePhotoUploadStatus');
    if (statusEl) {
        statusEl.textContent = "Sedang memproses foto...";
        statusEl.className = "font-semibold text-yellow-500";
    }
    const photoPreview = document.getElementById('candidatePhotoPreview');
    const activePhotoText = document.getElementById('activeCandidatePhotoText');
    // Gunakan dimensi tetap yang ideal untuk foto kandidat agar tidak tergantung lebar layar perangkat admin
    const maxDim = 1000;
    compressImageToLimit(file, maxDim, 100, function (base64Data, shortId, sizeInKb) {
        const uniqueName = `kandidat_${shortId}.jpg`;
        window.tempCandidatePhoto = { id: uniqueName, data: base64Data };
        if (photoPreview) photoPreview.src = base64Data;
        if (activePhotoText) activePhotoText.textContent = uniqueName;
        if (statusEl) {
            statusEl.textContent = `Foto siap: ${uniqueName} (${sizeInKb} KB). Klik Simpan!`;
            statusEl.className = "font-bold text-emerald-500";
        }
        showAlert(`Foto kandidat berhasil diolah & dikompres (${sizeInKb} KB)!`, true);
    });
}
async function saveCandidate(e) {
    e.preventDefault();
    const action = document.getElementById('candidateActionType').value;
    const id = document.getElementById('candidateIdInput').value;
    const noUrut = document.getElementById('candidateNoUrutInput').value.trim();
    const name = document.getElementById('candidateNameInput').value.trim();
    const kelas = document.getElementById('candidateKelasInput').value.trim();
    const posisi = document.getElementById('candidatePosisiInput').value;
    const visi = document.getElementById('candidateVisiInput') ? document.getElementById('candidateVisiInput').value.trim() : '';
    const misi = document.getElementById('candidateMisiInput') ? document.getElementById('candidateMisiInput').value.trim() : '';
    if (!noUrut || !name || !kelas) return;
    try {
        let photoId = "";
        let oldPhotoId = "";
        if (action === 'edit') {
            const record = allCandidateRecords.find(c => c.id === id);
            if (record && record.foto) {
                photoId = record.foto;
                oldPhotoId = record.foto;
            }
        }
        if (window.tempCandidatePhoto) {
            if (action === 'edit' && oldPhotoId && oldPhotoId !== window.tempCandidatePhoto.id) {
                try {
                    await db.from('images').delete().eq('id', oldPhotoId);
                    delete AppStorage.memoryData['img_' + oldPhotoId];
                    try { localStorage.removeItem('img_' + oldPhotoId); } catch (e) { }
                } catch (e) {
                    console.warn("Gagal menghapus foto lama:", e);
                }
            }
            photoId = window.tempCandidatePhoto.id;
            AppStorage.set('img_' + photoId, window.tempCandidatePhoto.data);
            await db.from('images').upsert({
                id: photoId,
                data: window.tempCandidatePhoto.data,
                updated_at: new Date().toISOString()
            });
        }
        // Generate ID for new candidates
        const docId = action === 'add'
            ? (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2))
            : id;
        const saveData = {
            id: docId,
            nomor_urut: parseInt(noUrut) || 1,
            nama: name,
            kelas: kelas,
            posisi: posisi,
            visi: visi,
            misi: misi,
            foto: photoId,
            updated_at: new Date().toISOString()
        };
        const { error: saveError } = await db.from('kandidat').upsert(saveData);
        if (saveError) throw saveError;
        showAlert("Data kandidat berhasil disimpan!", true);
        const statusEl = document.getElementById('candidatePhotoUploadStatus');
        if (statusEl) {
            statusEl.textContent = "Klik untuk mengunggah foto baru...";
            statusEl.className = "font-medium text-slate-300";
        }
        window.tempCandidatePhoto = null;
        closeCandidateModal();
    } catch (err) {
        console.error("Error saving candidate:", err);
        showAlert(`Gagal menyimpan kandidat: ${err.message}`, false);
    }
}
function deleteCandidate(id, name) {
    showModal(
        "Hapus Kandidat",
        `Apakah Anda yakin ingin menghapus kandidat <strong>${name}</strong>?`,
        true,
        "Hapus",
        async () => {
            try {
                // First get the candidate data to know if it has a photo
                const { data: candData } = await db.from('kandidat').select('foto').eq('id', id).single();
                if (candData && candData.foto) {
                    await db.from('images').delete().eq('id', candData.foto);
                }
                const { error } = await db.from('kandidat').delete().eq('id', id);
                if (error) throw error;
                showAlert(`Kandidat ${name} berhasil dihapus!`, true);
                AppStorage.set('candidates_data', null);
                loadCandidateData(true);
            } catch (err) {
                console.error("Error deleting candidate:", err);
                showAlert(`Gagal menghapus kandidat: ${err.message}`, false);
            }
        }
    );
}

function deleteAllCandidates() {
    showModal(
        "Hapus Semua Kandidat",
        `Apakah Anda yakin ingin menghapus <strong>semua kandidat beserta fotonya</strong>? Tindakan ini tidak dapat dibatalkan!`,
        true,
        "Hapus Semua",
        async () => {
            try {
                const { data: allCands } = await db.from('kandidat').select('id, foto');
                if (!allCands || allCands.length === 0) {
                    showAlert('Tidak ada data kandidat untuk dihapus.', false);
                    return;
                }
                // Delete all photos
                const photoIds = allCands.map(c => c.foto).filter(Boolean);
                if (photoIds.length > 0) {
                    await db.from('images').delete().in('id', photoIds);
                }
                // Delete all candidates menggunakan daftar ID yang valid
                const candIds = allCands.map(c => c.id);
                const { error } = await db.from('kandidat').delete().in('id', candIds);
                if (error) throw error;
                showAlert(`${allCands.length} kandidat dan foto terkait berhasil dihapus!`, true);
                AppStorage.set('candidates_data', null);
                loadCandidateData(true);
            } catch (err) {
                console.error("Error deleting all candidates:", err);
                showAlert(`Gagal menghapus semua kandidat: ${err.message}`, false);
            }
        }
    );
}

function exportPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Laporan Hasil Pemilihan SMAN 2 Kuningan", 14, 22);
    doc.setFontSize(14);
    doc.text("Data Partisipasi", 14, 35);
    doc.autoTable({
        html: '#tabel-partisipasi',
        startY: 40,
        theme: 'grid',
        styles: {
            overflow: 'linebreak',
            cellPadding: 2,
            fontSize: 9,
            halign: 'center'
        },
        headStyles: {
            fillColor: [44, 62, 80]
        },
        didParseCell: function (data) {
            if (data.row.section === 'body' && data.row.index === data.table.body.length - 1) {
                data.cell.styles.fillColor = [52, 152, 219];
                data.cell.styles.textColor = [255, 255, 255];
                if (data.column.index === 0) {
                    data.cell.styles.fillColor = [41, 128, 185];
                }
            }
        }
    });
    let finalY_1 = doc.autoTable.previous.finalY;
    doc.setFontSize(14);
    doc.text("Kandidat Terpilih", 14, finalY_1 + 15);
    doc.autoTable({
        html: '#tabel-pemenang',
        startY: finalY_1 + 20,
        theme: 'grid',
        styles: {
            overflow: 'linebreak',
            cellPadding: 2,
            fontSize: 9,
            halign: 'center'
        },
        columnStyles: {
            1: { halign: 'left' },
            2: { halign: 'left' }
        },
        headStyles: {
            fillColor: [44, 62, 80]
        }
    });
    let finalY_2 = doc.autoTable.previous.finalY;
    doc.setFontSize(14);
    doc.text("Hasil Pemilihan", 14, finalY_2 + 15);
    doc.autoTable({
        html: '#tabel-rinci',
        startY: finalY_2 + 20,
        theme: 'grid',
        styles: {
            overflow: 'linebreak',
            cellPadding: 2,
            fontSize: 9,
            halign: 'center'
        },
        columnStyles: {
            1: { halign: 'left' },
            2: { halign: 'left' }
        },
        headStyles: {
            fillColor: [44, 62, 80]
        }
    });
    doc.save('Laporan-Hasil-Pemilihan-SMANDA.pdf');
    showAlert("Berhasil mengunduh dokumen PDF Laporan Pemilihan!", true);
}
async function resetAllVoterStatus() {
    showModal(
        "Reset Hasil Voting",
        "Apakah Anda yakin ingin menghapus semua hasil voting? Status semua pemilih (siswa, guru, staf) akan di-reset menjadi <strong>Belum Memilih</strong> dan perolehan suara semua kandidat akan dikembalikan ke <strong>0</strong>.",
        true,
        "Reset",
        async () => {
            try {
                showAlert("Sedang mereset status voting...", true);

                // 1. Reset status sudah_memilih semua pemilih
                const collections = ['siswa', 'guru', 'staf'];
                let resetCount = 0;
                for (const colName of collections) {
                    const { data: rows, error } = await db.from('pemilih_' + colName)
                        .update({ sudah_memilih: 0, updated_at: new Date().toISOString() })
                        .neq('sudah_memilih', 0)
                        .select('id');
                    if (!error && rows) resetCount += rows.length;
                }

                // 2. Reset suara_siswa, suara_guru, suara_staf semua kandidat ke 0
                const { data: allCands } = await db.from('kandidat').select('id');
                if (allCands && allCands.length > 0) {
                    const candIds = allCands.map(c => c.id);
                    await db.from('kandidat').update({
                        suara_siswa: 0,
                        suara_guru: 0,
                        suara_staf: 0,
                        updated_at: new Date().toISOString()
                    }).in('id', candIds);
                }

                // 3. Bersihkan cache AppStorage agar tampilan tidak stale
                ['siswa', 'guru', 'staf'].forEach(t => {
                    AppStorage.set('voters_' + t, null);
                    try { localStorage.removeItem('voters_' + t); } catch (e) { }
                });
                AppStorage.set('candidates_data', null);
                try { localStorage.removeItem('candidates_data'); } catch (e) { }

                showAlert(`Berhasil mereset ${resetCount} pemilih dan seluruh perolehan suara kandidat!`, true);
            } catch (err) {
                console.error("Error resetting voting status:", err);
                showAlert(`Gagal mereset status voting: ${err.message}`, false);
            }
        }
    );
}
async function clearAllVoterData() {
    showModal(
        "Kosongkan Database",
        "Apakah Anda yakin ingin menghapus seluruh data pemilih (siswa, guru, staf) dan semua berkas gambar dari database? Perolehan suara semua kandidat juga akan dikembalikan ke <strong>0</strong>. Tindakan ini tidak dapat dibatalkan.",
        true,
        "Kosongkan",
        async () => {
            try {
                showAlert("Sedang mengosongkan database...", true);

                // 1. Hapus semua data pemilih & gambar
                const tables = ['siswa', 'guru', 'staf'];
                let deleteCount = 0;
                for (const tbl of tables) {
                    const { data: del, error } = await db.from('pemilih_' + tbl).delete().neq('id', '').select('id');
                    if (!error && del) deleteCount += del.length;
                }
                // Hapus semua gambar
                await db.from('images').delete().neq('id', '');

                // 2. Reset suara_siswa, suara_guru, suara_staf semua kandidat ke 0
                await db.from('kandidat').update({
                    suara_siswa: 0,
                    suara_guru: 0,
                    suara_staf: 0,
                    updated_at: new Date().toISOString()
                }).neq('id', '');

                // 3. Bersihkan semua cache AppStorage
                AppStorage.set('ep_sh_logo', '');
                AppStorage.set('ep_login_bg', '');
                ['siswa', 'guru', 'staf'].forEach(t => {
                    AppStorage.set('voters_' + t, null);
                    try { localStorage.removeItem('voters_' + t); } catch (e) { }
                });
                AppStorage.set('candidates_data', null);
                try { localStorage.removeItem('candidates_data'); } catch (e) { }
                Object.keys(AppStorage.memoryData).forEach(key => {
                    if (key.startsWith('img_') || key.startsWith('voters_') || key === 'candidates_data')
                        delete AppStorage.memoryData[key];
                });

                showAlert(`Berhasil menghapus ${deleteCount} pemilih dan mereset seluruh perolehan suara kandidat!`, true);
                if (typeof loadVoterData === 'function') {
                    loadVoterData(true);
                }
            } catch (err) {
                console.error("Error clearing database:", err);
                showAlert(`Gagal mengosongkan database: ${err.message}`, false);
            }
        }
    );
}
function formatWaktu(datetimeStr) {
    if (!datetimeStr) return '';
    const d = new Date(datetimeStr);
    return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
async function toggleJadwalManual(isActive) {
    try {
        if (isActive) {
            await db.from('pengaturan').upsert({
                id: 'jadwal_pemilihan',
                mode: 'manual',
                active: true,
                updated_at: new Date().toISOString()
            });
        } else {
            await db.from('pengaturan').delete().eq('id', 'jadwal_pemilihan');
        }
    } catch (err) {
        console.error(err);
        showAlert('Gagal mengubah jadwal manual', false);
    }
}
async function simpanJadwalOtomatis() {
    const mulai = document.getElementById('jadwalMulai').value;
    const selesai = document.getElementById('jadwalSelesai').value;
    if (!mulai || !selesai) {
        showAlert('Silakan isi waktu mulai dan selesai!', false);
        return;
    }
    try {
        const now = new Date();
        const start = new Date(mulai);
        const end = new Date(selesai);
        const isActive = now >= start && now <= end;

        await db.from('pengaturan').upsert({
            id: 'jadwal_pemilihan',
            mode: 'auto',
            active: isActive,
            mulai: mulai,
            selesai: selesai,
            updated_at: new Date().toISOString()
        });
        showAlert('Jadwal otomatis berhasil disimpan dan diaktifkan!', true);
        loadJadwalPengaturan();
    } catch (err) {
        console.error(err);
        showAlert('Gagal menyimpan jadwal otomatis', false);
    }
}
function loadJadwalPengaturan() {
    // Polling-based fetch (Supabase tidak punya onSnapshot; gunakan polling 10 detik)
    const fetchJadwal = async () => {
        try {
            const { data, error } = await db.from('pengaturan').select('*').eq('id', 'jadwal_pemilihan').single();
            const infoDiv = document.getElementById('infoJadwalAktif');
            const manualToggle = document.getElementById('manualToggleStatus');
            const manualLabel = document.getElementById('manualToggleLabel');
            if (!error && data) {
                if (data.mode === 'manual') {
                    if (manualToggle) {
                        manualToggle.checked = true;
                        manualLabel.textContent = 'BUKA';
                        manualLabel.className = 'ml-3 text-xs font-bold text-emerald-600';
                    }
                    if (infoDiv) infoDiv.innerHTML = '<i class="fas fa-exclamation-circle text-emerald-600 text-base sm:text-lg flex-shrink-0 mt-0.5 sm:mt-0"></i> <span class="leading-snug text-left text-emerald-700">Status: <b>Manual Aktif</b> (Akses Pemilihan Terbuka)</span>';
                } else if (data.mode === 'auto') {
                    if (manualToggle) {
                        manualToggle.checked = false;
                        manualLabel.textContent = 'TUTUP';
                        manualLabel.className = 'ml-3 text-xs font-bold text-rose-600';
                    }
                    const now = new Date();
                    const end = new Date(data.selesai);
                    const start = new Date(data.mulai);
                    document.getElementById('jadwalMulai').value = data.mulai;
                    document.getElementById('jadwalSelesai').value = data.selesai;
                    if (now > end) {
                        await db.from('pengaturan').delete().eq('id', 'jadwal_pemilihan');
                    } else if (now >= start && now <= end) {
                        // Update active status ke true jika sedang dalam rentang waktu
                        if (!data.active) {
                            await db.from('pengaturan').update({ active: true }).eq('id', 'jadwal_pemilihan');
                        }
                        if (infoDiv) infoDiv.innerHTML = `<i class="fas fa-clock text-emerald-600 text-base sm:text-lg flex-shrink-0 mt-0.5 sm:mt-0"></i> <span class="leading-snug text-left text-emerald-700">Status: <b>Sedang Aktif Otomatis</b> hingga ${formatWaktu(data.selesai)}</span>`;
                    } else if (now < start) {
                        // Update active status ke false jika belum memasuki rentang waktu
                        if (data.active) {
                            await db.from('pengaturan').update({ active: false }).eq('id', 'jadwal_pemilihan');
                        }
                        if (infoDiv) infoDiv.innerHTML = `<i class="fas fa-calendar-check text-sky-600 text-base sm:text-lg flex-shrink-0 mt-0.5 sm:mt-0"></i> <span class="leading-snug text-left text-sky-700">Status: <b>Akan Aktif Otomatis</b> pada ${formatWaktu(data.mulai)}</span>`;
                    }
                }
            } else {
                if (manualToggle) {
                    manualToggle.checked = false;
                    manualLabel.textContent = 'TUTUP';
                    manualLabel.className = 'ml-3 text-xs font-bold text-rose-600';
                }
                document.getElementById('jadwalMulai').value = '';
                document.getElementById('jadwalSelesai').value = '';
                if (infoDiv) infoDiv.innerHTML = '<i class="fas fa-info-circle text-slate-500 text-base sm:text-lg flex-shrink-0 mt-0.5 sm:mt-0"></i> <span class="leading-snug text-left">Status: <b class="text-slate-600">Tidak ada jadwal aktif (Akses Ditutup)</b></span>';
            }
        } catch (err) {
            console.error(err);
        }
    };
    fetchJadwal();
    // Poll every 15 seconds
    if (jadwalChannel) clearInterval(jadwalChannel);
    jadwalChannel = setInterval(fetchJadwal, 15000);
}

// ==========================================
// FITUR MONITORING KAPASITAS DATABASE
// ==========================================
async function calculateDatabaseCapacity() {
    try {
        // Hitung jumlah baris dari berbagai tabel
        const [siswaRes, guruRes, stafRes, kandidatRes, imagesRes, pengaturanRes] = await Promise.all([
            db.from('pemilih_siswa').select('id', { count: 'exact', head: true }),
            db.from('pemilih_guru').select('id', { count: 'exact', head: true }),
            db.from('pemilih_staf').select('id', { count: 'exact', head: true }),
            db.from('kandidat').select('id', { count: 'exact', head: true }),
            db.from('images').select('id', { count: 'exact', head: true }),
            db.from('pengaturan').select('id', { count: 'exact', head: true })
        ]);

        const totalVoters = (siswaRes.count || 0) + (guruRes.count || 0) + (stafRes.count || 0);
        const totalRows = totalVoters + (kandidatRes.count || 0) +
            (pengaturanRes.count || 0) + (imagesRes.count || 0);
        const totalImages = imagesRes.count || 0;

        // Estimasi ukuran storage (rata-rata 50KB per record + 200KB per image)
        const estimatedSize = ((totalRows - totalImages) * 0.05) + (totalImages * 0.2); // dalam MB

        // Update UI
        const utilisationPercent = Math.min(100, ((estimatedSize / 500) * 100)).toFixed(1);
        document.getElementById('dbTotalRows').textContent = utilisationPercent + '%';
        document.getElementById('dbTotalImages').textContent = totalImages.toLocaleString('id-ID');
        document.getElementById('dbStorageSize').textContent = (siswaRes.count || 0).toLocaleString('id-ID') + ' orang';

        // Status berdasarkan utilisasi
        const statusEl = document.getElementById('dbStatus');
        const utilisationNum = parseFloat(utilisationPercent);

        if (utilisationNum < 50) {
            statusEl.textContent = '✓ Normal';
            statusEl.className = 'text-xs font-bold text-emerald-600 bg-emerald-100 px-2 py-1 rounded';
        } else if (utilisationNum < 80) {
            statusEl.textContent = '⚠ Waspada';
            statusEl.className = 'text-xs font-bold text-amber-600 bg-amber-100 px-2 py-1 rounded';
        } else {
            statusEl.textContent = '❌ Penuh';
            statusEl.className = 'text-xs font-bold text-red-600 bg-red-100 px-2 py-1 rounded';
        }

        AppStorage.set('db_capacity_last_update', new Date().toISOString());
    } catch (err) {
        console.error('Error calculating database capacity:', err);
        document.getElementById('dbStatus').textContent = '✗ Error';
        document.getElementById('dbStatus').className = 'text-xs font-bold text-red-600 bg-red-100 px-2 py-1 rounded';
    }
}

function refreshDatabaseCapacity() {
    const statusEl = document.getElementById('dbStatus');
    statusEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memuat...';
    calculateDatabaseCapacity();
}

// Load jadwal saat halaman admin dibuka
document.addEventListener('DOMContentLoaded', () => {
    loadJadwalPengaturan();
    // Load database capacity info
    calculateDatabaseCapacity();
    // Refresh database capacity setiap 60 detik
    setInterval(calculateDatabaseCapacity, 60000);
});

// ==========================================
// FITUR EXPORT / IMPORT KANDIDAT MENGGUNAKAN FILE WORD (.docx)
// ==========================================
function downloadWordTemplateKandidat() {
    const htmlContent = `
                <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
                <head><meta charset='utf-8'><title>Template Kandidat</title>
                <style>
                    table { border-collapse: collapse; width: 100%; }
                    th, td { border: 1px solid black; padding: 5px; text-align: left; vertical-align: top; }
                    th { background-color: #f2f2f2; }
                </style>
                </head>
                <body>
                    <h2>Template Import Data Kandidat</h2>
                    <p style="color:red;"><b>PENTING:</b><br>1. Isi data pada tabel di bawah ini.<br>2. Jangan mengubah baris judul (header) tabel.<br>3. Untuk menyisipkan foto, gunakan menu Insert -> Pictures ke dalam sel kolom Foto.<br>4. <b>SETELAH SELESAI, ANDA WAJIB MENYIMPAN FILE INI DENGAN FORMAT ".docx" (Pilih File -> Save As -> Word Document (*.docx)) AGAR BISA DIIMPORT!</b></p>
                    <table>
                        <tr>
                            <th>No. Urut</th>
                            <th>Posisi / Jabatan</th>
                            <th>Nama Kandidat</th>
                            <th>Kelas</th>
                            <th>Visi</th>
                            <th>Misi</th>
                            <th>Foto (Insert Gambar)</th>
                        </tr>
                        <tr>
                            <td>1</td>
                            <td>Ketua Umum OSIS</td>
                            <td>Nama Calon Ketua OSIS</td>
                            <td>XI IPA 1</td>
                            <td>Mewujudkan siswa berprestasi...</td>
                            <td>1. Meningkatkan ibadah...<br>2. Mengadakan lomba...</td>
                            <td>(Hapus teks ini, lalu Insert gambar di sini)</td>
                        </tr>
                        <tr>
                            <td>1</td>
                            <td>Ketua Umum DPK</td>
                            <td>Nama Calon Ketua DPK</td>
                            <td>XI IPS 2</td>
                            <td>Visi DPK...</td>
                            <td>Misi DPK...</td>
                            <td>(Hapus teks ini, lalu Insert gambar di sini)</td>
                        </tr>
                    </table>
                </body>
                </html>
            `;
    const blob = new Blob(['\ufeff', htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Template_Import_Kandidat.doc';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showModal("Informasi Penting", "Template Word berhasil diunduh. <br><br><b>PENTING:</b> Buka file tersebut dengan MS Word. Setelah Anda mengisi tabel dan menyisipkan foto, Anda <b>WAJIB</b> menyimpannya sebagai tipe <b>Word Document (*.docx)</b> sebelum melakukan Import.", false, "Saya Mengerti", null);
}

async function handleWordKandidatImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.name.toLowerCase().endsWith('.doc')) {
        showAlert("GAGAL: File masih berformat .doc lama. Silakan buka file tersebut di Word lalu pilih 'Save As' menjadi 'Word Document (*.docx)'.", false);
        event.target.value = '';
        return;
    }

    showAlert("Menganalisis file Word (.docx) dan mengekstrak gambar...", true);
    const reader = new FileReader();

    reader.onload = async function (e) {
        try {
            const zip = await JSZip.loadAsync(e.target.result);

            let relsXml = "";
            if (zip.file("word/_rels/document.xml.rels")) {
                relsXml = await zip.file("word/_rels/document.xml.rels").async("string");
            }
            const parser = new DOMParser();
            const relsDoc = parser.parseFromString(relsXml, "application/xml");
            const relMap = {};
            relsDoc.querySelectorAll("Relationship").forEach(rel => {
                relMap[rel.getAttribute("Id")] = rel.getAttribute("Target");
            });

            const docXml = await zip.file("word/document.xml").async("string");
            const xmlDoc = parser.parseFromString(docXml, "application/xml");

            const tables = xmlDoc.querySelectorAll("w\\:tbl, tbl");
            if (tables.length === 0) {
                showAlert("Tidak ada tabel data ditemukan di dalam file Word!", false);
                return;
            }

            const table = tables[0];
            const rows = table.querySelectorAll("w\\:tr, tr");
            const parsedCandidates = [];

            for (let i = 1; i < rows.length; i++) {
                const cells = rows[i].querySelectorAll("w\\:tc, tc");
                if (cells.length < 6) continue;

                const getText = (cell) => {
                    let text = "";
                    cell.querySelectorAll("w\\:p, p").forEach(p => {
                        let pText = "";
                        p.querySelectorAll("w\\:t, t").forEach(t => pText += t.textContent);
                        if (pText) text += pText.trim() + "\n";
                    });
                    return text.trim();
                };

                const noUrut = getText(cells[0]);
                const posisi = getText(cells[1]);
                const nama = getText(cells[2]);
                const kelas = getText(cells[3]);
                const visi = getText(cells[4]);
                const misi = getText(cells[5]);

                let base64Image = null;
                if (cells[6]) {
                    const blips = cells[6].querySelectorAll("a\\:blip, blip");
                    if (blips.length > 0) {
                        const embedId = blips[0].getAttribute("r:embed") || blips[0].getAttribute("embed");
                        if (embedId && relMap[embedId]) {
                            let targetPath = relMap[embedId];
                            if (targetPath.startsWith('/word/')) targetPath = targetPath.substring(6);
                            else if (!targetPath.startsWith('word/') && !targetPath.startsWith('media/')) targetPath = "media/" + targetPath;

                            const imgPath = targetPath.startsWith('media/') ? "word/" + targetPath : targetPath;

                            if (zip.file(imgPath)) {
                                const imgData = await zip.file(imgPath).async("base64");
                                const ext = imgPath.split('.').pop().toLowerCase();
                                const mime = (ext === 'png') ? 'image/png' : 'image/jpeg';
                                base64Image = `data:${mime};base64,${imgData}`;
                            }
                        }
                    }
                }

                if (nama && posisi && posisi.toLowerCase() !== "posisi / jabatan") {
                    parsedCandidates.push({
                        nomor_urut: parseInt(noUrut) || 1,
                        posisi: posisi,
                        nama: nama,
                        kelas: kelas,
                        visi: visi,
                        misi: misi,
                        tempImageData: base64Image
                    });
                }
            }

            if (parsedCandidates.length === 0) {
                showAlert("Tabel kosong atau struktur data kandidat tidak valid!", false);
                return;
            }

            showAlert(`Menyimpan ${parsedCandidates.length} kandidat beserta fotonya ke database...`, true);

            for (const cand of parsedCandidates) {
                let finalPhotoId = "";

                if (cand.tempImageData) {
                    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                    let shortId = '';
                    for (let j = 0; j < 10; j++) shortId += chars.charAt(Math.floor(Math.random() * chars.length));
                    finalPhotoId = `kandidat_${shortId}.jpg`;

                    AppStorage.set('img_' + finalPhotoId, cand.tempImageData);
                    await db.from('images').upsert({
                        id: finalPhotoId,
                        data: cand.tempImageData,
                        updated_at: new Date().toISOString()
                    });
                }

                const docId = crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).substr(2));
                const { error: insErr } = await db.from('kandidat').upsert({
                    id: docId,
                    nomor_urut: cand.nomor_urut,
                    nama: cand.nama,
                    kelas: cand.kelas,
                    posisi: cand.posisi,
                    visi: cand.visi,
                    misi: cand.misi,
                    foto: finalPhotoId,
                    updated_at: new Date().toISOString()
                });
                if (insErr) throw insErr;
            }

            showAlert(`Berhasil mengimpor ${parsedCandidates.length} kandidat dari file Word!`, true);

        } catch (err) {
            console.error("Word Import Error:", err);
            showAlert("Gagal memproses file Word. Pastikan Anda mengunggah file berekstensi .docx yang valid.", false);
        }

        event.target.value = '';
    };

    reader.readAsArrayBuffer(file);
}

function toggleProfileDropdown() {
    const dropdown = document.getElementById('profileDropdown');
    if (dropdown) {
        dropdown.classList.toggle('hidden');
    }
}

window.addEventListener('click', function (e) {
    const container = document.getElementById('headerProfileContainer');
    if (container && !container.contains(e.target)) {
        const dropdown = document.getElementById('profileDropdown');
        if (dropdown && !dropdown.classList.contains('hidden')) {
            dropdown.classList.add('hidden');
        }
    }
});

function openAdminProfileModal() {
    const modal = document.getElementById('adminProfileModal');
    if (modal) {
        const form = document.getElementById('adminProfileForm');
        if (form) form.reset();
        modal.classList.add('active');
        modal.classList.remove('hidden');
    }
}

function closeAdminProfileModal() {
    const modal = document.getElementById('adminProfileModal');
    if (modal) {
        modal.classList.remove('active');
        modal.classList.add('hidden');
    }
}

function toggleVisibility(inputId, iconId) {
    const inputEl = document.getElementById(inputId);
    const iconEl = document.getElementById(iconId);
    if (inputEl && iconEl) {
        if (inputEl.type === 'password') {
            inputEl.type = 'text';
            iconEl.classList.remove('fa-eye');
            iconEl.classList.add('fa-eye-slash');
        } else {
            inputEl.type = 'password';
            iconEl.classList.remove('fa-eye-slash');
            iconEl.classList.add('fa-eye');
        }
    }
}

async function saveAdminProfile(e) {
    e.preventDefault();
    const newUsername = document.getElementById('adminUsernameInput').value.trim();
    const newPassword = document.getElementById('adminPasswordInput').value.trim();
    const confirmPassword = document.getElementById('adminPasswordConfirmInput').value.trim();

    if (!newUsername || !newPassword) {
        showAlert("Username dan Password baru tidak boleh kosong!", false);
        return;
    }
    if (newPassword !== confirmPassword) {
        showAlert("Konfirmasi password tidak cocok!", false);
        return;
    }
    try {
        const { error } = await db.from('pengaturan').upsert({
            id: 'konfigurasi_admin',
            admin_username: newUsername,
            admin_password: newPassword,
            updated_at: new Date().toISOString()
        });
        if (error) throw error;

        showAlert("Profil admin berhasil diperbarui!", true);
        closeAdminProfileModal();

        const headerNameEl = document.getElementById('headerAdminName');
        if (headerNameEl) headerNameEl.textContent = newUsername;

    } catch (err) {
        console.error("Error updating admin profile:", err);
        showAlert(`Gagal memperbarui profil: ${err.message}`, false);
    }
}

// === INISIALISASI HALAMAN ADMIN ===
// Dijalankan setelah semua fungsi terdefinisi
(function initAdminPage() {
    try {
        const session = JSON.parse(localStorage.getItem('adminSession') || '{}');
        if (session && session.user) {
            const el = document.getElementById('headerAdminName');
            if (el) el.textContent = session.user;
        }
    } catch (e) { }
    renderConfiguredSettings();
    switchView('dashboard');
})();
