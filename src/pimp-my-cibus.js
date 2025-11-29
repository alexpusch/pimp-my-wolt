(function () {
  const logoUrl = chrome.runtime.getURL(
    "assets/icons/pimp-my-wolt-icon-128.png"
  );
  const loaderUrl = chrome.runtime.getURL("/assets/loader.gif");
  const { groupManager, biLogger } = window.pimpMyWolt;
  const allGuests = groupManager.getAllGuests();

  const isHebrewCibus = !!getElementWithText("div", "עברית");

  const getCurrentLangugue = (english, hebrew) => isHebrewCibus ? hebrew : english

  const texts = {
    paymentButton: getCurrentLangugue("Pay with Cibus", "אישור התשלום באמצעות סיבוס"),
  }

  const paymentButtonSettings = {
    settledAttribute: "settled",
  };

  const automaticPaymentContent = {
    divId: "postPaymentDiv-pimpMyWolt",
    autoPaymentButtonId: "autoPaymentButton-pimpMyWolt",
  };

  const message = {
    divId: "messageDiv-pimpMyWolt",
    containerSelector: "app-order-split"
  };

  const paymentSplitButtonSelector = "app-toggle-button .ng-toggle-switch-core";
  const splitMenuOpenSelector = "app-order-split .mat-mdc-menu-trigger";
  const currentUserNameSelector = "app-oauth-pay b";

  const getPaymentButton = () => getElementWithText("button", texts.paymentButton);
  const isPaymentButtonExists = () => Boolean(getPaymentButton());
  const isPaymentSettled = () => {
    const paymentButton = getPaymentButton();
    const attribute = paymentButton?.getAttribute(
      paymentButtonSettings.settledAttribute
    );
    return attribute === "true";
  };

  const setPaymentSettled = () => {
    const paymentButton = getPaymentButton();
    paymentButton?.setAttribute(paymentButtonSettings.settledAttribute, "true");
  };

  function getCurrentUserName() {
    const currentUser = document.querySelector(currentUserNameSelector).innerText;
    const nameRegEx = getCurrentLangugue(/Hi, (.+)/, /היי, (.+)/);
    const match = nameRegEx.exec(currentUser);

    return match?.[1];
  }

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

  async function handleMappingPayment() {
    const guests = await allGuests;
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

    const currentUserName = getCurrentUserName();
    const currentWoltName = guests.find(
      (guest) => guest.cibusName === currentUserName
    )?.woltName ?? currentUserName; // Fallback to cibus name

    const guestsOrdersWithoutManager = guestsOrders.filter(
      (guestOrder) => guestOrder.name !== currentWoltName
    );

    const guestDebts = guestsOrdersWithoutManager.map((guestOrder) => {
      const cibusName = guests.find(
        (guest) => guest.woltName === guestOrder.name
      )?.cibusName;

      return {
        woltName: guestOrder.name,
        cibusName,
        debt: guestOrder.price + additionalChargePerGuest,
      };
    });

    const settledGuests = await setGuestsDebts(guestDebts);
    publishSplitPaymentEvent({
      restaurant,
      settledGuests,
      guestsOrders,
      orderAdditionalCharge,
      totalOrderPrice,
    });
    return { settledGuests, guestDebts };
  }

  async function autoMatchCibusNameToBet(debts) {
    const remianingNames = getAllCibusNames();

    const woltNames = debts.map(({ woltName }) => woltName);
    const autoMapping = await getAutoMatch({ cibusNames: remianingNames, woltNames });
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

  async function autoSplitDebt(asyncDebts) {
    const debts = await asyncDebts;
    const settledGuests = await setGuestsDebts(debts);
    publishAutoSplitPaymentEvent({ settledGuests, guestsOrders: debts });
    const autoPaymentDiv = document.querySelector(`#${automaticPaymentContent.divId}`);
    autoPaymentDiv.innerHTML =
      '<span style="font-weight: bold;">מקווים שעזרנו... &#128521;</span>';
  }

  function getAutomaticContent({ settledGuests, guestDebts }) {
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

      const settledNames = settledGuests.map((x) => x.name);
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

      const debtsWithAutoMatch = autoMatchCibusNameToBet(debts);
      btn.onclick = () => autoSplitDebt(debtsWithAutoMatch);
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

  function handleAutomaticPayment({ settledGuests, guestDebts }) {
    const content = getAutomaticContent({ settledGuests, guestDebts });
    setContent(content);
  }

  function getAllCibusNames() {
    clickAddGuestButton();
    const all_users = new Array(...document.querySelectorAll('.friends-menu-item span span'))
      .map((e) => e?.innerText);
    // close the menu
    clickAddGuestButton();
    return all_users;
  }

  async function publishSplitPaymentEvent({
    restaurant,
    settledGuests,
    guestsOrders,
    orderAdditionalCharge,
    totalOrderPrice,
  }) {
    const remianingNames = getAllCibusNames();
    const allCibusUsersAvailable = remianingNames.concat(settledGuests.map((guest) => guest.cibusName));

    const currentCibusUser = getCurrentUserName();
    const currentUser =
      (await allGuests).find((guest) => guest.cibusName === currentCibusUser)
        ?.woltName || currentCibusUser;
    biLogger.logEvent("split_payment", {
      restaurant,
      userName: currentUser,
      settledGuests,
      guestsOrders,
      orderAdditionalCharge,
      totalOrderPrice,
      allCibusUsersAvailable,
    });
  }

  async function publishAutoSplitPaymentEvent({ settledGuests, guestsOrders }) {
    const remianingNames = getAllCibusNames();
    const allCibusUsersAvailable = remianingNames.concat(settledGuests.map((guest) => guest.cibusName));

    const currentCibusUser = getCurrentUserName();
    const currentUser =
      (await allGuests).find((guest) => guest.cibusName === currentCibusUser)
        ?.woltName || currentCibusUser;
    biLogger.logEvent("auto_split_payment", {
      userName: currentUser,
      settledGuests,
      guestsOrders,
      allCibusUsersAvailable,
    });
  }

  async function setGuestDebt(cibusName, debt) {
    const guestEl = await waitForValue(() =>
      getElementWithText("span", cibusName)
    );

    const inputEl = guestEl?.closest("tr")?.querySelector("input");
    if (inputEl) {
      inputEl.value = debt;
      inputEl.dispatchEvent(
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

  async function setGuestsDebts(guestDebts) {
    const settledGuests = [];

    // pick guests to add them to the split payment table
    for (guestDebt of guestDebts) {
      clickAddGuestButton();

      // try woltName = cibusName if no cibus name
      let cibusName = guestDebt.cibusName ?? guestDebt.woltName;
      let pickGuestEl = getElementWithText("span", cibusName);

      if (pickGuestEl) {
        pickGuestEl.click();

        if (await setGuestDebt(cibusName, guestDebt.debt)) {
          settledGuests.push({ name: guestDebt.woltName, price: guestDebt.debt });
        }
      } else {
        // click add guest button again to close the menu
        clickAddGuestButton();
      }
    }

    return settledGuests;
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

  function clickAddGuestButton() {
    document.querySelector(splitMenuOpenSelector).click();
  }

  function clickEnablePaymentSplit() {
    document.querySelector(paymentSplitButtonSelector).click();
  }

  setInterval(async () => {
    if (isPaymentButtonExists() && !isPaymentSettled()) {

      setLoader()
      setPaymentSettled();
      clickEnablePaymentSplit();

      const { settledGuests, guestDebts } = await handleMappingPayment();
      handleAutomaticPayment({ settledGuests, guestDebts });
    }
  }, 100);
})();
