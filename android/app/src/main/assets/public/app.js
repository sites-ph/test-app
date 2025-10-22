// --- ADDED: Import Capacitor Core & Filesystem ---
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

// --- 1. FIREBASE CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyD4TAbKi7iO8ZL9QRMWz2kRLCODQiil71E",
    authDomain: "pesotrackerapp.firebaseapp.com",
    projectId: "pesotrackerapp",
    storageBucket: "pesotrackerapp.appspot.com", // Corrected
    messagingSenderId: "743783019395",
    appId: "1:743783019395:web:2ba1779d279d2ffcbb3cb6",
    measurementId: "G-XY8HKHNXMZ"
};

// --- 2. INITIALIZE FIREBASE & FIRESTORE & AUTH ---
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth(); // Initialize Firebase Auth

db.enablePersistence()
    .catch((err) => {
        if (err.code == 'failed-precondition') console.warn('Persistence failed: multiple tabs open.');
        else if (err.code == 'unimplemented') console.warn('Persistence not available.');
    });

// --- 3. GLOBAL VARIABLES ---
const transactionModal = document.getElementById('transaction-modal');
const confirmationModal = document.getElementById('confirmation-modal');
const confirmationMessageEl = document.getElementById('confirmation-message');

let onConfirmAction = null;
let allTransactionsCache = [];
let balanceListenerUnsubscribe = null;
let authListenerUnsubscribe = null; // To clean up auth listener
let isSettingUpPage = false; // Flag to prevent rapid setup calls


// --- 4. MAIN LOGIC (RUNS ON PAGE LOAD) ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("--- DOM Loaded ---"); // Clearer log start

    // --- START AUTH LISTENER ---
    handleAuthState();

});

// --- NEW: Authentication Handling (with Delay logic) ---
function handleAuthState() {
    console.log("--- Attaching Auth State Listener ---");
    const loader = document.getElementById('auth-loading');
    const signinBtn = document.getElementById('google-signin-btn');

    // Show loader only if on index page initially and not logged in
    const isIndexPageInitial = window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname.endsWith('/www/');
    if (loader && isIndexPageInitial && !auth.currentUser) {
        console.log("[Auth] On index, no user. Showing loader.");
        loader.style.display = 'block';
        if (signinBtn) signinBtn.style.display = 'none';
    } else if (loader) {
        // Ensure loader is hidden on other pages or if user is already logged in on index
        loader.style.display = 'none';
    }


    if (authListenerUnsubscribe) {
        console.log("[Auth] Cleaning up previous listener.");
        authListenerUnsubscribe(); // Clean up old listener
    }

    authListenerUnsubscribe = auth.onAuthStateChanged(user => {
        console.log(`%c[Auth] State Changed! User: ${user ? `User FOUND (UID: ${user.uid})` : 'User NOT FOUND (null)'}`, 'color: blue; font-weight: bold;');
        console.log(`[Auth] Current Page: ${window.location.pathname}`);

        // Check current page again inside the callback
        const isIndexPage = window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname.endsWith('/www/');
        const isDashboardPage = window.location.pathname.endsWith('dashboard.html');
        const isRecordsPage = window.location.pathname.endsWith('records.html');
        const isAppPage = isDashboardPage || isRecordsPage;

        if (user) {
            // User is signed in.
            if (isIndexPage) {
                console.log("[Auth] User logged in on index page -> Redirecting to dashboard...");
                window.location.replace('dashboard.html'); // Use replace
            } else if (isAppPage && !isSettingUpPage) { // Prevent re-entry if already setting up
                 isSettingUpPage = true;
                 console.log("[Auth] User confirmed on App page. DELAYING setup slightly..."); // ADDED LOG

                 // --- ADDED DELAY ---
                 setTimeout(() => {
                     console.log("[Auth] Delay finished. Proceeding to page setup..."); // ADDED LOG
                     // Re-check user status *after* delay, just in case state changed rapidly
                     if (auth.currentUser && auth.currentUser.uid === user.uid) {
                         if (isDashboardPage && typeof setupDashboardPage === 'function') {
                             console.log("Calling setupDashboardPage after delay...");
                             setupDashboardPage(user);
                         } else if (isRecordsPage && typeof setupRecordsPage === 'function') {
                             console.log("Calling setupRecordsPage after delay...");
                             setupRecordsPage(user);
                         } else {
                             console.warn("[Auth] Setup function not found after delay?");
                         }
                     } else {
                         console.error("[Auth] User state changed during delay! Forcing logout/redirect.");
                         // Directly redirect instead of calling signOutUser to avoid potential async issues here
                         window.location.replace('index.html');
                     }
                     // Reset flag after setup attempt
                     isSettingUpPage = false;
                     console.log("[Auth] Resetting setup flag after setup attempt.");

                 }, 300); // 300ms delay

            } else if (isAppPage && isSettingUpPage) {
                console.log("[Auth] State changed during setup DELAY or process. Ignoring."); // Updated log
            } else if (!isAppPage && !isIndexPage) { // Added check for unknown pages
                 // Logged in, but on an unknown page? Redirect to dashboard.
                 console.log("[Auth] User logged in on unknown page -> Redirecting to dashboard...");
                 window.location.replace('dashboard.html');
            } else {
                 console.log("[Auth] User logged in, correct page or setup running/delayed."); // Updated log
            }
        } else {
            // User is signed out.
            isSettingUpPage = false; // Reset setup flag on logout
            if (isAppPage) {
                console.log("[Auth] User logged out on app page -> Redirecting to index...");
                 if (balanceListenerUnsubscribe) { console.log("[Auth] Cleaning balance listener before redirect."); balanceListenerUnsubscribe(); balanceListenerUnsubscribe = null; }
                 window.location.replace('index.html'); // Use replace
            } else if (isIndexPage) {
                 console.log("[Auth] User logged out on index page -> Showing Sign-in button.");
                 if (loader) loader.style.display = 'none';
                 if (signinBtn) {
                     signinBtn.style.display = 'inline-flex';
                     // Add listener only once
                     if (!signinBtn.hasClickListener) {
                        console.log("[Auth] Attaching Google Sign-in listener.");
                        signinBtn.addEventListener('click', signInWithGoogle);
                        signinBtn.hasClickListener = true;
                     } else {
                         // console.log("[Auth] Google Sign-in listener already exists."); // Less noisy
                     }
                 } else {
                     console.warn("[Auth] Google Sign-in button not found on index page!");
                 }
            } else {
                // User logged out on some other page? Redirect to index just in case.
                console.log("[Auth] User logged out on unknown page -> Redirecting to index...");
                window.location.replace('index.html');
            }
             // Clean up balance listener if somehow still active
             if (balanceListenerUnsubscribe) {
                 console.log("[Auth] Cleaning up balance listener (logout state).");
                 balanceListenerUnsubscribe();
                 balanceListenerUnsubscribe = null;
             }
             allTransactionsCache = []; // Clear cache on logout
        }
    });
    console.log("--- Auth State Listener Attached ---");
}

async function signInWithGoogle() {
    console.log("--- signInWithGoogle CALLED ---");
    const loader = document.getElementById('auth-loading');
    const signinBtn = document.getElementById('google-signin-btn');
    if (loader) loader.style.display = 'block';
    if (signinBtn) signinBtn.style.display = 'none';

    const provider = new firebase.auth.GoogleAuthProvider();
    try {
        console.log("[Sign In] Calling auth.signInWithRedirect...");
        await auth.signInWithRedirect(provider);
        console.log("[Sign In] Redirect should be happening now..."); // Might not show
    } catch (error) {
        console.error("[Sign In] Initiation Error:", error);
        showToast(`Sign-in failed: ${error.message}`, "error", 5000);
        if (loader) loader.style.display = 'none';
        if (signinBtn) signinBtn.style.display = 'inline-flex'; // Show button again on error
    }
}

// Check for redirect result when the app loads/returns
console.log("--- Checking for redirect result ---");
auth.getRedirectResult()
  .then((result) => {
    if (result.user) {
      console.log("[Redirect Check] Success! User:", result.user.uid);
      // Let onAuthStateChanged handle the actual redirection logic
    } else {
        console.log("[Redirect Check] No user in redirect result.");
    }
  }).catch((error) => {
    console.error("[Redirect Check] Error processing result:", error);
     // Avoid showing toast if it's just "no redirect result" which is normal
     if (error.code !== 'auth/no-redirect-operation') {
        showToast(`Sign-in redirect error: ${error.message}`, "error", 5000);
     }
     // Ensure login button is shown on index page after error
     const isIndexPage = window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname.endsWith('/www/');
     if(isIndexPage){
         const loader = document.getElementById('auth-loading');
         const signinBtn = document.getElementById('google-signin-btn');
         if (loader) loader.style.display = 'none';
         if (signinBtn) { // Show button regardless of listener state on error
             signinBtn.style.display = 'inline-flex';
         }
     }
  });


async function signOutUser() {
    console.log("--- signOutUser CALLED ---");
    if (balanceListenerUnsubscribe) {
        console.log("[Sign Out] Detaching balance listener.");
        balanceListenerUnsubscribe();
        balanceListenerUnsubscribe = null;
    }
    try {
        await auth.signOut();
        console.log("[Sign Out] Firebase signOut successful. onAuthStateChanged will handle redirect.");
        // Redirect is handled by onAuthStateChanged
    } catch (error) {
        console.error("[Sign Out] Error:", error);
        showToast("Error signing out.", "error");
    }
}


// --- 5. DASHBOARD PAGE FUNCTIONS (Modified to accept user) ---
function setupDashboardPage(user) { // Accept user object
    console.log(`%c--->>> Running setupDashboardPage for user: ${user.uid} <<<---`, 'color: green; font-weight: bold;');

    if (!user || !user.uid) { // More robust check
        console.error("!!! FATAL ERROR: setupDashboardPage called without valid user! Redirecting...");
        window.location.replace('index.html');
        return;
    }

    // Get elements
    const currentBalanceEl = document.getElementById('current-balance');
    const btnShowAdd = document.getElementById('btn-show-add');
    const btnShowSubtract = document.getElementById('btn-show-subtract');
    const transactionForm = document.getElementById('transaction-form');
    const btnCancelForm = document.getElementById('btn-cancel-form');
    const btnConfirmNo = document.getElementById('btn-confirm-no');
    const btnConfirmYes = document.getElementById('btn-confirm-yes');
    const logoutButton = document.getElementById('logout-btn');

    // --- ADD/UPDATE LOGOUT BUTTON LISTENER ---
    if (logoutButton) {
         console.log("[Dashboard] Setting up logout button listener.");
         // Use cloning to ensure no duplicate listeners
         const newLogoutButton = logoutButton.cloneNode(true);
         logoutButton.parentNode.replaceChild(newLogoutButton, logoutButton);
         newLogoutButton.addEventListener('click', signOutUser);
    } else { console.warn("[Dashboard] Logout button ('logout-btn') not found."); }

    // Start Real-time Balance Listener (Pass user.uid)
    if (currentBalanceEl) {

        // --- TEMPORARILY COMMENT OUT FIRESTORE QUERY ---
        console.warn("[Dashboard] Firestore balance query is TEMPORARILY DISABLED for debugging redirect loop.");
        currentBalanceEl.textContent = "₱----.--"; // Placeholder
        allTransactionsCache = []; // Ensure cache is empty for this test
        /*
        // --- Start Original Query Block ---
        if (balanceListenerUnsubscribe) {
             console.log("[Dashboard] Detaching previous balance listener.");
             balanceListenerUnsubscribe();
        }
        console.log("[Dashboard] Attaching balance listener for user:", user.uid);
        balanceListenerUnsubscribe = db.collection('transactions')
            .where('userId', '==', user.uid)
            .orderBy('transactionDate', 'desc')
            .onSnapshot(snapshot => {
                console.log("[Dashboard] Balance listener received update. Docs:", snapshot.size);
                let totalAdd = 0, totalSubtract = 0;
                let currentCache = [];
                snapshot.forEach(doc => {
                    const t = doc.data();
                    const amount = parseFloat(t.amount);
                    if (!isNaN(amount)) {
                         const timestamp = doc.data().transactionDate || null;
                         currentCache.push({ id: doc.id, ...t, amount: amount, transactionDate: timestamp });
                        if (t.type === 'add') totalAdd += amount;
                        else if (t.type === 'subtract') totalSubtract += amount;
                    } else { console.warn("Invalid amount in doc:", doc.id, t.amount); }
                });
                allTransactionsCache = currentCache;
                const balance = totalAdd - totalSubtract;
                console.log(`[Dashboard] Balance Calculated: ${balance}. Updating display.`);
                currentBalanceEl.textContent = `₱${formatLargeNumber(balance)}`;
            }, error => {
                console.error("[Dashboard] Firestore Error in balance listener: ", error);
                currentBalanceEl.textContent = "Error";
                showToast(`Could not load balance: ${error.message}`, "error", 5000);
                if (error.code === 'permission-denied') {
                     console.error("PERMISSION DENIED fetching balance!");
                     // signOutUser(); // Optional
                }
             });
        // --- End Original Query Block ---
        */
        // --- END OF TEMPORARY COMMENT OUT ---

    } else { console.error("CRITICAL: 'current-balance' element not found!"); }

    // Add other listeners
    console.log("[Dashboard] Attaching other listeners...");
    if (!btnShowAdd.hasClickListener) { // Use flag to prevent re-attaching
        if (btnShowAdd) { btnShowAdd.addEventListener('click', () => showTransactionModal('add')); btnShowAdd.hasClickListener = true; }
        else console.error("CRITICAL: btnShowAdd not found!");
        if (btnShowSubtract) { btnShowSubtract.addEventListener('click', () => showTransactionModal('subtract')); btnShowSubtract.hasClickListener = true; }
        else console.error("CRITICAL: btnShowSubtract not found!");
        if (btnCancelForm) { btnCancelForm.addEventListener('click', hideTransactionModal); btnCancelForm.hasClickListener = true; }
        else console.warn("btnCancelForm not found!");
        // Check form existence before adding listener
        if (transactionForm) { transactionForm.addEventListener('submit', handleFormSubmit); transactionForm.hasSubmitListener = true; }
        else console.error("CRITICAL: transactionForm not found!");
        if (btnConfirmNo) { btnConfirmNo.addEventListener('click', hideConfirmationModal); btnConfirmNo.hasClickListener = true; }
        else console.warn("btnConfirmNo not found!");
        if (btnConfirmYes) {
            btnConfirmYes.addEventListener('click', () => {
                console.log("Confirm Yes clicked!");
                if (onConfirmAction && typeof onConfirmAction === 'function') {
                    onConfirmAction();
                }
                hideConfirmationModal();
            });
             btnConfirmYes.hasClickListener = true;
        } else { console.warn("btnConfirmYes not found!"); }
    } else {
        console.log("[Dashboard] Other listeners likely already attached.");
    }


    console.log("--- setupDashboardPage finished normally. ---"); // IMPORTANT LOG
}

// --- Format Large Numbers ---
function formatLargeNumber(num) {
    if (typeof num !== 'number' || isNaN(num)) { return '0.00'; }
    const absNum = Math.abs(num);
    const sign = num < 0 ? "-" : "";
    if (absNum >= 1e9) return sign + (num / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (absNum >= 1e6) return sign + (num / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// --- MODAL FUNCTIONS (Corrected display style) ---
function showTransactionModal(type) {
    console.log("Showing Transaction Modal for type:", type);
    const modalTitle = document.getElementById('modal-title');
    const transactionTypeInput = document.getElementById('transaction-type');
    if (modalTitle) modalTitle.textContent = (type === 'add') ? 'Add Money' : 'Spend Money';
    if(transactionTypeInput) transactionTypeInput.value = type;
    if(transactionModal) transactionModal.style.display = 'grid'; // Use 'grid' for centering
}

function hideTransactionModal() {
    console.log("Hiding Transaction Modal...");
    const transactionForm = document.getElementById('transaction-form');
    if(transactionModal) transactionModal.style.display = 'none'; // Use 'none' to hide
    else console.warn("transactionModal element not found!");
    // Reset form only if it exists
    if(transactionForm) transactionForm.reset();
}

function showConfirmationModal(message, onConfirm) {
    console.log("Showing Confirmation Modal with message:", message);
    if(confirmationMessageEl) confirmationMessageEl.textContent = message;
    onConfirmAction = onConfirm;
    if(confirmationModal) confirmationModal.style.display = 'grid'; // Use 'grid' for centering
}

function hideConfirmationModal() {
    console.log("Hiding Confirmation Modal...");
    if(confirmationModal) confirmationModal.style.display = 'none'; // Use 'none' to hide
    else console.warn("confirmationModal element not found!");
    onConfirmAction = null;
}

// --- Handle Form Submit (Modified to add userId) ---
function handleFormSubmit(e) {
    e.preventDefault();
    console.log("Form Submitted!");

    // --- Check if user is logged in ---
    const currentUser = auth.currentUser;
    if (!currentUser) {
        showToast("Authentication error. Please log in again.", "error", 5000);
        return;
    }

    const nameInput = document.getElementById('name');
    const amountInput = document.getElementById('amount');
    const commentInput = document.getElementById('comment');
    const transactionTypeInput = document.getElementById('transaction-type');

    const name = nameInput ? nameInput.value : '';
    const amount = amountInput ? parseFloat(amountInput.value) : NaN;
    const comment = commentInput ? commentInput.value : '';
    const type = transactionTypeInput ? transactionTypeInput.value : '';
    const now = new Date();

    // Validations...
    if (isNaN(amount) || amount <= 0) { showToast("Invalid amount.", "error"); return; }
    if (!name || name.trim() === '') { showToast("Name is required.", "error"); return; }
    if (type !== 'add' && type !== 'subtract') { showToast("Invalid transaction type.", "error"); return;}


    const confirmationMessage = `Are you sure you want to ${type} ₱${amount.toLocaleString('en-US')} for "${name}"?`;

    showConfirmationModal(confirmationMessage, () => {
        console.log("Confirmation received...");

        // --- Re-check user status just before saving ---
        const userForSave = auth.currentUser;
        if (!userForSave) {
             showToast("Authentication expired. Please log in again.", "error", 5000);
             hideConfirmationModal();
             return;
        }

        const currentAmount = parseFloat(document.getElementById('amount').value);
        const currentType = document.getElementById('transaction-type').value;
        if (isNaN(currentAmount) || currentAmount <= 0) {
            showToast("Amount invalid. Try again.", "error");
            hideConfirmationModal();
            return;
        }


        // --- Add userId to data ---
        const transactionData = {
            userId: userForSave.uid, // <-- Use user ID
            name,
            amount: currentAmount,
            comment,
            type: currentType,
            transactionDate: firebase.firestore.Timestamp.fromDate(now), // Use Firestore Timestamp
            filterYear: now.getFullYear(),
            filterMonth: now.getMonth() + 1
        };

        console.log("Saving data:", transactionData);
        db.collection('transactions').add(transactionData)
            .then(docRef => {
                console.log("Save successful:", docRef.id);
                hideTransactionModal(); // Hide form modal
                const successMessage = `₱${currentAmount.toLocaleString('en-US')} successfully ${currentType === 'add' ? 'added' : 'deducted'}!`;
                showToast(successMessage, 'success');
             })
            .catch(error => {
                console.error("Error adding document: ", error);
                hideTransactionModal(); // Still hide form modal on error
                if (error.code === 'permission-denied') {
                     showToast("Error saving: Permission denied. Check Firestore Rules.", "error", 5000);
                } else {
                     showToast(`Error saving: ${error.message}`, "error");
                }
             });
    });
}

// --- 6. RECORDS PAGE FUNCTIONS (Modified to accept user) ---
function setupRecordsPage(user) { // Accept user object
    console.log(`%c--- Running setupRecordsPage for user: ${user.uid} ---`, 'color: green; font-weight: bold;');

     if (!user || !user.uid) { /* ... Redirect check ... */ return; }

    const recordsTbody = document.getElementById('records-tbody');
    const btnFilter = document.getElementById('btn-filter');
    const btnExportCSV = document.getElementById('btn-export-csv');
    const logoutButton = document.getElementById('logout-btn');

     // --- ADD/UPDATE LOGOUT BUTTON LISTENER ---
    if (logoutButton) {
         console.log("[Records] Setting up logout button listener.");
         const newLogoutButton = logoutButton.cloneNode(true);
         logoutButton.parentNode.replaceChild(newLogoutButton, logoutButton);
         newLogoutButton.addEventListener('click', signOutUser);
    } else { console.warn("[Records] Logout button ('logout-btn') not found."); }

    // Load initial records (Pass user.uid)
    if(recordsTbody) loadFilteredRecords(true, user.uid);
    else console.error("CRITICAL: recordsTbody not found!");

    // Add listeners (Pass user.uid)
    if (!btnFilter.hasClickListener) { // Use flag
        console.log("[Records] Attaching other listeners...");
        if(btnFilter) { btnFilter.addEventListener('click', () => loadFilteredRecords(false, user.uid)); btnFilter.hasClickListener = true; }
        else console.warn("btnFilter not found!");
        if(btnExportCSV) { btnExportCSV.addEventListener('click', () => exportDataToCSV(user.uid)); btnExportCSV.hasClickListener = true; }
        else console.warn("btnExportCSV not found!");
    } else {
        console.log("[Records] Other listeners likely already attached.");
    }

    console.log("--- setupRecordsPage finished normally. ---");
}

// Display Fetched Records
function displayFetchedRecords(fetchedRecords) {
     const recordsTbody = document.getElementById('records-tbody');
     if(!recordsTbody) return;
     // console.log("Displaying fetched records. Count:", fetchedRecords ? fetchedRecords.length : 0); // Less noisy

     if (!fetchedRecords || fetchedRecords.length === 0) {
        recordsTbody.innerHTML = '<tr><td colspan="4" class="text-center">No transactions found for this period.</td></tr>';
        return;
     }

     // Sort data by date (using Firestore Timestamp)
     fetchedRecords.sort((a, b) => {
         const timeA = a.transactionDate && a.transactionDate.toMillis ? a.transactionDate.toMillis() : 0;
         const timeB = b.transactionDate && b.transactionDate.toMillis ? b.transactionDate.toMillis() : 0;
         return timeB - timeA; // Descending order
      });

     let html = '';
     fetchedRecords.forEach(data => {
         const date = data.transactionDate && data.transactionDate.toDate ? data.transactionDate.toDate() : new Date(0);
         const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
         const formattedAmount = `₱${formatLargeNumber(data.amount || 0)}`;
         const amountClass = data.type === 'add' ? 'record-add' : 'record-subtract';
         const amountPrefix = data.type === 'add' ? '+' : '-';
         const safeName = (data.name || 'N/A').replace(/</g, "&lt;").replace(/>/g, "&gt;");
         const safeComment = (data.comment || '').replace(/</g, "&lt;").replace(/>/g, "&gt;");
         html += `<tr><td>${safeName}</td><td>${formattedDate}</td><td class="${amountClass}">${amountPrefix}${formattedAmount}</td><td>${safeComment}</td></tr>`;
     });
     recordsTbody.innerHTML = html;
}


// Load Filtered Records (Modified to accept userId and filter)
function loadFilteredRecords(isInitialLoad = false, userId) {
    if (!userId) { /* ... userId check ... */ return; }

    const recordsTbody = document.getElementById('records-tbody');
    if(!recordsTbody) { /* ... error check ... */ return; }
    recordsTbody.innerHTML = '<tr><td colspan="4" class="text-center">Loading...</td></tr>';

    const monthInput = document.getElementById('filter-month');
    const yearInput = document.getElementById('filter-year');
    const month = monthInput ? monthInput.value : '';
    const year = yearInput ? yearInput.value : '';

    console.log(`[Records] Filtering Firestore for user ${userId} - Month: ${month || 'All'}, Year: ${year || 'All'}`);

    // --- Add userId filter first ---
    let query = db.collection('transactions').where('userId', '==', userId);

    let hasFilter = false;
    // Add other filters
    if (year) {
         const yearNum = parseInt(year);
         if (!isNaN(yearNum)) { query = query.where('filterYear', '==', yearNum); hasFilter = true; }
    }
    if (month) {
         const monthNum = parseInt(month);
          if (!isNaN(monthNum) && monthNum >= 1 && monthNum <= 12) {
              query = query.where('filterMonth', '==', monthNum); hasFilter = true;
          } else if (month !== "") { console.warn("Invalid month selected:", month); }
    }
    query = query.orderBy('transactionDate', 'desc');

    console.log("[Records] Executing Firestore query...");
    query.get()
        .then(snapshot => {
            console.log("[Records] Firestore query successful. Docs:", snapshot.size);
            const fetchedRecords = [];
            snapshot.forEach(doc => { fetchedRecords.push({ id: doc.id, ...doc.data() }); });
            displayFetchedRecords(fetchedRecords); // Display results

            if (!isInitialLoad) { /* ... Show filter toast ... */ }
        })
        .catch(error => {
             console.error(`[Records] Error loading filtered records for user ${userId}: `, error);
             recordsTbody.innerHTML = `<tr><td colspan="4" class="text-center" style="color:red;">Error: ${error.message}. Check console.</td></tr>`;
             // --- Index Error Check ---
             if (error.code === 'failed-precondition') {
                 console.error("[Records] Firestore Index Required:", error.message);
                 const urlMatch = error.message.match(/https?:\/\/[^\s]+/);
                 const indexLink = urlMatch ? urlMatch[0] : null;
                 let toastMessage = "QUERY ERROR: Index needed. Check console (F12).";
                 if (indexLink) {
                     toastMessage = "QUERY ERROR: Click link in console (F12) to create index.";
                     console.log(">>> Firestore Index Creation Link:", indexLink, "<<<");
                 }
                 showToast(toastMessage, "error", 10000);
            } else if (error.code === 'permission-denied') {
                 console.error("[Records] PERMISSION DENIED loading records.");
                 showToast("Error loading records: Permission denied.", "error", 5000);
            } else { showToast("Error loading records.", "error"); }
        });
}


// --- 7. CSV EXPORT FUNCTIONS (Modified to accept userId) ---
async function exportDataToCSV(userId) { // Accept userId
     if (!userId) { showToast("Cannot export: User not identified.", "error"); return; }
    console.log(`[CSV] Export requested for user ${userId}...`);
    showToast("Fetching your data for export...", "neutral");

    try {
        // --- Fetch only user's data ---
        const snapshot = await db.collection('transactions')
                            .where('userId', '==', userId)
                            .orderBy('transactionDate', 'desc')
                            .get();
        const userData = [];
        snapshot.forEach(doc => userData.push({ id: doc.id, ...doc.data() }));

        console.log(`[CSV] Data fetched (User: ${userId}). Count:`, userData.length);
        if (userData.length === 0) { showToast("You have no data to export.", "neutral"); return; }

        const csv = convertToCSV(userData);
        const fileName = `PesoTracker_Export_${new Date().toISOString().split('T')[0]}.csv`;

        if (csv) {
            // Use Platform check for saving
            if (Capacitor.isNativePlatform()) {
                 console.log("[CSV] Native platform detected. Using Filesystem API.");
                 // Use Filesystem...
                  try {
                      const result = await Filesystem.writeFile({ path: fileName, data: csv, directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true });
                      console.log('[CSV] File saved to Documents:', result.uri);
                      showToast(`CSV saved to phone's Documents: ${fileName}`, 'success', 5000);
                  }
                  catch (fileError) {
                      console.error("[CSV] Filesystem (Documents) Error: ", fileError);
                      try { // Fallback to Downloads
                          console.log("[CSV] Fallback: Attempting to save to Downloads...");
                          const fallbackResult = await Filesystem.writeFile({ path: fileName, data: csv, directory: Directory.Downloads, encoding: Encoding.UTF8, recursive: true });
                           console.log('[CSV] File saved to Downloads:', fallbackResult.uri);
                           showToast(`CSV saved to phone's Downloads: ${fileName}`, 'success', 5000);
                      } catch (fallbackError) {
                           console.error("[CSV] Filesystem (Downloads) Error: ", fallbackError);
                           showToast("Error saving file. Storage permission?", "error", 5000);
                      }
                  }
            } else {
                 console.log("[CSV] Web platform detected. Using browser download.");
                 // Use Web Download...
                 downloadCSV(csv, fileName);
                 showToast("CSV download initiated (PC).", "success");
            }
        } else { showToast("Failed to generate CSV data.", "error"); }
    } catch (fetchError) {
         console.error(`[CSV] Error fetching data for export (User: ${userId}):`, fetchError);
         if (fetchError.code === 'permission-denied') {
             showToast("Could not fetch data: Permission denied.", "error", 5000);
         } else {
             showToast("Could not fetch your data for export.", "error");
         }
    }
}

// ConvertToCSV - No changes needed
function convertToCSV(data) {
    // console.log("[CSV] Converting data to CSV string..."); // Can be noisy
    if (!data || data.length === 0) return "";
    const headers = ["Date", "Name", "Type", "Amount", "Comment", "Year", "Month"];
    const rows = data.map(row => {
        let dateStr = 'N/A';
        // Use Firestore Timestamp's toDate() method safely
        if (row.transactionDate && row.transactionDate.toDate) {
            try { dateStr = row.transactionDate.toDate().toLocaleDateString('en-CA'); } // YYYY-MM-DD
            catch (e) { /* console.warn("Error converting date for CSV:", row.transactionDate); */ } // Less noisy
        }
        const name = `"${(row.name || '').replace(/"/g, '""')}"`;
        const type = row.type || '';
        const amount = row.amount || 0;
        const comment = `"${(row.comment || '').replace(/"/g, '""')}"`;
        const year = row.filterYear || '';
        const month = row.filterMonth || '';
        return [dateStr, name, type, amount, comment, year, month].join(",");
    });
    return [headers.join(","), ...rows].join("\n");
}


// downloadCSV - Keep for web fallback
function downloadCSV(csvString, filename = 'transactions.csv') {
    console.log("[CSV] Using downloadCSV for Web Browser.");
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url); link.setAttribute("download", filename);
        link.style.visibility = 'hidden'; document.body.appendChild(link);
        link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
        console.log("[CSV] Browser download triggered.");
    } else {
         // Fallback for older browsers
         try { navigator.msSaveBlob(blob, filename); console.log("[CSV] Saved via msSaveBlob."); }
         catch (e) { console.error("[CSV] msSaveBlob failed / Download method unsupported:", e); showToast("CSV Download failed. Method not supported?", "error"); }
    }
 }

// --- 8. TOAST NOTIFICATION FUNCTION ---
function showToast(message, type = 'success', duration = 3000) {
    const toast = document.getElementById('toast-notification');
    if (!toast) { console.warn('Toast element not found!'); return; }
    // console.log(`Showing Toast: [${type}] ${message}`); // Less noisy
    toast.textContent = message;
    toast.className = 'toast'; // Reset classes first
    if (type === 'success') toast.classList.add('success');
    else if (type === 'error') toast.classList.add('error');
    else if (type === 'neutral') toast.classList.add('neutral');
    toast.classList.add('show');

    // Clear existing timeout before setting a new one
    if (toast.timeoutId) clearTimeout(toast.timeoutId);

    toast.timeoutId = setTimeout(() => {
        toast.classList.remove('show');
        toast.timeoutId = null; // Clear the ID after hiding
    }, duration);
}