import { initializeApp } from
  "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";

import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";

import {
  collection,
  doc,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

document.documentElement.classList.add("js");

const firebaseConfig = {
  apiKey: "AIzaSyBKAXrn1Bd0bGq34e7ZqzUBNYmBHQdP66w",
  authDomain: "padel-smf.firebaseapp.com",
  projectId: "padel-smf",
  storageBucket: "padel-smf.firebasestorage.app",
  messagingSenderId: "502810165156",
  appId: "1:502810165156:web:ee4d4e4aacec655ac40b31",
  measurementId: "G-7CZLYN77PP"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const SLOT_TIMES = ["18:00", "19:00", "20:00", "21:00", "22:00"];
const dayNames = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];

const byId = (id) => document.getElementById(id);

const dayRow = byId("dayRow");
const slotGrid = byId("slotGrid");
const bookingForm = byId("bookingForm");
const bookBtn = byId("bookBtn");
const confirmBox = byId("confirmBox");

const googleSignInBtn = byId("googleSignInBtn");
const authMessage = byId("authMessage");
const authSignedOut = byId("authSignedOut");
const authSignedIn = byId("authSignedIn");
const accountEmail = byId("accountEmail");
const signOutBtn = byId("signOutBtn");
const myBookingsPanel = byId("myBookingsPanel");
const myBookingsList = byId("myBookingsList");

let unsubscribeBookings = null;
let currentUserBookings = [];
let userBookingsLoaded = false;

function getAuthReturnUrl() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "prenota";
  return url.href;
}

let currentDate = "";
let currentDayLabel = "";
let currentSlot = null;
let unsubscribeSlots = null;

// Navigazione
const nav = byId("siteNav");

window.addEventListener("scroll", () => {
  nav.classList.toggle("scrolled", window.scrollY > 20);
});

// Animazioni
const revealEls = document.querySelectorAll(".reveal");

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add("in");
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });

revealEls.forEach((element) => observer.observe(element));

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isoDateToDayNumber(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);

  return Math.floor(
    Date.UTC(year, month - 1, day) / 86400000
  );
}

function wouldExceedConsecutiveDayLimit(candidateDate) {
  const bookedDates = new Set(
    currentUserBookings
      .filter((booking) =>
        booking.date && booking.status !== "cancelled"
      )
      .map((booking) => booking.date)
  );

  bookedDates.add(candidateDate);

  const bookedDays = [...bookedDates]
    .map(isoDateToDayNumber)
    .sort((a, b) => a - b);

  let consecutiveDays = 1;

  for (let index = 1; index < bookedDays.length; index += 1) {
    if (bookedDays[index] === bookedDays[index - 1] + 1) {
      consecutiveDays += 1;

      if (consecutiveDays > 2) {
        return true;
      }
    } else {
      consecutiveDays = 1;
    }
  }

  return false;
}

function buildDayRow() {
  const today = new Date();
  dayRow.replaceChildren();

  for (let index = 0; index < 5; index += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() + index);

    const isoDate = toIsoDate(date);
    const label = `${dayNames[date.getDay()]} ${date.getDate()}`;

    const button = document.createElement("button");
    button.type = "button";
    button.className = `day-pill${index === 0 ? " active" : ""}`;
    button.textContent = label;

    button.addEventListener("click", () => {
      dayRow.querySelectorAll(".day-pill").forEach((item) => {
        item.classList.remove("active");
      });

      button.classList.add("active");
      selectDay(isoDate, label);
    });

    dayRow.appendChild(button);

    if (index === 0) {
      currentDate = isoDate;
      currentDayLabel = label;
    }
  }

  watchSelectedDay();
}

function selectDay(isoDate, label) {
  currentDate = isoDate;
  currentDayLabel = label;
  currentSlot = null;

  updateSummary();
  watchSelectedDay();
}

function watchSelectedDay() {
  if (unsubscribeSlots) {
    unsubscribeSlots();
  }

  slotGrid.textContent = "Caricamento disponibilità…";

  const slotsQuery = query(
    collection(db, "bookingSlots"),
    where("date", "==", currentDate)
  );

  unsubscribeSlots = onSnapshot(
    slotsQuery,
    (snapshot) => {
      const occupiedSlots = new Set(
        snapshot.docs.map((slotDocument) => slotDocument.data().time)
      );

      renderSlots(occupiedSlots);
    },
    (error) => {
      console.error(error);
      slotGrid.innerHTML =
        '<div class="slot-error">Impossibile caricare gli orari.</div>';
    }
  );
}

function slotIsPast(time) {
  const slotDate = new Date(`${currentDate}T${time}:00`);
  return slotDate <= new Date();
}

function renderSlots(occupiedSlots) {
  const fragment = document.createDocumentFragment();

  SLOT_TIMES.forEach((time) => {
    const occupied = occupiedSlots.has(time);
    const past = slotIsPast(time);
    const unavailable = occupied || past;

    const button = document.createElement("button");
    button.type = "button";
    button.className = `slot${unavailable ? " taken" : ""}`;
    button.disabled = unavailable;

    const timeText = document.createTextNode(time);
    button.appendChild(timeText);

    if (unavailable) {
      const status = document.createElement("span");
      status.className = "slot-status";
      status.textContent = occupied ? "Occupato" : "Passato";
      button.appendChild(status);
    }

    button.addEventListener("click", () => {
      slotGrid.querySelectorAll(".slot").forEach((slotButton) => {
        slotButton.classList.remove("selected");
      });

      button.classList.add("selected");
      currentSlot = time;
      updateSummary();
    });

    fragment.appendChild(button);
  });

  slotGrid.replaceChildren(fragment);
}

function updateSummary() {
  byId("summaryDay").textContent = currentDayLabel || "—";
  byId("summaryTime").textContent = currentSlot || "—";
  byId("summaryPeople").textContent = byId("fPeople").value;
  byId("summaryName").textContent =
    byId("fName").value.trim() || "—";

  byId("summaryDocuments").textContent =
    byId("fDocuments").checked ? "Confermati" : "Da confermare";
}

byId("fName").addEventListener("input", updateSummary);
byId("fPeople").addEventListener("change", updateSummary);
byId("fDocuments").addEventListener("change", updateSummary);

bookingForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const user = auth.currentUser;

  if (!user || !user.emailVerified) {
    alert("Accedi tramite il link ricevuto via email prima di prenotare.");
    return;
  }

  if (!currentSlot) {
    alert("Seleziona un orario disponibile.");
    return;
  }

  if (!userBookingsLoaded) {
  alert(
    "Le tue prenotazioni sono ancora in caricamento. Attendi qualche secondo e riprova."
  );
  return;
}

if (wouldExceedConsecutiveDayLimit(currentDate)) {
  alert(
    "Non puoi prenotare più di 2 giorni consecutivi. Scegli un'altra data."
  );
  return;
}

  bookBtn.disabled = true;
  bookBtn.textContent = "Salvataggio…";

  try {
    const bookingId = `${currentDate}_${currentSlot}`;

    const slotReference = doc(db, "bookingSlots", bookingId);
    const bookingReference = doc(db, "bookings", bookingId);

    const batch = writeBatch(db);

    batch.set(slotReference, {
      date: currentDate,
      time: currentSlot,
      status: "booked",
      createdAt: serverTimestamp()
    });

    batch.set(bookingReference, {
      ownerUid: user.uid,
      name: byId("fName").value.trim(),
      phone: byId("fPhone").value.trim(),
      email: user.email,
      people: Number(byId("fPeople").value),
      documentsConfirmed: byId("fDocuments").checked,
      date: currentDate,
      time: currentSlot,
      durationMinutes: 60,
      status: "confirmed",
      createdAt: serverTimestamp()
    });

    await batch.commit();

    const confirmedDay = currentDayLabel;
    const confirmedTime = currentSlot;

    bookingForm.reset();

    // reset() svuota anche l’email: la ripristiniamo.
    byId("fEmail").value = user.email;
    byId("fEmail").readOnly = true;

    currentSlot = null;
    updateSummary();

    confirmBox.textContent =
      `Prenotazione confermata: ${confirmedDay}, ore ${confirmedTime}.`;

    confirmBox.classList.add("show");
  } catch (error) {
    console.error("Errore prenotazione:", error.code, error.message);

    if (error.code === "permission-denied") {
      alert(
        "Questo turno è già occupato oppure le regole Firebase non permettono l’operazione."
      );
    } else {
      alert("Non è stato possibile salvare la prenotazione. Riprova.");
    }
  } finally {
    bookBtn.disabled = !auth.currentUser;
    bookBtn.textContent = "Conferma prenotazione";
  }
});

const googleProvider = new GoogleAuthProvider();

googleSignInBtn.addEventListener("click", async () => {
googleSignInBtn.disabled = true;
authMessage.textContent = "Apertura dell’accesso Google…";

  try {
    await signInWithPopup(auth, googleProvider);
    authMessage.textContent = "";
  } catch (error) {
    console.error("Errore accesso Google:", error.code, error.message);

    const messages = {
      "auth/popup-closed-by-user":
        "Accesso annullato. Puoi riprovare.",
      "auth/popup-blocked":
        "Il browser ha bloccato la finestra di accesso.",
      "auth/unauthorized-domain":
        "Il dominio del sito non è autorizzato in Firebase.",
      "auth/network-request-failed":
        "Errore di rete. Controlla la connessione."
    };

    authMessage.textContent =
      messages[error.code] || "Accesso non riuscito. Riprova.";
  } finally {
    googleSignInBtn.disabled = false;
  }
});

// interfaccia in base all’utente
onAuthStateChanged(auth, (user) => {
  const signedIn = Boolean(user?.emailVerified);

  authSignedOut.hidden = signedIn;
  authSignedIn.hidden = !signedIn;
  myBookingsPanel.hidden = !signedIn;
  bookBtn.disabled = !signedIn;

  if (signedIn) {
    accountEmail.textContent = user.email;
    byId("fEmail").value = user.email;
    byId("fEmail").readOnly = true;

    watchMyBookings(user.uid);
  } else {
    accountEmail.textContent = "";
    byId("fEmail").readOnly = false;
    
    currentUserBookings = [];
    userBookingsLoaded = false;

    if (unsubscribeBookings) {
      unsubscribeBookings();
      unsubscribeBookings = null;
    }

    myBookingsList.replaceChildren();
  }
});

signOutBtn.addEventListener("click", async () => {
  await signOut(auth);
});

function watchMyBookings(uid) {
  if (unsubscribeBookings) {
    unsubscribeBookings();
  }

  currentUserBookings = [];
  userBookingsLoaded = false;

  const bookingsQuery = query(
    collection(db, "bookings"),
    where("ownerUid", "==", uid)
  );

  unsubscribeBookings = onSnapshot(
    bookingsQuery,
    (snapshot) => {
      const bookings = snapshot.docs
        .map((bookingDocument) => ({
          id: bookingDocument.id,
          ...bookingDocument.data()
        }))
        .sort((a, b) =>
          `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)
        );
        
      currentUserBookings = bookings;
      userBookingsLoaded = true;
      
      renderMyBookings(bookings);
    },
    (error) => {
      userBookingsLoaded = false;
      console.error(error);
      myBookingsList.textContent =
        "Impossibile caricare le prenotazioni.";
    }
  );
}

function renderMyBookings(bookings) {
  myBookingsList.replaceChildren();

  if (bookings.length === 0) {
    myBookingsList.textContent =
      "Non hai prenotazioni attive.";
    return;
  }

  const fragment = document.createDocumentFragment();

  bookings.forEach((booking) => {
    const card = document.createElement("article");
    card.className = "my-booking-card";

    const information = document.createElement("p");
    information.textContent =
      `${booking.date}, ore ${booking.time} — ` +
      `${booking.people} giocatori`;

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "btn btn-ghost cancel-booking";
    cancelButton.textContent = "Annulla prenotazione";

    cancelButton.addEventListener("click", () => {
      cancelBooking(booking, cancelButton);
    });

    card.append(information, cancelButton);
    fragment.appendChild(card);
  });

  myBookingsList.appendChild(fragment);
}

async function cancelBooking(booking, button) {
  const user = auth.currentUser;

  if (!user?.emailVerified) {
    alert("Devi effettuare nuovamente l’accesso.");
    return;
  }

  const confirmed = window.confirm(
    `Vuoi annullare la prenotazione del ${booking.date} ` +
    `alle ${booking.time}?`
  );

  if (!confirmed) {
    return;
  }

  button.disabled = true;
  button.textContent = "Annullamento…";

  try {
    const batch = writeBatch(db);

    batch.delete(doc(db, "bookings", booking.id));
    batch.delete(doc(db, "bookingSlots", booking.id));

    await batch.commit();

    alert("Prenotazione annullata correttamente.");
  } catch (error) {
    console.error(error);
    alert(
      error.code === "permission-denied"
        ? "Non sei autorizzato ad annullare questa prenotazione."
        : "Annullamento non riuscito. Riprova."
    );

    button.disabled = false;
    button.textContent = "Annulla prenotazione";
  }
}

buildDayRow();
updateSummary();