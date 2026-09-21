import { CIBUS_MATCH_CACHE_KEY, addMatchesToCache, getCachedMatches } from "./cibus-match-cache.js";
import { matchNamesHeuristically } from "./heuristic-matcher.js";
import { DEFAULT_OPENROUTER_MODEL, matchUnresolvedNames } from "./openrouter-matcher.js";

(async function () {
  async function waitForApp() {
    while (document.querySelector("app-order-split") === null) {
      await new Promise((res) => setTimeout(res, 100));
    }
  }

  await waitForApp();

  console.log("Pimp my Cibus: Detected payment button, handling payment split...");

  const logoUrl = chrome.runtime.getURL(
    "assets/icons/pimp-my-wolt-icon-128.png"
  );
  const loaderUrl = chrome.runtime.getURL("/assets/loader.gif");
  const { groupManager, biLogger } = window.pimpMyWolt;

  const isHebrewCibus = !!getElementWithText("div", "עברית")
  const getCurrentLanguage = (english, hebrew) => isHebrewCibus ? hebrew : english

  const texts = {
    paymentButton: getCurrentLanguage("Order with Cibus", "אישור התשלום באמצעות סיבוס"),
    addFriendToShareButton: getCurrentLanguage("Add friends to sharing", "הוספת חברים לחלוקה"),
    chooseFriendButton: getCurrentLanguage("Choose friend", " בחירת חבר/ה "),
    myChargeText: getCurrentLanguage("My charge", "החיוב שלי"),
  };

  const selectors = {
    paymentButton() { return getElementWithText("button", texts.paymentButton) },
    splitPaymentWithFriendsToggle() { return document.querySelector("app-toggle-button .ng-toggle-switch-button") },
    addFriendsToShareButton() { return getElementWithText("a", texts.addFriendToShareButton) },
    chooseFriendButton() { return document.querySelector(".mat-menu-trigger:not(.hid)") },
    chooseFriendDeleteButton() {
      return this.chooseFriendButton().closest("tr").querySelector(".del")
    },
    friendMenuItem(name) { return getElementWithText("span", name) },
    friendPaymentTableRow(name) { return getElementWithText("span", name) },
    friendPaymentInput(name) {
      const guestEl = this.friendPaymentTableRow(name);
      return guestEl?.closest("tr")?.querySelector("input");
    },
    allFriendsInMenu() {
      return [...document.querySelectorAll(".friends-menu-item")].map((e) => e?.innerText);
    },
    uiContainer() {
      return document.querySelector("app-order-split");
    },
    myCharge() {
      return getElementWithText("span", texts.myChargeText);
    }
  }

  const message = {
    divId: "messageDiv-pimpMyWolt",
  };

  function getElementWithText(element, text) {
    const xpath = `//${element}[contains(., "${text}")]`;
    return document
      .evaluate(xpath, document, null, XPathResult.ANY_TYPE, null)
      .iterateNext();
  }

  async function getAutoMatch({ woltNames, cibusNames }) {
    const { openRouterApiKey, openRouterModel } = await new Promise((resolve) => {
      chrome.storage.local.get(["openRouterApiKey", "openRouterModel"], resolve);
    });
    if (!openRouterApiKey) return matchNamesHeuristically(woltNames, cibusNames);

    return matchUnresolvedNames({
      woltNames,
      cibusNames,
      apiKey: openRouterApiKey,
      model: openRouterModel || DEFAULT_OPENROUTER_MODEL,
    });
  }

  const fetchFromStorage = (...items) =>
    new Promise((res, rej) => {
      chrome.storage.local.get(items, (result) => res(result));
    });


  async function matchGuestsToCibus(allOrders, allCibusFriends) {
    const [currentUser, ...guestsOrders] = allOrders;
    const woltNames = guestsOrders.map(guestOrder => guestOrder.name);
    const { [CIBUS_MATCH_CACHE_KEY]: matchCache = {} } = await fetchFromStorage(CIBUS_MATCH_CACHE_KEY);
    const cachedMatches = getCachedMatches(woltNames, allCibusFriends, matchCache);
    const cachedWoltNames = new Set(cachedMatches.map(({ woltName }) => woltName));

    if (cachedWoltNames.size > 0) {
      console.log("Cached Wolt Names:", cachedWoltNames);
    }

    const unresolvedWoltNames = woltNames.filter((woltName) => !cachedWoltNames.has(woltName));

    if (unresolvedWoltNames.length === 0) {
      console.log("All Wolt names are resolved from cache.");
    } else {
      console.log("Unresolved Wolt Names:", unresolvedWoltNames);
    }

    const newMatches = unresolvedWoltNames.length > 0
      ? await getAutoMatch({ woltNames: unresolvedWoltNames, cibusNames: allCibusFriends })
      : [];
    if (newMatches === null) return null;
    const autoMatching = [...cachedMatches, ...newMatches];

    if (newMatches.length > 0) {
      chrome.storage.local.set({
        [CIBUS_MATCH_CACHE_KEY]: addMatchesToCache(matchCache, newMatches),
      });
    }

    const matchedGuests = autoMatching.filter(matching => !!matching.cibusName).map(matching => {
      const debt = guestsOrders.find(guestOrder => guestOrder.name === matching.woltName).price;

      return {
        woltName: matching.woltName,
        debt,
        cibusName: matching.cibusName
      }
    })




    const missingGuests = guestsOrders.filter(guestOrder => {
      const match = matchedGuests.find(match => match.woltName === guestOrder.name);
      return !match || (!allCibusFriends.find(cibusGuest => cibusGuest === match.cibusName));
    });

    return { matchedGuests, missingGuests };
  }

  async function fetchGuestsDebts() {
    const {
      totalOrderPrice,
      guestsOrders,
      orderTimestamp,
      restaurant,
    } = await fetchFromStorage(
      "totalOrderPrice",
      "guestsOrders",
      "orderTimestamp",
      "restaurant"
    );
    if (orderTimestamp + 30 * 1000 < Date.now() || !guestsOrders.length) {
      return;
    }

    const totalGuestsPrice = guestsOrders.reduce(
      (partialSum, guestOrder) => partialSum + guestOrder.price,
      0
    );
    // Includes delivery and tip.
    const orderAdditionalCharge = totalOrderPrice - totalGuestsPrice;
    const additionalChargePerGuest = Number(
      orderAdditionalCharge / guestsOrders.length
    );

    const guestDebts = guestsOrders.map((guestOrder) => {
      return {
        name: guestOrder.name,
        price: (guestOrder.price + additionalChargePerGuest).toFixed(2),
      };
    });

    return guestDebts;
  }

  function getLoaderUi() {
    const container = document.createElement("div");

    const loadingHtml = `
    <style>
      .container-pimpMyWolt {
        display: flex;
        flex-direction: row;
        border: 1px solid #ddd;
        border-radius: 5px;
        position: relative;
        padding: 0 5px;
        margin: 0;
        justify-content: center;
        align-items: center;
      }

      .logo-pimpMyWolt {  
        height: 70px;
        margin: -30px 10px;
        position: relative;
        top: -2px;
      }

      .loader-pimpMyWolt {
        height: 24px;
        margin: 15px;
      }
    </style>

    <div class="container-pimpMyWolt">
      <img src="${loaderUrl}" class="loader-pimpMyWolt"/>
      <img src="${logoUrl}" class="logo-pimpMyWolt"/>
    </div>
    `;

    container.innerHTML = loadingHtml;

    return container;
  }

  function getUi({ selectGuestsFn, splitPayFn }) {
    const container = document.createElement("div");

    const selectGuestsButtonHtml = `
    <style>
      .container-pimpMyWolt {
        display: flex;
        flex-direction: column;
        align-items: center;
        border: 1px solid #ddd;
        border-radius: 5px;
        position: relative;
        padding: 0 5px;
        margin: 0;
      }

      .logo-pimpMyWolt {  
        height: 60px;
        display: block;
        margin: -30px 0;
        position: relative;
        top: -4px;
      }
      
      .buttons-pimpMyWolt {
        display: flex;
        justify-content: center;
        align-items: center;
        margin: 10px 0;
      }
        
      .btn-pimpMyWolt {
        background: white;
        border: 1px solid #ddd;
        border-radius: 10px;
        display: flex;
        justify-content: center;
        align-items: center;
        font-size: 16px;
        margin: 0 5px;
        padding: 8px 10px;
      }

      .btn-pimpMyWolt:hover {
        background: #f8f8f8;
        cursor: pointer;
      }

      #settingsButton-pimpMyWolt {
        position: absolute;
        top: 5px;
        left: 5px;
        width: 20px;
        height: 20px;
        margin: 0;
        padding: 0;
        font-size: 16px;
        line-height: 1;
        z-index: 1000;
        border: none;
      }

      #settingsButton-pimpMyWolt:hover {
        background: #d2d2d2;
      }
    </style>
    <div class="container-pimpMyWolt">
      <button id="settingsButton-pimpMyWolt" class="btn-pimpMyWolt" aria-label="הגדרות התוסף" title="הגדרות התוסף">⚙️</button>
      <div class="buttons-pimpMyWolt">
        <button id="selectGuestsButton-pimpMyWolt" class="btn-pimpMyWolt">הוסף חברים 👨🏾‍🤝‍👨🏼 </button>
        <button id="splitPayButton-pimpMyWolt" class="btn-pimpMyWolt">הכנס סכומים 💰</button>
        <img src="${logoUrl}" class="logo-pimpMyWolt"/>
      </div>
      <div id="status-pimpMyWolt"></div>
    </div>
    `;

    container.innerHTML = selectGuestsButtonHtml;

    container.querySelector(`#settingsButton-pimpMyWolt`).addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "open-options-page" });
    });
    container.querySelector(`#selectGuestsButton-pimpMyWolt`).addEventListener("click", async () => {
      const selection = await selectGuestsFn();
      if (selection === null) {
        container.querySelector(`#status-pimpMyWolt`).innerHTML = `
          <span>כדי להתאים שמות אוטומטית, הגדירו מפתח OpenRouter API ב-<a href="#" id="auto-match-settings-link">הגדרות</a>. אפשר גם להוסיף התאמות שמות ידנית בהגדרות.</span>
        `;
        container.querySelector("#auto-match-settings-link").addEventListener("click", (event) => {
          event.preventDefault();
          chrome.runtime.sendMessage({ type: "open-options-page" });
        });
        return;
      }

      const { missingGuests } = selection;
      const missingGuestListItems = missingGuests.map((guest) => `<li>${guest.name}: ${guest.price}₪</li>`);

      let statusMessage;
      if (missingGuestListItems.length > 0) {
        statusMessage = `
        <span>לא הצלחנו לצרף את:</span>
        <ul>
          ${missingGuestListItems.join("")}
        </ul>
        הוסיפו את שאר החברים ידנית, ולחצו על "הכנס סכומים"
      `;
      } else {
        splitPayFn();
        statusMessage = "<span class='sucess-pimpMyWolt'>הופה! הצלחנו לפצל את כל החברים בקבוצה 🎉</span>";
      }

      container.querySelector(`#status-pimpMyWolt`).innerHTML = statusMessage;
    });
    container.querySelector(`#splitPayButton-pimpMyWolt`).addEventListener("click", splitPayFn);

    return container;
  }

  function setContent(content) {
    const contentDiv = document.querySelector(`#${message.divId}`);
    if (!contentDiv) {
      const messageContainer = selectors.uiContainer();
      const div = document.createElement("div");
      div.setAttribute("id", message.divId);
      messageContainer.prepend(div);
      return setContent(content);
    }
    contentDiv.innerHTML = "";
    contentDiv.prepend(content);
  }

  async function setGuestDebt(cibusName, debt) {
    const guestInputEl = selectors.friendPaymentInput(cibusName);

    if (guestInputEl) {
      guestInputEl.value = debt;
      guestInputEl.dispatchEvent(
        new UIEvent("change", {
          view: window,
          bubbles: true,
          cancelable: true,
        })
      );

      return true;
    }

    return false;
  }

  async function selectGuestsFromMenu(guestDebts, allCibusFriends, missingGuests) {
    const availableGuests = guestDebts.filter((guest) => allCibusFriends.includes(guest.cibusName));

    for (guest of availableGuests) {
      selectors.addFriendsToShareButton().click();
      selectors.chooseFriendButton().click();

      let pickGuestEl = selectors.friendMenuItem(guest.cibusName);

      // we expect to find the guest in the list, but just in case
      if (!pickGuestEl) {
        selectors.chooseFriendDeleteButton().click();
        continue;
      }

      pickGuestEl.click();

      await waitForValue(() =>
        !!selectors.friendPaymentTableRow(guest.cibusName)
      );

      const addedFrientEl = selectors.friendPaymentTableRow(guest.cibusName);
      const woltNameHint = `<span style="font-size: 10px; color: #009de0"> (${guest.woltName})</span>`;
      addedFrientEl.insertAdjacentHTML("afterend", woltNameHint);

      // wait for cibus http request to finish and payment button to be enabled
      await waitForValue(() =>
        !selectors.paymentButton().disabled
      );
    }

    return { availableGuests, missingGuests };
  }

  async function setGuestsDebts(guestDebts, allCibusFriends) {
    const availableGuests = guestDebts.filter((guest) => allCibusFriends.includes(guest.cibusName));

    for (guestDebt of availableGuests) {
      await setGuestDebt(guestDebt.cibusName, guestDebt.debt);
    }

    return availableGuests;
  }

  function waitForValue(f, attempts = 100) {
    return new Promise((res, rej) => {
      function tryGetValue(attempts) {
        const maybe = f();
        if (attempts === 0 || maybe) res(maybe);
        else {
          setTimeout(() => tryGetValue(attempts - 1), 10);
        }
      }
      tryGetValue(attempts);
    });
  }

  function getAllCibusNames() {
    selectors.addFriendsToShareButton().click();
    selectors.chooseFriendButton().click();

    const allCibusFriends = selectors.allFriendsInMenu();

    selectors.chooseFriendDeleteButton().click();

    return allCibusFriends;
  }



  setContent(getLoaderUi());

  // If we toggle too fast the ui breaks
  await new Promise((res) => setTimeout(res, 200));

  selectors.splitPaymentWithFriendsToggle().click();
  await waitForValue(() => selectors.myCharge());

  const allCibusFriends = getAllCibusNames();
  const guestDebs = await fetchGuestsDebts();

  setContent(getUi({
    selectGuestsFn: async () => {
      const matches = await matchGuestsToCibus(guestDebs, allCibusFriends);
      if (matches === null) return null;
      return selectGuestsFromMenu(matches.matchedGuests, allCibusFriends, matches.missingGuests);
    },
    splitPayFn: async () => {
      const matches = await matchGuestsToCibus(guestDebs, allCibusFriends);
      if (matches !== null) await setGuestsDebts(matches.matchedGuests, allCibusFriends);
    },
  }));
})();
