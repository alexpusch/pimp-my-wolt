(async function () {
  function waitForApp() {
    if (document.querySelector("app-root") !== null) return;
    setTimeout(() => waitForApp(), 100);
  }

  waitForApp();

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
    currentUserRegEx: getCurrentLanguage(/Hi, (.+)/, /היי, (.+)/)
  };

  const selectors = {
    splitPaymentWithFriendsToggle() { return document.querySelector("app-toggle-button .ng-toggle-switch-button") },
    addFriendsToShareButton() { return getElementWithText("a", texts.addFriendToShareButton) },
    chooseFriendButton() { return getElementWithText("span", texts.chooseFriendButton) },
    chooseFriendDeleteButton() {
      return this.chooseFriendButton().closest("tr").querySelector(".del")
    },
    friendMenuItem(name) { return getElementWithText("span", name) },
    friendPaymentTableRow(name) { return getElementWithText("span", name) },
    friendPaymentInput(name) {
      const guestEl = this.friendPaymentTableRow(name);
      return guestEl?.closest("tr")?.querySelector("input");
    },
    currentUserName() {
      const currentUserEl = document.querySelector("app-oauth-pay b")
      const match = texts.currentUserRegEx.exec(currentUserEl.innerText);
      return match?.[1];
    },
    allFriendsInMenu() {
      return [...document.querySelectorAll(".friends-menu-item")].map((e) => e?.innerText);
    }
  }

  const automaticPaymentContent = {
    divId: "postPaymentDiv-pimpMyWolt",
    autoPaymentButtonId: "autoPaymentButton-pimpMyWolt",
  };

  const message = {
    divId: "messageDiv-pimpMyWolt",
    containerSelector: "app-order-split"
  };

  function getElementWithText(element, text) {
    const xpath = `//${element}[contains(., "${text}")]`;
    return document
      .evaluate(xpath, document, null, XPathResult.ANY_TYPE, null)
      .iterateNext();
  }

  async function getAutoMatch({ woltNames, cibusNames }) {
    const response = await fetch(
      `https://amitmarx.wixsite.com/pimp-my-wolt/_functions/cibus_wolt_auto_matches`,
      {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        method: "POST",
        body: JSON.stringify({ woltNames, cibusNames }),
      }
    );
    const responseJson = await response.json();
    return responseJson;
  }

  const fetchFromStorage = (...items) =>
    new Promise((res, rej) => {
      chrome.storage.local.get(items, (result) => res(result));
    });

  async function handleMappingPayment(groupMembers, allCibusFriends) {
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
      (orderAdditionalCharge / guestsOrders.length).toFixed(2)
    );

    const currentUserName = selectors.currentUserName();
    const currentWoltName = groupMembers.find(
      (guest) => guest.cibusName === currentUserName
    )?.woltName ?? currentUserName; // Fallback to cibus name

    const guestsOrdersWithoutManager = guestsOrders.filter(
      (guestOrder) => guestOrder.name !== currentWoltName
    );

    const guestDebts = guestsOrdersWithoutManager.map((guestOrder) => {
      const cibusName = groupMembers.find(
        (guest) => guest.woltName === guestOrder.name
      )?.cibusName;

      return {
        woltName: guestOrder.name,
        cibusName,
        debt: guestOrder.price + additionalChargePerGuest,
      };
    });

    const settledGuests = await setGuestsDebts(guestDebts, allCibusFriends);
    publishSplitPaymentEvent({
      restaurant,
      settledGuests,
      guestsOrders,
      orderAdditionalCharge,
      totalOrderPrice,
      allCibusFriends
    });
    return { settledGuests, guestDebts };
  }

  async function autoMatchCibusNameToBet(debts, allCibusFriends) {
    const woltNames = debts.map(({ woltName }) => woltName);
    const autoMapping = await getAutoMatch({ cibusNames: allCibusFriends, woltNames });
    const cibusToWolt = autoMapping.reduce((o, item) => {
      o[item.woltName] = item.cibusName;
      return o;
    }, {});
    return debts.map((d) => {
      return {
        ...d,
        cibusName: cibusToWolt[d.woltName],
      };
    });
  }

  async function autoSplitDebt(asyncDebts, allCibusFriends) {
    const debts = await asyncDebts;
    const settledGuests = await setGuestsDebts(debts, allCibusFriends);
    publishAutoSplitPaymentEvent({ settledGuests, guestsOrders: debts, allCibusFriends });
    const autoPaymentDiv = document.querySelector(`#${automaticPaymentContent.divId}`);
    autoPaymentDiv.innerHTML =
      '<span style="font-weight: bold;">מקווים שעזרנו... &#128521;</span>';
  }

  function getAutomaticContent({ settledGuests, guestDebts, allCibusFriends }) {
    const leftToSplit = settledGuests.length < guestDebts.length;
    const div = document.createElement("div");
    div.setAttribute("id", automaticPaymentContent.divId);

    const splitMessage =
      settledGuests.length > 0
        ? " הופה! הצלחנו לפצל " +
        settledGuests.length +
        " תשלומים עפ״י המיפוי בקבוצה. "
        : "";
    const splitSpan = document.createElement("span");
    splitSpan.appendChild(document.createTextNode(splitMessage));
    div.appendChild(splitSpan);
    div.appendChild(document.createElement("br"));

    const settledMessage =
      leftToSplit && settledGuests.length > 0
        ? "שמנו לב כי יתר המזמינים אינם ממופים - נסו את הפיצול האוטומטי שלנו. "
        : leftToSplit
          ? `לא הצלחנו לפצל תשלומים עפ״י המיפוי בקבוצה. נסו את הפיצול האוטומטי שלנו`
          : "";
    const settledSpan = document.createElement("span");
    settledSpan.appendChild(document.createTextNode(settledMessage));
    div.appendChild(settledSpan);

    if (leftToSplit) {
      const btn = document.createElement("div");
      btn.setAttribute("id", automaticPaymentContent.autoPaymentButtonId);

      const logoImage = document.createElement("img");
      logoImage.src = logoUrl;
      btn.appendChild(logoImage);

      const textDiv = document.createElement("div");
      textDiv.appendChild(document.createTextNode("פצל אוטומטית"));
      btn.appendChild(textDiv);

      const settledNames = settledGuests.map((x) => x.woltName);
      const debts = guestDebts.filter(
        ({ woltName }) => !settledNames.includes(woltName)
      );

      const debtsSummaryDiv = document.createElement("div");
      debtsSummaryDiv.appendChild(document.createTextNode("לא הצלחנו להוסיף את המזמינים הבאים:"));
      for (const debt of debts) {
        const debtDiv = document.createElement("div");
        const debtString = `${debt.woltName}: ${debt.debt}₪`;
        debtDiv.appendChild(document.createTextNode(debtString));
        debtsSummaryDiv.appendChild(debtDiv);
      }
      div.appendChild(debtsSummaryDiv);

      const debtsWithAutoMatch = autoMatchCibusNameToBet(debts, allCibusFriends);
      btn.onclick = () => autoSplitDebt(debtsWithAutoMatch, allCibusFriends);
      div.appendChild(btn);
    }
    return div;
  }

  function setContent(content) {
    const contentDiv = document.querySelector(`#${message.divId}`);
    if (!contentDiv) {
      const messageContainer = document.querySelector(message.containerSelector);
      const div = document.createElement("div");
      div.setAttribute("id", message.divId);
      messageContainer.prepend(div);
      return setContent(content);
    }
    contentDiv.innerHTML = "";
    contentDiv.prepend(content);
  }

  function setLoader() {
    const loaderImage = document.createElement("img");
    loaderImage.src = loaderUrl;
    setContent(loaderImage);
  }

  function handleAutomaticPayment({ settledGuests, guestDebts, allCibusFriends }) {
    const content = getAutomaticContent({ settledGuests, guestDebts, allCibusFriends });
    setContent(content);
  }

  async function publishSplitPaymentEvent({
    restaurant,
    settledGuests,
    guestsOrders,
    orderAdditionalCharge,
    totalOrderPrice,
    allCibusFriends
  }) {
    const currentUser =
      selectors.currentUserName();

    biLogger.logEvent("split_payment", {
      restaurant,
      userName: currentUser,
      settledGuests,
      guestsOrders,
      orderAdditionalCharge,
      totalOrderPrice,
      allCibusUsersAvailable: allCibusFriends,
    });
  }

  async function publishAutoSplitPaymentEvent({ settledGuests, guestsOrders, allCibusFriends }) {
    const currentCibusUser = selectors.currentUserName();

    biLogger.logEvent("auto_split_payment", {
      userName: currentCibusUser,
      settledGuests,
      guestsOrders,
      allCibusUsersAvailable: allCibusFriends,
    });
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

  async function setGuestsDebts(guestDebts, allCibusFriends) {
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

      // wait for the guest to be added to the list before continuing
      await waitForValue(() =>
        selectors.friendPaymentTableRow(guest.cibusName)
      );
    }

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

  function clickAddGuestButton() {
    getElementWithText("a", texts.addFriendsButton).click();
  }

  function clickChooseFriendButton() {
    getElementWithText("a", texts.chooseFriendButton).click();
  }

  function clickEnablePaymentSplit() {
    document.querySelector(paymentSplitButtonSelector).click();
  }

  setInterval(async () => {
    if (isPaymentButtonExists() && !isPaymentSettled()) {
      console.log("Pimp my Cibus: Detected payment button, handling payment split...");

  setLoader()
  selectors.splitPaymentWithFriendsToggle().click();

  const groupMembers = await groupManager.getAllGuests();
  const allCibusFriends = getAllCibusNames();

  const { settledGuests, guestDebts } = await handleMappingPayment(groupMembers, allCibusFriends);

  handleAutomaticPayment({ settledGuests, guestDebts, allCibusFriends });
})();
