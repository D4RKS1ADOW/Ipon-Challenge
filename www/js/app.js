import { openDatabase } from "./database.js";
import { seedDefaultAccountIfNeeded } from "./accounts.js";
import { seedDefaultCategoriesIfNeeded } from "./categories.js";
import { processDueLiabilities } from "./liabilities.js";
import {
  renderDashboard,
  renderTransactions,
  renderAccounts,
  renderSavings,
  renderPlanned,
  renderReserved,
  renderLiabilities,
  renderReports,
  renderSettings,
  setRefreshCallback,
  openQuickAddMenu,
} from "./ui.js";
import { showToast } from "./modal.js";

const VIEW_RENDERERS = {
  dashboard: renderDashboard,
  transactions: renderTransactions,
  accounts: renderAccounts,
  savings: renderSavings,
  planned: renderPlanned,
  reserved: renderReserved,
  liabilities: renderLiabilities,
  reports: renderReports,
  settings: renderSettings,
};

let currentView = "dashboard";

async function renderCurrentView() {
  const container = document.getElementById(`view-${currentView}`);
  try {
    // Auto-converts any pending liability whose due date has arrived into
    // real income before the view renders — see liabilities.js.
    await processDueLiabilities();
    await VIEW_RENDERERS[currentView](container);
  } catch (err) {
    console.error(`Failed to render ${currentView} view`, err);
    container.innerHTML = `<div class="view-header"><h1>Something went wrong</h1></div>
      <p class="empty-state">This screen couldn't load. Try switching to another tab and back, or reload the page.</p>`;
  }
}

function switchView(viewName) {
  currentView = viewName;
  document.querySelectorAll(".view").forEach((el) => {
    el.hidden = el.id !== `view-${viewName}`;
  });
  document.querySelectorAll(".nav-button").forEach((btn) => {
    btn.classList.toggle("nav-button-active", btn.dataset.view === viewName);
  });
  renderCurrentView();
}

/* ------------------------- Mobile hamburger drawer ------------------------ */
// On phones the sidebar becomes an off-canvas drawer. The open/closed state is a
// single class on <body> (`nav-open`); all of the visuals live in styles.css.
const MOBILE_QUERY = window.matchMedia("(max-width: 720px)");

function isDrawerOpen() {
  return document.body.classList.contains("nav-open");
}

function setDrawerOpen(open, { returnFocus = true } = {}) {
  const menuBtn = document.getElementById("menu-toggle");
  document.body.classList.toggle("nav-open", open);
  menuBtn.setAttribute("aria-expanded", String(open));
  menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");

  if (open) {
    // Move focus into the drawer so keyboard / screen-reader users land in the menu.
    document.querySelector(".nav-button-active, .nav-button")?.focus();
  } else if (returnFocus) {
    menuBtn.focus();
  }
}

function wireMobileDrawer() {
  document.getElementById("menu-toggle").addEventListener("click", () => setDrawerOpen(!isDrawerOpen()));
  document.getElementById("nav-close-btn").addEventListener("click", () => setDrawerOpen(false));
  document.getElementById("nav-backdrop").addEventListener("click", () => setDrawerOpen(false));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isDrawerOpen()) setDrawerOpen(false);
  });

  // If the window grows past the mobile breakpoint (e.g. device rotation), reset the drawer.
  MOBILE_QUERY.addEventListener("change", () => {
    if (isDrawerOpen()) setDrawerOpen(false, { returnFocus: false });
  });
}

function wireNavigation() {
  document.querySelectorAll(".nav-button").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchView(btn.dataset.view);
      // Picking a destination closes the drawer and sends focus to the new content.
      if (isDrawerOpen()) {
        setDrawerOpen(false, { returnFocus: false });
        document.getElementById("main-content").focus({ preventScroll: true });
      }
      window.scrollTo(0, 0);
    });
  });
  document.getElementById("sidebar-add-btn").addEventListener("click", () => openQuickAddMenu());
  wireMobileDrawer();
}

async function init() {
  try {
    await openDatabase();
    await seedDefaultAccountIfNeeded();
    await seedDefaultCategoriesIfNeeded();
  } catch (err) {
    console.error("Failed to initialize the database", err);
    document.getElementById("main-content").innerHTML = `
      <div class="view-header"><h1>Couldn't start Money Tracker</h1></div>
      <p class="empty-state">Your browser blocked local storage (IndexedDB). Try a different browser, or check that you aren't in strict private-browsing mode.</p>
    `;
    return;
  }

  setRefreshCallback(renderCurrentView);
  wireNavigation();
  switchView("dashboard");
}

init();