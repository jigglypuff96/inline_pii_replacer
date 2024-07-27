let enabled;
let previousEnabled;
let detectedEntities = [];
let piiMappings = {};
let entityCounts = {};
let useOnDeviceModel = false;

let currentConversationId = window.helper.getActiveConversationId();
let typingTimer;
const doneTypingInterval = 1000;

console.log("Content script loaded!");

chrome.runtime.onMessage.addListener(async function (
  request,
  sender,
  sendResponse
) {
  if (request.action === "toggleModel") {
    await window.helper.toggleModel();
    sendResponse({ status: "Model toggled" });
  }
});

chrome.runtime.onMessage.addListener(async function (
  request,
  sender,
  sendResponse
) {
  if (request.action === "toggleEnabled") {
    window.helper.toggleEnabled(request.enabled);
    const { addDetectButton, removeDetectButton } = await import(
      chrome.runtime.getURL("buttonWidget.js")
    );
    if (request.enabled) {
      addDetectButton();
    } else {
      removeDetectButton();
    }

    sendResponse({ status: "Enabled status toggled" });
  }
});

async function checkForConversationChange() {
  if (!window.helper.enabled) {
    return;
  }
  const newConversationId = window.helper.getActiveConversationId();
  if (
    newConversationId !== currentConversationId ||
    previousEnabled !== window.helper.enabled
  ) {
    previousEnabled = window.helper.enabled;
    currentConversationId = newConversationId;
    removeTooltipAndPanel();
    document.removeEventListener("input", typingHandler);
    document.addEventListener("input", typingHandler);
    const { addDetectButton } = await import(
      chrome.runtime.getURL("buttonWidget.js")
    );
    addDetectButton();
  }
}

function typingHandler(e) {
  const input = document.querySelector("textarea, input[type='text']");
  if (input.contains(e.target)) {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(doneTyping, doneTypingInterval);
  }
}

async function doneTyping() {
  if (!window.helper.enabled) {
    return;
  }
  showLoadingIndicator();
  await window.helper.handleDetectAndUpdatePanel();
  const detectedEntities = window.helper.getCurrentEntities();

  let noFound;
  if (!detectedEntities) {
    this.updateDetectButtonToIntial();
    return;
  }
  if (detectedEntities.length > 0) {
    noFound = false;
  } else {
    noFound = true;
  }
  updateDetectButtonWithResults(noFound);
}

function showLoadingIndicator() {
  const detectButton = document.getElementById("detect-next-to-input-button");
  if (detectButton) {
    detectButton.innerHTML = `<span class="loader"></span>`;
  }
}
function updateDetectButtonToIntial() {
  detectButton.innerHTML = `<span class="detect-circle"></span>`;
}

function updateDetectButtonWithResults(noFound) {
  const detectButton = document.getElementById("detect-next-to-input-button");
  if (detectButton) {
    detectButton.innerHTML = `<span class="detected-circle"></span>`;
    const detectedCircle = detectButton.querySelector(".detected-circle");
    const extensionId = chrome.runtime.id;
    if (noFound) {
      detectedCircle.style.backgroundImage = `url(chrome-extension://${extensionId}/images/check4.png)`;
    } else {
      detectedCircle.style.backgroundImage = `url(chrome-extension://${extensionId}/images/magnifier5.png)`;
    }

    detectButton.addEventListener("click", async () => {
      if (detectedCircle) {
        await window.helper.highlightDetectedWords();
      }
    });
  }
}

setInterval(async () => {
  try {
    await checkForConversationChange();
  } catch (error) {
    console.error(error);
  }
}, 1000);

function removeTooltipAndPanel() {
  const tooltip = document.querySelector(".pii-highlight-tooltip");
  if (tooltip) {
    tooltip.remove();
  }

  const panel = document.getElementById("pii-replacement-panel");
  if (panel) {
    panel.remove();
  }
}

// Improved mutation observer to handle new messages dynamically
const observer = new MutationObserver((mutations) => {
  if (!window.helper.enabled) {
    return;
  }
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (
          node.matches(
            '[data-message-author-role="assistant"], [data-message-author-role="user"]'
          )
        ) {
          console.log("New message detected:", node); // Log detection
          window.helper.checkMessageRenderedAndReplace(node);
        }
        node
          .querySelectorAll(
            '[data-message-author-role="assistant"], [data-message-author-role="user"]'
          )
          .forEach((el) => {
            console.log("New nested message detected:", el); // Log nested detection
            window.helper.checkMessageRenderedAndReplace(el);
          });
      }
    });
  });
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

function observeStopButton() {
  const stopButtonObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      const stopButton = document.querySelector(
        'button[data-testid="stop-button"]'
      );
      if (stopButton) {
        // Once user send out the message, then stop button would show up, and send button will be replaced
        // then we remove tooltip and panel
        removeTooltipAndPanel();
      }
    });
  });

  stopButtonObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

// Apply replacements on page load
async function initialize() {
  if (!window.helper.enabled) {
    return;
  }
  // chrome.storage.local.set({ useOnDeviceModel: false });
  const { initializeButton } = await import(
    chrome.runtime.getURL("buttonWidget.js")
  );
  console.log("calling initialize button");
  initializeButton();
  await window.helper.loadModelState();
  observeStopButton();
}

// Call the initialize function when the content script loads and the DOM is ready
window.addEventListener("load", async () => {
  await window.helper.getEnabledStatus();
  enabled = window.helper.enabled;
  initialize();

  document
    .querySelectorAll('[data-message-author-role="assistant"]')
    .forEach((el) => {
      window.helper.checkMessageRenderedAndReplace(el);
    });
  document
    .querySelectorAll('[data-message-author-role="user"]')
    .forEach((el) => {
      window.helper.checkMessageRenderedAndReplace(el);
    });
});
