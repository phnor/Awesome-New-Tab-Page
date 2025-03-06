// Background service worker for Awesome New Tab Page updated for Manifest V3 and Chrome 133
// Note: localStorage and window events are not available in service workers.
// Using chrome.storage.local for persistent storage and chrome.storage.onChanged for listening to changes.

// Refresh the page (if applicable) is not available in a service worker.
// Instead, you might trigger updates via message passing to your content scripts or a popup.

// Set up a refresh timer (this is just an example; reloading the service worker requires additional logic)
setTimeout(() => {
  console.log("Time to update; consider triggering an update to your UI if needed.");
}, 1 * 60 * 60 * 1000);

// ----- Recently Closed Tabs & Tab Manager Widget -----

let recentlyClosed = [];
// Initialize open tabs array in memory
let tabs = [];

// Helper function to update open tabs in chrome.storage.local
function updateAllTabs() {
  chrome.tabs.query({}, function(data) {
    tabs = data;
    chrome.storage.local.set({ open_tabs: tabs }, () => {
      console.log("Updated open_tabs in storage.");
    });
  });
}

// Set up listeners for tab events
chrome.tabs.onRemoved.addListener((tabId) => {
  // Retrieve the removed tab from our cached 'tabs' array
  const removedTab = tabs.find(tab => tab.id === tabId);
  if (!removedTab || removedTab.incognito || removedTab.title === "" || removedTab.url.indexOf("chrome://") !== -1) {
    return;
  }
  recentlyClosed.unshift({ title: removedTab.title, url: removedTab.url });
  if (recentlyClosed.length > 15) {
    recentlyClosed.pop();
  }
  chrome.storage.local.set({ recently_closed: recentlyClosed }, () => {
    console.log("Updated recently_closed in storage.");
  });
  updateAllTabs();
});
chrome.tabs.onMoved.addListener(updateAllTabs);
chrome.tabs.onCreated.addListener(updateAllTabs);
chrome.tabs.onUpdated.addListener(updateAllTabs);
chrome.tabs.onHighlighted.addListener(updateAllTabs);

// Initial tabs update
updateAllTabs();

// Listen for storage changes using chrome.storage.onChanged
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  
  // Switch to tab functionality
  if (changes.switch_to_tab) {
    const id = parseInt(changes.switch_to_tab.newValue, 10);
    if (id !== -1) {
      chrome.tabs.query({ active: true, currentWindow: true }, (activeTabs) => {
        if (activeTabs.length && id !== activeTabs[0].id) {
          chrome.tabs.remove(activeTabs[0].id, () => {
            chrome.tabs.update(id, { active: true });
          });
        }
      });
      chrome.storage.local.set({ switch_to_tab: -1 });
    }
  }
  
  // Close tab functionality
  if (changes.close_tab) {
    const id = parseInt(changes.close_tab.newValue, 10);
    if (id !== -1) {
      chrome.tabs.remove(id, () => {
        chrome.storage.local.set({ close_tab: -1 });
      });
    }
  }
  
  // Toggle pin status functionality
  if (changes.pin_toggle) {
    const id = parseInt(changes.pin_toggle.newValue, 10);
    if (isNaN(id)) return;
    const tab = tabs.find(tab => tab.id === id);
    if (!tab) {
      console.error("Tab wasn't found");
      return;
    }
    chrome.tabs.update(id, { pinned: !tab.pinned });
    chrome.storage.local.set({ pin_toggle: null });
  }
});

// ----- Get Installed Widgets -----

let extensions = [];
let eventLock = false;

function reloadExtensions(extData) {
  extensions = extData;
  reloadInstalledWidgets();
  eventLock = false;
}

function reloadInstalledWidgets() {
  // For demonstration, we simply store an empty array.
  chrome.storage.local.set({ installed_widgets: [] }, () => {
    console.log("Installed widgets cleared.");
    // Simulate post-update action, e.g. trigger UI update.
    console.log("Would trigger UI refresh here.");
  });
  // Optionally, trigger an update after a timeout.
  setTimeout(() => {
    console.log("Periodic update check triggered.");
  }, 10000);
}

// Get all extensions initially
chrome.management.getAll(reloadExtensions);

// Listen for storage changes that may indicate refresh requests for widgets.
chrome.storage.onChanged.addListener((changes) => {
  if (changes.refresh_widgets || (changes.key && changes.key === "")) {
    chrome.management.getAll(reloadExtensions);
  }
});

// Listen for extension enable/disable events and refresh extensions accordingly.
chrome.management.onEnabled.addListener(() => {
  if (!eventLock) {
    eventLock = true;
    chrome.management.getAll(reloadExtensions);
  }
});
chrome.management.onInstalled.addListener(() => {
  if (!eventLock) {
    eventLock = true;
    chrome.management.getAll(reloadExtensions);
  }
});
chrome.management.onDisabled.addListener(() => {
  if (!eventLock) {
    eventLock = true;
    chrome.management.getAll(reloadExtensions);
  }
});
chrome.management.onUninstalled.addListener(() => {
  if (!eventLock) {
    eventLock = true;
    chrome.management.getAll(reloadExtensions);
  }
});

// Periodically update widget list based on time in storage.
chrome.storage.local.get(["last_widget_update"], (result) => {
  const lastUpdate = parseInt(result.last_widget_update || 0, 10);
  const currentTime = Math.round(new Date().getTime() / 1000);
  if (currentTime > (lastUpdate + 30 * 60)) {
    chrome.management.getAll(reloadExtensions);
    chrome.storage.local.set({ last_widget_update: currentTime });
  }
});

// ----- External Communication -----
//
// Replace deprecated chrome.extension.sendRequest with chrome.runtime.sendMessage
// And replace chrome.extension.onRequestExternal with chrome.runtime.onMessageExternal
//
function sayHelloToPotentialWidgets() {
  for (const ext of extensions) {
    chrome.runtime.sendMessage(ext.id, "mgmiemnjjchgkmgbeljfocdjjnpjnmcg-poke", (response) => {
      // Optionally handle response from the widget.
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
      } else {
        console.log("Received response from", ext.id, response);
      }
    });
  }
}

// Listen for external messages
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  if (request.head && request.head === "mgmiemnjjchgkmgbeljfocdjjnpjnmcg-pokeback") {
    chrome.storage.local.get(["installed_widgets"], (result) => {
      let installedWidgets = result.installed_widgets || [];
      installedWidgets.push({ request: request, sender: sender });
      chrome.storage.local.set({ installed_widgets: installedWidgets }, () => {
        console.log("Updated installed_widgets with external message.");
      });
    });
  }
});
